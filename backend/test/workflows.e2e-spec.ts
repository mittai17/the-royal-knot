/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configure } from '../src/main';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'RoyalKnot@2026';
const prisma = new PrismaClient();
const RUN = `E2E-${Date.now()}`;
const key = (s: string) => `${RUN}-${s}`;

let app: INestApplication;
let url: string;
const agents: Record<string, ReturnType<typeof request.agent>> = {};
const cookies: Record<string, string> = {};
const created = { weddings: [] as string[], couples: [] as string[], enquiries: [] as string[], users: [] as string[] };

async function login(who: string) {
  const agent = request.agent(url);
  const res = await agent.post('/api/v1/auth/login').send({ email: `${who}@royalknot.local`, password: PASSWORD }).expect(200);
  agents[who] = agent;
  cookies[who] = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  return res;
}
const d = (r: request.Response) => r.body.data;

beforeAll(async () => {
  process.env.DISABLE_JOBS = 'true';
  process.env.AUTH_RATE_LIMIT = '1000';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configure(app);
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  for (const who of ['founder', 'neha', 'meera', 'priya', 'vikram']) await login(who);
});

afterAll(async () => {
  await prisma.weddingVendor.updateMany({ where: { weddingId: { in: created.weddings } }, data: {} });
  await prisma.wedding.deleteMany({ where: { id: { in: created.weddings } } });
  await prisma.enquiry.deleteMany({ where: { id: { in: created.enquiries } } });
  await prisma.couple.deleteMany({ where: { id: { in: created.couples } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.$disconnect();
  await app.close();
});

describe('1. authentication & roles', () => {
  it('rejects bad credentials with a generic message', async () => {
    const r = await request(url).post('/api/v1/auth/login').send({ email: 'founder@royalknot.local', password: 'wrong-password' }).expect(401);
    expect(r.body.error.message).toBe('Invalid email or password');
  });
  it('sets HttpOnly cookies and never returns the password hash', async () => {
    const r = await request(url).post('/api/v1/auth/login').send({ email: 'neha@royalknot.local', password: PASSWORD }).expect(200);
    const set = (r.headers['set-cookie'] as unknown as string[]).join('|');
    expect(set).toMatch(/access_token=.*HttpOnly/i);
    expect(set).toMatch(/refresh_token=.*HttpOnly/i);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|argon2/);
  });
  it('protects routes without a session', async () => {
    await request(url).get('/api/v1/weddings').expect(401);
    const me = await agents.neha.get('/api/v1/auth/me').expect(200);
    expect(d(me).user.role).toBe('PLANNER');
  });
  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const a = request.agent(url);
    const first = await a.post('/api/v1/auth/login').send({ email: 'sana@royalknot.local', password: PASSWORD }).expect(200);
    const oldRefresh = (first.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='))!.split(';')[0];
    const rotated = await a.post('/api/v1/auth/refresh').expect(200);
    const newRefresh = (rotated.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='))!.split(';')[0];
    expect(newRefresh).not.toBe(oldRefresh);
    await request(url).post('/api/v1/auth/refresh').set('Cookie', oldRefresh).expect(401); // reuse detected
    await request(url).post('/api/v1/auth/refresh').set('Cookie', newRefresh).expect(401); // whole family revoked
  });
  it('enforces role permissions', async () => {
    await agents.meera.post('/api/v1/enquiries').send({ brideName: 'A', groomName: 'B', source: 'PHONE' }).expect(403);
    const w = (await agents.founder.get('/api/v1/weddings?pageSize=1')).body.data[0];
    await agents.vikram.get(`/api/v1/weddings/${w.id}/payments`).expect(403);
    await agents.neha.post('/api/v1/users').send({ email: 'x@y.com', name: 'X Y', role: 'PLANNER', password: 'Abcdefghi1' }).expect(403);
    await agents.vikram.get('/api/v1/analytics/overview').expect(403);
  });
  it('blocks cross-origin state-changing requests (CSRF origin check)', async () => {
    await agents.neha.post('/api/v1/enquiries').set('Origin', 'https://evil.example').send({ brideName: 'A', groomName: 'B', source: 'PHONE' }).expect(403);
  });
  it('admin can create a user, who must then change password; sessions rotate', async () => {
    const email = `${RUN.toLowerCase()}@royalknot.local`;
    const u = d(await agents.founder.post('/api/v1/users').send({ email, name: 'E2E Temp', role: 'OPERATIONS', password: 'TempPassw0rd!' }).expect(201));
    created.users.push(u.id);
    expect(u.mustChangePassword).toBe(true);
    const a = request.agent(url);
    await a.post('/api/v1/auth/login').send({ email, password: 'TempPassw0rd!' }).expect(200);
    await a.post('/api/v1/auth/change-password').send({ currentPassword: 'wrong', newPassword: 'NewPassw0rd!x' }).expect(401);
    await a.post('/api/v1/auth/change-password').send({ currentPassword: 'TempPassw0rd!', newPassword: 'weak' }).expect(400);
    await a.post('/api/v1/auth/change-password').send({ currentPassword: 'TempPassw0rd!', newPassword: 'NewPassw0rd!x' }).expect(200);
    await request(url).post('/api/v1/auth/login').send({ email, password: 'TempPassw0rd!' }).expect(401);
    await request(url).post('/api/v1/auth/login').send({ email, password: 'NewPassw0rd!x' }).expect(200);
    await agents.founder.patch(`/api/v1/users/${u.id}`).send({ status: 'DISABLED' }).expect(200);
    await request(url).post('/api/v1/auth/login').send({ email, password: 'NewPassw0rd!x' }).expect(401);
  });
});

// shared state for the wedding lifecycle
let enquiryId: string;
let weddingId: string;
let agreementId: string;
let caterers: any[];
let rfqGroup: string;
let winningQuoteId: string;
let cateringWvId: string;

describe('2. enquiry → wedding', () => {
  it('creates an enquiry with activity history and assignment', async () => {
    const r = await agents.neha.post('/api/v1/enquiries').send({ brideName: 'Test Bride', groomName: `${RUN} Groom`, phone: '+91 90000 00000', source: 'INSTAGRAM', location: 'Jaipur', guestCount: 400, budget: 15000000, packageType: 'FULL_SERVICE', theme: 'Winter palace', followUpAt: new Date(Date.now() - 3600e3).toISOString() }).expect(201);
    enquiryId = d(r).id; created.enquiries.push(enquiryId); created.couples.push(d(r).coupleId);
    expect(d(r).stage).toBe('NEW');
    const one = d(await agents.neha.get(`/api/v1/enquiries/${enquiryId}`));
    expect(one.activities.length).toBeGreaterThan(0);
  });
  it('supports search, filters, sorting and pagination', async () => {
    const r = await agents.neha.get(`/api/v1/enquiries?search=${RUN}&stage=NEW&sort=createdAt&order=desc&page=1&pageSize=5`).expect(200);
    expect(r.body.meta.total).toBe(1);
    const due = await agents.neha.get('/api/v1/enquiries?followUpDue=true&pageSize=100').expect(200);
    expect(due.body.data.some((e: any) => e.id === enquiryId)).toBe(true);
  });
  it('refuses to confirm without converting, then converts atomically', async () => {
    await agents.neha.patch(`/api/v1/enquiries/${enquiryId}`).send({ stage: 'CONFIRMED' }).expect(400);
    await agents.neha.patch(`/api/v1/enquiries/${enquiryId}`).send({ stage: 'PROPOSAL_SENT' }).expect(200);
    const start = new Date(Date.now() + 90 * 864e5).toISOString();
    const r = await agents.neha.post(`/api/v1/enquiries/${enquiryId}/convert`).send({ name: `${RUN} Wedding`, venue: 'Jaipur Palace', startDate: start, contractValue: 13500000, expectedGuests: 400 }).expect(201);
    weddingId = d(r).id; created.weddings.push(weddingId);
    expect(d(r).events.length).toBeGreaterThanOrEqual(3);
    expect(d(r).finance.milestones.map((m: any) => m.type).sort()).toEqual(['ADVANCE', 'BOOKING', 'FINAL']);
    const m = Object.fromEntries(d(r).finance.milestones.map((x: any) => [x.type, Number(x.expectedAmount)]));
    expect(m.BOOKING + m.ADVANCE + m.FINAL).toBe(13500000);
    const after = d(await agents.neha.get(`/api/v1/enquiries/${enquiryId}`));
    expect(after.stage).toBe('CONFIRMED');
    expect(after.convertedWeddingId).toBe(weddingId);
    await agents.neha.post(`/api/v1/enquiries/${enquiryId}/convert`).send({}).expect(409);
  });
});

describe('3. digital agreement', () => {
  const sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  it('generates a versioned agreement from the template with live values', async () => {
    const r = await agents.neha.post(`/api/v1/weddings/${weddingId}/agreements`).send({}).expect(201);
    agreementId = d(r).id;
    expect(d(r).content).toContain('₹1,35,00,000');
    expect(d(r).content).toContain('Booking payment');
    const v2 = d(await agents.neha.post(`/api/v1/weddings/${weddingId}/agreements`).send({}).expect(201));
    expect(v2.version).toBe(2);
    const list = d(await agents.neha.get(`/api/v1/weddings/${weddingId}/agreements`));
    expect(list.find((a: any) => a.id === agreementId).status).toBe('VOID'); // superseded, history preserved
    agreementId = v2.id;
  });
  it('rejects non-PNG signatures and captures a valid signature, storing the signed PDF', async () => {
    await agents.neha.post(`/api/v1/agreements/${agreementId}/sign`).send({ signerName: 'Client', signerRole: 'CLIENT', signatureData: 'javascript:alert(1)' }).expect(400);
    const r = await agents.neha.post(`/api/v1/agreements/${agreementId}/sign`).send({ signerName: 'Rohan Mehta', signerRole: 'CLIENT', signatureData: sig }).expect(201);
    expect(d(r).status).toBe('SIGNED');
    expect(d(r).signatures).toHaveLength(1);
    await agents.neha.post(`/api/v1/agreements/${agreementId}/sign`).send({ signerName: 'Again', signerRole: 'CLIENT', signatureData: sig }).expect(409);
    const docs = d(await agents.neha.get(`/api/v1/documents?weddingId=${weddingId}&category=AGREEMENT`));
    expect(docs.length).toBeGreaterThan(0);
    const pdf = await agents.neha.get(`/api/v1/documents/${docs[0].id}/download`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

const item = (name: string, qty: number, price: number, tax = 5, extra: any = {}) => ({ name, quantity: qty, unit: 'plate', unitPrice: price, taxRate: tax, ...extra });

describe('4. vendor quotation comparison & selection', () => {
  it('requires at least three vendors', async () => {
    caterers = d(await agents.neha.get('/api/v1/vendors?category=CATERING&pageSize=10')).slice(0, 4);
    await agents.neha.post('/api/v1/quotations/requests').send({ weddingId, category: 'CATERING', title: 'x', vendorIds: caterers.slice(0, 2).map((v) => v.id) }).expect(400);
    await agents.neha.post('/api/v1/quotations/requests').send({ weddingId, category: 'DECORATION', title: 'wrong category', vendorIds: caterers.slice(0, 3).map((v) => v.id) }).expect(400);
  });
  it('collects three structured quotes and compares them side by side', async () => {
    const r = await agents.neha.post('/api/v1/quotations/requests').send({ weddingId, category: 'CATERING', title: `${RUN} catering`, vendorIds: caterers.slice(0, 3).map((v) => v.id) }).expect(201);
    rfqGroup = d(r).rfqGroup;
    const reqs = d(r).requests as any[];
    const specs = [
      { rate: 1100, cap: 380, rating: 3, lines: [item('Banquet plate', 400, 1100), item('Live counters', 6, 25000, 18, { included: false })] },
      { rate: 1350, cap: 500, rating: 4, lines: [item('Banquet plate', 400, 1350), item('Live counters', 4, 28000, 18)] },
      { rate: 1200, cap: 600, rating: 5, lines: [item('Banquet plate', 400, 1200), item('Live counters', 6, 25000, 18), item('Captain', 1, 40000, 18)] },
    ];
    const quotes: any[] = [];
    for (const [i, s] of specs.entries()) {
      const q = d(await agents.neha.post(`/api/v1/quotations/requests/${reqs[i].id}/quotation`).send({ guests: 400, guestCapacity: s.cap, ratePerPlate: s.rate, rating: s.rating, items: s.lines }).expect(201));
      quotes.push(q);
    }
    // quote 3: 480000 + 150000 + 40000 = 670000 ; tax 24000 + 27000 + 7200 = 58200 → 728200
    expect(quotes[2].grandTotal).toBe('728200');
    expect(quotes[2].pricePerPlate).toBe('1820.5');
    // quote 1 excludes counters from totals: 440000 + 22000 = 462000
    expect(quotes[0].grandTotal).toBe('462000');
    winningQuoteId = quotes[2].id;
    const cmp = d(await agents.neha.get(`/api/v1/weddings/${weddingId}/quotation-comparison?category=CATERING`).expect(200));
    expect(cmp.quotations).toHaveLength(3);
    const flags = Object.fromEntries(cmp.quotations.map((q: any) => [q.quotationId, q.flags]));
    expect(flags[quotes[0].id].lowest).toBe(true);
    expect(flags[quotes[2].id].recommended).toBe(true); // cheapest is over capacity, so NOT recommended
    expect(flags[quotes[0].id].recommended).toBe(false);
    expect(cmp.quotations.find((q: any) => q.quotationId === quotes[0].id).capacityOk).toBe(false);
  });
  it('selects the winner transactionally: accepts one, closes the rest, links the vendor', async () => {
    const r = await agents.neha.post(`/api/v1/quotations/${winningQuoteId}/select`).send({ note: 'Best fit' }).expect(201);
    expect(d(r).closedRequests).toBe(2);
    const cmp = d(await agents.neha.get(`/api/v1/weddings/${weddingId}/quotation-comparison?rfqGroup=${rfqGroup}`));
    const statuses = cmp.quotations.map((q: any) => `${q.requestStatus}/${q.status}`).sort();
    expect(statuses).toEqual(['ACCEPTED/ACCEPTED', 'NOT_SELECTED/REJECTED', 'NOT_SELECTED/REJECTED']);
    expect(cmp.decided).toBe(true);
    const wvs = d(await agents.neha.get(`/api/v1/weddings/${weddingId}/vendors`));
    expect(wvs).toHaveLength(1);
    expect(wvs[0].contractAmount).toBe('728200');
    cateringWvId = wvs[0].id;
    const loser = cmp.quotations.find((q: any) => q.status === 'REJECTED');
    await agents.neha.post(`/api/v1/quotations/${loser.quotationId}/select`).send({}).expect(409); // decision is final
    const audit = d(await agents.founder.get(`/api/v1/audit?weddingId=${weddingId}&entity=Quotation`));
    expect(audit.some((a: any) => a.action === 'select')).toBe(true); // decision history preserved
  });
  it('only one of two concurrent selections can win', async () => {
    const raceWedding = d(await agents.neha.post('/api/v1/weddings').send({ brideName: 'Race Bride', groomName: `${RUN} Race`, location: 'Jaipur', startDate: new Date(Date.now() + 60 * 864e5).toISOString(), expectedGuests: 100, packageType: 'PARTIAL', budget: 1000000, contractValue: 900000 }).expect(201));
    created.weddings.push(raceWedding.id); created.couples.push(raceWedding.coupleId);
    const r = d(await agents.neha.post('/api/v1/quotations/requests').send({ weddingId: raceWedding.id, category: 'CATERING', title: `${RUN} race`, vendorIds: caterers.slice(0, 3).map((v) => v.id) }).expect(201));
    const qs: string[] = [];
    for (const req of r.requests.slice(0, 2)) qs.push(d(await agents.neha.post(`/api/v1/quotations/requests/${req.id}/quotation`).send({ guests: 400, items: [item('Plate', 400, 1000)] }).expect(201)).id);
    await agents.neha.post(`/api/v1/quotations/requests/${r.requests[2].id}/quotation`).send({ guests: 400, items: [item('Plate', 400, 1500)] }).expect(201);
    const results = await Promise.all(qs.map((id) => agents.neha.post(`/api/v1/quotations/${id}/select`).send({})));
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(await prisma.weddingVendor.count({ where: { weddingId: raceWedding.id } })).toBe(1);
    const accepted = await prisma.quotationRequest.count({ where: { rfqGroup: r.rfqGroup, status: 'ACCEPTED' } });
    expect(accepted).toBe(1);
  });
});

describe('5. staged client payments & automatic planning', () => {
  let bookingExpected: number;
  it('has no tasks before the booking payment', async () => {
    expect(d(await agents.neha.get(`/api/v1/weddings/${weddingId}/tasks`)).length).toBe(0);
    const p = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/payments`));
    bookingExpected = Number(p.milestones.find((m: any) => m.type === 'BOOKING').expectedAmount);
    expect(bookingExpected).toBe(2700000);
  });
  it('rejects over-payment and invalid amounts', async () => {
    await agents.meera.post('/api/v1/payments').send({ weddingId, milestone: 'BOOKING', amount: bookingExpected + 1, method: 'UPI', idempotencyKey: key('over') }).expect(422);
    await agents.meera.post('/api/v1/payments').send({ weddingId, milestone: 'BOOKING', amount: -5, method: 'UPI', idempotencyKey: key('neg') }).expect(400);
    await agents.neha.post('/api/v1/payments').send({ weddingId, milestone: 'BOOKING', amount: 100, method: 'UPI', idempotencyKey: key('role') }).expect(403);
  });
  it('records the booking payment, issues a receipt and generates >25 tasks', async () => {
    const r = await agents.meera.post('/api/v1/payments').send({ weddingId, milestone: 'BOOKING', amount: bookingExpected, method: 'BANK_TRANSFER', reference: 'NEFT-TEST', idempotencyKey: key('booking') }).expect(201);
    expect(d(r).duplicate).toBe(false);
    expect(d(r).milestoneStatus).toBe('PAID');
    expect(d(r).tasksGenerated.created).toBeGreaterThan(25);
    expect(d(r).payment.receiptNo).toMatch(/^RK-\d{8}-[0-9A-F]{6}$/);
    const rcpt = await agents.meera.get(`/api/v1/payments/${d(r).payment.id}/receipt`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect((rcpt.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
  it('is idempotent: the same key returns the original payment, nothing is double-booked', async () => {
    const again = await agents.meera.post('/api/v1/payments').send({ weddingId, milestone: 'BOOKING', amount: bookingExpected, method: 'BANK_TRANSFER', idempotencyKey: key('booking') }).expect(201);
    expect(d(again).duplicate).toBe(true);
    expect(await prisma.clientPayment.count({ where: { weddingId } })).toBe(1);
    await agents.meera.post('/api/v1/payments').send({ weddingId, milestone: 'BOOKING', amount: 1, method: 'UPI', idempotencyKey: key('overpaid') }).expect(422); // milestone already full
  });
  it('never generates duplicate tasks when the trigger runs again', async () => {
    const before = await prisma.weddingTask.count({ where: { weddingId } });
    const r = d(await agents.neha.post(`/api/v1/weddings/${weddingId}/tasks/generate`).send({}).expect(201));
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(before);
    const parallel = await Promise.all([1, 2, 3].map(() => agents.neha.post(`/api/v1/weddings/${weddingId}/tasks/generate`).send({})));
    parallel.forEach((x) => expect(x.status).toBe(201));
    expect(await prisma.weddingTask.count({ where: { weddingId } })).toBe(before);
    expect(before).toBeGreaterThan(25);
  });
  it('assigns owners, deadlines, dependencies, events and vendors', async () => {
    const tasks = d(await agents.neha.get(`/api/v1/weddings/${weddingId}/tasks?pageSize=200`));
    expect(tasks.every((t: any) => t.ownerId && t.dueDate && t.category && t.priority)).toBe(true);
    expect(new Set(tasks.map((t: any) => t.category)).size).toBe(15);
    expect(tasks.some((t: any) => t.dependsOn.length > 0)).toBe(true);
    expect(tasks.find((t: any) => t.templateKey === 'cater-headcount').vendorId).toBe(cateringWvId);
  });
  it('blocks completing a task whose dependency is unfinished, allows it after', async () => {
    const tasks = d(await agents.neha.get(`/api/v1/weddings/${weddingId}/tasks?pageSize=200`));
    const dependent = tasks.find((t: any) => t.templateKey === 'venue-book');
    await agents.neha.patch(`/api/v1/tasks/${dependent.id}`).send({ status: 'COMPLETED' }).expect(409);
    const dep = tasks.find((t: any) => t.templateKey === 'venue-shortlist');
    await agents.neha.patch(`/api/v1/tasks/${dep.id}`).send({ status: 'COMPLETED', evidenceNote: 'Site visit report filed' }).expect(200);
    const done = d(await agents.neha.patch(`/api/v1/tasks/${dependent.id}`).send({ status: 'COMPLETED' }).expect(200));
    expect(done.completedAt).toBeTruthy();
  });
  it('two concurrent payments cannot over-collect the advance milestone', async () => {
    const p = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/payments`));
    const adv = Number(p.milestones.find((m: any) => m.type === 'ADVANCE').expectedAmount);
    const rs = await Promise.all([1, 2].map((i) => agents.meera.post('/api/v1/payments').send({ weddingId, milestone: 'ADVANCE', amount: adv, method: 'UPI', idempotencyKey: key(`adv-${i}`) })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(Number(d(await agents.meera.get(`/api/v1/weddings/${weddingId}/payments`)).totals.received)).toBe(bookingExpected + adv);
  });
  it('duplicate concurrent submits with the SAME key create exactly one payment', async () => {
    const before = await prisma.clientPayment.count({ where: { weddingId } });
    const rs = await Promise.all([1, 2, 3].map(() => agents.meera.post('/api/v1/payments').send({ weddingId, milestone: 'FINAL', amount: 1000, method: 'UPI', idempotencyKey: key('final-dup') })));
    rs.forEach((r) => expect(r.status).toBe(201));
    expect(await prisma.clientPayment.count({ where: { weddingId } })).toBe(before + 1);
  });
});

describe('6. event command centre (persist → broadcast)', () => {
  let socket: Socket;
  let incidentId: string;
  beforeAll(async () => {
    socket = io(`${url}/live`, { extraHeaders: { cookie: cookies.priya }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((res, rej) => { socket.on('connect', () => res()); socket.on('connect_error', rej); setTimeout(() => rej(new Error('socket connect timeout')), 8000); });
    const ack: any = await new Promise((res) => socket.emit('join', { weddingId }, res));
    expect(ack.ok).toBe(true);
  });
  afterAll(() => { socket.close(); });
  const next = (event: string) => new Promise<any>((res, rej) => { socket.once(event, res); setTimeout(() => rej(new Error(`no ${event}`)), 6000); });

  it('rejects unauthenticated sockets', async () => {
    const bad = io(`${url}/live`, { transports: ['websocket'], reconnection: false });
    const refused = await new Promise<string>((res) => { bad.on('connect_error', (e) => res(e.message)); bad.on('connect', () => res('connected')); setTimeout(() => res('timeout'), 4000); });
    expect(refused).toBe('unauthorized');
    bad.close();
  });
  it('vendor arrival: delayed update is saved in PostgreSQL and broadcast to the wedding room', async () => {
    const expected = new Date(Date.now() - 40 * 60000).toISOString();
    const evt = next('vendor.arrival');
    const r = await agents.vikram.post(`/api/v1/wedding-vendors/${cateringWvId}/arrival`).send({ status: 'DELAYED', expectedAt: expected, delayMinutes: 30, contactName: 'Harish', contactPhone: '+91 90000' }).expect(201);
    const pushed = await evt;
    expect(pushed.weddingId).toBe(weddingId);
    expect(pushed.payload.status).toBe('DELAYED');
    expect(pushed.payload.delayMinutes).toBe(30); // an explicit delay from the coordinator is stored as given
    const row = await prisma.vendorArrival.findUniqueOrThrow({ where: { weddingVendorId: cateringWvId } });
    expect(row.status).toBe('DELAYED');
    expect(row.delayMinutes).toBe(d(r).delayMinutes);
    const bundle = d(await agents.priya.get(`/api/v1/weddings/${weddingId}/event`));
    expect(bundle.vendors[0].arrival.status).toBe('DELAYED');
    expect(bundle.summary.delayed).toBe(1);
  });
  it('arrival: marks arrived with actual time and delay computed from schedule', async () => {
    const expected = new Date(Date.now() - 20 * 60000).toISOString();
    const r = d(await agents.vikram.post(`/api/v1/wedding-vendors/${cateringWvId}/arrival`).send({ status: 'ARRIVED', expectedAt: expected }).expect(201));
    expect(r.actualAt).toBeTruthy();
    expect(r.delayMinutes).toBeGreaterThanOrEqual(19);
  });
  it('timeline: create, update status, delay is derived, change is broadcast', async () => {
    const at = new Date(Date.now() - 25 * 60000).toISOString();
    const t = d(await agents.priya.post(`/api/v1/weddings/${weddingId}/timeline`).send({ title: 'Sound Check', scheduledAt: at, responsible: 'Priya', team: 'AV Crew' }).expect(201));
    const evt = next('timeline.updated');
    const u = d(await agents.priya.patch(`/api/v1/timeline/${t.id}`).send({ status: 'COMPLETED' }).expect(200));
    expect((await evt).payload.id).toBe(t.id);
    expect(u.delayMinutes).toBeGreaterThanOrEqual(24);
    expect(u.actualAt).toBeTruthy();
  });
  it('incident: created, broadcast, requires a resolution to close, keeps audit history', async () => {
    const evt = next('incident.created');
    const r = d(await agents.priya.post(`/api/v1/weddings/${weddingId}/incidents`).send({ title: 'DJ arrives late', description: 'DJ is 30 min behind', severity: 'HIGH' }).expect(201));
    incidentId = r.id;
    expect((await evt).payload.title).toBe('DJ arrives late');
    await agents.priya.patch(`/api/v1/incidents/${incidentId}`).send({ status: 'RESOLVED' }).expect(400);
    const upd = next('incident.updated');
    await agents.priya.patch(`/api/v1/incidents/${incidentId}`).send({ status: 'RESOLVED', resolution: 'Band covered the gap' }).expect(200);
    expect((await upd).payload.status).toBe('RESOLVED');
    const hist = d(await agents.priya.get(`/api/v1/incidents/${incidentId}/history`));
    expect(hist.map((h: any) => h.action)).toEqual(['create', 'update']);
  });
  it('reconnect: a new socket can re-join and re-sync state from REST', async () => {
    const s2 = io(`${url}/live`, { extraHeaders: { cookie: cookies.vikram }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((res) => s2.on('connect', () => res()));
    const ack: any = await new Promise((res) => s2.emit('join', { weddingId }, res));
    expect(ack.ok).toBe(true);
    expect(new Date(ack.serverTime).getTime()).toBeGreaterThan(Date.now() - 5000);
    const bundle = d(await agents.vikram.get(`/api/v1/weddings/${weddingId}/event`));
    expect(bundle.incidents.length).toBe(1);
    s2.close();
  });
});

describe('7. guests, attendance & extra-guest charge', () => {
  it('imports a CSV, skipping duplicates and invalid rows', async () => {
    const csv = 'Name,Phone,Group,RSVP,Plus Ones,Dietary,Accommodation\nAarav Mehta,+91 90001,Mehta Family,YES,1,Jain,yes\n"Verma, Sunita",+91 90002,Verma Family,NO,0,,\nAarav Mehta,+91 90001,Mehta Family,YES,1,,\n,+91 90003,X,YES,0,,\nBad Plus,+91 90004,X,YES,abc,,\n';
    const r = d(await agents.neha.post(`/api/v1/weddings/${weddingId}/guests/import`).send({ csv }).expect(201));
    expect(r.imported).toBe(2);
    expect(r.skipped).toBe(3);
  });
  it('distinguishes expected, confirmed and actual attendance', async () => {
    const guests = d(await agents.neha.get(`/api/v1/weddings/${weddingId}/guests?search=Aarav`));
    const sock = io(`${url}/live`, { extraHeaders: { cookie: cookies.priya }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((res) => sock.on('connect', () => res()));
    await new Promise((res) => sock.emit('join', { weddingId }, res));
    const pushed = new Promise<any>((res) => sock.once('guests.updated', res));
    await agents.vikram.post(`/api/v1/guests/${guests[0].id}/checkin`).send({}).expect(201);
    const evt = await pushed; sock.close();
    expect(evt.payload.checkedIn).toBe(2); // guest + 1 plus-one
    const s = d(await agents.neha.get(`/api/v1/weddings/${weddingId}/guests/stats`));
    expect(s.invitedHeadcount).toBe(3); expect(s.confirmed).toBe(2); expect(s.declined).toBe(1); expect(s.checkedIn).toBe(2); expect(s.weddingExpected).toBe(400);
  });
  it('400 expected → 460 actual × ₹1,200/plate = ₹72,000 additional catering charge (automatic)', async () => {
    const rec = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation`));
    expect(rec.charges).toHaveLength(0); // no actual count yet
    const r = d(await agents.priya.post(`/api/v1/weddings/${weddingId}/actual-guests`).send({ actualGuests: 460 }).expect(201));
    expect(r.extraGuests).toBe(60);
    expect(r.charge.amount).toBe('72000');
    const after = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation`));
    const auto = after.charges.find((c: any) => c.auto);
    expect(auto.amount).toBe('72000'); expect(auto.approved).toBe(false);
    expect(after.clientBilling.approvedExtras).toBe('0'); // pending until approved
    await agents.priya.post(`/api/v1/weddings/${weddingId}/actual-guests`).send({ actualGuests: 460 }).expect(201); // idempotent
    expect((d(await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation`))).charges.filter((c: any) => c.auto)).toHaveLength(1);
  });
  it('lowering the headcount below expected removes the unapproved charge; raising it restores it', async () => {
    await agents.priya.post(`/api/v1/weddings/${weddingId}/actual-guests`).send({ actualGuests: 390 }).expect(201);
    expect(d(await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation`)).charges.filter((c: any) => c.auto)).toHaveLength(0);
    await agents.priya.post(`/api/v1/weddings/${weddingId}/actual-guests`).send({ actualGuests: 460 }).expect(201);
  });
});

describe('8. financial reconciliation & vendor settlement', () => {
  let reconId: string; let settlementId: string; let chargeId: string;
  it('approving the extra charge updates final client billing and the FINAL milestone', async () => {
    const rec = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation`));
    reconId = rec.reconciliationId; settlementId = rec.vendors[0].settlementId; chargeId = rec.charges.find((c: any) => c.auto).id;
    await agents.neha.patch(`/api/v1/reconciliation/charges/${chargeId}`).send({ approved: true }).expect(403); // finance only
    await agents.meera.patch(`/api/v1/reconciliation/charges/${chargeId}`).send({ approved: true }).expect(200);
    const after = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation`));
    expect(after.clientBilling.original).toBe('13500000');
    expect(after.clientBilling.approvedExtras).toBe('72000');
    expect(after.clientBilling.finalAmount).toBe('13572000');
    expect(after.clientBilling.received).toBe('8101000'); // booking + advance + the ₹1,000 FINAL from the duplicate-key test
    const pay = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/payments`));
    expect(pay.milestones.find((m: any) => m.type === 'FINAL').expectedAmount).toBe('5472000'); // 5,400,000 + 72,000
  });
  it('rejects a vendor advance larger than the contract; accepts a valid one idempotently', async () => {
    await agents.meera.post(`/api/v1/weddings/${weddingId}/vendor-payments`).send({ weddingVendorId: cateringWvId, kind: 'ADVANCE', amount: 99999999, method: 'BANK_TRANSFER', idempotencyKey: key('vadv-big') }).expect(422);
    const body = { weddingVendorId: cateringWvId, kind: 'ADVANCE', amount: 300000, method: 'BANK_TRANSFER', reference: 'ADV-1', idempotencyKey: key('vadv') };
    const a = await agents.meera.post(`/api/v1/weddings/${weddingId}/vendor-payments`).send(body).expect(201);
    const b = await agents.meera.post(`/api/v1/weddings/${weddingId}/vendor-payments`).send(body).expect(201);
    expect(d(a).duplicate).toBe(false); expect(d(b).duplicate).toBe(true);
    expect(await prisma.vendorPayment.count({ where: { weddingVendorId: cateringWvId } })).toBe(1);
  });
  it('compares original quote vs actual invoice and deducts the advance', async () => {
    await agents.meera.post(`/api/v1/reconciliation/${reconId}/settle`).send({ weddingVendorId: cateringWvId, method: 'BANK_TRANSFER', idempotencyKey: key('settle-early') }).expect(422); // needs an invoice
    await agents.meera.put(`/api/v1/reconciliation/settlements/${settlementId}/invoice`).send({ actualInvoice: 728200 + 72000, invoiceRef: 'INV-77' }).expect(200);
    const v = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation`)).vendors[0];
    expect(v.originalQuoted).toBe('728200'); expect(v.negotiated).toBe('728200'); expect(v.advance).toBe('300000');
    expect(v.finalBill).toBe('800200'); expect(v.remainingPayable).toBe('500200');
  });
  it('settles exactly once: repeats and parallel attempts cannot pay the vendor twice', async () => {
    const body = (k: string) => ({ weddingVendorId: cateringWvId, method: 'BANK_TRANSFER', reference: 'FINAL', idempotencyKey: key(k) });
    const rs = await Promise.all([1, 2, 3].map((i) => agents.meera.post(`/api/v1/reconciliation/${reconId}/settle`).send(body(`settle-${i}`))));
    expect(rs.filter((r) => r.status === 201).length).toBe(1);
    const winner = rs.findIndex((r) => r.status === 201) + 1;
    expect(rs.filter((r) => r.status === 409).length).toBe(2);
    const payments = await prisma.vendorPayment.findMany({ where: { weddingVendorId: cateringWvId } });
    expect(payments.reduce((a, p) => a + Number(p.amount), 0)).toBe(800200); // advance 300,000 + final 500,200 = invoice
    const again = await agents.meera.post(`/api/v1/reconciliation/${reconId}/settle`).send(body(`settle-${winner}`)).expect(201); // the winning key replays safely
    expect(d(again).totalPaid).toBe('0');
    const v = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation`)).vendors[0];
    expect(v.status).toBe('SETTLED'); expect(v.remainingPayable).toBe('0');
    await agents.meera.put(`/api/v1/reconciliation/settlements/${settlementId}/invoice`).send({ actualInvoice: 1 }).expect(409); // locked after settlement
  });
  it('generates the reconciliation statement PDF', async () => {
    const r = await agents.meera.get(`/api/v1/weddings/${weddingId}/reconciliation/statement`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('9. expenses & profitability', () => {
  it('tracks expense approval and planned-vs-actual', async () => {
    const e = d(await agents.priya.post('/api/v1/expenses').send({ weddingId, category: 'Printing', description: 'Invites', amount: 100000, date: new Date().toISOString() }).expect(201));
    expect(e.status).toBe('PENDING');
    await agents.priya.post(`/api/v1/expenses/${e.id}/decision`).send({ status: 'APPROVED' }).expect(403);
    await agents.meera.post(`/api/v1/expenses/${e.id}/decision`).send({ status: 'APPROVED' }).expect(201);
    await agents.meera.patch(`/api/v1/expenses/${e.id}`).send({ amount: 1 }).expect(400); // approved = locked
    const team = d(await agents.priya.post('/api/v1/expenses').send({ weddingId, category: 'Team Costs', description: 'Team stay', amount: 50000, date: new Date().toISOString(), isTeamCost: true }).expect(201));
    await agents.meera.post(`/api/v1/expenses/${team.id}/decision`).send({ status: 'APPROVED' }).expect(201);
    await agents.meera.put(`/api/v1/weddings/${weddingId}/budget`).send({ lines: [{ category: 'Printing', plannedAmount: 80000 }, { category: 'Catering', plannedAmount: 700000 }] }).expect(200);
    const s = d(await agents.meera.get(`/api/v1/weddings/${weddingId}/expense-summary`));
    const printing = s.rows.find((r: any) => r.category === 'Printing');
    expect(printing.variance).toBe('20000'); expect(printing.overBudget).toBe(true);
    expect(s.rows.find((r: any) => r.category.toLowerCase() === 'catering').actual).toBe('800200');
  });
  it('profitability is computed from the real records of this wedding', async () => {
    const p = d(await agents.meera.get(`/api/v1/analytics/profitability/${weddingId}`));
    expect(p.revenue).toBe('13572000'); // contract + approved extra
    expect(p.vendorCosts).toBe('800200');
    expect(p.teamCosts).toBe('50000');
    expect(p.otherExpenses).toBe('100000');
    expect(p.grossProfit).toBe('12771800');
    expect(p.netProfit).toBe('12621800');
    expect(p.received).toBe('8101000'); // 2.7M + 5.4M + ₹1,000 from the duplicate-key test
    expect(p.receivables).toBe('5471000');
    expect(p.payables).toBe('0');
    expect(p.marginPct).toBe(93);
  });
  it('season overview is consistent with the per-wedding rows', async () => {
    const o = d(await agents.meera.get('/api/v1/analytics/overview'));
    const all = d(await agents.meera.get('/api/v1/analytics/profitability'));
    const sum = all.weddings.reduce((a: number, w: any) => a + Number(w.revenue), 0);
    expect(Number(o.totals.revenue)).toBe(sum);
    expect(o.totals.weddings).toBe(all.weddings.length);
    expect(o.totals.weddings).toBeGreaterThanOrEqual(26);
    expect(Number(o.totals.netProfit)).toBe(all.weddings.reduce((a: number, w: any) => a + Number(w.netProfit), 0));
    expect(o.mostProfitable.length).toBeGreaterThan(0);
    expect(o.monthly.length).toBeGreaterThan(3);
  });
  it('dashboard hides finance figures from roles without finance access', async () => {
    expect(d(await agents.vikram.get('/api/v1/dashboard')).finance).toBeNull();
    expect(d(await agents.meera.get('/api/v1/dashboard')).finance.contractedRevenue).toBeTruthy();
  });
});

describe('10. documents (MinIO)', () => {
  let docId: string;
  it('uploads, lists, previews and downloads the same bytes with metadata + versions', async () => {
    const bytes = Buffer.from('%PDF-1.4 e2e floor plan');
    const up = await agents.neha.post('/api/v1/documents').field('weddingId', weddingId).field('category', 'FLOOR_PLAN').attach('file', bytes, { filename: 'floor.pdf', contentType: 'application/pdf' }).expect(201);
    docId = d(up).id;
    expect(d(up).version).toBe(1); expect(d(up).size).toBe(bytes.length);
    const dl = await agents.neha.get(`/api/v1/documents/${docId}/download`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(Buffer.compare(dl.body as Buffer, bytes)).toBe(0);
    const v2 = d(await agents.neha.post('/api/v1/documents').field('weddingId', weddingId).field('category', 'FLOOR_PLAN').field('documentKey', d(up).documentKey).attach('file', Buffer.from('%PDF-1.4 v2'), { filename: 'floor.pdf', contentType: 'application/pdf' }).expect(201));
    expect(v2.version).toBe(2);
    expect(d(await agents.neha.get(`/api/v1/documents/${docId}/versions`)).map((x: any) => x.version)).toEqual([2, 1]);
    const found = await agents.neha.get(`/api/v1/documents?weddingId=${weddingId}&search=floor`).expect(200);
    expect(found.body.meta.total).toBe(2);
  });
  it('rejects disallowed types and unauthenticated downloads', async () => {
    await agents.neha.post('/api/v1/documents').field('weddingId', weddingId).attach('file', Buffer.from('MZ'), { filename: 'evil.exe', contentType: 'application/x-msdownload' }).expect(400);
    await request(url).get(`/api/v1/documents/${docId}/download`).expect(401);
  });
  it('enforces per-document role access', async () => {
    const up = d(await agents.meera.post('/api/v1/documents').field('weddingId', weddingId).field('category', 'INVOICE').field('roles', 'FINANCE').attach('file', Buffer.from('invoice'), { filename: 'inv.txt', contentType: 'text/plain' }).expect(201));
    await agents.vikram.get(`/api/v1/documents/${up.id}/download`).expect(403);
    await agents.meera.get(`/api/v1/documents/${up.id}/download`).expect(200);
    const listed = d(await agents.vikram.get(`/api/v1/documents?weddingId=${weddingId}&pageSize=100`));
    expect(listed.some((x: any) => x.id === up.id)).toBe(false);
  });
});

describe('11. platform behaviour', () => {
  it('wraps responses and errors in the documented envelopes without leaking internals', async () => {
    const ok = await agents.neha.get('/api/v1/weddings?pageSize=2').expect(200);
    expect(ok.body).toHaveProperty('data'); expect(ok.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    const bad = await agents.neha.get('/api/v1/weddings/not-a-uuid').expect(400);
    expect(bad.body.error.code).toBe('BAD_REQUEST');
    const missing = await agents.neha.get('/api/v1/weddings/00000000-0000-4000-8000-000000000000').expect(404);
    expect(JSON.stringify(missing.body)).not.toMatch(/stack|prisma|node_modules/i);
    const v = await agents.neha.post('/api/v1/enquiries').send({ brideName: 'A' }).expect(400);
    expect(Array.isArray(v.body.error.details)).toBe(true);
  });
  it('writes audit entries for important actions', async () => {
    const log = d(await agents.founder.get(`/api/v1/audit?weddingId=${weddingId}&pageSize=200`));
    const actions = new Set(log.map((l: any) => `${l.entity}.${l.action}`));
    for (const a of ['ClientPayment.record', 'Quotation.select', 'Agreement.sign', 'Incident.create', 'VendorSettlement.settle', 'WeddingTask.generate']) expect(actions.has(a)).toBe(true);
  });
  it('creates in-app notifications and marks them read', async () => {
    const n = d(await agents.meera.get('/api/v1/notifications'));
    expect(n.items.length).toBeGreaterThan(0);
    await agents.meera.post('/api/v1/notifications/read-all').expect(201);
    expect(d(await agents.meera.get('/api/v1/notifications?unread=true')).unreadCount).toBe(0);
  });
  it('reports health including dependencies', async () => {
    const h = d(await request(url).get('/api/v1/health').expect(200));
    expect(h.checks.database).toBe('up');
  });
  it('queues a wedding summary report job that stores a PDF document', async () => {
    const job = d(await agents.neha.post('/api/v1/reports/generate').send({ type: 'wedding-summary', weddingId }).expect(201));
    let status = 'queued';
    for (let i = 0; i < 20 && status !== 'completed' && status !== 'failed'; i++) { await new Promise((r) => setTimeout(r, 750)); status = d(await agents.neha.get(`/api/v1/reports/jobs/${job.jobId}`)).status; }
    expect(status).toBe('completed');
    expect(await prisma.document.count({ where: { weddingId, category: 'FINAL_REPORT' } })).toBe(1);
  });
});

describe('16. keycloak integration, system status, UPI link', () => {
  it('keycloak endpoints are 404 unless KEYCLOAK_ENABLED=true, and built-in auth is unaffected', async () => {
    expect(process.env.KEYCLOAK_ENABLED).not.toBe('true');
    await request(url).get('/api/v1/auth/keycloak/config').expect(404);
    await request(url).post('/api/v1/auth/keycloak/login').send({ email: 'arjun@royalknot.in', password: PASSWORD }).expect(404);
    await agents.founder.get('/api/v1/auth/me').expect(200);
  });
  it('rejects an asymmetric (Keycloak-style) bearer token when the integration is off', async () => {
    const fake = `${Buffer.from('{"alg":"RS256","kid":"x"}').toString('base64url')}.${Buffer.from('{"sub":"x"}').toString('base64url')}.sig`;
    await request(url).get('/api/v1/auth/me').set('Authorization', `Bearer ${fake}`).expect(401);
  });
  it('health reports keycloak as disabled (not down) and stays ok', async () => {
    const h = d(await request(url).get('/api/v1/health').expect(200));
    expect(h.checks.keycloak).toBe('disabled');
    expect(h.status).toBe('ok');
  });
  it('system status lists every service with latency', async () => {
    const s = d(await request(url).get('/api/v1/system/status').expect(200));
    expect(Object.keys(s.services).sort()).toEqual(['database', 'gotenberg', 'keycloak', 'minio', 'redis']);
    expect(s.services.database.status).toBe('up');
    expect(typeof s.services.database.latencyMs).toBe('number');
    expect(s.services.keycloak).toEqual({ status: 'disabled', latencyMs: null });
  });
  it('seeded Keycloak demo users exist with their fixed ids and roles', async () => {
    const u = await prisma.user.findMany({ where: { email: { endsWith: '@royalknot.in' } }, orderBy: { id: 'asc' } });
    expect(u.map((x) => [x.id[0], x.email.split('@')[0], x.role])).toEqual([['1', 'arjun', 'ADMIN'], ['2', 'priya', 'PLANNER'], ['3', 'kabir', 'EVENT_MANAGER'], ['4', 'meera', 'FINANCE'], ['5', 'rohan', 'OPERATIONS']]);
  });
  it('builds a UPI deep link for an unpaid milestone, restricted to finance-read roles', async () => {
    const list = d(await agents.meera.get('/api/v1/payments/milestones?pageSize=100'));
    const open = list.find((m: any) => m.status !== 'PAID');
    const r = d(await agents.meera.get(`/api/v1/payments/upi-qr?milestoneId=${open.id}`).expect(200));
    expect(r.upiUri).toMatch(/^upi:\/\/pay\?pa=.+&pn=The%20Royal%20Knot&am=\d+\.\d{2}&cu=INR/);
    expect(Number(r.amount)).toBe(Number(open.outstanding));
    await agents.vikram.get(`/api/v1/payments/upi-qr?milestoneId=${open.id}`).expect(403);
    await agents.meera.get('/api/v1/payments/upi-qr?milestoneId=00000000-0000-4000-8000-000000000000').expect(404);
    await agents.meera.get('/api/v1/payments/upi-qr?milestoneId=nope').expect(400);
  });
});
