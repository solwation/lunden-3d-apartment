// #2034: cloth folds on three avatars (sweater + jeans, T-shirt + jeans, hoodie + wide trousers): standing, crouching, sitting and with bent
// elbows, close-ups, fold on/off pixel differences per pose, a far-view shimmer measure, draw calls and the CPU cost of the pose signal.
// tools/browsertest.sh node tools/avatarclothtest.cjs http://localhost:8234 docs/verification/2034
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8234', out = 'docs/verification/2034'] = process.argv.slice(2);
const poses = ['stand', 'crouch', 'sit', 'bent'];
// which close-up shows each pose's folds (and the same view standing, for the comparison)
const closeups = { bent: 'elbow', crouch: 'knee', sit: 'lap' };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarcloth-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 800, height: 600 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], data = { poses: {}, diff: {} };
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/avatarcloth.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    const shot = (name) => page.locator('canvas').screenshot({ path: path.join(out, `${name}.png`) });
    for (const p of poses) {
      data.poses[p] = { signal: await page.evaluate((x) => window.__pose(x), p) };
      data.poses[p].draw = await page.evaluate(() => window.__view('full'));
      await shot(`${p}-full`);
      data.diff[p] = {};
      for (const v of new Set(Object.values(closeups))) data.diff[p][v] = await page.evaluate((x) => window.__foldDiff(x), v);
      const v = closeups[p];
      if (v) { await page.evaluate((x) => window.__view(x), v); await shot(`${p}-${v}`); }
      if (p === 'stand') for (const w of [...new Set(Object.values(closeups)), 'weave', 'weaveTee', 'weaveHoodie']) { await page.evaluate((x) => window.__view(x), w); await shot(`stand-${w}`); }
    }
    await page.evaluate(() => window.__pose('stand'));
    data.shimmer = await page.evaluate(() => window.__shimmer(12));
    await page.evaluate(() => window.__view('far')); await shot('stand-far');
    data.cost = await page.evaluate(() => window.__cost(20, 600));
    fs.writeFileSync(path.join(out, 'cloth.json'), JSON.stringify(data, null, 1));
    // folds show where the pose bends and hardly when standing straight
    for (const [p, v] of Object.entries(closeups)) {
      const bent = data.diff[p][v].mean, straight = data.diff.stand[v].mean;
      if (!(bent > straight * 2 && bent > 0.4)) errors.push(`${p}: ${v} fold change ${bent.toFixed(3)} vs standing ${straight.toFixed(3)}`);
    }
    if (!(data.shimmer.ratio < 1.15)) errors.push(`far shimmer ratio ${data.shimmer.ratio.toFixed(3)}`);
    if (new Set(poses.map((p) => data.poses[p].draw.calls)).size !== 1) errors.push('draw calls differ');
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; }
    else console.log('PASS', JSON.stringify({ diff: Object.fromEntries(Object.entries(data.diff).map(([p, d]) => [p, Object.fromEntries(Object.entries(d).map(([v, x]) => [v, +x.mean.toFixed(3)]))])), shimmer: data.shimmer, cost: data.cost, calls: data.poses.stand.draw.calls, tris: data.poses.stand.draw.tris }));
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
