// #1799: other players' legs off the ground on tools/ghostairpose.html — no walking gait while flying (jetpack), swinging
// (web strand) or climbing (wall); trailing / ladder poses, smooth transitions and an unchanged walk. Shots + checks.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostairposetest.cjs http://localhost:8799 OUTDIR [OLD_BASE]
// OLD_BASE (optional): the same page served from the previous source (e.g. origin/main): the walk (am 0) must be identical.
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8799', out = '/tmp/shots-1799', oldBase = ''] = process.argv.slice(2);
const range = (a, k) => Math.max(...a.map((p) => p[k])) - Math.min(...a.map((p) => p[k]));
const maxStep = (a) => a.slice(1).reduce((m, p, i) => Math.max(m, Math.hypot(p[0] - a[i][0], p[1] - a[i][1], p[2] - a[i][2])), 0);
const MODES = [{ am: 0, v: 1.4 }, { am: 1, v: 5, vy: 0.3 }, { am: 2, v: 4, vy: -1.5 }, { am: 3, vy: 0.6 }];
const WALK = [{ v: 1.4 }, { v: 0.6 }, { v: 3 }, { v: 0 }]; // all am 0: what older clients and the ground look like

async function open(ctx, url, errors) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url + '/tools/ghostairpose.html');
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  return page;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostairpose-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 1400, height: 560 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], fail = (m) => errors.push(m);
  try {
    const page = await open(ctx, base, errors);
    // 1. every mode, side view: 45 frames to settle, then 30 measured
    await page.evaluate(() => window.__view('side'));
    await page.evaluate((m) => window.__run(45, m), MODES);
    const r = await page.evaluate((m) => window.__run(30, m), MODES);
    const [walk, fly, swing, climb] = r;
    console.log('gait', r.map((g) => g.gait.toFixed(3)).join(' '));
    if (!(walk.gait > 0.9 && range(walk.L, 2) > 0.2)) fail(`walk: no gait (${walk.gait}, z range ${range(walk.L, 2)})`);
    for (const [name, g, behind] of [['fly', fly, 0.2], ['swing', swing, 0.1]]) {
      const zs = [...g.L, ...g.R].map((p) => p[2]);
      console.log(name, 'ankle z', Math.min(...zs).toFixed(3), '…', Math.max(...zs).toFixed(3), 'hip z', g.hipZ.toFixed(3), 'L range', range(g.L, 2).toFixed(3), range(g.L, 1).toFixed(3));
      if (g.gait > 0.02) fail(`${name}: gait ${g.gait}`);
      if (Math.max(...zs) > g.hipZ - behind) fail(`${name}: the ankles do not trail behind the hips (${Math.max(...zs)})`);
      if (range(g.L, 2) > 0.12 || range(g.L, 1) > 0.12) fail(`${name}: the legs still cycle (${range(g.L, 2)}, ${range(g.L, 1)})`);
    }
    console.log('climb L y range', range(climb.L, 1).toFixed(3), 'R', range(climb.R, 1).toFixed(3), 'z', climb.L[0][2]);
    if (climb.gait > 0.02) fail(`climb: gait ${climb.gait}`);
    if (!(range(climb.L, 1) > 0.15 && range(climb.R, 1) > 0.15)) fail('climb: the feet do not step');
    const lUp = climb.L.map((p, i) => p[1] - climb.R[i][1]);
    if (!(Math.max(...lUp) > 0.15 && Math.min(...lUp) < -0.15)) fail('climb: the feet do not alternate');
    if (!(climb.L[0][2] > 0.1)) fail('climb: the feet are not towards the wall');
    await page.evaluate(() => window.__shot());
    await page.screenshot({ path: path.join(out, 'airpose-side.png') });
    await page.evaluate(() => window.__view('front'));
    await page.evaluate((m) => window.__run(20, m), MODES);
    await page.evaluate(() => window.__shot());
    await page.screenshot({ path: path.join(out, 'airpose-front.png') });
    // 2. still on the wall: the feet stay where they are
    await page.evaluate(() => window.__view('side'));
    await page.evaluate(() => window.__run(10, [{}, {}, {}, { am: 3 }]));
    const still = (await page.evaluate(() => window.__run(30, [{}, {}, {}, { am: 3 }])))[3];
    console.log('climb still range', range(still.L, 1), range(still.R, 1));
    if (range(still.L, 1) > 0.003 || range(still.R, 1) > 0.003) fail('climb: the feet move while still');
    // 3. smooth transitions: walk → take off → fly → land → stand; and walk → climb → walk. The blend may add to a walking
    // foot's own swing (≈ 0.1 m per frame at 1.4 m/s), but no ankle jumps the way an unblended switch would (0.4–0.7 m in one frame).
    await page.evaluate(() => window.__run(60, [{ v: 1.4 }]));
    const w = (await page.evaluate(() => window.__run(30, [{ v: 1.4 }])))[0];
    const seq = [];
    for (const s of [{ am: 1, v: 5 }, { am: 0, v: 0 }, { am: 0, v: 1.4 }, { am: 3, vy: 0.6 }, { am: 0, v: 0 }]) {
      const g = (await page.evaluate((s) => window.__run(30, [s]), s))[0];
      seq.push(maxStep(g.L), maxStep(g.R));
    }
    const walkStep = Math.max(maxStep(w.L), maxStep(w.R));
    console.log('per-frame ankle step: walking', walkStep.toFixed(3), 'transitions', seq.map((v) => v.toFixed(3)).join(' '));
    if (Math.max(...seq) > 0.2) fail(`a transition jumps (${Math.max(...seq)} m per frame vs walking ${walkStep})`);
    // 4. the walk itself: identical to the previous source for am 0 (older clients, the ground)
    if (oldBase) {
      const run = async (p) => { await p.evaluate(() => window.__view('side')); return p.evaluate((m) => window.__run(90, m), WALK); };
      const fresh = await open(ctx, base, errors), old = await open(ctx, oldBase, errors);
      const a = JSON.stringify(await run(fresh)), b = JSON.stringify(await run(old));
      console.log('walk vs old source:', a === b ? 'identical' : 'DIFFERENT');
      if (a !== b) fail('the walk differs from the old source');
      await old.evaluate((m) => { window.__view('side'); window.__run(45, m); }, MODES);
      await old.evaluate(() => window.__shot());
      await old.screenshot({ path: path.join(out, 'airpose-side-before.png') });
    }
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
