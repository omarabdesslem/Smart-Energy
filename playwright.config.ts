import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testIgnore: 'static-hosting.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: process.env.BASE_URL || 'http://localhost:5173', browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
