// #2149: aim poses on tools/ghostaim.html (side view). PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostaimtest.cjs http://localhost:8221 OUTDIR [suffix]
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8221', out = '/tmp/shots2149', suffix = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 560 } });
    page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message); }); page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
    await page.goto(base + '/tools/ghostaim.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    console.log(JSON.stringify(await page.evaluate(() => window.__shot())));
    await page.locator('canvas').screenshot({ path: path.join(out, `aim${suffix}.png`) });
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
