// no &test: module-only fixture, no apartment bootstrap or renderer to accelerate.
// Exact historical helper baseline; no renderer, Worker or production code rewriting.
const { waitForState } = require('./semanticwait.cjs');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..'), sha = '633c18c';
const source = execFileSync('git', ['show', `${sha}:src/combatworld.js`], { cwd: root, encoding: 'utf8' });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.route(`**/src/combatworld.js?baseline=${sha}`, route => route.fulfill({ contentType: 'application/javascript', body: `${source}\nexport const TEST_BASELINE_SHA = '${sha}';\n` }));
    await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', route => {
      const cached = path.join(process.env.HOME, '.cache/three-0.170.0', route.request().url().split('three@0.170.0/')[1]);
      return fs.existsSync(cached) ? route.fulfill({ path: cached, contentType: 'application/javascript' }) : route.continue();
    });
    page.on('pageerror', error => console.error(error.message));
    await page.goto(`${process.env.BASE || 'http://127.0.0.1:8714'}/tools/combatremotetest.html`);
    await waitForState(page, () => window.result, null, { timeout: 45000 });
    const result = await page.evaluate(() => window.result);
    console.log(result.lines.join('\n')); process.exitCode = result.pass ? 0 : 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
