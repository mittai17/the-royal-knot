import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * One user-level journey per portal, driven through the real UI as the seeded demo users.
 * Run: E2E_BASE_URL=http://localhost:3200 npx playwright test e2e/wedflow-journeys.spec.ts --workers=1
 * Rows created here are uniquely named (RUN) and cleaned up where the API allows it (invoice voided, permission restored).
 */
test.describe.configure({ mode: 'serial' });
const PASSWORD = process.env.E2E_PASSWORD ?? 'RoyalKnot@2026';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const RUN = Date.now().toString(36);

async function as(browser: Browser, email: string): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE_URL });
  const res = await ctx.request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/') && !/\/auth\/(me|refresh)$/.test(r.url())) errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^.*\/api\/v1/, '')}`); });
  return { ctx, page, errors };
}

test('client: dashboard -> payments -> chat message', async ({ browser }) => {
  const { ctx, page, errors } = await as(browser, 'rahul.priya@gmail.com');
  await page.goto('/client-portal/dashboard');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(page.getByText('Days to go').first()).toBeVisible();
  await expect(page.getByText('Wedding progress')).toBeVisible();

  const payLink = page.getByRole('link', { name: 'Payments & Invoices' }).first();
  if (!(await payLink.isVisible())) {
    await page.getByRole('button', { name: 'Money & Documents' }).click();
  }
  await payLink.click();
  await expect(page).toHaveURL(/\/client-portal\/payments$/);
  await expect(page.getByRole('heading', { name: 'Payments & Invoices', level: 1 })).toBeVisible();
  await expect(page.locator('table').first()).toBeVisible();
  await expect(page.getByText(/₹[\d,]+/).first()).toBeVisible();

  const chatLink = page.getByRole('link', { name: 'Chat & Support' }).first();
  if (!(await chatLink.isVisible())) {
    await page.getByRole('button', { name: 'Communication' }).click();
  }
  await chatLink.click();
  await expect(page).toHaveURL(/\/client-portal\/chat$/);
  const msg = `E2E hello from the couple ${RUN}`;
  await page.getByLabel('Message').fill(msg);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(msg)).toBeVisible();
  // it was persisted: reload and still there
  await page.reload();
  await expect(page.getByText(msg)).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('vendor: open an RFQ and submit a quotation', async ({ browser }) => {
  const { ctx, page, errors } = await as(browser, 'vendor@royalcaterers.com');
  const openList = async () => { await page.goto('/vendor-portal/rfqs'); await page.getByRole('tab', { name: /^All/ }).click(); };
  await openList();
  const links = page.locator('a[href^="/vendor-portal/rfqs/"]');
  await expect(links.first()).toBeVisible();
  const n = await links.count();
  let submitted = false;
  for (let i = 0; i < n && !submitted; i++) {
    if (i > 0) { await openList(); await expect(links.first()).toBeVisible(); }
    await links.nth(i).click();
    await expect(page.getByRole('heading', { name: 'RFQ details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^(Submit quotation|Your quotation)$/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const btn = page.getByRole('button', { name: /^(Submit|Update) quotation$/ });
    if (!(await btn.count())) continue;
    await page.getByPlaceholder('Item name').first().fill(`E2E line ${RUN}`);
    const row = page.locator('tbody tr').first();
    await row.locator('input[type=number]').nth(1).fill('1500'); // unit price
    await expect(btn).toBeEnabled();
    const post = page.waitForResponse((r) => /\/portal\/vendor\/rfqs\/[^/]+\/quotation$/.test(r.url()) && r.request().method() === 'POST');
    await btn.click();
    expect((await post).ok()).toBeTruthy();
    await expect(page.getByText(/Quotation (submitted|updated)/)).toBeVisible();
    await page.reload();
    await expect(page.getByPlaceholder('Item name').first()).toHaveValue(`E2E line ${RUN}`);
    submitted = true;
  }
  expect(submitted, 'at least one RFQ accepts a quotation').toBeTruthy();
  await page.goto('/vendor-portal/quotations');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('finance: create a client invoice', async ({ browser }) => {
  const { ctx, page, errors } = await as(browser, 'meera@royalknot.in');
  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: 'Client Invoices', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'New invoice' }).click();
  const dlg = page.locator('[role=dialog]');
  await expect(dlg).toBeVisible();
  const wedding = dlg.locator('select').first();
  if (!(await wedding.inputValue())) await wedding.selectOption({ index: 1 });
  const desc = `E2E invoice ${RUN}`;
  await dlg.getByLabel('Description').first().fill(desc);
  await dlg.getByLabel('Unit price').first().fill('1000');
  const created = page.waitForResponse((r) => r.url().endsWith('/api/v1/invoices') && r.request().method() === 'POST');
  await dlg.getByRole('button', { name: 'Save as draft' }).click();
  const res = await created;
  expect(res.status()).toBe(201);
  const inv = (await res.json()).data;
  await expect(page.getByText('Draft invoice created')).toBeVisible();
  await page.getByLabel('Search invoices').fill(inv.invoiceNo);
  await expect(page.getByText(inv.invoiceNo).first()).toBeVisible();
  // clean up: void the draft
  const v = await ctx.request.post(`/api/v1/invoices/${inv.id}/void`, { data: { reason: 'E2E cleanup' } });
  expect(v.ok(), `void ${v.status()}`).toBeTruthy();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('sysadmin: edits a permission and sees it in the audit log', async ({ browser }) => {
  const { ctx, page, errors } = await as(browser, 'admin@royalknot.in');
  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: 'Roles & Permissions', level: 1 })).toBeVisible();
  await page.locator('ul button', { hasText: 'Planner' }).first().click();
  const box = page.getByLabel('transport write');
  await expect(box).toBeVisible();
  const before = await box.isChecked();
  const save = page.getByRole('button', { name: /^Save/ });
  await box.setChecked(!before);
  await save.click();
  await expect(page.getByText('Permissions saved')).toBeVisible();
  try {
    await page.goto('/admin/audit');
    await page.getByLabel('Search audit log').fill('permission');
    await expect(page.getByText(/Changed \d+ permission\(s\) for/).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    // restore the original grant so the demo data is unchanged
    await page.goto('/admin/roles');
    await page.locator('ul button', { hasText: 'Planner' }).first().click();
    const again = page.getByLabel('transport write');
    await expect(again).toBeVisible();
    if ((await again.isChecked()) !== before) { await again.setChecked(before); await page.getByRole('button', { name: /^Save/ }).click(); await expect(page.getByText('Permissions saved')).toBeVisible(); }
  }
  expect(errors).toEqual([]);
  await ctx.close();
});
