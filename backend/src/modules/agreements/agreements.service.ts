import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, StreamableFile } from '@nestjs/common';
import { Agreement, AgreementSignature, DocumentCategory } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { ScopeService } from '../../common/scope.service';
import { AGREEMENT_TRANSITIONS, assertTransition } from '../../common/state-machines';
import { WeddingsService } from '../weddings/weddings.service';
import { PdfService } from '../../common/pdf.service';
import { dt, esc, inr, kv, page, raw } from '../../common/pdf-templates';
import { StorageService } from '../../common/storage.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SignAgreementDto } from './agreements.dto';

@Injectable()
export class AgreementsService {
  private logger = new Logger('Agreements');
  constructor(private prisma: PrismaService, private audit: AuditService, private pdf: PdfService, private docs: DocumentsService, private storage: StorageService, private notif: NotificationsService, private scope: ScopeService, private weddings: WeddingsService) {}

  templates() { return this.prisma.agreementTemplate.findMany({ orderBy: { name: 'asc' } }); }

  async list(weddingId: string, user?: AuthUser) {
    if (user) await this.scope.assertWeddingAccess(user, weddingId);
    return this.prisma.agreement.findMany({ where: { weddingId }, orderBy: { version: 'desc' }, include: { signatures: { select: { id: true, signerName: true, signerRole: true, signedAt: true } } } });
  }

  async get(id: string, user?: AuthUser) {
    const a = await this.prisma.agreement.findUnique({ where: { id }, include: { signatures: true, template: true, wedding: { include: { couple: true } } } });
    if (!a) throw new NotFoundException('Agreement not found');
    if (user) await this.scope.assertWeddingAccess(user, a.weddingId); // IDOR: staff only reach agreements of weddings they are assigned to
    return a;
  }

  /** Expiry job hook: SENT / DRAFT agreements past `expiresAt` become EXPIRED. Idempotent and never touches SIGNED / REJECTED. */
  async expireStale(now = new Date()) {
    const r = await this.prisma.agreement.updateMany({ where: { status: { in: ['DRAFT', 'SENT'] }, expiresAt: { lt: now } }, data: { status: 'EXPIRED' } });
    return { expired: r.count };
  }

