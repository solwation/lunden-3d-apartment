// #2161: a remote avatar reaching for a door handle and a thing on the floor (tools/ghostreach.html): one side-view screenshot mid-reach.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/ghostreachtest.cjs http://localhost:8236 OUTDIR [suffix] [query]
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8236', out = '/tmp/shots2161', suffix = '', query = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/tools/ghostreach.html' + query);
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    const r = await page.evaluate(() => window.__shot(0.5)); console.log(JSON.stringify(r));
    await page.locator('canvas').screenshot({ path: path.join(out, `reach${suffix}.png`) });
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
