// #1767: the outdoor cats in the real scene. PLAYWRIGHT_MODULE=… [CHROME_PATH=…] node tools/outdoorcatstest.cjs GAME OUT
//   (1) every route point lies on dry, walkable ground (not road, not water, no drop), level with the ground the visitor stands on
//   (2) the cats move along their loops with the (test) clock, standing on the ground
//   (3) walking up: the cat stops, sits and becomes the ordinary cat; it can be petted (purring) and carried
//   (4) put down outdoors and left: it turns back into the roaming cat and walks home to its loop
//   (5) rain and the snow months: hidden; clear summer weather brings them back
//   (6) draw calls near a cat (full / merged / none) and pictures of both zones
// Deterministic: the cats' clock (`outdoorCats.now`) is the test's own.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [base = 'http://localhost:8194', out = '/tmp/outdoorcats'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(data)}`); if (!ok) failed++; };
(async () => {
  const browser = await kit.launch(); const errors = [];
  try {
    const { page } = await kit.open(browser, `${base}/?time=12&month=7&weather=clear&freeze&cloud=`, { timeout: 900000 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => window.__app?.outdoorCats, null, { timeout: 900000 });
    await kit.skipNameDialog(page);
    await page.evaluate(async () => {
      const a = __app, O = a.outdoorCats; a.renderer.setAnimationLoop(null); a.showOverlay(false);
      const [roads, river, route, cfg] = await Promise.all(['/src/roads.js', '/src/riverbridge.js', '/src/outdoorcatroute.js', '/src/config.js'].map((m) => import(m)));
      window.T = { a, O, roads, river, route, cfg, clock: 1793491200 + 5000,
        run(n, dt = 0.1) { for (let i = 0; i < n; i++) { T.clock += dt; a.step(dt); } },
        stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
        look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
        calls() { a.renderer.info.reset(); a.renderer.render(a.scene, a.camera); return a.renderer.info.render.calls; },
        cat(name) { return O.cats.find((c) => c.name === name); } };
      O.now = () => T.clock;
      O.cats.forEach((c) => { c.st = 'route'; O.place(c, O.scheduled(c)); c.alpha = 1; });
    });

    // (1) the routes
    const routes = await page.evaluate(() => {
      const { O, roads, river, route, cfg, a } = T, bad = [];
      let n = 0;
      for (const c of O.cats) {
        const pts = route.routeSamples(c.spec.route, 0.5);
        let prev = null;
        for (const [x, z] of pts) {
          n++;
          const g = O.ground(x, z), feet = a.player.groundAt(x, z, g + 0.5), water = river.waterYAt(x, z);
          const why = [!Number.isFinite(g) && 'ground', roads.onRoad(x, z, 0.8) && 'road', !(g > water + 0.3) && 'water',
            Math.abs(feet - g) > 0.15 && `feet ${feet?.toFixed?.(2)} vs ${g.toFixed(2)}`, prev != null && Math.abs(g - prev) > cfg.OUTDOOR_CATS.maxStep && 'drop'].filter(Boolean);
          if (why.length) bad.push([c.name, +x.toFixed(1), +z.toFixed(1), why.join(',')]);
          prev = g;
        }
      }
      return { samples: n, bad: bad.slice(0, 12), nbad: bad.length };
    });
    check(routes.nbad === 0, 'every route sample is on dry, walkable ground level with the visitor’s ground, off the roads', routes);

    // (2) movement along the loops
    const moving = await page.evaluate(() => {
      const { O } = T, res = [];
      for (const c of O.cats) {
        const pts = T.route.routeSamples(c.spec.route, 0.5), cx = pts.reduce((n, p) => n + p[0], 0) / pts.length, cz = pts.reduce((n, p) => n + p[1], 0) / pts.length;
        let sx = cx, sz = cz; // near enough to be drawn, never near enough to be noticed: 8 m clear of the loop, in the zone
        for (let r = 4; r < 30; r++) { let ok = null; for (let k = 0; k < 16 && !ok; k++) { const x = cx + Math.cos(k * 0.39) * r, z = cz + Math.sin(k * 0.39) * r; if (pts.every(([px, pz]) => Math.hypot(px - x, pz - z) > 8)) ok = [x, z]; } if (ok) { [sx, sz] = ok; break; } }
        T.stand(sx, sz);
        const s0 = O.scheduled(c); let walked = 0, px = c.x, pz = c.z, onGround = true;
        for (let i = 0; i < 300; i++) { T.run(1, 0.5); walked += Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; if (c.group.visible && Math.abs(c.group.position.y - O.ground(c.x, c.z)) > 0.01) onGround = false; }
        res.push({ name: c.name, walked: +walked.toFixed(1), onGround, st: c.st, lap: s0.lap });
      }
      return res;
    });
    check(moving.every((m) => m.walked > 5 && m.onGround && m.st === 'route'), 'each cat walks its loop on the ground over 150 s', moving);

    // pictures of the zones
    for (const [name, file, dx, dz] of [['Sotis', '1-innergarden.png', 4.2, 3.4], ['Kanel', '1b-innergarden-vaster.png', -4.2, 3.4], ['Findus', '2-parken-hoje-a.png', 4.5, 3], ['Smulan', '2b-parken-hoje-a.png', -4.5, 3]]) {
      const seen = await page.evaluate(({ name, dx, dz }) => {
        const { O, a } = T, c = T.cat(name);
        if (a.cat.visible) a.cat.hide();
        for (let i = 0; i < 400 && !O.scheduled(c).walking; i++) T.clock += 2; // catch it walking
        O.cats.forEach((q) => { q.st = 'route'; q.alpha = 1; }); // (a cat met during the walk-past checks may still be walking home)
        T.run(1, 0.05); T.stand(c.x + dx, c.z + dz); T.run(4, 0.05); T.look(c.x, c.group.position.y + 0.15, c.z);
        a.camera.zoom = 1.8; a.camera.updateProjectionMatrix(); T.run(1, 0.02); T.look(c.x, c.group.position.y + 0.15, c.z);
        return { st: c.st, visible: c.group.visible, full: c.puppet.object.visible, d: +Math.hypot(a.camera.position.x - c.x, a.camera.position.z - c.z).toFixed(1) };
      }, { name, dx, dz });
      check(seen.visible && seen.st === 'route', `picture: ${name} in its zone`, seen);
      await kit.shot(page, `${out}/${file}`, { frames: 2 });
      await page.evaluate(() => { T.a.camera.zoom = 1; T.a.camera.updateProjectionMatrix(); });
    }

    // (3) walk up, it sits and becomes the ordinary cat; pet and carry
    const meet = await page.evaluate(() => {
      const { O, a } = T, c = T.cat('Sotis'), k = a.cat;
      if (k.visible) k.hide();
      T.stand(c.x + 6, c.z); T.run(2, 0.05);
      const before = c.st;
      T.stand(c.x + 2.2, c.z + 0.6); T.look(c.x, 0.2, c.z);
      let i = 0; for (; i < 60 && c.st !== 'bound'; i++) { T.run(1, 0.05); }
      const r = { before, st: c.st, steps: i, catVisible: k.visible, outdoorCat: k.outdoorCat, name: k.catName, breed: k.breed.name, coat: k.variant.name, puppet: c.group.visible,
        options: k.interact.options().map((o) => o.id), dy: +(k.object.position.y - O.ground(k.object.position.x, k.object.position.z)).toFixed(3) };
      k.interact.options().find((o) => o.id === 'pet').run(); T.run(10, 0.05);
      r.petting = k.petting;
      T.look(k.object.position.x, 0.25, k.object.position.z);
      return r;
    });
    check(meet.st === 'bound' && meet.catVisible && meet.outdoorCat === 'Sotis' && !meet.puppet && meet.dy === 0 && meet.petting && meet.options.includes('take'),
      'walking up: it sits, becomes the ordinary cat (Sotis, svart huskatt) on the ground, and purrs when petted; carrying is offered', meet);
    await kit.shot(page, `${out}/3-klappas.png`, { frames: 2 });
    const carry = await page.evaluate(() => {
      const { a } = T, k = a.cat;
      k.stopPetting(); k.interact.options().find((o) => o.id === 'take').run(); T.run(5, 0.05);
      return { held: k.held, heldItem: a.heldItem() === a.miele };
    });
    check(carry.held && carry.heldItem, 'it can be taken up and carried', carry);
    await kit.shot(page, `${out}/4-bars.png`, { frames: 2 });

    // (4) put down a few metres away on the lawn, walk off: it walks home to its loop
    const home = await page.evaluate(() => {
      const { O, a } = T, c = T.cat('Sotis'), k = a.cat;
      T.stand(-2, 22.5, Math.PI); T.run(3, 0.05);
      a.miele.putBack(); T.run(40, 0.05);
      const down = { held: k.held, visible: k.visible, outdoor: k.outdoor, at: [+k.object.position.x.toFixed(1), +k.object.position.z.toFixed(1)] };
      T.stand(-18, 27); // away (> release)
      T.run(4, 0.05);
      const st1 = c.st, kv = k.visible, from = [c.x, c.z];
      let i = 0, path = 0, px = c.x, pz = c.z, offGround = 0;
      for (; i < 600 && c.st !== 'route'; i++) { T.run(1, 0.1); path += Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; if (Math.abs(c.group.position.y - O.ground(c.x, c.z)) > 0.01 && c.group.visible) offGround++; }
      const s = O.scheduled(c);
      return { down, afterWalkAway: st1, mainCatHidden: !kv, from: from.map((v) => +v.toFixed(1)), st: c.st, seconds: +(i * 0.1).toFixed(1), path: +path.toFixed(1), offGround,
        gap: +Math.hypot(c.x - s.x, c.z - s.z).toFixed(2) };
    });
    check(home.down.visible && home.down.outdoor && !home.down.held && home.afterWalkAway === 'home' && home.mainCatHidden && home.st === 'route' && home.gap < 0.3 && home.offGround === 0,
      'put down outdoors and left: it turns back into the roaming cat and walks home to its loop', home);

    // (5) rain and snow months
    const weather = await page.evaluate(async () => {
      const { O, a } = T, c = T.cat('Sotis');
      T.stand(c.x + 5, c.z + 3); T.run(30, 0.1);
      const clear = c.group.visible;
      a.weather.force = 'rain'; T.run(30, 0.1);
      const rain = { visible: c.group.visible, alpha: c.alpha, rain: +a.weather.rain.toFixed(2) };
      a.weather.force = 'clear'; T.run(30, 0.1);
      const after = c.group.visible;
      a.day.month = 1; T.run(30, 0.1);
      const snow = O.cats.map((q) => q.group.visible).some(Boolean);
      a.day.month = 7; T.run(30, 0.1);
      return { clear, rain, after, snowAnyVisible: snow, summer: c.group.visible };
    });
    check(weather.clear && !weather.rain.visible && weather.after && !weather.snowAnyVisible && weather.summer, 'hidden in rain and in the snow months, back in clear summer weather', weather);

    // (6) draw calls near a cat: full animated cat, merged far mesh, none
    const calls = await page.evaluate(() => {
      const { O, a } = T, c = T.cat('Findus');
      // the same view with and without the cat: what this cat costs
      const at = (d) => { T.stand(c.x + d, c.z + 0.5); T.run(2, 0.05); T.look(c.x, c.group.position.y + 0.2, c.z); c.st = 'route'; T.run(1, 0.02); c.st = 'route'; T.look(c.x, c.group.position.y + 0.2, c.z);
        const r = { calls: T.calls(), full: c.puppet.object.visible, drawn: c.group.visible }; c.group.visible = false; r.without = T.calls(); c.group.visible = r.drawn; r.cost = r.calls - r.without; return r; };
      return { near: at(5), far: at(15) };
    });
    check(calls.near.full && calls.far.drawn && !calls.far.full && calls.near.cost > 0 && calls.near.cost <= 30 && calls.far.cost >= 1 && calls.far.cost <= 2,
      'draw calls in the same view: full cat 1–30, merged far cat 1–2 (it is drawn, not culled)', calls);
    check(errors.length === 0, 'no page errors', errors.slice(0, 5));
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
