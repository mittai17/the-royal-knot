/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configure } from '../src/main';

/**
 * WP3: vendor payments, maker-checker, client payment lifecycle, gateway callbacks, integrity and confirmed-only reporting.
 * Everything runs on throwaway fixtures (a demo wedding W, a second wedding W2, a draft wedding D, two vendors, extra users) that are removed in afterAll.
 * Posted financial rows are RESTRICT-protected, so children (reversal rows) are cleared before parents.
 */
const PASSWORD = process.env.DEMO_PASSWORD ?? 'RoyalKnot@2026';
const SECRET = 'wp3-test-gateway-secret';
const prisma = new PrismaClient();
const RUN = `WP3-${Date.now()}`;
const d = (r: request.Response) => r.body.data;
const key = (s: string) => `${RUN}-${s}`;
const API = '/api/v1';

let app: INestApplication;
let url: string;
const ag: Record<string, ReturnType<typeof request.agent>> = {};
const ids: any = {};
const made = { users: [] as string[], bills: [] as string[], invoices: [] as string[], approvals: [] as string[] };

async function login(k: string, email: string) {
  const a = request.agent(url);
  await a.post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(200);
  ag[k] = a;
}
async function newBill(who: string, vendorId: string, billNo: string, subtotal: number, extra: any = {}) {
  const r = await ag[who].post(`${API}/vendor-bills`).send({ vendorId, billNo: `${RUN}-${billNo}`, weddingId: ids.W, subtotal, ...extra }).expect(201);
  made.bills.push(d(r).id);
  return d(r).id as string;
}
const req = (who: string, billId: string, amount: number, k: string, extra: any = {}) => ag[who].post(`${API}/vendor-payments`).send({ billId, amount, method: 'BANK_TRANSFER', idempotencyKey: key(k), ...extra });

beforeAll(async () => {
  process.env.DISABLE_JOBS = 'true';
  process.env.AUTH_RATE_LIMIT = '1000';
  process.env.PAYMENT_GATEWAY_SECRET = SECRET;
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configure(app);
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const hash = await argon2.hash(PASSWORD);
  const mk = async (suffix: string, role: any, extra: any = {}) => {
    const u = await prisma.user.create({ data: { email: `${RUN.toLowerCase()}-${suffix}@example.com`, name: `${RUN} ${suffix}`, role, passwordHash: hash, ...extra } });
    made.users.push(u.id);
    return u;
  };
  const couple = await prisma.couple.create({ data: { brideName: `${RUN} Bride`, groomName: `${RUN} Groom`, email: 'b@example.com' } });
  const now = Date.now();
  const w = (name: string, extra: any = {}) => prisma.wedding.create({ data: { name: `${RUN} ${name}`, coupleId: couple.id, location: 'Goa', startDate: new Date(now + 60 * 864e5), endDate: new Date(now + 62 * 864e5), expectedGuests: 100, contractValue: 1000000, isDemo: true, bookingStatus: 'CONFIRMED', ...extra } });
  const W = await w('W'), W2 = await w('W2'), D = await w('Draft', { bookingStatus: 'DRAFT', contractValue: 9999000 });
  const vA = await prisma.vendor.create({ data: { name: `${RUN} Vendor A`, category: 'CATERING', contactName: 'A', phone: '+91 90000 11111' } });
  const vB = await prisma.vendor.create({ data: { name: `${RUN} Vendor B`, category: 'DECORATION', contactName: 'B', phone: '+91 90000 22222' } });
  const wvA = await prisma.weddingVendor.create({ data: { weddingId: W.id, vendorId: vA.id, category: 'CATERING', contractAmount: 500000 } });
  const wvB = await prisma.weddingVendor.create({ data: { weddingId: W2.id, vendorId: vB.id, category: 'DECORATION', contractAmount: 200000 } });
  const dueIn = (days: number) => new Date(now + days * 864e5);
  const ms = async (weddingId: string) => ({
    BOOKING: await prisma.paymentMilestone.create({ data: { weddingId, type: 'BOOKING', dueDate: dueIn(3), expectedAmount: 100000 } }),
    ADVANCE: await prisma.paymentMilestone.create({ data: { weddingId, type: 'ADVANCE', dueDate: dueIn(30), expectedAmount: 300000 } }),
    FINAL: await prisma.paymentMilestone.create({ data: { weddingId, type: 'FINAL', dueDate: dueIn(70), expectedAmount: 600000 } }),
  });
  const mW = await ms(W.id);
  const mD = await ms(D.id);
  await prisma.clientPayment.create({ data: { weddingId: D.id, milestoneId: mD.BOOKING.id, amount: 5000000, method: 'UPI', paidAt: new Date(), idempotencyKey: key('draft-pay'), receiptNo: key('draft-R') } });
  const po = await prisma.purchaseOrder.create({ data: { poNumber: key('PO-1'), weddingId: W.id, vendorId: vA.id, status: 'ACCEPTED', subtotal: 100000, total: 100000 } });
  const fin2 = await mk('fin2', 'FINANCE');
  const sys = await mk('sys', 'SYSADMIN');
  const vuA = await mk('vendor-a', 'VENDOR', { vendorId: vA.id });
  const vuB = await mk('vendor-b', 'VENDOR', { vendorId: vB.id });
  Object.assign(ids, { couple: couple.id, W: W.id, W2: W2.id, D: D.id, vA: vA.id, vB: vB.id, wvA: wvA.id, wvB: wvB.id, mW, po: po.id, fin2: fin2.id, emailFin2: fin2.email, emailSys: sys.email, emailVA: vuA.email, emailVB: vuB.email });

  await login('founder', 'founder@royalknot.local');
  await login('meera', 'meera@royalknot.local');
  await login('neha', 'neha@royalknot.local'); // planner
  await login('priya', 'priya@royalknot.local'); // event manager (coordinator)
  await login('fin2', fin2.email);
  await login('sys', sys.email);
  await login('vendorA', vuA.email);
  await login('vendorB', vuB.email);
}, 120000);

