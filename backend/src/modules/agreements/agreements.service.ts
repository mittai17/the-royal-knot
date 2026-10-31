import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, StreamableFile } from '@nestjs/common';
import { Agreement, AgreementSignature, DocumentCategory } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
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
  constructor(private prisma: PrismaService, private audit: AuditService, private pdf: PdfService, private docs: DocumentsService, private storage: StorageService, private notif: NotificationsService) {}

  templates() { return this.prisma.agreementTemplate.findMany({ orderBy: { name: 'asc' } }); }

  async list(weddingId: string) {
    return this.prisma.agreement.findMany({ where: { weddingId }, orderBy: { version: 'desc' }, include: { signatures: { select: { id: true, signerName: true, signerRole: true, signedAt: true } } } });
  }

  async get(id: string) {
    const a = await this.prisma.agreement.findUnique({ where: { id }, include: { signatures: true, template: true, wedding: { include: { couple: true } } } });
    if (!a) throw new NotFoundException('Agreement not found');
    return a;
  }

  /** Renders the template with live wedding data. Earlier unsigned versions are voided; history is kept. */
  async generate(weddingId: string, templateId: string | undefined, actor: AuthUser) {
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
      await tx.agreement.updateMany({ where: { weddingId, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'VOID' } });
      return tx.agreement.create({ data: { weddingId, templateId: template.id, version: (last?.version ?? 0) + 1, status: 'SENT', content, amount: w.contractValue, paymentTerms: terms } });
    });
    await this.audit.log({ actorId: actor.id, weddingId, entity: 'Agreement', entityId: a.id, action: 'generate', message: `Generated agreement v${a.version}` });
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
    const a = await this.get(id);
    if (a.status === 'VOID') throw new ConflictException('This agreement version was superseded');
    if (a.signatures.some((s) => s.signerRole === dto.signerRole)) throw new ConflictException(`${dto.signerRole} has already signed`);
    await this.prisma.agreementSignature.create({ data: { agreementId: id, signerName: dto.signerName, signerRole: dto.signerRole, signatureData: dto.signatureData, ip } });
    const clientSigned = dto.signerRole === 'CLIENT' || a.signatures.some((s) => s.signerRole === 'CLIENT');
    if (clientSigned) await this.prisma.agreement.update({ where: { id }, data: { status: 'SIGNED' } });
    await this.audit.log({ actorId: actor.id, weddingId: a.weddingId, entity: 'Agreement', entityId: id, action: 'sign', message: `${dto.signerName} signed agreement v${a.version} as ${dto.signerRole.toLowerCase()}` });
    if (clientSigned) {
      await this.notif.notify({ type: 'agreement.signed', title: 'Agreement signed', body: `${a.wedding.name} · v${a.version}`, link: `/weddings/${a.weddingId}`, roles: ['PLANNER', 'FINANCE'] });
      await this.storePdf(id, actor).catch((e) => this.logger.warn(`Signed PDF not stored: ${e.message}`));
    }
    return this.get(id);
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
    const a = await this.get(id);
    const buffer = a.documentId && a.status === 'SIGNED' ? await streamToBuffer(await this.storage.get((await this.prisma.document.findUniqueOrThrow({ where: { id: a.documentId } })).objectKey)) : await this.pdf.htmlToPdf(this.html(a, a.wedding));
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `inline; filename="agreement-v${a.version}.pdf"` });
  }
}

async function streamToBuffer(s: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}
