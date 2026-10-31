import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100', viewport: { width: 1536, height: 1024 }, screenshot: 'off' },
  reporter: [['list']],
});