afterAll(async () => {
  const wids = [ids.W, ids.W2, ids.D];
  const inW = { weddingId: { in: wids } };
  try {
    await prisma.vendorBillPayment.deleteMany({ where: { bill: inW, reversalOfId: { not: null } } });
    await prisma.vendorBillPayment.deleteMany({ where: { bill: inW } });
    await prisma.vendorPayment.deleteMany({ where: { ...inW, reversalOfId: { not: null } } });
    await prisma.vendorPayment.deleteMany({ where: inW });
    await prisma.vendorBill.deleteMany({ where: inW });
    await prisma.clientPayment.deleteMany({ where: { ...inW, reversalOfId: { not: null } } });
    await prisma.clientPayment.deleteMany({ where: inW });
    await prisma.clientInvoice.deleteMany({ where: inW });
    await prisma.additionalCharge.deleteMany({ where: { reconciliation: inW } });
    await prisma.expense.deleteMany({ where: { ...inW, reversalOfId: { not: null } } });
    await prisma.expense.deleteMany({ where: inW });
    await prisma.approval.deleteMany({ where: { OR: [inW, { requestedById: { in: made.users } }, { title: { contains: RUN } }] } });
    await prisma.purchaseOrder.deleteMany({ where: inW });
    await prisma.wedding.deleteMany({ where: { id: { in: wids } } });
    await prisma.systemSetting.deleteMany({ where: { key: { contains: ids.W } } });
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
    await prisma.vendor.deleteMany({ where: { id: { in: [ids.vA, ids.vB] } } });
    await prisma.couple.deleteMany({ where: { id: ids.couple } });
  } finally {
    delete process.env.PAYMENT_GATEWAY_SECRET;
    await prisma.$disconnect();
    await app.close();
  }
}, 120000);

describe('vendor bills: maker-checker above the approval limit', () => {
  it('splits submit / verify / approve across different people for a large bill', async () => {
    const id = await newBill('meera', ids.vA, 'BIG-MC', 150000);
    const own = await ag.meera.post(`${API}/vendor-bills/${id}/verify`).send({}).expect(409);
    expect(own.body.message ?? own.body.error?.message ?? JSON.stringify(own.body)).toMatch(/Maker-checker/);
    await ag.fin2.post(`${API}/vendor-bills/${id}/verify`).send({}).expect(201);
    await ag.meera.post(`${API}/vendor-bills/${id}/approve`).send({}).expect(409); // submitter
    await ag.fin2.post(`${API}/vendor-bills/${id}/approve`).send({}).expect(409); // verifier
    await ag.founder.post(`${API}/vendor-bills/${id}/approve`).send({}).expect(201);
    const b = d(await ag.meera.get(`${API}/vendor-bills/${id}`).expect(200));
    expect(b.status).toBe('APPROVED'); expect(b.requiresApproval).toBe(true);
    // a large payment cannot go through the direct route; it needs an approved request
    await ag.meera.post(`${API}/vendor-bills/${id}/pay`).send({ amount: 120000, method: 'UPI', idempotencyKey: key('mc-direct') }).expect(403);
  });
  it('lets one person move a small bill through every stage (below the limit)', async () => {
    const id = await newBill('meera', ids.vA, 'SMALL-ALL', 10000);
    await ag.meera.post(`${API}/vendor-bills/${id}/verify`).send({}).expect(201);
    await ag.meera.post(`${API}/vendor-bills/${id}/approve`).send({}).expect(201);
  });
  it('flags a duplicate bill reference and voids an unpaid bill without deleting it', async () => {
    const a = await newBill('meera', ids.vA, 'DUP-1', 5000);
    const b = await newBill('meera', ids.vA, 'dup 1', 5000, { billNo: `${RUN}-dup 1` });
    expect(a).not.toBe(b);
    const q = d(await ag.meera.get(`${API}/reconciliation/queue?weddingId=${ids.W}`).expect(200));
    expect(q.items.filter((i: any) => i.type === 'DUPLICATE_BILL_REF').length).toBeGreaterThanOrEqual(2);
    await ag.meera.post(`${API}/vendor-bills/${b}/void`).send({ note: 'entered twice' }).expect(201);
    const kept = d(await ag.meera.get(`${API}/vendor-bills/${b}`).expect(200));
    expect(kept.status).toBe('REJECTED'); expect(kept.notes).toMatch(/Voided/);
    await ag.meera.delete(`${API}/vendor-bills/${b}`).expect(404); // no delete route exists
  });
});

