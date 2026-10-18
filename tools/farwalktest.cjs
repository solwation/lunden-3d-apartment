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
    // #1312: the page ends with "ALL PASS N checks" / "FAIL N checks" itself (also on an exception or its own 240 s budget);
    // if even that never comes, fail with the last #out text instead of hanging.
    try { await page.waitForFunction(() => document.getElementById('out')?.dataset.done, null, { timeout: 300000 }); }
    catch (e) {
      console.log(`FAIL farwalktest.html wrote no final line within 300 s; last #out: ${JSON.stringify(await page.evaluate(() => document.getElementById('out')?.textContent).catch(() => '(page unresponsive)'))}`);
      if (errors.length) console.log('page errors:', errors.join('; '));
      process.exitCode = 1; return;
    }
    console.log(await page.evaluate(() => document.getElementById('out').dataset.log));
    if (errors.length) console.log('page errors:', errors.join('; '));
    const ok = await page.evaluate(() => document.getElementById('out').dataset.done === 'pass');
    process.exitCode = ok && !errors.length ? 0 : 1;
  } finally { await browser.close(); }
})();