  /** Renders the template with live wedding data. Earlier unsigned versions are voided; history is kept. */
  async generate(weddingId: string, templateId: string | undefined, actor: AuthUser) {
    await this.scope.assertWeddingAccess(actor, weddingId);
    const w = await this.prisma.wedding.findUnique({ where: { id: weddingId }, include: { couple: true, milestones: { orderBy: { dueDate: 'asc' } } } });
    if (!w) throw new NotFoundException('Wedding not found');
    const template = templateId ? await this.prisma.agreementTemplate.findUnique({ where: { id: templateId } }) : await this.prisma.agreementTemplate.findFirst({ where: { packageType: w.packageType } });
    if (!template) throw new BadRequestException('No agreement template available for this package');
    const terms = w.milestones.map((m) => `${m.type[0] + m.type.slice(1).toLowerCase()} payment ${inr(m.expectedAmount)} due ${dt(m.dueDate)}`).join('; ');
    const scope = w.packageType === 'FULL_SERVICE'
      ? 'Wedding theme and design, venue booking, vendor sourcing and selection, layout and planning, guest management, practice runs and complete event-day coordination.'
      : 'Event schedule management, vendor arrival coordination, family movement coordination, event execution and post-event coordination and closure.';
    const vars: Record<string, string> = {
      couple: `${w.couple.brideName} & ${w.couple.groomName}`, wedding: w.name, location: w.location, venue: w.venue ?? 'To be confirmed', dates: `${dt(w.startDate)} – ${dt(w.endDate)}`,
      guests: String(w.expectedGuests), package: w.packageType === 'FULL_SERVICE' ? 'Full-Service Wedding' : 'Partial / Day-of Wedding Management', amount: inr(w.contractValue), scope, terms,
    };
    const content = template.body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    const last = await this.prisma.agreement.findFirst({ where: { weddingId }, orderBy: { version: 'desc' } });
    const a = await this.prisma.$transaction(async (tx) => {
      await tx.agreement.updateMany({ where: { weddingId, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'EXPIRED' } });
      return tx.agreement.create({ data: { weddingId, templateId: template.id, version: (last?.version ?? 0) + 1, status: 'SENT', content, amount: w.contractValue, paymentTerms: terms } });
    });
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'Agreement', entityId: a.id, action: 'generate', message: `Generated agreement v${a.version}` });
    await this.weddings.refreshBookingStatus(weddingId); // DRAFT -> AGREEMENT_PENDING
    return a;
  }

  private html(a: Agreement & { signatures: AgreementSignature[] }, w: { name: string }) {
    const paras = a.content.split('\n').map((l) => (l.trim() ? `<p>${esc(l)}</p>` : '')).join('');
    const sigs = a.signatures.length
      ? `<div class="sig">${a.signatures.map((s) => `<div><img src="${s.signatureData}"/><br><b>${esc(s.signerName)}</b> (${s.signerRole.toLowerCase()})<br><span class="muted">Signed ${dt(s.signedAt)} · internal digital signature capture</span></div>`).join('')}</div>`
      : '<p class="muted">Awaiting signatures.</p>';
    return page('Service Agreement', `${w.name} · Version ${a.version} · ${a.status}`, raw(`${kv([['Contract amount', inr(a.amount)], ['Payment terms', a.paymentTerms]])}<h2>Agreement</h2>${paras}<h2>Signatures</h2>${sigs}`));
  }

  async sign(id: string, dto: SignAgreementDto, actor: AuthUser, ip?: string) {
    const a = await this.get(id, actor);
    if (a.expiresAt && a.expiresAt < new Date() && (a.status === 'SENT' || a.status === 'DRAFT')) {
      await this.prisma.agreement.update({ where: { id }, data: { status: 'EXPIRED' } });
      throw new ConflictException('This agreement has expired; ask your planner for a new version');
    }
    if (a.status === 'EXPIRED') throw new ConflictException('This agreement version was superseded');
    if (a.status === 'REJECTED') throw new ConflictException('This agreement was rejected');
    if (a.status === 'DRAFT') throw new ConflictException('This agreement has not been sent for signature yet');
    // SENT -> SIGNED on the client's signature. A SIGNED agreement may still collect the planner's counter-signature (no state change).
    if (a.status === 'SIGNED' && dto.signerRole === 'CLIENT') throw new ConflictException('CLIENT has already signed');
    if (a.signatures.some((s) => s.signerRole === dto.signerRole)) throw new ConflictException(`${dto.signerRole} has already signed`);
    const clientSigned = dto.signerRole === 'CLIENT';
    if (clientSigned) assertTransition('Agreement', AGREEMENT_TRANSITIONS, a.status, 'SIGNED');
    await this.prisma.$transaction(async (tx) => {
      await tx.agreementSignature.create({ data: { agreementId: id, signerName: dto.signerName, signerRole: dto.signerRole, signatureData: dto.signatureData, ip } });
      if (clientSigned) {
        const claim = await tx.agreement.updateMany({ where: { id, status: 'SENT' }, data: { status: 'SIGNED' } }); // concurrent double-sign loses here
        if (claim.count === 0) throw new ConflictException('This agreement is no longer open for signature');
      }
    });
    await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'Agreement', entityId: id, action: 'sign', message: `${dto.signerName} signed agreement v${a.version} as ${dto.signerRole.toLowerCase()}` });
    if (clientSigned) {
      await this.notif.notify({ type: 'agreement.signed', title: 'Agreement signed', body: `${a.wedding.name} · v${a.version}`, link: `/weddings/${a.weddingId}`, roles: ['PLANNER', 'FINANCE'] });
      await this.storePdf(id, actor).catch((e) => this.logger.warn(`Signed PDF not stored: ${e.message}`));
      await this.weddings.confirmIfReady(a.weddingId, actor); // PROPOSAL_PENDING / DEPOSIT_PENDING, and CONFIRMED when everything else is already in place
    }
    return this.get(id);
  }

  /** Planner or the couple declines the agreement: SENT -> REJECTED (a new version can be generated afterwards). */
  async reject(id: string, reason: string | undefined, actor: AuthUser) {
    const a = await this.get(id, actor);
    assertTransition('Agreement', AGREEMENT_TRANSITIONS, a.status, 'REJECTED');
    const claim = await this.prisma.agreement.updateMany({ where: { id, status: 'SENT' }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectReason: reason } });
    if (!claim.count) throw new ConflictException('This agreement is no longer open');
    await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'Agreement', entityId: id, action: 'reject', message: `Agreement v${a.version} rejected${reason ? `: ${reason}` : ''}` });
    await this.weddings.refreshBookingStatus(a.weddingId);
    return this.get(id);
  }

  /** The couple signs their own agreement from the portal: scoped to their wedding, role forced to CLIENT. */
  async signAsClient(u: AuthUser, id: string, dto: { signerName: string; signatureData: string }, ip?: string) {
    const a = await this.prisma.agreement.findUnique({ where: { id }, select: { weddingId: true, status: true } });
    if (!a || !['SENT', 'SIGNED'].includes(a.status)) throw new NotFoundException('Agreement not found');
    await this.scope.assertWeddingAccess(u, a.weddingId);
    return this.sign(id, { signerName: dto.signerName, signerRole: 'CLIENT', signatureData: dto.signatureData }, u, ip);
  }

  /** Renders the PDF with embedded signatures and stores it in MinIO as a versioned wedding document. */
  async storePdf(id: string, actor?: AuthUser) {
    const a = await this.get(id);
    const buffer = await this.pdf.htmlToPdf(this.html(a, a.wedding));
    const doc = await this.docs.save({ weddingId: a.weddingId, name: `Agreement-${a.wedding.name.replace(/\s+/g, '_')}-v${a.version}${a.status === 'SIGNED' ? '-signed' : ''}.pdf`, category: DocumentCategory.AGREEMENT, buffer, mime: 'application/pdf', uploadedById: actor?.id, documentKey: a.documentId ? (await this.prisma.document.findUnique({ where: { id: a.documentId } }))?.documentKey : undefined });
    await this.prisma.agreement.update({ where: { id }, data: { documentId: doc.id } });
    return doc;
  }

  async pdfStream(id: string, actor: AuthUser) {
    const a = await this.get(id, actor);
    const buffer = a.documentId && a.status === 'SIGNED' ? await streamToBuffer(await this.storage.get((await this.prisma.document.findUniqueOrThrow({ where: { id: a.documentId } })).objectKey)) : await this.pdf.htmlToPdf(this.html(a, a.wedding));
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `inline; filename="agreement-v${a.version}.pdf"` });
  }
}

async function streamToBuffer(s: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}