describe('vendor payments: workflow and roles', () => {
  let bill: string, r1: string, r2: string, r3: string;
  it('Planner proposes, cannot approve; coordinator and sysadmin have no access', async () => {
    bill = await newBill('meera', ids.vA, 'SMALL', 40000);
    await ag.meera.post(`${API}/vendor-bills/${bill}/verify`).send({}).expect(201);
    await ag.meera.post(`${API}/vendor-bills/${bill}/approve`).send({}).expect(201);
    const c = await req('neha', bill, 15000, 'r1').expect(201);
    r1 = d(c).payment.id;
    expect(d(c).payment.status).toBe('REQUESTED'); expect(d(c).payment.requestedById).toBeTruthy();
    const full = d(await ag.neha.get(`${API}/vendor-payments/${r1}`).expect(200));
    expect(full.approval.reference).toMatch(/^APR-\d{4}-\d{4}$/);
    await ag.neha.post(`${API}/vendor-payments/${r1}/approve`).send({}).expect(403); // planner cannot approve even their own
    await ag.neha.post(`${API}/vendor-payments/${r1}/execute`).send({}).expect(403);
    const nehaId = (await prisma.user.findUniqueOrThrow({ where: { email: 'neha@royalknot.local' } })).id;
    const mineList = d(await ag.neha.get(`${API}/vendor-payments`).expect(200));
    expect(mineList.length).toBeGreaterThan(0); expect(mineList.every((x: any) => x.requestedById === nehaId)).toBe(true); // Planner only sees what they proposed
    await ag.priya.post(`${API}/vendor-payments`).send({ billId: bill, amount: 1000, method: 'UPI', idempotencyKey: key('coord') }).expect(403);
    await ag.priya.post(`${API}/vendor-payments/${r1}/approve`).send({}).expect(403); // coordinator cannot approve vendor payments
    await ag.priya.get(`${API}/vendor-payments`).expect(403);
    await ag.sys.get(`${API}/vendor-payments`).expect(403);
    await ag.sys.post(`${API}/vendor-payments/${r1}/execute`).send({}).expect(403); // sysadmin cannot execute business payments
    await ag.sys.post(`${API}/vendor-payments/${r1}/approve`).send({}).expect(403);
    await ag.neha.post(`${API}/vendor-payments/${r1}/cancel`).send({ reason: 'proposed in error' }).expect(201);
    expect(d(await ag.meera.get(`${API}/vendor-payments/${r1}`)).status).toBe('CANCELLED');
  });
  it('Finance cannot approve their own request; another Finance user can, then the requester executes', async () => {
    const c = await req('meera', bill, 20000, 'r2').expect(201);
    r2 = d(c).payment.id;
    const own = await ag.meera.post(`${API}/vendor-payments/${r2}/approve`).send({}).expect(403);
    expect(JSON.stringify(own.body)).toMatch(/Maker-checker/);
    await ag.meera.post(`${API}/vendor-payments/${r2}/execute`).send({}).expect(409); // not approved yet
    await ag.fin2.post(`${API}/vendor-payments/${r2}/approve`).send({ note: 'ok' }).expect(201);
    const done = d(await ag.meera.post(`${API}/vendor-payments/${r2}/execute`).send({ reference: 'UTR-R2' }).expect(201));
    expect(done.status).toBe('PAID'); expect(done.paidAt).toBeTruthy();
    expect(done.history.map((h: any) => h.action)).toEqual(expect.arrayContaining(['request', 'approve', 'process', 'execute']));
    const b = d(await ag.meera.get(`${API}/vendor-bills/${bill}`));
    expect(b.status).toBe('PARTIALLY_PAID'); expect(b.amountPaid).toBe('20000');
  });
  it('the approver cannot execute what they approved; the bill settles at the end', async () => {
    r3 = d(await req('meera', bill, 20000, 'r3').expect(201)).payment.id;
    await ag.fin2.post(`${API}/vendor-payments/${r3}/approve`).send({}).expect(201);
    const x = await ag.fin2.post(`${API}/vendor-payments/${r3}/execute`).send({}).expect(403);
    expect(JSON.stringify(x.body)).toMatch(/approved this payment/);
    await ag.meera.post(`${API}/vendor-payments/${r3}/execute`).send({}).expect(201);
    expect(d(await ag.meera.get(`${API}/vendor-bills/${bill}`)).status).toBe('PAID');
    await req('meera', bill, 1, 'over').expect(422); // nothing outstanding
  });
  it('is idempotent on the key and never over-commits a bill, even in parallel', async () => {
    const b1 = await newBill('meera', ids.vA, 'IDEM', 20000);
    await ag.meera.post(`${API}/vendor-bills/${b1}/verify`).send({}).expect(201);
    const same = await Promise.all([1, 2, 3, 4, 5].map(() => req('meera', b1, 5000, 'same-key')));
    same.forEach((s) => expect(s.status).toBe(201));
    expect(await prisma.vendorPayment.count({ where: { idempotencyKey: key('same-key') } })).toBe(1);
    expect(same.filter((s) => d(s).duplicate === false).length).toBe(1);
    const b2 = await newBill('meera', ids.vA, 'RACE', 30000);
    await ag.meera.post(`${API}/vendor-bills/${b2}/verify`).send({}).expect(201);
    const race = await Promise.all([1, 2, 3, 4].map((i) => req('meera', b2, 10000, `race-${i}`)));
    expect(race.filter((x) => x.status === 201).length).toBe(3);
    expect(race.filter((x) => x.status === 422).length).toBe(1);
    expect(await prisma.vendorPayment.count({ where: { billId: b2, status: 'REQUESTED' } })).toBe(3);
  });
  it('above the Founder limit only the Founder approves; schedule -> process -> execute; fail, retry and reverse keep history', async () => {
    const big = await newBill('meera', ids.vA, 'BIG', 300000);
    await ag.fin2.post(`${API}/vendor-bills/${big}/verify`).send({}).expect(201);
    await ag.founder.post(`${API}/vendor-bills/${big}/approve`).send({}).expect(201);
    const p = d(await req('meera', big, 150000, 'big1', { reason: 'Mid-event settlement' }).expect(201)).payment.id;
    const deny = await ag.fin2.post(`${API}/vendor-payments/${p}/approve`).send({}).expect(403);
    expect(JSON.stringify(deny.body)).toMatch(/Founder/);
    await ag.founder.post(`${API}/vendor-payments/${p}/approve`).send({}).expect(201);
    const when = new Date(Date.now() + 40 * 864e5).toISOString();
    expect(d(await ag.meera.post(`${API}/vendor-payments/${p}/schedule`).send({ scheduledFor: when }).expect(201)).status).toBe('SCHEDULED');
    // the scheduled outflow shows up in the cash-flow forecast
    const cf = d(await ag.meera.get(`${API}/budgets/cash-flow?weddingId=${ids.W}`).expect(200));
    expect(Number(cf.totals.scheduledVendorOutflow)).toBeGreaterThanOrEqual(150000);
    expect(Number(cf.totals.dueMilestoneInflow)).toBeGreaterThan(0);
    expect(d(await ag.meera.post(`${API}/vendor-payments/${p}/process`).expect(201)).status).toBe('PROCESSING');
    await ag.founder.post(`${API}/vendor-payments/${p}/execute`).send({}).expect(403); // founder approved it
    const failed = d(await ag.meera.post(`${API}/vendor-payments/${p}/fail`).send({ reason: 'Bank rejected the transfer' }).expect(201));
    expect(failed.status).toBe('FAILED'); expect(failed.failureReason).toMatch(/Bank/);
    expect(d(await ag.meera.post(`${API}/vendor-payments/${p}/retry`).expect(201)).status).toBe('APPROVED');
    expect(d(await ag.meera.post(`${API}/vendor-payments/${p}/execute`).send({}).expect(201)).status).toBe('PAID');
    let b = d(await ag.meera.get(`${API}/vendor-bills/${big}`));
    expect(b.status).toBe('PARTIALLY_PAID'); expect(b.amountPaid).toBe('150000');
    await ag.meera.post(`${API}/vendor-payments/${p}/reverse`).send({ reason: 'wrong vendor' }).expect(403); // Founder only
    await ag.founder.post(`${API}/vendor-payments/${p}/reverse`).send({ reason: 'wrong vendor' }).expect(201);
    await ag.founder.post(`${API}/vendor-payments/${p}/reverse`).send({ reason: 'again' }).expect(409);
    b = d(await ag.meera.get(`${API}/vendor-bills/${big}`));
    expect(b.amountPaid).toBe('0'); expect(b.status).toBe('APPROVED');
    const rows = await prisma.vendorPayment.findMany({ where: { billId: big } });
    expect(rows.length).toBe(2); // original + reversal entry, nothing deleted
    expect(rows.some((r) => r.reversalOfId === p)).toBe(true);
  });
  it('legacy direct routes delegate: Finance up to the limit, Founder any amount, caps still apply', async () => {
    await ag.meera.post(`${API}/weddings/${ids.W}/vendor-payments`).send({ weddingVendorId: ids.wvA, kind: 'ADVANCE', amount: 99999999, method: 'BANK_TRANSFER', idempotencyKey: key('leg-big') }).expect(422);
    await ag.meera.post(`${API}/weddings/${ids.W}/vendor-payments`).send({ weddingVendorId: ids.wvA, kind: 'ADVANCE', amount: 150000, method: 'BANK_TRANSFER', idempotencyKey: key('leg-over') }).expect(403);
    const ok = d(await ag.meera.post(`${API}/weddings/${ids.W}/vendor-payments`).send({ weddingVendorId: ids.wvA, kind: 'ADVANCE', amount: 50000, method: 'BANK_TRANSFER', idempotencyKey: key('leg-ok') }).expect(201));
    expect(ok.payment.status).toBe('PAID'); expect(ok.payment.notes).toMatch(/auto-approved/);
    const again = d(await ag.meera.post(`${API}/weddings/${ids.W}/vendor-payments`).send({ weddingVendorId: ids.wvA, kind: 'ADVANCE', amount: 50000, method: 'BANK_TRANSFER', idempotencyKey: key('leg-ok') }).expect(201));
    expect(again.duplicate).toBe(true);
    await ag.founder.post(`${API}/weddings/${ids.W}/vendor-payments`).send({ weddingVendorId: ids.wvA, kind: 'ADVANCE', amount: 120000, method: 'BANK_TRANSFER', idempotencyKey: key('leg-founder') }).expect(201);
    await ag.neha.post(`${API}/weddings/${ids.W}/vendor-payments`).send({ weddingVendorId: ids.wvA, kind: 'ADVANCE', amount: 100, method: 'UPI', idempotencyKey: key('leg-planner') }).expect(403);
    await ag.sys.post(`${API}/weddings/${ids.W}/vendor-payments`).send({ weddingVendorId: ids.wvA, kind: 'ADVANCE', amount: 100, method: 'UPI', idempotencyKey: key('leg-sys') }).expect(403);
  });
  it('bill pay() posts a VendorPayment, supports part payments and is idempotent', async () => {
    const id = await newBill('meera', ids.vA, 'PAYBILL', 30000);
    await ag.meera.post(`${API}/vendor-bills/${id}/verify`).send({}).expect(201);
    await ag.meera.post(`${API}/vendor-bills/${id}/approve`).send({}).expect(201);
    const p1 = { amount: 10000, method: 'UPI', idempotencyKey: key('pb1') };
    expect(d(await ag.meera.post(`${API}/vendor-bills/${id}/pay`).send(p1).expect(201)).bill.status).toBe('PARTIALLY_PAID');
    expect(d(await ag.meera.post(`${API}/vendor-bills/${id}/pay`).send(p1).expect(201)).duplicate).toBe(true);
    await ag.meera.post(`${API}/vendor-bills/${id}/pay`).send({ ...p1, amount: 25000, idempotencyKey: key('pb-over') }).expect(422);
    expect(d(await ag.meera.post(`${API}/vendor-bills/${id}/pay`).send({ ...p1, amount: 20000, idempotencyKey: key('pb2') }).expect(201)).bill.status).toBe('PAID');
    const vps = await prisma.vendorPayment.findMany({ where: { billId: id } });
    expect(vps.length).toBe(2); expect(vps.every((v) => v.status === 'PAID')).toBe(true);
    expect(await prisma.vendorBillPayment.count({ where: { billId: id } })).toBe(2);
  });
});

