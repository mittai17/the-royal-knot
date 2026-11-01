/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configure } from '../src/main';
import { confirmedWeddingWhere } from '../src/common/booking';
import { AgreementsService } from '../src/modules/agreements/agreements.service';
import { QuotationsService } from '../src/modules/quotations/quotations.service';
import { DAY_OF_ITEMS, PARTIAL_ITEMS } from '../src/modules/tasks/default-templates';

if (process.env.KEYCLOAK_ENABLED !== 'true') process.env.KEYCLOAK_ENABLED = 'false';

/**
 * WP2: draft vs confirmed wedding, agreement gate, procurement sequence, state machines, assignment scoping, socket room auth.
 * Everything is created through the API / direct DB fixtures with a unique RUN tag and removed in afterAll.
 */
const PASSWORD = process.env.DEMO_PASSWORD ?? 'RoyalKnot@2026';
const prisma = new PrismaClient();
const RUN = `WP2-${Date.now()}`;
const key = (s: string) => `${RUN}-${s}`;
const d = (r: request.Response) => r.body.data;
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const day = 864e5;

let app: INestApplication;
let url: string;
const ag: Record<string, ReturnType<typeof request.agent>> = {};
const cookie: Record<string, string> = {};
const made = { weddings: [] as string[], couples: [] as string[], enquiries: [] as string[], users: [] as string[], vendors: [] as string[], docs: [] as string[] };
const ids: Record<string, string> = {};

async function login(who: string, email: string) {
  const a = request.agent(url);
  const res = await a.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  ag[who] = a;
  cookie[who] = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}
const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

beforeAll(async () => {
  process.env.DISABLE_JOBS = 'true';
  process.env.AUTH_RATE_LIMIT = '1000';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configure(app);
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const hash = await argon2.hash(PASSWORD);
  const mk = async (data: any) => { const u = await prisma.user.create({ data: { passwordHash: hash, ...data } }); made.users.push(u.id); return u; };
  // couples A and B, one client user each
  const coupleA = await prisma.couple.create({ data: { brideName: `${RUN} A Bride`, groomName: `${RUN} A Groom`, email: 'a@example.com' } });
  const coupleB = await prisma.couple.create({ data: { brideName: `${RUN} B Bride`, groomName: `${RUN} B Groom`, email: 'b@example.com' } });
  made.couples.push(coupleA.id, coupleB.id);
  await mk({ email: `${RUN.toLowerCase()}-clienta@example.com`, name: 'Client A', role: 'CLIENT', coupleId: coupleA.id });
  await mk({ email: `${RUN.toLowerCase()}-clientb@example.com`, name: 'Client B', role: 'CLIENT', coupleId: coupleB.id });
  // four caterers (three invited on A, one booked on B), a portal user for the first and the fourth
  for (const n of [1, 2, 3, 4]) { const v = await prisma.vendor.create({ data: { name: `${RUN} Caterer ${n}`, category: 'CATERING', contactName: `C${n}`, phone: '+91 90000 0000' + n } }); made.vendors.push(v.id); ids[`v${n}`] = v.id; }
  await mk({ email: `${RUN.toLowerCase()}-vendor1@example.com`, name: 'Vendor 1', role: 'VENDOR', vendorId: ids.v1 });
  await mk({ email: `${RUN.toLowerCase()}-vendor4@example.com`, name: 'Vendor 4', role: 'VENDOR', vendorId: ids.v4 });
  ids.coupleA = coupleA.id; ids.coupleB = coupleB.id;

  for (const [who, email] of [['founder', 'founder@royalknot.local'], ['neha', 'neha@royalknot.local'], ['arjun', 'arjun@royalknot.local'], ['priya', 'priya@royalknot.local'], ['vikram', 'vikram@royalknot.local'], ['meera', 'meera@royalknot.local'],
    ['clientA', `${RUN.toLowerCase()}-clienta@example.com`], ['clientB', `${RUN.toLowerCase()}-clientb@example.com`], ['vendor1', `${RUN.toLowerCase()}-vendor1@example.com`], ['vendor4', `${RUN.toLowerCase()}-vendor4@example.com`]] as const) await login(who, email);
});

