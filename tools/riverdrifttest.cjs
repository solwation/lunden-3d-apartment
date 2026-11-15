// #1952: the drifting flecks on Höje å and the specks under its surface, in the real app.
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/riverdrifttest.cjs GAME OUT
// Checks: far from the river nothing is drawn (+0 draw calls); at the river the flecks are one draw call, lie on the water (never over land,
// never in a bridge pier) at stations along the whole river incl. the bends and under the bridges, and move downstream at RIVER_DRIFT.speed;
// under water the specks exist only while the eye is under the surface (+1 draw call, the surface flecks off), stay between the surface and
// the bed, drift downstream at the same speed, and an idle diver drifts along with them. Saves result images in OUT.
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8156', out = process.argv[3] || '/tmp/drift1952';
const results = []; let pass = true;
const check = (ok, name, data) => { results.push({ ok: !!ok, name, data }); pass &&= !!ok; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' ' + JSON.stringify(data) : ''}`); };
const frames = (page, n = 6) => page.evaluate((n) => new Promise((done) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : done()); f(); }), n);
(async () => {
  const browser = await kit.launch();
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => route.fulfill({
      path: path.join(process.env.THREE_DIR, new URL(route.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?shot&cloud=&month=6&time=13&freeze&weather=clear&at=-40,150,180,0&test=lazy`, { waitUntil: 'commit' });
    page.on('console', (m) => { if (/Startup failed/.test(m.text())) { console.error(m.text()); process.exit(1); } });
    await page.waitForFunction(() => window.__app?.player && window.__app?.ghosts, null, { timeout: 600000, polling: 200 });
    await kit.skipNameDialog(page); fs.mkdirSync(out, { recursive: true });
    await page.evaluate(async () => {
      const A = window.__app, p = A.player, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js'), sw = await import('/src/swim.js');
      const dt = 1 / 60, P = rb.riverPath, W = C.WALK; let best = null;
      for (let i = 1; i < P.length; i++) { // a straight open stretch: the middle of the longest walkable segment (as swimtest.cjs)
        const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < W.x0 + 30 || mx > W.x1 - 30 || rb.deckAt(mx, mz) !== null || !fw.swimWater(mx, mz)) continue;
        if (!best || l > best.l) best = { l, x: mx, z: mz, i };
      }
      const f = rb.riverAt(best.x, best.z), d = sw.currentDir(f), S = A.riverDrift.surface, U = A.riverDrift.under;
      const T = window.__drift = { A, p, rb, fw, C, sw, dt, best, f, d, S, U,
        face: (dx, dz, pitch = 0) => A.camera.rotation.set(pitch, Math.atan2(-dx, -dz), 0, 'YXZ'),
        run: (s, keys = []) => { for (const k of keys) p.keys.add(k); for (let t = 0; t < s; t += dt) p.update(dt); for (const k of keys) p.keys.delete(k); },
        // the drawn things, read back from the buffers the GPU gets (world coordinates)
        flecks: () => { const a = S.pos.array, c = S.col.array, m = S.mesh.position, o = []; if (!S.mesh.visible) return o;
          for (let i = 0; i < S.C.count; i++) { const k = i * 12; o.push({ i, x: m.x + (a[k] + a[k + 6]) / 2, y: m.y + a[k + 1], z: m.z + (a[k + 2] + a[k + 8]) / 2, a: c[i * 16 + 3], len: Math.hypot(a[k + 3] - a[k], a[k + 5] - a[k + 2]) / 2 }); } return o; },
        specks: () => { const a = U.pos.array, c = U.col.array, m = U.points.position, o = []; if (!U.points.visible) return o;
          for (let i = 0; i < U.C.count; i++) o.push({ i, x: m.x + a[i * 3], y: m.y + a[i * 3 + 1], z: m.z + a[i * 3 + 2], a: c[i * 4 + 3] }); return o; },
        // draw calls of one hand-made render with the object shown / hidden (everything else identical)
        calls: (obj) => { const r = A.renderer, was = obj.visible, n = (v) => { obj.visible = v; r.info.reset(); r.render(A.scene, A.camera); return r.info.render.calls; }; const on = n(true), off = n(false); obj.visible = was; return { on, off }; },
        frame: () => { const r = A.renderer; r.info.reset(); r.render(A.scene, A.camera); return r.info.render.calls; },
        inPier: (x, z) => rb.pierBoxes().some((b) => Math.max(Math.abs((x - b.x) * b.dx + (z - b.z) * b.dz), Math.abs(-(x - b.x) * b.dz + (z - b.z) * b.dx)) < rb.bridgeRecords[0].pier / 2 + 0.05),
        bank: (x, z, side = 1, off = 4.5, back = 0) => { const r = rb.riverAt(x, z); const ex = r.x + r.nx * side * (r.width / 2 + off) - r.nz * back, ez = r.z + r.nz * side * (r.width / 2 + off) + r.nx * back; p.swim = null; p.crouch = false; p.spawn(ex, ez, 0); p.pos.y = fw.surfaceY(ex, ez, -4); p.update(dt); return { x: ex, z: ez }; },
        start: (x = best.x, z = best.z) => { p.crouch = false; p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.update(dt); T.run(0.6); },
      };
      p.onWaterRescue = () => {};
    });

    // 1. far from the river (the courtyard): nothing drawn, nothing added
    await page.evaluate(() => { const T = window.__drift, p = T.p; p.spawn(-20, 10, 0); p.update(T.dt); T.face(0, 1); });
    await frames(page, 6);
    const far = await page.evaluate(() => { const T = window.__drift, e = T.A.camera.position; return { eye: [e.x, e.z], river: T.rb.riverAt(e.x, e.z).distance, surface: T.S.mesh.visible, under: T.U.points.visible, calls: [T.frame(), T.frame(), T.frame(), T.frame()], inScene: [T.S.mesh.parent === T.A.scene, T.U.points.parent === T.A.scene] }; });
    check(far.river > 75 && !far.surface && !far.under && far.calls[3] === far.calls[2], 'in the courtyard: neither object is visible (+0 draw calls; the frame\'s own count is steady)', far);

    // 2. from the bank: one draw call, flecks on the water, moving downstream at the current's speed
    await page.evaluate(() => { const T = window.__drift, b = T.bank(T.best.x, T.best.z, 1, 3.5); T.face(T.best.x + T.d.x * 6 - b.x, T.best.z + T.d.z * 6 - b.z, -0.3); });
    await frames(page, 6);
    const a = await page.evaluate(() => { const T = window.__drift; return { t: T.S.t, wall: performance.now(), sc: T.S.near.s, f: T.flecks(), ids: T.f && Array.from({ length: T.S.C.count }, (_, i) => T.S.field.particle(i, T.S.t, T.S.near.s, {}).id), calls: T.calls(T.S.mesh), underVisible: T.U.points.visible }; });
    await page.waitForTimeout(4000); await frames(page, 2);
    const b = await page.evaluate(() => { const T = window.__drift; return { t: T.S.t, wall: performance.now(), sc: T.S.near.s, f: T.flecks(), ids: Array.from({ length: T.S.C.count }, (_, i) => T.S.field.particle(i, T.S.t, T.S.near.s, {}).id), d: T.d, speed: T.C.RIVER_DRIFT.speed, current: T.C.SWIM.current }; });
    {
      const dt = b.t - a.t; let n = 0, along = 0, across = 0, lo = Infinity, hi = -Infinity;
      for (let i = 0; i < a.f.length; i++) { if (a.ids[i] !== b.ids[i] || a.f[i].a < 0.2) continue; const dx = b.f[i].x - a.f[i].x, dz = b.f[i].z - a.f[i].z, v = (dx * b.d.x + dz * b.d.z) / dt; n++; along += v; across += Math.abs(-dx * b.d.z + dz * b.d.x) / dt; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const m = { flecks: n, seconds: dt, wall: (b.wall - a.wall) / 1000, mean: along / n, min: lo, max: hi, across: across / n, speed: b.speed, swimCurrent: b.current };
      check(a.f.length && a.calls.on - a.calls.off === 1 && !a.underVisible, 'at the river: the flecks are exactly one draw call; nothing under water is drawn', { calls: a.calls, visible: a.f.filter((f) => f.a > 0.05).length });
      check(n > 100 && dt > 2 && Math.abs(m.mean - b.speed) < 0.02 && lo > b.speed * 0.6 && hi < b.speed * 1.4 && b.speed === b.current, 'the flecks move downstream at the current\'s speed (the swimmer\'s 0.35 m/s)', m);
    }
    await kit.shot(page, path.join(out, 'ytan-fran-strandkanten.png'));

    // 3. along the whole river: on the water, never over land or in a pier (production update with the eye moved from station to station)
    const whole = await page.evaluate(() => {
      const T = window.__drift, { S, rb, fw } = T, path = S.river.path, o = { stations: 0, drawn: 0, land: [], pier: [], high: [], underDeck: 0, bend: 0, lift: [Infinity, -Infinity], ends: [] };
      for (let s = 0; s <= path.length; s += 12) {
        const c = path.at(s, {}); S.update(0, { x: c.x, y: 0, z: c.z }, false); o.stations++;
        for (const f of T.flecks()) { if (f.a < 0.02) continue; o.drawn++;
          const lift = f.y - rb.waterYAt(f.x, f.z); o.lift[0] = Math.min(o.lift[0], lift); o.lift[1] = Math.max(o.lift[1], lift);
          if (!fw.swimWater(f.x, f.z)) o.land.push([+f.x.toFixed(1), +f.z.toFixed(1), +f.a.toFixed(2)]);
          if (T.inPier(f.x, f.z)) o.pier.push([f.x, f.z]);
          if (rb.deckAt(f.x, f.z) !== null) o.underDeck++;
          if (Math.hypot(f.x - 131.4, f.z - 74.6) < 12 || Math.hypot(f.x + 67.5, f.z - 166.1) < 12) o.bend++; }
      }
      const e = T.A.camera.position; S.update(0, e, false); return o;
    });
    check(whole.drawn > 5000 && whole.land.length === 0 && whole.pier.length === 0 && whole.underDeck > 20 && whole.bend > 50 && whole.lift[0] > 0.004 && whole.lift[1] < 0.03,
      'along the whole river (bends, under the bridges): every fleck lies on open water, just over the water line, clear of the piers', { ...whole, land: whole.land.slice(0, 12), landN: whole.land.length });

    // 4. from the road bridge, looking down at the water (picture)
    await page.evaluate(() => { const T = window.__drift, p = T.p, r = T.rb.bridgeRecords[0], c = T.rb.riverAt(r.x, r.z), x = r.x - r.dz * (r.width / 2 + 1.2) * -1, z = c.z; p.swim = null; p.spawn(x, z, 0); p.pos.y = T.C.SITE.bridges.deckY + 0.2; p.update(T.dt); T.run(0.5); T.pos = [p.pos.x, p.pos.y, p.pos.z]; const d = T.sw.currentDir(c); T.face(-d.x, -d.z, -0.45); });
    await frames(page, 6);
    const bridge = await page.evaluate(() => { const T = window.__drift, e = T.A.camera.position; return { eye: e.toArray(), overWater: e.y - T.rb.waterYAt(e.x, e.z), visible: T.S.mesh.visible, calls: T.calls(T.S.mesh) }; });
    check(bridge.visible && bridge.overWater > 3 && bridge.calls.on - bridge.calls.off === 1, 'from the road bridge: drawn, one draw call', bridge);
    await kit.shot(page, path.join(out, 'ytan-fran-vagbron.png'));

    // 5. under water: only while the eye is under the surface; +1 draw call; in the water; drifting downstream; an idle diver drifts along
    await page.evaluate(() => { const T = window.__drift; T.start(); T.face(T.d.x, T.d.z, -0.1); });
    await frames(page, 6);
    const top = await page.evaluate(() => { const T = window.__drift; return { swim: !!T.p.swim, under: T.U.points.visible, surface: T.S.mesh.visible }; });
    await page.evaluate(() => { const T = window.__drift; T.p.crouch = true; T.run(2.5); }); await frames(page, 6);
    const u0 = await page.evaluate(() => { const T = window.__drift, e = T.A.camera.position; return { t: T.U.t, eye: e.toArray(), diving: T.p.diving, under: T.U.points.visible, surface: T.S.mesh.visible, calls: T.calls(T.U.points), sc: T.U.near.s,
      f: T.specks().map((f) => ({ ...f, water: T.rb.waterYAt(f.x, f.z), bed: T.fw.swimBedY(f.x, f.z), open: T.fw.swimWater(f.x, f.z), pier: T.inPier(f.x, f.z) })), ids: Array.from({ length: T.U.C.count }, (_, i) => T.U.field.particle(i, T.U.t, T.U.near.s, {}).id) }; });
    await kit.shot(page, path.join(out, 'under-ytan.png'));
    // the diver holds still for 3 s of game time (the current carries them): the production player step and the production drift update
    const u1 = await page.evaluate(() => { const T = window.__drift, e = T.A.camera.position, { p, U } = T; U.update(0, e, true);
      const t0 = U.t, e0 = e.toArray(), f0 = T.specks(), id0 = Array.from({ length: U.C.count }, (_, i) => U.field.particle(i, U.t, U.near.s, {}).id);
      for (let t = 0; t < 3; t += T.dt) { p.update(T.dt); U.update(T.dt, e, true); }
      return { t0, e0, f0, id0, t: U.t, eye: e.toArray(), d: T.d, f: T.specks(), ids: Array.from({ length: U.C.count }, (_, i) => U.field.particle(i, U.t, U.near.s, {}).id) }; });
    {
      const shown = u0.f.filter((f) => f.a > 0.05), bad = shown.filter((f) => !(f.y < f.water - 0.02 && f.y > f.bed + 0.05 && f.open && !f.pier));
      const dt1 = u1.t - u1.t0; let n = 0, along = 0; for (let i = 0; i < u1.f0.length; i++) { if (u1.id0[i] !== u1.ids[i] || u1.f0[i].a < 0.2) continue; n++; along += ((u1.f[i].x - u1.f0[i].x) * u1.d.x + (u1.f[i].z - u1.f0[i].z) * u1.d.z) / dt1; }
      const diver = ((u1.eye[0] - u1.e0[0]) * u1.d.x + (u1.eye[2] - u1.e0[2]) * u1.d.z) / dt1;
      check(top.swim && !top.under && top.surface, 'swimming at the surface: no specks under water, the flecks on it', top);
      check(u0.diving && u0.under && !u0.surface && u0.calls.on - u0.calls.off === 1, 'diving: the specks are exactly one draw call and the surface flecks are off', { calls: u0.calls, eye: u0.eye });
      check(shown.length > 60 && bad.length === 0, 'every speck is in the water: under the surface, over the bed, clear of the piers', { shown: shown.length, bad: bad.slice(0, 5), depth: [Math.min(...shown.map((f) => f.water - f.y)), Math.max(...shown.map((f) => f.water - f.y))] });
      check(n > 40 && Math.abs(along / n - 0.35) < 0.02, 'the specks drift downstream at the current\'s speed', { specks: n, seconds: dt1, mean: along / n });
      check(Math.abs(diver - along / n) < 0.06, 'an idle diver drifts along with them (no relative motion)', { diver, specks: along / n });
    }
    // swimming upstream: they come towards the diver
    const up = await page.evaluate(() => { const T = window.__drift, { p, d, U } = T, e = T.A.camera.position; T.face(-d.x, -d.z, 0);
      const rel = () => { const o = {}; for (let i = 0; i < U.C.count; i++) { const q = U.field.particle(i, U.t, U.near.s, {}); o[i + ':' + q.id] = (q.x - e.x) * d.x + (q.z - e.z) * d.z; } return o; };
      U.update(0, e, true); const r0 = rel(), t0 = U.t; p.keys.add('KeyW'); for (let t = 0; t < 2; t += T.dt) { p.update(T.dt); U.update(T.dt, e, true); } p.keys.delete('KeyW'); const r1 = rel(); let n = 0, s = 0;
      for (const k in r0) if (k in r1) { n++; s += (r1[k] - r0[k]) / (U.t - t0); } p.crouch = false; T.run(2.5); return { n, closing: s / n, want: T.C.SWIM.speed }; });
    check(up.n > 50 && Math.abs(up.closing - up.want) < 0.1, 'swimming upstream the specks come towards the diver (at the stroke\'s speed through the water)', up);
    await frames(page, 6);
    const after = await page.evaluate(() => { const T = window.__drift; return { diving: T.p.diving, under: T.U.points.visible, surface: T.S.mesh.visible }; });
    check(!after.diving && !after.under && after.surface, 'back at the surface: the specks are gone, the flecks are back', after);
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