describe('approvals and maker-checker', () => {
  it('rejects deciding your own request (Founder included) and fully populates the record', async () => {
    const c = d(await ag.neha.post(`${API}/approvals`).send({ source: 'other', title: `${RUN} laptop`, amount: 1000, reason: 'Need it', weddingId: ids.W }).expect(201));
    expect(c.reference).toMatch(/^APR-\d{4}-\d{4}$/); expect(c.reason).toBe('Need it'); expect(c.sourceModule).toBe('other'); expect(c.assignedApproverId).toBeTruthy(); expect(c.requestedById).toBeTruthy();
    await ag.neha.post(`${API}/approvals/${c.id}/approve`).send({}).expect(403);
    await ag.founder.post(`${API}/approvals/${c.id}/approve`).send({ note: 'fine' }).expect(201);
    const own = d(await ag.founder.post(`${API}/approvals`).send({ source: 'other', title: `${RUN} founder own`, amount: 10 }).expect(201));
    const r = await ag.founder.post(`${API}/approvals/${own.id}/approve`).send({}).expect(403);
    expect(JSON.stringify(r.body)).toMatch(/Maker-checker/);
    await ag.founder.post(`${API}/approvals/${own.id}/reject`).send({ note: 'self' }).expect(403);
    await ag.founder.post(`${API}/approvals/${own.id}/cancel`).send({}).expect(201);
  });
  it('accepts requests from every source module', async () => {
    const exp = d(await ag.neha.post(`${API}/expenses`).send({ weddingId: ids.W, category: 'Misc', description: `${RUN} src`, amount: 1000, date: new Date().toISOString() }).expect(201));
    const inv = d(await ag.meera.post(`${API}/invoices`).send({ weddingId: ids.W, lines: [{ description: 'Fee', quantity: 1, unitPrice: 1000 }] }).expect(201)); made.invoices.push(inv.id);
    const bud = d(await ag.meera.post(`${API}/budgets`).send({ weddingId: ids.W, items: [{ category: 'Catering', plannedAmount: 1000 }] }).expect(201));
    const vp = await prisma.vendorPayment.findFirstOrThrow({ where: { weddingId: ids.W, status: 'PAID', reversalOfId: null } });
    const cases: [string, string, string][] = [['expense', exp.id, 'EXTRA_EXPENSE'], ['vendor-payment', vp.id, 'VENDOR_PAYMENT'], ['client-discount', inv.id, 'CLIENT_DISCOUNT'], ['budget-increase', bud.id, 'BUDGET_INCREASE'], ['cancellation', ids.W, 'OTHER'], ['special-purchase', ids.po, 'OTHER']];
    for (const [source, entityId, type] of cases) {
      const r = d(await ag.neha.post(`${API}/approvals`).send({ source, entityId, title: `${RUN} ${source}`, amount: 500, reason: `because ${source}`, weddingId: ids.W }).expect(201));
      expect(r.type).toBe(type); expect(r.sourceId).toBe(entityId); expect(r.reference).toBeTruthy(); expect(r.reason).toBe(`because ${source}`);
    }
    await ag.neha.post(`${API}/approvals`).send({ source: 'expense', title: 'no record given' }).expect(400);
    await ag.neha.post(`${API}/approvals`).send({ source: 'expense', entityId: '00000000-0000-4000-8000-000000000000', title: 'ghost record' }).expect(404);
  });
  it('an expense cannot be approved by the person who logged it; Founder approval flows through to the expense', async () => {
    const e = d(await ag.meera.post(`${API}/expenses`).send({ weddingId: ids.W, category: 'Printing', description: `${RUN} big`, amount: 60000, date: new Date().toISOString() }).expect(201));
    const own = await ag.meera.post(`${API}/expenses/${e.id}/decision`).send({ status: 'APPROVED' }).expect(403);
    expect(JSON.stringify(own.body)).toMatch(/Maker-checker/);
    await ag.neha.post(`${API}/expenses/${e.id}/decision`).send({ status: 'APPROVED' }).expect(403); // planner cannot approve
    const ap = await prisma.approval.findFirstOrThrow({ where: { entity: 'Expense', entityId: e.id } });
    expect(ap.reference).toBeTruthy(); expect(ap.sourceModule).toBe('expenses'); expect(ap.reason).toBeTruthy();
    await ag.meera.post(`${API}/approvals/${ap.id}/approve`).send({}).expect(403); // finance cannot decide approvals (Founder only)
    await ag.founder.post(`${API}/approvals/${ap.id}/approve`).send({}).expect(201);
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('APPROVED');
    // another Finance user can decide an expense Meera logged
    const e2 = d(await ag.meera.post(`${API}/expenses`).send({ weddingId: ids.W, category: 'Printing', description: `${RUN} small`, amount: 2000, date: new Date().toISOString() }).expect(201));
    await ag.fin2.post(`${API}/expenses/${e2.id}/decision`).send({ status: 'APPROVED' }).expect(201);
    await ag.fin2.post(`${API}/expenses/${e2.id}/decision`).send({ status: 'REJECTED' }).expect(409); // decided once
    // never deleted: an approved expense is reversed, and totals drop it
    await ag.meera.post(`${API}/expenses/${e2.id}/void`).send({ reason: 'duplicate' }).expect(201);
    const rows = await prisma.expense.findMany({ where: { OR: [{ id: e2.id }, { reversalOfId: e2.id }] } });
    expect(rows.length).toBe(2);
    const s = d(await ag.meera.get(`${API}/weddings/${ids.W}/expense-summary`));
    expect(s.rows.find((r: any) => r.category === 'Printing').actual).toBe('60000');
  });
});

