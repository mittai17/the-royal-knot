import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'fs';
import { NAV } from '../lib/nav';
import { HOME } from '../lib/permissions';
import type { Role } from '../types';

/**
 * WedFlow sweep: every nav route for each of the 8 roles must render a heading (not a placeholder), with zero console errors,
 * zero failed API calls and no horizontal overflow at 1440 and 390 px. Plus negative-access checks between areas.
 * Run:  E2E_BASE_URL=http://localhost:3200 npx playwright test e2e/wedflow-sweep.spec.ts --workers=1
 * Screenshots: SHOT_DIR (default /tmp/wedflow-shots) gets one desktop + one mobile shot of each role's first page and every route when SWEEP_SHOTS=all.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'RoyalKnot@2026';
export const ROLES: { role: Role; email: string }[] = [
  { role: 'ADMIN', email: 'arjun@royalknot.in' },
  { role: 'PLANNER', email: 'priya@royalknot.in' },
  { role: 'EVENT_MANAGER', email: 'kabir@royalknot.in' },
  { role: 'FINANCE', email: 'meera@royalknot.in' },
  { role: 'OPERATIONS', email: 'rohan@royalknot.in' },
  { role: 'CLIENT', email: 'rahul.priya@gmail.com' },
  { role: 'VENDOR', email: 'vendor@royalcaterers.com' },
  { role: 'SYSADMIN', email: 'admin@royalknot.in' },
];
const SHOT_DIR = process.env.SHOT_DIR ?? '/tmp/wedflow-shots';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

export async function loginContext(browser: Browser, email: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const res = await ctx.request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  if (!res.ok()) throw new Error(`login ${email} -> ${res.status()}`);
  return ctx;
}

function watch(page: Page, issues: string[], ctl: { where: string; allow: RegExp[] }) {
  const allowed = (s: string) => ctl.allow.some((r) => r.test(s));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/status of 40[13]/.test(t) && /auth\/(me|refresh)/.test(m.location().url ?? '')) return;
    if (/Failed to load resource/.test(t)) return; // covered by the response listener below, with the URL
    if (!allowed(t)) issues.push(`[${ctl.where}] console: ${t.slice(0, 200)}`);
  });
  page.on('pageerror', (e) => issues.push(`[${ctl.where}] pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() < 400 || !u.includes('/api/')) return;
    if (/\/auth\/(refresh|me)$/.test(u) && r.status() === 401) return;
    const s = `${r.status()} ${r.request().method()} ${u.replace(/^.*\/api\/v1/, '')}`;
    if (!allowed(s)) issues.push(`[${ctl.where}] http ${s}`);
  });
}

async function overflow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = document.documentElement;
    if (d.scrollWidth <= d.clientWidth + 1) return '';
    const bad: string[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > d.clientWidth + 2 && r.width > 0 && bad.length < 3) bad.push(`${el.tagName}.${String((el as HTMLElement).className).slice(0, 60)}`);
    });
    return `${d.scrollWidth}>${d.clientWidth} ${bad.join(' | ')}`;
  });
}

async function settle(page: Page) {
  // socket.io long-polling keeps the network permanently busy on some pages, so idle is only a short best-effort wait.
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 400));
}

/** Visits one URL at desktop then mobile and records every problem. Returns false if navigation landed somewhere else. */
async function checkPage(page: Page, path: string, issues: string[], ctl: { where: string }, shotName?: string) {
  const t0 = Date.now();
  ctl.where = path;
  await page.setViewportSize(DESKTOP);
  await page.goto(path);
  const h1 = page.locator('h1').first();
  try { await h1.waitFor({ state: 'visible', timeout: 15_000 }); } catch { issues.push(`[${path}] no <h1> rendered (url=${page.url().replace(/^https?:\/\/[^/]+/, '')})`); }
  await settle(page);
  const url = new URL(page.url()).pathname;
  if (url !== path.split('?')[0]) issues.push(`[${path}] redirected to ${url}`);
  const body = (await page.locator('main').first().innerText().catch(() => '')) || '';
  if (/coming soon/i.test(body)) issues.push(`[${path}] placeholder (ComingSoon) rendered`);
  if (/application error: a (client|server)-side exception|this page couldn.t load|^something went wrong$/im.test(body)) issues.push(`[${path}] error boundary text rendered`);
  const o1 = await overflow(page); if (o1) issues.push(`[${path}] overflow@1440 ${o1}`);
  if (shotName) { fs.mkdirSync(SHOT_DIR, { recursive: true }); await page.screenshot({ path: `${SHOT_DIR}/${shotName}-desk.png`, fullPage: true }); }
  await page.setViewportSize(MOBILE);
  await page.waitForTimeout(350);
  const o2 = await overflow(page); if (o2) issues.push(`[${path}] overflow@390 ${o2}`);
  if (shotName) await page.screenshot({ path: `${SHOT_DIR}/${shotName}-mob.png`, fullPage: true });
  await page.setViewportSize(DESKTOP);
  if (process.env.SWEEP_TIMING) console.log(`  ${path} ${Date.now() - t0}ms`);
}

