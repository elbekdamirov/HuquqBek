import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Run with the Vite dev server already running. A fresh browser exercises the lazy 3D imports.
const origin = process.env.QONUNVERSE_QA_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.QONUNVERSE_BROWSER_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() === 504) errors.push(`HTTP 504 ${new URL(response.url()).pathname}`);
  });

  await page.goto(origin);
  await page.locator('.academy-hero-preview').click();
  await page.locator('.scenario-card').first().click();
  const hearing = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/learning/hearings/start' && response.ok(),
  );
  const room = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/assets/environment/courtroom.glb' && response.ok(),
  );
  await page.locator('.scenario-brief .learn-primary').click();
  await Promise.all([hearing, room]);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.trial-world canvas');
    return JSON.parse(canvas?.dataset.renderStats || '{}').triangles > 0;
  });
  assert.equal(await page.locator('html').evaluate(node => node.classList.contains('lenis')), false);

  const canvas = page.locator('.trial-world canvas');
  await canvas.click({ position: { x: 640, y: 375 } });
  const before = await canvas.getAttribute('data-player-position');
  assert.ok(before);
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(position =>
      document.querySelector('.trial-world canvas')?.dataset.playerPosition !== position, before,
    );
  } finally {
    await page.keyboard.up('w');
  }

  const stage = page.locator('.trial-stage-card h2');
  const initialStage = await stage.textContent();
  await page.locator('.trial-stage-card .learn-primary').click();
  await page.waitForFunction(previous =>
    document.querySelector('.trial-stage-card h2')?.textContent !== previous, initialStage,
  );
  assert.deepEqual(errors, []);
  console.log('Courtroom rendered from the academy. Movement and hearing progression passed.');
} finally {
  await browser.close();
}