describe('client payments: lifecycle, verification, refunds, milestone plan', () => {
  let pay: string;
  it('milestone amounts come from the contract plan (no hardcoded split)', async () => {
    const plan = d(await ag.meera.put(`${API}/weddings/${ids.W}/milestone-plan`).send({ milestones: [{ type: 'BOOKING', percent: 10 }, { type: 'ADVANCE', amount: 300000 }] }).expect(200));
    expect(plan.source).toBe('contract');
    const ms = d(await ag.meera.get(`${API}/weddings/${ids.W}/payments`)).milestones;
    const amt = (t: string) => ms.find((m: any) => m.type === t).expectedAmount;
    expect([amt('BOOKING'), amt('ADVANCE'), amt('FINAL')]).toEqual(['100000', '300000', '600000']);
    await ag.neha.put(`${API}/weddings/${ids.W}/milestone-plan`).send({ milestones: [{ type: 'BOOKING', percent: 50 }, { type: 'ADVANCE', percent: 10 }] }).expect(403);
    await ag.meera.put(`${API}/weddings/${ids.W}/milestone-plan`).send({ milestones: [{ type: 'BOOKING', percent: 60 }, { type: 'ADVANCE', percent: 60 }] }).expect(422);
  });
  it('records a payment (unverified), then a different person verifies it', async () => {
    const r = d(await ag.meera.post(`${API}/payments`).send({ weddingId: ids.W, milestone: 'BOOKING', amount: 100000, method: 'BANK_TRANSFER', idempotencyKey: key('book') }).expect(201));
    pay = r.payment.id;
    expect(r.payment.status).toBe('SUCCEEDED'); expect(r.payment.verifiedAt).toBeNull();
    const own = await ag.meera.post(`${API}/payments/${pay}/verify`).send({}).expect(403);
    expect(JSON.stringify(own.body)).toMatch(/Maker-checker/);
    await ag.neha.post(`${API}/payments/${pay}/verify`).send({}).expect(403);
    const v = d(await ag.fin2.post(`${API}/payments/${pay}/verify`).send({ note: 'bank statement matched' }).expect(201));
    expect(v.verifiedAt).toBeTruthy(); expect(v.verifiedById).toBe(ids.fin2);
    const again = d(await ag.founder.post(`${API}/payments/${pay}/verify`).send({}).expect(201));
    expect(again.verifiedById).toBe(ids.fin2); // idempotent, first verifier stays
    await ag.meera.post(`${API}/payments`).send({ weddingId: ids.W, milestone: 'BOOKING', amount: 1, method: 'UPI', idempotencyKey: key('book-over') }).expect(422);
    await ag.sys.post(`${API}/payments`).send({ weddingId: ids.W, milestone: 'BOOKING', amount: 1, method: 'UPI', idempotencyKey: key('book-sys') }).expect(403);
    await ag.meera.put(`${API}/weddings/${ids.W}/milestone-plan`).send({ milestones: [{ type: 'BOOKING', percent: 5 }, { type: 'ADVANCE', amount: 300000 }] }).expect(422); // already 100,000 paid
  });
  it('refunds are reversal entries that need Founder approval, never deletions', async () => {
    const first = d(await ag.meera.post(`${API}/payments/${pay}/refund`).send({ amount: 30000, reason: 'Date moved', idempotencyKey: key('rf1') }).expect(201));
    expect(first.approvalRequired).toBe(true);
    await ag.meera.post(`${API}/approvals/${first.approval.id}/approve`).send({}).expect(403);
    await ag.founder.post(`${API}/approvals/${first.approval.id}/approve`).send({ note: 'ok' }).expect(201);
    const done = d(await ag.meera.post(`${API}/payments/${pay}/refund`).send({ amount: 30000, reason: 'Date moved', idempotencyKey: key('rf1') }).expect(201));
    expect(done.refund.reversalOfId).toBe(pay); expect(done.refund.amount).toBe('30000');
    const m1 = d(await ag.meera.get(`${API}/weddings/${ids.W}/payments`)).milestones.find((m: any) => m.type === 'BOOKING');
    expect(m1.received).toBe('70000'); expect(m1.outstanding).toBe('30000');
    const same = d(await ag.meera.post(`${API}/payments/${pay}/refund`).send({ amount: 30000, reason: 'Date moved', idempotencyKey: key('rf1') }).expect(201));
    expect(same.duplicate).toBe(true);
    await ag.founder.post(`${API}/payments/${pay}/refund`).send({ amount: 80000, reason: 'too much', idempotencyKey: key('rf-big') }).expect(422);
    const rest = d(await ag.founder.post(`${API}/payments/${pay}/refund`).send({ reason: 'cancelled', idempotencyKey: key('rf2') }).expect(201));
    expect(rest.refund.amount).toBe('70000'); expect(rest.payment.status).toBe('REFUNDED'); expect(rest.payment.reversedAt).toBeTruthy();
    await ag.founder.post(`${API}/payments/${pay}/refund`).send({ amount: 1, reason: 'again', idempotencyKey: key('rf3') }).expect(422);
    expect(await prisma.clientPayment.count({ where: { OR: [{ id: pay }, { reversalOfId: pay }] } })).toBe(3);
    await ag.founder.delete(`${API}/payments/${pay}`).expect(404);
    const m2 = d(await ag.meera.get(`${API}/weddings/${ids.W}/payments`)).milestones.find((m: any) => m.type === 'BOOKING');
    expect(m2.received).toBe('0');
    const reg = d(await ag.meera.get(`${API}/payments?weddingId=${ids.W}&kind=refunds`).expect(200));
    expect(reg.length).toBe(2); expect(reg.every((i: any) => i.isRefund)).toBe(true);
  });
});

