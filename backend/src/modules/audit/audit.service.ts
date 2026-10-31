import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface AuditEntry { actorId?: string | null; weddingId?: string | null; entity: string; entityId?: string; action: string; message?: string; meta?: Prisma.InputJsonValue }

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /** Pass `tx` to write the audit row inside the caller's transaction. */
  log(e: AuditEntry, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).activityLog.create({ data: { actorId: e.actorId ?? null, weddingId: e.weddingId ?? null, entity: e.entity, entityId: e.entityId, action: e.action, message: e.message, meta: e.meta } });
  }
}
