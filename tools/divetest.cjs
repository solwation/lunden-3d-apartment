// #1944: diving in Höje å in the real app, through production Player.update (only the starts are spawned).
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/divetest.cjs GAME OUT
// Checks: crouch held while swimming takes the eye under the surface down to SWIM.dive.eyeOverBed over the (drawn) bed, with the same strokes
// and current as at the surface; letting go comes up; the touch crouch toggle does the same; the view under the surface is fogged / washed and
// back to normal afterwards; crouch on land is unchanged; a dive at stations along the whole river (under the bridges too) never goes through
// the bed and always surfaces; a dive drifts through under the road and GC bridges; the avatar others see is under the surface with the mask
// on only while diving. Saves result images in OUT (under water towards the bed; the diver from outside; back at the surface).
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8144', out = process.argv[3] || '/tmp/dive1944';
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
    // the shared helpers of every step
    await page.evaluate(async () => {
      const A = window.__app, p = A.player, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js'), sw = await import('/src/swim.js'), S = await import('/src/surroundings.js');
      const dt = 1 / 60, P = rb.riverPath, W = C.WALK; let best = null;
      for (let i = 1; i < P.length; i++) { // a straight open stretch: the middle of the longest walkable segment (as swimtest.cjs)
        const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < W.x0 + 30 || mx > W.x1 - 30 || rb.deckAt(mx, mz) !== null || !fw.swimWater(mx, mz)) continue;
        if (!best || l > best.l) best = { l, x: mx, z: mz, i };
      }
      const f = rb.riverAt(best.x, best.z), d = sw.currentDir(f);
      const T = window.__dive = { A, p, rb, fw, C, sw, S, dt, P, W, best, f, d,
        face: (dx, dz, pitch = 0) => A.camera.rotation.set(pitch, Math.atan2(-dx, -dz), 0, 'YXZ'),
        run: (s, keys = []) => { for (const k of keys) p.keys.add(k); for (let t = 0; t < s; t += dt) p.update(dt); for (const k of keys) p.keys.delete(k); },
        water: () => rb.waterYAt(p.pos.x, p.pos.z),
        eye: () => { const c = A.camera.position; return { overWater: c.y - rb.waterYAt(c.x, c.z), overBed: c.y - fw.swimBedY(c.x, c.z), overDrawn: c.y - S.renderedTerrainY(c.x, c.z) }; },
        start: (x = best.x, z = best.z) => { p.crouch = false; p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.update(dt); T.run(0.6); },
      };
      p.onWaterRescue = () => { (T.rescues ??= []).push(1); };
    });
    // 1. down, under water, up
    const r = await page.evaluate(() => {
      const T = window.__dive, { p, d, f, best, C, rb, fw } = T, o = {};
      const leg = (dx, dz, keys, s = 3) => { T.face(dx, dz); const x0 = p.pos.x, z0 = p.pos.z; T.run(s, keys); return ((p.pos.x - x0) * d.x + (p.pos.z - z0) * d.z) / s; };
      T.start(); o.station = { x: best.x, z: best.z, depth: T.water() - fw.swimBedY(best.x, best.z), smooth: T.water() - T.S.groundBelowDeckY(best.x, best.z) };
      o.surface = { ...T.eye(), diving: p.diving, swim: !!p.swim, c: T.A.ghosts.state().c };
      p.crouch = true; T.run(0.2); o.goingDown = { ...T.eye(), dive: p.swim?.dive, c: T.A.ghosts.state().c };
      T.run(2.5); o.down = { ...T.eye(), diving: p.diving, crouched: p.crouched, depth: p.swim?.depth, feet: p.pos.y - fw.swimBedY(p.pos.x, p.pos.z) };
      p.pos.set(best.x, fw.swimBedY(best.x, best.z), best.z); o.alongDown = leg(d.x, d.z, ['KeyW']); o.afterDown = { ...T.eye(), swim: !!p.swim, diving: p.diving };
      p.pos.set(best.x, fw.swimBedY(best.x, best.z), best.z); o.alongUp = leg(-d.x, -d.z, ['KeyW']);
      p.pos.set(best.x, fw.swimBedY(best.x, best.z), best.z); o.alongIdle = leg(d.x, d.z, []);
      p.pos.set(best.x, fw.swimBedY(best.x, best.z), best.z); T.face(f.nx, f.nz); { const x0 = p.pos.x, z0 = p.pos.z; T.run(1, ['KeyD']); o.sideways = Math.hypot(p.pos.x - x0, p.pos.z - z0); o.sideEye = T.eye(); }
      p.pos.set(best.x, fw.swimBedY(best.x, best.z), best.z); T.run(0.5);
      p.crouch = false; let t = 0; while (T.eye().overWater < 0 && t < 10) { p.update(T.dt); t += T.dt; } o.upIn = t;
      T.run(1); o.up = { ...T.eye(), diving: p.diving, depth: p.swim?.depth, swim: !!p.swim, c: T.A.ghosts.state().c };
      // the touch crouch toggle (the button's own click handler)
      const btn = document.getElementById('crouch-btn'); btn.click(); o.toggledOn = p.crouch; T.run(2.5); o.touchDown = { ...T.eye(), diving: p.diving };
      btn.click(); o.toggledOff = p.crouch; T.run(2.5); o.touchUp = { ...T.eye(), diving: p.diving };
      return o;
    });
    console.log(JSON.stringify(r, null, 1));
    const S = { speed: 0.9, current: 0.35, eyeOverBed: 0.4 };
    check(r.station.depth > 1.4 && r.surface.overWater > 0.05 && !r.surface.diving && !r.surface.c, 'the water is deep enough mid-channel; at the surface nobody dives', { station: r.station, surface: r.surface });
    check(r.goingDown.dive && r.goingDown.c && r.down.diving && !r.down.crouched && r.down.overWater < -1 && Math.abs(r.down.overBed - S.eyeOverBed) < 0.04 && r.down.overDrawn > 0.3 && Math.abs(r.down.feet) < 1e-6,
      'crouch held: the eye goes under the surface down to 0.4 m over the bed (over the drawn bed too)', { goingDown: r.goingDown, down: r.down });
    check(Math.abs(r.alongDown - (S.speed + S.current)) < 0.08 && Math.abs(r.alongUp + (S.speed - S.current)) < 0.08 && Math.abs(r.alongIdle - S.current) < 0.05 && r.sideways > 0.5 && r.afterDown.diving && r.afterDown.overWater < -0.5 && r.sideEye.overWater < -0.3,
      'under water: forward, back against the current, sideways, and the current carries an idle diver', { down: r.alongDown, up: r.alongUp, idle: r.alongIdle, sideways: r.sideways });
    check(r.upIn < 2 && r.up.overWater > 0.05 && r.up.overWater < 0.25 && !r.up.diving && r.up.depth === 0 && r.up.swim && !r.up.c, 'letting go: back at the surface within 2 s, still swimming', { upIn: r.upIn, up: r.up });
    check(r.toggledOn && r.touchDown.diving && r.touchDown.overWater < -1 && !r.toggledOff && !r.touchUp.diving && r.touchUp.overWater > 0.05, 'the touch crouch toggle dives and surfaces', { down: r.touchDown, up: r.touchUp });

    // 2. the view under the surface (rendered frames): fog + wash on, and off again
    await page.evaluate(() => { const T = window.__dive; T.start(); T.face(T.d.x, T.d.z, -0.35); T.p.crouch = true; T.run(2.5); });
    await frames(page, 8); await page.waitForTimeout(500);
    const lookDown = await page.evaluate(() => { const T = window.__dive, A = T.A, el = [...document.body.children].find((e) => /radial-gradient/.test(e.style.background)); return { opacity: el && getComputedStyle(el).opacity, fog: [A.scene.fog.near, A.scene.fog.far], colour: A.scene.fog.color.getHexString(), eye: T.eye(), diving: T.p.diving }; });
    await kit.shot(page, path.join(out, 'under-vattnet-botten.png'));
    await page.evaluate(() => { const T = window.__dive; T.p.crouch = false; T.run(2.5); });
    await frames(page, 8); await page.waitForTimeout(500);
    const lookUp = await page.evaluate(() => { const T = window.__dive, A = T.A, el = [...document.body.children].find((e) => /radial-gradient/.test(e.style.background)); return { opacity: el && getComputedStyle(el).opacity, fog: [A.scene.fog.near, A.scene.fog.far], colour: A.scene.fog.color.getHexString(), eye: T.eye() }; });
    check(lookDown.diving && Number(lookDown.opacity) > 0.9 && lookDown.fog[1] <= 12.01 && lookDown.fog[1] < lookUp.fog[1] / 5 && lookDown.fog[0] < 1, 'under the surface: the fog is pulled in and the wash is on', lookDown);
    check(Number(lookUp.opacity) < 0.05 && lookUp.fog[1] > 100 && lookUp.colour !== lookDown.colour && lookUp.eye.overWater > 0.05, 'back at the surface: the normal fog and no wash', lookUp);

    // 3. crouch on land is what it was
    const land = await page.evaluate(() => {
      const T = window.__dive, { p, fw, best, C } = T, bank = fw.splashBank(best.x, best.z, fw.swimBedY(best.x, best.z));
      p.crouch = false; p.spawn(bank.x, bank.z, 0); p.pos.y = fw.surfaceY(bank.x, bank.z, p.pos.y); T.run(1);
      const stand = T.A.camera.position.y - p.pos.y; p.crouch = true; T.run(1);
      const o = { stand, crouch: T.A.camera.position.y - p.pos.y, crouched: p.crouched, swim: !!p.swim, diving: p.diving, c: T.A.ghosts.state().c, want: [p.eye ?? C.PLAYER.eye, C.PLAYER.crouchEye] };
      const x0 = p.pos.x, z0 = p.pos.z; T.face(1, 0); T.run(1, ['KeyW']); o.speed = Math.hypot(p.pos.x - x0, p.pos.z - z0); o.crouchSpeed = C.PLAYER.walk * C.PLAYER.crouchSpeed;
      p.crouch = false; T.run(1); o.up = T.A.camera.position.y - p.pos.y; o.upCrouched = p.crouched;
      return o;
    });
    check(land.crouched && !land.swim && !land.diving && land.c && Math.abs(land.crouch - land.want[1]) < 0.02 && Math.abs(land.up - land.stand) < 0.02 && land.stand - land.crouch > 0.3 && !land.upCrouched && land.speed < land.crouchSpeed * 1.1,
      'crouch on land: down to the crouch eye at crouch speed, up again (no dive)', land);

    // 4. along the whole river: dive at each station (under the bridges too), never through the bed, always up again
    const sweep = await page.evaluate(() => {
      const T = window.__dive, { p, P, W, rb, fw, sw, S } = T, o = { n: 0, underDeck: 0, bad: [], minOverDrawn: Infinity, minOverBed: Infinity, deepest: 0, shallow: 0 };
      for (let i = 1; i < P.length; i++) for (const k of [0.1, 0.35, 0.6, 0.85]) for (const off of [0, 0.6, -0.6]) {
        const cx = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, cz = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k, q = rb.riverAt(cx, cz), x = cx + q.nx * off * q.width / 2, z = cz + q.nz * off * q.width / 2;
        if (x < W.x0 + 2 || x > W.x1 - 2 || z < W.z0 + 2 || z > W.z1 - 2 || !fw.swimWater(x, z)) continue;
        p.crouch = false; p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.update(T.dt);
        if (!p.swim) continue;
        o.n++; if (rb.deckAt(x, z) !== null) o.underDeck++;
        const d = sw.currentDir(q); T.face(d.x + q.nx * 0.4, d.z + q.nz * 0.4); p.crouch = true; p.keys.add('KeyW');
        let low = Infinity, lowBed = Infinity, deep = 0;
        for (let t = 0; t < 4 && p.swim; t += T.dt) { p.update(T.dt); const e = T.eye(); if (e.overWater < 0) low = Math.min(low, e.overDrawn); lowBed = Math.min(lowBed, e.overBed); deep = Math.min(deep, e.overWater); }
        p.keys.delete('KeyW');
        const swam = !!p.swim; // (a stroke into the bank may climb out: that is a surface too)
        p.crouch = false; let t = 0; while (p.swim && T.eye().overWater < 0.02 && t < 6) { p.update(T.dt); t += T.dt; }
        const e = T.eye();
        o.minOverDrawn = Math.min(o.minOverDrawn, low); o.minOverBed = Math.min(o.minOverBed, lowBed); o.deepest = Math.min(o.deepest, deep); if (deep > -0.3) o.shallow++;
        if (low < 0.15 || t >= 3 || (p.swim && e.overWater < 0.02)) o.bad.push({ x, z, low, t, e, swam });
      }
      return o;
    });
    check(sweep.n > 60 && sweep.underDeck > 0 && !sweep.bad.length && sweep.minOverDrawn > 0.15 && sweep.minOverBed > -0.05, 'dives along the whole river: never through the bed, always back at the surface', sweep);
    // 5. drifting / swimming through under both bridges while diving
    const bridge = await page.evaluate(() => {
      const T = window.__dive, { p, rb, fw, sw } = T, o = [];
      for (const rec of rb.bridgeRecords) {
        const q0 = rb.riverAt(rec.x, rec.z), d0 = sw.currentDir(q0), x = q0.x - d0.x * 9, z = q0.z - d0.z * 9;
        p.crouch = false; p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.update(T.dt); p.crouch = true; p.keys.add('KeyW');
        let under = 0, low = Infinity, t = 0, moved = 0;
        for (; t < 25 && p.swim && moved < 18; t += T.dt) { const q = rb.riverAt(p.pos.x, p.pos.z), d = sw.currentDir(q); T.face(d.x, d.z); const a = [p.pos.x, p.pos.z]; p.update(T.dt); moved += (p.pos.x - a[0]) * d.x + (p.pos.z - a[1]) * d.z;
          if (rb.deckAt(p.pos.x, p.pos.z) !== null && p.diving) under++; low = Math.min(low, T.eye().overDrawn); }
        p.keys.delete('KeyW'); p.crouch = false; let up = 0; while (p.swim && T.eye().overWater < 0.02 && up < 6) { p.update(T.dt); up += T.dt; }
        o.push({ kind: rec.kind, moved, t, underFrames: under, low, swim: !!p.swim, up, eye: T.eye(), rescues: (T.rescues ?? []).length });
      }
      return o;
    });
    check(bridge.every((b) => b.moved >= 18 && b.underFrames > 30 && b.low > 0.15 && b.swim && b.up < 3 && b.eye.overWater > 0.02 && !b.rescues), 'a dive passes under the road and GC bridges and surfaces after them (no rescue)', bridge);

    // 6. what the others see: our own figure (ghosts.showSelf) set in the river, crouch flag on / off
    const pose = async (name, crouch, view) => {
      const info = await page.evaluate(async ({ crouch, view }) => {
        const T = window.__dive, { A, p, rb, fw, best, d, f } = T, G = A.ghosts, bed = fw.swimBedY(best.x, best.z), water = rb.waterYAt(best.x, best.z);
        const bank = fw.splashBank(best.x, best.z, bed), side = Math.sign((bank.x - best.x) * f.nx + (bank.z - best.z) * f.nz) || 1;
        if (!T.heldUpdate) T.heldUpdate = p.update.bind(p);
        p.update = T.heldUpdate; p.crouch = false;
        if (view === 'water') { // the camera is a second diver 2.2 m to the side, a little ahead, looking at the figure's head
          const x = best.x + f.nx * side * 1.5 + d.x * 1.7, z = best.z + f.nz * side * 1.5 + d.z * 1.7;
          p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.update(T.dt); p.crouch = true; T.run(2.5);
        } else { const x = best.x + f.nx * side * 4.2 - d.x * 2.6, z = best.z + f.nz * side * 4.2 - d.z * 2.6; p.spawn(x, z, 0); p.pos.y = fw.surfaceY(x, z, bed); p.swim = null; p.update(T.dt); }
        p.update = () => {}; // (hold the view for the picture)
        G.showSelf = T.showSelf ?? G.showSelf; T.showSelf = G.showSelf; G.showSelf(); const g = G.myGhost;
        g.root.position.set(best.x, bed, best.z); g.root.rotation.y = Math.atan2(-d.x, -d.z); g.look = [0, 0]; g.crouch = crouch;
        const t0 = performance.now(); for (let i = 0; i < 90; i++) { g.crouch = crouch; g.animate(t0 + i * 50, 0, d.x * 1.25, d.z * 1.25); }
        g.root.updateMatrixWorld(true); g.root.visible = true; G.showSelf = () => {}; G.beforeMirror = () => {};
        const V = A.camera.position.constructor, y = (b) => g.avatar.bones[b]?.getWorldPosition(new V()).y, head = g.avatar.bones.head.getWorldPosition(new V());
        const eye = A.camera.position, hy = view === 'water' ? head.y : water + 0.1;
        A.camera.rotation.set(-Math.atan2(eye.y - hy, Math.hypot(head.x - eye.x, head.z - eye.z)), Math.atan2(-(head.x - eye.x), -(head.z - eye.z)), 0, 'YXZ');
        if (view !== 'water') { Object.defineProperty(A.camera, 'fov', { get: () => 24, set() {}, configurable: true }); A.camera.updateProjectionMatrix(); }
        const lows = Object.entries(g.avatar.bones).map(([k, b]) => [k, b.getWorldPosition(new V()).y - bed]).sort((a, b) => a[1] - b[1]);
        return { swim: g.swim, dive: g.avatar.diveAmt, mask: !!g.avatar.mask?.visible, maskOnHead: g.avatar.mask?.parent === g.avatar.bones.head, headOverWater: g.avatar.head.y - water, headOverBed: g.avatar.head.y - bed, lowest: lows[0], dy: g.swimDy, cam: T.eye() };
      }, { crouch, view });
      await frames(page, 6);
      await kit.shot(page, path.join(out, `${name}.png`));
      return info;
    };
    const diver = await pose('avatar-dyker-cyklop', 1, 'water');
    check(diver.swim && diver.dive > 0.95 && diver.mask && diver.maskOnHead && diver.headOverWater < -0.8 && diver.headOverBed > 0.2 && diver.headOverBed < 0.8 && diver.lowest[1] > -0.05, 'a diving avatar: under the surface near the bed, clear of it, the mask on', diver);
    const back = await pose('avatar-ytan-utan-cyklop', 0, 'bank');
    check(back.swim && back.dive < 0.05 && !back.mask && back.headOverWater > 0.05 && back.headOverWater < 0.45, 'back at the surface: only the head above the water, no mask', back);
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
