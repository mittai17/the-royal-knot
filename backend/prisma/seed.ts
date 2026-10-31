/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Seed: users, vendors, templates (plain Prisma) + 25 weddings. The flagship "Mehta Wedding" is driven
 * through the real Nest services so demo data obeys the same business rules as live use.
 * Idempotent by default: when the database already holds the demo dataset the run is a no-op apart from upserting the
 * Keycloak demo users, so SEED_ON_START=true never duplicates (or wipes) data on a redeploy. SEED_FORCE=true wipes and rebuilds.
 * Demo password comes from DEMO_PASSWORD (dev only).
 */
import 'reflect-metadata';
import 'dotenv/config';
process.env.DISABLE_JOBS = 'true';
import { NestFactory } from '@nestjs/core';
import { PrismaClient, Prisma, Role, VendorCategory, PackageType, EventKind } from '@prisma/client';
import * as argon2 from 'argon2';
import { deflateSync, crc32 } from 'zlib';
import { AppModule } from '../src/app.module';
import { AuthUser } from '../src/common/decorators';
import { computeQuotation } from '../src/common/finance';
import { syncMilestones } from '../src/common/milestones';
import { DEFAULT_TEMPLATES } from '../src/modules/tasks/default-templates';
import { AgreementsService } from '../src/modules/agreements/agreements.service';
import { EnquiriesService } from '../src/modules/enquiries/enquiries.service';
import { EventsService } from '../src/modules/events/events.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { QuotationsService } from '../src/modules/quotations/quotations.service';
import { ReconciliationService } from '../src/modules/reconciliation/reconciliation.service';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { VendorsService } from '../src/modules/vendors/vendors.service';

const prisma = new PrismaClient();
const DAY = 864e5;
const NOW = new Date();
const PASSWORD = process.env.DEMO_PASSWORD ?? 'RoyalKnot@2026';
const L = 100000; // lakh
const CR = 10000000;

