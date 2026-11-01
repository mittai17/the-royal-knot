import { test, expect, type Browser, type Page } from '@playwright/test';

/** UI-level flows that were previously untested. Runs against a fresh wedding so seeded demo data is untouched. */
test.describe.configure({ mode: 'serial' });

type Json = Record<string, any>;
let planner: Page, finance: Page, founder: Page;
let wid = '';
const RUN = Date.now().toString(36);

async function login(browser: Browser, who: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.fill('input[type=email]', `${who}@royalknot.local`);
  await page.fill('input[type=password]', 'RoyalKnot@2026');
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('**/dashboard');
  return page;
}
const j = async (r: { json: () => Promise<Json>; ok: () => boolean; status: () => number }) => { expect(r.ok(), `status ${r.status()}`).toBeTruthy(); return (await r.json()).data; };
const dlg = (p: Page) => p.locator('[role=dialog]');
const pickWedding = (p: Page) => p.evaluate((id) => localStorage.setItem('rk.wedding', id), wid);

test.beforeAll(async ({ browser }) => {
  planner = await login(browser, 'neha');
  finance = await login(browser, 'meera');
  founder = await login(browser, 'founder');
  const w = await j(await planner.request.post('/api/v1/weddings', { data: { brideName: 'Flow Bride', groomName: `${RUN} Groom`, location: 'Jaipur', startDate: new Date(Date.now() + 60 * 864e5).toISOString(), expectedGuests: 400, packageType: 'FULL_SERVICE', budget: 5000000, contractValue: 4000000 } }));
  wid = w.id;
  for (const p of [planner, finance, founder]) await pickWedding(p);
});

test('agreement: generate, capture a drawn signature, sign', async () => {
  await planner.goto(`/weddings/${wid}#Couple`);
  await planner.locator('button:has-text("Generate")').first().click();
  await expect(planner.locator('text=No agreement yet')).toHaveCount(0, { timeout: 10_000 });
  await planner.locator('button:has-text("Capture signature")').first().click();
  const canvas = dlg(planner).locator('canvas');
  const box = (await canvas.boundingBox())!;
  await planner.mouse.move(box.x + 30, box.y + 80);
  await planner.mouse.down();
  await planner.mouse.move(box.x + 90, box.y + 30, { steps: 8 });
  await planner.mouse.move(box.x + 160, box.y + 110, { steps: 8 });
  await planner.mouse.up();
  await dlg(planner).locator('button:has-text("Sign agreement")').click();
  await expect(planner.locator('text=Agreement signed')).toBeVisible();
  const list = await j(await planner.request.get(`/api/v1/weddings/${wid}/agreements`));
  expect((Array.isArray(list) ? list : list.items)[0].status).toBe('SIGNED');
  const docs = await j(await planner.request.get(`/api/v1/documents?weddingId=${wid}`));
  expect(docs.some((d: Json) => d.category === 'AGREEMENT')).toBeTruthy();
});

test('documents: upload via UI then download the same bytes', async () => {
  await planner.goto('/documents');
  await planner.locator('button:has-text("Upload")').first().click();
  const body = `flow ${RUN}\n`;
  await dlg(planner).locator('input[type=file]').setInputFiles({ name: `notes-${RUN}.txt`, mimeType: 'text/plain', buffer: Buffer.from(body) });
  await dlg(planner).locator('.btn-primary').click();
  await expect(planner.locator('text=Document uploaded').first()).toBeVisible({ timeout: 10_000 });
  await expect(dlg(planner)).toHaveCount(0);
  const docs = await j(await planner.request.get(`/api/v1/documents?search=notes-${RUN}`));
  const dl = await planner.request.get(`/api/v1/documents/${docs[0].id}/download`);
  expect(dl.status()).toBe(200);
  expect(await dl.text()).toBe(body);
});

