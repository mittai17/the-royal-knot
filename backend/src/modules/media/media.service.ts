import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { MediaKind, Prisma, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUser } from '../../common/decorators';
import { Paginated, skipTake } from '../../common/pagination';
import { ScopeService } from '../../common/scope.service';
import { StorageService } from '../../common/storage.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Album, MediaQuery, UploadMediaDto } from './media.dto';

export const MEDIA_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
export const MEDIA_MAX = 25 * 1024 * 1024;
export const kindFor = (mime: string, album: Album): MediaKind => (mime.startsWith('video/') ? MediaKind.VIDEO : album === 'design-ideas' ? MediaKind.REFERENCE : MediaKind.PHOTO);

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService, private scope: ScopeService, private storage: StorageService, private audit: AuditService) {}

  private shape(a: Prisma.MediaAssetGetPayload<{ include: { wedding: { select: { id: true; name: true } } } }>, u: AuthUser, names: Map<string, string>) {
    return { id: a.id, weddingId: a.weddingId, wedding: a.wedding, kind: a.kind, title: a.title, mimeType: a.mimeType, size: a.size, album: a.album ?? 'gallery', clientVisible: a.clientVisible, uploadedById: a.uploadedById, uploadedByName: a.uploadedById ? names.get(a.uploadedById) ?? null : null, mine: a.uploadedById === u.id, createdAt: a.createdAt };
  }

  private async visible(u: AuthUser): Promise<Prisma.MediaAssetWhereInput> {
    if (u.role === Role.CLIENT) return { weddingId: { in: (await this.scope.weddingIds(u)) ?? [] }, OR: [{ clientVisible: true }, { uploadedById: u.id }] };
    if (u.role === Role.VENDOR || u.role === Role.SYSADMIN) throw new ForbiddenException('Your role does not allow this action');
    return {};
  }

  async list(u: AuthUser, q: MediaQuery) {
    if (q.weddingId) await this.scope.assertWeddingAccess(u, q.weddingId);
    const where: Prisma.MediaAssetWhereInput = {
      AND: [await this.visible(u), { ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.album ? { album: q.album } : {}), ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}) }],
    };
    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, include: { wedding: { select: { id: true, name: true } } }, ...skipTake(q) }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.uploadedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const names = new Map(users.map((x) => [x.id, x.name]));
    return new Paginated(rows.map((r) => this.shape(r, u, names)), { page: q.page, pageSize: q.pageSize, total });
  }

  async upload(u: AuthUser, dto: UploadMediaDto, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    if (!MEDIA_MIME.includes(file.mimetype)) throw new BadRequestException(`File type ${file.mimetype} is not allowed (photos: JPEG, PNG, WebP, GIF; video: MP4)`);
    if (file.size > MEDIA_MAX) throw new BadRequestException('File exceeds 25 MB limit');
    let weddingId = dto.weddingId ?? null;
    if (u.role === Role.CLIENT) {
      const ids = await this.scope.requireClientWeddingIds(u);
      weddingId ??= ids[0] ?? null;
      if (!weddingId || !ids.includes(weddingId)) throw new ForbiddenException('You do not have access to this wedding');
    } else if (weddingId && !(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
    if (!weddingId) throw new BadRequestException('weddingId is required');
    const album: Album = dto.album ?? 'gallery';
    const objectKey = `media/${weddingId}/${randomUUID()}-${file.originalname.replace(/[^\w.\-]+/g, '_')}`;
    await this.storage.put(objectKey, file.buffer, file.mimetype);
    const a = await this.prisma.mediaAsset.create({
      data: { weddingId, kind: kindFor(file.mimetype, album), title: dto.title?.trim() || file.originalname, objectKey, mimeType: file.mimetype, size: file.size, album, uploadedById: u.id, clientVisible: u.role === Role.CLIENT ? true : dto.clientVisible ?? true },
      include: { wedding: { select: { id: true, name: true } } },
    });
    await this.audit.log({ actorId: u.id, weddingId, entity: 'MediaAsset', entityId: a.id, action: 'upload', message: `Uploaded ${a.title} to ${album}` });
    return this.shape(a, u, new Map([[u.id, u.name]]));
  }

  private async load(u: AuthUser, id: string) {
    const a = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Media not found');
    if (!(await this.prisma.mediaAsset.count({ where: { AND: [{ id }, await this.visible(u)] } }))) throw new ForbiddenException('You do not have access to this file');
    return a;
  }

  async file(u: AuthUser, id: string) {
    const a = await this.load(u, id);
    return new StreamableFile(await this.storage.get(a.objectKey), { type: a.mimeType, disposition: `inline; filename="${encodeURIComponent(a.title ?? 'media')}"` });
  }

  /** Clients delete only their own uploads; planners / event managers (and founder) may delete any. */
  async remove(u: AuthUser, id: string) {
    const a = await this.load(u, id);
    if (u.role === Role.CLIENT && a.uploadedById !== u.id) throw new ForbiddenException('You can only delete files you uploaded');
    await this.prisma.mediaAsset.delete({ where: { id } });
    await this.storage.remove(a.objectKey).catch(() => undefined);
    await this.audit.log({ actorId: u.id, weddingId: a.weddingId, entity: 'MediaAsset', entityId: id, action: 'delete', message: `Deleted ${a.title ?? 'media'}` });
    return { ok: true };
  }

  async setVisibility(u: AuthUser, id: string, clientVisible: boolean) {
    await this.load(u, id);
    await this.prisma.mediaAsset.update({ where: { id }, data: { clientVisible } });
    await this.audit.log({ actorId: u.id, entity: 'MediaAsset', entityId: id, action: 'visibility', message: `Client visibility ${clientVisible ? 'on' : 'off'}` });
    return { ok: true };
  }
}