describe('gateway callbacks', () => {
  const body = (extra: any = {}) => ({ event: 'payment.succeeded', gatewayRef: key('gw-1'), amount: 50000, weddingId: ids.W, milestone: 'ADVANCE', method: 'UPI', ...extra });
  const post = (b: any, h: Record<string, string> = { 'x-gateway-secret': SECRET }) => request(url).post(`${API}/payments/callbacks/razorpay`).set(h).send(b);
  it('rejects unsigned or wrongly signed callbacks', async () => {
    await post(body(), {}).expect(401);
    await post(body(), { 'x-gateway-secret': 'nope' }).expect(401);
    await post(body(), { 'x-signature': 'deadbeef' }).expect(401);
    await request(url).post(`${API}/payments/callbacks/bad provider!`).set('x-gateway-secret', SECRET).send(body()).expect(400);
  });
  it('repeated and concurrent callbacks never create a second payment', async () => {
    const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => post(body())));
    rs.forEach((r) => expect(r.status).toBe(200));
    expect(await prisma.clientPayment.count({ where: { gatewayRef: key('gw-1') } })).toBe(1);
    expect(rs.filter((r) => !d(r).duplicate).length).toBe(1);
    const row = await prisma.clientPayment.findFirstOrThrow({ where: { gatewayRef: key('gw-1') } });
    expect(row.status).toBe('SUCCEEDED'); expect(row.verifiedAt).toBeTruthy(); expect(row.recordedById).toBeNull();
    const again = await post(body()).expect(200);
    expect(d(again).duplicate).toBe(true);
    const ms = d(await ag.meera.get(`${API}/weddings/${ids.W}/payments`)).milestones.find((m: any) => m.type === 'ADVANCE');
    expect(ms.received).toBe('50000');
  });
  it('accepts an HMAC signature and only moves states forward', async () => {
    const b = body({ gatewayRef: key('gw-2'), event: 'payment.processing', amount: 20000 });
    const sig = createHmac('sha256', SECRET).update(JSON.stringify(b)).digest('hex');
    const first = await post(b, { 'x-signature': `sha256=${sig}` }).expect(200);
    expect(d(first).status).toBe('PROCESSING');
    const ok = body({ gatewayRef: key('gw-2'), event: 'payment.succeeded', amount: 20000 });
    expect(d(await post(ok).expect(200)).status).toBe('SUCCEEDED');
    expect(d(await post(b).expect(200)).duplicate).toBe(true); // a late "processing" cannot undo it
    expect((await prisma.clientPayment.findFirstOrThrow({ where: { gatewayRef: key('gw-2') } })).status).toBe('SUCCEEDED');
  });
  it('records failures, then refunds once', async () => {
    expect(d(await post(body({ gatewayRef: key('gw-3'), event: 'payment.failed', amount: 1000 })).expect(200)).status).toBe('FAILED');
    const ms = d(await ag.meera.get(`${API}/weddings/${ids.W}/payments`)).milestones.find((m: any) => m.type === 'ADVANCE');
    expect(ms.received).toBe('70000'); // the failed attempt does not count
    for (let i = 0; i < 3; i++) await post(body({ event: 'payment.refunded' })).expect(200);
    const rows = await prisma.clientPayment.findMany({ where: { OR: [{ gatewayRef: key('gw-1') }] } });
    expect(rows.length).toBe(2); // the original + exactly one reversal
    expect(rows.find((r) => !r.reversalOfId)!.status).toBe('REFUNDED');
    const ms2 = d(await ag.meera.get(`${API}/weddings/${ids.W}/payments`)).milestones.find((m: any) => m.type === 'ADVANCE');
    expect(ms2.received).toBe('20000');
  });
  it('is disabled (503) when no secret is configured', async () => {
    const keep = process.env.PAYMENT_GATEWAY_SECRET;
    delete process.env.PAYMENT_GATEWAY_SECRET;
    await post(body({ gatewayRef: key('gw-x') })).expect(503);
    process.env.PAYMENT_GATEWAY_SECRET = keep;
  });
});

