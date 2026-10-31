import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import * as nodemailer from 'nodemailer';
import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../../common/decorators';
import { G } from '../../../common/permissions';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { IntegrationsService } from '../integrations/integrations.controller';
import { PermissionGuard, RequirePermission } from '../shared/permission.guard';
import { SettingsService } from '../shared/settings.service';

const SAMPLE: Record<string, string> = {
  couple_name: 'Aarav & Meera', client_name: 'Meera Kapoor', user_name: 'Rohan Sharma', wedding_name: 'Kapoor–Mehta Wedding', wedding_date: '14 Feb 2027', venue: 'Taj Lake Palace, Udaipur',
  amount: '₹ 4,50,000', due_date: '20 Dec 2026', invoice_number: 'INV-0042', milestone: 'Advance', task_name: 'Confirm décor vendor', login_url: 'https://app.example.com/login', temporary_password: 'Temp-Pass-123', company_name: 'The Royal Knot',
};
const DEFAULT_TEMPLATES = [
  { key: 'welcome_user', name: 'Welcome / account created', subject: 'Welcome to {{company_name}}', body: '<p>Hi {{user_name}},</p><p>Your account is ready. Sign in at <a href="{{login_url}}">{{login_url}}</a> with the temporary password <b>{{temporary_password}}</b>. You will be asked to choose a new password.</p>' },
  { key: 'password_reset', name: 'Password reset', subject: 'Your password was reset', body: '<p>Hi {{user_name}},</p><p>An administrator reset your password. Temporary password: <b>{{temporary_password}}</b>. Please change it after signing in.</p>' },
  { key: 'payment_reminder', name: 'Payment reminder', subject: 'Payment reminder: {{milestone}} for {{wedding_name}}', body: '<p>Dear {{client_name}},</p><p>The {{milestone}} payment of {{amount}} for {{wedding_name}} is due on {{due_date}}.</p>' },
  { key: 'payment_received', name: 'Payment received', subject: 'Payment received for {{wedding_name}}', body: '<p>Dear {{client_name}},</p><p>We have received {{amount}} towards {{wedding_name}}. Thank you.</p>' },
  { key: 'invoice_sent', name: 'Invoice sent', subject: 'Invoice {{invoice_number}} from {{company_name}}', body: '<p>Dear {{client_name}},</p><p>Please find invoice {{invoice_number}} for {{amount}}, due {{due_date}}.</p>' },
  { key: 'task_assigned', name: 'Task assigned', subject: 'New task: {{task_name}}', body: '<p>Hi {{user_name}},</p><p>You have been assigned "{{task_name}}" for {{wedding_name}}.</p>' },
  { key: 'event_reminder', name: 'Event reminder', subject: 'Reminder: {{wedding_name}} on {{wedding_date}}', body: '<p>Dear {{client_name}},</p><p>A reminder that {{wedding_name}} takes place on {{wedding_date}} at {{venue}}.</p>' },
];
export const TRIGGER_DEFAULTS = {
  welcome_user: { label: 'Send welcome email when a user account is created', enabled: true },
  password_reset: { label: 'Email a password-reset notice', enabled: true },
  payment_reminder: { label: 'Remind clients before a payment milestone is due', enabled: true, daysBefore: 3 },
  payment_received: { label: 'Confirm payments received', enabled: true },
  invoice_sent: { label: 'Email invoices when issued', enabled: true },
  task_assigned: { label: 'Notify staff when a task is assigned', enabled: true },
  event_reminder: { label: 'Remind couples before the wedding', enabled: true, daysBefore: 7 },
  daily_digest: { label: 'Send a daily summary to the Founder', enabled: false },
};

const vars = (s: string) => [...new Set([...s.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1]))];
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const render = (tpl: string, values: Record<string, string>, html = true) => tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => (k in values ? (html ? esc(values[k]) : values[k]) : `{{${k}}}`));

class TemplateDto {
  @IsString() @Matches(/^[a-z0-9_]{3,60}$/, { message: 'key must be lowercase letters, digits and underscores (3-60)' }) key: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(1) @MaxLength(300) subject: string;
  @IsString() @MinLength(1) @MaxLength(50_000) body: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50_000) body?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
class PreviewDto { @IsOptional() @IsObject() variables?: Record<string, string>; @IsOptional() @IsString() subject?: string; @IsOptional() @IsString() body?: string }
class TestSendDto { @IsEmail() to: string; @IsOptional() @IsObject() variables?: Record<string, string> }

@ApiTags('admin: email') @ApiCookieAuth() @UseGuards(PermissionGuard) @Roles(G.SYSADMIN)
@Controller('admin/email')
export class EmailController implements OnModuleInit {
  constructor(private prisma: PrismaService, private audit: AuditService, private settings: SettingsService, private integrations: IntegrationsService) {}

  async onModuleInit() {
    try {
      if (await this.settings.get('email.templates.seeded', false)) return;
      await this.prisma.emailTemplate.createMany({ data: DEFAULT_TEMPLATES, skipDuplicates: true });
      await this.prisma.systemSetting.upsert({ where: { key: 'email.templates.seeded' }, create: { key: 'email.templates.seeded', value: true }, update: { value: true } });
    } catch { /* DB not ready (unit tests) */ }
  }

