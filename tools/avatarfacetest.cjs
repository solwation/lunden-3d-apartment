// #1138: screenshots of avatar faces from look codes (front, three-quarter, side) on tools/avatarface.html; checks one draw
// call per avatar and fails on page errors.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarfacetest.cjs http://localhost:8747 /tmp/shots-1138 [prefix] [codes]
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8747', out = '/tmp/shots-1138', prefix = 'face', codes = ''] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarface-'));
  const n = codes ? codes.split(',').length : 5;
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 340 * n, height: 520 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarface.html' + (codes ? `?codes=${codes}` : ''));
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const v of ['front', 'q', 'side']) {
      const calls = await page.evaluate((v) => window.__shot(v), v);
      if (calls !== n) errors.push(`${v}: ${calls} draw calls for ${n} avatars`);
      await page.locator('canvas').screenshot({ path: path.join(out, `${prefix}-${v}.png`) });
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
