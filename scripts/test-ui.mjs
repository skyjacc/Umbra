import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Runs the built extension in an isolated profile. This exercises its real editor,
// storage and worker, but does not claim toolbar gesture/tabCapture coverage.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePrefix = path.join(tmpdir(), 'umbra-ui-');
const profile = await mkdtemp(profilePrefix);
let context;
try {
  const dist = path.join(root, 'dist');
  context = await chromium.launchPersistentContext(profile, {
    // Full Chromium supports extensions in headless mode; headless-shell does not.
    // https://playwright.dev/docs/chrome-extensions
    channel: 'chromium',
    ...(process.env.UMBRA_CHROMIUM_PATH ? { executablePath: process.env.UMBRA_CHROMIUM_PATH } : {}),
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`chrome-extension://${id}/src/popup/index.html`);
  await page.evaluate(() => { localStorage.UMBRA_LANG = 'en'; localStorage.HIDDEN_BUILTINS = '{}'; });
  await page.reload();
  await page.locator('[data-layout="window"]').waitFor();
  const graph = page.locator('svg[role="group"]');
  await graph.waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const wideWidth = (await graph.boundingBox()).width;
  assert.ok(wideWidth > 700, 'full-window graph must use the available width');

  // Editing must follow SVG coordinates after a resize, not raw screen pixels.
  for (const width of [1280, 480]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await graph.boundingBox();
    const dot = await graph.locator('[role="slider"]').nth(4).boundingBox();
    await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4, { steps: 6 });
    await page.mouse.up();
    const expectedGain = await graph.evaluate(svg => (1 - (svg.viewBox.baseVal.y + svg.viewBox.baseVal.height * 0.4) / 252) * 120 - 60);
    await page.waitForFunction(expected => Math.abs(Number(document.querySelector('input[aria-label="Gain in decibels"]')?.value) - expected) < 0.2, expectedGain);
    // The graph's fourth-root frequency scale maps its midpoint to 1.3 kHz.
    const freq = Number(await page.getByRole('textbox', { name: 'Frequency in hertz', exact: true }).inputValue());
    assert.ok(freq > 1200 && freq < 1400, `incorrect resized pointer frequency: ${freq}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  }

  await page.locator('[data-tab="presets"]').click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Hide (restore below)', exact: true }).first().click();
  await page.getByRole('button', { name: 'Restore built-ins', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Hide (restore below)', exact: true }).count(), 4);
  const longName = 'My headphone profile for music and films — a very long preset name that must fit';
  await page.getByPlaceholder('Name a preset…').fill(longName);
  await page.getByRole('button', { name: '+ Save', exact: true }).click();
  await page.locator('.preset-apply').filter({ hasText: longName }).click();
  const update = page.getByRole('button', { name: 'Update', exact: true });
  await update.waitFor();
  const updateBox = await update.boundingBox();
  assert.ok(updateBox.x >= 0 && updateBox.x + updateBox.width <= 480, 'Update must stay reachable');

  await page.locator('[data-tab="rules"]').click();
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  await page.getByRole('button', { name: /^Sound for this rule:/ }).click();
  await page.getByRole('listbox', { name: 'Sound for this rule', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.ok(await page.getByRole('button', { name: /^Sound for this rule:/ }).evaluate(el => el === document.activeElement));

  await page.locator('[data-tab="more"]').click();
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
  await page.locator('[data-tab="eq"]').click();
  await page.setViewportSize({ width: 620, height: 580 });
  // CSS-only popup harness: native toolbar opening/capture still requires its own smoke test.
  await page.locator('[data-layout]').evaluate(el => { el.dataset.layout = 'popup'; });
  const inspector = await page.getByTestId('band-fields').boundingBox();
  assert.ok(inspector.y + inspector.height <= 580, 'selected-band inspector must fit inside the popup');
  const popup = await page.locator('body').boundingBox();
  assert.equal(popup.width, 620);
  assert.equal(popup.height, 580);
  for (const view of ['eq', 'presets', 'rules', 'tabs', 'more']) {
    await page.locator(`[data-tab="${view}"]`).click();
    const nav = await page.locator('nav').boundingBox();
    assert.ok(nav.y + nav.height <= 580.5, `${view}: navigation must remain reachable`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 620);
  }
  assert.deepEqual(errors, []);
  console.log('UI smoke passed: responsive drag, presets, listbox, language, popup CSS/navigation; no page errors.');
} finally {
  await context?.close();
  if (path.resolve(profile).startsWith(path.resolve(profilePrefix))) await rm(profile, { recursive: true, force: true });
}
