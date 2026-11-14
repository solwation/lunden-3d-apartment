// #1943: swimming in Höje å in the real app, through production Player.update (only the starts are spawned).
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/swimtest.cjs GAME OUT
// Checks: walking into the river starts a swim (no rescue), the eye floats just above the surface, the same input is faster downstream
// than upstream and an idle swimmer drifts downstream; jump / sprint / crouch change nothing; a fall into the water does not land;
// swimming into a bank gets the swimmer out along the whole walkable stretch (how: climb or last-resort rescue, counted); the bicycle's
// splash rule still rescues. Saves result images in OUT (first person at the surface; the avatar stroking and treading water).
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8143', out = process.argv[3] || '/tmp/swim1943', quick = process.argv.includes('--quick'); // --quick: no bank sweep (pictures only)
const results = []; let pass = true;
const check = (ok, name, data) => { results.push({ ok: !!ok, name, data }); pass &&= !!ok; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' ' + JSON.stringify(data) : ''}`); };
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
    const r = await page.evaluate(async (quick) => {
      const A = window.__app, p = A.player, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js'), sw = await import('/src/swim.js');
      const dt = 1 / 60, events = [], lands = [], swims = [];
      p.onWaterRescue = (kind) => events.push(kind); p.onLand = (drop) => lands.push(drop); p.onSwim = (into) => swims.push(into);
      const face = (dx, dz) => A.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
      const run = (s, keys = ['KeyW']) => { for (const k of keys) p.keys.add(k); for (let t = 0; t < s; t += dt) p.update(dt); for (const k of keys) p.keys.delete(k); };
      // a straight open stretch between the bridges and the timber footbridge: the middle of the longest walkable segment
      const P = rb.riverPath, W = C.WALK; let best = null;
      for (let i = 1; i < P.length; i++) {
        const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < W.x0 + 30 || mx > W.x1 - 30 || rb.deckAt(mx, mz) !== null || !fw.swimWater(mx, mz)) continue;
        if (!best || l > best.l) best = { l, x: mx, z: mz, i };
      }
      const f = rb.riverAt(best.x, best.z), d = sw.currentDir(f), water = rb.waterYAt(best.x, best.z), bed = fw.swimBedY(best.x, best.z);
      const out = { station: { x: best.x, z: best.z, segment: best.i, water, bed, down: [d.x, d.z] } };
      // 1. walk in from the bank
      const bank = fw.splashBank(best.x, best.z, bed);
      p.spawn(bank.x, bank.z, 0); p.pos.y = fw.surfaceY(bank.x, bank.z, bed);
      let t = 0; face(best.x - bank.x, best.z - bank.z);
      p.keys.add('KeyW'); while (!p.swim && t < 20) { p.update(dt); t += dt; } p.keys.delete('KeyW');
      out.walkIn = { swim: !!p.swim, swimming: p.swimming, t, events: [...events], swims: [...swims], lands: [...lands], at: p.pos.toArray() };
      run(0.6, []); // the eye settles
      out.eye = { over: A.camera.position.y - rb.waterYAt(p.pos.x, p.pos.z), feet: p.pos.y - fw.swimBedY(p.pos.x, p.pos.z) };
      // 2. speeds from the middle of the stretch (the feet are set there; everything else is Player.update)
      const start = () => { p.pos.set(best.x, bed, best.z); };
      const leg = (dx, dz, keys, s = 3) => { start(); face(dx, dz); const x0 = p.pos.x, z0 = p.pos.z; run(s, keys); return { along: ((p.pos.x - x0) * d.x + (p.pos.z - z0) * d.z) / s, swim: !!p.swim }; };
      out.down = leg(d.x, d.z, ['KeyW']); out.up = leg(-d.x, -d.z, ['KeyW']); out.idle = leg(d.x, d.z, []);
      out.sprint = leg(d.x, d.z, ['KeyW', 'ShiftLeft']);
      start(); face(d.x, d.z); const y0 = p.pos.y; p.keys.add('Space'); p.update(dt); p.keys.delete('Space'); run(0.3, []);
      out.jump = { dy: p.pos.y - fw.swimBedY(p.pos.x, p.pos.z), fall: !!p.fall, vy: p.vy, swim: !!p.swim, y0 };
      start(); p.crouch = true; const c = leg(d.x, d.z, ['KeyW']); out.crouch = { ...c, crouched: p.crouched, eye: A.camera.position.y - rb.waterYAt(p.pos.x, p.pos.z) }; p.crouch = false;
      start(); face(d.x, d.z); p.analog.y = 1; { const x0 = p.pos.x, z0 = p.pos.z; run(2, []); out.touch = { along: ((p.pos.x - x0) * d.x + (p.pos.z - z0) * d.z) / 2 }; } p.analog.y = 0;
      // 3. a fall from 6 m into the water: no landing, swimming
      p.spawn(bank.x, bank.z, 0); lands.length = 0; events.length = 0;
      p.pos.set(best.x, water + 6, best.z); p.vy = 0; t = 0; while (!p.swim && t < 5) { p.update(dt); t += dt; }
      out.fall = { swim: !!p.swim, lands: [...lands], events: [...events], t };
      // 4. out of the water: swim into each bank at stations along the whole walkable stretch
      const exits = { climb: 0, rescue: 0, stuck: [], n: 0, far: [] };
      for (let i = 1; i < P.length && !quick; i++) for (const k of [0.25, 0.75]) for (const side of [-1, 1]) {
        const x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, z = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k;
        if (x < W.x0 + 2 || x > W.x1 - 2 || z < W.z0 + 2 || z > W.z1 - 2 || !fw.swimWater(x, z)) continue;
        const q = rb.riverAt(x, z);
        p.spawn(bank.x, bank.z, 0); p.pos.set(x, fw.swimBedY(x, z), z); events.length = 0; p.update(dt);
        if (!p.swim) { exits.stuck.push({ x, z, side, why: 'no swim' }); continue; }
        exits.n++; face(q.nx * side, q.nz * side);
        t = 0; p.keys.add('KeyW'); while (p.swim && t < 30) { p.update(dt); t += dt; } p.keys.delete('KeyW');
        const dry = !p.swim && !fw.swimWater(p.pos.x, p.pos.z) && p.pos.y >= rb.waterYAt(p.pos.x, p.pos.z);
        if (!dry) exits.stuck.push({ x, z, side, t, at: p.pos.toArray() });
        else if (events.includes('water')) { exits.rescue++; exits.far.push({ x: Math.round(x), z: Math.round(z), side }); } else exits.climb++;
      }
      out.exits = exits;
      // 5. the bicycle's rule (bikeSplash -> splashCheck) still rescues someone under the surface
      p.spawn(bank.x, bank.z, 0); p.pos.set(best.x, bed, best.z); events.length = 0;
      out.bike = { rescued: p.splashCheck(), events: [...events], dry: !fw.inWater(p.pos.x, p.pos.z, p.pos.y), swim: !!p.swim };
      // leave the visitor swimming at the station, looking downstream, for the first-person picture
      p.spawn(bank.x, bank.z, 0); start(); face(d.x * 0.9 + f.nx * 0.45, d.z * 0.9 + f.nz * 0.45); run(1.5, ['KeyW']);
      out.final = { swim: !!p.swim, eye: A.camera.position.y - rb.waterYAt(p.pos.x, p.pos.z) };
      return out;
    }, quick);
    console.log(JSON.stringify(r, null, 1));
    const S = { speed: 0.9, current: 0.35 };
    check(r.walkIn.swim && r.walkIn.swimming && !r.walkIn.events.length && r.walkIn.swims[0] === true && !r.walkIn.lands.length, 'walking into the river starts a swim, no rescue, no landing', r.walkIn);
    check(r.eye.over > 0.05 && r.eye.over < 0.25 && Math.abs(r.eye.feet) < 1e-6, 'the eye floats just above the surface, the feet follow the bed', r.eye);
    check(Math.abs(r.down.along - (S.speed + S.current)) < 0.08 && Math.abs(r.up.along + (S.speed - S.current)) < 0.08 && r.down.along > -r.up.along * 1.5, 'downstream is faster than upstream for the same input', { down: r.down.along, up: r.up.along });
    check(Math.abs(r.idle.along - S.current) < 0.05 && r.idle.swim, 'an idle swimmer drifts slowly downstream', r.idle);
    check(Math.abs(r.sprint.along - r.down.along) < 0.02 && Math.abs(r.crouch.along - r.down.along) < 0.02 && !r.crouch.crouched && r.crouch.eye > 0.05, 'sprint and crouch change nothing in the water', { sprint: r.sprint.along, crouch: r.crouch });
    check(Math.abs(r.jump.dy) < 1e-6 && !r.jump.fall && r.jump.vy === 0 && r.jump.swim, 'no jump in the water', r.jump);
    check(Math.abs(r.touch.along - (S.speed + S.current)) < 0.08, 'the touch stick swims too', r.touch);
    check(r.fall.swim && !r.fall.lands.length && !r.fall.events.length, 'a 6 m fall into the water: swimming, no landing (no fall damage)', r.fall);
    if (!quick) check(r.exits.n > 20 && !r.exits.stuck.length, 'swimming into a bank gets out everywhere (nobody stuck)', { n: r.exits.n, climb: r.exits.climb, rescue: r.exits.rescue, stuck: r.exits.stuck, rescuedAt: r.exits.far });
    if (!quick) check(r.exits.climb >= r.exits.n * 0.8, 'most banks are climbed, the rescue is the last resort', { climb: r.exits.climb, rescue: r.exits.rescue });
    check(r.bike.rescued && r.bike.events.includes('water') && r.bike.dry && !r.bike.swim, 'the bicycle rule (splashCheck) still puts back on the bank', r.bike);
    await kit.shot(page, path.join(out, 'simmar-forsta-person.png'));
    // the avatar from the bank: our own figure (ghosts.showSelf, the third-person facility) set in the river, posed over a few seconds
    for (const [name, moving, frames] of [['avatar-simtag', true, 90], ['avatar-trampar-vatten', false, 90]]) {
      const info = await page.evaluate(async ({ st, moving, frames }) => {
        const A = window.__app, p = A.player, G = A.ghosts, fw = await import('/src/farwalk.js'), rb = await import('/src/riverbridge.js');
        const d = st.down, f = rb.riverAt(st.x, st.z), bank = fw.splashBank(st.x, st.z, st.bed), side = Math.sign((bank.x - st.x) * f.nx + (bank.z - st.z) * f.nz) || 1;
        const ex = st.x + f.nx * side * 4.2 - d[0] * 2.6, ez = st.z + f.nz * side * 4.2 - d[1] * 2.6; // on the bank, a little upstream of the swimmer
        p.spawn(ex, ez, 0); p.pos.y = fw.surfaceY(ex, ez, st.bed) ; p.swim = null; p.update(1 / 60);
        const eye = A.camera.position; A.camera.rotation.set(-Math.atan2(eye.y - st.water - 0.1, Math.hypot(st.x - eye.x, st.z - eye.z)), Math.atan2(-(st.x - eye.x), -(st.z - eye.z)), 0, 'YXZ');
        p.update = () => {}; Object.defineProperty(A.camera, 'fov', { get: () => 24, set() {}, configurable: true }); A.camera.updateProjectionMatrix(); // (hold the view for the picture, zoomed in on the swimmer)
        G.showSelf(); const g = G.myGhost; g.root.position.set(st.x, st.bed, st.z); g.root.rotation.y = Math.atan2(-d[0], -d[1]); g.look = [0, 0];
        const v = moving ? 1.25 : 0.35, t0 = performance.now();
        for (let i = 0; i < frames; i++) g.animate(t0 + i * 50, 0, d[0] * v, d[1] * v);
        g.root.visible = true; G.showSelf = () => {}; G.beforeMirror = () => {};
        return { swim: g.swim, amt: g.avatar.swimAmt, stroke: g.avatar.strokeAmt, dy: g.swimDy, headOverWater: g.avatar.head.y - st.water, eye: eye.toArray() };
      }, { st: r.station, moving, frames });
      check(info.swim && info.amt > 0.95 && (moving ? info.stroke > 0.9 : info.stroke < 0.1) && info.headOverWater > 0.05 && info.headOverWater < 0.45, `${name}: the avatar swims, only the head above the surface`, info);
      await kit.shot(page, path.join(out, `${name}.png`));
    }
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
