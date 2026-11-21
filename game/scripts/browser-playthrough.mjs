import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = process.env.QONUNVERSE_QA_DIR || path.resolve('qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QONUNVERSE_BROWSER_PATH || undefined, channel: process.env.QONUNVERSE_BROWSER_PATH ? undefined : 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(15000);
const errors = [], failed = [], resources = [];
page.on('pageerror', e => errors.push(e.message));
page.on('requestfailed', r => { if (r.url().includes('127.0.0.1')) failed.push({ url: r.url(), error: r.failure() }); });
page.on('response', r => { if (r.url().endsWith('.glb')) resources.push(r.url()); });
const report = { browser: await browser.version(), viewport: '1280x720', checks: [], errors, failed };
const choice = async id => page.locator(`.choices [data-choice-id="${id}"]`).click();
const checkNode = async id => { await page.locator(`.dialogue[data-node-id="${id}"]`).waitFor(); };
const shot = name => page.screenshot({ path: path.join(output, name + '.png') });
const dialog = () => page.getByRole('dialog');
const close = () => dialog().getByRole('button', { name: 'Yopish', exact: true }).click();
async function readDocument(id) {
  await page.locator('.evidence-row button').filter({ has: page.locator('.evidence-id', { hasText: new RegExp(`^${id}$`) }) }).click();
  const read = page.locator('.document-action').getByRole('button', { name: 'O‘qib chiqdim', exact: true });
  if (await read.isEnabled()) await read.click();
}
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderStats);
  report.renderer = await page.locator('canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR) }; });
  report.menuStats = JSON.parse(await page.locator('canvas').getAttribute('data-render-stats'));
  await shot('menu');
  await page.getByRole('button', { name: 'Tajribani boshlash', exact: true }).click();
  await shot('roles');
  await page.getByRole('button', { name: 'Ishni boshlash', exact: true }).click();
  await checkNode('N001'); await choice('quiet'); await choice('goal'); await choice('confirm'); await checkNode('N020');
  await page.getByRole('button', { name: 'Zalda yurish', exact: false }).click();
  const canvas = page.locator('canvas');
  const before = await canvas.getAttribute('data-player-position');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1800); await page.keyboard.up('KeyW'); await page.waitForTimeout(1100);
  const after = await canvas.getAttribute('data-player-position');
  assert.notEqual(before, after, 'WASD should move the advocate'); report.checks.push({ name: 'keyboard-movement', before, after });
  const box = await canvas.boundingBox(); await page.mouse.move(box.x + 650, box.y + 250); await page.mouse.down(); await page.mouse.move(box.x + 750, box.y + 250, { steps: 10 }); await page.mouse.up();
  await shot('movement');
  await page.getByRole('button', { name: 'Suhbatga qaytish', exact: false }).click();
  await page.getByRole('button', { name: /Hujjatlar/ }).click();
  await dialog().waitFor();
  for (const id of ['E01', 'E02', 'E03', 'E05', 'E06', 'E07']) await readDocument(id);
  await page.getByRole('combobox', { name: 'Matn kattaligi' }).selectOption('200');
  await shot('document-zoom');
  await page.getByRole('combobox', { name: 'Matn kattaligi' }).selectOption('100');
  await close();
  await choice('respondent'); await choice('records'); await choice('inspect');
  await dialog().getByRole('button', { name: 'O‘qib chiqdim, davom etish', exact: true }).click();
  await checkNode('N020'); await choice('ready'); await choice('start'); await choice('listen'); await choice('claim'); await choice('continue'); await choice('questions');
  await checkNode('N110'); await shot('hearing');
  await choice('submit');
  for (const id of ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07']) {
    const row = page.locator('.evidence-row').filter({ has: page.locator('.evidence-id', { hasText: new RegExp(`^${id}$`) }) }); await row.locator('input').check();
  }
  await dialog().getByRole('button', { name: /Tanlanganlarni taqdim etish/ }).click();
  await choice('examine');
  for (const id of ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07']) {
    await page.locator('.evidence-row button').filter({ has: page.locator('.evidence-id', { hasText: new RegExp(`^${id}$`) }) }).click();
    await dialog().getByRole('checkbox', { name: 'Hujjat va uning chegaralari bilan tanishdim', exact: true }).check();
    await dialog().getByRole('button', { name: 'Sudda tekshirilgan deb qayd etish', exact: true }).click();
  }
  await dialog().getByRole('button', { name: 'Davom etish', exact: true }).click();
  await choice('return'); await choice('close'); await choice('closing'); await choice('build');
  await dialog().getByRole('button', { name: 'Oddiy tilda yakuniy fikr bildirish', exact: true }).click();
  await choice('finish'); await choice('ruling'); await checkNode('O_REFUND'); await shot('refund');
  await choice('reasons'); await choice('debrief'); await dialog().getByText('2 400 000 so‘mni qaytarish', { exact: true }).waitFor(); await shot('findings');
  await close(); await checkNode('N950'); await choice('review'); await close(); await choice('end');
  await page.getByText('BIRINCHI ISH YAKUNLANDI', { exact: true }).waitFor(); report.checks.push({ name: 'full-refund-playthrough', passed: true });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Saqlangan mashqni davom ettirish', exact: true }).click();
  await page.getByText('BIRINCHI ISH YAKUNLANDI', { exact: true }).waitFor(); report.checks.push({ name: 'save-after-reload', passed: true });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderStats);
  report.finalStats = JSON.parse(await page.locator('canvas').getAttribute('data-render-stats') || 'null');
  assert.ok(!resources.some(url => /\/prokuror(?:_|\.)/.test(url)), 'No prosecutor model should be downloaded');
  report.glbResources = [...new Set(resources)]; report.checks.push({ name: 'no-prosecutor-download', passed: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('mobile');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)); report.checks.push({ name: 'mobile-no-horizontal-overflow', passed: true });
  await page.getByRole('button', { name: 'Sozlamalar', exact: true }).click();
  await dialog().getByRole('checkbox', { name: 'Matnli rejim', exact: true }).check();
  await close(); report.checks.push({ name: 'text-mode-control', passed: true });
  await page.getByRole('button', { name: 'Yangi mashq', exact: true }).click();
  await checkNode('N001');
  await page.getByRole('button', { name: 'Sozlamalar', exact: true }).click();
  await dialog().getByRole('checkbox', { name: 'Matnli rejim', exact: true }).uncheck();
  await close(); await page.locator('canvas').waitFor();
  await page.locator('canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('button', { name: /3D yuklanmadi/ }).waitFor();
  await choice('quiet'); await checkNode('N010');
  report.checks.push({ name: 'webgl-loss-preserves-text-playthrough', passed: true });
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
} catch (error) {
  report.failure = String(error); await shot('failure').catch(() => {}); process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'playthrough.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); await browser.close();
}
