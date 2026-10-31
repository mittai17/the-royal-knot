import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { orderBy, Paginated, skipTake } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto, GenerateTasksDto, TaskQuery, TemplateItemDto, UpdateTaskDto, UpdateTemplateItemDto } from './tasks.dto';

const DAY = 864e5;
const include = { owner: { select: { id: true, name: true, role: true } }, weddingVendor: { select: { id: true, category: true, vendor: { select: { name: true } } } }, event: { select: { id: true, name: true } }, dependsOn: { select: { dependsOnId: true } } } satisfies Prisma.WeddingTaskInclude;

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService, private audit: AuditService, private rt: RealtimeService, private notif: NotificationsService) {}

  /**
   * Idempotent: (weddingId, templateKey) is unique and rows are inserted with skipDuplicates,
   * so repeated triggers (booking payment recorded twice, manual re-run) never duplicate tasks.
   */
  async generate(weddingId: string, dto: GenerateTasksDto = {}, actor?: AuthUser) {
    const wedding = await this.prisma.wedding.findUnique({ where: { id: weddingId }, include: { events: true, weddingVendors: true } });
    if (!wedding) throw new NotFoundException('Wedding not found');
    const template = dto.templateId
      ? await this.prisma.taskTemplate.findUnique({ where: { id: dto.templateId }, include: { items: { orderBy: { sortOrder: 'asc' } } } })
      : await this.prisma.taskTemplate.findFirst({ where: { name: wedding.packageType === 'FULL_SERVICE' ? 'Full-Service Wedding Checklist' : 'Day-of Management Checklist' }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    if (!template) throw new BadRequestException('No task template found');

    const staff = await this.prisma.user.findMany({ where: { status: UserStatus.ACTIVE, available: true }, select: { id: true, role: true } });
    const load = new Map((await this.prisma.weddingTask.groupBy({ by: ['ownerId'], where: { status: { not: 'COMPLETED' } }, _count: true })).map((g) => [g.ownerId, g._count]));
    const owner = (role: Role) => {
      if (role === 'PLANNER' && wedding.plannerId) return wedding.plannerId;
      const c = staff.filter((s) => s.role === role).sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
      if (c) load.set(c.id, (load.get(c.id) ?? 0) + 1);
      return c?.id ?? wedding.plannerId ?? null;
    };
    const earliest = new Date(Date.now() + 2 * DAY);
    const rows: Prisma.WeddingTaskCreateManyInput[] = template.items.map((i) => {
      let due = new Date(wedding.startDate.getTime() - i.offsetDays * DAY);
      if (due < earliest && wedding.startDate > earliest) due = earliest;
      return {
        weddingId, templateKey: i.key, name: i.name, description: i.description, category: i.category, priority: i.priority, dueDate: due, ownerId: owner(i.ownerRole),
        eventId: i.eventKind ? wedding.events.find((e) => e.kind === i.eventKind)?.id : undefined,
        vendorId: i.vendorCategory ? wedding.weddingVendors.find((v) => v.category === i.vendorCategory)?.id : undefined,
      };
    });
    const created = await this.prisma.$transaction(async (tx) => {
      const r = await tx.weddingTask.createMany({ data: rows, skipDuplicates: true });
      const all = await tx.weddingTask.findMany({ where: { weddingId, templateKey: { not: null } }, select: { id: true, templateKey: true } });
      const idOf = new Map(all.map((t) => [t.templateKey!, t.id]));
      const deps = template.items.filter((i) => i.dependsOnKey && idOf.has(i.dependsOnKey) && idOf.has(i.key)).map((i) => ({ taskId: idOf.get(i.key)!, dependsOnId: idOf.get(i.dependsOnKey!)! }));
      await tx.taskDependency.createMany({ data: deps, skipDuplicates: true });
      if (r.count > 0) await this.audit.log({ actorId: actor?.id, weddingId, entity: 'WeddingTask', action: 'generate', message: `Generated ${r.count} planning tasks from "${template.name}"` }, tx);
      return r.count;
    });
    const total = await this.prisma.weddingTask.count({ where: { weddingId } });
    if (created > 0) await this.notif.notify({ type: 'tasks.generated', title: 'Planning checklist generated', body: `${created} tasks created for ${wedding.name}`, link: `/weddings/${weddingId}?tab=planning`, roles: ['PLANNER', 'EVENT_MANAGER'] });
    return { created, skipped: template.items.length - created, total, template: template.name };
  }

  async list(q: TaskQuery, user: AuthUser, weddingId?: string) {
    const now = new Date();
    const where: Prisma.WeddingTaskWhereInput = {
      ...(weddingId ?? q.weddingId ? { weddingId: weddingId ?? q.weddingId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}),
      ...(q.mine ? { ownerId: user.id } : q.ownerId ? { ownerId: q.ownerId } : {}), ...(q.overdue ? { status: { not: 'COMPLETED' }, dueDate: { lt: now } } : {}),
      ...(q.from || q.to ? { dueDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.weddingTask.findMany({ where, include: { ...include, wedding: { select: { id: true, name: true } } }, orderBy: orderBy({ ...q, order: q.order ?? 'asc' } as TaskQuery, ['dueDate', 'priority', 'status', 'name', 'createdAt'], 'dueDate'), ...skipTake(q) }),
      this.prisma.weddingTask.count({ where }),
    ]);
    return new Paginated(items, { page: q.page, pageSize: q.pageSize, total });
  }

  async create(weddingId: string, dto: CreateTaskDto, actor: AuthUser) {
    const { dependsOnIds, dueDate, ...rest } = dto;
    const t = await this.prisma.weddingTask.create({ data: { ...rest, weddingId, description: dto.description ?? '', dueDate: new Date(dueDate), ownerId: dto.ownerId ?? actor.id, ...(dependsOnIds?.length ? { dependsOn: { create: dependsOnIds.map((dependsOnId) => ({ dependsOnId })) } } : {}) }, include });
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'WeddingTask', entityId: t.id, action: 'create', message: `Added task "${t.name}"` });
    this.rt.toWedding(weddingId, 'task.updated', t);
    return t;
  }

  async update(id: string, dto: UpdateTaskDto, actor: AuthUser) {
    const prev = await this.prisma.weddingTask.findUnique({ where: { id }, include: { dependsOn: { include: { dependsOn: { select: { name: true, status: true } } } } } });
    if (!prev) throw new NotFoundException('Task not found');
    if (dto.status === 'COMPLETED' && prev.status !== 'COMPLETED') {
      const open = prev.dependsOn.filter((d) => d.dependsOn.status !== 'COMPLETED');
      if (open.length) throw new ConflictException({ message: `Blocked by unfinished tasks: ${open.map((d) => d.dependsOn.name).join(', ')}`, details: open.map((d) => d.dependsOn.name) });
    }
    const t = await this.prisma.weddingTask.update({
      where: { id },
      data: { ...dto, ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}), ...(dto.status ? { completedAt: dto.status === 'COMPLETED' ? new Date() : null } : {}) },
      include,
    });
    await this.audit.log({ actorId: actor.id, weddingId: t.weddingId, entity: 'WeddingTask', entityId: id, action: 'update', message: dto.status && dto.status !== prev.status ? `"${t.name}" ${prev.status} → ${dto.status}` : `Updated task "${t.name}"`, meta: { fields: Object.keys(dto) } });
    this.rt.toWedding(t.weddingId, 'task.updated', t);
    if (dto.ownerId && dto.ownerId !== prev.ownerId && dto.ownerId !== actor.id) await this.notif.notify({ type: 'task.assigned', title: 'Task assigned to you', body: t.name, link: `/weddings/${t.weddingId}?tab=planning`, userIds: [dto.ownerId], roles: [] });
    return t;
  }

  // ---- reusable templates ----
  templates() { return this.prisma.taskTemplate.findMany({ include: { items: { orderBy: { sortOrder: 'asc' } }, _count: { select: { items: true } } } }); }
  addTemplateItem(templateId: string, dto: TemplateItemDto) { return this.prisma.taskTemplateItem.create({ data: { ...dto, templateId } }); }
  updateTemplateItem(id: string, dto: UpdateTemplateItemDto) { return this.prisma.taskTemplateItem.update({ where: { id }, data: dto }); }
  deleteTemplateItem(id: string) { return this.prisma.taskTemplateItem.delete({ where: { id } }); }
}
