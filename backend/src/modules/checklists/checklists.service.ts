import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentCategory, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { ScopeService } from '../../common/scope.service';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { ChecklistQuery, CreateChecklistDto, CreateItemDto, CreateReportDto, ReportQuery, UpdateChecklistDto, UpdateItemDto } from './checklists.dto';

const itemOrder = [{ sortOrder: 'asc' }, { dueDate: 'asc' }] as Prisma.ChecklistItemOrderByWithRelationInput[];
export const progress = (items: { done: boolean }[]) => ({ total: items.length, done: items.filter((i) => i.done).length, pct: items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0 });

@Injectable()
export class ChecklistsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private rt: RealtimeService, private scope: ScopeService, private docs: DocumentsService) {}

  private shape<T extends { items: { done: boolean }[] }>(c: T) { return { ...c, progress: progress(c.items) }; }

  /** Staff only reach checklists of weddings they are assigned to (wedding-less checklists stay shared). */
  private async access(user: AuthUser | undefined, weddingId: string | null | undefined) {
    if (user && weddingId) await this.scope.assertWeddingAccess(user, weddingId);
  }
  async list(q: ChecklistQuery, user?: AuthUser) {
    await this.access(user, q.weddingId);
    const rows = await this.prisma.checklist.findMany({
      where: { ...(user && this.scope.isScoped(user) ? { OR: [{ weddingId: null }, { wedding: this.scope.weddingWhere(user) }] } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.clientVisible !== undefined ? { clientVisible: q.clientVisible } : {}), ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}) },
      orderBy: { createdAt: 'desc' }, take: 300, include: { items: { orderBy: itemOrder }, wedding: { select: { id: true, name: true } } },
    });
    return rows.map((c) => this.shape(c));
  }
  async get(id: string, user?: AuthUser) {
    const c = await this.prisma.checklist.findUnique({ where: { id }, include: { items: { orderBy: itemOrder }, wedding: { select: { id: true, name: true } } } });
    if (!c) throw new NotFoundException('Checklist not found');
    await this.access(user, c.weddingId);
    return this.shape(c);
  }
  async create(dto: CreateChecklistDto, actor: AuthUser) {
    if (dto.weddingId && !(await this.prisma.wedding.count({ where: { id: dto.weddingId } }))) throw new NotFoundException('Wedding not found');
    await this.access(actor, dto.weddingId);
    const c = await this.prisma.checklist.create({
      data: { name: dto.name.trim(), weddingId: dto.weddingId, ownerId: actor.id, clientVisible: dto.clientVisible ?? false, items: { create: (dto.items ?? []).map((i, n) => ({ title: i.title.trim(), dueDate: i.dueDate ? new Date(i.dueDate) : undefined, sortOrder: n })) } },
      include: { items: { orderBy: itemOrder }, wedding: { select: { id: true, name: true } } },
    });
    await this.audit.log({ actorId: actor.id, weddingId: c.weddingId, entity: 'Checklist', entityId: c.id, action: 'create', message: `Created checklist "${c.name}" (${c.items.length} items)` });
    this.emit(c.weddingId, c.id);
    return this.shape(c);
  }
  async update(id: string, dto: UpdateChecklistDto, actor: AuthUser) {
    await this.get(id, actor);
    const c = await this.prisma.checklist.update({ where: { id }, data: dto, include: { items: { orderBy: itemOrder }, wedding: { select: { id: true, name: true } } } }).catch(() => { throw new NotFoundException('Checklist not found'); });
    await this.audit.log({ actorId: actor.id, weddingId: c.weddingId, entity: 'Checklist', entityId: id, action: 'update', message: `Updated checklist "${c.name}"` });
    this.emit(c.weddingId, id);
    return this.shape(c);
  }
  async remove(id: string, actor: AuthUser) {
    await this.get(id, actor);
    const c = await this.prisma.checklist.delete({ where: { id } }).catch(() => { throw new NotFoundException('Checklist not found'); });
    await this.audit.log({ actorId: actor.id, weddingId: c.weddingId, entity: 'Checklist', entityId: id, action: 'delete', message: `Deleted checklist "${c.name}"` });
    this.emit(c.weddingId, id);
    return { ok: true };
  }
  private emit(weddingId: string | null, id: string) { if (weddingId) this.rt.toWedding(weddingId, 'checklist.updated', { id }); }

  async addItem(checklistId: string, dto: CreateItemDto, actor: AuthUser) {
    const c = await this.prisma.checklist.findUnique({ where: { id: checklistId }, include: { items: { select: { sortOrder: true } } } });
    if (!c) throw new NotFoundException('Checklist not found');
    await this.access(actor, c.weddingId);
    const item = await this.prisma.checklistItem.create({ data: { checklistId, title: dto.title.trim(), dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, sortOrder: Math.max(-1, ...c.items.map((i) => i.sortOrder)) + 1 } });
    await this.audit.log({ actorId: actor.id, weddingId: c.weddingId, entity: 'Checklist', entityId: checklistId, action: 'add_item', message: `Added "${item.title}" to "${c.name}"` });
    this.emit(c.weddingId, checklistId);
    return item;
  }
  async updateItem(id: string, dto: UpdateItemDto, actor: AuthUser) {
    const prev = await this.prisma.checklistItem.findUnique({ where: { id }, include: { checklist: true } });
    if (!prev) throw new NotFoundException('Item not found');
    await this.access(actor, prev.checklist.weddingId);
    const { done, dueDate, title, ...rest } = dto;
    const item = await this.prisma.checklistItem.update({ where: { id }, data: { ...rest, ...(title !== undefined ? { title: title.trim() } : {}), ...(dueDate !== undefined ? { dueDate: new Date(dueDate) } : {}), ...(done !== undefined ? { done, doneAt: done ? new Date() : null, doneById: done ? actor.id : null } : {}) } });
    await this.audit.log({ actorId: actor.id, weddingId: prev.checklist.weddingId, entity: 'Checklist', entityId: prev.checklistId, action: done === undefined ? 'update_item' : done ? 'tick' : 'untick', message: done === undefined ? `Edited "${item.title}"` : `${done ? 'Ticked' : 'Unticked'} "${item.title}" in "${prev.checklist.name}"` });
    this.emit(prev.checklist.weddingId, prev.checklistId);
    return item;
  }
  async removeItem(id: string, actor: AuthUser) {
    const prev = await this.prisma.checklistItem.findUnique({ where: { id }, include: { checklist: true } });
    if (!prev) throw new NotFoundException('Item not found');
    await this.access(actor, prev.checklist.weddingId);
    await this.prisma.checklistItem.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, weddingId: prev.checklist.weddingId, entity: 'Checklist', entityId: prev.checklistId, action: 'remove_item', message: `Removed "${prev.title}" from "${prev.checklist.name}"` });
    this.emit(prev.checklist.weddingId, prev.checklistId);
    return { ok: true };
  }

  // ---------------------------------------------------------------- client portal
  async forClient(user: AuthUser) {
    const ids = await this.scope.requireClientWeddingIds(user);
    const rows = await this.prisma.checklist.findMany({ where: { weddingId: { in: ids }, clientVisible: true }, orderBy: { createdAt: 'asc' }, include: { items: { orderBy: itemOrder }, wedding: { select: { id: true, name: true } } } });
    const all = rows.flatMap((r) => r.items);
    return { summary: progress(all), checklists: rows.map((c) => this.shape(c)) };
  }
  async clientTick(itemId: string, done: boolean, user: AuthUser) {
    const item = await this.prisma.checklistItem.findUnique({ where: { id: itemId }, include: { checklist: true } });
    if (!item || !item.checklist.clientVisible || !item.checklist.weddingId) throw new NotFoundException('Item not found');
    await this.scope.assertWeddingAccess(user, item.checklist.weddingId);
    if (!user.coupleId) throw new ForbiddenException('This account is not linked to a couple');
    return this.updateItem(itemId, { done }, user);
  }

  // ---------------------------------------------------------------- updates & reports (OPERATIONS)
  async createReport(dto: CreateReportDto, actor: AuthUser) {
    const w = await this.prisma.wedding.findUnique({ where: { id: dto.weddingId }, select: { id: true, name: true } });
    if (!w) throw new NotFoundException('Wedding not found');
    await this.access(actor, w.id);
    if (dto.taskId && !(await this.prisma.weddingTask.count({ where: { id: dto.taskId, weddingId: dto.weddingId } }))) throw new BadRequestException('Task does not belong to this wedding');
    if (dto.functionId && !(await this.prisma.weddingEvent.count({ where: { id: dto.functionId, weddingId: dto.weddingId } }))) throw new BadRequestException('Function does not belong to this wedding');
    if (dto.photoIds?.length && (await this.prisma.document.count({ where: { id: { in: dto.photoIds }, weddingId: dto.weddingId } })) !== dto.photoIds.length) throw new BadRequestException('Some attached photos were not found for this wedding');
    const { type, weddingId, title, summary, ...meta } = dto;
    const row = await this.audit.log({ actorId: actor.id, weddingId, entity: 'FieldReport', action: type.toLowerCase(), message: `${title}: ${summary}`.slice(0, 500), meta: { type, title, summary, ...meta } as Prisma.InputJsonValue });
    return this.shapeReport({ ...row, actor: { id: actor.id, name: actor.name }, wedding: w });
  }
  private shapeReport(r: { id: string; createdAt: Date; meta: Prisma.JsonValue; weddingId: string | null; actor?: { id: string; name: string } | null; wedding?: { id: string; name: string } | null }) {
    return { id: r.id, createdAt: r.createdAt, weddingId: r.weddingId, wedding: r.wedding ?? null, author: r.actor ?? null, ...((r.meta ?? {}) as Record<string, unknown>) };
  }
  async reports(q: ReportQuery, user: AuthUser) {
    await this.access(user, q.weddingId);
    const ids = await this.scope.weddingIds(user);
    const rows = await this.prisma.activityLog.findMany({
      where: { entity: 'FieldReport', ...(ids ? { weddingId: { in: ids } } : {}), ...(q.weddingId ? { weddingId: q.weddingId } : {}), ...(q.type ? { action: q.type.toLowerCase() } : {}), ...(q.mine ? { actorId: user.id } : {}) },
      orderBy: { createdAt: 'desc' }, take: q.limit ?? 50, include: { actor: { select: { id: true, name: true } }, wedding: { select: { id: true, name: true } } },
    });
    const photoIds = [...new Set(rows.flatMap((r) => ((r.meta as { photoIds?: string[] } | null)?.photoIds ?? [])))];
    const photos = photoIds.length ? await this.prisma.document.findMany({ where: { id: { in: photoIds } }, select: { id: true, name: true, mimeType: true } }) : [];
    const pm = new Map(photos.map((p) => [p.id, p]));
    return rows.map((r) => { const s = this.shapeReport(r) as Record<string, unknown>; s.photos = ((s.photoIds as string[] | undefined) ?? []).map((id) => pm.get(id)).filter(Boolean); return s; });
  }
  /** Progress overview for the Updates screen: today's updates and open task counts per wedding. */
  async reportSummary(user: AuthUser) {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const [todayCount, mine, openTasks, overdue] = await Promise.all([
      this.prisma.activityLog.count({ where: { entity: 'FieldReport', createdAt: { gte: today } } }),
      this.prisma.activityLog.count({ where: { entity: 'FieldReport', actorId: user.id } }),
      this.prisma.weddingTask.count({ where: { ownerId: user.id, status: { not: 'DONE' } } }),
      this.prisma.weddingTask.count({ where: { ownerId: user.id, status: { not: 'DONE' }, dueDate: { lt: new Date() } } }),
    ]);
    return { updatesToday: todayCount, myUpdates: mine, myOpenTasks: openTasks, myOverdueTasks: overdue };
  }
  async uploadPhoto(weddingId: string, file: Express.Multer.File, actor: AuthUser) {
    if (!file) throw new BadRequestException('Attach an image (field "file")');
    if (!/^image\//.test(file.mimetype)) throw new BadRequestException('Only image files can be attached as photos');
    if (!(await this.prisma.wedding.count({ where: { id: weddingId } }))) throw new NotFoundException('Wedding not found');
    await this.access(actor, weddingId);
    const doc = await this.docs.save({ weddingId, name: file.originalname, category: DocumentCategory.PHOTO, buffer: file.buffer, mime: file.mimetype, uploadedById: actor.id, allowedRoles: [Role.PLANNER, Role.EVENT_MANAGER, Role.OPERATIONS] });
    return { id: doc.id, name: doc.name, mimeType: doc.mimeType, size: doc.size };
  }
}