afterAll(async () => {
  const wid = { in: made.weddings };
  await prisma.vendorBillPayment.deleteMany({ where: { bill: { weddingId: wid } } });
  await prisma.vendorPayment.deleteMany({ where: { weddingId: wid } });
  await prisma.vendorBill.deleteMany({ where: { weddingId: wid } });
  await prisma.clientPayment.deleteMany({ where: { weddingId: wid } });
  await prisma.clientInvoice.deleteMany({ where: { weddingId: wid } });
  await prisma.additionalCharge.deleteMany({ where: { reconciliation: { weddingId: wid } } });
  await prisma.document.deleteMany({ where: { OR: [{ id: { in: made.docs } }, { weddingId: wid }] } });
  await prisma.proposal.deleteMany({ where: { weddingId: wid } });
  await prisma.weddingVendor.deleteMany({ where: { weddingId: wid } });
  await prisma.wedding.deleteMany({ where: { id: wid } });
  await prisma.enquiry.deleteMany({ where: { id: { in: made.enquiries } } });
  await prisma.couple.deleteMany({ where: { id: { in: made.couples } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  await prisma.vendor.deleteMany({ where: { id: { in: made.vendors } } });
  await prisma.$disconnect();
  await app.close();
});

const join = (who: string, weddingId: string) => new Promise<any>((resolve, reject) => {
  const s: Socket = io(`${url}/live`, { extraHeaders: { cookie: cookie[who] }, transports: ['websocket'], reconnection: false });
  const t = setTimeout(() => { s.close(); reject(new Error('socket timeout')); }, 8000);
  s.on('connect_error', (e) => { clearTimeout(t); s.close(); reject(e); });
  s.on('connect', () => s.emit('join', { weddingId }, (ack: any) => { clearTimeout(t); s.close(); resolve(ack); }));
});

const lineItem = (name: string, qty: number, price: number) => ({ name, quantity: qty, unit: 'plate', unitPrice: price, taxRate: 5 });
const verifyDeposit = (weddingId: string) => prisma.clientPayment.updateMany({ where: { weddingId, milestone: { type: 'BOOKING' } }, data: { verifiedAt: new Date() } });

// =====================================================================================================================================
describe('1. draft workspace vs confirmed wedding', () => {
  it('enquiry convert creates a DRAFT workspace: not confirmed, no tasks, excluded from confirmed queries', async () => {
    const e = d(await ag.neha.post('/api/v1/enquiries').send({ brideName: 'A Bride', groomName: `${RUN} Groom`, source: 'REFERRAL', location: 'Jaipur', guestCount: 300, budget: 10000000, packageType: 'FULL_SERVICE' }).expect(201));
    made.enquiries.push(e.id); made.couples.push(e.coupleId);
    await ag.neha.patch(`/api/v1/enquiries/${e.id}`).send({ stage: 'NEGOTIATION' }).expect(200);
    const w = d(await ag.neha.post(`/api/v1/enquiries/${e.id}/convert`).send({ name: `${RUN} Wedding A`, venue: 'Palace', startDate: new Date(Date.now() + 120 * day).toISOString(), contractValue: 10000000, expectedGuests: 300 }).expect(201));
    ids.A = w.id; made.weddings.push(w.id);
    // couple A's portal user owns wedding A (re-point the fixture wedding to the seeded couple A)
    await prisma.wedding.update({ where: { id: w.id }, data: { coupleId: ids.coupleA } });
    expect(w.bookingStatus).toBe('DRAFT');
    expect(w.executionStage).toBe('INITIAL_PHASE');
    expect(w.status).toBe('PLANNING');
    expect(await prisma.weddingTask.count({ where: { weddingId: w.id } })).toBe(0);
    expect(await prisma.wedding.count({ where: { id: w.id, ...confirmedWeddingWhere() } })).toBe(0);
    const drafts = d(await ag.neha.get('/api/v1/weddings?view=drafts&pageSize=100'));
    expect(drafts.some((x: any) => x.id === w.id)).toBe(true);
    const confirmed = d(await ag.neha.get('/api/v1/weddings?view=confirmed&pageSize=100'));
    expect(confirmed.some((x: any) => x.id === w.id)).toBe(false);
  });

  it('refuses to confirm early (409 with blockers) and generates no tasks; the readiness checklist agrees', async () => {
    const r = await ag.neha.post(`/api/v1/weddings/${ids.A}/confirm`).expect(409);
    expect(r.body.error.details ?? r.body.error).toBeDefined();
    expect(r.body.error.reason).toBe('CONFIRMATION_BLOCKED');
    expect(r.body.error.details.blockers).toEqual(['AGREEMENT_NOT_SIGNED', 'PROPOSAL_NOT_ACCEPTED', 'DEPOSIT_NOT_VERIFIED']);
    await ag.neha.post(`/api/v1/weddings/${ids.A}/tasks/generate`).send({}).expect(409); // never generate before confirm
    expect(await prisma.weddingTask.count({ where: { weddingId: ids.A } })).toBe(0);
    const rd = d(await ag.neha.get(`/api/v1/weddings/${ids.A}/readiness`).expect(200));
    expect(rd).toMatchObject({ agreementSigned: false, proposalAccepted: false, depositVerified: false, ready: false });
  });

  it('agreement gate: the client sees a locked vendor shortlist and no floor plans until the agreement is signed (HTTP 200, not an error)', async () => {
    const fp = await prisma.document.create({ data: { weddingId: ids.A, name: 'floor-plan.pdf', category: 'FLOOR_PLAN', objectKey: `${RUN}/fp.pdf`, mimeType: 'application/pdf', size: 1, documentKey: `${RUN}-fp`, allowedRoles: [] } });
    const sched = await prisma.document.create({ data: { weddingId: ids.A, name: 'schedule.pdf', category: 'EVENT_SCHEDULE', objectKey: `${RUN}/sc.pdf`, mimeType: 'application/pdf', size: 1, documentKey: `${RUN}-sc`, allowedRoles: [] } });
    made.docs.push(fp.id, sched.id); ids.floorPlan = fp.id;
    const v = await ag.clientA.get('/api/v1/portal/client/vendors').expect(200);
    expect(d(v)).toMatchObject({ locked: true, reason: 'AGREEMENT_NOT_SIGNED', vendors: [], comparisons: [] });
    const docs = d(await ag.clientA.get('/api/v1/portal/client/documents').expect(200));
    expect(docs.floorPlans).toEqual({ locked: true, reason: 'AGREEMENT_NOT_SIGNED' });
    expect(docs.documents.some((x: any) => x.category === 'FLOOR_PLAN')).toBe(false);
    expect(docs.documents.some((x: any) => x.id === sched.id)).toBe(true);
    const dl = await ag.clientA.get(`/api/v1/portal/client/documents/${fp.id}/download`).expect(403);
    expect(dl.body.error.reason).toBe('AGREEMENT_NOT_SIGNED');
    expect(dl.body.error.details).toMatchObject({ locked: true, reason: 'AGREEMENT_NOT_SIGNED' });
    // staff are never gated
    expect((await ag.neha.get(`/api/v1/documents/${fp.id}`).expect(200)).body.data.category).toBe('FLOOR_PLAN');
    expect(d(await ag.neha.get(`/api/v1/documents?weddingId=${ids.A}&pageSize=50`)).some((x: any) => x.id === fp.id)).toBe(true);
    // the couple cannot record a vendor choice yet either
    expect(d(await ag.clientA.get('/api/v1/portal/client/wedding').expect(200)).vendorsLocked).toBe(true);
  });

  it('booking status is derived: AGREEMENT_PENDING -> PROPOSAL_PENDING -> DEPOSIT_PENDING; the client signs through the portal', async () => {
    const agr = d(await ag.neha.post(`/api/v1/weddings/${ids.A}/agreements`).send({}).expect(201));
    ids.agrA = agr.id;
    expect((await prisma.wedding.findUniqueOrThrow({ where: { id: ids.A } })).bookingStatus).toBe('AGREEMENT_PENDING');
    // another couple's client cannot sign it (IDOR)
    await ag.clientB.post(`/api/v1/portal/client/agreements/${agr.id}/sign`).send({ signerName: 'Mallory', signatureData: SIG }).expect(403);
    await ag.clientA.post(`/api/v1/portal/client/agreements/${agr.id}/sign`).send({ signerName: 'Client A', signatureData: SIG }).expect(201);
    expect((await prisma.wedding.findUniqueOrThrow({ where: { id: ids.A } })).bookingStatus).toBe('PROPOSAL_PENDING');
    await ag.clientA.post(`/api/v1/portal/client/agreements/${agr.id}/sign`).send({ signerName: 'Client A', signatureData: SIG }).expect(409); // double signature
    const prop = d(await ag.neha.post('/api/v1/proposals').send({ weddingId: ids.A, title: `${RUN} proposal`, packageName: 'Full-Service', amount: 10000000 }).expect(201));
    ids.propA = prop.id;
    await ag.neha.post(`/api/v1/proposals/${prop.id}/send`).send({}).expect(201);
    await ag.neha.post(`/api/v1/proposals/${prop.id}/respond`).send({ status: 'ACCEPTED' }).expect(201);
    await ag.neha.post(`/api/v1/proposals/${prop.id}/respond`).send({ status: 'DECLINED' }).expect(409); // accepted is final
    expect((await prisma.wedding.findUniqueOrThrow({ where: { id: ids.A } })).bookingStatus).toBe('DEPOSIT_PENDING');
  });

  it('agreement gate opens once signed: vendors unlocked and floor plans listed', async () => {
    const v = d(await ag.clientA.get('/api/v1/portal/client/vendors').expect(200));
    expect(v.locked).toBe(false);
    const docs = d(await ag.clientA.get('/api/v1/portal/client/documents').expect(200));
    expect(docs.floorPlans.locked).toBe(false);
    expect(docs.documents.some((x: any) => x.id === ids.floorPlan)).toBe(true);
  });

  it('an unverified deposit does not confirm; verification + confirm does, once (parallel and repeated calls are no-ops)', async () => {
    const ms = d(await ag.meera.get(`/api/v1/weddings/${ids.A}/payments`)).milestones.find((m: any) => m.type === 'BOOKING');
    await ag.meera.post('/api/v1/payments').send({ weddingId: ids.A, milestone: 'BOOKING', amount: Number(ms.expectedAmount), method: 'BANK_TRANSFER', reference: 'NEFT-WP2', idempotencyKey: key('booking') }).expect(201);
    await prisma.clientPayment.updateMany({ where: { weddingId: ids.A }, data: { verifiedAt: null } }); // finance has not verified the funds yet
    await ag.neha.post(`/api/v1/weddings/${ids.A}/confirm`).expect(409);
    expect((await prisma.wedding.findUniqueOrThrow({ where: { id: ids.A } })).bookingStatus).toBe('DEPOSIT_PENDING');
    expect(await prisma.weddingTask.count({ where: { weddingId: ids.A } })).toBe(0);

    await verifyDeposit(ids.A);
    const results = await Promise.all([1, 2, 3].map(() => ag.neha.post(`/api/v1/weddings/${ids.A}/confirm`)));
    results.forEach((r) => expect(r.status).toBe(201));
    const first = results.filter((r) => !d(r).alreadyConfirmed);
    expect(first).toHaveLength(1); // exactly one real confirmation
    const w = await prisma.wedding.findUniqueOrThrow({ where: { id: ids.A } });
    expect(w.bookingStatus).toBe('CONFIRMED');
    expect(w.executionStage).toBe('VENDOR_BOOKING');
    expect(w.status).toBe('VENDOR_BOOKING'); // legacy status stays in sync
    const total = await prisma.weddingTask.count({ where: { weddingId: ids.A } });
    expect(total).toBeGreaterThanOrEqual(26);
    // repeated confirmation and repeated generation: no duplicates
    const again = d(await ag.neha.post(`/api/v1/weddings/${ids.A}/confirm`).expect(201));
    expect(again.alreadyConfirmed).toBe(true);
    const gen = d(await ag.neha.post(`/api/v1/weddings/${ids.A}/tasks/generate`).send({}).expect(201));
    expect(gen.created).toBe(0);
    await Promise.all([1, 2, 3].map(() => ag.neha.post(`/api/v1/weddings/${ids.A}/tasks/generate`).send({})));
    expect(await prisma.weddingTask.count({ where: { weddingId: ids.A } })).toBe(total);
    expect(await prisma.activityLog.count({ where: { weddingId: ids.A, entity: 'Wedding', action: 'confirm' } })).toBe(1);
    expect(d(await ag.neha.get('/api/v1/weddings?view=confirmed&pageSize=100')).some((x: any) => x.id === ids.A)).toBe(true);
  });

  it('Partial gets a reduced scoped set (< Full); Day-of is a subset of Partial; draft weddings cannot generate', async () => {
    const make = async (suffix: string, pkg: 'PARTIAL' | 'FULL_SERVICE') => {
      const w = d(await ag.neha.post('/api/v1/weddings').send({ brideName: `P${suffix}`, groomName: `${RUN} ${suffix}`, location: 'Udaipur', startDate: new Date(Date.now() + 90 * day).toISOString(), expectedGuests: 100, packageType: pkg, budget: 1000000, contractValue: 900000 }).expect(201));
      made.weddings.push(w.id); made.couples.push(w.coupleId);
      return w.id as string;
    };
    const p1 = await make('part1', 'PARTIAL'), p2 = await make('part2', 'PARTIAL');
    await ag.neha.post(`/api/v1/weddings/${p1}/tasks/generate`).send({}).expect(409);
    await prisma.wedding.updateMany({ where: { id: { in: [p1, p2] } }, data: { bookingStatus: 'CONFIRMED' } }); // fixture: skip the confirmation prerequisites
    const partial = d(await ag.neha.post(`/api/v1/weddings/${p1}/tasks/generate`).send({}).expect(201));
    expect(partial.created).toBe(PARTIAL_ITEMS.length);
    expect(partial.created).toBeLessThan(26);
    expect(partial.created).toBeLessThan(await prisma.weddingTask.count({ where: { weddingId: ids.A } }));
    const dayOf = d(await ag.neha.post(`/api/v1/weddings/${p2}/tasks/generate`).send({ subtype: 'DAY_OF' }).expect(201));
    expect(dayOf.created).toBe(DAY_OF_ITEMS.length);
    expect(dayOf.created).toBeLessThan(partial.created);
    // a FULL_SERVICE wedding cannot use the Day-of subtype
    await prisma.wedding.update({ where: { id: p2 }, data: { packageType: 'FULL_SERVICE' } });
    await ag.neha.post(`/api/v1/weddings/${p2}/tasks/generate`).send({ subtype: 'DAY_OF' }).expect(400);
  });
});

// =====================================================================================================================================
let rfq: any;
describe('2. procurement sequence (RFQ after agreement, selection closes competitors)', () => {
  it('RFQs on an unsigned wedding are prepared as DRAFT: invisible to vendors, cannot be sent or answered', async () => {
    const w = d(await ag.arjun.post('/api/v1/weddings').send({ brideName: 'U', groomName: `${RUN} Unsigned`, location: 'Goa', startDate: new Date(Date.now() + 80 * day).toISOString(), expectedGuests: 200, packageType: 'FULL_SERVICE', budget: 5000000, contractValue: 4000000 }).expect(201));
    ids.U = w.id; made.weddings.push(w.id); made.couples.push(w.coupleId);
    const r = d(await ag.arjun.post('/api/v1/quotations/requests').send({ weddingId: ids.U, category: 'CATERING', title: `${RUN} prepared`, vendorIds: [ids.v1, ids.v2, ids.v3] }).expect(201));
    expect(r.requests.map((x: any) => x.status)).toEqual(['DRAFT', 'DRAFT', 'DRAFT']);
    const vendorRfqs = d(await ag.vendor1.get('/api/v1/portal/vendor/rfqs').expect(200));
    expect(vendorRfqs.rfqs.some((x: any) => x.id === r.requests[0].id)).toBe(false);
    await ag.vendor1.get(`/api/v1/portal/vendor/rfqs/${r.requests.find((x: any) => x.vendorId === ids.v1).id}`).expect(404);
    await ag.arjun.post(`/api/v1/quotations/requests/${r.requests[0].id}/quotation`).send({ guests: 100, items: [lineItem('Plate', 100, 900)] }).expect(409);
    const send = await ag.arjun.post(`/api/v1/quotations/requests/group/${r.rfqGroup}/send`).expect(409);
    expect(send.body.error.reason).toBe('AGREEMENT_NOT_SIGNED');
    // a quotation cannot be selected on an unsigned wedding either
    expect(await prisma.quotation.count({ where: { request: { weddingId: ids.U } } })).toBe(0);
  });

  it('after signing, a prepared RFQ can be sent; a signed wedding sends immediately; vendors then see it', async () => {
    const a = d(await ag.arjun.post(`/api/v1/weddings/${ids.U}/agreements`).send({}).expect(201));
    await ag.arjun.post(`/api/v1/agreements/${a.id}/sign`).send({ signerName: 'U Client', signerRole: 'CLIENT', signatureData: SIG }).expect(201);
    const group = (await prisma.quotationRequest.findFirstOrThrow({ where: { weddingId: ids.U } })).rfqGroup;
    const sent = d(await ag.arjun.post(`/api/v1/quotations/requests/group/${group}/send`).expect(201));
    expect(sent.requests.every((x: any) => x.status === 'SENT')).toBe(true);
    await ag.arjun.post(`/api/v1/quotations/requests/group/${group}/send`).expect(201); // idempotent
    const vendorRfqs = d(await ag.vendor1.get('/api/v1/portal/vendor/rfqs').expect(200));
    expect(vendorRfqs.rfqs.some((x: any) => x.title === `${RUN} prepared`)).toBe(true);
  });

  it('comparison -> client selection -> planner selection; selecting closes competing RFQs with decision history', async () => {
    // wedding A is signed + confirmed; three caterers quote
    rfq = d(await ag.neha.post('/api/v1/quotations/requests').send({ weddingId: ids.A, category: 'CATERING', title: `${RUN} catering`, vendorIds: [ids.v1, ids.v2, ids.v3] }).expect(201));
    expect(rfq.requests.every((x: any) => x.status === 'SENT')).toBe(true);
    const byVendor = (v: string) => rfq.requests.find((x: any) => x.vendorId === v).id;
    const quotes: Record<string, any> = {};
    // vendor 1 answers through its own portal, the other two are entered by the planner
    quotes.v1 = d(await ag.vendor1.post(`/api/v1/portal/vendor/rfqs/${byVendor(ids.v1)}/quotation`).send({ guests: 300, guestCapacity: 500, items: [lineItem('Banquet plate', 300, 1200)] }).expect(201));
    quotes.v2 = d(await ag.neha.post(`/api/v1/quotations/requests/${byVendor(ids.v2)}/quotation`).send({ guests: 300, guestCapacity: 500, items: [lineItem('Banquet plate', 300, 1300)] }).expect(201));
    quotes.v3 = d(await ag.neha.post(`/api/v1/quotations/requests/${byVendor(ids.v3)}/quotation`).send({ guests: 300, guestCapacity: 500, items: [lineItem('Banquet plate', 300, 1100)] }).expect(201));
    // transition table: RECEIVED -> UNDER_REVIEW -> COMPARED ok, COMPARED -> SENT illegal
    await ag.neha.post(`/api/v1/quotations/${quotes.v1.id}/status`).send({ status: 'UNDER_REVIEW' }).expect(201);
    const bad = await ag.neha.post(`/api/v1/quotations/${quotes.v1.id}/status`).send({ status: 'SENT' }).expect(409);
    expect(bad.body.error.reason).toBe('ILLEGAL_TRANSITION');
    expect(bad.body.error.details).toMatchObject({ from: 'UNDER_REVIEW', to: 'SENT' });
    expect(d(await ag.neha.post(`/api/v1/quotations/requests/group/${rfq.rfqGroup}/compare`).expect(201)).compared).toBe(3);
    expect((await prisma.quotation.findUniqueOrThrow({ where: { id: quotes.v1.id } })).status).toBe('COMPARED');
    // the couple sees the comparison and records its preference
    const view = d(await ag.clientA.get('/api/v1/portal/client/vendors').expect(200));
    expect(view.comparisons).toHaveLength(1);
    expect(view.comparisons[0].options).toHaveLength(3);
    await ag.clientB.post('/api/v1/portal/client/vendors/selection').send({ quotationId: quotes.v3.id }).expect(403); // IDOR: another couple's quotation
    await ag.clientA.post('/api/v1/portal/client/vendors/selection').send({ quotationId: quotes.v3.id, note: 'We loved the tasting' }).expect(201);
    const cmp = d(await ag.neha.get(`/api/v1/weddings/${ids.A}/quotation-comparison?rfqGroup=${rfq.rfqGroup}`).expect(200));
    expect(cmp.clientSelection.quotationId).toBe(quotes.v3.id);
    // planner awards the client's choice
    const sel = d(await ag.neha.post(`/api/v1/quotations/${quotes.v3.id}/select`).send({ note: 'Client choice' }).expect(201));
    expect(sel.closedRequests).toBe(2);
    expect(sel.clientSelectedThisVendor).toBe(true);
    const rows = await prisma.quotationRequest.findMany({ where: { rfqGroup: rfq.rfqGroup }, include: { quotation: true } });
    expect(rows.map((r) => `${r.status}/${r.quotation?.status}`).sort()).toEqual(['CLOSED/REJECTED', 'CLOSED/REJECTED', 'SELECTED/SELECTED']);
    const history = await prisma.activityLog.findMany({ where: { weddingId: ids.A, entity: 'QuotationRequest', action: 'rfq.close' } });
    expect(history).toHaveLength(2);
    expect(await prisma.weddingVendor.count({ where: { weddingId: ids.A, vendorId: ids.v3 } })).toBe(1);
    await ag.neha.post(`/api/v1/quotations/${quotes.v1.id}/select`).send({}).expect(409); // decision is final
    await ag.neha.post(`/api/v1/quotations/${quotes.v2.id}/status`).send({ status: 'COMPARED' }).expect(409); // closed quotes do not move
  });

  it('the expiry job is job-safe: only open quotes expire, decisions are untouched, re-running is a no-op', async () => {
    const svc = app.get(QuotationsService);
    const past = new Date(Date.now() - day);
    await prisma.quotation.updateMany({ where: { request: { rfqGroup: rfq.rfqGroup } }, data: { validUntil: past } }); // decided group: SELECTED / REJECTED must survive
    const open = d(await ag.neha.post('/api/v1/quotations/requests').send({ weddingId: ids.A, category: 'CATERING', title: `${RUN} stale`, vendorIds: [ids.v1, ids.v2, ids.v3] }).expect(201));
    const q = d(await ag.neha.post(`/api/v1/quotations/requests/${open.requests[0].id}/quotation`).send({ guests: 100, items: [lineItem('Plate', 100, 500)], validUntil: new Date(Date.now() + day).toISOString() }).expect(201));
    await prisma.quotation.update({ where: { id: q.id }, data: { validUntil: past } });
    const r1 = await svc.expireStale();
    expect(r1.quotations).toBeGreaterThanOrEqual(1);
    expect((await prisma.quotation.findUniqueOrThrow({ where: { id: q.id } })).status).toBe('EXPIRED');
    expect((await prisma.quotationRequest.findUniqueOrThrow({ where: { id: open.requests[0].id } })).status).toBe('EXPIRED');
    const group = await prisma.quotationRequest.findMany({ where: { rfqGroup: rfq.rfqGroup }, include: { quotation: true } });
    expect(group.map((r) => r.status).sort()).toEqual(['CLOSED', 'CLOSED', 'SELECTED']);
    expect(group.find((r) => r.status === 'SELECTED')!.quotation!.status).toBe('SELECTED');
    const r2 = await svc.expireStale();
    expect(r2.quotations).toBe(0);
    await ag.neha.post(`/api/v1/quotations/requests/${open.requests[0].id}/quotation`).send({ guests: 100, items: [lineItem('Plate', 100, 500)] }).expect(409); // expired RFQ no longer accepts quotes
  });

  it('agreement expiry is job-safe too', async () => {
    const svc = app.get(AgreementsService);
    const a = d(await ag.arjun.post(`/api/v1/weddings/${ids.U}/agreements`).send({}).expect(201)); // v2, SENT
    await prisma.agreement.update({ where: { id: a.id }, data: { expiresAt: new Date(Date.now() - day) } });
    expect((await svc.expireStale()).expired).toBeGreaterThanOrEqual(1);
    expect((await prisma.agreement.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('EXPIRED');
    await ag.arjun.post(`/api/v1/agreements/${a.id}/sign`).send({ signerName: 'Late', signerRole: 'CLIENT', signatureData: SIG }).expect(409);
    expect((await svc.expireStale()).expired).toBe(0);
    // the earlier SIGNED version is untouched and still opens the gate
    expect(await prisma.agreement.count({ where: { weddingId: ids.U, status: 'SIGNED' } })).toBe(1);
  });
});

// =====================================================================================================================================
describe('3. state machines enforced over HTTP (409)', () => {
  it('enquiry: LOST can be reopened but not jumped to a proposal; CONVERTED is only via convert', async () => {
    const e = d(await ag.neha.post('/api/v1/enquiries').send({ brideName: 'SM', groomName: `${RUN} SM`, source: 'PHONE' }).expect(201));
    made.enquiries.push(e.id); made.couples.push(e.coupleId);
    await ag.neha.patch(`/api/v1/enquiries/${e.id}`).send({ stage: 'LOST', lostReason: 'Budget' }).expect(200);
    await ag.neha.patch(`/api/v1/enquiries/${e.id}`).send({ stage: 'PROPOSAL_SENT' }).expect(409);
    await ag.neha.patch(`/api/v1/enquiries/${e.id}`).send({ stage: 'NEW' }).expect(200);
    await ag.neha.patch(`/api/v1/enquiries/${e.id}`).send({ stage: 'CONVERTED' }).expect(400);
  });

  it('agreement: a rejected agreement cannot be signed; REJECTED is final', async () => {
    const a = d(await ag.arjun.post(`/api/v1/weddings/${ids.U}/agreements`).send({}).expect(201));
    await ag.arjun.post(`/api/v1/agreements/${a.id}/reject`).send({ reason: 'Terms' }).expect(201);
    await ag.arjun.post(`/api/v1/agreements/${a.id}/sign`).send({ signerName: 'X Y', signerRole: 'CLIENT', signatureData: SIG }).expect(409);
    await ag.arjun.post(`/api/v1/agreements/${a.id}/reject`).send({}).expect(409);
  });

  it('task: BLOCKED must be unblocked before DONE; overdue is derived, not stored', async () => {
    const t = (await prisma.weddingTask.findMany({ where: { weddingId: ids.A, dependsOn: { none: {} } }, take: 1 }))[0];
    await ag.neha.patch(`/api/v1/tasks/${t.id}`).send({ status: 'BLOCKED' }).expect(200);
    await ag.neha.patch(`/api/v1/tasks/${t.id}`).send({ status: 'DONE' }).expect(409);
    await prisma.weddingTask.update({ where: { id: t.id }, data: { dueDate: new Date(Date.now() - day) } });
    const list = d(await ag.neha.get(`/api/v1/weddings/${ids.A}/tasks?pageSize=200`));
    expect(list.find((x: any) => x.id === t.id).overdue).toBe(true);
    expect(list.find((x: any) => x.id === t.id).status).toBe('BLOCKED'); // stored status is still BLOCKED
    await ag.neha.patch(`/api/v1/tasks/${t.id}`).send({ status: 'IN_PROGRESS' }).expect(200);
    await ag.neha.patch(`/api/v1/tasks/${t.id}`).send({ status: 'DONE' }).expect(200);
    expect(d(await ag.neha.get(`/api/v1/weddings/${ids.A}/tasks?pageSize=200`)).find((x: any) => x.id === t.id).overdue).toBe(false);
  });

  it('vendor arrival and incident follow their chains', async () => {
    await ag.neha.post('/api/v1/weddings/' + ids.A + '/assign').send({ userId: await userId('priya@royalknot.local') }).expect(201);
    const wv = await prisma.weddingVendor.findFirstOrThrow({ where: { weddingId: ids.A } });
    const arrive = (status: string, extra: any = {}) => ag.priya.post(`/api/v1/wedding-vendors/${wv.id}/arrival`).send({ status, ...extra });
    await arrive('COMPLETED', { expectedAt: new Date().toISOString() }).expect(201); // the first record may start in any state
    await arrive('ARRIVED').expect(409); // COMPLETED is final
    const inc = d(await ag.priya.post(`/api/v1/weddings/${ids.A}/incidents`).send({ title: 'Power cut', description: 'Generator down', severity: 'HIGH' }).expect(201));
    await ag.priya.patch(`/api/v1/incidents/${inc.id}`).send({ status: 'CLOSED' }).expect(409);
    await ag.priya.patch(`/api/v1/incidents/${inc.id}`).send({ status: 'ASSIGNED' }).expect(409); // REPORTED -> ASSIGNED skips TRIAGED
    await ag.priya.patch(`/api/v1/incidents/${inc.id}`).send({ status: 'TRIAGED' }).expect(200);
    await ag.priya.patch(`/api/v1/incidents/${inc.id}`).send({ status: 'ASSIGNED' }).expect(400); // needs an assignee
  });

  it('legacy wedding status cannot confirm or fast-forward a draft; a confirmed wedding can move forward', async () => {
    await ag.arjun.patch(`/api/v1/weddings/${ids.U}/status`).send({ status: 'COMPLETED' }).expect(409);
    await ag.neha.patch(`/api/v1/weddings/${ids.U}/status`).send({ status: 'VENDOR_BOOKING' }).expect(403); // neha is not assigned to arjun's wedding
    await ag.arjun.patch(`/api/v1/weddings/${ids.U}/status`).send({ status: 'VENDOR_BOOKING' }).expect(200);
    expect((await prisma.wedding.findUniqueOrThrow({ where: { id: ids.U } })).bookingStatus).not.toBe('CONFIRMED');
    await ag.neha.patch(`/api/v1/weddings/${ids.A}/status`).send({ status: 'EVENT_DAY' }).expect(200);
    const w = await prisma.wedding.findUniqueOrThrow({ where: { id: ids.A } });
    expect([w.executionStage, w.status, w.bookingStatus]).toEqual(['EVENT_DAY', 'EVENT_DAY', 'CONFIRMED']);
    await ag.neha.patch(`/api/v1/weddings/${ids.A}/status`).send({ status: 'PLANNING' }).expect(200);
  });
});

// =====================================================================================================================================
describe('4. security: socket rooms, assignment scoping, IDOR', () => {
  beforeAll(async () => {
    // wedding B (couple B) planned by arjun, with vendor 4 booked on it
    const w = d(await ag.arjun.post('/api/v1/weddings').send({ coupleId: ids.coupleB, location: 'Delhi', startDate: new Date(Date.now() + 70 * day).toISOString(), expectedGuests: 150, packageType: 'FULL_SERVICE', budget: 3000000, contractValue: 2500000 }).expect(201));
    ids.B = w.id; made.weddings.push(w.id);
    await prisma.weddingVendor.create({ data: { weddingId: ids.B, vendorId: ids.v4, category: 'CATERING', contractAmount: 100000 } });
  });

  it('socket rooms are authorised per wedding (client own, vendor booked/invited, staff assigned)', async () => {
    expect((await join('clientA', ids.A)).ok).toBe(true);
    expect((await join('clientA', ids.B))).toMatchObject({ ok: false, error: 'forbidden' });
    expect((await join('clientB', ids.A))).toMatchObject({ ok: false, error: 'forbidden' });
    expect((await join('clientB', ids.B)).ok).toBe(true);
    expect((await join('vendor1', ids.A)).ok).toBe(true); // invited on A's RFQ
    expect((await join('vendor1', ids.B))).toMatchObject({ ok: false });
    expect((await join('vendor4', ids.A))).toMatchObject({ ok: false });
    expect((await join('vendor4', ids.B)).ok).toBe(true);
    expect((await join('neha', ids.A)).ok).toBe(true);
    expect((await join('neha', ids.B))).toMatchObject({ ok: false, error: 'forbidden' });
    expect((await join('arjun', ids.A))).toMatchObject({ ok: false });
    expect((await join('vikram', ids.A))).toMatchObject({ ok: false }); // operations: not assigned yet
    expect((await join('priya', ids.A)).ok).toBe(true); // event manager assigned in section 3
    expect((await join('founder', ids.B)).ok).toBe(true);
    expect((await join('meera', ids.B)).ok).toBe(true); // finance sees all
    expect((await join('founder', 'not-a-uuid'))).toMatchObject({ ok: false });
    expect((await join('founder', '00000000-0000-4000-8000-000000000000'))).toMatchObject({ ok: false });
  });

  it('a cross-wedding socket receives no broadcasts from a wedding it may not join', async () => {
    const s: Socket = io(`${url}/live`, { extraHeaders: { cookie: cookie.clientB }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((res, rej) => { s.on('connect', () => res()); s.on('connect_error', rej); });
    const ack: any = await new Promise((r) => s.emit('join', { weddingId: ids.A }, r));
    expect(ack.ok).toBe(false);
    let leaked = false; s.on('task.updated', () => { leaked = true; });
    const t = await prisma.weddingTask.findFirstOrThrow({ where: { weddingId: ids.A, status: { not: 'DONE' } } });
    await ag.neha.patch(`/api/v1/tasks/${t.id}`).send({ status: 'IN_PROGRESS' }).expect(200);
    await new Promise((r) => setTimeout(r, 400));
    s.close();
    expect(leaked).toBe(false);
  });

  it('staff only see assigned weddings: lists and every id route (IDOR) for unassigned planner arjun', async () => {
    const list = d(await ag.arjun.get('/api/v1/weddings?pageSize=100'));
    expect(list.some((w: any) => w.id === ids.A)).toBe(false);
    expect(list.some((w: any) => w.id === ids.B)).toBe(true);
    const task = await prisma.weddingTask.findFirstOrThrow({ where: { weddingId: ids.A } });
    const guest = await prisma.guest.create({ data: { weddingId: ids.A, name: `${RUN} guest` } });
    const fn = await prisma.weddingEvent.findFirstOrThrow({ where: { weddingId: ids.A } });
    const wv = await prisma.weddingVendor.findFirstOrThrow({ where: { weddingId: ids.A } });
    const gets = [
      `/weddings/${ids.A}`, `/weddings/${ids.A}/tasks`, `/weddings/${ids.A}/guests`, `/weddings/${ids.A}/guests/stats`, `/weddings/${ids.A}/event`, `/weddings/${ids.A}/events`, `/weddings/${ids.A}/activity`,
      `/weddings/${ids.A}/agreements`, `/agreements/${ids.agrA}`, `/proposals/${ids.propA}`, `/weddings/${ids.A}/vendors`, `/weddings/${ids.A}/quotation-comparison`,
      `/documents?weddingId=${ids.A}`, `/documents/${ids.floorPlan}`, `/events/functions/${fn.id}`, `/events/functions?weddingId=${ids.A}`, `/quotations/requests/${rfq.requests[0].id}`,
      `/tasks?weddingId=${ids.A}`, `/events/incidents?weddingId=${ids.A}`, `/weddings/${ids.A}/readiness`,
    ];
    for (const g of gets) { const r = await ag.arjun.get(`/api/v1${g}`); expect([g, r.status]).toEqual([g, 403]); }
    const writes: [string, string, any][] = [
      ['patch', `/tasks/${task.id}`, { status: 'IN_PROGRESS' }], ['patch', `/guests/${guest.id}`, { name: 'x' }], ['post', `/guests/${guest.id}/checkin`, {}], ['patch', `/weddings/${ids.A}`, { theme: 'x' }],
      ['post', `/weddings/${ids.A}/confirm`, {}], ['post', `/weddings/${ids.A}/guests`, { name: 'x' }], ['post', `/weddings/${ids.A}/tasks/generate`, {}], ['patch', `/weddings/${ids.A}/status`, { status: 'PLANNING' }],
      ['post', `/wedding-vendors/${wv.id}/arrival`, { status: 'ON_THE_WAY', expectedAt: new Date().toISOString() }], ['post', `/weddings/${ids.A}/incidents`, { title: 'x', description: 'y' }],
      ['post', `/weddings/${ids.A}/timeline`, { title: 'x', scheduledAt: new Date().toISOString() }], ['post', `/agreements/${ids.agrA}/sign`, { signerName: 'Zed Zed', signerRole: 'PLANNER', signatureData: SIG }],
      ['post', `/proposals/${ids.propA}/respond`, { status: 'DECLINED' }], ['post', `/weddings/${ids.A}/assign`, { userId: ids.coupleA }],
    ];
    for (const [m, p, b] of writes) { const r = await (ag.arjun as any)[m](`/api/v1${p}`).send(b); expect([m, p, r.status]).toEqual([m, p, 403]); }
    await prisma.guest.delete({ where: { id: guest.id } });
  });

  it('OPERATIONS only works on assigned weddings and its own tasks', async () => {
    await ag.vikram.get(`/api/v1/weddings/${ids.A}`).expect(403);
    await ag.neha.post(`/api/v1/weddings/${ids.A}/assign`).send({ userId: await userId('vikram@royalknot.local') }).expect(201);
    await ag.vikram.get(`/api/v1/weddings/${ids.A}`).expect(200);
    const mine = d(await ag.vikram.get('/api/v1/tasks?pageSize=200'));
    expect(mine.length).toBeGreaterThan(0);
    const vid = await userId('vikram@royalknot.local');
    expect(mine.every((t: any) => t.ownerId === vid)).toBe(true);
    const other = await prisma.weddingTask.findFirstOrThrow({ where: { weddingId: ids.A, NOT: { ownerId: vid } } });
    await ag.vikram.patch(`/api/v1/tasks/${other.id}`).send({ status: 'IN_PROGRESS' }).expect(403);
    await ag.vikram.get('/api/v1/weddings/' + ids.B).expect(403);
    expect(d(await ag.vikram.get('/api/v1/weddings?pageSize=100')).every((w: any) => w.id !== ids.B)).toBe(true);
  });

  it('clients and vendors stay inside their own wedding / vendor record', async () => {
    await ag.clientA.get(`/api/v1/portal/client/vendors?weddingId=${ids.B}`).expect(403);
    await ag.clientB.get(`/api/v1/portal/client/vendors?weddingId=${ids.A}`).expect(403);
    await ag.clientB.get(`/api/v1/portal/client/documents/${ids.floorPlan}/download`).expect(404);
    const v1q = await prisma.quotationRequest.findFirstOrThrow({ where: { weddingId: ids.A, vendorId: ids.v1 } });
    await ag.vendor4.get(`/api/v1/portal/vendor/rfqs/${v1q.id}`).expect(404);
    await ag.vendor4.post(`/api/v1/portal/vendor/rfqs/${v1q.id}/quotation`).send({ guests: 10, items: [{ name: 'x', quantity: 1, unit: 'plate', unitPrice: 10 }] }).expect(404);
    await ag.clientA.post(`/api/v1/weddings/${ids.A}/confirm`).expect(403); // clients cannot confirm bookings
    await ag.vendor1.post(`/api/v1/weddings/${ids.A}/confirm`).expect(403);
  });

  it('founder and finance see weddings regardless of assignment', async () => {
    for (const who of ['founder', 'meera']) {
      expect((await ag[who].get(`/api/v1/weddings/${ids.A}`)).status).toBe(200);
      expect((await ag[who].get(`/api/v1/weddings/${ids.B}`)).status).toBe(200);
    }
  });
});
