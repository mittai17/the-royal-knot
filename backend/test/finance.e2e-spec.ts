/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configure } from '../src/main';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'RoyalKnot@2026';
const prisma = new PrismaClient();
const RUN = `FIN-${Date.now()}`;
let app: INestApplication;
let url: string;
const agents: Record<string, ReturnType<typeof request.agent>> = {};
const d = (r: request.Response) => r.body.data;
const made = { invoices: [] as string[], bills: [] as string[] };
let weddingId: string;
let milestoneId: string;

beforeAll(async () => {
  process.env.DISABLE_JOBS = 'true';
  process.env.AUTH_RATE_LIMIT = '1000';
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configure(app);
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  for (const who of ['founder', 'meera', 'neha', 'priya']) {
    const a = request.agent(url);
    await a.post('/api/v1/auth/login').send({ email: `${who}@royalknot.local`, password: PASSWORD }).expect(200);
    agents[who] = a;
  }
  const m = await prisma.paymentMilestone.findFirstOrThrow({ where: { type: 'FINAL', status: 'UPCOMING', wedding: { status: { not: 'CANCELLED' } } } });
  weddingId = m.weddingId; milestoneId = m.id;
});

afterAll(async () => {
  const keys = made.invoices.map((i) => `inv:${i}:`);
  for (const k of keys) await prisma.clientPayment.deleteMany({ where: { idempotencyKey: { startsWith: k } } });
  await prisma.approval.deleteMany({ where: { entityId: { in: [...made.invoices, ...made.bills] } } });
  await prisma.clientInvoice.deleteMany({ where: { id: { in: made.invoices } } });
  await prisma.vendorBill.deleteMany({ where: { id: { in: made.bills } } });
  await prisma.paymentMilestone.update({ where: { id: milestoneId }, data: { status: 'UPCOMING' } }).catch(() => undefined);
  await prisma.$disconnect();
  await app.close();
});

