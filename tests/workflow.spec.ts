import { test, expect } from '@playwright/test';
import { initialDesign, type Design } from '@energy/contracts';

let previousDesign: Design | null = null;
let testRevision: number | null = null;
test.beforeAll(async ({ request }) => {
  const response = await request.get('/api/design');
  expect(response.ok()).toBeTruthy();
  previousDesign = await response.json();
});
test.afterAll(async ({ request }) => {
  if (testRevision === null) return;
  const current: Design = await (await request.get('/api/design')).json();
  // Restore only our own saved revision. Never overwrite a concurrent user save.
  if (current?.revision === testRevision) {
    const restored = await request.put('/api/design', { data: { ...(previousDesign || initialDesign), revision: testRevision } });
    expect(restored.ok()).toBeTruthy();
  }
});

test('HTML served at the API route produces a clear deployment error', async ({ page }) => {
  await page.route('**/api/design', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>SPA fallback</body></html>' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The API returned a webpage instead of JSON');
  await expect(page.getByRole('alert')).not.toContainText('The string did not match');
});

test('new designs start with eight lower-center panels and advance only through Generate proposal', async ({ page }) => {
  // Keep this fresh-workspace check independent of the saved user design.
  await page.route('**/api/design', async route => {
    const request = route.request();
    await route.fulfill({ contentType: 'application/json', json: request.method() === 'GET' ? null : { ...request.postDataJSON(), revision: 1, updatedAt: new Date().toISOString() } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Generate proposal', exact: true })).toBeEnabled();
  await expect(page.getByTestId('panel-count')).toHaveText('08 modules');
  const selected = page.locator('.roof-slot[aria-pressed="true"]');
  await expect(selected).toHaveCount(8);
  expect(await selected.evaluateAll(slots => slots.map(slot => slot.getAttribute('aria-label')))).toEqual([
    'Roof section 14', 'Roof section 15', 'Roof section 16', 'Roof section 17',
    'Roof section 24', 'Roof section 25', 'Roof section 26', 'Roof section 27',
  ]);
  const nextStep = page.getByRole('navigation', { name: 'Design steps' }).locator('.studio-step');
  await expect(nextStep).toHaveText('02Propose');
  await expect(page.getByRole('navigation', { name: 'Design steps' }).getByRole('button')).toHaveCount(1);
  await nextStep.click();
  await expect(page.getByRole('heading', { name: 'Design & Propose.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/default-eight-panels.png', fullPage: true });
  await page.getByRole('button', { name: 'Generate proposal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your home. Powered by possibility.' })).toBeVisible();
  await expect(nextStep).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.proposal-metrics').getByText('8', { exact: true })).toBeVisible();
});

test('click roof sections, undo, save, reload, and generate a proposal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Design & Propose.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Roof section 1', exact: true })).toBeEnabled();
  await expect(page.getByRole('group', { name: 'Roof color', exact: true }).getByRole('button')).toHaveCount(4);
  for (const color of ['Green', 'Orange', 'Dark grey', 'Red']) {
    const swatch = page.getByRole('button', { name: `${color} roof`, exact: true });
    await swatch.click();
    await expect(swatch).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.locator('.true-3d')).toHaveAttribute('data-roof-color', 'red');
  await page.getByRole('button', { name: 'Edit project details' }).click();
  await page.getByRole('dialog').getByLabel('Project name').fill(`Solar design verification ${Date.now()}`);
  await page.getByRole('button', { name: 'Apply details' }).click();
  await page.getByLabel('Solar module').selectOption('450');
  const removeAll = page.getByRole('button', { name: 'Remove all panels' });
  if (await removeAll.isEnabled()) await removeAll.click();
  await expect(page.getByTestId('panel-count')).toHaveText('00 modules');
  await expect(page.getByRole('button', { name: 'Generate proposal', exact: true })).toBeDisabled();
  const first = page.getByRole('button', { name: 'Roof section 1', exact: true });
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('panel-count')).toHaveText('01 modules');
  await expect(page.getByTestId('system-capacity')).toHaveText('0.45 kWp');
  const second = page.getByRole('button', { name: 'Roof section 2', exact: true });
  await second.focus();
  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('panel-count')).toHaveText('02 modules');
  await page.getByRole('button', { name: 'Undo panel change' }).click();
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('panel-count')).toHaveText('01 modules');
  await page.getByLabel('Solar module').selectOption('475');
  await expect(page.getByTestId('system-capacity')).toHaveText('0.48 kWp');
  const saving = page.waitForResponse(response => response.url().endsWith('/api/design') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save design', exact: true }).click();
  testRevision = (await (await saving).json()).revision;
  await expect(page.getByRole('button', { name: 'Design saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('panel-count')).toHaveText('01 modules');
  await expect(page.getByLabel('Solar module')).toHaveValue('475');
  await expect(page.getByRole('button', { name: 'Red roof', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Roof section 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.true-3d')).toHaveCount(1);
  await page.getByRole('button', { name: 'Generate proposal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your home. Powered by possibility.' })).toBeVisible();
  await expect(page.locator('.true-3d')).toHaveAttribute('data-roof-color', 'red');
  await expect(page.getByRole('cell', { name: '475 W all-black solar modules' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeVisible();
  if (await page.locator('.true-3d').getAttribute('data-renderer') === 'webgl') {
    await expect(page.locator('.renderer-host canvas')).toHaveCount(1);
    await expect(page.locator('.scene-print-snapshot')).toHaveAttribute('src', /^data:image\/png/);
  } else await expect(page.locator('.fixed-house-scene image')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/proposal.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.studio-header')).toBeHidden();
  await expect(page.locator('.proposal-actions')).toBeHidden();
  expect(errors).toEqual([]);
});

test('perspective orbit, camera presets, zoom, and responsive layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Roof section 1', exact: true })).toBeEnabled();
  await expect(page.locator('.true-3d')).toHaveCount(1);
  const firstPolygon = page.getByRole('button', { name: 'Roof section 1', exact: true }).locator('polygon');
  const initialPoints = await firstPolygon.getAttribute('points');
  const initialCount = await page.getByTestId('panel-count').textContent();
  const surface = page.locator('.scene-interaction');
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('The 3D viewport did not mount.');
  await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .7);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .3 + 85, bounds.y + bounds.height * .7 - 20, { steps: 8 });
  await page.mouse.up();
  await expect(firstPolygon).not.toHaveAttribute('points', initialPoints!);
  await expect(page.getByTestId('panel-count')).toHaveText(initialCount!);
  await page.getByRole('button', { name: 'Roof view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Roof view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const roofPoints = await firstPolygon.getAttribute('points');
  expect(roofPoints).not.toEqual(initialPoints);
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  await expect(firstPolygon).not.toHaveAttribute('points', roofPoints!);
  await page.getByRole('button', { name: 'Perspective view', exact: true }).click();
  await surface.focus();
  const beforeArrow = await firstPolygon.getAttribute('points');
  await page.keyboard.press('ArrowRight');
  await expect(firstPolygon).not.toHaveAttribute('points', beforeArrow!);
  await page.getByRole('button', { name: 'Fit house to view' }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.zoom-controls')).toContainText('115%');
  await page.getByRole('button', { name: 'Fit house to view' }).click();
  await expect(page.locator('.zoom-controls')).toContainText('100%');
  await page.screenshot({ path: 'test-results/design-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Generate proposal', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/design-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'How the roof designer works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Start designing', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('fixed-view roof placement remains usable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(`
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  `);
  await page.goto('/');
  await expect(page.locator('.true-3d')).toHaveAttribute('data-renderer', 'fixed');
  await expect(page.getByText('3D unavailable · Fixed roof view')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Perspective view', exact: true })).toHaveCount(0);
  const first = page.getByRole('button', { name: 'Roof section 1', exact: true });
  await expect(first).toBeEnabled();
  await page.getByRole('button', { name: 'Orange roof', exact: true }).click();
  await expect(page.locator('.fixed-roof-tint')).toHaveAttribute('fill', '#c47b3c');
  const selected = await first.getAttribute('aria-pressed');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', selected === 'true' ? 'false' : 'true');
  await page.getByRole('button', { name: 'Undo panel change' }).click();
  await expect(first).toHaveAttribute('aria-pressed', selected!);
  await page.screenshot({ path: 'test-results/design-vector-fallback.png', fullPage: true });
});
