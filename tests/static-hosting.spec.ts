import { test, expect } from '@playwright/test';

test('static deployment saves, reloads, and generates proposals without API requests', async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('panel-count')).toHaveText('08 modules');
  await page.getByRole('button', { name: 'Green roof', exact: true }).click();
  await page.getByLabel('Solar module').selectOption('475');
  await page.getByRole('button', { name: 'Roof section 14', exact: true }).click();
  await page.getByRole('button', { name: 'Save design', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved in this browser', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('panel-count')).toHaveText('07 modules');
  await expect(page.getByRole('button', { name: 'Green roof', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Solar module')).toHaveValue('475');
  await page.getByRole('button', { name: 'Roof section 14', exact: true }).click();
  await page.getByRole('button', { name: 'Generate proposal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your home. Powered by possibility.' })).toBeVisible();
  await expect(page.locator('.proposal-metrics').getByText('8', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to design', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('panel-count')).toHaveText('08 modules');
  await expect(page.getByRole('button', { name: 'Saved in this browser', exact: true })).toBeDisabled();
  await page.screenshot({ path: `test-results/static/browser-storage-${test.info().project.name}.png`, fullPage: true });
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('a stale tab cannot overwrite a newer browser save', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate proposal', exact: true })).toBeEnabled();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('button', { name: 'Generate proposal', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Roof section 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save design', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved in this browser', exact: true })).toBeDisabled();
  await second.getByRole('button', { name: 'Orange roof', exact: true }).click();
  await second.getByRole('button', { name: 'Save design', exact: true }).click();
  await expect(second.getByRole('alert')).toContainText('another tab');
  await second.getByRole('button', { name: 'Load latest saved design', exact: true }).click();
  await expect(second.getByTestId('panel-count')).toHaveText('09 modules');
  await expect(second.getByRole('button', { name: 'Dark grey roof', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(second.getByRole('button', { name: 'Saved in this browser', exact: true })).toBeDisabled();
});

test('storage failures keep unsaved work visible and do not claim it was saved', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); }; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Green roof', exact: true }).click();
  await page.getByRole('button', { name: 'Generate proposal', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be saved in this browser');
  await expect(page.getByRole('heading', { name: 'Design & Propose.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Green roof', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Saved in this browser', exact: true })).toHaveCount(0);
});
