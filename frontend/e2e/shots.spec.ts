import { test } from '@playwright/test';

const pages = ['dashboard', 'enquiries', 'weddings', 'vendors', 'quotations', 'tasks', 'command-centre', 'guests', 'payments', 'expenses', 'reports', 'documents', 'team', 'settings'];
const tabs = ['Overview', 'Couple', 'Events', 'Vendors', 'Quotations', 'Activity'];

test('capture every screen', async ({ page }) => {
  const dir = process.env.SHOT_DIR ?? 'shots';
  await page.goto('/login');
  await page.fill('input[type=email]', 'founder@royalknot.local');
  await page.fill('input[type=password]', 'RoyalKnot@2026');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('**/dashboard');
  const mehta = (await (await page.request.get('/api/v1/weddings?search=Mehta')).json()).data[0];
  await page.evaluate((id) => localStorage.setItem('rk.wedding', id), mehta.id);
  for (const p of pages) {
    await page.goto(`/${p}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${dir}/${p}.png`, fullPage: true });
  }
  await page.goto(`/weddings/${mehta.id}`);
  for (const t of tabs) {
    await page.click(`button[role=tab]:has-text("${t}")`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${dir}/wedding-${t}.png`, fullPage: true });
  }
});
