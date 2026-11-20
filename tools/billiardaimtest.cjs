// #2162: a remote player aiming at the billiard table bends over it, the left hand bridging near the cue tip, the right on the butt; the stroke hand
// pulls back with the charge and goes forward on the shot. Real Ghost + real Billiards on tools/billiardaim.html (a yawed table), seen from the side.
//   python3 -m http.server 8237 &   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/billiardaimtest.cjs http://localhost:8237 docs/verification/2162 [prefix]
// With SHOTS_BEFORE=1 the rig is withheld (the figure as it was before #2162: hands at rest, no bend) and only images are written.
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8237', out = 'docs/verification/2162', prefix = 'after'] = process.argv.slice(2);
let failed = 0; const check = (ok, name, data = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(data)}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billiardaim-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 1000, height: 640 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/billiardaim.html'); await page.waitForFunction(() => window.__aim?.ready, null, { timeout: 120000 });
    const shot = async (name, kind) => { await page.evaluate((k) => window.__aim.view(k), kind); await page.locator('canvas').screenshot({ path: path.join(out, `${name}.png`) }); };
    const S = (n, p, cue = true) => page.evaluate(([n, p, c]) => { window.__aim.step(n, p, c); return window.__aim.state(); }, [n, p, cue]);
    if (process.env.SHOTS_BEFORE) {
      await page.evaluate(() => { window.__aim.ghost.cueRig = null; const f = window.__aim.b.giveCueRig; window.__aim.b.giveCueRig = () => {}; });
      await S(30, 0.01); await shot(`${prefix}-aim-side`, 'side'); await S(30, 0.9); await shot(`${prefix}-charge-side`, 'side'); await shot(`${prefix}-charge-front`, 'front');
      console.log(errors.length ? 'FAIL ' + errors : 'IMAGES ONLY'); return;
    }
    const aim = await S(40, 0.01);
    check(aim.rig && aim.cueVisible && aim.w > 0.99, 'aiming: the table handed the figure its cue frame, the arms are fully on it', { rig: aim.rig, w: aim.w });
    check(aim.Lc && aim.Rc && aim.Lc.along < aim.Rc.along, 'left hand (bridge) nearer the tip than the right hand (butt), along the cue', { L: aim.Lc, R: aim.Rc });
    check(aim.Lc.off < 0.12 && aim.Rc.off < 0.12, 'both hands within 12 cm of the cue line', { L: aim.Lc.off, R: aim.Rc.off });
    check(aim.lean < -0.25 && aim.lean > -0.9, 'bent over (lean forward, bounded)', { lean: aim.lean });
    await shot('after-aim-side', 'side');
    const charge = await S(40, 0.9);
    check(charge.pull > aim.pull + 0.08 && charge.Rc.along + charge.pull > aim.Rc.along + aim.pull + 0.06, 'charging: the cue and the right hand are drawn back', { pull: [aim.pull, charge.pull], R: [aim.Rc.along + aim.pull, charge.Rc.along + charge.pull] });
    check(Math.abs(charge.Lc.along + charge.pull - (aim.Lc.along + aim.pull)) < 0.04, 'the bridge hand stays (along the cue, measured from the rest tip)', { a: aim.Lc.along + aim.pull, c: charge.Lc.along + charge.pull });
    await shot('after-charge-side', 'side'); await shot('after-charge-front', 'front');
    const rBefore = charge.R.slice(); const seq = [];
    for (let i = 0; i < 12; i++) { const s = await S(1, 0.9, false); seq.push(Math.round(Math.hypot(s.R[0] - rBefore[0], s.R[2] - rBefore[2]) * 1000) / 1000); }
    const maxFwd = Math.max(...seq);
    check(seq.length && maxFwd > 0.1, 'the shot: the stroke hand goes forward from the drawn-back position (peak offset in m)', { seq, maxFwd });
    const end = await S(40, 0.9, false);
    check(end.w < 0.01, 'afterwards the arms are released', { w: end.w });
    check(await page.evaluate(() => window.__aim.calls()) < 40, 'draw calls of one render stay small', await page.evaluate(() => window.__aim.calls()));
    check(errors.length === 0, 'no page errors', errors);
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})();
