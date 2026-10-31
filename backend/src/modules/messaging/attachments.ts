import { BadRequestException, ForbiddenException, NotFoundException, StreamableFile } from '@nestjs/common';
import { DocumentCategory } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { PrismaService } from '../../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { StorageService } from '../../common/storage.service';

export interface AttachmentMeta { id: string; name: string; mimeType: string; size: number }

/** Stores a chat / request attachment through the documents service (MinIO + versioned Document row). */
export async function saveAttachment(docs: DocumentsService, user: AuthUser, weddingId: string | null, file: Express.Multer.File): Promise<AttachmentMeta> {
  if (!file) throw new BadRequestException('file is required');
  const d = await docs.save({ weddingId, name: file.originalname, category: DocumentCategory.OTHER, buffer: file.buffer, mime: file.mimetype, uploadedById: user.id });
  return { id: d.id, name: d.name, mimeType: d.mimeType, size: d.size };
}

export async function attachmentMeta(prisma: PrismaService, ids: string[]): Promise<Map<string, AttachmentMeta>> {
  if (!ids.length) return new Map();
  const rows = await prisma.document.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, mimeType: true, size: true } });
  return new Map(rows.map((r) => [r.id, r]));
}

/** Every id must be a document the sender uploaded themselves (prevents attaching someone else's files). */
export async function assertOwnAttachments(prisma: PrismaService, user: AuthUser, ids: string[]) {
  if (!ids.length) return;
  const n = await prisma.document.count({ where: { id: { in: ids }, uploadedById: user.id } });
  if (n !== new Set(ids).size) throw new ForbiddenException('You can only attach files you uploaded');
}

/** Streams a document the caller has already been authorised for (membership of the parent record checked by the caller). */
export async function streamAttachment(prisma: PrismaService, storage: StorageService, docId: string) {
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) throw new NotFoundException('Attachment not found');
  return new StreamableFile(await storage.get(doc.objectKey), { type: doc.mimeType, disposition: `inline; filename="${encodeURIComponent(doc.name)}"` });
}
