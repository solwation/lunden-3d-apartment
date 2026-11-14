// #1945: the blue mussels on the bed of Höje å in the real app: the bed's instanced mesh only for a swimmer, a dive to a mussel, the real
// E key on it (pointer lock), held in the hand, the knock target on the bed beside (#1950), put back, taken by a fish's hook (consumeHeld) and grown
// back; not reachable from the bank or from the surface over deep water. Saves result images in OUT.
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/musseltest.cjs GAME OUT     (MUSSEL_MONTH=1: the same under snow)
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8151', out = process.argv[3] || '/tmp/mussel1945';
const results = []; let pass = true;
const check = (ok, name, data) => { results.push({ ok: !!ok, name, data }); pass &&= !!ok; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' ' + JSON.stringify(data) : ''}`); };
(async () => {
  const browser = await kit.launch();
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => route.fulfill({
      path: path.join(process.env.THREE_DIR, new URL(route.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?shot&cloud=&month=${process.env.MUSSEL_MONTH || 6}&time=13&freeze&weather=clear&test=lazy&nosquirrels`, { waitUntil: 'commit' });
    page.on('console', (m) => { if (/Startup failed/.test(m.text())) { console.error(m.text()); process.exit(1); } if (/Shader Error|WebGLProgram/.test(m.text())) errors.push(m.text().slice(0, 300)); });
    await page.waitForFunction(() => window.__app?.player && window.__app?.mussels, null, { timeout: 600000, polling: 200 });
    await kit.skipNameDialog(page); fs.mkdirSync(out, { recursive: true });
    await page.evaluate(() => window.__app.showOverlay?.(true));
    if (await page.locator('#start-go').isVisible()) await page.locator('#start-go').click(); else await page.locator('#start-touch').click();
    const setup = await page.evaluate(async () => {
      const A = window.__app, p = A.player, M = A.mussels, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js');
      A.renderer.setAnimationLoop(null); // the test steps the real frame (A.step) itself
      A.touch.enabled = true; // (the game is "active" without a pointer lock; the E key is pressed under a real lock below)
      const idle = { drawn: M.mesh.count, visible: M.mesh.visible, spots: M.spots.length, targets: M.targets().length, calls: A.renderer.info.render.calls };
      const T = window.__mussel = { A, p, M, rb, fw, C,
        look: (x, y, z) => { const c = A.camera.position, dx = x - c.x, dz = z - c.z; A.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); A.camera.updateMatrixWorld(); },
        // a swimmer set at (x, z), dived or not, looking at `at`; the frame is stepped with the position held (the current would carry them off)
        swimAt: (x, z, dive, at) => {
          p.crouch = false; p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.crouch = dive;
          for (let i = 0; i < (dive ? 260 : 60); i++) { p.pos.set(x, fw.swimBedY(x, z), z); if (at) T.look(...at); A.step(1 / 60); }
          if (at) { T.look(...at); p.pos.set(x, fw.swimBedY(x, z), z); A.step(0.001); T.look(...at); A.step(0.001); }
        },
        hold: (at, n = 3) => { const { x, z } = p.pos; for (let i = 0; i < n; i++) { p.pos.set(x, fw.swimBedY(x, z), z); T.look(...at); A.step(0.001); } },
        top: (s) => [s.x, s.y + 0.02, s.z],
        focus: () => { const f = A.focus().focused; return f ? { kind: f.kind, name: f.name, verb: f.verb, blocked: !!f.blocked, mussel: f === M.target, item: !!f.item?.isMussel } : null; },
        eye: () => { const c = A.camera.position; return { overWater: c.y - rb.waterYAt(c.x, c.z), overBed: c.y - fw.swimBedY(c.x, c.z) }; },
        state: () => ({ ...M.state(), held: !!A.heldItem()?.isMussel, hi: A.ghosts.state().hi }),
      };
      // into the water once: the spots are worked out at the first swim
      const P = rb.riverPath; let best = null;
      for (let i = 1; i < P.length; i++) { const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < C.WALK.x0 + 30 || mx > C.WALK.x1 - 30 || rb.deckAt(mx, mz) !== null || !fw.swimWater(mx, mz)) continue; if (!best || l > best.l) best = { l, x: mx, z: mz }; }
      T.best = best; T.swimAt(best.x, best.z, false);
      const depth = (s) => rb.waterYAt(s.x, s.z) - s.y, dist = (s) => Math.hypot(s.x - best.x, s.z - best.z), open = M.spots.filter((s) => rb.deckAt(s.x, s.z) === null);
      // a deep mussel with a neighbour in its clump (for the picture), near the station; a shallow one anywhere
      T.deep = open.filter((s) => depth(s) > 1.3 && M.spots.some((o) => o !== s && o.clump === s.clump)).sort((a, b) => dist(a) - dist(b))[0];
      T.shallow = open.filter((s) => depth(s) < 0.8).sort((a, b) => depth(a) - depth(b))[0];
      if (!T.deep) return { fail: { swim: !!p.swim, spots: M.spots.length, state: M.state(), depths: open.map(depth).sort((a, b) => b - a).slice(0, 5) } };
      const q = rb.riverAt(T.deep.x, T.deep.z);
      return { idle, swim: T.state(), spots: M.spots.length, deep: { ...T.deep, depth: depth(T.deep), across: q.distance, width: q.width }, shallow: T.shallow && { ...T.shallow, depth: depth(T.shallow) },
        allInWater: M.spots.every((s) => fw.swimWater(s.x, s.z) && Math.abs(s.y - fw.swimBedY(s.x, s.z)) < 1e-6), reach: C.MUSSELS.reach };
    });
    console.log(JSON.stringify(setup, null, 1));
    check(!setup.idle.visible && setup.idle.drawn === 0 && setup.idle.spots === 0 && setup.idle.targets === 0, 'on land at the start: nothing placed, nothing drawn, no target', setup.idle);
    check(setup.spots > 150 && setup.allInWater && setup.swim.visible && setup.swim.drawn > 0 && setup.swim.drawn <= 64, 'the first swim places the bed (on the drawn bed, in open water) and draws only the mussels near', { spots: setup.spots, swim: setup.swim });

    // 1. from the bank and from the surface over deep water: out of reach
    const far = await page.evaluate(() => {
      const T = window.__mussel, { A, p, M, fw, deep, shallow } = T, o = {};
      const bank = fw.splashBank(deep.x, deep.z, deep.y); p.crouch = false; p.spawn(bank.x, bank.z, 0); p.pos.y = fw.surfaceY(bank.x, bank.z, p.pos.y); p.swim = null;
      for (let i = 0; i < 30; i++) A.step(1 / 60);
      T.look(...T.top(deep)); A.step(0.001); T.look(...T.top(deep)); A.step(0.001);
      o.bank = { swim: !!p.swim, focus: T.focus(), targets: M.targets().length, visible: M.mesh.visible, dist: A.camera.position.distanceTo({ x: deep.x, y: deep.y, z: deep.z }) };
      p.crouch = true; for (let i = 0; i < 40; i++) A.step(1 / 60); T.look(...T.top(deep)); A.step(0.001); T.look(...T.top(deep)); A.step(0.001);
      o.bankCrouched = { swim: !!p.swim, focus: T.focus(), targets: M.targets().length };
      T.swimAt(deep.x + 0.15, deep.z + 0.15, false, T.top(deep));
      o.surfaceDeep = { eye: T.eye(), focus: T.focus(), drawn: M.mesh.count, dist: A.camera.position.distanceTo({ x: deep.x, y: deep.y, z: deep.z }) };
      if (shallow) { T.swimAt(shallow.x + 0.1, shallow.z + 0.1, false, T.top(shallow)); o.surfaceShallow = { eye: T.eye(), focus: T.focus(), dist: A.camera.position.distanceTo({ x: shallow.x, y: shallow.y, z: shallow.z }) }; }
      return o;
    });
    check(!far.bank.swim && !far.bank.focus?.mussel && far.bank.targets === 0 && !far.bank.visible && !far.bankCrouched.focus?.mussel && far.bankCrouched.targets === 0, 'from the bank (standing and crouched): no mussel can be aimed at', far);
    check(far.surfaceDeep.eye.overWater > 0.05 && !far.surfaceDeep.focus?.mussel && far.surfaceDeep.drawn > 0 && far.surfaceDeep.dist > setup.reach, 'from the surface straight over a deep mussel: out of reach', far.surfaceDeep);
    if (far.surfaceShallow) check(far.surfaceShallow.focus?.mussel && far.surfaceShallow.dist < setup.reach, 'from the surface in the shallows: a mussel within an arm\'s length can be taken', far.surfaceShallow);

    // 2. dive to the deep mussel: in focus, the picture of the bed
    const dive = await page.evaluate(() => {
      const T = window.__mussel, { A, p, M, rb, deep } = T, q = rb.riverAt(deep.x, deep.z), ux = q.nz, uz = -q.nx; // (along the river)
      T.swimAt(deep.x - ux * 0.75, deep.z - uz * 0.75, true, T.top(deep));
      return { eye: T.eye(), diving: p.diving, focus: T.focus(), state: T.state(), dist: A.camera.position.distanceTo({ x: deep.x, y: deep.y, z: deep.z }), calls: A.renderer.info.render.calls, name: M.mesh.name };
    });
    check(dive.diving && dive.eye.overWater < -1 && dive.focus?.mussel && dive.focus.kind === 'holdable' && dive.focus.verb === 'ta' && dive.focus.name === 'en blåmussla' && !dive.focus.blocked && dive.dist < setup.reach,
      'a diver at the bed has the mussel in focus ("ta en blåmussla")', dive);
    await kit.shot(page, path.join(out, 'musslor-pa-botten.png'));
    await page.evaluate(() => { const T = window.__mussel; T.hold(T.top(T.deep)); });

    // 3. the real E key takes it
    await page.evaluate(() => { window.__app.activeMode = 'mouse'; document.getElementById('game-canvas').requestPointerLock(); });
    await page.waitForFunction(() => !!document.pointerLockElement, null, { polling: 100, timeout: 10000 });
    await page.keyboard.press('KeyE');
    const took = await page.evaluate(() => { const T = window.__mussel, { A, M, deep } = T, it = A.heldItem(); T.hold(T.top(deep));
      const w = M.heldPosition(); return { state: T.state(), isMussel: !!it?.isMussel, name: it?.name, gone: deep.gone, inCamera: it?.model.parent === A.camera, visible: it?.model.visible, hand: w && A.camera.position.distanceTo(w), focus: T.focus(), outdoorPlace: it?.outdoorPlace }; });
    check(took.isMussel && took.state.held && took.gone && took.inCamera && took.visible && took.state.loose === 1 && took.state.out === 1 && took.hand > 0.2 && took.hand < 0.6 && took.state.hi === 'mussel',
      'E takes the mussel: held in the hand (a child of the camera), gone from the bed, others see the mussel category', took);
    await page.evaluate(() => { const T = window.__mussel, { M, deep } = T, o = M.spots.find((s) => s !== deep && s.clump === deep.clump && !s.gone) ?? deep; T.hold(T.top(o), 4); });
    await kit.shot(page, path.join(out, 'mussla-i-handen.png'));

    // 4. the bed beside: a diver's closed mussel is knocked there, not put down (#1950; tools/musselcracktest.cjs covers the knocks and
    // putting the cracked one down); its old spot is where it can be put back
    const put = await page.evaluate(() => { const T = window.__mussel, { deep, rb, fw } = T, q = rb.riverAt(deep.x, deep.z), x = deep.x + q.nz * 0.1 + q.nx * 0.45, z = deep.z - q.nx * 0.1 + q.nz * 0.45;
      T.spotB = [x, fw.swimBedY(x, z), z]; T.hold(T.spotB, 4); return { focus: T.focus(), cracked: T.M.held?.cracked, at: T.spotB }; });
    check(put.focus?.kind === 'holdable' && put.focus.verb === 'slå' && put.focus.name === 'musslan mot botten' && !put.focus.blocked && put.cracked === false, 'holding it (closed), the bed beside is where it is knocked ("slå musslan mot botten")', put);
    const again = await page.evaluate(() => { const T = window.__mussel, { A, deep } = T, held = !!A.heldItem()?.isMussel; T.hold(T.top(deep), 4); return { held, focus: T.focus(), gone: deep.gone }; });
    check(again.held && again.focus?.name === 'blåmusslan' && again.gone, 'its old spot is where it can be put back', again);
    await page.keyboard.press('KeyE');
    const back = await page.evaluate(() => { const T = window.__mussel, { A, deep } = T; T.hold(T.top(deep), 3); return { held: !!A.heldItem(), state: T.state(), gone: deep.gone, focus: T.focus() }; });
    check(!back.held && !back.gone && back.state.loose === 0 && back.state.out === 0 && back.focus?.mussel, 'put back: it is one of the bed\'s mussels again', back);

    // 5. taken and eaten out of the hand (#1946's hook), then it grows back once the diver is away
    await page.keyboard.press('KeyE');
    const regrow = await page.evaluate(() => {
      const T = window.__mussel, { A, p, M, deep, fw, best } = T, o = { held: !!M.held, heldPos: M.heldPosition()?.toArray() };
      o.consumed = M.consumeHeld(); o.after = { held: !!A.heldItem(), state: T.state(), gone: deep.gone, again: M.consumeHeld() };
      M.update(500); o.near = { gone: deep.gone, t: deep.t }; // the time is up, but the diver is still beside it
      const bank = fw.splashBank(deep.x, deep.z, deep.y); p.crouch = false; p.spawn(bank.x, bank.z, 0); p.pos.y = fw.surfaceY(bank.x, bank.z, p.pos.y); p.swim = null;
      for (let i = 0; i < 5; i++) A.step(1 / 60);
      o.away = { gone: deep.gone, state: T.state(), swim: !!p.swim };
      return o;
    });
    check(regrow.held && regrow.heldPos && regrow.consumed && !regrow.after.held && regrow.after.gone && !regrow.after.again && regrow.after.state.loose === 0, 'consumeHeld takes the mussel out of the hand (once)', regrow);
    check(regrow.near.gone && !regrow.away.gone && regrow.away.state.out === 0 && !regrow.away.state.visible, 'it grows back, but not while the diver is beside its spot; out of the water nothing is drawn', regrow);

    // 6. tidy / keep rules and the pool
    const rules = await page.evaluate(async () => {
      const T = window.__mussel, { A, M, deep } = T, o = {};
      T.swimAt(deep.x - 0.6, deep.z, true, T.top(deep));
      const near = M.drawn.slice(0, M.mesh.count).filter((s) => !s.gone).slice(0, 4); o.near = near.length;
      const taken = []; for (const s of near) { if (!M.take(s)) break; const it = A.heldItem(); taken.push(it); it.placeAt({ x: s.x, y: s.y + 0.3, z: s.z }); }
      o.taken = taken.length; o.loose = M.items.filter((x) => !x.broken).length; o.pool = M.items.length; o.out = M.field.out.length;
      const it = M.items.find((x) => !x.broken);
      o.flags = { isMussel: it.isMussel, outdoorPlace: it.outdoorPlace, nut: !!it.isSquirrelNut, fish: !!it.isCaughtFish };
      o.keep = JSON.stringify(A.keepWorld?.() ?? {}).includes('blåmussla');
      for (const x of M.items) if (x.placed) x.goHome(); // what a home reset does to placed holdables
      o.reset = { loose: M.items.filter((x) => !x.broken).length, out: M.field.out.length };
      return o;
    });
    check(rules.taken === Math.min(rules.near, 4) && rules.loose <= rules.pool && rules.flags.isMussel && rules.flags.outdoorPlace && !rules.keep && rules.reset.loose === 0,
      'at most the pool is out of the bed at once; a mussel is never saved with the home; a reset sends the loose ones back to the river', rules);
    // 7. from the bank: the water hides the bed and the mussels, the bank is grass down to the water line
    const bankView = await page.evaluate(() => { const T = window.__mussel, { A, p, M, fw, rb, deep } = T, bank = fw.splashBank(deep.x, deep.z, deep.y);
      p.crouch = false; p.spawn(bank.x, bank.z, 0); p.pos.y = fw.surfaceY(bank.x, bank.z, p.pos.y); p.swim = null; for (let i = 0; i < 20; i++) A.step(1 / 60);
      const q = rb.riverAt(deep.x, deep.z); T.look(q.x + q.nz * 6, rb.waterYAt(q.x, q.z), q.z - q.nx * 6); A.step(0.001); T.look(q.x + q.nz * 6, rb.waterYAt(q.x, q.z), q.z - q.nx * 6);
      const t = A.scene.getObjectByName('site-terrain'), mud = t.geometry.attributes.bedMud; let n = 0; for (let i = 0; i < mud.count; i++) if (mud.getX(i) > 0) n++;
      return { swim: !!p.swim, visible: M.mesh.visible, mudVertices: n, vertices: mud.count, bytes: mud.array.byteLength, material: t.material.name }; });
    check(!bankView.swim && !bankView.visible && bankView.mudVertices > 500 && bankView.mudVertices < bankView.vertices / 4 && bankView.material === 'seasonal-grass', 'the bed\'s mud is a byte per terrain vertex on the terrain\'s own grass material; from the bank nothing of the mussels is drawn', bankView);
    await kit.shot(page, path.join(out, 'an-fran-stranden.png'));
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
