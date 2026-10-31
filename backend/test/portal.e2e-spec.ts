/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configure } from '../src/main';

/**
 * Tenant isolation for the client and vendor portals. Fixtures: a second couple + wedding (B) with its own guest, payment and document,
 * and a second vendor (V2) booked and invited on B. Seeded couple "Mehta" (A) and "Royal Caterers" (vendor A) must never see B's data and vice versa.
 */
const PASSWORD = process.env.DEMO_PASSWORD ?? 'RoyalKnot@2026';
const prisma = new PrismaClient();
const RUN = `PRT-${Date.now()}`;
const d = (r: request.Response) => r.body.data;

let app: INestApplication;
let url: string;
const ag: Record<string, ReturnType<typeof request.agent>> = {};
const ids: any = {};

async function login(key: string, email: string) {
  const a = request.agent(url);
  await a.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  ag[key] = a;
}

beforeAll(async () => {
  process.env.DISABLE_JOBS = 'true';
  process.env.AUTH_RATE_LIMIT = '1000';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configure(app);
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const hash = await argon2.hash(PASSWORD);
  const planner = await prisma.user.findFirstOrThrow({ where: { role: 'PLANNER' } });
  const couple = await prisma.couple.create({ data: { brideName: `${RUN} Bride`, groomName: `${RUN} Groom`, email: 'b@example.com' } });
  const now = Date.now();
  const wedding = await prisma.wedding.create({ data: { name: `${RUN} Wedding`, coupleId: couple.id, location: 'Goa', venue: 'Beach Hall', startDate: new Date(now - 3600e3), endDate: new Date(now + 2 * 864e5), eventDays: 3, expectedGuests: 100, plannerId: planner.id, status: 'EVENT_DAY', contractValue: 1000000 } });
  const vendor2 = await prisma.vendor.create({ data: { name: `${RUN} Caterers`, category: 'CATERING', contactName: 'V Two', phone: '+91 90000 22222' } });
  const clientB = await prisma.user.create({ data: { email: `${RUN.toLowerCase()}-client@example.com`, name: 'Client B', role: 'CLIENT', passwordHash: hash, coupleId: couple.id } });
  const vendorB = await prisma.user.create({ data: { email: `${RUN.toLowerCase()}-vendor@example.com`, name: 'Vendor B', role: 'VENDOR', passwordHash: hash, vendorId: vendor2.id } });
  const wv = await prisma.weddingVendor.create({ data: { weddingId: wedding.id, vendorId: vendor2.id, category: 'CATERING', contractAmount: 500000 } });
  const guest = await prisma.guest.create({ data: { weddingId: wedding.id, name: 'B Guest', email: 'bg@example.com' } });
  const milestone = await prisma.paymentMilestone.create({ data: { weddingId: wedding.id, type: 'ADVANCE', dueDate: new Date(now + 864e5), expectedAmount: 300000 } });
  const payment = await prisma.clientPayment.create({ data: { weddingId: wedding.id, milestoneId: milestone.id, amount: 100000, method: 'UPI', paidAt: new Date(), idempotencyKey: `${RUN}-pay`, receiptNo: `${RUN}-R` } });
  const rfqGroup = `${RUN}-rfq`;
  const rfq = await prisma.quotationRequest.create({ data: { rfqGroup, weddingId: wedding.id, vendorId: vendor2.id, category: 'CATERING', title: `${RUN} catering RFQ`, brief: 'Dinner for 100' } });
  const task = await prisma.weddingTask.create({ data: { weddingId: wedding.id, name: `${RUN} task`, description: 'd', category: 'CATERING', dueDate: new Date(now + 864e5), vendorId: wv.id } });
  const review = await prisma.vendorReview.create({ data: { vendorId: vendor2.id, weddingId: wedding.id, rating: 5, comment: 'Great' } });
  const doc = await prisma.document.create({ data: { weddingId: wedding.id, name: 'b-schedule.txt', category: 'EVENT_SCHEDULE', objectKey: `${RUN}/b.txt`, mimeType: 'text/plain', size: 1, documentKey: `${RUN}-doc`, allowedRoles: [] } });
  const vdoc = await prisma.document.create({ data: { weddingId: wedding.id, name: 'b-contract.txt', category: 'VENDOR_CONTRACT', objectKey: `${RUN}/c.txt`, mimeType: 'text/plain', size: 1, documentKey: `${RUN}-vdoc`, allowedRoles: ['VENDOR'] } });
  Object.assign(ids, { couple: couple.id, wedding: wedding.id, vendor2: vendor2.id, clientB: clientB.id, vendorB: vendorB.id, wv: wv.id, guest: guest.id, milestone: milestone.id, payment: payment.id, rfq: rfq.id, task: task.id, review: review.id, doc: doc.id, vdoc: vdoc.id, clientEmail: clientB.email, vendorEmail: vendorB.email });

  await login('clientA', 'rahul.priya@gmail.com');
  await login('vendorA', 'vendor@royalcaterers.com');
  await login('clientB', clientB.email);
  await login('vendorB', vendorB.email);
  await login('planner', 'neha@royalknot.local');
});

