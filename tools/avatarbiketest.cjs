// #2148: bicycle motion on tools/avatarbike.html: the four riders and the wheel frame pair. PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarbiketest.cjs http://localhost:8220 OUTDIR [suffix]
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8220', out = '/tmp/shots2148', suffix = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/tools/avatarbike.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    for (const name of ['cases', 'wheel']) {
      const r = await page.evaluate((n) => window.__shot(n), name); console.log(name, JSON.stringify(r));
      await page.locator('canvas').screenshot({ path: path.join(out, `bike-${name}${suffix}.png`) });
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
