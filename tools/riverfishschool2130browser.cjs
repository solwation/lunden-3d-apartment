// #2130: the real river fish before/after the school / hold / take layer, as frame sequences at fixed room times (the same in both phases):
//   school: the perch school seen from the bank while it turns; take: a quick take and its rings seen from the road bridge;
//   hold: a fish standing still in the lee of a lily patch. Before = BEFORE_DIR's riverfish.js served in place of the current one (the search
//   for the moments uses src/riverfishschool.js in both phases, so both show the same room times). Records draws/programs and update CPU.
// python3 tools/devserve.py 8330 . &   tools/browsertest.sh node tools/riverfishschool2130browser.cjs http://localhost:8330 OUTDIR before|after
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8330', out = process.argv[3] || '/tmp/fish2130', phase = process.argv[4] || 'after';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await kit.launch(), result = { phase, frames: [], errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (phase === 'before') await ctx.route(/\/src\/riverfish\.js(\?.*)?$/, (r) => r.fulfill({ path: path.join(process.env.BEFORE_DIR, 'riverfish.js'), contentType: 'text/javascript' }));
    const page = await ctx.newPage(); page.on('pageerror', (e) => result.errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/todo\.json|crash/.test(m.location()?.url ?? '')) result.errors.push(m.text()); });
    await page.goto(`${base}/?life&cloud=&month=7&day=10&time=12&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.riverFish && window.__app?.riverFlora, null, { timeout: 600000, polling: 250 });
    await kit.skipNameDialog(page);
    result.plan = await page.evaluate(async () => {
      const A = __app, F = A.riverFish; A.renderer.setAnimationLoop(null); A.showOverlay(false); document.getElementById('corner-qr')?.style.setProperty('display', 'none');
      const [sw, sch, cfg, rb] = await Promise.all([import('/src/riverfishswim.js'), import('/src/riverfishschool.js'), import('/src/config.js'), import('/src/riverbridge.js')]);
      const C = cfg.RIVER_FISH, T0 = 1700000, seed = F.sync.seed, specs = Array.from({ length: C.count }, (_, id) => sw.fishSpec(id, 0, seed));
      A.riverFlora.update(0, A.camera.position, false, false, 7);
      const cv = A.riverFlora.cover, ctx = sch.schoolContext(specs, seed, sch.coverFrame(cv.stones.concat(cv.lilies)));
      window.__f = { A, F, sw, sch, rb, C, ctx,
        setT(t) { F.sync.offset = (t + C.epoch) * 1000 - F.sync.now(); },
        view(t, eye, at, fov = 32) { A.player.spawn(eye[0], eye[2], 0); A.step(0.016); this.setT(t); this.fov0 ??= A.camera.fov; A.camera.fov = fov; A.camera.updateProjectionMatrix();
          A.camera.position.set(...eye); A.camera.lookAt(...at); A.camera.updateMatrixWorld(true);
          A.riverFlora.update(0.016, A.camera.position, false, false, 7); F.sOff?.clear(); F.update(0.016, false, 1); }, // (a jump in time: no easing from the last frame's offsets)
        bank(s, d, t, off = 3.2, up = 1.7) { const p = sw.riverPoint(s), side = d >= 0 ? 1 : -1, k = p.hw + off, ex = p.x + p.nx * k * side, ez = p.z + p.nz * k * side, tx = p.x + p.nx * d, tz = p.z + p.nz * d;
          return [[ex, cfg.SITE.bridges.shoreY + up, ez], [tx, sw.waterAt(s) - 0.3, tz]]; } };
      const f = window.__f, G = ctx.groups;
      // the school: the biggest one, all in their slots while the leader turns by more than 1 rad within 3 s
      const lead = [...G].filter(([, g]) => g.rank === 0).sort((a, b) => b[1].size - a[1].size)[0][0], members = G.get(lead).members;
      let school = null;
      for (let t = T0; t < T0 + 20000 && !school; t += 1) {
        const ps = members.map((id) => sch.presentAt(id, t, ctx, {})); if (ps.some((p) => p.w < 0.97) || ps[0].hold > 0 || ps[0].speed < 0.25) continue;
        const later = sch.presentAt(lead, t + 3, ctx, {}); if (Math.abs(Math.atan2(Math.sin(later.yaw - ps[0].yaw), Math.cos(later.yaw - ps[0].yaw))) > 1.0) school = { t, lead, members, s: ps[0].s, d: ps[0].d };
      }
      // the take nearest the foot-and-cycle bridge, its taker within 40 m of the bridge's middle
      const [[ax, az], [bx, bz]] = cfg.SITE.bridges.gc.ends, mid = [(ax + bx) / 2, (az + bz) / 2]; let take = null;
      for (let t = T0; t < T0 + 40000 && !take; t += 0.5) for (const r of sch.takeRings(t, ctx)) if (r.age < 0.5 && Math.hypot(r.x - mid[0], r.z - mid[1]) < 40) { take = { t: r.te, id: r.id, x: r.x, z: r.z, y: r.y, dist: Math.hypot(r.x - mid[0], r.z - mid[1]) }; break; }
      // a hold in the lee of a lily patch
      let hold = null;
      for (let t = T0; t < T0 + 20000 && !hold; t += 2) for (const [id, g] of G) { if (g.rank) continue; const h = sch.holdAt(specs[id], t, seed, ctx.cover); if (h.h === 1 && h.plan.cover === 'lily') { hold = { t, id, s: h.plan.s, d: h.plan.d, size: g.size }; break; } }
      // the eye on the road bridge: its downstream (west) edge, inside the railing, half way across
      const [[rx0, rz0], [rx1, rz1]] = cfg.SITE.bridges.road.ends, road = [(rx0 + rx1) / 2 - cfg.SITE.bridges.road.width / 2 + 0.5, (rz0 + rz1) / 2];
      return { T0, seed, road, cover: ctx.cover.length, school, take, hold, mid, deckY: cfg.SITE.bridges.deckY };
    });
    const P = result.plan;
    const info = () => page.evaluate(() => { const r = __app.renderer.info, F = __app.riverFish; const M = new __f.A.camera.matrixWorld.constructor(), V = __f.A.camera.position.clone(), cam = __f.A.camera;
      const fish = F.shown.map((f, i) => { F.fish.getMatrixAt(i, M); V.setFromMatrixPosition(M); const w = V.clone(); V.project(cam); return { id: f.id, sp: f.species, at: [w.x, w.y, w.z].map((v) => +v.toFixed(2)), ndc: [+V.x.toFixed(2), +V.y.toFixed(2)], school: f.school?.map((v) => +v.toFixed(2)), hold: f.hold, take: f.take }; });
      return { calls: r.render.calls, triangles: r.render.triangles, programs: r.programs?.length, drawn: F.fish.count, rings: F.rings.count, school: F.state().school ?? null, fish, eye: cam.position.toArray().map((v) => +v.toFixed(2)) }; });
    const frame = async (name, setup) => { await page.evaluate(setup.fn, setup.arg); const file = path.join(out, `${name}.png`); await kit.shot(page, file); result.frames.push({ name, file, ...(await info()) }); };
    if (P.school) for (const [i, dt] of [0, 1.5, 3].entries()) await frame(`school-${i}`, { fn: ([p, dt]) => { const f = __f, [eye, at] = f.bank(p.s, p.d, p.t + dt, 1.2, 1.8); f.view(p.t + dt, eye, at, 40); }, arg: [P.school, dt] });
    if (P.take) for (const [i, dt] of [-0.15, 0.6, 1.6].entries()) await frame(`take-${i}`, { fn: ([p, mid, deckY, dt]) => { const f = __f; f.view(p.t + dt, [mid[0], deckY + 1.6, mid[1]], [p.x, p.y, p.z], 30); }, arg: [P.take, P.road, P.deckY, dt] });
    if (P.hold) await frame('hold', { fn: (p) => { const f = __f, [eye, at] = f.bank(p.s, p.d, p.t, 1.0, 1.8); f.view(p.t, eye, at, 28); }, arg: P.hold });
    // RiverFish.update alone at the school (fixed observer, 3 x 300 steps), ms per frame; median of the three runs
    if (P.school) result.cpu = await page.evaluate((p) => { const f = __f, [eye, at] = f.bank(p.s, p.d, p.t); f.view(p.t, eye, at); const runs = []; for (let r = 0; r < 3; r++) { const t = performance.now(); for (let k = 0; k < 300; k++) f.F.update(0.016, false, 1); runs.push((performance.now() - t) / 300); } return +runs.sort((a, b) => a - b)[1].toFixed(3); }, P.school);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