afterAll(async () => {
  await prisma.guest.deleteMany({ where: { weddingId: ids.wedding } });
  await prisma.document.deleteMany({ where: { weddingId: ids.wedding } });
  await prisma.wedding.deleteMany({ where: { id: ids.wedding } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.clientB, ids.vendorB] } } });
  await prisma.vendor.deleteMany({ where: { id: ids.vendor2 } });
  await prisma.couple.deleteMany({ where: { id: ids.couple } });
  await prisma.systemSetting.deleteMany({ where: { key: { contains: ids.wv } } });
  await prisma.$disconnect();
  await app.close();
});

describe('portal role gates', () => {
  it('keeps each portal to its own role (default-deny)', async () => {
    await ag.clientA.get('/api/v1/portal/vendor/dashboard').expect(403);
    await ag.vendorA.get('/api/v1/portal/client/dashboard').expect(403);
    await ag.planner.get('/api/v1/portal/client/dashboard').expect(403);
    await ag.planner.get('/api/v1/portal/vendor/dashboard').expect(403);
    await request(url).get('/api/v1/portal/client/dashboard').expect(401);
  });
  it('portal roles cannot reach staff endpoints for the other tenant', async () => {
    await ag.clientA.get(`/api/v1/weddings/${ids.wedding}/guests`).expect(403);
    await ag.clientA.get(`/api/v1/payments/upi-qr?milestoneId=${ids.milestone}`).expect(403);
    await ag.vendorA.get(`/api/v1/weddings/${ids.wedding}`).expect(403);
  });
});

