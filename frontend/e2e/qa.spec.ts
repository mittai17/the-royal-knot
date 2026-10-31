import { test } from '@playwright/test';
import fs from 'fs';

const pages = ['dashboard', 'enquiries', 'weddings', 'vendors', 'quotations', 'tasks', 'command-centre', 'guests', 'payments', 'expenses', 'reports', 'documents', 'team', 'settings'];
const tabs = ['Overview', 'Couple', 'Planning', 'Events', 'Vendors', 'Quotations', 'Guests', 'Payments', 'Expenses', 'Documents', 'Activity'];
const vps = [{ n: 'desk', w: 1440, h: 900 }, { n: 'tab', w: 820, h: 1100 }, { n: 'mob', w: 390, h: 844 }];
const users = (process.env.QA_USERS ?? 'founder').split(',');

for (const u of users) for (const vp of vps) {
  test(`qa ${u} ${vp.n}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    const issues: string[] = [];
    let where = 'login';
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('status of 401')) issues.push(`[${where}] console: ${m.text().slice(0, 160)}`); });
    page.on('pageerror', (e) => issues.push(`[${where}] pageerror: ${e.message.slice(0, 160)}`));
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/auth/refresh') && r.url().includes('/api/')) issues.push(`[${where}] ${r.status()} ${r.url().replace(/^.*\/api/, '/api')}`); });
    const dir = `${process.env.SHOT_DIR ?? 'shots'}/${u}-${vp.n}`;
    fs.mkdirSync(dir, { recursive: true });
    await page.goto('/login');
    await page.fill('input[type=email]', `${u}@royalknot.local`);
    await page.fill('input[type=password]', 'RoyalKnot@2026');
    await page.click('button:has-text("Sign in")');
    await page.waitForURL('**/dashboard');
    const mehta = (await (await page.request.get('/api/v1/weddings?search=Mehta')).json()).data[0];
    await page.evaluate((id) => localStorage.setItem('rk.wedding', id), mehta.id);
    const check = async (name: string) => {
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(700);
      const ov = await page.evaluate(() => {
        const d = document.documentElement; const bad: string[] = [];
        if (d.scrollWidth > d.clientWidth + 1) {
          document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > d.clientWidth + 2 && r.width > 0 && bad.length < 3) bad.push(`${el.tagName}.${String((el as HTMLElement).className).slice(0, 50)}`); });
          return `overflow ${d.scrollWidth}>${d.clientWidth} ${bad.join(' | ')}`;
        }
        return '';
      });
      if (ov) issues.push(`[${name}] ${ov}`);
      await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
    };
    for (const p of pages) { where = p; await page.goto(`/${p}`); await check(p); }
    where = 'wedding'; await page.goto(`/weddings/${mehta.id}`); await page.waitForSelector('button[role=tab]', { timeout: 15000 });
    for (const t of tabs) {
      where = `wedding-${t}`;
      const tab = page.locator(`button[role=tab]:has-text("${t}")`).first();
      if (await tab.count()) { await tab.scrollIntoViewIfNeeded(); await tab.click(); await check(`wedding-${t}`); } else if (!(['Payments', 'Expenses'].includes(t) && ['sana', 'priya'].includes(u))) issues.push(`[${where}] tab missing`);
    }
    fs.writeFileSync(`${dir}/issues.txt`, issues.join('\n'));
    console.log(`${u}-${vp.n}: ${issues.length} issues\n${issues.join('\n')}`);
  });
}