// deterministic randomness so every seed run yields the same dataset
let seedState = 20260131;
const rnd = () => { seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0; let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const round1k = (n: number) => Math.round(n / 1000) * 1000;
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY);
const istToday = (hh: number, mm = 0) => {
  const ist = new Date(NOW.getTime() + 5.5 * 3600e3);
  const iso = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`;
  return new Date(iso);
};

/** Tiny PNG "signature" (squiggle) so signed agreement PDFs have a visible signature without external assets. */
function signaturePng(seed: number): string {
  const w = 260, h = 70; const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const dot = (cx: number, cy: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && x < w && y >= 0 && y < h) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 64; raw[o + 1] = 24; raw[o + 2] = 39; } } };
  for (let x = 10; x < w - 10; x++) dot(x, Math.round(h / 2 + Math.sin(x / (7 + seed)) * 14 * Math.sin(x / 41 + seed) + Math.cos(x / 5) * 4));
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const VENDORS: { name: string; business?: string; category: VendorCategory; contact: string; phone: string; areas: string[]; base: number; unit: string; rating: number }[] = [
  { name: 'Royal Caterers', business: 'Royal Caterers Pvt Ltd', category: 'CATERING', contact: 'Harish Agarwal', phone: '+91 98290 11001', areas: ['Jaipur', 'Udaipur', 'Delhi'], base: 1200, unit: 'plate', rating: 4.7 },
  { name: 'Spice Route Caterers', category: 'CATERING', contact: 'Imran Qureshi', phone: '+91 98290 11002', areas: ['Jaipur', 'Jodhpur'], base: 1100, unit: 'plate', rating: 3.9 },
  { name: 'Maharaja Feast Co.', category: 'CATERING', contact: 'Devendra Rathore', phone: '+91 98290 11003', areas: ['Jaipur', 'Udaipur', 'Jodhpur', 'Delhi'], base: 1350, unit: 'plate', rating: 4.4 },
  { name: 'Lake Palace Kitchens', category: 'CATERING', contact: 'Sunita Bhatt', phone: '+91 94140 22004', areas: ['Udaipur'], base: 1300, unit: 'plate', rating: 4.5 },
  { name: 'Floral Dreams Decor', category: 'DECORATION', contact: 'Ritu Malhotra', phone: '+91 98290 12001', areas: ['Jaipur', 'Udaipur', 'Delhi', 'Goa'], base: 1800000, unit: 'event', rating: 4.8 },
  { name: 'Regal Mandap Decorators', category: 'DECORATION', contact: 'Bhanu Pratap', phone: '+91 98290 12002', areas: ['Jaipur', 'Jodhpur'], base: 1500000, unit: 'event', rating: 4.3 },
  { name: 'Bloom & Drape Studio', category: 'DECORATION', contact: 'Aisha Khan', phone: '+91 98290 12003', areas: ['Udaipur', 'Delhi', 'Goa'], base: 1600000, unit: 'event', rating: 4.5 },
  { name: 'Lens & Light Photography', category: 'PHOTOGRAPHY', contact: 'Kabir Anand', phone: '+91 98290 13001', areas: ['Jaipur', 'Udaipur', 'Delhi', 'Goa'], base: 450000, unit: 'package', rating: 4.9 },
  { name: 'Frame Stories', category: 'PHOTOGRAPHY', contact: 'Zoya Merchant', phone: '+91 98290 13002', areas: ['Jaipur', 'Delhi'], base: 380000, unit: 'package', rating: 4.4 },
  { name: 'Cine Vows Films', category: 'VIDEOGRAPHY', contact: 'Tarun Mehra', phone: '+91 98290 14001', areas: ['Jaipur', 'Udaipur', 'Delhi', 'Goa'], base: 320000, unit: 'package', rating: 4.6 },
  { name: 'SkyFrame Drones', category: 'VIDEOGRAPHY', contact: 'Lokesh Yadav', phone: '+91 98290 14002', areas: ['Jaipur', 'Udaipur'], base: 90000, unit: 'day', rating: 4.2 },
  { name: 'Amber Palace Venues', business: 'Amber Heritage Hospitality', category: 'VENUE', contact: 'Thakur Gajendra Singh', phone: '+91 98290 15001', areas: ['Jaipur'], base: 2800000, unit: 'event', rating: 4.8 },
  { name: 'Lake Pichola Resort', category: 'VENUE', contact: 'Meenakshi Sisodia', phone: '+91 94140 15002', areas: ['Udaipur'], base: 3200000, unit: 'event', rating: 4.9 },
  { name: 'Coastal Cove Beach Resort', category: 'VENUE', contact: 'Joaquim Fernandes', phone: '+91 98220 15003', areas: ['Goa'], base: 2600000, unit: 'event', rating: 4.6 },
  { name: 'Glow by Anita', category: 'MAKEUP', contact: 'Anita Bhandari', phone: '+91 98290 16001', areas: ['Jaipur', 'Udaipur', 'Delhi'], base: 150000, unit: 'package', rating: 4.7 },
  { name: 'Dhol Dhamaka Drummers', category: 'DRUMMERS', contact: 'Pappu Singh', phone: '+91 98290 17001', areas: ['Jaipur', 'Udaipur', 'Delhi', 'Jodhpur'], base: 60000, unit: 'event', rating: 4.5 },
  { name: 'DJ Beatbox Entertainment', category: 'ENTERTAINMENT', contact: 'Nikhil Sethi', phone: '+91 98290 18001', areas: ['Jaipur', 'Delhi', 'Goa'], base: 120000, unit: 'event', rating: 4.1 },
  { name: 'Rhythm Live Band', category: 'ENTERTAINMENT', contact: 'Joel Dsouza', phone: '+91 98220 18002', areas: ['Goa', 'Delhi', 'Jaipur'], base: 250000, unit: 'event', rating: 4.6 },
  { name: 'Sound Sutra Audio', category: 'SOUND', contact: 'Prakash Dev', phone: '+91 98290 19001', areas: ['Jaipur', 'Udaipur', 'Delhi'], base: 250000, unit: 'event', rating: 4.4 },
  { name: 'Lumen Lighting Co.', category: 'LIGHTING', contact: 'Gaurav Tiwari', phone: '+91 98290 20001', areas: ['Jaipur', 'Udaipur', 'Delhi', 'Goa'], base: 300000, unit: 'event', rating: 4.5 },
  { name: 'Rajputana Cabs & Coaches', category: 'TRANSPORTATION', contact: 'Mahaveer Jangid', phone: '+91 98290 21001', areas: ['Jaipur', 'Udaipur', 'Jodhpur'], base: 350000, unit: 'package', rating: 4.3 },
  { name: 'Heritage Stays Collective', category: 'ACCOMMODATION', contact: 'Pooja Rawat', phone: '+91 98290 22001', areas: ['Jaipur', 'Udaipur'], base: 1200000, unit: 'room block', rating: 4.6 },
  { name: 'Henna House Artists', category: 'OTHER', business: 'Mehendi artists', contact: 'Shabana Sheikh', phone: '+91 98290 23001', areas: ['Jaipur', 'Udaipur', 'Delhi'], base: 80000, unit: 'event', rating: 4.8 },
  { name: 'Vedic Rituals & Pandits', category: 'OTHER', business: 'Ritual services', contact: 'Pt. Ramesh Sharma', phone: '+91 98290 23002', areas: ['Jaipur', 'Udaipur', 'Delhi'], base: 50000, unit: 'ceremony', rating: 4.9 },
  { name: 'Sky Sparkle Fireworks', category: 'OTHER', business: 'Pyrotechnics', contact: 'Rakesh Pyro', phone: '+91 98290 23003', areas: ['Jaipur', 'Jodhpur'], base: 150000, unit: 'show', rating: 4.0 },
  { name: 'Sufi Nights Entertainment', category: 'ENTERTAINMENT', contact: 'Zubin Ali', phone: '+91 98290 18003', areas: ['Jaipur', 'Udaipur', 'Delhi'], base: 200000, unit: 'event', rating: 4.3 },
];

const STAFF: { key: string; name: string; role: Role; phone: string; cost: number }[] = [
  { key: 'founder', name: 'Aarav Royal', role: 'ADMIN', phone: '+91 98290 00001', cost: 0 },
  { key: 'neha', name: 'Neha Kapoor', role: 'PLANNER', phone: '+91 98290 00002', cost: 85000 },
  { key: 'arjun', name: 'Arjun Mehta', role: 'PLANNER', phone: '+91 98290 00003', cost: 85000 },
  { key: 'rahul', name: 'Rahul Singh', role: 'PLANNER', phone: '+91 98290 00004', cost: 80000 },
  { key: 'priya', name: 'Priya Sharma', role: 'EVENT_MANAGER', phone: '+91 98290 00005', cost: 90000 },
  { key: 'karan', name: 'Karan Joshi', role: 'EVENT_MANAGER', phone: '+91 98290 00006', cost: 85000 },
  { key: 'meera', name: 'Meera Iyer', role: 'FINANCE', phone: '+91 98290 00007', cost: 90000 },
  { key: 'vikram', name: 'Vikram Rathore', role: 'OPERATIONS', phone: '+91 98290 00008', cost: 45000 },
  { key: 'sana', name: 'Sana Qureshi', role: 'OPERATIONS', phone: '+91 98290 00009', cost: 45000 },
];

type Cfg = { groom: string; bride: string; surname: string; city: string; venue: string; guests: number; budget: number; pkg: PackageType; offset: number; status: 'COMPLETED' | 'PLANNING' | 'VENDOR_BOOKING' };
const OTHERS: Cfg[] = [
  { groom: 'Vihaan', bride: 'Ishita', surname: 'Singhania', city: 'Jaipur', venue: 'Rambagh Lawns', guests: 450, budget: 130 * L, pkg: 'FULL_SERVICE', offset: -162, status: 'COMPLETED' },
  { groom: 'Aditya', bride: 'Kavya', surname: 'Khanna', city: 'Udaipur', venue: 'Lake Pichola Resort', guests: 300, budget: 85 * L, pkg: 'FULL_SERVICE', offset: -140, status: 'COMPLETED' },
  { groom: 'Rishi', bride: 'Tanvi', surname: 'Bansal', city: 'Jodhpur', venue: 'Umaid Heritage Hall', guests: 380, budget: 70 * L, pkg: 'PARTIAL', offset: -118, status: 'COMPLETED' },
  { groom: 'Manav', bride: 'Diya', surname: 'Malhotra', city: 'Delhi', venue: 'The Grand Farmhouse', guests: 520, budget: 140 * L, pkg: 'FULL_SERVICE', offset: -96, status: 'COMPLETED' },
  { groom: 'Yash', bride: 'Naina', surname: 'Chauhan', city: 'Jaipur', venue: 'Amber Palace Venues', guests: 420, budget: 110 * L, pkg: 'FULL_SERVICE', offset: -74, status: 'COMPLETED' },
  { groom: 'Dev', bride: 'Pooja', surname: 'Rathore', city: 'Udaipur', venue: 'City Palace Courtyard', guests: 260, budget: 90 * L, pkg: 'PARTIAL', offset: -55, status: 'COMPLETED' },
  { groom: 'Kunal', bride: 'Riya', surname: 'Joshi', city: 'Goa', venue: 'Coastal Cove Beach Resort', guests: 220, budget: 75 * L, pkg: 'FULL_SERVICE', offset: -38, status: 'COMPLETED' },
  { groom: 'Samar', bride: 'Alisha', surname: 'Saxena', city: 'Jaipur', venue: 'Samode Haveli', guests: 350, budget: 100 * L, pkg: 'FULL_SERVICE', offset: -18, status: 'COMPLETED' },
  { groom: 'Pranav', bride: 'Neelam', surname: 'Sharma', city: 'Udaipur', venue: 'Lake Pichola Resort', guests: 350, budget: 95 * L, pkg: 'FULL_SERVICE', offset: 14, status: 'VENDOR_BOOKING' },
  { groom: 'Arnav', bride: 'Simran', surname: 'Kapoor', city: 'Delhi', venue: 'Leela Gardens', guests: 600, budget: 2 * CR, pkg: 'FULL_SERVICE', offset: 26, status: 'VENDOR_BOOKING' },
  { groom: 'Nikhil', bride: 'Sneha', surname: 'Agarwal', city: 'Goa', venue: 'Coastal Cove Beach Resort', guests: 400, budget: 120 * L, pkg: 'FULL_SERVICE', offset: 40, status: 'VENDOR_BOOKING' },
  { groom: 'Harsh', bride: 'Bhavna', surname: 'Mittal', city: 'Jaipur', venue: 'Jai Mahal Lawns', guests: 300, budget: 65 * L, pkg: 'PARTIAL', offset: 52, status: 'PLANNING' },
  { groom: 'Tushar', bride: 'Anjali', surname: 'Jain', city: 'Jaipur', venue: 'Amber Palace Venues', guests: 480, budget: 125 * L, pkg: 'FULL_SERVICE', offset: 61, status: 'PLANNING' },
  { groom: 'Gaurav', bride: 'Megha', surname: 'Goenka', city: 'Delhi', venue: 'Taj Palace Ballroom', guests: 550, budget: 160 * L, pkg: 'FULL_SERVICE', offset: 72, status: 'PLANNING' },
  { groom: 'Rohit', bride: 'Chitra', surname: 'Bhatia', city: 'Udaipur', venue: 'Fateh Garh Terrace', guests: 280, budget: 80 * L, pkg: 'FULL_SERVICE', offset: 84, status: 'PLANNING' },
  { groom: 'Abhay', bride: 'Divya', surname: 'Shekhawat', city: 'Jaisalmer', venue: 'Suryagarh Fort', guests: 250, budget: 88 * L, pkg: 'FULL_SERVICE', offset: 95, status: 'PLANNING' },
  { groom: 'Lakshya', bride: 'Mehak', surname: 'Rajput', city: 'Jodhpur', venue: 'Ajit Bhawan Gardens', guests: 330, budget: 72 * L, pkg: 'PARTIAL', offset: 108, status: 'PLANNING' },
  { groom: 'Siddharth', bride: 'Aarti', surname: 'Gupta', city: 'Jaipur', venue: 'Rambagh Lawns', guests: 410, budget: 105 * L, pkg: 'FULL_SERVICE', offset: 120, status: 'PLANNING' },
  { groom: 'Varun', bride: 'Lakshmi', surname: 'Reddy', city: 'Goa', venue: 'Coastal Cove Beach Resort', guests: 260, budget: 98 * L, pkg: 'FULL_SERVICE', offset: 133, status: 'PLANNING' },
  { groom: 'Anirudh', bride: 'Meenal', surname: 'Nair', city: 'Udaipur', venue: 'Lake Pichola Resort', guests: 320, budget: 115 * L, pkg: 'FULL_SERVICE', offset: 147, status: 'PLANNING' },
  { groom: 'Kartik', bride: 'Sana', surname: 'Iyer', city: 'Ranthambore', venue: 'Aman-i-Khás Camp', guests: 180, budget: 60 * L, pkg: 'PARTIAL', offset: 160, status: 'PLANNING' },
  { groom: 'Ayaan', bride: 'Rhea', surname: 'Desai', city: 'Jaipur', venue: 'Amber Palace Venues', guests: 440, budget: 118 * L, pkg: 'FULL_SERVICE', offset: 172, status: 'PLANNING' },
  { groom: 'Jai', bride: 'Tara', surname: 'Ahuja', city: 'Delhi', venue: 'Leela Gardens', guests: 500, budget: 150 * L, pkg: 'FULL_SERVICE', offset: 185, status: 'PLANNING' },
  { groom: 'Neel', bride: 'Ira', surname: 'Tandon', city: 'Udaipur', venue: 'City Palace Courtyard', guests: 290, budget: 92 * L, pkg: 'PARTIAL', offset: 200, status: 'PLANNING' },
];

const SHARE: Partial<Record<VendorCategory, number>> = { VENUE: 0.24, CATERING: 0.22, DECORATION: 0.2, PHOTOGRAPHY: 0.06, MAKEUP: 0.03, ENTERTAINMENT: 0.06, LIGHTING: 0.07, TRANSPORTATION: 0.06, ACCOMMODATION: 0.06 };

/** Demo users that mirror the Keycloak realm import (fixed ids). Upserted by email, so safe to run any number of times. */
const KEYCLOAK_USERS: { id: string; email: string; name: string; role: Role; phone: string }[] = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'arjun@royalknot.in', name: 'Arjun Rao', role: 'ADMIN', phone: '+91 98290 00101' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'priya@royalknot.in', name: 'Priya Nair', role: 'PLANNER', phone: '+91 98290 00102' },
  { id: '33333333-3333-3333-3333-333333333333', email: 'kabir@royalknot.in', name: 'Kabir Sethi', role: 'EVENT_MANAGER', phone: '+91 98290 00103' },
  { id: '44444444-4444-4444-4444-444444444444', email: 'meera@royalknot.in', name: 'Meera Shah', role: 'FINANCE', phone: '+91 98290 00104' },
  { id: '55555555-5555-5555-5555-555555555555', email: 'rohan@royalknot.in', name: 'Rohan Das', role: 'OPERATIONS', phone: '+91 98290 00105' },
];

async function upsertKeycloakUsers() {
  const passwordHash = await argon2.hash(PASSWORD);
  for (const u of KEYCLOAK_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, phone: u.phone, status: 'ACTIVE' },
      create: { ...u, passwordHash, mustChangePassword: false },
    });
  }
  console.log(`Keycloak demo users upserted: ${KEYCLOAK_USERS.map((u) => u.email).join(', ')}`);
}

async function wipe() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

async function main() {
  console.log('Seeding The Royal Knot…');
  const existingWeddings = await prisma.wedding.count();
  const existingUsers = await prisma.user.count();
  if ((existingWeddings > 0 || existingUsers > 0) && process.env.SEED_FORCE !== 'true') {
    console.log(`Database already has data (${existingWeddings} weddings, ${existingUsers} users) — skipping destructive seed. Ensuring Keycloak demo users are upserted.`);
    await upsertKeycloakUsers();
    return;
  }
  await wipe();

  // ---------- users & teams ----------
  const hash = await argon2.hash(PASSWORD);
  const users: Record<string, AuthUser> = {};
  for (const s of STAFF) {
    const u = await prisma.user.create({ data: { email: `${s.key}@royalknot.local`, name: s.name, role: s.role, phone: s.phone, passwordHash: hash, monthlyCost: s.cost, mustChangePassword: process.env.NODE_ENV === 'production' } });
    users[s.key] = { id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: false };
  }
  const teams = { Planning: ['neha', 'arjun', 'rahul'], 'Event Operations': ['priya', 'karan', 'vikram', 'sana'], Finance: ['meera'] };
  for (const [name, keys] of Object.entries(teams)) await prisma.team.create({ data: { name, members: { create: keys.map((k) => ({ userId: users[k].id })) } } });

  // ---------- templates ----------
  for (const t of DEFAULT_TEMPLATES) {
    await prisma.taskTemplate.create({ data: { name: t.name, isDefault: true, items: { create: t.items.map((i, idx) => ({ ...i, sortOrder: idx })) } } });
  }
  const body = (pkg: string) => `SERVICE AGREEMENT — ${pkg}\n\nThis agreement is made between The Royal Knot ("Planner") and {{couple}} ("Client") for the wedding "{{wedding}}".\n\n1. Event: {{dates}} at {{venue}}, {{location}}. Expected guests: {{guests}}.\n2. Package: {{package}}.\n3. Scope of services: {{scope}}\n4. Contract amount: {{amount}} (INR), inclusive of agreed vendor pass-throughs.\n5. Payment terms: {{terms}}.\n6. Additional guests, extended hours or extra services beyond this agreement will be billed at the vendor's contracted rates after client approval.\n7. Cancellations: the booking payment is non-refundable; later payments follow the schedule above.\n\nSigned by both parties using internal digital signature capture.`;
  await prisma.agreementTemplate.createMany({ data: [{ name: 'Full-Service Wedding Agreement', packageType: 'FULL_SERVICE', body: body('FULL-SERVICE WEDDING') }, { name: 'Day-of Management Agreement', packageType: 'PARTIAL', body: body('PARTIAL / DAY-OF WEDDING MANAGEMENT') }] });

  // ---------- vendors ----------
  const vendors: Record<string, string> = {};
  const vendorRows = [];
  for (const v of VENDORS) {
    const row = await prisma.vendor.create({ data: { name: v.name, businessName: v.business ?? v.name, category: v.category, contactName: v.contact, phone: v.phone, email: `${v.name.toLowerCase().replace(/[^a-z]+/g, '.')}@vendors.local`, address: `${v.areas[0]}, Rajasthan`, serviceAreas: v.areas, basePrice: v.base, priceUnit: v.unit, rating: v.rating, gstin: `08AAAC${Math.floor(1000 + rnd() * 8999)}A1Z${Math.floor(rnd() * 9)}`, bankDetails: `HDFC Bank · A/c ****${Math.floor(1000 + rnd() * 8999)}`, available: rnd() > 0.1, services: { create: [{ name: `${v.category[0] + v.category.slice(1).toLowerCase()} — standard`, unit: v.unit, price: v.base }] } } });
    vendors[v.name] = row.id; vendorRows.push(row);
  }

  // ---------- app context for service-driven flows ----------
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const get = <T,>(c: new (...a: any[]) => T) => app.get(c, { strict: false });
  const enquiries = get(EnquiriesService), agreements = get(AgreementsService), quotations = get(QuotationsService), payments = get(PaymentsService), tasks = get(TasksService), events = get(EventsService), recon = get(ReconciliationService), vendorsSvc = get(VendorsService), notif = get(NotificationsService);
  const neha = users.neha, meera = users.meera, priya = users.priya, founder = users.founder;

  // =====================================================================
  //  FLAGSHIP: MEHTA WEDDING (Jaipur · 400 guests · ₹1.5 Cr budget)
  // =====================================================================
  const mehtaStart = new Date(istToday(0, 0).getTime() - 2 * DAY); // day 3 of 3 is today → event day
  const enq = await enquiries.create({ brideName: 'Ananya Verma', groomName: 'Rohan Mehta', phone: '+91 98110 55501', email: 'rohan.mehta@example.com', source: 'INSTAGRAM', preferredDate: mehtaStart.toISOString(), location: 'Jaipur', guestCount: 400, budget: 15 * CR / 10, theme: 'Royal Rajputana winter celebration', packageType: 'FULL_SERVICE', assignedToId: neha.id, followUpAt: daysFromNow(-90).toISOString(), notes: 'Found us on Instagram. Winter wedding in Jaipur, 3 days, 400 guests. Family wants a palace venue and live counters.' } as any, neha);
  for (const [stage, note] of [['CONTACTED', 'Intro call with Rohan and his father'], ['CONSULTATION_SCHEDULED', 'Consultation at the Jaipur studio'], ['PROPOSAL_SENT', 'Sent full-service proposal with 3 vendor shortlists'], ['NEGOTIATION', 'Negotiated contract value to ₹1.35 Cr']] as const) {
    await enquiries.update(enq.id, { stage } as any, neha); await enquiries.addActivity(enq.id, note, 'note', neha);
  }
  const wedding = await enquiries.convert(enq.id, { name: 'Mehta Wedding', venue: 'Jaipur Palace', startDate: mehtaStart.toISOString(), eventDays: 3, expectedGuests: 400, contractValue: 135 * L, plannerId: neha.id } as any, neha);
  const WID = wedding.id;
  await prisma.wedding.update({ where: { id: WID }, data: { theme: 'Royal Rajputana winter celebration' } });

  // agreement → signed (PDF stored in MinIO when Gotenberg/MinIO are reachable)
  const agr = await agreements.generate(WID, undefined, neha);
  await agreements.sign(agr.id, { signerName: 'Rohan Mehta', signerRole: 'CLIENT', signatureData: signaturePng(1) }, neha, '10.0.0.5');
  await agreements.sign(agr.id, { signerName: 'Neha Kapoor', signerRole: 'PLANNER', signatureData: signaturePng(3) }, neha, '10.0.0.6');

  // 3 caterer quotations, structured lines, winner = recommended (not cheapest)
  const rfq = await quotations.createRfq({ weddingId: WID, category: 'CATERING', title: 'Catering — 3-day wedding, 400 guests', brief: 'Mehendi lunch, Sangeet dinner and wedding banquet. Vegetarian + Jain counters. Live counters required.', vendorIds: [vendors['Spice Route Caterers'], vendors['Maharaja Feast Co.'], vendors['Royal Caterers']] }, neha);
  const quoteSpecs: Record<string, any> = {
    'Spice Route Caterers': { menu: 'North Indian & Rajasthani thali; 2 starters, 4 mains', guests: 400, guestCapacity: 380, ratePerPlate: 1100, extraHourCharge: 8000, rating: 3, notes: 'Live counters not included. Capacity limited to 380.', items: [
      { name: 'Wedding banquet plate', quantity: 400, unit: 'plate', unitPrice: 1100, taxRate: 5 }, { name: 'Sangeet dinner plate', quantity: 400, unit: 'plate', unitPrice: 950, taxRate: 5 }, { name: 'Mehendi lunch plate', quantity: 400, unit: 'plate', unitPrice: 700, taxRate: 5 },
      { name: 'Live counters (6)', description: 'Chaat, jalebi, pasta, dosa, kulfi, paan', quantity: 6, unit: 'counter', unitPrice: 25000, taxRate: 18, included: false }, { name: 'Service staff', quantity: 40, unit: 'staff', unitPrice: 1200, taxRate: 18 }] },
    'Maharaja Feast Co.': { menu: 'Royal Rajasthani banquet; 3 starters, 6 mains, 3 desserts', guests: 400, guestCapacity: 500, ratePerPlate: 1350, extraHourCharge: 12000, rating: 4, notes: 'Includes 4 live counters. Premium crockery.', items: [
      { name: 'Wedding banquet plate', quantity: 400, unit: 'plate', unitPrice: 1350, taxRate: 5 }, { name: 'Sangeet dinner plate', quantity: 400, unit: 'plate', unitPrice: 1200, taxRate: 5 }, { name: 'Mehendi lunch plate', quantity: 400, unit: 'plate', unitPrice: 850, taxRate: 5 },
      { name: 'Live counters (4)', quantity: 4, unit: 'counter', unitPrice: 28000, taxRate: 18 }, { name: 'Service staff', quantity: 50, unit: 'staff', unitPrice: 1300, taxRate: 18 }, { name: 'Premium crockery & cutlery', quantity: 1, unit: 'lot', unitPrice: 60000, taxRate: 18 }] },
    'Royal Caterers': { menu: 'Signature Rajasthani + continental banquet; 4 starters, 7 mains, live dessert station', guests: 400, guestCapacity: 600, ratePerPlate: 1200, extraHourCharge: 15000, rating: 5, notes: 'Includes 6 live counters, tasting session and dedicated banquet captain. Extra plates at ₹1,200.', items: [
      { name: 'Wedding banquet plate', quantity: 400, unit: 'plate', unitPrice: 1200, taxRate: 5 }, { name: 'Sangeet dinner plate', quantity: 400, unit: 'plate', unitPrice: 1050, taxRate: 5 }, { name: 'Mehendi lunch plate', quantity: 400, unit: 'plate', unitPrice: 800, taxRate: 5 },
      { name: 'Live counters (6)', description: 'Chaat, jalebi, pasta, dosa, kulfi, paan', quantity: 6, unit: 'counter', unitPrice: 25000, taxRate: 18 }, { name: 'Service staff', quantity: 50, unit: 'staff', unitPrice: 1200, taxRate: 18 }, { name: 'Banquet captain & tasting session', quantity: 1, unit: 'lot', unitPrice: 40000, taxRate: 18 }] },
  };
  const fresh = await quotations.comparison(WID, 'CATERING', rfq.rfqGroup);
  const requestOf = (name: string) => rfq.requests.find((r: any) => r.vendor.name === name)!.id;
  void fresh;
  let winnerQuote = '';
  for (const [vname, spec] of Object.entries(quoteSpecs)) {
    const q = await quotations.submit(requestOf(vname), spec, neha);
    if (vname === 'Royal Caterers') winnerQuote = q.id;
  }
  await quotations.select(winnerQuote, { note: 'Best balance of price, capacity (600), live counters and rating. Spice Route is cheaper but capped at 380 guests and excludes counters.' }, neha);

  // remaining vendors (17 more → 18 total) with contract amounts
  const mehtaVendors: [string, VendorCategory, number][] = [
    ['Amber Palace Venues', 'VENUE', 2800000], ['Floral Dreams Decor', 'DECORATION', 2200000], ['Regal Mandap Decorators', 'DECORATION', 500000], ['Lens & Light Photography', 'PHOTOGRAPHY', 450000], ['Cine Vows Films', 'VIDEOGRAPHY', 320000],
    ['SkyFrame Drones', 'VIDEOGRAPHY', 90000], ['Glow by Anita', 'MAKEUP', 150000], ['Dhol Dhamaka Drummers', 'DRUMMERS', 60000], ['DJ Beatbox Entertainment', 'ENTERTAINMENT', 120000], ['Rhythm Live Band', 'ENTERTAINMENT', 250000],
    ['Sound Sutra Audio', 'SOUND', 250000], ['Lumen Lighting Co.', 'LIGHTING', 300000], ['Rajputana Cabs & Coaches', 'TRANSPORTATION', 350000], ['Heritage Stays Collective', 'ACCOMMODATION', 1200000], ['Henna House Artists', 'OTHER', 80000],
    ['Vedic Rituals & Pandits', 'OTHER', 50000], ['Sky Sparkle Fireworks', 'OTHER', 150000],
  ];
  const wvIds: Record<string, string> = {};
  for (const [name, category, amount] of mehtaVendors) { const wv = await vendorsSvc.assign(WID, { vendorId: vendors[name], category, contractAmount: amount }, neha); wvIds[name] = wv.id; }
  const caterer = await prisma.weddingVendor.findFirstOrThrow({ where: { weddingId: WID, category: 'CATERING' } });
  wvIds['Royal Caterers'] = caterer.id;

  // client payments: booking (→ auto-generates the checklist) and advance
  const bookingRes = await payments.record({ weddingId: WID, milestone: 'BOOKING', amount: 2700000, method: 'BANK_TRANSFER', reference: 'NEFT-HDFC-20260711-4481', paidAt: daysFromNow(-112).toISOString(), idempotencyKey: 'seed-mehta-booking' } as any, meera);
  console.log(`  Mehta booking recorded → ${bookingRes.tasksGenerated?.created} tasks generated`);
  await payments.record({ weddingId: WID, milestone: 'ADVANCE', amount: 5400000, method: 'BANK_TRANSFER', reference: 'NEFT-HDFC-20260926-7712', paidAt: daysFromNow(-36).toISOString(), idempotencyKey: 'seed-mehta-advance' } as any, meera);

  // checklist progress: 92% complete, rest in motion
  const mTasks = await prisma.weddingTask.findMany({ where: { weddingId: WID }, orderBy: { dueDate: 'asc' } });
  const keep = new Set(['final-vendor-brief', 'post-close', 'cater-headcount']);
  for (const t of mTasks) {
    if (keep.has(t.templateKey!)) continue;
    await prisma.weddingTask.update({ where: { id: t.id }, data: { status: 'COMPLETED', completedAt: new Date(t.dueDate.getTime() - between(0.5, 6) * DAY), evidenceNote: t.category === 'VENUE' ? 'Signed venue contract and layout PDF filed' : undefined } });
  }
  await prisma.weddingTask.updateMany({ where: { weddingId: WID, templateKey: 'final-vendor-brief' }, data: { status: 'IN_PROGRESS' } });
  await prisma.weddingTask.updateMany({ where: { weddingId: WID, templateKey: 'cater-headcount' }, data: { status: 'UNDER_REVIEW', evidenceNote: 'Caterer asked to confirm 460 plates — pending written confirmation' } });
  await prisma.weddingTask.updateMany({ where: { weddingId: WID, templateKey: 'cater-headcount' }, data: { dueDate: daysFromNow(-1) } });

  // vendor advances (≈45%)
  for (const [name, wvId] of Object.entries(wvIds)) {
    const wv = await prisma.weddingVendor.findUniqueOrThrow({ where: { id: wvId } });
    await payments.recordVendor(WID, { weddingVendorId: wvId, kind: 'ADVANCE', amount: Math.round(Number(wv.contractAmount) * 0.45 / 100) * 100, method: 'BANK_TRANSFER', reference: `ADV-${name.slice(0, 3).toUpperCase()}-${Math.floor(1000 + rnd() * 8999)}`, paidAt: daysFromNow(-between(40, 95)).toISOString(), idempotencyKey: `seed-mehta-adv-${wvId}` } as any, meera);
  }

  // event day: schedule, arrivals, incident, guest counts
  await events.setStatus(WID, { status: 'EVENT_DAY' }, priya);
  const evs = await prisma.weddingEvent.findMany({ where: { weddingId: WID } });
  const ceremony = evs.find((e) => e.kind === 'CEREMONY');
  const sched: [number, number, string, string, string, number?][] = [
    [10, 0, 'Decoration Team Arrival', 'Vikram Rathore', 'Decor & Setup', 0], [12, 0, 'Catering Setup', 'Karan Joshi', 'Banquet', 5], [14, 0, 'Sound Check', 'Priya Sharma', 'AV Crew', 25],
    [17, 0, 'Guest Arrival', 'Sana Qureshi', 'Guest Desk'], [19, 0, 'Groom Arrival (Baraat)', 'Priya Sharma', 'Family Movement'], [19, 30, 'Garland Exchange (Jaimala)', 'Priya Sharma', 'Stage Crew'],
    [20, 0, 'Wedding Vows (Pheras)', 'Priya Sharma', 'Ritual Team'], [21, 0, 'Reception', 'Karan Joshi', 'Banquet & AV'], [23, 0, 'Event Closure', 'Vikram Rathore', 'Operations'],
  ];
  for (const [h, m, title, who, team, delay] of sched) {
    const at = istToday(h, m);
    const t = await events.addTimeline(WID, { title, scheduledAt: at.toISOString(), eventId: ceremony?.id, responsible: who, team, notes: undefined } as any, priya);
    const ageMin = (NOW.getTime() - at.getTime()) / 60000;
    if (title === 'Sound Check') await events.updateTimeline(t.id, { status: ageMin > 90 ? 'COMPLETED' : 'DELAYED', actualAt: ageMin > 90 ? new Date(at.getTime() + 25 * 60000).toISOString() : undefined, delayMinutes: 25, notes: 'DJ arrived 30 min late; sound check pushed' } as any, priya);
    else if (ageMin > 60) await events.updateTimeline(t.id, { status: 'COMPLETED', actualAt: new Date(at.getTime() + (delay ?? 0) * 60000).toISOString() } as any, priya);
    else if (ageMin > 0) await events.updateTimeline(t.id, { status: 'IN_PROGRESS', actualAt: at.toISOString() } as any, priya);
  }
  const arrivals: [string, number, 'ARRIVED' | 'DELAYED' | 'NOT_ARRIVED' | 'COMPLETED', number][] = [
    ['Floral Dreams Decor', 9 * 60 + 45, 'COMPLETED', 0], ['Regal Mandap Decorators', 10 * 60, 'ARRIVED', 5], ['Royal Caterers', 11 * 60 + 30, 'ARRIVED', 0], ['Lens & Light Photography', 12 * 60 + 15, 'ARRIVED', 0], ['Cine Vows Films', 12 * 60 + 15, 'ARRIVED', 10],
    ['SkyFrame Drones', 16 * 60, 'NOT_ARRIVED', 0], ['Glow by Anita', 9 * 60, 'COMPLETED', 0], ['Dhol Dhamaka Drummers', 18 * 60 + 30, 'NOT_ARRIVED', 0], ['DJ Beatbox Entertainment', 11 * 60 + 50, 'DELAYED', 30], ['Rhythm Live Band', 15 * 60, 'ARRIVED', 0],
    ['Sound Sutra Audio', 10 * 60 + 30, 'ARRIVED', 0], ['Lumen Lighting Co.', 11 * 60, 'ARRIVED', 0], ['Rajputana Cabs & Coaches', 8 * 60, 'ARRIVED', 0], ['Heritage Stays Collective', 8 * 60, 'COMPLETED', 0], ['Henna House Artists', 9 * 60, 'COMPLETED', 0],
    ['Vedic Rituals & Pandits', 18 * 60, 'NOT_ARRIVED', 0], ['Sky Sparkle Fireworks', 20 * 60, 'NOT_ARRIVED', 0], ['Amber Palace Venues', 7 * 60, 'COMPLETED', 0],
  ];
  for (const [name, minutes, status, delay] of arrivals) {
    const expected = istToday(Math.floor(minutes / 60), minutes % 60);
    const actuallyHappened = status === 'ARRIVED' || status === 'COMPLETED' || status === 'DELAYED';
    const effective: typeof status = status !== 'NOT_ARRIVED' && expected > NOW && status !== 'DELAYED' ? 'NOT_ARRIVED' : status;
    await events.setArrival(wvIds[name], { status: effective, expectedAt: expected.toISOString(), actualAt: effective === 'ARRIVED' || effective === 'COMPLETED' ? new Date(expected.getTime() + delay * 60000).toISOString() : undefined, delayMinutes: delay || undefined } as any, vendorActor(name));
    void actuallyHappened;
  }
  function vendorActor(_n: string) { return users.vikram; }
  const inc1 = await events.createIncident(WID, { title: 'DJ arrives late', description: 'DJ Beatbox Entertainment is 30 minutes behind schedule; sound check delayed. Backup playlist and band standby arranged.', severity: 'HIGH', assignedToId: priya.id }, priya);
  await events.updateIncident(inc1.id, { status: 'IN_PROGRESS' }, priya);
  const inc2 = await events.createIncident(WID, { title: 'Florist requests extra generator', description: 'Decoration crew needs an additional 25 kVA generator for the mandap lighting rig.', severity: 'MEDIUM', assignedToId: users.vikram.id }, users.vikram);
  await events.updateIncident(inc2.id, { status: 'RESOLVED', resolution: 'Second generator arranged from Lumen Lighting; installed at 11:40.' }, users.vikram);
  await events.createIncident(WID, { title: "Bride's vehicle delayed", description: 'Bridal car stuck behind a procession near Sanganer; ETA +20 minutes.', severity: 'MEDIUM', assignedToId: users.karan.id }, users.karan);
  await events.createIncident(WID, { title: 'Catering needs extra resources', description: 'Banquet captain requests 6 additional service staff for the live counters.', severity: 'LOW', assignedToId: users.karan.id }, priya);

  // guests (≈400 invited heads: 290 rows + 110 plus-ones)
  const first = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Pari', 'Myra', 'Kiara', 'Riya', 'Navya', 'Anika', 'Rajesh', 'Sunita', 'Mukesh', 'Kavita', 'Suresh', 'Meena', 'Vikas', 'Rekha', 'Ashok', 'Geeta'];
  const last = ['Mehta', 'Verma', 'Sharma', 'Agarwal', 'Gupta', 'Jain', 'Singh', 'Rathore', 'Shekhawat', 'Bansal', 'Khandelwal', 'Maheshwari', 'Kothari', 'Chopra', 'Bhandari'];
  const groups = ['Mehta Family', 'Verma Family', 'Close Friends', 'College Friends', 'Business Associates', 'Extended Relatives', 'Neighbours'];
  const diets = [null, null, null, 'Vegetarian', 'Vegetarian', 'Jain', 'Vegan', 'Gluten-free'];
  const guestRows: Prisma.GuestCreateManyInput[] = [];
  let heads = 0, plusLeft = 110;
  for (let i = 0; i < 290; i++) {
    const plus = plusLeft > 0 && rnd() < 0.38 ? 1 : 0; plusLeft -= plus; heads += 1 + plus;
    const r = rnd(); const rsvp = r < 0.62 ? 'YES' : r < 0.7 ? 'NO' : r < 0.75 ? 'MAYBE' : 'PENDING';
    const checked = rsvp === 'YES' && rnd() < 0.7;
    guestRows.push({ weddingId: WID, name: `${pick(first)} ${pick(last)}`, phone: `+91 9${Math.floor(100000000 + rnd() * 899999999)}`, email: rnd() < 0.5 ? `guest${i}@example.com` : null, groupName: pick(groups), category: pick(['Bride side', 'Groom side', 'Friends']), invitationStatus: rnd() < 0.9 ? 'DELIVERED' : 'SENT', rsvp, plusOnes: plus, dietary: pick(diets), accommodationNeeded: rnd() < 0.3, checkedIn: checked, checkedInAt: checked ? new Date(NOW.getTime() - between(5, 240) * 60000) : null, checkedInCount: checked ? 1 + plus : 0 });
  }
  guestRows[0].plusOnes = (guestRows[0].plusOnes ?? 0) + (400 - heads); // land exactly on 400 invited heads
  await prisma.guest.createMany({ data: guestRows });
  const act = await events.setActualGuests(WID, { actualGuests: 460 }, priya); // → ₹72,000 extra catering charge
  console.log(`  Actual guests 460 → extra charge ${act.charge?.amount}`);

  // reconciliation inputs
  await recon.ensure(WID);
  const djOvertime = await recon.addCharge(WID, { weddingVendorId: wvIds['DJ Beatbox Entertainment'], type: 'DJ_OVERTIME', description: 'DJ overtime — 2 extra hours at ₹15,000/hr', quantity: 2, unitPrice: 15000, billToClient: true }, meera);
  await recon.updateCharge(djOvertime.id, { approved: true }, meera);
  await recon.addCharge(WID, { weddingVendorId: wvIds['Floral Dreams Decor'], type: 'DECORATION', description: 'Extra floral arch at reception entrance', quantity: 1, unitPrice: 45000, billToClient: true }, meera);
  await recon.addCharge(WID, { weddingVendorId: wvIds['Lumen Lighting Co.'], type: 'EQUIPMENT', description: 'Additional 25 kVA generator hire', quantity: 1, unitPrice: 18000, billToClient: false }, meera);
  const sett = await prisma.vendorSettlement.findMany({ where: { reconciliation: { weddingId: WID } }, include: { weddingVendor: { include: { vendor: true } } } });
  for (const s of sett) {
    const name = s.weddingVendor.vendor.name;
    if (['Royal Caterers'].includes(name)) await prisma.vendorSettlement.update({ where: { id: s.id }, data: { actualInvoice: Number(s.negotiated) + 72000, invoiceRef: 'RC/INV/26-0417' } });
    if (name === 'DJ Beatbox Entertainment') await prisma.vendorSettlement.update({ where: { id: s.id }, data: { actualInvoice: Number(s.negotiated) + 30000, invoiceRef: 'DJB-2291' } });
    if (['Glow by Anita', 'Henna House Artists', 'Amber Palace Venues'].includes(name)) await prisma.vendorSettlement.update({ where: { id: s.id }, data: { actualInvoice: s.negotiated, invoiceRef: `INV-${name.slice(0, 3).toUpperCase()}-0${Math.floor(10 + rnd() * 80)}` } });
  }
  // Glow by Anita and Henna House are fully done → settle them through the service
  const rec = await prisma.reconciliation.findUniqueOrThrow({ where: { weddingId: WID } });
  for (const n of ['Glow by Anita', 'Henna House Artists']) await recon.settle(rec.id, { weddingVendorId: wvIds[n], method: 'BANK_TRANSFER', reference: `FINAL-${n.slice(0, 4).toUpperCase()}`, idempotencyKey: `seed-mehta-settle-${n.slice(0, 4)}` } as any, meera);

  // expenses (planned vs actual)
  const exp = (category: string, description: string, amount: number, status: 'APPROVED' | 'PENDING' | 'REJECTED', daysAgo: number, extra: Partial<Prisma.ExpenseUncheckedCreateInput> = {}) => prisma.expense.create({ data: { weddingId: WID, category, description, amount, date: daysFromNow(-daysAgo), status, method: 'BANK_TRANSFER', responsibleId: pick([users.priya.id, users.vikram.id, users.neha.id]), ...extra } });
  await exp('Travel', 'Site visits Jaipur ↔ Delhi (flights + cabs)', 68000, 'APPROVED', 100); await exp('Printing', 'Invitation suite, itineraries and welcome kits', 124000, 'APPROVED', 80); await exp('Permits', 'Police & music licences, fire NOC', 36000, 'APPROVED', 40);
  await exp('Welcome Gifts', 'Welcome hampers for 120 rooms', 210000, 'APPROVED', 20); await exp('Team Costs', 'Team accommodation & meals — event days', 92000, 'APPROVED', 3, { isTeamCost: true }); await exp('Team Costs', 'Temporary banquet staff overtime', 54000, 'APPROVED', 1, { isTeamCost: true });
  await exp('Miscellaneous', 'Emergency stage carpentry', 28000, 'APPROVED', 2); await exp('Transportation', 'Extra airport pickups (guest flights rescheduled)', 46000, 'PENDING', 1); await exp('Miscellaneous', 'Vendor meal coupons — day 3', 22000, 'PENDING', 0); await exp('Entertainment', 'Impromptu fireworks add-on (not approved)', 85000, 'REJECTED', 1, { vendorId: vendors['Sky Sparkle Fireworks'] });
  await prisma.budgetLine.createMany({ data: [['Venue', 2800000], ['Catering', 1900000], ['Decoration', 3000000], ['Photography', 500000], ['Videography', 450000], ['Entertainment', 450000], ['Lighting', 320000], ['Sound', 260000], ['Transportation', 400000], ['Accommodation', 1200000], ['Travel', 80000], ['Printing', 100000], ['Welcome Gifts', 200000], ['Permits', 40000], ['Team Costs', 150000], ['Miscellaneous', 50000]].map(([category, plannedAmount]) => ({ weddingId: WID, category: category as string, plannedAmount: plannedAmount as number })) });

  // Mehta documents (a floor plan + event schedule as simple text docs; PDFs come from the app)
  const docs = (await import('../src/modules/documents/documents.service')).DocumentsService;
  const docsSvc = get(docs);
  try {
    await docsSvc.save({ weddingId: WID, name: 'Venue-floor-plan-notes.txt', category: 'FLOOR_PLAN', buffer: Buffer.from('Jaipur Palace — main lawn: stage north, 40 round tables of 10, 6 live counters along the east wall, VIP lounge at west entrance.\n'), mime: 'text/plain', uploadedById: neha.id });
    await docsSvc.save({ weddingId: WID, name: 'Master-event-schedule.csv', category: 'EVENT_SCHEDULE', buffer: Buffer.from('time,item\n10:00,Decoration Team Arrival\n12:00,Catering Setup\n14:00,Sound Check\n17:00,Guest Arrival\n19:00,Groom Arrival\n19:30,Garland Exchange\n20:00,Wedding Vows\n21:00,Reception\n23:00,Event Closure\n'), mime: 'text/csv', uploadedById: priya.id });
  } catch (e) { console.warn('  (documents skipped: MinIO unreachable)', (e as Error).message); }

  // =====================================================================
  //  OTHER 24 WEDDINGS
  // =====================================================================
  const byCat = (c: VendorCategory, city: string) => { const m = VENDORS.filter((v) => v.category === c && v.areas.includes(city)); return pick(m.length ? m : VENDORS.filter((v) => v.category === c)); };
  const planners = [users.neha, users.arjun, users.rahul];
  let idx = 0;
  const cfgBy: Record<string, string> = {};
  for (const c of OTHERS) {
    idx++;
    const planner = planners[idx % 3];
    const start = new Date(istToday(0, 0).getTime() + c.offset * DAY);
    const contract = round1k(c.budget * between(0.8, 0.9));
    const couple = await prisma.couple.create({ data: { brideName: `${c.bride} ${c.surname}`, groomName: `${c.groom} ${c.surname}`, phone: `+91 9${Math.floor(100000000 + rnd() * 899999999)}`, email: `${c.groom.toLowerCase()}.${c.surname.toLowerCase()}@example.com` } });
    const w = await prisma.$transaction(async (tx) => {
      const ww = await tx.wedding.create({ data: { name: `${c.surname} Wedding`, coupleId: couple.id, location: c.city, venue: c.venue, startDate: start, endDate: new Date(start.getTime() + 2 * DAY), eventDays: 3, expectedGuests: c.guests, packageType: c.pkg, budget: c.budget, contractValue: contract, plannerId: planner.id, status: c.status, theme: pick(['Regal Rajputana', 'Floral Pastel Garden', 'Modern Minimal Luxe', 'Royal Maroon & Gold', 'Beachside Boho']) } });
      const kinds: EventKind[] = ['MEHENDI', 'SANGEET', 'CEREMONY', 'RECEPTION'];
      for (const [i, k] of kinds.entries()) await tx.weddingEvent.create({ data: { weddingId: ww.id, kind: k, name: { MEHENDI: 'Mehendi', SANGEET: 'Sangeet', CEREMONY: 'Wedding Ceremony', RECEPTION: 'Reception', HALDI: 'Haldi', OTHER: 'Event' }[k], date: new Date(start.getTime() + Math.min(i, 2) * DAY), venue: c.venue, expectedGuests: c.guests } });
      await syncMilestones(tx, ww, contract);
      return ww;
    });
    cfgBy[c.surname] = w.id;
    // vendors
    const cats = Object.keys(SHARE) as VendorCategory[];
    const vendorPool = c.pkg === 'PARTIAL' ? cats.filter((x) => ['CATERING', 'ENTERTAINMENT', 'LIGHTING', 'TRANSPORTATION', 'DECORATION'].includes(x)) : cats;
    const vendorTotal = contract * between(0.64, 0.76);
    const totalShare = vendorPool.reduce((a, x) => a + (SHARE[x] ?? 0), 0);
    const wvs: { id: string; amount: number; cat: VendorCategory; name: string }[] = [];
    for (const cat of vendorPool) {
      const v = cat === 'VENUE' ? (VENDORS.find((x) => x.name === c.venue) ?? byCat(cat, c.city)) : byCat(cat, c.city);
      const amount = round1k(vendorTotal * ((SHARE[cat] ?? 0) / totalShare));
      const wv = await prisma.weddingVendor.create({ data: { weddingId: w.id, vendorId: vendors[v.name], category: cat, contractAmount: amount, negotiatedAmount: amount } });
      wvs.push({ id: wv.id, amount, cat, name: v.name });
    }
    const pay = async (milestone: 'BOOKING' | 'ADVANCE' | 'FINAL', fraction: number, daysAgo: number) => {
      const m = await prisma.paymentMilestone.findUniqueOrThrow({ where: { weddingId_type: { weddingId: w.id, type: milestone } } });
      const amount = Math.round(Number(m.expectedAmount) * fraction);
      if (amount > 0) await payments.record({ weddingId: w.id, milestone, amount, method: pick(['BANK_TRANSFER', 'UPI', 'CHEQUE']), reference: `TXN-${Math.floor(100000 + rnd() * 899999)}`, paidAt: daysFromNow(-daysAgo).toISOString(), idempotencyKey: `seed-${w.id}-${milestone}` } as any, meera);
    };
    // payment state by timeline
    if (c.status === 'COMPLETED') {
      await pay('BOOKING', 1, -c.offset + 100); await pay('ADVANCE', 1, -c.offset + 32);
      const extraGuests = rnd() < 0.5 ? Math.floor(between(15, 70)) : 0;
      const catering = wvs.find((x) => x.cat === 'CATERING');
      await prisma.wedding.update({ where: { id: w.id }, data: { actualGuests: c.guests + extraGuests } });
      const r = await recon.ensure(w.id);
      let extras = 0;
      if (extraGuests && catering) {
        const rate = pick([1100, 1200, 1250, 1300]); extras = extraGuests * rate;
        await prisma.additionalCharge.create({ data: { reconciliationId: r.id, weddingVendorId: catering.id, type: 'EXTRA_GUESTS', description: `${extraGuests} extra guests × ₹${rate} per plate`, quantity: extraGuests, unitPrice: rate, amount: extras, approved: true, billToClient: true } });
      }
      await prisma.additionalCharge.create({ data: { reconciliationId: r.id, type: 'OTHER', description: 'Additional décor props & generator', quantity: 1, unitPrice: round1k(between(20000, 90000)), amount: 0, approved: true, billToClient: true } }).then((ch) => prisma.additionalCharge.update({ where: { id: ch.id }, data: { amount: ch.unitPrice } }));
      const allExtra = await prisma.additionalCharge.findMany({ where: { reconciliationId: r.id, approved: true, billToClient: true } });
      await syncMilestones(prisma as any, w, contract, allExtra.reduce((a, x) => a + Number(x.amount), 0));
      const lateFinal = c.offset > -30; // most recent weddings still owe a final payment
      await pay('FINAL', lateFinal ? 0.55 : 1, -c.offset - 4);
      for (const v of wvs) {
        const adv = Math.round(v.amount * 0.4 / 1000) * 1000;
        await prisma.vendorPayment.create({ data: { weddingId: w.id, weddingVendorId: v.id, kind: 'ADVANCE', amount: adv, method: 'BANK_TRANSFER', reference: `ADV-${Math.floor(1000 + rnd() * 8999)}`, paidAt: daysFromNow(c.offset - 60), idempotencyKey: `seed-${v.id}-adv` } });
        const inv = v.cat === 'CATERING' ? v.amount + extras : Math.round(v.amount * (1 + (rnd() < 0.3 ? between(0.01, 0.07) : 0)));
        await prisma.vendorSettlement.update({ where: { weddingVendorId: v.id }, data: { actualInvoice: inv, invoiceRef: `INV-${Math.floor(1000 + rnd() * 8999)}` } });
        if (!lateFinal || rnd() < 0.5) {
          await prisma.vendorPayment.create({ data: { weddingId: w.id, weddingVendorId: v.id, kind: 'FINAL', amount: inv - adv, method: 'BANK_TRANSFER', reference: `FIN-${Math.floor(1000 + rnd() * 8999)}`, paidAt: daysFromNow(c.offset + between(3, 12)), idempotencyKey: `seed-${v.id}-fin` } });
          await prisma.vendorSettlement.update({ where: { weddingVendorId: v.id }, data: { status: 'SETTLED', settledAt: daysFromNow(c.offset + 8) } });
        }
      }
      if (!lateFinal) await prisma.reconciliation.update({ where: { id: r.id }, data: { status: 'CLOSED', closedAt: daysFromNow(c.offset + 14) } });
      await tasks.generate(w.id, {}, planner);
      await prisma.weddingTask.updateMany({ where: { weddingId: w.id }, data: { status: 'COMPLETED', completedAt: start } });
    } else {
      const booked = c.offset <= 150;
      if (booked) await pay('BOOKING', 1, Math.min(120, 200 - c.offset * 0.3));
      if (c.offset <= 45) {
        if (c.surname === 'Sharma') await pay('ADVANCE', 0.5, 6);
        if (c.surname === 'Agarwal') await pay('ADVANCE', 0, 0);
        for (const v of wvs) await prisma.vendorPayment.create({ data: { weddingId: w.id, weddingVendorId: v.id, kind: 'ADVANCE', amount: round1k(v.amount * between(0.25, 0.4)), method: 'BANK_TRANSFER', reference: `ADV-${Math.floor(1000 + rnd() * 8999)}`, paidAt: daysFromNow(-between(10, 50)), idempotencyKey: `seed-${v.id}-adv` } });
      } else if (booked) {
        for (const v of wvs.filter((x) => ['VENUE', 'DECORATION'].includes(x.cat))) await prisma.vendorPayment.create({ data: { weddingId: w.id, weddingVendorId: v.id, kind: 'ADVANCE', amount: round1k(v.amount * 0.2), method: 'BANK_TRANSFER', reference: `ADV-${Math.floor(1000 + rnd() * 8999)}`, paidAt: daysFromNow(-between(5, 40)), idempotencyKey: `seed-${v.id}-adv` } });
      }
      if (booked) {
        // progress ∝ time elapsed
        const tl = await prisma.weddingTask.findMany({ where: { weddingId: w.id }, orderBy: { dueDate: 'asc' } });
        const target = Math.max(0.1, Math.min(0.85, 1 - c.offset / 170));
        const done = Math.floor(tl.length * target);
        for (const [i, t] of tl.entries()) {
          if (i < done) await prisma.weddingTask.update({ where: { id: t.id }, data: { status: 'COMPLETED', completedAt: daysFromNow(-between(1, 30)) } });
          else if (i < done + 3) await prisma.weddingTask.update({ where: { id: t.id }, data: { status: pick(['IN_PROGRESS', 'WAITING_FOR_VENDOR', 'UNDER_REVIEW', 'BLOCKED']) } });
        }
      }
      // upcoming weddings: some guest records for the nearest ones
      if (['Sharma', 'Kapoor', 'Agarwal'].includes(c.surname)) {
        const n = c.surname === 'Sharma' ? 70 : 45;
        await prisma.guest.createMany({ data: Array.from({ length: n }, (_, i) => ({ weddingId: w.id, name: `${pick(first)} ${pick(last)}`, phone: `+91 9${Math.floor(100000000 + rnd() * 899999999)}`, groupName: pick(groups), category: pick(['Bride side', 'Groom side', 'Friends']), plusOnes: rnd() < 0.3 ? 1 : 0, rsvp: pick(['YES', 'YES', 'PENDING', 'NO', 'MAYBE']) as any, invitationStatus: rnd() < 0.8 ? 'SENT' : 'NOT_SENT', accommodationNeeded: rnd() < 0.3, dietary: pick(diets) })) });
        void i0();
      }
    }
    function i0() { return 0; }
    // per-wedding expenses
    const nExp = 3 + Math.floor(rnd() * 3);
    const expCats = ['Travel', 'Printing', 'Permits', 'Welcome Gifts', 'Miscellaneous'];
    for (let i = 0; i < nExp; i++) await prisma.expense.create({ data: { weddingId: w.id, category: expCats[i % expCats.length], description: `${expCats[i % expCats.length]} — ${c.surname} wedding`, amount: round1k(between(20000, 160000)), date: daysFromNow(c.offset - between(5, 60)), method: pick(['BANK_TRANSFER', 'UPI', 'CASH']) as any, status: c.status === 'COMPLETED' || rnd() < 0.8 ? 'APPROVED' : 'PENDING', responsibleId: planner.id } });
    await prisma.expense.create({ data: { weddingId: w.id, category: 'Team Costs', description: `Team stay & travel — ${c.surname}`, amount: round1k(between(40000, 130000)), date: daysFromNow(c.offset), method: 'BANK_TRANSFER', status: c.status === 'COMPLETED' ? 'APPROVED' : 'PENDING', isTeamCost: true, responsibleId: users.priya.id } });
  }

  // ---------- Sharma: open sourcing rounds for hands-on demo ----------
  const sharma = cfgBy['Sharma'];
  const sharmaCaterers = await quotations.createRfq({ weddingId: sharma, category: 'CATERING', title: 'Catering — Udaipur wedding, 350 guests', brief: 'Lake-view dinner service with live counters.', vendorIds: [vendors['Lake Palace Kitchens'], vendors['Royal Caterers'], vendors['Maharaja Feast Co.']] }, users.neha);
  void sharmaCaterers;
  const decorRfq = await quotations.createRfq({ weddingId: sharma, category: 'DECORATION', title: 'Decoration — floral lake-side mandap', vendorIds: [vendors['Floral Dreams Decor'], vendors['Bloom & Drape Studio'], vendors['Regal Mandap Decorators']] }, users.neha);
  const decorSpecs: [string, number, number, number][] = [['Floral Dreams Decor', 2300000, 4.8, 5], ['Bloom & Drape Studio', 1950000, 4.5, 4], ['Regal Mandap Decorators', 1700000, 4.3, 4]];
  for (const [n, price, , rating] of decorSpecs) {
    const req = decorRfq.requests.find((r: any) => r.vendor.name === n)!;
    await quotations.submit(req.id, { guests: 350, rating, notes: n === 'Regal Mandap Decorators' ? 'Fresh flowers only for mandap; rest artificial.' : 'Full fresh-flower design with 3D mock-up.', items: [{ name: 'Mandap & stage design', quantity: 1, unit: 'lot', unitPrice: price * 0.4, taxRate: 18 }, { name: 'Entrance, aisle & table décor', quantity: 1, unit: 'lot', unitPrice: price * 0.4, taxRate: 18 }, { name: 'Lighting props & draping', quantity: 1, unit: 'lot', unitPrice: price * 0.2, taxRate: 18, included: n !== 'Regal Mandap Decorators' }] } as any, users.neha);
  }
  const sharmaRfqCaterers = await prisma.quotationRequest.findMany({ where: { rfqGroup: sharmaCaterers.rfqGroup } });
  void sharmaRfqCaterers;

  // ---------- pipeline enquiries ----------
  const enquirySeeds: [string, string, string, string, 'NEW' | 'CONTACTED' | 'CONSULTATION_SCHEDULED' | 'PROPOSAL_SENT' | 'NEGOTIATION' | 'LOST', any, string, number, number, number, string][] = [
    ['Isha Oberoi', 'Kabir Oberoi', 'Jaipur', 'WHATSAPP', 'CONSULTATION_SCHEDULED', 'neha', 'Winter wedding · palace venue', 400, 15 * CR / 10, -1, 'Referred by the Mehta family. Wants a winter palace wedding in Jaipur. Consultation booked.'],
    ['Aisha Khan', 'Rehan Siddiqui', 'Udaipur', 'REFERRAL', 'PROPOSAL_SENT', 'arjun', 'Lakeside nikah & reception', 260, 85 * L, 2, 'Lake Pichola view essential.'],
    ['Pooja Nambiar', 'Amit Chadha', 'Goa', 'INSTAGRAM', 'NEW', 'rahul', 'Beach sunset ceremony', 180, 60 * L, 0, 'DM on Instagram; asked for beach package.'],
    ['Sneha Rao', 'Vikram Bhatt', 'Jaipur', 'WEBSITE', 'CONTACTED', 'neha', 'Pastel garden wedding', 320, 90 * L, -2, 'Website form submission.'],
    ['Karishma Dutta', 'Sahil Arora', 'Delhi', 'PHONE', 'NEGOTIATION', 'arjun', 'Modern luxe ballroom', 550, 2 * CR, 3, 'Negotiating on vendor pass-through fees.'],
    ['Tanya Bedi', 'Mohit Ahlawat', 'Udaipur', 'WHATSAPP', 'NEW', 'rahul', 'Royal heritage wedding', 300, 110 * L, -3, 'Followed up after WhatsApp enquiry.'],
    ['Nisha Pillai', 'Rajat Ghosh', 'Jodhpur', 'OTHER', 'LOST', 'neha', 'Fort wedding', 200, 70 * L, 0, 'Family chose an in-house planner.'],
    ['Radhika Sen', 'Aman Luthra', 'Jaipur', 'REFERRAL', 'CONTACTED', 'arjun', 'Boho minimal', 150, 50 * L, 1, 'Referred by Joshi wedding.'],
  ];
  for (const [bride, groom, city, source, stage, who, theme, guests, budget, followDays, notes] of enquirySeeds) {
    const e = await enquiries.create({ brideName: bride, groomName: groom, phone: `+91 9${Math.floor(100000000 + rnd() * 899999999)}`, source, preferredDate: daysFromNow(between(60, 240)).toISOString(), location: city, guestCount: guests, budget, theme, packageType: rnd() < 0.8 ? 'FULL_SERVICE' : 'PARTIAL', assignedToId: users[who as string].id, followUpAt: daysFromNow(followDays).toISOString(), notes } as any, users[who as string]);
    if (stage !== 'NEW') await enquiries.update(e.id, { stage, ...(stage === 'LOST' ? { lostReason: 'Chose in-house planner' } : {}) } as any, users[who as string]);
  }

  // ---------- backdate history so feeds look lived-in ----------
  const spread = async (weddingId: string, from: Date, to: Date, tailShare = 0) => {
    const logs = await prisma.activityLog.findMany({ where: { weddingId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
    if (!logs.length) return;
    const tailN = Math.floor(logs.length * tailShare);
    const headN = logs.length - tailN;
    const times = logs.map((_, i) => i < headN ? new Date(from.getTime() + (to.getTime() - from.getTime()) * (i / Math.max(1, headN))) : new Date(NOW.getTime() - (logs.length - i) * 4 * 60000));
    await prisma.$executeRaw`UPDATE "ActivityLog" a SET "createdAt" = v.t FROM (SELECT unnest(${logs.map((l) => l.id)}::text[]) AS id, unnest(${times}::timestamptz[]) AS t) v WHERE a.id = v.id`;
  };
  await spread(WID, daysFromNow(-125), daysFromNow(-3), 0.35);
  for (const [surname, id] of Object.entries(cfgBy)) {
    const c = OTHERS.find((x) => x.surname === surname)!;
    const start = new Date(NOW.getTime() + c.offset * DAY);
    await spread(id, new Date(Math.min(start.getTime() - 130 * DAY, NOW.getTime() - 3 * DAY)), new Date(Math.min(start.getTime(), NOW.getTime() - 3600e3)));
    await prisma.wedding.update({ where: { id }, data: { createdAt: new Date(Math.min(start.getTime() - 130 * DAY, NOW.getTime() - DAY)) } });
  }
  await prisma.wedding.update({ where: { id: WID }, data: { createdAt: daysFromNow(-125) } });
  const eAct = await prisma.enquiryActivity.findMany({ where: { enquiryId: enq.id }, orderBy: { createdAt: 'asc' } });
  for (const [i, a] of eAct.entries()) await prisma.enquiryActivity.update({ where: { id: a.id }, data: { createdAt: daysFromNow(-125 + i * 7) } });
  await prisma.enquiry.update({ where: { id: enq.id }, data: { createdAt: daysFromNow(-125) } });
  await prisma.agreement.updateMany({ where: { weddingId: WID }, data: { createdAt: daysFromNow(-118) } });
  await prisma.quotationRequest.updateMany({ where: { weddingId: WID }, data: { createdAt: daysFromNow(-105) } });
  await prisma.couple.updateMany({ data: { createdAt: daysFromNow(-125) } });

  // ---------- curated notifications ----------
  await prisma.notification.deleteMany();
  const N: { type: string; title: string; body: string; link: string; roles: Role[]; ago: number; read?: boolean }[] = [
    { type: 'vendor.delayed', title: 'Vendor delayed', body: 'DJ Beatbox Entertainment · 30 min late', link: `/command-centre?wedding=${WID}`, roles: ['EVENT_MANAGER', 'OPERATIONS'], ago: 12 },
    { type: 'incident.created', title: 'Incident: Florist requests extra generator', body: 'Decoration crew needs an additional 25 kVA generator', link: `/command-centre?wedding=${WID}`, roles: ['EVENT_MANAGER', 'OPERATIONS', 'PLANNER'], ago: 40 },
    { type: 'enquiry.followup', title: 'Follow-up due', body: 'Isha & Kabir Oberoi · consultation reminder', link: '/enquiries', roles: ['PLANNER'], ago: 65 },
    { type: 'task.overdue', title: 'Task overdue', body: 'Lock final headcount with caterer · Mehta Wedding', link: `/weddings/${WID}?tab=planning`, roles: ['PLANNER', 'EVENT_MANAGER'], ago: 130 },
    { type: 'payment.overdue', title: 'Payment overdue', body: 'Kapoor Wedding · advance payment overdue', link: `/weddings/${cfgBy['Kapoor']}?tab=payments`, roles: ['FINANCE', 'PLANNER'], ago: 180 },
    { type: 'payment.due', title: 'Payment due soon', body: 'Agarwal Wedding · advance due in 10 days', link: `/weddings/${cfgBy['Agarwal']}?tab=payments`, roles: ['FINANCE', 'PLANNER'], ago: 300 },
    { type: 'quotation.received', title: 'Quotation received', body: 'Floral Dreams Decor · Sharma Wedding decoration', link: '/quotations', roles: ['PLANNER'], ago: 60 * 26, read: true },
    { type: 'vendor.selected', title: 'Vendor selected', body: 'Royal Caterers · catering · Mehta Wedding', link: `/weddings/${WID}`, roles: ['PLANNER', 'FINANCE'], ago: 60 * 24 * 100, read: true },
    { type: 'agreement.signed', title: 'Agreement signed', body: 'Mehta Wedding · v1', link: `/weddings/${WID}`, roles: ['PLANNER', 'FINANCE'], ago: 60 * 24 * 117, read: true },
    { type: 'enquiry.new', title: 'New enquiry', body: 'Pooja Nambiar & Amit Chadha · Goa', link: '/enquiries', roles: ['PLANNER'], ago: 60 * 5 },
  ];
  for (const [i, n] of N.entries()) {
    await notif.notify({ type: n.type, title: n.title, body: n.body, link: n.link, roles: n.roles, dedupeKey: `seed:${i}` });
    await prisma.$executeRaw`UPDATE "Notification" SET "createdAt" = ${new Date(NOW.getTime() - n.ago * 60000)}, "readAt" = ${n.read ? new Date(NOW.getTime() - (n.ago - 30) * 60000) : null} WHERE "dedupeKey" = ${`seed:${i}`}`;
  }

  await app.close();
  await upsertKeycloakUsers();

  const counts = { users: await prisma.user.count(), weddings: await prisma.wedding.count(), vendors: await prisma.vendor.count(), tasks: await prisma.weddingTask.count(), mehtaTasks: await prisma.weddingTask.count({ where: { weddingId: WID } }), guests: await prisma.guest.count(), enquiries: await prisma.enquiry.count(), quotations: await prisma.quotation.count(), payments: await prisma.clientPayment.count(), expenses: await prisma.expense.count(), notifications: await prisma.notification.count(), activity: await prisma.activityLog.count(), documents: await prisma.document.count() };
  console.log('Seed complete:', counts);
  console.log(`Mehta wedding id: ${WID}`);
  console.log(`Demo login (dev only): <role>@royalknot.local / ${PASSWORD}  — founder, neha, arjun, rahul, priya, karan, meera, vikram, sana`);
  console.log(`Keycloak demo users (same password): ${KEYCLOAK_USERS.map((u) => u.email).join(', ')}`);
}

main().then(() => prisma.$disconnect()).then(() => process.exit(0)).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
