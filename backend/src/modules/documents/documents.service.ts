import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentCategory, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUser } from '../../common/decorators';
import { PageQuery, Paginated, skipTake } from '../../common/pagination';
import { StorageService } from '../../common/storage.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

export const MAX_UPLOAD = 15 * 1024 * 1024;
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.ms-excel'];

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService, private storage: StorageService, private audit: AuditService) {}

  async save(p: { weddingId?: string | null; name: string; category: DocumentCategory; buffer: Buffer; mime: string; uploadedById?: string | null; documentKey?: string; allowedRoles?: Role[] }) {
    if (p.buffer.length > MAX_UPLOAD) throw new BadRequestException('File exceeds 15 MB limit');
    if (!ALLOWED_MIME.includes(p.mime)) throw new BadRequestException(`File type ${p.mime} is not allowed`);
    const documentKey = p.documentKey ?? randomUUID();
    const last = await this.prisma.document.findFirst({ where: { documentKey }, orderBy: { version: 'desc' } });
    const version = (last?.version ?? 0) + 1;
    const objectKey = `${p.weddingId ?? 'general'}/${documentKey}/v${version}-${p.name.replace(/[^\w.\-]+/g, '_')}`;
    await this.storage.put(objectKey, p.buffer, p.mime);
    const doc = await this.prisma.document.create({ data: { weddingId: p.weddingId ?? null, name: p.name, category: p.category, objectKey, mimeType: p.mime, size: p.buffer.length, documentKey, version, uploadedById: p.uploadedById ?? null, allowedRoles: p.allowedRoles ?? [] } });
    await this.audit.log({ actorId: p.uploadedById, weddingId: p.weddingId, entity: 'Document', entityId: doc.id, action: 'upload', message: `Uploaded ${p.name} (v${version})` });
    return doc;
  }

  private canAccess(doc: { allowedRoles: Role[] }, user: AuthUser) {
    return user.role === Role.ADMIN || doc.allowedRoles.length === 0 || doc.allowedRoles.includes(user.role);
  }

  async list(user: AuthUser, q: PageQuery, f: { weddingId?: string; category?: DocumentCategory; latestOnly?: boolean }) {
    const where = {
      ...(f.weddingId ? { weddingId: f.weddingId } : {}), ...(f.category ? { category: f.category } : {}),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {}),
      ...(user.role === Role.ADMIN ? {} : { OR: [{ allowedRoles: { isEmpty: true } }, { allowedRoles: { has: user.role } }] }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({ where, orderBy: { createdAt: 'desc' }, include: { wedding: { select: { id: true, name: true } }, uploadedBy: { select: { name: true } } }, ...skipTake(q) }),
      this.prisma.document.count({ where }),
    ]);
    return new Paginated(rows, { page: q.page, pageSize: q.pageSize, total });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (!this.canAccess(doc, user)) throw new ForbiddenException('You do not have access to this document');
    return doc;
  }

  async stream(user: AuthUser, id: string) {
    const doc = await this.get(user, id);
    return { doc, stream: await this.storage.get(doc.objectKey) };
  }

  async versions(user: AuthUser, id: string) {
    const doc = await this.get(user, id);
    return this.prisma.document.findMany({ where: { documentKey: doc.documentKey }, orderBy: { version: 'desc' } });
  }

  async remove(user: AuthUser, id: string) {
    const doc = await this.get(user, id);
    await this.prisma.document.delete({ where: { id } });
    await this.storage.remove(doc.objectKey).catch(() => undefined);
    await this.audit.log({ actorId: user.id, weddingId: doc.weddingId, entity: 'Document', entityId: id, action: 'delete', message: `Deleted ${doc.name} v${doc.version}` });
    return { ok: true };
  }
}
