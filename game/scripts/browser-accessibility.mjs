import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = process.env.QONUNVERSE_QA_DIR || path.resolve('qa'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const report = { checks: [], errors };
async function tabTo(predicate) {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(predicate)) return;
    await page.keyboard.press('Tab');
  }
  throw Error('Keyboard target was not reachable by Tab');
}
const button = async text => {
  for (let i = 0; i < 100; i++) {
    const match = await page.evaluate(t => document.activeElement?.tagName === 'BUTTON' && document.activeElement.textContent.trim() === t, text);
    if (match) { await page.keyboard.press('Enter'); return; }
    await page.keyboard.press('Tab');
  }
  throw Error('Cannot Tab to button: ' + text);
};
const choice = async id => {
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(value => document.activeElement?.getAttribute('data-choice-id') === value, id)) { await page.keyboard.press('Enter'); return; }
    await page.keyboard.press('Tab');
  }
  throw Error('Cannot Tab to choice: ' + id);
};
try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await tabTo(() => document.activeElement?.getAttribute('aria-label') === 'Sozlamalar'); await page.keyboard.press('Enter');
  await tabTo(() => document.activeElement?.tagName === 'INPUT' && document.activeElement.parentElement?.textContent === 'Matnli rejim'); await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await button('Tajribani boshlash'); await button('Ishni boshlash');
  await choice('quiet'); await choice('goal'); await choice('confirm'); await choice('ready'); await choice('start'); await choice('listen'); await choice('claim'); await choice('continue'); await choice('questions');
  await choice('close'); await choice('closing'); await choice('build');
  await button('Oddiy tilda yakuniy fikr bildirish'); await choice('finish'); await choice('ruling');
  await page.locator('.dialogue[data-node-id="O_INSUFFICIENT"]').waitFor();
  report.checks.push('Keyboard-only route reaches reasoned insufficient-record outcome after clarification');
  await choice('reasons'); await choice('debrief');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
  await page.keyboard.press('Shift+Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
  await page.keyboard.press('Escape'); await choice('replay');
  await page.locator('.dialogue[data-node-id="N100"]').waitFor(); report.checks.push('Keyboard-only replay returns to hearing checkpoint with branch disclosure');
  await page.screenshot({ path: path.join(output, 'keyboard-replay.png') });
  assert.deepEqual(errors, []);
  report.checks.push('Text-only playthrough, focus containment, Escape close and replay passed');
} catch(e) { report.failure = String(e); await page.screenshot({ path: path.join(output, 'keyboard-failure.png') }); process.exitCode = 1; }
await writeFile(path.join(output, 'keyboard.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close();
