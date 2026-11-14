// #1947: the shark that bites swimmers, in the real app (`&shark=attack`: an attack seconds into every swim). The swimmer and the hunt are
// stepped through production Player.update / SharkHunt.update; the death (the fall cover, the wake outdoors) runs in the app's own loop.
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/sharkattacktest.cjs GAME OUT
// Checks: swimming brings a warning and a fin that comes closer in the water; reaching a bank in time escapes (no bite on land, the shark
// gives up and sinks); a swimmer who stays is bitten: the cover with the shark's text, awake at a free outdoor spot away from the river
// with all lives; the shared weekly shark (#1769) bites a swimmer beside it and leaves one further away alone. Saves result images in OUT.
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8147', out = process.argv[3] || '/tmp/shark1947';
const results = []; let pass = true;
const check = (ok, name, data) => { results.push({ ok: !!ok, name, data }); pass &&= !!ok; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' ' + JSON.stringify(data) : ''}`); };
(async () => {
  const browser = await kit.launch();
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => route.fulfill({
      path: path.join(process.env.THREE_DIR, new URL(route.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?shot&cloud=&month=6&time=13&freeze&weather=clear&at=-40,150,180,0&test=lazy&shark=attack`, { waitUntil: 'commit' });
    page.on('console', (m) => { if (/Startup failed/.test(m.text())) { console.error(m.text()); process.exit(1); } });
    await page.waitForFunction(() => window.__app?.player && window.__app?.ghosts && window.__app?.sharkHunt, null, { timeout: 600000, polling: 200 });
    await kit.skipNameDialog(page); fs.mkdirSync(out, { recursive: true });
    // the helpers every step below uses (kept on window.T)
    await page.evaluate(async () => {
      const A = window.__app, p = A.player, H = A.sharkHunt, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js'), sw = await import('/src/swim.js');
      const dt = 1 / 60, ev = [];
      for (const k of ['onWarn', 'onBite', 'onGone']) { const f = H[k]; H[k] = (...a) => { ev.push(k); return f(...a); }; }
      let seed = 1947; H.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const P = rb.riverPath, W = C.WALK; let best = null; // the same open stretch as tools/swimtest.cjs: the middle of the longest walkable segment
      for (let i = 1; i < P.length; i++) {
        const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < W.x0 + 30 || mx > W.x1 - 30 || rb.deckAt(mx, mz) !== null || !fw.swimWater(mx, mz)) continue;
        if (!best || l > best.l) best = { l, x: mx, z: mz };
      }
      const f = rb.riverAt(best.x, best.z), n = [f.nx, f.nz], bed = fw.swimBedY(best.x, best.z), bank = fw.splashBank(best.x, best.z, bed);
      const T = window.T = { A, p, H, rb, fw, C, sw, dt, ev, best, n, bank, wet: true,
        face: (dx, dz) => A.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ'),
        dist: () => Math.hypot(H.st.x - p.pos.x, H.st.z - p.pos.z),
        /** One frame as main.js runs it for a walking / swimming player. */
        step() { if (A.fall.active) return; A.fall.update(dt); p.update(dt); H.update(dt); if (H.st.phase !== 'idle') T.wet &&= fw.swimWater(H.st.x, H.st.z); },
        /** Step until `done()` or `max` s; the seconds it took. */
        run(done, max, keys = []) { for (const k of keys) p.keys.add(k); let t = 0; while (t < max && !done()) { T.step(); t += dt; } for (const k of keys) p.keys.delete(k); return t; },
        /** Into the water at (x, z) of the station (the feet on the bed: Player.swimCheck starts the swim). */
        dip(x = best.x, z = best.z) { p.spawn(bank.x, bank.z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.update(dt); return !!p.swim; },
        badges: () => [...document.querySelectorAll('[data-text]')].map((e) => e.dataset.text),
      };
    });

    // 1. on land nothing happens; in the water a warning, the fin on its way
    const a = await page.evaluate(() => {
      const { p, H, T = window.T, C } = window.T, S = C.SHARK.attack, o = {};
      p.spawn(T.bank.x, T.bank.z, 0); p.pos.y = T.fw.surfaceY(T.bank.x, T.bank.z, p.pos.y);
      T.run(() => false, 8); o.land = { ev: [...T.ev], phase: H.st.phase };
      o.swim = T.dip(); o.warnAfter = T.run(() => H.st.phase === 'warn', 30);
      o.warn = { ev: [...T.ev], d0: T.dist(), want: S.speed * S.warn, wet: T.fw.swimWater(H.st.x, H.st.z), badges: T.badges(), drawn: H.shark.hunter === H.o };
      T.run(() => false, 2); o.closer = T.dist();
      return o;
    });
    check(!a.land.ev.length && a.land.phase === 'idle', 'on the bank: no shark', a.land);
    check(a.swim && a.warn.ev.join() === 'onWarn' && a.warnAfter < 6, 'swimming with &shark=attack: a shark surfaces within seconds', { after: a.warnAfter });
    check(a.warn.wet && a.warn.d0 > a.warn.want * 0.7 && a.warn.d0 < a.warn.want * 1.1 && a.closer < a.warn.d0 - 3 && a.warn.drawn, 'it surfaces in the river a warning away and comes closer', a.warn);
    check(a.warn.badges.some((t) => /haj/i.test(t)), 'the warning says so in Swedish', a.warn.badges);

    // 2. out of the water in time: no bite, the shark gives up and sinks
    const b = await page.evaluate(() => {
      const { p, H, T = window.T, A } = window.T, o = {};
      const side = Math.sign((T.bank.x - T.best.x) * T.n[0] + (T.bank.z - T.best.z) * T.n[1]) || 1;
      T.face(T.n[0] * side, T.n[1] * side);
      o.outAfter = T.run(() => !p.swim, 30, ['KeyW']);
      o.out = { swim: !!p.swim, wet: T.fw.swimWater(p.pos.x, p.pos.z), ev: [...T.ev], phase: H.st.phase, dist: T.dist() };
      o.goneAfter = T.run(() => T.ev.includes('onGone'), 30);
      T.run(() => H.st.phase === 'idle', 10);
      o.end = { ev: [...T.ev], phase: H.st.phase, dead: A.fall.active || A.fall.t >= 0, hunter: !!H.shark.hunter, sharkWet: T.wet, badges: T.badges(), at: p.pos.toArray() };
      return o;
    });
    check(!b.out.swim && !b.out.wet && !b.out.ev.includes('onBite'), 'swimming to the bank gets out before the shark arrives', { after: b.outAfter, ...b.out });
    check(b.end.ev.join() === 'onWarn,onGone' && b.end.phase === 'idle' && !b.end.dead && !b.end.hunter, 'on land: never bitten; the shark waits, gives up and sinks', { goneAfter: b.goneAfter, ...b.end });
    check(b.end.sharkWet, 'the shark never left the water');

    // 3. staying in the water: the fin arrives (pictures), then the bite
    const c = await page.evaluate(() => {
      const { p, H, T = window.T } = window.T, o = {};
      T.ev.length = 0; T.run(() => false, 5); // (the debug cool-down, on land)
      o.swim = T.dip(); T.run(() => H.st.phase === 'warn', 30);
      T.run(() => T.dist() < 5.5, 30);
      T.face(H.st.x - p.pos.x, H.st.z - p.pos.z); T.step();
      o.near = { d: T.dist(), ev: [...T.ev], show: H.st.show, finShown: H.shark.finShown, fin: H.shark.fin?.visible, speed: H.st.speed };
      return o;
    });
    check(c.swim && c.near.ev.join() === 'onWarn' && c.near.d < 5.6 && c.near.show === 1, 'second swim: the fin is up and close', c.near);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const drawn = await page.evaluate(() => { const S = window.T.H.shark; return { fin: S.fin.visible, shadow: S.shadow.visible, wake: S.wake.visible, rings: S.rings.visible, at: S.fin.position.toArray(), finShown: S.finShown }; });
    check(drawn.fin && drawn.shadow && drawn.wake && !drawn.rings && drawn.finShown, 'drawn with the #1769 fin, shadow and wake (no meshes of its own)', drawn);
    await kit.shot(page, path.join(out, 'fenan-narmar-sig.png'));
    // the same moment from the bank: our own figure (ghosts.showSelf) swimming, the fin behind it
    const view = await page.evaluate(() => {
      const { p, H, T = window.T, A } = window.T, G = A.ghosts, st = { x: p.pos.x, z: p.pos.z, bed: p.pos.y, water: T.rb.waterYAt(p.pos.x, p.pos.z) };
      const keep = { pos: p.pos.clone(), swim: p.swim, update: p.update, rot: A.camera.rotation.clone(), fov: A.camera.fov };
      const mx = (st.x + H.st.x) / 2, mz = (st.z + H.st.z) / 2, side = Math.sign((T.bank.x - st.x) * T.n[0] + (T.bank.z - st.z) * T.n[1]) || 1;
      const ex = mx + T.n[0] * side * 5.2, ez = mz + T.n[1] * side * 5.2; // (on the bank's slope, inside the fence)
      p.swim = null; p.pos.set(ex, T.fw.surfaceY(ex, ez, st.bed), ez); p.update(1 / 60);
      A.camera.position.set(ex, st.water + 2.4, ez);
      const eye = A.camera.position; A.camera.rotation.set(-Math.atan2(eye.y - st.water, Math.hypot(mx - eye.x, mz - eye.z)), Math.atan2(-(mx - eye.x), -(mz - eye.z)), 0, 'YXZ');
      p.update = () => {}; Object.defineProperty(A.camera, 'fov', { get: () => 58, set() {}, configurable: true }); A.camera.updateProjectionMatrix();
      G.showSelf(); const g = G.myGhost; g.root.position.set(st.x, st.bed, st.z); g.root.rotation.y = Math.atan2(-(st.x - H.st.x), -(st.z - H.st.z)); g.look = [0, 0];
      const t0 = performance.now(); for (let i = 0; i < 90; i++) g.animate(t0 + i * 50, 0, (st.x - H.st.x) / 5, (st.z - H.st.z) / 5);
      g.root.visible = true; const show = G.showSelf, mirror = G.beforeMirror; G.showSelf = () => {}; G.beforeMirror = () => {};
      window.T.back = () => { delete A.camera.fov; A.camera.fov = keep.fov; A.camera.updateProjectionMatrix(); G.showSelf = show; G.beforeMirror = mirror; g.root.visible = false; p.update = keep.update; p.pos.copy(keep.pos); p.swim = keep.swim; A.camera.rotation.copy(keep.rot); p.update(1 / 60); };
      return { swimAvatar: g.swim, eye: eye.toArray() };
    });
    await kit.shot(page, path.join(out, 'hajen-jagar-simmaren.png'));
    const d = await page.evaluate(() => {
      const { p, H, T = window.T, A } = window.T, o = {};
      T.back();
      o.before = { swim: !!p.swim, lives: A.combat.lives, max: A.combat.maxLives, deaths: A.combat.deaths, at: p.pos.toArray() };
      A.combat.lives = Math.max(1, A.combat.maxLives - 1); // (not full, to see them come back)
      const hold = A.fall.update; A.fall.update = () => {}; // hold the cover for the picture
      o.biteAfter = T.run(() => T.ev.includes('onBite'), 20);
      o.bite = { ev: [...T.ev], d: T.dist(), active: A.fall.active, fatal: A.fall.fatal, cover: !A.fall.el.hidden, swim: !!p.swim };
      A.fall.paint(0.28); window.T.release = () => { A.fall.update = hold; };
      return o;
    });
    check(view.swimAvatar, 'the bank view shows the swimming avatar', view);
    check(d.bite.ev.join() === 'onWarn,onBite' && d.bite.d <= 1.45 && d.bite.active && d.bite.fatal && d.bite.cover, 'staying in the water: bitten, the fatal cover starts', { after: d.biteAfter, ...d.bite });
    await kit.shot(page, path.join(out, 'bettet.png'));
    await page.evaluate(() => window.T.release());
    await page.waitForFunction(() => !window.T.A.fall.text.hidden, null, { timeout: 60000, polling: 50 }); // awake
    const e = await page.evaluate(async () => {
      const { p, H, T = window.T, A, C } = window.T, rs = await import('/src/respawn.js'), r = T.rb.riverAt(p.pos.x, p.pos.z);
      const hold = A.fall.update; A.fall.update = () => {}; window.T.release = () => { A.fall.update = hold; }; A.fall.paint(C.FALL.red + C.FALL.black + C.FALL.hold + 0.75);
      return { at: p.pos.toArray(), swim: !!p.swim, wet: T.fw.swimWater(p.pos.x, p.pos.z), river: r.distance - r.width / 2, text: A.fall.text.textContent, badges: T.badges(),
        outdoor: p.pos.x > C.OUTDOOR.x0 && p.pos.x < C.OUTDOOR.x1 && p.pos.z > C.OUTDOOR.z0 && p.pos.z < C.OUTDOOR.z1, free: !!rs.safeRespawnPoint(p, p.pos.x, p.pos.z),
        lives: A.combat.lives, max: A.combat.maxLives, deaths: A.combat.deaths, moved: Math.hypot(p.pos.x - T.best.x, p.pos.z - T.best.z) };
    });
    check(!e.swim && !e.wet && e.river > 1 && e.outdoor && e.free && e.moved > 5, 'awake at a free outdoor spot, not in the river', e);
    check(/Hajen bet dig/.test(e.text) && e.badges.some((t) => /Hajen tog dig/.test(t)), 'the cover and the badge tell about the shark', { text: e.text, badges: e.badges });
    check(e.lives === e.max && e.deaths === d.before.deaths + 1, 'a death like any other: counted, all lives again', { lives: e.lives, deaths: e.deaths, before: d.before });
    await kit.shot(page, path.join(out, 'vaknar-efter-bettet.png'));
    const faded = await page.evaluate(() => { const T = window.T; T.release(); T.run(() => T.A.fall.t < 0, 10); return { t: T.A.fall.t, hidden: T.A.fall.el.hidden }; }); // (the fade back in runs with the walking player)
    check(faded.t < 0 && faded.hidden, 'the cover fades away', faded);

    // 4. an ordinary fall shows its own text again; 5. the shared weekly shark (#1769) bites a swimmer beside it, not one further away
    const g = await page.evaluate(async () => {
      const { p, H, T = window.T, A, C } = window.T, o = {}, S = H.shark, ss = await import('/src/sharkswim.js');
      A.fall.hurt(4, false); o.fallText = A.fall.text.textContent; A.fall.t = -1; A.fall.el.hidden = true;
      T.run(() => H.st.phase === 'idle' && H.st.cool <= 0, 30); T.ev.length = 0;
      S.sync.sharkTest = true; // (what `&shark=now` sets: the shared shark's window is open)
      const w = S.sync.sharkWindow(), at = () => ss.sharkAt(w, S.sync.t, {}, S.sync.seed), s0 = at();
      o.shared = { window: !!w, show: s0.show, wet: T.fw.swimWater(s0.x, s0.z) };
      // further away along the river: swimming there is safe, and no local shark turns up while the shared one is in the river
      const r = T.rb.riverAt(s0.x, s0.z), far = [s0.x + r.nz * 12, s0.z - r.nx * 12], alt = [s0.x - r.nz * 12, s0.z + r.nx * 12], spot = T.fw.swimWater(...far) ? far : alt;
      o.farSwim = T.dip(...spot); T.run(() => T.ev.length > 0 || !p.swim, 6);
      S.update(0, false, 1); const sn = at(); // the shared shark's own drawing (the #1769 path through Shark.place) is as before
      o.sharedDrawn = { fin: S.fin.visible, wake: S.wake.visible, shadow: S.shadow.visible, shown: S.finShown, off: Math.hypot(S.fin.position.x - sn.x, S.fin.position.z - sn.z), hunter: !!S.hunter };
      o.far = { ev: [...T.ev], phase: H.st.phase, d: Math.hypot(at().x - p.pos.x, at().z - p.pos.z), swim: !!p.swim };
      const s1 = at(); o.nearSwim = T.dip(s1.x + r.nx * 0.8, s1.z + r.nz * 0.8); T.run(() => T.ev.length > 0, 2);
      o.near = { ev: [...T.ev], d: Math.hypot(at().x - p.pos.x, at().z - p.pos.z), active: A.fall.active, text: A.fall.text.textContent };
      return o;
    });
    check(/Du slog dig/.test(g.fallText), 'an ordinary fall keeps its own text', g.fallText);
    check(g.shared.window && g.shared.show > 0.5 && g.farSwim && !g.far.ev.length && g.far.phase === 'idle' && g.far.d > 3, 'the shared shark in the river: a swimmer 12 m off is left alone (and no local shark)', { ...g.shared, ...g.far });
    check(g.sharedDrawn.fin && g.sharedDrawn.wake && g.sharedDrawn.shadow && g.sharedDrawn.shown && g.sharedDrawn.off < 0.01 && !g.sharedDrawn.hunter, 'the shared shark is drawn at its own place as before', g.sharedDrawn);
    check(g.nearSwim && g.near.ev.join() === 'onBite' && g.near.active && /Hajen bet dig/.test(g.near.text), 'beside the shared shark in the water: bitten', g.near);
    await page.waitForFunction(() => !window.T.A.fall.text.hidden, null, { timeout: 60000, polling: 50 });
    const h = await page.evaluate(() => { const { p, T = window.T } = window.T; T.run(() => T.A.fall.t < 0, 10); return { swim: !!p.swim, wet: T.fw.swimWater(p.pos.x, p.pos.z) }; });
    check(!h.swim && !h.wet, 'and awake on land again', h);
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
