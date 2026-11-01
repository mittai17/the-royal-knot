import { expect, test, type Page } from '@playwright/test';

const EMAIL = process.env.E2E_EMAIL ?? 'founder@royalknot.local';
const PASSWORD = process.env.E2E_PASSWORD ?? 'RoyalKnot@2026';

const SCREENS: [string, string][] = [
  ['dashboard', 'Ongoing Weddings'], ['enquiries', 'Enquiries'], ['weddings', 'Weddings'], ['vendors', 'Vendors'], ['procurement', 'Procurement'],
  ['tasks', 'Planning & Tasks'], ['command-centre', 'Event Command Centre'], ['guests', 'Guests'], ['payments', 'Payments'],
  ['expenses', 'Expenses & Reconciliation'], ['reports', 'Reports & Analytics'], ['documents', 'Documents'], ['team', 'Team Management'], ['settings', 'Settings'],
];

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('**/dashboard');
}

test('rejects bad credentials with a visible error', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', 'definitely-wrong');
  await page.click('button:has-text("Sign in")');
  await expect(page.locator('p[role=alert]')).toContainText(/invalid/i);
});

test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/vendors');
  await expect(page).toHaveURL(/\/login/);
});

test('every screen loads real data without API errors', async ({ page }) => {
  const failures: string[] = [];
  await login(page);
  page.on('response', (r) => { if (r.url().includes('/api/v1/') && r.status() >= 400) failures.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  for (const [path, text] of SCREENS) {
    await page.goto(`/${path}`);
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  expect(failures).toEqual([]);
});

test('legacy routes redirect to their canonical modules (decision 8)', async ({ page }) => {
  await login(page);
  const map: [string, RegExp][] = [
    ['/todays-events', /\/command-centre\?view=today/], ['/vendor-checkin', /\/command-centre\/vendor-checkin/], ['/checklists', /\/tasks\?view=checklists/],
    ['/updates', /\/activity/], ['/quotations', /\/procurement\?tab=rfqs/],
  ];
  for (const [from, to] of map) { await page.goto(from); await expect(page).toHaveURL(to); }
});

test('quotation comparison highlights options and keeps the decision', async ({ page }) => {
  await login(page);
  const mehta = (await (await page.request.get('/api/v1/weddings?search=Mehta')).json()).data[0];
  await page.goto(`/weddings/${mehta.id}#Quotations`);
  await page.locator('ul li button').first().click();
  await expect(page.getByText('Lowest total', { exact: true })).toBeVisible();
  await expect(page.getByText('Recommended', { exact: true })).toBeVisible();
  await expect(page.getByText('Selected', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Not selected', { exact: true })).toHaveCount(2);
});

test('command centre connects to the live channel', async ({ page }) => {
  await login(page);
  const mehta = (await (await page.request.get('/api/v1/weddings?search=Mehta')).json()).data[0];
  await page.evaluate((id) => localStorage.setItem('rk.wedding', id), mehta.id);
  await page.goto('/command-centre');
  await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('DJ arrives late')).toBeVisible();
});

test('reconciliation shows extra guest charge: 60 x 1,200 = 72,000', async ({ page }) => {
  await login(page);
  const mehta = (await (await page.request.get('/api/v1/weddings?search=Mehta')).json()).data[0];
  await page.evaluate((id) => localStorage.setItem('rk.wedding', id), mehta.id);
  await page.goto('/expenses');
  await page.click('button[role=tab]:has-text("Reconciliation")');
  await expect(page.getByText('₹72,000').first()).toBeVisible();
});

test('creating an enquiry through the form persists and lists it', async ({ page }) => {
  await login(page);
  const stamp = Date.now().toString().slice(-6);
  await page.goto('/enquiries');
  await page.click('button:has-text("New enquiry")');
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').nth(0).fill(`E2EBride${stamp}`);
  await dialog.locator('input').nth(1).fill('E2EGroom');
  await dialog.locator('input[type=number]').nth(0).fill('400');
  await dialog.locator('input[type=number]').nth(1).fill('15000000');
  await dialog.getByRole('button', { name: 'Save enquiry' }).click();
  await expect(page.getByText('Enquiry captured')).toBeVisible();
  await page.locator('input[type=search]').fill(`E2EBride${stamp}`);
  await expect(page.getByText(`E2EBride${stamp} & E2EGroom`)).toBeVisible();
});

test('incident created elsewhere appears live without reload', async ({ page }) => {
  await login(page);
  const mehta = (await (await page.request.get('/api/v1/weddings?search=Mehta')).json()).data[0];
  await page.evaluate((id) => localStorage.setItem('rk.wedding', id), mehta.id);
  await page.goto('/command-centre');
  await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 });
  const title = `E2E live incident ${Date.now()}`;
  const res = await page.request.post(`/api/v1/weddings/${mehta.id}/incidents`, { data: { title, description: 'Created by the e2e suite', severity: 'LOW' } });
  expect(res.ok()).toBeTruthy();
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
});