describe('client invoices', () => {
  let id: string;
  it('computes totals server-side from the lines (tax and rounding)', async () => {
    const r = await agents.meera.post('/api/v1/invoices').send({ weddingId, milestoneId, lines: [{ description: 'Fee', quantity: 1, unitPrice: 10000, taxRate: 18 }, { description: 'Extra', quantity: 3, unitPrice: 0.1 }] }).expect(201);
    id = d(r).id; made.invoices.push(id);
    expect(d(r).subtotal).toBe('10000.3'); expect(d(r).taxTotal).toBe('1800'); expect(d(r).total).toBe('11800.3'); expect(d(r).status).toBe('DRAFT');
  });
  it('refuses payments on a draft, then accepts them once sent', async () => {
    const body = { amount: 100, method: 'UPI', idempotencyKey: `${RUN}-draft` };
    await agents.meera.post(`/api/v1/invoices/${id}/payments`).send(body).expect(422);
    await agents.meera.post(`/api/v1/invoices/${id}/send`).expect(201);
  });
  it('partial payments move SENT -> PARTIALLY_PAID -> PAID and post to the milestone', async () => {
    const r1 = await agents.meera.post(`/api/v1/invoices/${id}/payments`).send({ amount: 5000, method: 'UPI', idempotencyKey: `${RUN}-p1` }).expect(201);
    expect(d(r1).invoice.status).toBe('PARTIALLY_PAID'); expect(d(r1).invoice.outstanding).toBe('6800.3');
    const r2 = await agents.meera.post(`/api/v1/invoices/${id}/payments`).send({ amount: 6800.3, method: 'BANK_TRANSFER', idempotencyKey: `${RUN}-p2` }).expect(201);
    expect(d(r2).invoice.status).toBe('PAID'); expect(d(r2).invoice.amountPaid).toBe('11800.3');
    expect(await prisma.clientPayment.count({ where: { idempotencyKey: { startsWith: `inv:${id}:` } } })).toBe(2);
  });
  it('is idempotent on the payment key and rejects overpayment', async () => {
    const again = await agents.meera.post(`/api/v1/invoices/${id}/payments`).send({ amount: 5000, method: 'UPI', idempotencyKey: `${RUN}-p1` }).expect(201);
    expect(d(again).duplicate).toBe(true); expect(d(again).invoice.amountPaid).toBe('11800.3');
    await agents.meera.post(`/api/v1/invoices/${id}/payments`).send({ amount: 1, method: 'UPI', idempotencyKey: `${RUN}-over` }).expect(422);
  });
  it('serialises concurrent identical submissions into one payment', async () => {
    const r = await agents.meera.post('/api/v1/invoices').send({ weddingId, milestoneId, lines: [{ description: 'Race', quantity: 1, unitPrice: 1000 }] }).expect(201);
    const rid = d(r).id; made.invoices.push(rid);
    await agents.meera.post(`/api/v1/invoices/${rid}/send`).expect(201);
    const body = { amount: 700, method: 'UPI', idempotencyKey: `${RUN}-race` };
    const rs = await Promise.all([1, 2, 3].map(() => agents.meera.post(`/api/v1/invoices/${rid}/payments`).send(body)));
    rs.forEach((x) => expect(x.status).toBe(201));
    const inv = await prisma.clientInvoice.findUniqueOrThrow({ where: { id: rid } });
    expect(inv.amountPaid.toString()).toBe('700');
  });
  it('holds a discounted invoice until the Founder approves the discount', async () => {
    const r = await agents.meera.post('/api/v1/invoices').send({ weddingId, discount: 500, lines: [{ description: 'Styling', quantity: 1, unitPrice: 5000 }] }).expect(201);
    const did = d(r).id; made.invoices.push(did);
    await agents.meera.post(`/api/v1/invoices/${did}/send`).expect(422);
    const ap = await prisma.approval.findFirstOrThrow({ where: { entityId: did, type: 'CLIENT_DISCOUNT' } });
    await agents.meera.post(`/api/v1/approvals/${ap.id}/approve`).send({}).expect(403);
    await agents.founder.post(`/api/v1/approvals/${ap.id}/approve`).send({ note: 'ok' }).expect(201);
    await agents.meera.post(`/api/v1/invoices/${did}/send`).expect(201);
  });
  it('enforces roles', async () => {
    await agents.neha.post('/api/v1/invoices').send({}).expect(403);
    await agents.priya.get('/api/v1/invoices').expect(403);
    await agents.neha.get('/api/v1/invoices').expect(200);
  });
});

describe('vendor bills', () => {
  it('walks submitted -> verified -> approved -> paid with idempotent, capped payments', async () => {
    const vendor = await prisma.vendor.findFirstOrThrow();
    const r = await agents.meera.post('/api/v1/vendor-bills').send({ vendorId: vendor.id, billNo: `${RUN}-B1`, subtotal: 40000, taxTotal: 2000 }).expect(201);
    const id = d(r).id; made.bills.push(id);
    expect(d(r).total).toBe('42000');
    await agents.meera.post(`/api/v1/vendor-bills/${id}/approve`).send({}).expect(422);
    await agents.meera.post(`/api/v1/vendor-bills/${id}/verify`).send({}).expect(201);
    await agents.meera.post(`/api/v1/vendor-bills/${id}/approve`).send({}).expect(201);
    const pay = { amount: 20000, method: 'UPI', idempotencyKey: `${RUN}-bp1` };
    await agents.meera.post(`/api/v1/vendor-bills/${id}/pay`).send(pay).expect(201);
    const dup = await agents.meera.post(`/api/v1/vendor-bills/${id}/pay`).send(pay).expect(201);
    expect(d(dup).duplicate).toBe(true); expect(d(dup).bill.amountPaid).toBe('20000');
    await agents.meera.post(`/api/v1/vendor-bills/${id}/pay`).send({ ...pay, amount: 30000, idempotencyKey: `${RUN}-bp2` }).expect(422);
    const fin = await agents.meera.post(`/api/v1/vendor-bills/${id}/pay`).send({ ...pay, amount: 22000, idempotencyKey: `${RUN}-bp3` }).expect(201);
    expect(d(fin).bill.status).toBe('PAID');
  });
  it('keeps vendor bills away from planners and vendors', async () => {
    await agents.neha.get('/api/v1/vendor-bills').expect(403);
  });
});
