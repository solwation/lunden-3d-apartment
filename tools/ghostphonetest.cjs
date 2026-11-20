// #2217: the smartphone of a typing remote avatar (tools/ghostphone.html): face and screen close-ups by day and in the evening.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/ghostphonetest.cjs http://localhost:8278/new OUTDIR [suffix]
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8278', out = '/tmp/shots2217', suffix = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/ghostphone.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    for (const [view, evening] of [['face', false], ['face', true], ['screen', false], ['screen', true]]) {
      const r = await page.evaluate(([v, e]) => window.__shot(v, e), [view, evening]); console.log(view, evening ? 'evening' : 'day', JSON.stringify(r));
      await page.locator('canvas').screenshot({ path: path.join(out, `phone-${view}-${evening ? 'evening' : 'day'}${suffix}.png`) });
    }
    await page.goto(base + '/tools/ghostphone.html?away'); // #2216: an away figure holds the phone too
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    { const r = await page.evaluate(() => window.__shot('face', true)); console.log('away face evening', JSON.stringify(r));
      await page.locator('canvas').screenshot({ path: path.join(out, `phone-away-evening${suffix}.png`) }); }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
