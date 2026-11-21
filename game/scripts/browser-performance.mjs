import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const output = process.env.QONUNVERSE_QA_DIR || path.resolve('qa'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderStats);
await page.waitForTimeout(15000);
const samples = [];
for (let i = 0; i < 5; i++) { samples.push(JSON.parse(await page.locator('canvas').getAttribute('data-render-stats'))); await page.waitForTimeout(1000); }
const report = { browser: await browser.version(), viewport: '1280x720', warmupSeconds: 15, balancedSamples: samples, errors };
await page.getByRole('button', { name: 'Sozlamalar', exact: true }).click();
await page.getByRole('dialog').getByRole('combobox').selectOption('low');
await page.getByRole('button', { name: 'Davom etish', exact: true }).click();
await page.waitForTimeout(12000);
report.lowSamples = [];
for (let i = 0; i < 3; i++) { report.lowSamples.push(JSON.parse(await page.locator('canvas').getAttribute('data-render-stats'))); await page.waitForTimeout(1000); }
await writeFile(path.join(output, 'performance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await browser.close();
