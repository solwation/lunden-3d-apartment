// #1950: a picked blue mussel is closed and is cracked against the bed of Höje å, in the real app: a dive to a mussel, the real E key takes
// it (closed, the hint), E aimed at the bed knocks it ("Slå musslan mot botten": the mussel strikes down), the touch action button too, the
// last knock cracks it (`mussels.held.cracked`, the open look, no draw call more), E then puts it down and takes it again still cracked;
// no knock counts at the surface or on land; a closed mussel put back on its spot is one of the bed's closed ones. Result images in OUT.
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/musselcracktest.cjs GAME OUT
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8153', out = process.argv[3] || '/tmp/mussel1950';
const results = []; let pass = true;
const check = (ok, name, data) => { results.push({ ok: !!ok, name, data }); pass &&= !!ok; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' ' + JSON.stringify(data) : ''}`); };
(async () => {
  const browser = await kit.launch();
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => route.fulfill({
      path: path.join(process.env.THREE_DIR, new URL(route.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?shot&cloud=&month=6&time=13&freeze&weather=clear&test=lazy&nosquirrels&air=100000`, { waitUntil: 'commit' });
    page.on('console', (m) => { if (/Startup failed/.test(m.text())) { console.error(m.text()); process.exit(1); } if (/Shader Error|WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 300)); });
    await page.waitForFunction(() => window.__app?.player && window.__app?.mussels, null, { timeout: 600000, polling: 200 });
    await kit.skipNameDialog(page); fs.mkdirSync(out, { recursive: true });
    await page.evaluate(() => window.__app.showOverlay?.(true));
    if (await page.locator('#start-go').isVisible()) await page.locator('#start-go').click(); else await page.locator('#start-touch').click();
    const setup = await page.evaluate(async () => {
      const A = window.__app, p = A.player, M = A.mussels, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js');
      A.renderer.setAnimationLoop(null); // the test steps the real frame (A.step) itself
      A.touch.enabled = true; // (the game is "active" without a pointer lock; the E key is pressed under a real lock below)
      const T = window.__crack = { A, p, M, rb, fw, C, K: C.MUSSELS.crack,
        look: (x, y, z) => { const c = A.camera.position, dx = x - c.x, dz = z - c.z; A.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); A.camera.updateMatrixWorld(); },
        swimAt: (x, z, dive, at) => {
          p.crouch = false; p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.crouch = dive;
          for (let i = 0; i < (dive ? 260 : 60); i++) { p.pos.set(x, fw.swimBedY(x, z), z); if (at) T.look(...at); A.step(1 / 60); }
          if (at) { T.look(...at); p.pos.set(x, fw.swimBedY(x, z), z); A.step(0.001); T.look(...at); A.step(0.001); }
        },
        // the frame stepped with the diver held in place, looking at `at`: `n` steps of `dt` s
        hold: (at, n = 3, dt = 0.001) => { const { x, z } = p.pos; for (let i = 0; i < n; i++) { p.pos.set(x, fw.swimBedY(x, z), z); T.look(...at); A.step(dt); } },
        top: (s) => [s.x, s.y + 0.02, s.z],
        // the draw calls of a frame drawn now, without the placement ring / ghost (they belong to the E target, not to the mussel)
        calls: () => { const g = [A.placement.ghost, A.placement.ring], was = g.map((x) => x.visible); for (const x of g) x.visible = false; A.testMode.draw(); g.forEach((x, i) => { x.visible = was[i]; }); return A.renderer.info.render.calls; },
        focus: () => { const f = A.focus().focused; return f ? { kind: f.kind, name: f.name, verb: f.verb, blocked: !!f.blocked, strike: !!f.strike, item: !!f.item?.isMussel } : null; },
        hud: () => ({ prompt: document.getElementById('prompt').textContent, button: document.getElementById('action').textContent, badges: [...document.getElementById('badges').children].map((b) => b.textContent) }),
        shell: () => { const m = M.held ?? M.items.find((x) => !x.broken); return m ? { cracked: m.cracked, hits: m.hits, open: m.model.geometry === M.open, closed: m.model.geometry === M.geometry, held: m.held,
          tris: m.model.geometry.index ? m.model.geometry.index.count / 3 : m.model.geometry.attributes.position.count / 3 } : null; },
        beside: (s, k = 0.45) => { const q = rb.riverAt(s.x, s.z), x = s.x + q.nz * 0.1 + q.nx * k, z = s.z - q.nx * 0.1 + q.nz * k; return [x, fw.swimBedY(x, z), z]; },
      };
      const P = rb.riverPath; let best = null;
      for (let i = 1; i < P.length; i++) { const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < C.WALK.x0 + 30 || mx > C.WALK.x1 - 30 || rb.deckAt(mx, mz) !== null || !fw.swimWater(mx, mz)) continue; if (!best || l > best.l) best = { l, x: mx, z: mz }; }
      T.swimAt(best.x, best.z, false);
      const depth = (s) => rb.waterYAt(s.x, s.z) - s.y, dist = (s) => Math.hypot(s.x - best.x, s.z - best.z), open = M.spots.filter((s) => rb.deckAt(s.x, s.z) === null);
      T.deep = open.filter((s) => depth(s) > 1.3 && M.spots.some((o) => o !== s && o.clump === s.clump)).sort((a, b) => dist(a) - dist(b))[0];
      T.shallow = open.filter((s) => depth(s) < 0.8).sort((a, b) => depth(a) - depth(b))[0];
      const q = rb.riverAt(T.deep.x, T.deep.z);
      T.swimAt(T.deep.x - q.nz * 0.75, T.deep.z + q.nx * 0.75, true, T.top(T.deep));
      return { spots: M.spots.length, deep: !!T.deep, shallow: T.shallow && depth(T.shallow), diving: p.diving, focus: T.focus(), hits: T.K.hits, gap: T.K.gap, reach: T.K.reach, hint: T.K.hint, hud: T.hud() };
    });
    console.log(JSON.stringify(setup));
    check(setup.deep && setup.diving && setup.focus?.verb === 'ta' && !setup.hud.badges.includes(setup.hint), 'a diver at a mussel on the bed; no hint yet', setup);

    // 1. the real E key takes it: closed, looks closed, the hint is shown once
    await page.evaluate(() => { window.__app.activeMode = 'mouse'; document.getElementById('game-canvas').requestPointerLock(); });
    await page.waitForFunction(() => !!document.pointerLockElement, null, { polling: 100, timeout: 10000 });
    await page.keyboard.press('KeyE');
    const took = await page.evaluate(() => { const T = window.__crack, { A, M } = T; T.spotB = T.beside(T.deep); T.hold(T.spotB, 4);
      return { shell: T.shell(), flag: M.held?.cracked, hud: T.hud(), focus: T.focus(), state: M.state(), calls: A.renderer.info.render.calls, y: M.held.model.position.y }; });
    check(took.flag === false && took.shell.closed && took.shell.hits === 0 && took.hud.badges.includes(setup.hint), 'E takes it: `mussels.held.cracked` is false, the closed shell, the hint "Slå musslan mot botten för att öppna den"', took);
    check(took.focus?.strike && took.focus.kind === 'holdable' && /slå musslan mot botten$/.test(took.hud.prompt),
      'aimed at the bed beside: E knocks, it does not put down (the action says "Slå musslan mot botten")', { focus: took.focus, hud: took.hud });
    const label = await page.evaluate(() => { const T = window.__crack, { A } = T; const was = [A.touch.enabled, A.activeMode]; A.touch.enabled = true; A.activeMode = 'touch'; T.hold(T.spotB, 3);
      const o = { button: T.hud().button, hidden: document.getElementById('action').hidden, was }; [A.touch.enabled, A.activeMode] = was; T.hold(T.spotB, 3); return o; });
    check(label.button === 'Slå musslan mot botten' && !label.hidden, 'on touch the action button says "Slå musslan mot botten"', label);
    await kit.shot(page, path.join(out, 'stangd-mussla-i-handen.png'));
    await page.evaluate(() => { const T = window.__crack; T.hold(T.spotB, 3); });

    // 2. the first knock with the real E key: counted, seen (the mussel strikes down and comes back), not yet cracked; a second E at once is too soon
    await page.keyboard.press('KeyE');
    const hit1 = await page.evaluate(() => { const T = window.__crack, { M, K } = T, m = M.held, y0 = m.heldPose.pos.y, o = { after: T.shell() };
      T.hold(T.spotB, 1, K.swing.time * K.swing.at); o.blow = { dy: m.model.position.y - y0, swinging: m.swingT >= 0 }; return o; });
    await kit.shot(page, path.join(out, 'slag-mot-botten.png'));
    await page.keyboard.press('KeyE');
    const soon = await page.evaluate(() => { const T = window.__crack, { M, K } = T, m = M.held, o = { shell: T.shell() };
      T.hold(T.spotB, 30, K.gap / 20); o.rest = { dy: m.model.position.y - m.heldPose.pos.y, swinging: m.swingT >= 0, held: T.shell().held, focus: T.focus(), calls: T.calls() }; return o; });
    check(hit1.after.hits === 1 && !hit1.after.cracked && hit1.after.closed && hit1.blow.swinging && hit1.blow.dy < -0.1, 'E knocks once: counted, the held mussel strikes down, still closed', hit1);
    check(soon.shell.hits === 1 && !soon.rest.swinging && Math.abs(soon.rest.dy) < 1e-6 && soon.rest.held && soon.rest.focus?.strike, 'a second E at once is too soon; the mussel is back in the hand, still held', soon);

    // 3. the remaining knocks, the last but one with the touch action button; the last one cracks it
    const rest = await page.evaluate(() => { const T = window.__crack, { M, K } = T, o = { via: [] };
      for (let i = 1; i < K.hits - 1; i++) { document.getElementById('action').click(); o.via.push('button'); T.hold(T.spotB, 30, K.gap / 20); }
      o.before = T.shell(); return o; });
    await page.keyboard.press('KeyE');
    const crack = await page.evaluate(() => { const T = window.__crack, { A, M, K } = T, o = { atE: { ...T.shell(), flag: M.held?.cracked } };
      T.hold(T.spotB, 30, K.gap / 20); o.after = T.shell(); o.focus = T.focus(); o.hud = T.hud(); o.calls = T.calls(); o.spot = M.held.spot; o.deepGone = T.deep.gone; return o; });
    check(rest.before.hits === setup.hits - 1 && !rest.before.cracked && rest.before.closed, `after ${setup.hits - 1} knocks (the action button too) it is still closed`, rest);
    check(crack.atE.flag === true && crack.after.cracked && crack.after.open && !crack.after.closed && crack.after.tris > took.shell.tris, `knock ${setup.hits} cracks it: \`mussels.held.cracked\` true, the open shell with the meat`, crack);
    check(crack.focus?.kind === 'place' && !crack.focus.strike && crack.calls === soon.rest.calls && crack.calls > 0, 'cracked: E on the bed puts it down as before; no draw call more than with the closed one', { focus: crack.focus, hud: crack.hud, calls: [soon.rest.calls, crack.calls] });
    await kit.shot(page, path.join(out, 'knackt-mussla-i-handen.png'));
    await page.evaluate(() => { const T = window.__crack; T.hold(T.spotB, 3); });

    // 4. put down on the bed and taken again: still cracked
    await page.keyboard.press('KeyE');
    const down = await page.evaluate(() => { const T = window.__crack, { A, M, fw } = T, it = M.items.find((x) => !x.broken), m = it.model.position; T.hold([m.x, m.y, m.z], 4);
      return { held: !!A.heldItem(), placed: it.placed, overBed: m.y - fw.swimBedY(m.x, m.z), shell: T.shell(), focus: T.focus() }; });
    await kit.shot(page, path.join(out, 'knackt-mussla-pa-botten.png'));
    await page.evaluate(() => { const T = window.__crack, m = T.M.items.find((x) => !x.broken).model.position; T.hold([m.x, m.y, m.z], 3); });
    await page.keyboard.press('KeyE');
    const again = await page.evaluate(() => { const T = window.__crack, { M } = T; T.hold(T.top(T.deep), 4); const f = T.focus(); T.hold(T.spotB, 4);
      return { flag: M.held?.cracked, shell: T.shell(), atOldSpot: f, focus: T.focus(), strike: M.strike() }; });
    check(!down.held && down.placed && down.overBed > -0.02 && down.overBed < 0.1 && down.shell.cracked && down.shell.open && down.focus?.item, 'E puts the cracked mussel down on the bed (open, lying on its lower valve)', down);
    check(again.flag === true && again.shell.open && again.focus?.kind === 'place' && again.strike === null && again.atOldSpot?.name !== 'blåmusslan',
      'taken again it is still cracked; it is not knocked again and has no old spot to go back to', again);

    // 5. a closed one: no knock counts at the surface (the shallows, the bed within reach) or on land; put down and taken again it is still closed
    const noCount = await page.evaluate(() => {
      const T = window.__crack, { A, p, M, fw, K, shallow, deep } = T, o = { consumed: M.consumeHeld() };
      const tryAll = (at) => { const r = []; for (let i = 0; i < K.hits + 1; i++) { r.push(M.strike()); const f = A.focus().focused; if (f?.strike) f.toggle(); if (at) T.hold(at, 4, K.gap / 3); else for (let j = 0; j < 4; j++) A.step(K.gap / 3); } return r; };
      if (shallow) {
        T.swimAt(shallow.x + 0.1, shallow.z + 0.1, false, T.top(shallow));
        o.surface = { diving: p.diving, swim: !!p.swim, took: M.take(shallow) }; const b = T.beside(shallow, 0.2); T.hold(b, 4);
        Object.assign(o.surface, { focus: T.focus(), dist: A.camera.position.distanceTo({ x: b[0], y: b[1], z: b[2] }), strikes: tryAll(b), shell: T.shell() });
        const f = A.focus().focused; if (f?.kind === 'place') A.use(f); T.hold(b, 2);
        const it = M.items.find((x) => !x.broken); o.put = { placed: it?.placed, shell: T.shell() }; it?.take(); o.retaken = T.shell();
      }
      if (!M.held) { T.swimAt(deep.x - 0.6, deep.z, true, T.top(deep)); M.take(M.drawn.slice(0, M.mesh.count).find((s) => !s.gone)); }
      const bank = fw.splashBank(deep.x, deep.z, deep.y); p.crouch = false; p.spawn(bank.x, bank.z, 0); p.pos.y = fw.surfaceY(bank.x, bank.z, p.pos.y); p.swim = null;
      for (let i = 0; i < 30; i++) A.step(1 / 60);
      const g = [p.pos.x + 0.5, p.pos.y, p.pos.z + 0.3]; T.look(...g); A.step(0.001); T.look(...g); A.step(0.001);
      o.land = { swim: !!p.swim, held: !!M.held, focus: T.focus(), strikes: tryAll(null), shell: T.shell() };
      p.crouch = true; for (let i = 0; i < 30; i++) A.step(1 / 60); T.look(...g); A.step(0.001); T.look(...g); A.step(0.001);
      o.landCrouched = { focus: T.focus(), strikes: tryAll(null), shell: T.shell() }; p.crouch = false;
      return o;
    });
    if (noCount.surface) {
      check(noCount.surface.took && !noCount.surface.diving && noCount.surface.dist < setup.reach && !noCount.surface.focus?.strike && noCount.surface.strikes.every((r) => r === null) && noCount.surface.shell.hits === 0 && !noCount.surface.shell.cracked,
        'at the surface with the bed within reach: no knock, E puts down as before', noCount.surface);
      check(noCount.put.placed && noCount.put.shell.closed && noCount.retaken.held && noCount.retaken.closed && !noCount.retaken.cracked, 'a closed mussel put down from the surface and taken again is still closed', { put: noCount.put, retaken: noCount.retaken });
    }
    check(!noCount.land.swim && noCount.land.held && !noCount.land.focus?.strike && noCount.land.strikes.every((r) => r === null) && noCount.landCrouched.strikes.every((r) => r === null) && !noCount.landCrouched.focus?.strike
      && noCount.landCrouched.shell.hits === 0 && !noCount.landCrouched.shell.cracked && noCount.landCrouched.shell.closed, 'on land (standing and crouched) no knock against the ground counts', { land: noCount.land, crouched: noCount.landCrouched });

    // 6. half-knocked and put back on its old spot: one of the bed's closed mussels again; taken anew it starts closed
    const backed = await page.evaluate(() => {
      const T = window.__crack, { A, M, K, rb } = T, o = {}; M.consumeHeld();
      const alone = (x) => Math.min(...M.spots.map((y) => (y === x ? Infinity : Math.hypot(y.x - x.x, y.z - x.z)))); // (a neighbour in the look ray would be aimed at instead of the old spot)
      const s = M.spots.filter((x) => !x.gone && x !== T.deep && rb.waterYAt(x.x, x.z) - x.y > 1.3 && rb.deckAt(x.x, x.z) === null).sort((a, b) => alone(b) - alone(a))[0]; o.alone = alone(s), q = rb.riverAt(s.x, s.z);
      T.swimAt(s.x - q.nz * 0.75, s.z + q.nx * 0.75, true, T.top(s)); o.took = M.take(s); A.testMode.draw(); const b = T.beside(s); T.hold(b, 4); // (a drawn frame: the scene's matrix update places the old spot's E box; the lazy test page draws by hand)
      const f = A.focus().focused; o.strikeFocus = !!f?.strike; if (f?.strike) A.use(f); T.hold(b, 30, K.gap / 20); o.one = T.shell();
      T.hold(T.top(s), 4); o.back = T.focus(); const g = A.focus().focused; if (g?.name === 'blåmusslan') A.use(g); T.hold(T.top(s), 3);
      o.after = { held: !!A.heldItem(), gone: s.gone, state: M.state() }; o.again = M.take(s); o.fresh = T.shell();
      return o;
    });
    check(backed.took && backed.strikeFocus && backed.one.hits === 1 && backed.back?.name === 'blåmusslan' && !backed.after.held && !backed.after.gone && backed.again && backed.fresh.hits === 0 && !backed.fresh.cracked && backed.fresh.closed,
      'a closed (half-knocked) mussel is still put back with E on its old spot; off the bed again it starts closed', backed);
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