for (const { role, email } of ROLES) {
  test.describe(`sweep ${role}`, () => {
    test.describe.configure({ mode: 'serial' });
    let ctx: BrowserContext; let page: Page;
    const issues: string[] = [];
    const ctl = { where: 'login', allow: [] as RegExp[] };
    const routes = NAV.filter((n) => n.roles.includes(role)).map((n) => n.href).filter((h) => !process.env.SWEEP_ONLY || new RegExp(process.env.SWEEP_ONLY).test(h));

    test.beforeAll(async ({ browser }) => {
      ctx = await loginContext(browser, email);
      page = await ctx.newPage();
      watch(page, issues, ctl);
    });
    test.afterAll(async () => { await ctx?.close(); });

    test('home redirect after login', async () => {
      await page.goto('/');
      await page.waitForURL((u) => u.pathname === HOME[role], { timeout: 15_000 }).catch(() => undefined);
      expect(new URL(page.url()).pathname).toBe(HOME[role]);
    });

    test(`every nav route renders (${routes.length})`, async () => {
      test.setTimeout(Number(process.env.SWEEP_TIMEOUT) || 60_000 + routes.length * 12_000);
      const start = issues.length;
      for (const [i, r] of routes.entries()) await checkPage(page, r, issues, ctl, process.env.SWEEP_SHOTS === 'all' || i === 0 ? `${role}-${r.replace(/\//g, '_').replace(/^_/, '')}` : undefined);
      expect(issues.slice(start), issues.slice(start).join('\n')).toEqual([]);
    });

    if (role === 'ADMIN' || role === 'PLANNER' || role === 'FINANCE') {
      test('client detail page (clicked through)', async () => {
        const start = issues.length;
        await page.setViewportSize(DESKTOP); ctl.where = '/clients';
        await page.goto('/clients'); await settle(page);
        const link = page.locator('a[href^="/clients/"]').first();
        const row = (await link.count()) ? link : page.locator('table tbody tr, ul li').first();
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row.click();
        await page.waitForURL(/\/clients\/[^/]+$/, { timeout: 15_000 });
        const p = new URL(page.url()).pathname;
        await checkPage(page, p, issues, ctl, `${role}-clients_detail`);
        expect(issues.slice(start), issues.slice(start).join('\n')).toEqual([]);
      });
    }
    if (role === 'ADMIN' || role === 'PLANNER') {
      test('wedding detail tabs', async () => {
        const start = issues.length;
        ctl.where = '/weddings'; await page.goto('/weddings'); await settle(page);
        const link = page.locator('a[href^="/weddings/"]').first();
        await expect(link).toBeVisible({ timeout: 15_000 });
        await link.click(); await page.waitForURL(/\/weddings\/[^/]+$/);
        await page.waitForSelector('button[role=tab]', { timeout: 15_000 });
        const tabs = page.locator('button[role=tab]');
        const n = await tabs.count();
        for (let i = 0; i < n; i++) { ctl.where = `wedding-tab-${i}`; await tabs.nth(i).scrollIntoViewIfNeeded(); await tabs.nth(i).click(); await settle(page); const o = await overflow(page); if (o) issues.push(`[wedding tab ${i}] overflow ${o}`); }
        expect(issues.slice(start), issues.slice(start).join('\n')).toEqual([]);
      });
    }
    if (role === 'VENDOR') {
      test('rfq detail page (clicked through)', async () => {
        const start = issues.length;
        ctl.where = '/vendor-portal/rfqs'; await page.goto('/vendor-portal/rfqs'); await page.getByRole('tab', { name: /^All/ }).click(); await settle(page);
        const link = page.locator('a[href^="/vendor-portal/rfqs/"]').first();
        await expect(link, 'vendor has at least one RFQ link').toBeVisible({ timeout: 15_000 });
        await link.click(); await page.waitForURL(/\/vendor-portal\/rfqs\/[^/]+$/);
        await checkPage(page, new URL(page.url()).pathname, issues, ctl, 'VENDOR-rfq_detail');
        expect(issues.slice(start), issues.slice(start).join('\n')).toEqual([]);
      });
    }

    test('negative access: other areas redirect to home', async () => {
      const start = issues.length;
      ctl.allow = [/^40[13] /, /^40[13]/, /Forbidden/];
      const probes = role === 'CLIENT' ? ['/dashboard', '/weddings', '/payments', '/vendor-portal/dashboard', '/admin/dashboard', '/team']
        : role === 'VENDOR' ? ['/dashboard', '/weddings', '/payments', '/client-portal/dashboard', '/admin/dashboard', '/invoices']
        : role === 'SYSADMIN' ? ['/dashboard', '/weddings', '/payments', '/client-portal/dashboard', '/vendor-portal/dashboard', '/invoices']
        : role === 'ADMIN' ? ['/client-portal/dashboard', '/vendor-portal/dashboard']
        : ['/client-portal/dashboard', '/vendor-portal/dashboard', '/admin/dashboard', '/admin/users'];
      for (const p of probes) {
        await page.goto(p);
        await page.waitForURL((u) => u.pathname === HOME[role], { timeout: 15_000 }).catch(() => undefined);
        expect(new URL(page.url()).pathname, `${role} opening ${p}`).toBe(HOME[role]);
      }
      // API-level deny for locked roles
      if (role === 'CLIENT' || role === 'VENDOR' || role === 'SYSADMIN') {
        for (const api of role === 'SYSADMIN' ? ['/api/v1/clients', '/api/v1/enquiries', '/api/v1/weddings'] : ['/api/v1/clients', '/api/v1/audit', '/api/v1/enquiries']) {
          const r = await ctx.request.get(api);
          expect(r.status(), `${role} GET ${api}`).toBe(403);
        }
      }
      ctl.allow = [];
      expect(issues.slice(start).filter((s) => !/http 40[13]/.test(s)), issues.slice(start).join('\n')).toEqual([]);
    });
  });
}

test('unauthenticated users are redirected to login from every area', async ({ page }) => {
  for (const p of ['/dashboard', '/client-portal/dashboard', '/vendor-portal/dashboard', '/admin/dashboard']) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/login/);
  }
});
