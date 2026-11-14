// #1946: feeding the river fish with a cracked blue mussel and scaring them, in the real app: a still diver with a closed mussel is ignored,
// with a cracked one a fish leaves its path, comes to the hand and takes it (mussel gone, hearts, score, bestiary); a stroke during the
// approach makes the fish flee, and stopping lets a new one come; a swimmer at the surface is fed too; afterwards every fish is drawn on its
// shared place again. The swimmer is really carried by the current during the feedings. Saves result images in OUT.
//   THREE_DIR=/path/to/three tools/browsertest.sh node tools/fishfeedtest.cjs GAME OUT
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8154', out = process.argv[3] || '/tmp/fishfeed1946';
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
    await page.waitForFunction(() => window.__app?.player && window.__app?.mussels && window.__app?.riverFish, null, { timeout: 600000, polling: 200 });
    await kit.skipNameDialog(page); fs.mkdirSync(out, { recursive: true });
    await page.evaluate(() => window.__app.showOverlay?.(true));
    if (await page.locator('#start-go').isVisible()) await page.locator('#start-go').click(); else await page.locator('#start-touch').click();
    const setup = await page.evaluate(async () => {
      const A = window.__app, p = A.player, M = A.mussels, RF = A.riverFish, rb = await import('/src/riverbridge.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js'), sw = await import('/src/riverfishswim.js');
      A.renderer.setAnimationLoop(null); A.touch.enabled = true;
      if (A.sharkHunt) A.sharkHunt.random = () => 1; // (no shark attack during the test)
      const T = window.__feed = { A, p, M, RF, rb, fw, C, sw, dt: 1 / 30,
        look: (x, y, z) => { const c = A.camera.position, dx = x - c.x, dz = z - c.z; A.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); A.camera.updateMatrixWorld(); },
        // into the water at (x, z) looking downstream and a little down; dived or not. The current carries the swimmer from here on.
        swimAt: (x, z, dive) => { p.keys.clear(); p.crouch = false; p.spawn(x, z, 0); p.pos.set(x, fw.swimBedY(x, z), z); p.crouch = dive;
          for (let i = 0; i < (dive ? 100 : 20); i++) { p.pos.set(x, fw.swimBedY(x, z), z); T.ahead(); A.step(T.dt); } },
        ahead: (pitch = -0.12) => { const q = rb.riverAt(p.pos.x, p.pos.z); A.camera.rotation.set(pitch, Math.atan2(-q.nz, q.nx), 0, 'YXZ'); A.camera.updateMatrixWorld(); },
        run: (s, each) => { for (let t = 0; t < s; t += T.dt) { T.aim?.(); A.step(T.dt); if (each?.()) return true; } return false; },
        give: (cracked) => { const s = M.spots.filter((q) => !q.gone).sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0]; const ok = M.take(s); if (M.held) M.held.cracked = cracked; return ok; },
        feed: () => RF.state().feed,
        fish: (id) => RF.shown.find((f) => f.id === id),
        drawnAt: (id) => { const f = T.fish(id); return f && { x: f.x + (f.off?.[0] ?? 0), y: f.y + (f.off?.[1] ?? 0), z: f.z + (f.off?.[2] ?? 0), mode: f.mode ?? null }; },
        dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
        eye: () => { const c = A.camera.position; return { overWater: c.y - rb.waterYAt(c.x, c.z) }; },
        // the shared place of every fish, straight from the pure functions (what the room, the rod and the other players use)
        sharedOk: () => RF.shown.every((f) => { const o = sw.fishAt(sw.fishSpec(f.id, f.born, RF.sync.seed), RF.sync.t, {}, RF.sync.seed); return Math.hypot(o.x - f.x, o.y - f.y, o.z - f.z) < 0.05; }), // (the clock runs on between the frame and this reading)
      };
      // a station mid-channel in open water (no deck), 12 m upstream of where a fish is now, well inside the walkable area
      const t = RF.sync.t, seed = RF.sync.seed, cand = [];
      for (let id = 0; id < C.RIVER_FISH.count; id++) { const o = sw.fishAt(sw.fishSpec(id, RF.sync.born(id), seed), t, {}, seed), q = rb.riverAt(o.x, o.z);
        for (const back of [10, 14, 6]) { const x = q.x - q.nz * back, z = q.z + q.nx * back, r = rb.riverAt(x, z);
          let clear = Math.hypot(r.x - x, r.z - z) < 0.5 && x > C.WALK.x0 + 40 && x < C.WALK.x1 - 40;
          for (let d = -4; clear && d <= 40; d += 2) { const ax = r.x + r.nz * d, az = r.z - r.nx * d; clear = rb.deckAt(ax, az) === null && fw.swimWater(ax, az); }
          if (clear) { cand.push({ id, x: r.x, z: r.z, depth: rb.waterYAt(r.x, r.z) - fw.swimBedY(r.x, r.z) }); break; } } }
      if (!cand.length) return { fail: 'no station' };
      T.st = cand.sort((a, b) => b.depth - a.depth)[0];
      T.swimAt(T.st.x, T.st.z, true);
      return { station: T.st, stations: cand.length, swim: !!p.swim, diving: p.diving, eye: T.eye(), spots: M.spots.length, cfg: C.RIVER_FISH.feed, score: C.SCORE.each.fishFeeds, feed: T.feed(), drawn: RF.fish.count };
    });
    console.log(JSON.stringify(setup, null, 1));
    check(setup.swim && setup.diving && setup.eye.overWater < -0.8 && setup.spots > 100 && setup.drawn > 0, 'a diver at the bed mid-channel, fish drawn', setup);

    // 1. a closed mussel: nobody comes, however still
    const closed = await page.evaluate(() => { const T = window.__feed, { p, M } = T, took = T.give(false); let lure = false; T.run(8, () => { lure ||= T.feed().lure !== null; });
      return { took, held: !!M.held, cracked: M.held?.cracked, moving: p.swim?.moving, lure, feed: T.feed(), sharedOk: T.sharedOk() }; });
    check(closed.took && closed.held && closed.cracked === false && !closed.lure && closed.feed.offsets === 0 && closed.feed.fed === 0 && closed.sharedOk, 'still with a CLOSED mussel for 8 s: no fish leaves its path', closed);

    // 2. cracked: a fish comes to the hand (the picture when it is close), takes it; hearts, score, bestiary
    const come = await page.evaluate(() => { const T = window.__feed, { A, p, M } = T; M.held.cracked = true; A.stats.fishFeeds = 0; T.s0 = A.totalScore(); T.x0 = p.pos.x; T.z0 = p.pos.z;
      let id = null, t = 0; const near = T.run(45, () => { t += T.dt; id = T.feed().lure ?? id; const f = id !== null && T.drawnAt(id), h = M.heldPosition(); return f && h && T.dist(f, h) < 0.75; });
      T.lured = id; const f = T.drawnAt(id), h = M.heldPosition(), q = T.fish(id);
      return { near, id, t, species: q?.species, mode: f?.mode, toHand: f && h && T.dist(f, h), fishY: f?.y, sharedY: q?.y, handY: h?.y, eye: T.eye(), held: !!M.held, drift: Math.hypot(p.pos.x - T.x0, p.pos.z - T.z0), sharedOk: T.sharedOk() }; });
    check(come.near && come.mode === 'lure' && come.held && come.fishY < come.sharedY - 0.2 && come.sharedOk, 'still with a CRACKED mussel: a fish leaves its path and comes down to the hand (the shared fish unchanged)', come);
    await kit.shot(page, path.join(out, 'fisk-kommer-till-handen.png'));
    const fed = await page.evaluate(() => { const T = window.__feed, { A, p, M } = T; let hearts = false, t = 0, at = null;
      const took = T.run(15, () => { t += T.dt; if (!M.held && !at) { const f = T.drawnAt(T.lured); at = { mode: f?.mode, toEye: f && T.dist(f, A.camera.position) }; } hearts ||= A.scene.children.some((o) => o.isPoints && o.visible && o.material.map && o.geometry.attributes.position.count === T.C.RIVER_FISH.feed.hearts); return !M.held && hearts; });
      return { took, t, at, hearts, held: !!M.held, heldItem: !!A.heldItem(), fed: A.stats.fishFeeds, score: A.totalScore() - T.s0, feed: T.feed(), loose: M.state().loose, drift: Math.hypot(p.pos.x - T.x0, p.pos.z - T.z0), swim: !!p.swim, moving: p.swim?.moving }; });
    check(fed.took && !fed.held && !fed.heldItem && fed.hearts && fed.fed === 1 && fed.score === setup.score && fed.feed.fed === 1 && fed.loose === 0 && fed.at?.mode === 'eat' && fed.drift > 1,
      'the fish takes the mussel from the hand of a diver carried by the current: mussel gone, hearts, +score, counted once', fed);
    await kit.shot(page, path.join(out, 'fisk-tar-musslan.png'));
    const home = await page.evaluate(() => { const T = window.__feed; const done = T.run(12, () => T.feed().offsets === 0); return { done, feed: T.feed(), sharedOk: T.sharedOk(), fish: T.fish(T.lured) }; });
    check(home.done && home.feed.offsets === 0 && !home.fish?.off && home.sharedOk, 'afterwards the fish is back on its shared path (no offset left)', home);

    // 3. a stroke during the approach: the fish flee; still again: a new one comes and is fed
    const flee = await page.evaluate(() => { const T = window.__feed, { A, p, M } = T, o = {};
      T.swimAt(p.pos.x, p.pos.z, true); o.took = T.give(true);
      let id = null; o.approach = T.run(45, () => { id = T.feed().lure ?? id; const f = id !== null && T.drawnAt(id), h = M.heldPosition(); return f && T.dist(f, h) < 1.3; });
      const f0 = T.drawnAt(id); o.id = id; o.d0 = T.dist(f0, A.camera.position);
      T.aim = () => { const f = T.drawnAt(id); if (f) T.look(f.x, f.y, f.z); }; // (keep looking at it: the stroke goes towards the fish)
      p.keys.add('KeyW'); T.run(0.3); return o; });
    await kit.shot(page, path.join(out, 'fisken-flyr.png'));
    Object.assign(flee, await page.evaluate(() => { const T = window.__feed, { A, p, M } = T, o = {}, id = T.feed().lure ?? A.riverFish.shown.find((f) => f.mode === 'flee')?.id;
      T.run(0.6); o.moving = p.swim?.moving;
      const f1 = T.drawnAt(id); o.d1 = T.dist(f1, A.camera.position); o.mode = f1.mode; o.lure = T.feed().lure; o.fleeing = A.riverFish.shown.filter((f) => f.mode === 'flee').length; o.held = !!M.held;
      const q = T.rb.riverAt(f1.x, f1.z); o.inChannel = Math.hypot(q.x - f1.x, q.z - f1.z) < q.width / 2;
      return o; }));
    check(flee.took && flee.approach && flee.moving && flee.mode === 'flee' && flee.lure === null && flee.d1 > flee.d0 + 1 && flee.held && flee.inChannel, 'a stroke during the approach: the fish turns and flees from the swimmer (the mussel stays in the hand)', flee);
    const retry = await page.evaluate(() => { const T = window.__feed, { A, p, M } = T, o = {};
      T.run(1.5); o.stillFleeing = T.feed().lure === null && !!M.held; p.keys.delete('KeyW'); T.aim = null; T.ahead();
      let t = 0; o.early = false; o.fed = T.run(60, () => { t += T.dt; if (t < T.C.RIVER_FISH.feed.wait - 0.3 && T.feed().lure !== null) o.early = true; return !M.held; });
      o.t = t; o.stats = A.stats.fishFeeds; o.home = T.run(14, () => T.feed().offsets === 0); o.feed = T.feed(); o.sharedOk = T.sharedOk();
      return o; });
    check(retry.stillFleeing && !retry.early && retry.fed && retry.stats === 2 && retry.home && retry.sharedOk, 'while stroking nobody comes; still again a fish comes after the wait and takes the mussel; then all are back on their paths', retry);

    // 4. at the surface (no dive): fed too; without a mussel a still swimmer is ignored
    const surface = await page.evaluate(() => { const T = window.__feed, { A, p, M } = T, o = {};
      T.swimAt(p.pos.x, p.pos.z, false); T.run(1.5); o.eye = T.eye(); o.diving = p.diving;
      let any = false; T.run(6, () => { any ||= T.feed().offsets > 0; }); o.ignored = !any;
      T.swimAt(p.pos.x, p.pos.z, true); T.run(3); o.took = T.give(true); p.crouch = false; T.run(2.5); o.eye2 = T.eye(); o.heldUp = !!M.held;
      T.aim = () => T.ahead(-0.3);
      let id = null; o.close = T.run(60, () => { id = T.feed().lure ?? id; const f = id !== null && T.drawnAt(id), h = M.heldPosition(); return f && h && Math.hypot(f.x - h.x, f.z - h.z) < 0.45; });
      o.id = id; return o; });
    await kit.shot(page, path.join(out, 'fisk-vid-ytan.png'));
    const surfaceFed = await page.evaluate(() => { const T = window.__feed, { A, M } = T, o = {}; o.fed = T.run(20, () => !M.held); o.stats = A.stats.fishFeeds; T.aim = null; o.home = T.run(14, () => T.feed().offsets === 0); o.sharedOk = T.sharedOk(); return o; });
    check(surface.ignored && surface.took && surface.heldUp && surface.eye2.overWater > 0.02 && surface.close && surfaceFed.fed && surfaceFed.stats === 3 && surfaceFed.home && surfaceFed.sharedOk,
      'a swimmer at the surface: ignored without a mussel, fed with a cracked one', { surface, surfaceFed });
    check(!errors.length, 'no page errors', errors.slice(0, 5));
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ pass, results }, null, 1));
  } finally { await browser.close(); }
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
