// #2018: three avatars through dry / soaked / snowy outdoors and indoors a while later (frames, state JSON, draw calls, update cost).
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarweathertest.cjs http://localhost:8618 docs/verification/2018
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8618', out = 'docs/verification/2018'] = process.argv.slice(2);
const frames = ['dry', 'wet', 'snow', 'indoors60', 'indoorsLater'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarsway-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 640, height: 480 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarweather.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const name of frames) {
      data[name] = await page.evaluate((x) => window.__step(x), name);
      await page.locator('canvas').screenshot({ path: path.join(out, `${name}.png`) });
    }
    data.cost = await page.evaluate(() => window.__cost(20, 600));
    fs.writeFileSync(path.join(out, 'weather.json'), JSON.stringify(data, null, 1));
    if (!(data.wet.wet[0] > 0.9)) errors.push('not soaked');
    if (!(data.snow.snow[0] > 0.9)) errors.push('no snow');
    if (!(data.indoorsLater.wet[0] === 0 && data.indoorsLater.snow[0] === 0)) errors.push('did not dry');
    if (new Set(frames.map((f) => data[f].calls)).size !== 1) errors.push('draw calls differ');
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify({ cost: data.cost, calls: data.dry.calls, tris: data.dry.tris }));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
