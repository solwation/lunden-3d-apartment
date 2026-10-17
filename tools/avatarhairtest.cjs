// #1102: screenshots of the four avatar hairstyles (front, 3/4, side, back and a far front) on tools/avatarhair.html;
// prints the triangles per style and fails on page errors.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarhairtest.cjs http://localhost:8615 /tmp/shots-1102 [prefix]
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8615', out = '/tmp/shots-1102', prefix = 'after'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarhair-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1600, height: 520 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarhair.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const [v, far] of [['front'], ['q'], ['side'], ['back'], ['front', true]]) {
      await page.evaluate(([v, far]) => window.__shot(v, far), [v, !!far]);
      await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-${v}${far ? '-far' : ''}.png`) });
    }
    console.log(JSON.stringify(await page.evaluate(() => window.__info())));
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