describe('client portal isolation', () => {
  it('each couple sees only its own wedding', async () => {
    expect(d(await ag.clientA.get('/api/v1/portal/client/dashboard').expect(200)).wedding.name).toBe('Mehta Wedding');
    const b = d(await ag.clientB.get('/api/v1/portal/client/dashboard').expect(200));
    expect(b.wedding.id).toBe(ids.wedding);
    expect(b.payments.received).toBe('100000');
    expect(b.payments.outstanding).toBe('200000');
    expect(JSON.stringify(d(await ag.clientB.get('/api/v1/portal/client/vendors')))).not.toContain('Royal Caterers');
  });
  it('rejects an explicit foreign weddingId', async () => {
    await ag.clientA.get(`/api/v1/portal/client/dashboard?weddingId=${ids.wedding}`).expect(403);
    await ag.clientA.get(`/api/v1/portal/client/schedule?weddingId=${ids.wedding}`).expect(403);
    await ag.clientA.get(`/api/v1/portal/client/vendors?weddingId=${ids.wedding}`).expect(403);
  });
  it('guest list never leaks and foreign guests cannot be changed, deleted or invited', async () => {
    const a = d(await ag.clientA.get('/api/v1/portal/client/guests?pageSize=500'));
    expect(a.find((g: any) => g.id === ids.guest)).toBeUndefined();
    await ag.clientA.patch(`/api/v1/portal/client/guests/${ids.guest}`).send({ rsvp: 'YES' }).expect(403);
    await ag.clientA.delete(`/api/v1/portal/client/guests/${ids.guest}`).expect(403);
    await ag.clientA.post('/api/v1/portal/client/guests/invite').send({ guestIds: [ids.guest] }).expect(403);
    expect((await prisma.guest.findUniqueOrThrow({ where: { id: ids.guest } })).rsvp).toBe('PENDING');
  });
  it('own guests: add, import, RSVP, invite (queued, status flips), delete', async () => {
    const g = d(await ag.clientB.post('/api/v1/portal/client/guests').send({ name: 'New Guest', email: 'ng@example.com', invitationStatus: 'DELIVERED' }).expect(201));
    expect(g.weddingId).toBe(ids.wedding);
    expect(g.invitationStatus).toBe('NOT_SENT'); // clients cannot self-declare invitations as delivered
    await ag.clientB.patch(`/api/v1/portal/client/guests/${g.id}`).send({ rsvp: 'YES', invitationStatus: 'DELIVERED' }).expect(200);
    const after = await prisma.guest.findUniqueOrThrow({ where: { id: g.id } });
    expect(after.rsvp).toBe('YES');
    expect(after.invitationStatus).toBe('NOT_SENT');
    const imp = d(await ag.clientB.post('/api/v1/portal/client/guests/import').send({ csv: 'name,phone\nCsv A,+91 1\nCsv A,+91 1' }).expect(201));
    expect(imp.imported).toBe(1);
    expect(imp.skipped).toBe(1);
    const inv = d(await ag.clientB.post('/api/v1/portal/client/guests/invite').send({ allPending: true }).expect(201));
    expect(inv.queued).toBeGreaterThanOrEqual(2); // B Guest + New Guest have email
    expect(inv.skipped.map((s: any) => s.name)).toContain('Csv A'); // no email
    expect((await prisma.guest.findUniqueOrThrow({ where: { id: g.id } })).invitationStatus).toBe('SENT');
    await ag.clientB.post('/api/v1/portal/client/guests/invite').send({}).expect(400);
    await ag.clientB.delete(`/api/v1/portal/client/guests/${g.id}`).expect(200);
    const log = await prisma.activityLog.findFirst({ where: { weddingId: ids.wedding, action: 'invite' } });
    expect(log).toBeTruthy();
  });
  it('documents, receipts and UPI QR are tenant scoped', async () => {
    const docsA = d(await ag.clientA.get('/api/v1/portal/client/documents'));
    expect(docsA.documents.find((x: any) => x.id === ids.doc)).toBeUndefined();
    await ag.clientA.get(`/api/v1/portal/client/documents/${ids.doc}/download`).expect(404);
    await ag.clientA.get(`/api/v1/portal/client/payments/${ids.payment}/receipt`).expect(403);
    await ag.clientA.get(`/api/v1/portal/client/payments/upi-qr?milestoneId=${ids.milestone}`).expect(403);
    const qr = d(await ag.clientB.get(`/api/v1/portal/client/payments/upi-qr?milestoneId=${ids.milestone}`).expect(200));
    expect(qr.upiUri).toMatch(/^upi:\/\/pay\?/);
    expect(qr.amount).toBe('200000.00');
    await ag.clientB.get(`/api/v1/portal/client/payments/${ids.payment}/receipt`).expect(200).expect('Content-Type', /pdf/);
  });
  it('vendor-only documents are invisible to the couple even on their own wedding', async () => {
    const docsB = d(await ag.clientB.get('/api/v1/portal/client/documents'));
    expect(docsB.documents.map((x: any) => x.id)).toEqual([ids.doc]);
    await ag.clientB.get(`/api/v1/portal/client/documents/${ids.vdoc}/download`).expect(404);
  });
  it('story and notification prefs persist per user', async () => {
    await ag.clientB.patch('/api/v1/portal/client/wedding/story').send({ story: 'Met at a wedding.' }).expect(200);
    expect(d(await ag.clientB.get('/api/v1/portal/client/wedding')).story).toBe('Met at a wedding.');
    expect(d(await ag.clientA.get('/api/v1/portal/client/wedding')).story).not.toBe('Met at a wedding.');
    await ag.clientB.patch('/api/v1/portal/client/settings/notifications').send({ sms: 'yes' }).expect(400);
    expect(d(await ag.clientB.patch('/api/v1/portal/client/settings/notifications').send({ sms: true }).expect(200)).notifications.sms).toBe(true);
    expect(d(await ag.clientA.get('/api/v1/portal/client/settings')).notifications.sms).toBe(false);
  });
});

