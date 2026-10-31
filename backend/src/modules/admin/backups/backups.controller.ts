import { BadRequestException, ConflictException, Controller, Delete, Get, Injectable, Logger, NotFoundException, Param, ParseUUIDPipe, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { BackupStatus, Prisma } from '@prisma/client';
import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { mkdir, rm, stat, writeFile } from 'fs/promises';
import * as os from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { StorageService } from '../../../common/storage.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';

const STALE_MS = 30 * 60_000;
const SKIP_MODELS = new Set(['RefreshToken']);
const SKIP_FIELDS = new Set(['passwordHash']);
const localDir = () => process.env.BACKUP_DIR || join(os.tmpdir(), 'royalknot-backups');

const run = (cmd: string, args: string[], timeoutMs = 10 * 60_000) => new Promise<Buffer>((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const out: Buffer[] = []; let err = '';
  const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
  p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => (err += d));
  p.on('error', (e) => { clearTimeout(t); reject(e); });
  p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} exited with ${code}: ${err.slice(0, 300)}`)); });
});

@Injectable()
export class BackupsService {
  private logger = new Logger('Backups');
  private pgDumpAvailable: boolean | null = null;
  constructor(private prisma: PrismaService, private storage: StorageService, private audit: AuditService) {}

  async hasPgDump() {
    if (this.pgDumpAvailable === null) this.pgDumpAvailable = await run('pg_dump', ['--version'], 5000).then(() => true, () => false);
    return this.pgDumpAvailable;
  }

  async list() {
    await this.prisma.backupRecord.updateMany({ where: { status: { in: [BackupStatus.RUNNING, BackupStatus.PENDING] }, startedAt: { lt: new Date(Date.now() - STALE_MS) } }, data: { status: BackupStatus.FAILED, finishedAt: new Date(), note: 'Timed out (the API restarted or the job stalled)' } });
    const rows = await this.prisma.backupRecord.findMany({ orderBy: { startedAt: 'desc' }, take: 100 });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.triggeredById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    return rows.map((r) => ({ ...r, size: r.size == null ? null : Number(r.size), triggeredBy: users.find((u) => u.id === r.triggeredById)?.name ?? null, format: r.objectKey?.endsWith('.dump') ? 'pg_dump (custom)' : r.objectKey ? 'JSON export (gzip)' : null, location: r.objectKey?.startsWith('local:') ? 'local volume' : r.objectKey ? 'MinIO' : null, durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null }));
  }

  async start(actorId: string, kind = 'MANUAL') {
    const active = await this.prisma.backupRecord.findFirst({ where: { status: { in: [BackupStatus.RUNNING, BackupStatus.PENDING] }, startedAt: { gt: new Date(Date.now() - STALE_MS) } } });
    if (active) throw new ConflictException('A backup is already running');
    const rec = await this.prisma.backupRecord.create({ data: { status: BackupStatus.RUNNING, kind, triggeredById: actorId } });
    await this.audit.log({ actorId, entity: 'Backup', entityId: rec.id, action: 'start', message: `Started ${kind.toLowerCase()} backup` });
    void this.execute(rec.id, actorId);
    return rec;
  }

  private async execute(id: string, actorId: string) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      let data: Buffer, ext: string, note: string;
      if (await this.hasPgDump()) {
        const u = new URL(process.env.DATABASE_URL ?? '');
        const schema = u.searchParams.get('schema') ?? 'public';
        u.search = '';
        data = await run('pg_dump', ['--format=custom', '--no-owner', `--schema=${schema}`, '--dbname', u.toString()]);
        ext = 'dump'; note = 'pg_dump custom format; restore with pg_restore';
      } else {
        const { buffer, tables, rows } = await this.jsonExport();
        data = buffer; ext = 'json.gz'; note = `pg_dump not available on this host; JSON export of ${tables} tables / ${rows} rows (password hashes and sessions excluded; uploaded files are not included). This is a data export, not a restore-grade dump.`;
      }
      const name = `royalknot-${stamp}.${ext}`;
      let objectKey = `backups/${name}`;
      try { await this.storage.put(objectKey, data, ext === 'dump' ? 'application/octet-stream' : 'application/gzip'); }
      catch (e) {
        this.logger.warn(`MinIO upload failed (${(e as Error).message}); writing to local volume`);
        await mkdir(localDir(), { recursive: true }); await writeFile(join(localDir(), name), data); objectKey = `local:${name}`; note += ' Stored on the local volume because MinIO was unavailable.';
      }
      await this.prisma.backupRecord.update({ where: { id }, data: { status: BackupStatus.SUCCESS, objectKey, size: BigInt(data.length), note, finishedAt: new Date() } });
      await this.audit.log({ actorId, entity: 'Backup', entityId: id, action: 'complete', message: `Backup completed (${(data.length / 1024).toFixed(0)} KB)` });
    } catch (e) {
      this.logger.error(`Backup ${id} failed: ${(e as Error).message}`);
      await this.prisma.backupRecord.update({ where: { id }, data: { status: BackupStatus.FAILED, note: (e as Error).message.slice(0, 500), finishedAt: new Date() } }).catch(() => undefined);
      await this.audit.log({ actorId, entity: 'Backup', entityId: id, action: 'failed', message: `Backup failed: ${(e as Error).message.slice(0, 200)}` }).catch(() => undefined);
    }
  }

  private async jsonExport() {
    const out: Record<string, unknown[]> = {};
    let rows = 0;
    for (const m of Prisma.dmmf.datamodel.models) {
      if (SKIP_MODELS.has(m.name)) continue;
      const delegate = (this.prisma as unknown as Record<string, { findMany: (a: object) => Promise<Record<string, unknown>[]> }>)[m.name[0].toLowerCase() + m.name.slice(1)];
      if (!delegate?.findMany) continue;
      const data = await delegate.findMany({ take: 200_000 });
      out[m.name] = data.map((r) => { for (const f of SKIP_FIELDS) delete r[f]; return r; });
      rows += data.length;
    }
    const json = JSON.stringify({ meta: { kind: 'royalknot-json-export', createdAt: new Date().toISOString(), tables: Object.keys(out).length, rows }, tables: out }, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    return { buffer: gzipSync(Buffer.from(json)), tables: Object.keys(out).length, rows };
  }

  async record(id: string) {
    const r = await this.prisma.backupRecord.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Backup not found');
    return r;
  }

  async open(id: string) {
    const r = await this.record(id);
    if (r.status !== BackupStatus.SUCCESS || !r.objectKey) throw new BadRequestException('This backup has no downloadable file');
    const name = r.objectKey.split(/[/:]/).pop()!;
    if (r.objectKey.startsWith('local:')) {
      const path = join(localDir(), name);
      const s = await stat(path).catch(() => { throw new NotFoundException('Backup file is missing from the local volume'); });
      return { name, stream: createReadStream(path), size: s.size };
    }
    return { name, stream: await this.storage.get(r.objectKey).catch(() => { throw new NotFoundException('Backup file is missing from storage'); }), size: Number(r.size ?? 0) || undefined };
  }

  async remove(id: string, actorId: string) {
    const r = await this.record(id);
    if (r.status === BackupStatus.RUNNING) throw new ConflictException('Backup is still running');
    if (r.objectKey?.startsWith('local:')) await rm(join(localDir(), r.objectKey.slice(6)), { force: true });
    else if (r.objectKey) await this.storage.remove(r.objectKey).catch(() => undefined);
    await this.prisma.backupRecord.delete({ where: { id } });
    await this.audit.log({ actorId, entity: 'Backup', entityId: id, action: 'delete', message: 'Deleted backup' });
    return { deleted: true };
  }
}

@ApiTags('admin: backups') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/backups')
export class BackupsController {
  constructor(private svc: BackupsService) {}

  @Get() @RequirePermission('backups', 'read')
  async list() {
    return { items: await this.svc.list(), capabilities: { pgDump: await this.svc.hasPgDump(), format: (await this.svc.hasPgDump()) ? 'pg_dump custom format' : 'JSON export of all tables', restore: 'manual' }, restoreHelp: 'Restore is intentionally manual: download the file, then run pg_restore (pg_dump backups) or load the JSON export into a staging database. The app never overwrites live data from the UI.' };
  }

  @Post() @RequirePermission('backups', 'write')
  async trigger(@CurrentUser() u: AuthUser) { const r = await this.svc.start(u.id); return { ...r, size: null }; }

  @Get(':id') @RequirePermission('backups', 'read')
  async one(@Param('id', ParseUUIDPipe) id: string) { const r = await this.svc.record(id); return { ...r, size: r.size == null ? null : Number(r.size) }; }

  @Get(':id/download') @RequirePermission('backups', 'read')
  async download(@Param('id', ParseUUIDPipe) id: string) {
    const f = await this.svc.open(id);
    return new StreamableFile(f.stream, { type: 'application/octet-stream', disposition: `attachment; filename="${f.name}"`, length: f.size });
  }

  @Delete(':id') @RequirePermission('backups', 'write')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.remove(id, u.id); }
}
