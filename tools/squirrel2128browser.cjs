// #2128: the squirrels' tail motion, scan, eating and digging in the real park. node tools/squirrel2128browser.cjs GAME OUT [BASE]
// Loads the game (month 10, noon, clear), puts one real squirrel on the ground by its tree and drives the production pose (Squirrels.pose,
// the same consumer the leader and a follower use) through short frame sequences: hopping, a leap, scanning (sitting up), eating and digging.
// With BASE (a git revision) the four squirrel modules are served from it instead: the "before" frames. Checks: no page/shader errors, the
// month reaches the brains (autumn caching), draws/programs with the squirrel in view, every frame's tail joints finite.
const kit = require('./testkit.cjs'), fs = require('node:fs'), { execFileSync } = require('node:child_process');
const [game = 'http://127.0.0.1:8328', out = 'docs/verification/2128', base = ''] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(data)}`); if (!ok) failed++; };
const VIEW = { width: 900, height: 560 };
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && /shader|THREE|WebGL|squirrel/i.test(m.text())) errors.push(m.text()); });
    if (base) for (const f of ['src/config.js', 'src/squirrels.js', 'src/squirrelbrain.js', 'src/squirrelsync.js']) {
      const body = execFileSync('git', ['show', `${base}:${f}`], { maxBuffer: 1 << 26 }); await page.route('**/' + f, (r) => r.fulfill({ contentType: 'text/javascript', body }));
    }
    await page.goto(`${game}/?test&time=12&month=10&weather=clear&freeze&cloud=`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.squirrels?.animals?.[1]?.isRigged, null, { timeout: 900000 });
    await kit.skipNameDialog(page);
    const setup = await page.evaluate(() => {
      const a = __app, S = a.squirrels; a.renderer.setAnimationLoop(null); a.showOverlay(false); a.testMode?.setFull(true);
      for (let i = 0; i < 5; i++) a.step(0.1);
      const q = S.animals[1], b = q.brain; b.env.now = () => 1e6; b.tree = b.homeTree(b.homeS(), true); const t = b.tr, // (a fixed clock: the same tree every run)
            f = { x: t.x + Math.cos(0.8) * 3.5, z: t.z + Math.sin(0.8) * 3.5 };
      Object.assign(b, { x: f.x, z: f.z, y: S.ground(f.x, f.z), yaw: 0, pitch: 0, rise: 0, run: 0, hasNut: false }); b.set('forage', 1e9);
      a.player.spawn(f.x + 1.5, f.z + 0.1, 0); a.step(0.05);
      window.T = { a, S, q, b, f,
        frame(st) { // one production pose + render: the camera beside the squirrel, zoomed in
          Object.assign(b, st.brain); b.state = st.state; b.y = S.ground(b.x, b.z) + (st.lift ?? 0);
          const c = a.camera; c.position.set(b.x + 1.45, S.ground(b.x, b.z) + 0.32, b.z + 0.05); c.zoom = 2.2; c.updateProjectionMatrix();
          c.rotation.set(Math.atan2(b.y + 0.16 - c.position.y, 1.45), Math.PI / 2, 0, 'YXZ'); c.updateMatrixWorld(true);
          S.time += st.dt; S.pose(q, 1.45, st.dt); a.renderer.info.reset(); a.renderer.render(a.scene, c);
          const tail = ['Tail_0', 'Tail_2', 'Tail_4', 'Tail_Tip'].map((n) => q.bones?.['Joint_' + n]?.quaternion.toArray().map((v) => +v.toFixed(3)));
          return { calls: a.renderer.info.render.calls, programs: a.renderer.info.programs?.length ?? 0, tail, finite: tail.every((x) => x?.every(Number.isFinite)) };
        } };
      return { month: S.month ?? null, life: b.life ? b.life() : null, rigged: q.isRigged };
    });
    if (!base) check(setup.month === 10 && setup.life?.bury === 0.8, 'the month reaches the brains (October: autumn caching)', setup);
    const phases = {
      hop: (k) => ({ state: 'forage', dt: 0.035, brain: { run: 1, rise: 0, pitch: 0, hasNut: false } }),
      leap: (k) => ({ state: 'leap', dt: 0.05, lift: 0.35 * Math.sin(Math.PI * k / 5), brain: { run: 1, rise: 0, pitch: (0.5 - k / 5) * 0.9, hasNut: false } }),
      scan: (k) => ({ state: base ? 'search' : 'scan', dt: 0.25, brain: { run: 0, rise: 1, pitch: 0, hasNut: false } }),
      eat: (k) => ({ state: 'eat', dt: 0.12, brain: { run: 0, rise: 1, pitch: 0, hasNut: !base } }),
      dig: (k) => ({ state: 'dig', dt: 0.06, brain: { run: 0, rise: 0, pitch: -0.45 + 0.12 * Math.sin(k * 1.1), hasNut: false } }),
    };
    const stats = {};
    for (const [name, at] of Object.entries(phases)) {
      const frames = [];
      for (let k = 0; k < 6; k++) {
        const r = await page.evaluate((st) => T.frame(st), at(k)); frames.push(r);
        await page.screenshot({ path: `${out}/${name}-${k}.png`, clip: { x: VIEW.width / 2 - 170, y: VIEW.height / 2 - 190, width: 340, height: 300 } });
      }
      stats[name] = { calls: frames[0].calls, programs: frames[0].programs, finite: frames.every((f) => f.finite), tailMoves: new Set(frames.map((f) => JSON.stringify(f.tail))).size };
    }
    console.log(JSON.stringify(stats));
    check(Object.values(stats).every((s) => s.finite), 'tail joints finite in every frame', stats);
    if (!base) check(stats.hop.tailMoves >= 5 && stats.scan.tailMoves >= 5, 'the tail moves from frame to frame (hopping and sitting)', { hop: stats.hop.tailMoves, scan: stats.scan.tailMoves });
    fs.writeFileSync(`${out}/browser${base ? '-before' : ''}.json`, JSON.stringify({ base: base || null, setup, stats, errors }, null, 2) + '\n');
    check(errors.length === 0, 'no page or shader errors', errors.slice(0, 3));
  } catch (e) { console.log('FAIL', e.stack); failed++; } finally { await browser.close(); }
  process.exit(failed ? 1 : 0);
})();