test('guests: CSV import shows a preview and creates the rows', async () => {
  await planner.goto('/guests');
  await planner.locator('button:has-text("Import CSV")').click();
  const csv = ['name,phone,group,rsvp,plus ones,dietary', ...Array.from({ length: 12 }, (_, i) => `Csv Guest ${i + 1},+91 90000 0${String(i).padStart(4, '0')},Family ${i % 3},YES,${i % 2},Vegetarian`)].join('\n');
  await dlg(planner).locator('input[type=file]').setInputFiles({ name: 'g.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(dlg(planner).locator('text=Csv Guest 1').first()).toBeVisible();
  await expect(dlg(planner).locator('.btn-primary')).toContainText('Import 12');
  await dlg(planner).locator('.btn-primary').click();
  await expect(dlg(planner)).toHaveCount(0, { timeout: 10_000 });
  const g = await planner.request.get(`/api/v1/weddings/${wid}/guests?pageSize=50`);
  expect(((await g.json()).meta?.total ?? 0)).toBe(12);
});

test('payments: finance records the booking milestone in the UI, tasks auto-generate once', async () => {
  // Master spec: wedding requires accepted proposal + signed agreement + verified deposit to confirm & auto-plan
  const prop = await j(await planner.request.post('/api/v1/proposals', { data: { weddingId: wid, title: `${RUN} final proposal`, packageName: 'Full-Service', amount: 4000000 } }));
  await planner.request.post(`/api/v1/proposals/${prop.id}/send`, { data: {} });
  await planner.request.post(`/api/v1/proposals/${prop.id}/respond`, { data: { status: 'ACCEPTED' } });

  await finance.goto('/payments');
  await finance.locator('button:has-text("Record payment"):not([disabled])').first().click();
  await dlg(finance).locator('button:has-text("Fill full outstanding")').click();
  await dlg(finance).locator('.btn-primary').click();
  await expect(finance.locator('text=Payment recorded').first()).toBeVisible({ timeout: 10_000 });

  const payments = await j(await finance.request.get(`/api/v1/payments?weddingId=${wid}`));
  const bookingPay = (Array.isArray(payments) ? payments : payments.items || [])[0];
  if (bookingPay?.id) {
    const vr = await founder.request.post(`/api/v1/payments/${bookingPay.id}/verify`, { data: {} });
    expect(vr.ok()).toBeTruthy();
  }
  const cr = await planner.request.post(`/api/v1/weddings/${wid}/confirm`);
  expect(cr.ok()).toBeTruthy();

  const t = await j(await planner.request.get(`/api/v1/weddings/${wid}/tasks?pageSize=100`));
  expect((Array.isArray(t) ? t : t.items).length).toBeGreaterThan(25);
});

test('tasks: dragging a card between Kanban columns persists the new status', async () => {
  await planner.goto('/tasks');
  const card = planner.locator('button[draggable=true]').first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  const title = (await card.innerText()).split('\n')[0];
  const target = planner.locator('div.flex-1:has(span:text-is("In Progress"))').first();
  await card.dragTo(target);
  await expect(planner.locator('text=Moved to In Progress')).toBeVisible({ timeout: 10_000 });
  const t = await j(await planner.request.get(`/api/v1/weddings/${wid}/tasks?pageSize=100`));
  const row = (Array.isArray(t) ? t : t.items).find((x: Json) => x.name === title);
  expect(row.status).toBe('IN_PROGRESS');
});

test('vendors: select a winner, record a vendor advance in the UI, duplicate-proof', async () => {
  const caterers = (await j(await planner.request.get('/api/v1/vendors?category=CATERING&pageSize=10'))).slice(0, 3);
  const r = await j(await planner.request.post('/api/v1/quotations/requests', { data: { weddingId: wid, category: 'CATERING', title: `${RUN} catering`, vendorIds: caterers.map((v: Json) => v.id) } }));
  const quotes: Json[] = [];
  for (const [i, req] of (r.requests as Json[]).entries())
    quotes.push(await j(await planner.request.post(`/api/v1/quotations/requests/${req.id}/quotation`, { data: { guests: 400, guestCapacity: 500, ratePerPlate: 1100 + i * 100, items: [{ name: 'Banquet plate', quantity: 400, unit: 'plate', unitPrice: 1100 + i * 100, taxRate: 5 }] } })));
  await j(await planner.request.post(`/api/v1/quotations/${quotes[1].id}/select`, { data: { note: 'flow' } }));

  await finance.goto('/payments');
  await finance.locator('button:has-text("Record vendor payment")').click();
  const vendorSel = dlg(finance).locator('select').first();
  const firstVendor = await vendorSel.locator('option:not([value=""])').first().getAttribute('value');
  await vendorSel.selectOption(firstVendor!);
  await dlg(finance).locator('input[type=number]').fill('10000');
  await dlg(finance).locator('.btn-primary').click();
  await expect(finance.locator('text=Vendor payment recorded')).toBeVisible({ timeout: 10_000 });
  const vp = await j(await finance.request.get(`/api/v1/weddings/${wid}/payments`));
  expect(vp.vendorPayments.filter((p: Json) => Number(p.amount) === 10000)).toHaveLength(1);
});

test('role UI: UI hides actions the API would refuse (finance/ops)', async ({ browser }) => {
  await finance.goto('/enquiries');
  await expect(finance.locator('button:has-text("New enquiry")')).toHaveCount(0);
  const ops = await login(browser, 'sana');
  await ops.goto('/payments');
  await expect(ops.locator('text=You don’t have access to this screen')).toBeVisible();
  await expect(ops.locator('a[href="/payments"]')).toHaveCount(0);
  await ops.goto('/command-centre');
  await expect(ops.locator('button:has-text("Log incident")')).toBeVisible();
});