describe('integrity: no hard deletes, reconciliation queue', () => {
  it('voids a charge with a counter-entry instead of deleting it', async () => {
    const c = d(await ag.meera.post(`${API}/weddings/${ids.W}/reconciliation/charges`).send({ type: 'OTHER', description: `${RUN} extra`, quantity: 2, unitPrice: 500, weddingVendorId: ids.wvA }).expect(201));
    await ag.meera.delete(`${API}/reconciliation/charges/${c.id}`).expect(404); // delete route is gone
    await ag.meera.patch(`${API}/reconciliation/charges/${c.id}`).send({ approved: true }).expect(200);
    const q0 = d(await ag.meera.get(`${API}/reconciliation/queue?weddingId=${ids.W}&type=UNAPPROVED_EXTRA`));
    const second = d(await ag.meera.post(`${API}/weddings/${ids.W}/reconciliation/charges`).send({ type: 'OTHER', description: `${RUN} pending extra`, quantity: 1, unitPrice: 700 }).expect(201));
    const q1 = d(await ag.meera.get(`${API}/reconciliation/queue?weddingId=${ids.W}&type=UNAPPROVED_EXTRA`));
    expect(q1.items.length).toBe(q0.items.length + 1);
    await ag.neha.post(`${API}/reconciliation/charges/${c.id}/void`).send({ reason: 'x' }).expect(403);
    const v = d(await ag.meera.post(`${API}/reconciliation/charges/${c.id}/void`).send({ reason: 'billed by mistake' }).expect(201));
    expect(v.entry.amount).toBe('-1000');
    await ag.meera.post(`${API}/reconciliation/charges/${c.id}/void`).send({ reason: 'again' }).expect(409);
    const rows = await prisma.additionalCharge.findMany({ where: { reconciliation: { weddingId: ids.W }, description: { startsWith: `${RUN} extra` } } });
    expect(rows.length).toBe(1); // the original is still there
    expect((await prisma.additionalCharge.findMany({ where: { reconciliation: { weddingId: ids.W }, description: { startsWith: `[VOID:${c.id}]` } } })).length).toBe(1);
    expect(second.id).toBeTruthy();
  });
  it('flags PO mismatches, overpayments and unmatched transactions in the queue', async () => {
    const b = await newBill('meera', ids.vA, 'POMISMATCH', 130000, { purchaseOrderId: ids.po });
    expect(b).toBeTruthy();
    // a payment that exceeds what the vendor is owed (written directly, as a data-quality fault)
    await prisma.vendorPayment.create({ data: { weddingId: ids.W2, weddingVendorId: ids.wvB, kind: 'FINAL', amount: 250000, method: 'UPI', paidAt: new Date(), idempotencyKey: key('overpaid'), status: 'PAID' } });
    const old = new Date(Date.now() - 5 * 864e5);
    const stale = await prisma.clientPayment.create({ data: { weddingId: ids.W2, milestoneId: (await prisma.paymentMilestone.create({ data: { weddingId: ids.W2, type: 'BOOKING', dueDate: new Date(), expectedAmount: 10000 } })).id, amount: 1000, method: 'UPI', paidAt: old, idempotencyKey: key('stale'), receiptNo: key('stale-R'), createdAt: old } });
    const all = d(await ag.founder.get(`${API}/reconciliation/queue`).expect(200)).items.filter((i: any) => [ids.W, ids.W2].includes(i.weddingId));
    const types = new Set(all.map((i: any) => i.type));
    for (const t of ['BILL_PO_MISMATCH', 'PO_OVERBILLED', 'VENDOR_OVERPAYMENT', 'CLIENT_PAYMENT_UNVERIFIED', 'UNAPPROVED_EXTRA']) expect(types.has(t)).toBe(true);
    expect(stale.id).toBeTruthy();
    await ag.priya.get(`${API}/reconciliation/queue`).expect(403);
    await ag.sys.get(`${API}/reconciliation/queue`).expect(403);
  });
  it('audits every financial mutation, and the audit trail is append-only', async () => {
    const log = await prisma.activityLog.findMany({ where: { weddingId: ids.W } });
    const actions = new Set(log.map((l) => `${l.entity}:${l.action}`));
    for (const a of ['VendorPayment:request', 'VendorPayment:approve', 'VendorPayment:execute', 'VendorPayment:reverse', 'ClientPayment:verify', 'ClientPayment:refund', 'Approval:request', 'Approval:approve', 'AdditionalCharge:void', 'VendorBill:verify', 'Expense:reverse']) expect(actions.has(a)).toBe(true);
    await expect(prisma.activityLog.deleteMany({ where: { id: log[0].id } })).rejects.toThrow();
  });
});

