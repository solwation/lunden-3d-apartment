// #2014: a walk -> stop -> turn sequence of three avatars (long hair, bun, curly) as frames, the springs' offsets (JSON) and the update cost.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/avatarswaytest.cjs http://localhost:8614 docs/verification/2014
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8614', out = 'docs/verification/2014'] = process.argv.slice(2);
const frames = [['1-walk', 1.5], ['2-stop', 2.15], ['3-forward-swing', 2.3], ['4-overshoot', 2.45], ['5-settled', 3.1], ['6-turn-mid', 3.35], ['7-turn-end', 3.6], ['8-swing-back', 3.75], ['9-settled', 4.8]];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarsway-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 640, height: 480 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = {};
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarsway.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    for (const [name, t] of frames) {
      data[name] = await page.evaluate((x) => window.__to(x), t);
      await page.locator('canvas').screenshot({ path: path.join(out, `${name}.png`) });
    }
    data.cost = await page.evaluate(() => window.__cost(20, 600));
    fs.writeFileSync(path.join(out, 'sway.json'), JSON.stringify(data, null, 1));
    const mx = (k) => Math.max(...Object.values(data).filter((d) => d[k]).flatMap((d) => d[k].flatMap((p) => p.map(Math.abs))));
    if (!(mx('hair') > 0.004)) errors.push('hair did not move');
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS', JSON.stringify({ maxHair: mx('hair'), maxBun: mx('bun'), maxHem: mx('hem'), cost: data.cost, calls: data['5-settled'].calls }));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
