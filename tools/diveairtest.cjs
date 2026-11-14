// #1949: the air while diving in Höje å, in the real app. The swimmer is stepped through production Player.update + DiveAir.update (as
// main.js runs them); the death (the fall cover, the wake outdoors) runs in the app's own loop.
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/diveairtest.cjs GAME OUT
// Checks: no meter on land or swimming at the surface; diving shows it and it falls; the measured seconds of air holding still, swimming
// with the current and against it (about 60 s > swimming > upstream); the last 10 s: red meter, black edges that grow, a camera shake,
// heartbeats that quicken; at the surface the effects end at once, a gasp, the air comes back and the meter hides; staying down drowns: the
// cover with its own text, awake at a free outdoor spot away from the river with all lives, one death; no second death while one runs;
// the sounds are counted through the real `sfx` (headless has no ears) and everything is muffled only while under water; the meter covers
// no other HUD part, also in the touch layout (second page, the touch crouch toggle). Saves result images in OUT.
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8152', out = process.argv[3] || '/tmp/air1949';
const results = []; let pass = true;
const check = (ok, name, data) => { results.push({ ok: !!ok, name, data }); pass &&= !!ok; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' ' + JSON.stringify(data) : ''}`); };
const url = `${base}/?shot&cloud=&month=6&time=13&freeze&weather=clear&at=-40,150,180,0&test=lazy`;

async function load(browser, contextOptions, touch = false) {
  const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1, ...contextOptions });
  if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => route.fulfill({
    path: path.join(process.env.THREE_DIR, new URL(route.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
  const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'commit' });
  page.on('console', (m) => { if (/Startup failed/.test(m.text())) { console.error(m.text()); process.exit(1); } });
  await page.waitForFunction(() => window.__app?.player && window.__app?.ghosts && window.__app?.diveAir, null, { timeout: 600000, polling: 200 });
  await kit.skipNameDialog(page);
  await page.evaluate(async (touch) => { // the helpers every step uses (window.T)
    window.__app.showOverlay(false); document.getElementById('hud').hidden = false; // the HUD as during play (`?shot` hid the menu without showing it)
    if (touch) { window.__app.touch.enabled = true; document.body.classList.add('touch'); window.__app.touch.layout?.apply?.(); }
    const A = window.__app, p = A.player, D = A.diveAir, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js'), sw = await import('/src/swim.js'), au = await import('/src/audio.js');
    au.initAudio(); // (the real synthesis runs, so a broken sound would throw; nobody hears it)
    const dt = 1 / 60, snd = { bubbles: 0, heartbeat: [], gasp: 0, drown: 0 }; let clock = 0;
    for (const k of ['bubbles', 'gasp', 'drown']) { const f = au.sfx[k]; au.sfx[k] = (...a) => { snd[k]++; return f.apply(au.sfx, a); }; }
    { const f = au.sfx.heartbeat; au.sfx.heartbeat = (k) => { snd.heartbeat.push({ t: clock, k }); return f.call(au.sfx, k); }; }
    const P = rb.riverPath, W = C.WALK; let best = null; // the same open stretch as tools/swimtest.cjs: the middle of the longest walkable segment
    for (let i = 1; i < P.length; i++) {
      const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (mx < W.x0 + 30 || mx > W.x1 - 30 || rb.deckAt(mx, mz) !== null || !fw.swimWater(mx, mz)) continue;
      if (!best || l > best.l) best = { l, x: mx, z: mz };
    }
    const bank = fw.splashBank(best.x, best.z, fw.swimBedY(best.x, best.z));
    const T = window.T = { A, p, D, rb, fw, C, sw, au, dt, snd, best, bank, drowned: 0,
      face: (dx, dz) => A.camera.rotation.set(0, Math.atan2(-dx, -dz), A.camera.rotation.z, 'YXZ'),
      /** One frame as main.js runs it for a walking / swimming player. `aim` -1 / 1: keep facing up / downstream. */
      step(aim = 0) {
        if (A.fall.active) return;
        if (aim) { const d = sw.currentDir(rb.riverAt(p.pos.x, p.pos.z)); T.face(d.x * aim, d.z * aim); }
        A.fall.update(dt); p.update(dt); D.update(dt, A.fall.active); clock += dt;
      },
      /** Step until `done()` or `max` s; the seconds it took. */
      run(done, max, keys = [], aim = 0) { for (const k of keys) p.keys.add(k); let t = 0; while (t < max && !done()) { T.step(aim); t += dt; } for (const k of keys) p.keys.delete(k); return t; },
      dip(x = best.x, z = best.z) { p.crouch = false; p.spawn(bank.x, bank.z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.update(dt); return !!p.swim; },
      /** What the player sees of the air right now. */
      hud() {
        const el = D.el, bar = el.querySelector('i'), cs = getComputedStyle(el), e = D.edge;
        return { shown: !el.hidden && cs.display !== 'none', low: el.classList.contains('low'), width: parseFloat(bar.style.width) || 0, bar: getComputedStyle(bar).backgroundColor,
          air: D.air, warn: D.warn, rate: D.rate, edge: e.style.display !== 'none', edgeBg: e.style.background, roll: A.camera.rotation.z, muffled: au.isMuffled(), under: p.diving };
      },
      /** A full dive from full air until the air is out, without dying (the drowning is only counted): the seconds it took. */
      dive(keys, aim) {
        T.dip(); const keep = D.onDrown; let dead = false; D.onDrown = () => { dead = true; };
        p.crouch = true; T.run(() => p.diving, 5, keys, aim); const x0 = p.pos.x, z0 = p.pos.z, d = sw.currentDir(rb.riverAt(x0, z0));
        const t = T.run(() => dead || !p.swim || p.swim.exit, 120, keys, aim);
        D.onDrown = keep; const o = { t, dead, swim: !!p.swim, exit: !!p.swim?.exit, along: (p.pos.x - x0) * d.x + (p.pos.z - z0) * d.z, moved: Math.hypot(p.pos.x - x0, p.pos.z - z0) };
        p.crouch = false; T.run(() => !D.shown, 20); return o;
      },
      badges: () => [...document.querySelectorAll('[data-text]')].map((e) => e.dataset.text),
      /** Visible HUD parts whose box touches the meter's (not the full-screen layers, not the meter itself). */
      overlaps() {
        const el = D.el, was = el.hidden; el.hidden = false; const a = el.getBoundingClientRect(), hit = [];
        for (const e of document.body.querySelectorAll('*')) {
          if (e === el || el.contains(e) || e.contains(el) || e.tagName === 'CANVAS' && e.id !== 'minimap') continue;
          const cs = getComputedStyle(e), r = e.getBoundingClientRect();
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || r.width < 1 || r.height < 1 || e.closest('[hidden]')) continue;
          if (r.width > innerWidth * 0.8 && r.height > innerHeight * 0.6) continue; // (covers, washes, the game view)
          const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(BUTTON|IMG|CANVAS|INPUT)$/.test(e.tagName) || cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
          if (own && r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top) hit.push(`${e.tagName.toLowerCase()}#${e.id}.${e.className} "${e.textContent.trim().slice(0, 30)}" ${[r.left, r.top, r.right, r.bottom].map(Math.round)}`);
        }
        el.hidden = was; return { rect: [a.left, a.top, a.right, a.bottom].map(Math.round), view: [innerWidth, innerHeight], touch: document.body.classList.contains('touch'), hit };
      },
    };
  }, touch);
  return { ctx, page, errors };
}

