#!/usr/bin/env node
// #1236: runs tools/farwalktest.html headless; prints its PASS/FAIL lines, exits 1 on a failure.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const base = process.argv[2] || 'http://localhost:8776';
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/tools/farwalktest.html`);
    await page.waitForFunction(() => document.getElementById('out')?.dataset.done, null, { timeout: 280000 });
    console.log(await page.evaluate(() => document.getElementById('out').dataset.log));
    if (errors.length) console.log('page errors:', errors.join('; '));
    const ok = await page.evaluate(() => document.getElementById('out').dataset.done === 'pass');
    process.exitCode = ok && !errors.length ? 0 : 1;
  } finally { await browser.close(); }
})();
