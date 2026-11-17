// #2019: back views of the hem and long hair, both body types, at rest and mid-stride.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarhemtest.cjs http://localhost:8619 docs/verification/2019
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8619', out = 'docs/verification/2019'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarhem-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 640, height: 480 }, deviceScaleFactor: 2, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], calls = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarhem.html' + (process.env.SWAY_OFF ? '?off' : ''));
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const [name, dist, y, walk] of [['1-rest-back', 3.2, 1.05, false], ['2-stride-back', 3.2, 1.05, true], ['3-stride-close', 1.6, 0.95, true]]) {
      calls[name] = await page.evaluate(([d, yy, w]) => window.__shot(d, yy, w), [dist, y, walk]);
      await page.locator('canvas').screenshot({ path: path.join(out, `${name}.png`) });
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify(calls));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
