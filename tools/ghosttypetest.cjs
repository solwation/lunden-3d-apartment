// #2174: typing pose on remote avatars (tools/ghosttype.html): front and side screenshots.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/ghosttypetest.cjs http://localhost:8235 OUTDIR [suffix] [query]
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8235', out = '/tmp/shots2174', suffix = '', query = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 640 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/tools/ghosttype.html' + query);
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    for (const view of ['front', 'side']) {
      const r = await page.evaluate((v) => window.__shot(v), view); console.log(view, JSON.stringify(r));
      await page.locator('canvas').screenshot({ path: path.join(out, `type-${view}${suffix}.png`) });
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