describe('vendor portal isolation', () => {
  it('each vendor sees only its own RFQs / bookings', async () => {
    const a = d(await ag.vendorA.get('/api/v1/portal/vendor/rfqs?view=all'));
    expect(a.rfqs.find((r: any) => r.id === ids.rfq)).toBeUndefined();
    const b = d(await ag.vendorB.get('/api/v1/portal/vendor/rfqs'));
    expect(b.rfqs.map((r: any) => r.id)).toEqual([ids.rfq]);
    expect(b.counts.new).toBe(1);
    expect(d(await ag.vendorB.get('/api/v1/portal/vendor/bookings')).map((x: any) => x.id)).toEqual([ids.wv]);
    expect(d(await ag.vendorB.get('/api/v1/portal/vendor/dashboard')).totalBookings).toBe(1);
  });
  it("another vendor's RFQ is a 404 for detail, quotation and PDF", async () => {
    await ag.vendorA.get(`/api/v1/portal/vendor/rfqs/${ids.rfq}`).expect(404);
    await ag.vendorA.post(`/api/v1/portal/vendor/rfqs/${ids.rfq}/quotation`).send({ items: [{ name: 'x', quantity: 1, unit: 'u', unitPrice: 5 }] }).expect(404);
    expect(await prisma.quotation.count({ where: { requestId: ids.rfq } })).toBe(0);
  });
  it('quotation validation and one-quote-per-vendor-per-RFQ', async () => {
    const url_ = `/api/v1/portal/vendor/rfqs/${ids.rfq}/quotation`;
    await ag.vendorB.post(url_).send({ items: [] }).expect(400);
    await ag.vendorB.post(url_).send({ items: [{ name: 'Plate', quantity: -1, unit: 'plate', unitPrice: 100 }] }).expect(400);
    await ag.vendorB.post(url_).send({ items: [{ name: 'Plate', quantity: 0, unit: 'plate', unitPrice: 100 }] }).expect(400); // nothing priced
    await ag.vendorB.post(url_).send({ validUntil: '2020-01-01', items: [{ name: 'Plate', quantity: 1, unit: 'plate', unitPrice: 100 }] }).expect(400);
    const q1 = d(await ag.vendorB.post(url_).send({ rating: 5, items: [{ name: 'Plate', quantity: 100, unit: 'plate', unitPrice: 1000, taxRate: 5 }], notes: 'v1' }).expect(201));
    expect(q1.grandTotal).toBe('105000'); // totals recomputed server-side
    expect(q1.rating).toBeNull(); // vendors cannot rate themselves
    const q2 = d(await ag.vendorB.post(url_).send({ items: [{ name: 'Plate', quantity: 100, unit: 'plate', unitPrice: 900 }] }).expect(201));
    expect(q2.id).toBe(q1.id); // revised, not duplicated
    expect(await prisma.quotation.count({ where: { requestId: ids.rfq } })).toBe(1);
    const detail = d(await ag.vendorB.get(`/api/v1/portal/vendor/rfqs/${ids.rfq}`).expect(200));
    expect(detail.state).toBe('SUBMITTED');
    expect(detail.quotation.items).toHaveLength(1);
    const list = d(await ag.vendorB.get('/api/v1/portal/vendor/quotations'));
    expect(list.quotations[0].stage).toBe('UNDER_REVIEW'); // single invitee: every invited vendor has quoted
    await ag.vendorB.get(`/api/v1/portal/vendor/quotations/${q1.id}/pdf`).expect(200).expect('Content-Type', /pdf/);
    await ag.vendorA.get(`/api/v1/portal/vendor/quotations/${q1.id}/pdf`).expect(404);
    expect(d(await ag.vendorA.get('/api/v1/portal/vendor/quotations')).quotations.find((q: any) => q.id === q1.id)).toBeUndefined();
    // planner sees it and the RFQ closes for revisions once decided
    await ag.planner.post(`/api/v1/quotations/${q1.id}/select`).send({}).expect(201);
    await ag.vendorB.post(url_).send({ items: [{ name: 'Plate', quantity: 1, unit: 'plate', unitPrice: 1 }] }).expect(409);
    expect(d(await ag.vendorB.get('/api/v1/portal/vendor/quotations')).quotations[0].stage).toBe('ACCEPTED');
  });
  it('check-in / check-out is scoped, ordered and idempotent-safe', async () => {
    await ag.vendorA.post(`/api/v1/portal/vendor/check-in/${ids.wv}/arrive`).send({}).expect(404);
    await ag.vendorB.post(`/api/v1/portal/vendor/check-in/${ids.wv}/depart`).send({}).expect(409); // not arrived yet
    await ag.vendorB.post(`/api/v1/portal/vendor/check-in/${ids.wv}/arrive`).send({ notes: 'at gate' }).expect(201);
    await ag.vendorB.post(`/api/v1/portal/vendor/check-in/${ids.wv}/arrive`).send({}).expect(409);
    await ag.vendorB.post(`/api/v1/portal/vendor/check-in/${ids.wv}/depart`).send({}).expect(201);
    await ag.vendorB.post(`/api/v1/portal/vendor/check-in/${ids.wv}/depart`).send({}).expect(409);
    const board = d(await ag.vendorB.get('/api/v1/portal/vendor/check-in'));
    expect(board[0].arrival.status).toBe('COMPLETED');
    expect(d(await ag.vendorA.get('/api/v1/portal/vendor/check-in')).find((x: any) => x.bookingId === ids.wv)).toBeUndefined();
  });
  it('deliverables, tasks and reviews cannot be touched across vendors', async () => {
    await ag.vendorA.patch(`/api/v1/portal/vendor/deliverables/${ids.wv}/contract`).send({ done: true }).expect(404);
    const del = d(await ag.vendorB.patch(`/api/v1/portal/vendor/deliverables/${ids.wv}/${d(await ag.vendorB.get('/api/v1/portal/vendor/deliverables'))[0].items[0].id}`).send({ done: true }).expect(200));
    expect(del.completed).toBe(del.total);
    await ag.vendorA.patch(`/api/v1/portal/vendor/tasks/${ids.task}`).send({ status: 'COMPLETED' }).expect(404);
    expect(d(await ag.vendorA.get('/api/v1/portal/vendor/tasks')).find((t: any) => t.id === ids.task)).toBeUndefined();
    await ag.vendorB.patch(`/api/v1/portal/vendor/tasks/${ids.task}`).send({ status: 'DONE' }).expect(400);
    expect(d(await ag.vendorB.patch(`/api/v1/portal/vendor/tasks/${ids.task}`).send({ status: 'IN_PROGRESS', evidenceNote: 'started' }).expect(200)).status).toBe('IN_PROGRESS');
    await ag.vendorA.post(`/api/v1/portal/vendor/reviews/${ids.review}/respond`).send({ text: 'hi' }).expect(404);
    await ag.vendorB.post(`/api/v1/portal/vendor/reviews/${ids.review}/respond`).send({ text: 'Thank you!' }).expect(201);
    expect(d(await ag.vendorB.get('/api/v1/portal/vendor/reviews')).reviews[0].response.text).toBe('Thank you!');
    expect(d(await ag.vendorB.get('/api/v1/portal/vendor/reviews')).summary.average).toBe(5);
  });
  it('documents: vendor sees only role-granted docs of its own weddings; staff-only docs stay hidden', async () => {
    expect(d(await ag.vendorB.get('/api/v1/portal/vendor/documents')).map((x: any) => x.id)).toEqual([ids.vdoc]);
    expect(d(await ag.vendorA.get('/api/v1/portal/vendor/documents')).find((x: any) => x.id === ids.vdoc)).toBeUndefined();
    await ag.vendorA.get(`/api/v1/portal/vendor/documents/${ids.vdoc}/download`).expect(404);
    await ag.vendorB.get(`/api/v1/portal/vendor/documents/${ids.doc}/download`).expect(404); // no VENDOR role on it
    await ag.vendorB.post('/api/v1/portal/vendor/documents').field('category', 'INVOICE').field('weddingId', '00000000-0000-4000-8000-000000000000').attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' }).expect(403);
  });
  it('profile edits are limited to the own record and whitelisted fields', async () => {
    const before = await prisma.vendor.findUniqueOrThrow({ where: { id: ids.vendor2 } });
    await ag.vendorB.patch('/api/v1/portal/vendor/profile').send({ rating: 1, category: 'VENUE' }).expect(400); // nothing editable in the payload
    const p = d(await ag.vendorB.patch('/api/v1/portal/vendor/profile').send({ businessName: 'B Biz', serviceAreas: ['Goa'], basePrice: 900, available: false }).expect(200));
    expect(p.businessName).toBe('B Biz');
    const after = await prisma.vendor.findUniqueOrThrow({ where: { id: ids.vendor2 } });
    expect(after.category).toBe(before.category);
    expect(Number(after.rating)).toBe(Number(before.rating));
    const svc = d(await ag.vendorB.post('/api/v1/portal/vendor/profile/services').send({ name: 'Buffet', unit: 'plate', price: 800 }).expect(201));
    await ag.vendorA.patch(`/api/v1/portal/vendor/profile/services/${svc.id}`).send({ price: 1 }).expect(404);
    await ag.vendorA.delete(`/api/v1/portal/vendor/profile/services/${svc.id}`).expect(404);
    await ag.vendorB.delete(`/api/v1/portal/vendor/profile/services/${svc.id}`).expect(200);
    await ag.vendorB.put('/api/v1/portal/vendor/profile/availability').send({ blockedDates: ['2027-01-01', 'bad'] }).expect(400);
    expect(d(await ag.vendorB.put('/api/v1/portal/vendor/profile/availability').send({ blockedDates: ['2027-01-01'], notes: 'Holiday' }).expect(200)).availability.blockedDates).toEqual(['2027-01-01']);
    expect(d(await ag.vendorA.get('/api/v1/portal/vendor/profile')).availability.blockedDates).not.toContain('2027-01-01');
  });
});
