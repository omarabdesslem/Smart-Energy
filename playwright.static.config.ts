import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'static-hosting.spec.ts',
  workers: 1,
  timeout: 60_000,
  outputDir: 'test-results/static',
  use: { baseURL: process.env.BASE_URL || 'http://localhost:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
});
