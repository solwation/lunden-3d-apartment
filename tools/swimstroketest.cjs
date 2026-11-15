// #1951: a swim stroke with the jump button in Höje å, in the real app, through production Player.update (only the starts are spawned).
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/swimstroketest.cjs GAME OUT
// Checks: Space / the touch jump button in the water gives one fading push the way the eye looks; strokes in a row are clearly faster than
// the movement keys alone, down- and upstream (the current still counts), and holding the key or hammering it cannot pass the pause; under
// water a stroke goes up when looking up, down (never through the bed) when looking down and keeps the depth when looking level; at the
// surface it never lifts out of the water or dips; with crouch held an upward stroke rises and sinks back, released it surfaces; a stroke
// uses air like swimming (more upstream); the jump on land is unchanged and the worn jetpack still lifts out of the water; the avatar
// shows the stroke; the sound runs. (The fish's scare by a stroke: tools/fishfeedtest.cjs.) Saves result images in OUT.
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8155', out = process.argv[3] || '/tmp/stroke1951';
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
    await page.waitForFunction(() => window.__app?.player && window.__app?.ghosts && window.__app?.diveAir, null, { timeout: 600000, polling: 200 });
    await kit.skipNameDialog(page); fs.mkdirSync(out, { recursive: true });
    await page.evaluate(async () => {
      const A = window.__app, p = A.player, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js'), sw = await import('/src/swim.js'), au = await import('/src/audio.js');
      au.initAudio(); // (the real synthesis runs, so a broken sound would throw; nobody hears it)
      const snd = { n: 0, under: [] }; { const f = au.sfx.swimStroke; au.sfx.swimStroke = (u) => { snd.n++; snd.under.push(!!u); return f.call(au.sfx, u); }; }
      if (A.sharkHunt) A.sharkHunt.random = () => 1; // (no shark attack during the test)
      const dt = 1 / 60, P = rb.riverPath, W = C.WALK; let best = null;
      for (let i = 1; i < P.length; i++) { // a straight open stretch: the middle of the longest walkable segment (as swimtest.cjs)
        const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < W.x0 + 30 || mx > W.x1 - 30 || rb.deckAt(mx, mz) !== null || !fw.swimWater(mx, mz)) continue;
        if (!best || l > best.l) best = { l, x: mx, z: mz, i };
      }
      const f = rb.riverAt(best.x, best.z), d = sw.currentDir(f), bed = fw.swimBedY(best.x, best.z);
      const T = window.__stroke = { A, p, rb, fw, C, sw, au, snd, dt, best, f, d, bed, bank: fw.splashBank(best.x, best.z, bed),
        face: (dx, dz, pitch = 0) => A.camera.rotation.set(pitch, Math.atan2(-dx, -dz), 0, 'YXZ'),
        /** `s` seconds of Player.update; `keys` held; `tap` s: a fresh Space press every that often (0: none). */
        run: (s, keys = [], tap = 0) => {
          for (const k of keys) p.keys.add(k); let next = 0;
          for (let t = 0; t < s; t += dt) {
            if (tap && t >= next) { p.keys.add('Space'); next += tap; p.update(dt); p.keys.delete('Space'); } else p.update(dt);
          }
          for (const k of keys) p.keys.delete(k);
        },
        press: () => { p.keys.add('Space'); p.update(dt); p.keys.delete('Space'); },
        eye: () => { const c = A.camera.position; return { overWater: c.y - rb.waterYAt(c.x, c.z), overBed: c.y - fw.swimBedY(c.x, c.z) }; },
        reset: () => { p.pos.set(best.x, bed, best.z); if (p.swim) Object.assign(p.swim.kick, sw.kickState()); },
        start: (dive = false) => { p.keys.clear(); p.crouch = false; p.jumpPress = false; p.spawn(best.x, best.z, 0); p.pos.set(best.x, bed, best.z); p.update(dt); T.face(d.x, d.z); T.run(0.6); if (dive) { p.crouch = true; T.run(2.5); } T.reset(); },
        /** The speed along the river (+ downstream) over `s` seconds from the station, facing `dir` x downstream. */
        leg: (dir, keys, tap, s = 6, pitch = 0) => { T.reset(); T.face(d.x * dir, d.z * dir, pitch); const x0 = p.pos.x, z0 = p.pos.z, n0 = p.swim.kicks; T.run(s, keys, tap); return { along: ((p.pos.x - x0) * d.x + (p.pos.z - z0) * d.z) / s, kicks: p.swim.kicks - n0, swim: !!p.swim }; },
      };
    });

    // 1. at the surface: one stroke, and strokes in a row against the keys alone
    const r = await page.evaluate(() => {
      const T = window.__stroke, { p, d, C, snd, dt } = T, K = C.SWIM.kick, o = { K: { speed: K.speed, time: K.time, pause: K.pause } };
      T.start();
      // one press, no keys: the path of the push (the current taken off)
      T.reset(); T.face(d.x, d.z); const x0 = p.pos.x, z0 = p.pos.z; T.press(); let t = dt, peak = 0, last = 0; const along = () => (p.pos.x - x0) * d.x + (p.pos.z - z0) * d.z - C.SWIM.current * t;
      o.first = { kicks: p.swim.kicks, moving: p.swim.moving, on: p.swim.kick.on, sound: snd.n, under: snd.under.at(-1) };
      let a0 = along(), fading = true;
      for (; t < 1.5; t += dt) { p.update(dt); const a = along(), v = (a - a0) / dt; a0 = a; if (t < 0.1) peak = Math.max(peak, v); else if (t < K.time && v > last + 1e-6) fading = false; last = v; if (Math.abs(t - K.time - 0.2) < dt / 2) o.afterMoving = p.swim.moving; }
      o.one = { carried: a0, peak, fading, endSpeed: last, eye: T.eye(), swim: !!p.swim };
      // speeds along the river over 6 s
      o.keysDown = T.leg(1, ['KeyW'], 0); o.keysUp = T.leg(-1, ['KeyW'], 0);
      o.bothDown = T.leg(1, ['KeyW'], K.pause + dt); o.bothUp = T.leg(-1, ['KeyW'], K.pause + dt);
      o.onlyDown = T.leg(1, [], K.pause + dt); o.onlyUp = T.leg(-1, [], K.pause + dt);
      o.hammer = T.leg(1, ['KeyW'], 2 * dt); // a fresh press every other frame
      o.held = T.leg(1, ['KeyW', 'Space'], 0); // Space held down: one stroke only
      // looking down / up at the surface: no dip, no lift, still a full push
      for (const [name, pitch] of [['lookDown', -1.2], ['lookUp', 1.2]]) {
        T.reset(); T.run(0.5); let lo = Infinity, hi = -Infinity; T.reset(); T.face(d.x, d.z, pitch); const x1 = p.pos.x, z1 = p.pos.z; T.press();
        for (let s = dt; s < 1.2; s += dt) { p.update(dt); const e = T.eye().overWater; lo = Math.min(lo, e); hi = Math.max(hi, e); }
        o[name] = { lo, hi, depth: p.swim.depth, diving: p.diving, carried: (p.pos.x - x1) * d.x + (p.pos.z - z1) * d.z - C.SWIM.current * 1.2, feet: p.pos.y - T.fw.swimBedY(p.pos.x, p.pos.z) };
      }
      // the touch jump button (its own pointerdown handler)
      T.reset(); T.face(d.x, d.z); T.run(0.2); T.A.touch.enabled = true; const n0 = p.swim.kicks, xt = p.pos.x, zt = p.pos.z;
      document.getElementById('jump-btn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      o.touch = { flagged: p.jumpPress }; T.run(1); o.touch.kicks = p.swim.kicks - n0; o.touch.carried = (p.pos.x - xt) * d.x + (p.pos.z - zt) * d.z - C.SWIM.current * 1;
      return o;
    });
    console.log(JSON.stringify(r, null, 1));
    const S = { speed: 0.9, current: 0.35 }, K = r.K, carry = K.speed * K.time / 2;
    check(r.first.kicks === 1 && r.first.moving && r.first.on && r.first.sound === 1 && r.first.under === false, 'Space in the water: one stroke starts (counts as swimming, the swish sounds)', r.first);
    check(Math.abs(r.one.carried - carry) < 0.05 && r.one.peak > K.speed * 0.85 && r.one.fading && Math.abs(r.one.endSpeed) < 0.02 && r.afterMoving === false && r.one.swim && r.one.eye.overWater > 0.05 && r.one.eye.overWater < 0.25,
      `one stroke: a push of ${K.speed} m/s that fades out and carries about ${carry.toFixed(2)} m; the eye stays at the surface`, { one: r.one, afterMoving: r.afterMoving });
    check(Math.abs(r.keysDown.along - (S.speed + S.current)) < 0.08 && Math.abs(r.keysUp.along + (S.speed - S.current)) < 0.08 && r.keysDown.kicks === 0, 'the movement keys alone: as before (1.25 m/s down, 0.55 m/s up)', { down: r.keysDown.along, up: r.keysUp.along });
    check(r.bothDown.along > r.keysDown.along + 0.7 && -r.bothUp.along > -r.keysUp.along + 0.7 && r.bothDown.kicks >= 9 && r.bothDown.kicks <= 10, 'keys + strokes in a row: clearly faster, down- and upstream', { down: r.bothDown, up: r.bothUp });
    check(r.bothDown.along - -r.bothUp.along > 2 * S.current - 0.1 && r.bothDown.along - -r.bothUp.along < 2 * S.current + 0.1 && r.onlyDown.along > -r.onlyUp.along + 0.6, 'the current counts as before: faster downstream than upstream by twice the current', { both: [r.bothDown.along, r.bothUp.along], only: [r.onlyDown.along, r.onlyUp.along] });
    check(r.onlyDown.along > S.current + 0.8 && r.onlyUp.along < -0.5, 'strokes alone (no movement keys) swim too, also against the current', { down: r.onlyDown, up: r.onlyUp });
    check(r.hammer.kicks <= r.bothDown.kicks + 1 && r.hammer.along < r.bothDown.along + 0.1 && r.held.kicks === 1, 'hammering the button gives no more than the pause allows; holding Space is one stroke', { hammer: r.hammer, held: r.held });
    for (const k of ['lookDown', 'lookUp']) check(r[k].depth === 0 && !r[k].diving && r[k].lo > 0.05 && r[k].hi < 0.25 && Math.abs(r[k].carried - carry) < 0.06 && Math.abs(r[k].feet) < 1e-6,
      `${k} at the surface: the stroke goes level at full strength, no dip and no lift out of the water`, r[k]);
    check(r.touch.flagged && r.touch.kicks === 1 && Math.abs(r.touch.carried - carry) < 0.06, 'the touch jump button strokes', r.touch);

    // 2. under water: up, level, down; crouch held and released
    const u = await page.evaluate(() => {
      const T = window.__stroke, { p, d, C, snd, dt } = T, K = C.SWIM.kick, o = {};
      const trace = (pitch, crouch, s, taps = 1) => { // from the bed (crouch held 2.5 s), then the press(es)
        T.start(true); p.crouch = crouch; T.face(d.x, d.z, pitch); const e0 = T.eye(), x0 = p.pos.x, z0 = p.pos.z, n0 = snd.n; let top = e0.overWater, low = e0.overBed, tTop = 0;
        let next = 0; for (let t = 0; t < s; t += dt) { if (taps && t >= next) { taps--; next += K.pause + dt; T.press(); } else p.update(dt); const e = T.eye(); if (e.overWater > top) { top = e.overWater; tTop = t; } low = Math.min(low, e.overBed); }
        return { start: e0, end: T.eye(), top, tTop, low, diving: p.diving, depth: p.swim?.depth, swim: !!p.swim, along: ((p.pos.x - x0) * d.x + (p.pos.z - z0) * d.z) - C.SWIM.current * s, under: snd.under.slice(n0) };
      };
      o.heldUp = trace(1.2, true, 4); // crouch held, one stroke up: rises, then sinks back
      o.heldUp45 = trace(0.7, true, 4);
      o.heldLevel = trace(0, true, 2);
      o.heldDown = trace(-1.2, true, 2);
      o.heldUpRow = trace(1.2, true, 7, 6); // strokes in a row with crouch held: up to the surface's edge, back down afterwards
      o.freeUp = trace(1.2, false, 3); o.freeNone = trace(1.2, false, 3, 0); // released: up with / without a stroke
      o.freeDown = trace(-1.2, false, 6, 3); // released, strokes down: stays down while they last, then surfaces
      // mid-water, crouch released, level: only the ordinary float up (the stroke adds no vertical speed)
      T.start(true); p.crouch = false; T.run(0.3); T.face(d.x, d.z, 0); const e1 = T.eye().overWater; T.press(); T.run(0.2); const withStroke = T.eye().overWater - e1;
      T.start(true); p.crouch = false; T.run(0.3); T.face(d.x, d.z, 0); const e2 = T.eye().overWater; p.update(dt); T.run(0.2); o.midLevel = { withStroke, without: T.eye().overWater - e2 };
      return o;
    });
    console.log(JSON.stringify(u, null, 1));
    const E = 0.4; // SWIM.dive.eyeOverBed
    check(Math.abs(u.heldUp.start.overBed - E) < 0.04 && u.heldUp.top - u.heldUp.start.overWater > 0.4 && u.heldUp.tTop < 1 && Math.abs(u.heldUp.end.overBed - E) < 0.04 && u.heldUp.diving && u.heldUp.under[0] === true,
      'crouch held + a stroke looking up: the eye rises during the stroke, then sinks back to the bed', u.heldUp);
    check(u.heldUp45.top - u.heldUp45.start.overWater > 0.25 && u.heldUp45.along > 0.3 && Math.abs(u.heldUp45.end.overBed - E) < 0.04, 'a stroke 40 degrees up: up and forwards at once', u.heldUp45);
    check(Math.abs(u.heldLevel.top - u.heldLevel.start.overWater) < 0.04 && Math.abs(u.heldLevel.low - E) < 0.04 && Math.abs(u.heldLevel.along - carry) < 0.06, 'under water looking level: the depth stays, the stroke goes forwards', u.heldLevel);
    check(u.heldDown.low > E - 0.04 && Math.abs(u.heldDown.end.overBed - E) < 0.04 && u.heldDown.along < carry * 0.5, 'looking down at the bed: never through it', u.heldDown);
    check(u.heldUpRow.top > u.heldUp.top + 0.3 && u.heldUpRow.top < 0 && Math.abs(u.heldUpRow.end.overBed - E) < 0.04 && u.heldUpRow.swim, 'crouch held + strokes up in a row: higher still, never out of the water, down again afterwards', u.heldUpRow);
    check(u.freeUp.end.overWater > 0.05 && u.freeUp.depth === 0 && !u.freeUp.diving && u.freeUp.top < 0.25 && u.freeUp.tTop <= u.freeNone.tTop + 0.02, 'crouch released + a stroke up: at the surface (no later than without a stroke), not out of the water', { stroke: u.freeUp, none: u.freeNone });
    check(u.freeDown.end.overWater > 0.05 && u.freeDown.depth === 0 && u.freeDown.low > E - 0.04 && u.freeDown.tTop > u.freeNone.tTop + 0.8, 'crouch released + strokes down: stays under while they last, then floats up (nobody stuck under the surface)', u.freeDown);
    check(Math.abs(u.midLevel.withStroke - u.midLevel.without) < 0.01, 'a level stroke mid-water does not change the ordinary float up', u.midLevel);

    // 3. the air (#1949), the jump on land, the jetpack
    const m = await page.evaluate(() => {
      const T = window.__stroke, { A, p, d, C, dt } = T, D = A.diveAir, K = C.SWIM.kick, o = {};
      const used = (dir, tap, s = 6) => { // seconds of air used in `s` s on the bed
        T.start(true); T.face(d.x * dir, d.z * dir); D.air = C.SWIM.air.seconds; D.update(dt); const a0 = D.air; let next = 0;
        for (let t = 0; t < s; t += dt) { if (tap && t >= next) { next += tap; T.press(); } else p.update(dt); D.update(dt); }
        return (a0 - D.air) / s;
      };
      o.still = used(1, 0); o.down = used(1, K.pause + dt); o.up = used(-1, K.pause + dt); o.rates = C.SWIM.air;
      T.start(true); T.face(d.x, d.z, 1.4); T.press(); p.update(dt); o.upStroke = { moving: p.swim.moving, sy: p.swimV.sy, flat: Math.hypot(p.swimV.sx, p.swimV.sz) };
      // on land: the ordinary jump
      p.crouch = false; p.spawn(T.bank.x, T.bank.z, 0); p.pos.y = T.fw.surfaceY(T.bank.x, T.bank.z, T.bed); p.swim = null; for (let i = 0; i < 30; i++) p.update(dt);
      const y0 = p.pos.y, n0 = T.snd.n; T.press(); let top = 0, t = dt; const vy = p.vy; while (t < 3 && (p.vy !== 0 || t < 0.1)) { p.update(dt); top = Math.max(top, p.pos.y - y0); t += dt; }
      o.land = { vy, want: C.PLAYER.jump ?? null, top, landed: Math.abs(p.pos.y - y0) < 0.05, t, swim: !!p.swim, sounds: T.snd.n - n0 };
      // the jetpack worn in the water: Space is its thrust (out of the water), not a stroke
      T.start(); const J = A.jetpack, state = J.state, j0 = p.jet; J.state = 'worn'; p.jet = J; const k0 = p.swim.kicks; let left = false;
      p.keys.add('Space'); for (let i = 0; i < 180 && !left; i++) { const s = p.swim; p.update(dt); if (!p.swim) { left = true; o.jet = { kicks: s.kicks - k0, left, flying: p.flying, vy: p.vy }; } }
      p.keys.delete('Space'); if (!left) o.jet = { kicks: p.swim.kicks - k0, left };
      J.state = state; p.jet = j0;
      return o;
    });
    console.log(JSON.stringify(m, null, 1));
    check(Math.abs(m.still - 1) < 0.03 && Math.abs(m.down - m.rates.swim) < 0.08 && Math.abs(m.up - m.rates.upstream) < 0.08, 'strokes use air as swimming does: 1 still, 1.6 with the current, 2.4 against it', { still: m.still, down: m.down, up: m.up });
    check(m.upStroke.moving && m.upStroke.sy > 1.5 && m.upStroke.flat < 0.4, 'a stroke straight up counts as a stroke too (swim.moving, swimV.sy)', m.upStroke);
    check(m.land.vy > 3 && m.land.top > 0.3 && m.land.landed && !m.land.swim && m.land.sounds === 0, 'on land Space jumps as before (no stroke)', m.land);
    check(m.jet.left && m.jet.kicks === 0, 'the worn jetpack still lifts out of the water, without a stroke', m.jet);

    // 4. pictures
    // the avatar: our own figure (ghosts.showSelf) set in the river; a jump in its speed is the stroke (ghosts.js), held half-way through
    const pose = async (name, crouch, view) => {
      const info = await page.evaluate(async ({ crouch, view }) => {
        const T = window.__stroke, { A, p, rb, fw, best, d, f, bed, C } = T, G = A.ghosts, water = rb.waterYAt(best.x, best.z), side = Math.sign((T.bank.x - best.x) * f.nx + (T.bank.z - best.z) * f.nz) || 1;
        if (!T.heldUpdate) T.heldUpdate = p.update.bind(p);
        p.update = T.heldUpdate; p.crouch = false; p.keys.clear();
        if (view === 'water') { const x = best.x + f.nx * side * 1.5 + d.x * 1.7, z = best.z + f.nz * side * 1.5 + d.z * 1.7; p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.update(T.dt); p.crouch = true; T.run(2.5); }
        else { const x = best.x + f.nx * side * 4.2 - d.x * 2.6, z = best.z + f.nz * side * 4.2 - d.z * 2.6; p.spawn(x, z, 0); p.pos.y = fw.surfaceY(x, z, bed); p.swim = null; p.update(T.dt); }
        p.update = () => {}; // (hold the view for the picture)
        G.showSelf = T.showSelf ?? G.showSelf; T.showSelf = G.showSelf; G.showSelf(); const g = G.myGhost;
        g.root.position.set(best.x, bed, best.z); g.root.rotation.y = Math.atan2(-d.x, -d.z); g.look = [0, 0]; g.crouch = crouch;
        const t0 = performance.now(), o = { strokes: 0, hands: [] }, av = g.avatar, V = A.camera.position.constructor, stroke = av.swimStroke.bind(av); av.swimStroke = () => { if (av.kickT > C.SWIM.kick.pause * 0.8) o.strokes++; stroke(); }; // (counted when the pose really starts)
        let t = t0; const step = (v, n, ms = 50) => { for (let i = 0; i < n; i++) { g.crouch = crouch; t += ms; g.animate(t, 0, d.x * v, d.z * v); } };
        const hands = () => { g.root.updateMatrixWorld(true); const h = av.bones.head.getWorldPosition(new V()); return ['L', 'R'].map((s) => { const q = av.hand(s).sub(h); return { ahead: q.x * d.x + q.z * d.z, side: Math.abs(q.x * f.nx + q.z * f.nz), y: q.y }; }); };
        step(1.25, 80); o.before = o.strokes; // the ordinary strokes: none of ours
        step(1.25 + C.SWIM.kick.speed * 0.9, 1, 16); o.started = o.strokes; o.hands.push(hands()); // the press: the speed jumps
        step(1.25 + C.SWIM.kick.speed * 0.8, 6, 16); o.hands.push(hands()); // 0.1 s in: both arms stretched out ahead
        step(1.25 + C.SWIM.kick.speed * 0.6, 14, 16); o.hands.push(hands()); o.kickT = av.kickT; // about half-way: out to the sides
        g.root.updateMatrixWorld(true); g.root.visible = true; G.showSelf = () => {}; G.beforeMirror = () => {}; av.swimStroke = stroke;
        const head = av.bones.head.getWorldPosition(new V()), eye = A.camera.position, hy = view === 'water' ? head.y : water + 0.1;
        A.camera.rotation.set(-Math.atan2(eye.y - hy, Math.hypot(head.x - eye.x, head.z - eye.z)), Math.atan2(-(head.x - eye.x), -(head.z - eye.z)), 0, 'YXZ');
        if (view !== 'water') { Object.defineProperty(A.camera, 'fov', { get: () => 24, set() {}, configurable: true }); A.camera.updateProjectionMatrix(); }
        return { ...o, swim: g.swim, dive: av.diveAmt, headOverWater: av.head.y - water };
      }, { crouch, view });
      await frames(page, 6);
      await kit.shot(page, path.join(out, `${name}.png`));
      return info;
    };
    const diver = await pose('avatar-simtag-under-vattnet', 1, 'water');
    const top = await pose('avatar-simtag-vid-ytan', 0, 'bank');
    console.log(JSON.stringify({ diver, top }, null, 1));
    for (const [name, a] of [['under water', diver], ['at the surface', top]]) {
      const [, h1, h2] = a.hands;
      check(a.swim && a.before === 0 && a.started === 1 && a.strokes === 1 && h1.every((h) => h.ahead > 0.25) && Math.abs(h1[0].ahead - h1[1].ahead) < 0.08 && h2.every((h, i) => h.side > h1[i].side + 0.1 && h.ahead < h1[i].ahead - 0.2),
        `the avatar ${name}: one stroke per press, both arms together from stretched out ahead, out and back`, a);
    }
    check(diver.dive > 0.95 && diver.headOverWater < -0.8 && top.headOverWater > 0.05 && top.headOverWater < 0.45, 'the avatar is where it was: under the surface diving, only the head above it otherwise', { diver: diver.headOverWater, top: top.headOverWater });
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})();