  private async tpl(id: string) {
    const t = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  @Get('templates') @RequirePermission('email', 'read')
  async list() { return (await this.prisma.emailTemplate.findMany({ orderBy: { name: 'asc' } })).map((t) => ({ ...t, variables: vars(`${t.subject} ${t.body}`) })); }

  @Get('variables') @RequirePermission('email', 'read')
  variables() { return SAMPLE; }

  @Post('templates') @RequirePermission('email', 'write')
  async create(@Body() dto: TemplateDto, @CurrentUser() u: AuthUser) {
    if (await this.prisma.emailTemplate.findUnique({ where: { key: dto.key } })) throw new ConflictException('A template with this key already exists');
    const t = await this.prisma.emailTemplate.create({ data: dto });
    await this.audit.log({ actorId: u.id, entity: 'EmailTemplate', entityId: t.id, action: 'create', message: `Created email template "${t.name}"` });
    return t;
  }

  @Patch('templates/:id') @RequirePermission('email', 'write')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto, @CurrentUser() u: AuthUser) {
    const cur = await this.tpl(id);
    const t = await this.prisma.emailTemplate.update({ where: { id }, data: dto });
    await this.audit.log({ actorId: u.id, entity: 'EmailTemplate', entityId: id, action: 'update', message: `Updated email template "${cur.name}"`, meta: { fields: Object.keys(dto) } });
    return t;
  }

  @Delete('templates/:id') @RequirePermission('email', 'write')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    const cur = await this.tpl(id);
    await this.prisma.emailTemplate.delete({ where: { id } });
    await this.audit.log({ actorId: u.id, entity: 'EmailTemplate', entityId: id, action: 'delete', message: `Deleted email template "${cur.name}"` });
    return { deleted: true };
  }

  /** Renders a stored template (or an unsaved draft passed in the body) with sample / supplied variables. */
  @Post('templates/:id/preview') @RequirePermission('email', 'read')
  async preview(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PreviewDto) {
    const t = await this.tpl(id);
    const subject = dto.subject ?? t.subject, body = dto.body ?? t.body;
    const values = { ...SAMPLE, ...(dto.variables ?? {}) };
    return { subject: render(subject, values, false), html: render(body, values), variables: vars(`${subject} ${body}`), unknown: vars(`${subject} ${body}`).filter((v) => !(v in SAMPLE)) };
  }

  /** Sends the rendered template through the configured SMTP server. */
  @Post('templates/:id/test-send') @RequirePermission('email', 'write')
  async testSend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TestSendDto, @CurrentUser() u: AuthUser) {
    const t = await this.tpl(id);
    const { config } = await this.integrations.resolved('SMTP');
    if (!config.host) throw new BadRequestException('SMTP is not configured (Admin > Integrations)');
    const values = { ...SAMPLE, ...(dto.variables ?? {}) };
    const user = String(config.user ?? '');
    const transport = nodemailer.createTransport({ host: String(config.host), port: Number(config.port ?? 25), secure: config.secure === true, connectionTimeout: 8000, ...(user ? { auth: { user, pass: String(config.password ?? '') } } : { ignoreTLS: true }) });
    try {
      const info = await transport.sendMail({ from: String(config.from || 'hello@theroyalknot.local'), to: dto.to, subject: `[TEST] ${render(t.subject, values, false)}`, html: render(t.body, values) });
      await this.audit.log({ actorId: u.id, entity: 'EmailTemplate', entityId: id, action: 'test-send', message: `Sent test of "${t.name}" to ${dto.to}` });
      return { sent: true, messageId: info.messageId };
    } catch (e) { throw new BadRequestException(`Could not send: ${(e as Error).message}`); }
  }

  @Get('triggers') @RequirePermission('email', 'read')
  triggers() { return this.settings.getMerged('email.triggers', TRIGGER_DEFAULTS as Record<string, unknown>); }

  @Put('triggers') @RequirePermission('email', 'write')
  async saveTriggers(@Body() body: Record<string, { enabled?: boolean; daysBefore?: number }>, @CurrentUser() u: AuthUser) {
    const cur = (await this.triggers()) as Record<string, { label: string; enabled: boolean; daysBefore?: number }>;
    for (const [k, v] of Object.entries(body ?? {})) {
      if (!(k in TRIGGER_DEFAULTS)) throw new BadRequestException(`Unknown trigger ${k}`);
      if (v.enabled !== undefined) { if (typeof v.enabled !== 'boolean') throw new BadRequestException('enabled must be true or false'); cur[k].enabled = v.enabled; }
      if (v.daysBefore !== undefined) { const n = Number(v.daysBefore); if (!Number.isInteger(n) || n < 0 || n > 90) throw new BadRequestException('daysBefore must be 0-90'); cur[k].daysBefore = n; }
    }
    await this.settings.set('email.triggers', cur, u.id, { entity: 'EmailTemplate', message: 'Updated email trigger settings', meta: { triggers: Object.keys(body ?? {}) } });
    return cur;
  }
}
