import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

async function keycloakEnabled(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/auth/keycloak/config`);
    if (!r.ok) return false;
    return Boolean((await r.json())?.data?.enabled);
  } catch { return false; }
}

test('frontend health endpoint needs no backend and no session', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.status()).toBe(200);
  expect(await r.json()).toMatchObject({ status: 'ok', service: 'frontend' });
});

test('system status page is public and reports real service state', async ({ page }) => {
  await page.goto('/system-status');
  await expect(page.getByRole('heading', { name: 'System status' })).toBeVisible();
  const grid = page.getByTestId('status-grid');
  const failed = page.getByText('Something went wrong');
  await expect(grid.locator('[data-service]').first().or(failed)).toBeVisible();
  if (await grid.locator('[data-service]').count()) {
    // Every card must carry a known state; the backend's own dependency list drives the cards.
    for (const card of await grid.locator('[data-service]').all()) {
      expect(['up', 'down', 'disabled']).toContain(await card.getAttribute('data-status'));
    }
  }
});

test.describe('keycloak sign-in (requires backend keycloak endpoints + NEXT_PUBLIC_DEMO_MODE=true build)', () => {
  test.beforeEach(async () => { test.skip(!(await keycloakEnabled()), 'backend reports Keycloak disabled or endpoint missing'); });

  test('login page offers the Keycloak mode', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('tab', { name: 'Keycloak' }).click();
    await expect(page.getByRole('button', { name: 'Sign in with Keycloak' })).toBeVisible();
  });

  test('demo switcher lists 5 roles and signs in as Finance Manager', async ({ page }) => {
    await page.goto('/login');
    const sw = page.getByTestId('demo-switcher');
    await expect(sw.locator('button')).toHaveCount(5);
    await sw.locator('button[data-role="FINANCE_MANAGER"]').click();
    await page.waitForURL('**/dashboard');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByText('Finance Manager').first()).toBeVisible();
  });

  test('profile-menu role switcher changes the active role', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('demo-switcher').locator('button[data-role="FOUNDER"]').click();
    await page.waitForURL('**/dashboard');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByTestId('role-switcher').getByRole('button', { name: /Operations Staff/ }).click();
    await page.waitForURL('**/dashboard');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByTestId('role-switcher').getByRole('button', { name: /Operations Staff/ })).toBeDisabled();
  });
});
