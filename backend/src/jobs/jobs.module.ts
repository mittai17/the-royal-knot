import { BullModule, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, OnModuleInit, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { DocumentCategory, Role, UserStatus } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { inr, kv, page, table, dt } from '../common/pdf-templates';
import { PdfService } from '../common/pdf.service';
import { env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { AnalyticsService } from '../modules/analytics/analytics.service';
import { DocumentsService } from '../modules/documents/documents.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { PaymentsService } from '../modules/payments/payments.service';
import { PaymentsModule } from '../modules/payments/payments.module';

const connection = () => ({ url: env.redisUrl, maxRetriesPerRequest: null as null });

@Injectable()
export class Scheduler implements OnModuleInit {
  private logger = new Logger('Scheduler');
  constructor(@InjectQueue('reminders') private reminders: Queue) {}
  async onModuleInit() {
    if (env.disableJobs) return;
    await this.reminders.upsertJobScheduler('scan-every-10m', { every: 10 * 60 * 1000 }, { name: 'scan' }).catch((e) => this.logger.warn(`Scheduler: ${e.message}`));
    await this.reminders.add('scan', {}, { delay: 5000, jobId: `boot-${Date.now()}`, removeOnComplete: 20 }).catch(() => undefined);
  }
}

/** Scans for follow-ups, due/overdue client payments and overdue tasks. Notification dedupe keys make every scan idempotent. */
@Processor('reminders')
export class RemindersProcessor extends WorkerHost {
  private logger = new Logger('Reminders');
  constructor(private prisma: PrismaService, private notif: NotificationsService, private payments: PaymentsService, @InjectQueue('email') private email: Queue) { super(); }

  async process(_: Job) {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    let n = 0;
    const followUps = await this.prisma.enquiry.findMany({ where: { followUpAt: { lte: now }, stage: { notIn: ['CONVERTED', 'LOST'] } }, include: { couple: true } });
    for (const e of followUps) n += await this.notif.notify({ type: 'enquiry.followup', title: 'Follow-up due', body: `${e.couple.brideName} & ${e.couple.groomName}`, link: `/enquiries/${e.id}`, userIds: e.assignedToId ? [e.assignedToId] : [], roles: e.assignedToId ? [] : ['PLANNER'], dedupeKey: `followup:${e.id}:${e.followUpAt!.toISOString().slice(0, 10)}` });
    for (const m of await this.payments.refreshStatuses()) {
      const created = await this.notif.notify({ type: m.status === 'OVERDUE' ? 'payment.overdue' : 'payment.due', title: m.status === 'OVERDUE' ? 'Payment overdue' : 'Payment due soon', body: `${m.weddingName} · ${m.type.toLowerCase()} · ${inr(m.outstanding)} (due ${dt(m.dueDate)})`, link: `/weddings/${m.weddingId}?tab=payments`, roles: ['FINANCE', 'PLANNER'], dedupeKey: `pay:${m.id}:${m.status}` });
      n += created;
      if (created && env.smtp.host) await this.email.add('send', { to: 'finance@theroyalknot.local', subject: `Payment ${m.status.toLowerCase()}: ${m.weddingName}`, text: `${m.type} milestone of ${m.weddingName} has ${inr(m.outstanding)} outstanding (due ${dt(m.dueDate)}).` }, { attempts: 3, removeOnComplete: 50 });
    }
    // Scheduled vendor payments that have come due (Finance executes them; the approver cannot).
    const dueVp = await this.prisma.vendorPayment.findMany({ where: { status: 'SCHEDULED', scheduledFor: { lte: now } }, include: { wedding: { select: { name: true } }, weddingVendor: { select: { vendor: { select: { name: true } } } } }, take: 200 });
    for (const p of dueVp) n += await this.notif.notify({ type: 'vendor-payment.due', title: 'Scheduled vendor payment is due', body: `${p.weddingVendor.vendor.name} · ${p.wedding.name} · ${inr(p.amount)}`, link: '/vendor-payments?tab=scheduled', roles: ['FINANCE'], dedupeKey: `vp-due:${p.id}:${p.scheduledFor!.toISOString().slice(0, 10)}` });
    const tasks = await this.prisma.weddingTask.findMany({ where: { status: { not: 'DONE' }, dueDate: { lt: now } }, include: { wedding: { select: { name: true } } }, take: 200 });
    for (const t of tasks) n += await this.notif.notify({ type: 'task.overdue', title: 'Task overdue', body: `${t.name} · ${t.wedding.name}`, link: `/weddings/${t.weddingId}?tab=planning`, userIds: t.ownerId ? [t.ownerId] : [], roles: t.ownerId ? [] : ['PLANNER'], dedupeKey: `task-overdue:${t.id}:${day}` });
    this.logger.log(`scan complete: ${n} notifications`);
    return { notifications: n };
  }
}

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private transport = env.smtp.host ? nodemailer.createTransport({ host: env.smtp.host, port: env.smtp.port, secure: false, ignoreTLS: true }) : null;
  async process(job: Job<{ to: string; subject: string; text: string }>) {
    if (!this.transport) return { skipped: 'SMTP not configured' };
    await this.transport.sendMail({ from: env.smtp.from, ...job.data });
    return { sent: true };
  }
}

export class GenerateReportDto {
  @IsEnum(['wedding-summary', 'profitability']) type: 'wedding-summary' | 'profitability';
  @IsOptional() @IsUUID() weddingId?: string;
}

@Processor('documents')
export class ReportsProcessor extends WorkerHost {
  constructor(private prisma: PrismaService, private pdf: PdfService, private docs: DocumentsService, private analytics: AnalyticsService) { super(); }

  async process(job: Job<GenerateReportDto & { requestedById: string }>) {
    const { type, weddingId, requestedById } = job.data;
    if (type === 'wedding-summary') {
      if (!weddingId) throw new Error('weddingId required');
      const w = await this.prisma.wedding.findUniqueOrThrow({ where: { id: weddingId }, include: { couple: true, events: true, weddingVendors: { include: { vendor: true } } } });
      const f = await this.analytics.weddingFinancial(weddingId);
      const html = page('Wedding Summary Report', w.name, kv([['Couple', `${w.couple.brideName} & ${w.couple.groomName}`], ['Location', `${w.location}${w.venue ? ` · ${w.venue}` : ''}`], ['Dates', `${dt(w.startDate)} – ${dt(w.endDate)}`], ['Guests (expected / actual)', `${w.expectedGuests} / ${w.actualGuests ?? '—'}`], ['Status', w.status]]) +
        '<h2>Events</h2>' + table([{ label: 'Event' }, { label: 'Date' }, { label: 'Guests', num: true }], w.events.map((e) => [e.name, dt(e.date), e.expectedGuests])) +
        '<h2>Vendors</h2>' + table([{ label: 'Vendor' }, { label: 'Category' }, { label: 'Contract', num: true }], w.weddingVendors.map((v) => [v.vendor.name, v.category, inr(v.contractAmount)])) +
        (f ? '<h2>Financials</h2>' + kv([['Revenue', inr(f.revenue)], ['Vendor costs', inr(f.vendorCosts)], ['Net profit', inr(f.netProfit)], ['Margin', `${f.marginPct}%`], ['Receivables', inr(f.receivables)], ['Vendor payables', inr(f.payables)]]) : ''));
      return this.docs.save({ weddingId, name: `Summary-${w.name.replace(/\s+/g, '_')}.pdf`, category: DocumentCategory.FINAL_REPORT, buffer: await this.pdf.htmlToPdf(html), mime: 'application/pdf', uploadedById: requestedById, allowedRoles: [Role.PLANNER, Role.FINANCE, Role.EVENT_MANAGER] }).then((d) => ({ documentId: d.id }));
    }
    const p = await this.analytics.profitability();
    const html = page('Profitability Report', 'Season overview', kv([['Weddings', p.totals.weddings], ['Revenue', inr(p.totals.revenue)], ['Total expenses', inr(p.totals.totalExpenses)], ['Net profit', inr(p.totals.netProfit)], ['Margin', `${p.totals.marginPct}%`]]) + table([{ label: 'Wedding' }, { label: 'Revenue', num: true }, { label: 'Vendor costs', num: true }, { label: 'Net profit', num: true }, { label: 'Margin', num: true }], p.weddings.map((r) => [r.name, inr(r.revenue), inr(r.vendorCosts), inr(r.netProfit), `${r.marginPct}%`])));
    return this.docs.save({ weddingId: null, name: `Profitability-${new Date().toISOString().slice(0, 10)}.pdf`, category: DocumentCategory.FINAL_REPORT, buffer: await this.pdf.htmlToPdf(html), mime: 'application/pdf', uploadedById: requestedById, allowedRoles: [Role.FINANCE] }).then((d) => ({ documentId: d.id }));
  }
}

@ApiTags('jobs & reports') @ApiCookieAuth() @Controller()
export class JobsController {
  constructor(@InjectQueue('documents') private docsQ: Queue, @InjectQueue('reminders') private remQ: Queue) {}

  @Post('reports/generate') @Roles(Role.FINANCE, Role.PLANNER)
  async generate(@Body() dto: GenerateReportDto, @CurrentUser() u: AuthUser) {
    if (dto.type === 'wedding-summary' && !dto.weddingId) throw new BadRequestException('weddingId is required for wedding-summary');
    if (dto.type === 'profitability' && u.role !== Role.FOUNDER && u.role !== Role.FINANCE) throw new BadRequestException('Only finance can generate profitability reports');
    const job = await this.docsQ.add('generate', { ...dto, requestedById: u.id }, { attempts: 2, removeOnComplete: 100, removeOnFail: 100 });
    return { jobId: job.id, status: 'queued' };
  }

  @Get('reports/jobs/:id') async status(@Param('id') id: string) {
    const job = await this.docsQ.getJob(id);
    if (!job) return { status: 'unknown' };
    return { status: await job.getState(), result: job.returnvalue ?? null, failedReason: job.failedReason ?? null };
  }

  @Post('jobs/run-reminders') @Roles(Role.FOUNDER) async run() { const j = await this.remQ.add('scan', {}, { removeOnComplete: 20 }); return { jobId: j.id }; }
}

@Module({
  imports: [BullModule.forRoot({ connection: connection() }), BullModule.registerQueue({ name: 'reminders' }, { name: 'documents' }, { name: 'email' }), PaymentsModule],
  controllers: [JobsController], providers: [Scheduler, RemindersProcessor, EmailProcessor, ReportsProcessor],
})
export class JobsModule {}