(async () => {
  const browser = await kit.launch();
  try {
    fs.mkdirSync(out, { recursive: true });
    const { ctx, page, errors } = await load(browser);

    // 1. land and the surface: no meter; diving: it shows and falls
    const a = await page.evaluate(() => {
      const { p, D, T = window.T, C } = window.T, o = {};
      p.spawn(T.bank.x, T.bank.z, 0); p.pos.y = T.fw.surfaceY(T.bank.x, T.bank.z, p.pos.y);
      T.run(() => false, 3, ['KeyW']); o.land = T.hud();
      o.swim = T.dip(); T.run(() => false, 4, ['KeyW'], 1); o.surface = { ...T.hud(), swim: !!p.swim };
      T.dip(); p.crouch = true; T.run(() => p.diving, 5); o.justUnder = T.hud();
      T.run(() => false, 15); o.down15 = T.hud(); o.snd = { ...T.snd, heartbeat: T.snd.heartbeat.length };
      o.full = C.SWIM.air.seconds; o.second = new D.constructor({ player: p, camera: T.A.camera, el: D.el.cloneNode(true), seconds: 12, parent: document.createElement('div') }).air; // (what `&air=12` gives)
      return o;
    });
    check(!a.land.shown && !a.land.edge && a.land.air === a.full && !a.land.muffled, 'on land: no meter, full air', a.land);
    check(a.swim && a.surface.swim && !a.surface.shown && a.surface.air === a.full && !a.surface.muffled, 'swimming at the surface: no meter', a.surface);
    check(a.justUnder.shown && a.justUnder.under && a.justUnder.muffled && a.justUnder.width > 98, 'diving: the meter appears, the sound is muffled', a.justUnder);
    check(a.down15.shown && Math.abs(a.down15.air - (a.full - 15)) < 0.3 && Math.abs(a.down15.width - 75) < 1 && !a.down15.low && !a.down15.edge && a.down15.roll === 0, '15 s still under water: the meter fell to 75 %, no warning yet', a.down15);
    check(a.snd.bubbles >= 4 && !a.snd.heartbeat && !a.snd.gasp, 'bubbles are heard under water', a.snd);
    check(a.second === 12, 'another amount of air (the &air= parameter\'s option)', a.second);
    await kit.shot(page, path.join(out, 'syrematare-under-dyk.png'));

    // 2. the last 10 s: red meter, black edges, shake, heartbeats; they grow
    const b = await page.evaluate(() => {
      const { p, D, T = window.T, A } = window.T, o = {};
      T.run(() => D.air <= 10.2, 60); o.before = T.hud();
      T.run(() => D.air <= 6, 60); o.early = T.hud();
      const rolls = [], ys = []; for (let i = 0; i < 40; i++) { T.step(); rolls.push(Math.abs(A.camera.rotation.z)); ys.push(A.camera.position.y - p.eyeY); }
      o.earlyShake = { roll: Math.max(...rolls), shift: Math.max(...ys.map(Math.abs)) };
      T.run(() => D.air <= 2.5, 60); o.late = T.hud();
      const r2 = []; for (let i = 0; i < 40; i++) { T.step(); r2.push(Math.abs(A.camera.rotation.z)); }
      o.lateShake = { roll: Math.max(...r2) }; o.shot = T.hud();
      const h = T.snd.heartbeat; o.beats = { n: h.length, first: h[1].t - h[0].t, last: h.at(-1).t - h.at(-2).t, k0: h[0].k, k1: h.at(-1).k };
      return o;
    });
    const clear = (s) => parseFloat(/\) ([\d.]+)%/.exec(s)?.[1]);
    check(!b.before.low && !b.before.edge && b.before.warn === 0, 'just over 10 s left: still no warning', { air: b.before.air });
    check(b.early.low && b.early.edge && /22[0-9], 7[0-9], 7[0-9]|229, 72, 77/.test(b.early.bar) && b.earlyShake.roll > 0.003 && b.earlyShake.shift > 0.001, 'inside the last 10 s: red meter, black edges, the picture shakes', { ...b.early, shake: b.earlyShake });
    check(b.late.warn > b.early.warn && clear(b.late.edgeBg) < clear(b.early.edgeBg) - 10 && b.lateShake.roll > b.earlyShake.roll * 1.3, 'nearer the end: the edges close in and the shake grows', { early: clear(b.early.edgeBg), late: clear(b.late.edgeBg), roll: [b.earlyShake.roll, b.lateShake.roll], bg: b.late.edgeBg });
    check(b.beats.n >= 8 && b.beats.last < b.beats.first * 0.75 && b.beats.k1 > b.beats.k0, 'heartbeats, quicker and stronger towards the end', b.beats);
    await kit.shot(page, path.join(out, 'rod-matare-svarta-kanter.png'));

    // 3. up to the surface: the effects end at once, a gasp, the air comes back, the meter hides
    const c = await page.evaluate(() => {
      const { p, D, T = window.T } = window.T, o = {};
      p.crouch = false; o.upIn = T.run(() => !p.diving, 5); T.step(); o.atSurface = T.hud(); o.gasp = T.snd.gasp;
      o.fullIn = T.run(() => !D.shown, 20); o.after = T.hud();
      return o;
    });
    check(c.upIn < 1.5 && !c.atSurface.low && !c.atSurface.edge && c.atSurface.roll === 0 && !c.atSurface.muffled && c.atSurface.shown, 'at the surface: red, edges, shake and muffling stop at once (the meter stays while the air comes back)', { upIn: c.upIn, ...c.atSurface });
    check(c.gasp === 1, 'a gasp for air when surfacing near the end', { gasp: c.gasp });
    check(c.fullIn < 6 && !c.after.shown && c.after.air === a.full, 'the air is back within seconds and the meter hides', { fullIn: c.fullIn, air: c.after.air });

    // 4. how long the air lasts: still, swimming with the current, swimming against it (whole dives; the drowning only counted)
    const d = await page.evaluate(() => { const T = window.T, g0 = T.snd.gasp; const o = { still: T.dive([], 0), down: T.dive(['KeyW'], 1), up: T.dive(['KeyW'], -1) }; o.gasps = T.snd.gasp - g0; return o; });
    check(d.still.dead && Math.abs(d.still.t - 60) < 1.5, `holding still: the air lasts about a minute (${d.still.t.toFixed(1)} s)`, d.still);
    check(d.down.dead && d.down.t < d.still.t * 0.75 && d.down.along > 20, `swimming with the current: noticeably shorter (${d.down.t.toFixed(1)} s)`, d.down);
    check(d.up.dead && d.up.t < d.down.t * 0.8 && d.up.along < -5, `swimming against the current: shorter still (${d.up.t.toFixed(1)} s)`, d.up);

    // 5. staying down: drowned. The cover with its own text, awake outdoors away from the river, all lives, one death
    const e = await page.evaluate(() => {
      const { p, D, T = window.T, A } = window.T, o = {};
      T.dip(); p.crouch = true; T.run(() => D.air < 3, 80);
      o.before = { lives: A.combat.lives, max: A.combat.maxLives, deaths: A.combat.deaths, hud: T.hud(), drown: T.snd.drown };
      A.combat.lives = Math.max(1, A.combat.maxLives - 1); // (not full, to see them come back)
      const hold = A.fall.update; A.fall.update = () => {}; window.T.release = () => { A.fall.update = hold; }; // hold the cover for the checks
      o.after = T.run(() => A.fall.active, 10);
      o.dead = { active: A.fall.active, fatal: A.fall.fatal, cover: !A.fall.el.hidden, html: A.fall.text.innerHTML, drown: T.snd.drown, hud: T.hud() };
      D.onDrown(); D.update(1 / 60, true); o.again = { drown: T.snd.drown, html: A.fall.text.innerHTML, t: A.fall.t }; // a second cause while the death runs changes nothing
      return o;
    });
    check(e.before.hud.low && e.dead.active && e.dead.fatal && e.dead.cover && /Luften tog slut/.test(e.dead.html) && e.dead.drown === e.before.drown + 1, 'out of air: the fatal cover with the drowning text and sound', { after: e.after, html: e.dead.html });
    check(!e.dead.hud.shown && !e.dead.hud.edge && e.dead.hud.roll === 0 && !e.dead.hud.muffled, 'the meter and the warning are gone when the cover takes over', e.dead.hud);
    check(e.again.drown === e.dead.drown && e.again.t === 0, 'no second death while one is running', e.again);
    await page.evaluate(() => window.T.release());
    await page.waitForFunction(() => !window.T.A.fall.text.hidden, null, { timeout: 60000, polling: 50 }); // awake
    const f = await page.evaluate(async () => {
      const { p, T = window.T, A, C } = window.T, rs = await import('/src/respawn.js'), r = T.rb.riverAt(p.pos.x, p.pos.z);
      const hold = A.fall.update; A.fall.update = () => {}; window.T.release = () => { A.fall.update = hold; }; A.fall.paint(C.FALL.red + C.FALL.black + C.FALL.hold + 0.75);
      return { at: p.pos.toArray(), swim: !!p.swim, wet: T.fw.swimWater(p.pos.x, p.pos.z), river: r.distance - r.width / 2, text: A.fall.text.textContent, badges: T.badges(),
        outdoor: p.pos.x > C.OUTDOOR.x0 && p.pos.x < C.OUTDOOR.x1 && p.pos.z > C.OUTDOOR.z0 && p.pos.z < C.OUTDOOR.z1, free: !!rs.safeRespawnPoint(p, p.pos.x, p.pos.z),
        lives: A.combat.lives, max: A.combat.maxLives, deaths: A.combat.deaths, hud: T.hud() };
    });
    check(!f.swim && !f.wet && f.river > 1 && f.outdoor && f.free, 'awake at a free outdoor spot, not in the river', f);
    check(/Luften tog slut/.test(f.text) && f.badges.some((t) => /Luften tog slut/.test(t)), 'the cover and the badge say the air ran out', { text: f.text, badges: f.badges });
    check(f.lives === f.max && f.deaths === e.before.deaths + 1, 'a death like any other: counted once, all lives again', { lives: f.lives, deaths: f.deaths, before: e.before.deaths });
    check(!f.hud.shown && !f.hud.edge && f.hud.air === a.full, 'awake: no meter, full air', f.hud);
    await kit.shot(page, path.join(out, 'drunknad-vaknar-utomhus.png'));
    const g = await page.evaluate(() => {
      const T = window.T, { A, p } = T; T.release(); T.run(() => A.fall.t < 0, 10);
      const o = { t: A.fall.t, hidden: A.fall.el.hidden }; A.fall.hurt(4, false); o.fallText = A.fall.text.textContent; A.fall.t = -1; A.fall.el.hidden = true;
      T.run(() => false, 2, ['KeyW']); o.walk = T.hud(); return o;
    });
    await page.setViewportSize(kit.FULL); g.desktop = await page.evaluate(() => window.T.overlaps()); // (a desktop window; the test page itself is tiny)
    check(g.t < 0 && g.hidden && /Du slog dig/.test(g.fallText), 'the cover fades away; an ordinary fall keeps its own text', g);
    check(!g.walk.shown && !g.walk.edge, 'walking on land afterwards: no meter', g.walk);
    check(!g.desktop.hit.length && g.desktop.rect[2] > g.desktop.rect[0], 'the meter covers no other HUD part (desktop)', g.desktop);
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    await ctx.close();

    // 6. the touch layout: the crouch toggle dives, the meter shows and covers no control
    const t = await load(browser, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, true);
    const h = await t.page.evaluate(() => {
      const { p, T = window.T } = window.T, o = {};
      T.dip(); o.before = T.hud(); document.getElementById('crouch-btn').click(); o.toggled = p.crouch;
      T.run(() => p.diving, 5); T.run(() => false, 20, ['KeyW'], 1); o.down = T.hud(); o.layout = T.overlaps();
      return o;
    });
    check(h.layout.touch && h.toggled && !h.before.shown && h.down.shown && h.down.under && h.down.width < 60, 'touch: the crouch toggle dives and the meter shows and falls', { before: h.before.shown, down: h.down });
    check(!h.layout.hit.length && h.layout.rect[2] > h.layout.rect[0], 'the meter covers no other HUD part (touch layout)', h.layout);
    await kit.shot(t.page, path.join(out, 'touch-layout.png'), { viewport: { width: 844, height: 390 }, restore: { width: 844, height: 390 } });
    check(!t.errors.length, 'no page errors (touch)', t.errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
