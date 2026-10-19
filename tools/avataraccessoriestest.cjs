// #1321, #1322: screenshots of the headwear (none, cap forwards / backwards, knitted hat, brimmed hat) on tools/avataraccessories.html
// for every hairstyle (style 0–4) without and with each kind of headphones (phones 0–2): front, 3/4, side, back; one draw call per avatar; fails on page errors.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avataraccessoriestest.cjs http://localhost:8743 /tmp/shots-1321 [prefix]
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8743', out = '/tmp/shots-1321', prefix = 'after'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avataracc-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1600, height: 700 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    for (const [style, phones] of [0, 1, 2, 3, 4].flatMap((st) => [0, 1, 2].map((ph) => [st, ph]))) {
      await page.goto(`${base}/tools/avataraccessories.html?style=${style}&phones=${phones}`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
      for (const v of ['front', 'q', 'side', 'back']) {
        await page.evaluate((v) => window.__shot(v), v);
        await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-s${style}${phones ? '-ph' + phones : ''}-${v}.png`) });
      }
      const info = await page.evaluate(() => window.__info());
      if (info.calls !== info.avatars) errors.push(`draw calls ${info.calls} for ${info.avatars} avatars`);
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