describe('isolation and reporting', () => {
  it("a vendor never sees another vendor's or wedding's invoices or payments", async () => {
    const bB = await prisma.vendorBill.create({ data: { billNo: `${RUN}-VB-ONLY`, vendorId: ids.vB, weddingId: ids.W2, total: 77777, subtotal: 77777 } });
    const own = d(await ag.vendorA.get(`${API}/portal/vendor/invoices`).expect(200));
    expect(JSON.stringify(own)).not.toContain(`${RUN}-VB-ONLY`);
    expect(own.items.length).toBeGreaterThan(0);
    const theirs = d(await ag.vendorB.get(`${API}/portal/vendor/invoices`).expect(200));
    expect(JSON.stringify(theirs)).toContain(`${RUN}-VB-ONLY`);
    expect(JSON.stringify(theirs)).not.toContain(`${RUN}-BIG`);
    await ag.vendorA.get(`${API}/vendor-bills/${bB.id}`).expect(403);
    await ag.vendorA.get(`${API}/vendor-bills`).expect(403);
    await ag.vendorA.get(`${API}/invoices`).expect(403);
    await ag.vendorA.get(`${API}/vendor-payments`).expect(403);
    await ag.vendorA.post(`${API}/vendor-payments`).send({ billId: bB.id, amount: 1, method: 'UPI', idempotencyKey: key('v-attack') }).expect(403);
    const mine = d(await ag.vendorA.get(`${API}/vendor-payments/mine`).expect(200));
    expect(mine.items.every((x: any) => x.wedding.id === ids.W)).toBe(true);
    expect(d(await ag.vendorB.get(`${API}/vendor-payments/mine`).expect(200)).items.every((x: any) => x.wedding.id === ids.W2)).toBe(true);
    await ag.sys.get(`${API}/payments`).expect(403);
    await ag.sys.get(`${API}/invoices`).expect(403);
  });
  it('revenue, profitability and receivables count confirmed weddings only', async () => {
    const p = d(await ag.founder.get(`${API}/analytics/profitability`).expect(200));
    const names = p.weddings.map((x: any) => x.name);
    expect(names).toContain(`${RUN} W`); expect(names).not.toContain(`${RUN} Draft`);
    const one = d(await ag.founder.get(`${API}/analytics/profitability/${ids.D}`).expect(200));
    expect(one.bookingStatus).toBe('DRAFT'); expect(one.revenue).toBe('9999000'); // a single draft can still be inspected
    const ov = d(await ag.founder.get(`${API}/analytics/overview`).expect(200));
    expect(JSON.stringify(ov.upcomingClientPayments)).not.toContain(`${RUN} Draft`);
    const rec = d(await ag.founder.get(`${API}/analytics/financial/receivables`).expect(200));
    expect(rec.rows.some((r: any) => r.wedding === `${RUN} Draft`)).toBe(false);
    expect(rec.rows.every((r: any) => r.sourceType === 'MILESTONE' || r.sourceType === 'INVOICE')).toBe(true);
    const season = d(await ag.founder.get(`${API}/analytics/financial/season`).expect(200));
    expect(season.totals.weddings).toBeGreaterThan(0);
  });
  it('receivables separates invoices from milestones without double counting; summary CSV is not empty', async () => {
    const inv = d(await ag.meera.post(`${API}/invoices`).send({ weddingId: ids.W, milestoneId: ids.mW.FINAL.id, lines: [{ description: 'Final instalment', quantity: 1, unitPrice: 200000 }] }).expect(201));
    made.invoices.push(inv.id);
    await ag.meera.post(`${API}/invoices/${inv.id}/send`).expect(201);
    const rec = d(await ag.founder.get(`${API}/analytics/financial/receivables`).expect(200));
    const mine = rec.rows.filter((r: any) => r.wedding === `${RUN} W`);
    const out = (t: string, ref?: string) => mine.filter((r: any) => r.sourceType === t && (!ref || r.milestone === ref));
    const finalMs = out('MILESTONE', 'FINAL');
    expect(finalMs.length).toBe(1);
    expect(finalMs[0].outstanding).toBe('400000'); // 600,000 milestone - 200,000 already invoiced
    expect(out('INVOICE').map((r: any) => r.invoiceNo)).toContain(inv.invoiceNo);
    const total = d(await ag.meera.get(`${API}/weddings/${ids.W}/payments`)).totals.outstanding;
    const sumRows = mine.reduce((a: number, r: any) => a + Number(r.outstanding), 0);
    expect(sumRows).toBe(Number(total));
    const csv = await ag.founder.get(`${API}/analytics/financial/summary?format=csv`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    const lines = (csv.body as Buffer).toString().trim().split(/\r?\n/);
    expect(lines[0]).toBe('section,metric,value'); expect(lines.length).toBeGreaterThan(5);
    const rcsv = await ag.founder.get(`${API}/analytics/financial/receivables?format=csv`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect((rcsv.body as Buffer).toString().split(/\r?\n/)[0]).toContain('sourceType');
  });
});
