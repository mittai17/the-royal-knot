import { BadRequestException, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Client } from 'minio';
import { AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { env } from '../../../config/env';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';

const SCAN_CAP = 50_000;

@Injectable()
export class AdminStorageService {
  readonly client = new Client({ endPoint: env.minio.endPoint, port: env.minio.port, useSSL: env.minio.useSSL, accessKey: env.minio.accessKey, secretKey: env.minio.secretKey });

  /** Walks a bucket (capped) and totals object count and bytes. */
  async bucketStats(bucket: string) {
    return new Promise<{ objects: number; bytes: number; truncated: boolean }>((resolve, reject) => {
      let objects = 0, bytes = 0, truncated = false;
      const s = this.client.listObjectsV2(bucket, '', true);
      s.on('data', (o) => { if (truncated) return; objects++; bytes += o.size ?? 0; if (objects >= SCAN_CAP) { truncated = true; (s as unknown as { destroy: () => void }).destroy(); resolve({ objects, bytes, truncated }); } });
      s.on('error', reject);
      s.on('end', () => resolve({ objects, bytes, truncated }));
    });
  }

  list(bucket: string, prefix: string, limit: number) {
    return new Promise<{ folders: string[]; files: { key: string; name: string; size: number; lastModified: Date | null; etag?: string }[]; truncated: boolean }>((resolve, reject) => {
      const folders: string[] = [], files: { key: string; name: string; size: number; lastModified: Date | null; etag?: string }[] = [];
      let truncated = false, done = false;
      const s = this.client.listObjectsV2(bucket, prefix, false);
      const finish = () => { if (!done) { done = true; resolve({ folders, files, truncated }); } };
      s.on('data', (o) => {
        if (done) return;
        if (files.length + folders.length >= limit) { truncated = true; (s as unknown as { destroy: () => void }).destroy(); return finish(); }
        if (o.prefix) folders.push(o.prefix); else if (o.name) files.push({ key: o.name, name: o.name.slice(prefix.length), size: o.size ?? 0, lastModified: o.lastModified ?? null, etag: o.etag });
      });
      s.on('error', (e) => { if (!done) { done = true; reject(e); } });
      s.on('end', finish);
    });
  }
}

@ApiTags('admin: storage') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/storage')
export class StorageController {
  constructor(private st: AdminStorageService, private prisma: PrismaService, private audit: AuditService) {}

  private async assertBucket(bucket: string) {
    if (!bucket || !(await this.st.client.bucketExists(bucket).catch(() => false))) throw new NotFoundException('Bucket not found');
  }

  @Get('overview') @RequirePermission('storage', 'read')
  async overview() {
    let buckets: { name: string; creationDate: Date }[] = [];
    try { buckets = await this.st.client.listBuckets(); } catch (e) { throw new ConflictException(`MinIO is not reachable: ${(e as Error).message}`); }
    const stats = await Promise.all(buckets.map(async (b) => ({ name: b.name, created: b.creationDate, primary: b.name === env.minio.bucket, ...(await this.st.bucketStats(b.name).catch(() => ({ objects: 0, bytes: 0, truncated: false }))) })));
    const [docs, byCat] = await Promise.all([this.prisma.document.aggregate({ _count: true, _sum: { size: true } }), this.prisma.document.groupBy({ by: ['category'], _count: true, _sum: { size: true } })]);
    return {
      endpoint: `${env.minio.useSSL ? 'https' : 'http'}://${env.minio.endPoint}:${env.minio.port}`, primaryBucket: env.minio.bucket,
      totalBytes: stats.reduce((a, b) => a + b.bytes, 0), totalObjects: stats.reduce((a, b) => a + b.objects, 0), buckets: stats,
      documents: { count: docs._count, bytes: docs._sum.size ?? 0, byCategory: byCat.map((c) => ({ category: c.category, count: c._count, bytes: c._sum.size ?? 0 })) },
    };
  }

  @Get('objects') @RequirePermission('storage', 'read')
  async objects(@Query('bucket') bucket: string, @Query('prefix') prefix = '', @Query('limit') limit = '300') {
    await this.assertBucket(bucket);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 300, 1), 1000);
    const r = await this.st.list(bucket, prefix, lim);
    const keys = r.files.map((f) => f.key);
    const [docs, backups] = keys.length ? await Promise.all([this.prisma.document.findMany({ where: { objectKey: { in: keys } }, select: { objectKey: true, name: true } }), this.prisma.backupRecord.findMany({ where: { objectKey: { in: keys } }, select: { objectKey: true } })]) : [[], []];
    const ref = new Map<string, string>([...docs.map((d) => [d.objectKey, `Document: ${d.name}`] as [string, string]), ...backups.map((b) => [b.objectKey!, 'Backup'] as [string, string])]);
    return { bucket, prefix, folders: r.folders, files: r.files.map((f) => ({ ...f, referencedBy: ref.get(f.key) ?? null })), truncated: r.truncated };
  }

  @Get('download') @RequirePermission('storage', 'read')
  async download(@Query('bucket') bucket: string, @Query('key') key: string) {
    await this.assertBucket(bucket);
    if (!key) throw new BadRequestException('key is required');
    const stat = await this.st.client.statObject(bucket, key).catch(() => { throw new NotFoundException('Object not found'); });
    const name = key.split('/').pop() ?? 'file';
    return new StreamableFile(await this.st.client.getObject(bucket, key), { type: (stat.metaData?.['content-type'] as string) ?? 'application/octet-stream', disposition: `attachment; filename="${encodeURIComponent(name)}"`, length: stat.size });
  }

  /** Objects still referenced by a Document / backup record need `force=true`. */
  @Delete('objects') @RequirePermission('storage', 'write')
  async remove(@Query('bucket') bucket: string, @Query('key') key: string, @Query('force') force: string | undefined, @CurrentUser() u: AuthUser) {
    await this.assertBucket(bucket);
    if (!key || key.endsWith('/')) throw new BadRequestException('A file key is required');
    await this.st.client.statObject(bucket, key).catch(() => { throw new NotFoundException('Object not found'); });
    const [doc, backup, logo] = await Promise.all([this.prisma.document.findUnique({ where: { objectKey: key }, select: { id: true, name: true } }), this.prisma.backupRecord.findFirst({ where: { objectKey: key }, select: { id: true } }), this.prisma.systemSetting.findUnique({ where: { key: 'org.logo' } })]);
    const isLogo = bucket === env.minio.bucket && (logo?.value as { key?: string } | null)?.key === key;
    if ((doc || backup || isLogo) && force !== 'true') throw new ConflictException(`This file is in use by ${doc ? `document "${doc.name}"` : backup ? 'a backup record' : 'the company logo'}. Deleting it will break that record; repeat with force=true to confirm.`);
    await this.st.client.removeObject(bucket, key);
    await this.audit.log({ actorId: u.id, entity: 'Storage', entityId: key, action: 'delete', message: `Deleted object ${bucket}/${key}`, meta: { bucket, key, referenced: doc ? 'document' : backup ? 'backup' : isLogo ? 'logo' : null } });
    return { deleted: true, referenced: !!(doc || backup || isLogo) };
  }
}
