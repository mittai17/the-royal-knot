import { test } from '@playwright/test';

test('quotation comparison + reconciliation shots', async ({ page }) => {
  const dir = process.env.SHOT_DIR ?? 'shots';
  await page.goto('/login');
  await page.fill('input[type=email]', 'founder@royalknot.local');
  await page.fill('input[type=password]', 'RoyalKnot@2026');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('**/dashboard');
  const mehta = (await (await page.request.get('/api/v1/weddings?search=Mehta')).json()).data[0];
  await page.goto(`/weddings/${mehta.id}#Quotations`);
  await page.waitForTimeout(1500);
  await page.locator('ul li button').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/cmp.png`, fullPage: true });
  await page.goto(`/weddings/${mehta.id}#Expenses`);
  await page.waitForTimeout(1500);
  await page.evaluate((id) => localStorage.setItem('rk.wedding', id), mehta.id);
  await page.goto('/expenses');
  await page.click('button[role=tab]:has-text("Reconciliation")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/recon.png`, fullPage: true });
});
