// #1767: the outdoor cats in the real scene. PLAYWRIGHT_MODULE=… [CHROME_PATH=…] node tools/outdoorcatstest.cjs GAME OUT
//   (1) every route point lies on dry, walkable ground (not road, not water, no drop), level with the ground the visitor stands on
//   (2) the cats move along their loops with the (test) clock, standing on the ground
//   (3) walking up: the cat stops, sits and becomes the ordinary cat; it can be petted (purring) and carried
//   (4) put down outdoors and left: it turns back into the roaming cat and walks home to its loop
//   (5) rain and the snow months: hidden; clear summer weather brings them back
//   (6) draw calls near a cat (full / merged / none) and pictures of both zones
//   #1772 brains: (7) a cat climbs up into a tree, sits on a branch and comes down; (8) one chases a butterfly; (9) the social cat
//   walks up to a visitor standing off its loop and becomes the ordinary cat
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
        for (let i = 0; i < 300; i++) { T.run(1, 0.5); walked += Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; if (c.group.visible && Math.abs(c.group.position.y - c.h - O.ground(c.x, c.z)) > 0.01) onGround = false; }
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
      check(seen.visible && ['route', 'seek', 'flee'].includes(seen.st), `picture: ${name} in its zone`, seen); // (#1772: the social one gets up and comes, the shy one moves off)
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
      for (; i < 600 && c.st !== 'route'; i++) { T.run(1, 0.1); path += Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; if (Math.abs(c.group.position.y - c.h - O.ground(c.x, c.z)) > 0.01 && c.group.visible) offGround++; }
      const s = c.schedulePose(true);
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
        const r = { calls: T.calls(), full: c.puppet.object.visible, drawn: c.group.visible, st: c.st, h: +c.h.toFixed(2), act: c.activity, d: +Math.hypot(c.x - T.a.camera.position.x, c.z - T.a.camera.position.z).toFixed(1) }; c.group.visible = false; r.without = T.calls(); c.group.visible = r.drawn; r.cost = r.calls - r.without; return r; };
      return { near: at(5), far: at(15) };
    });
    check(calls.near.full && calls.far.drawn && !calls.far.full && calls.near.cost > 0 && calls.near.cost <= 30 && calls.far.cost >= 1 && calls.far.cost <= 2,
      'draw calls in the same view: full cat 1–30, merged far cat 1–2 (it is drawn, not culled)', calls);
    // #1772 (7)-(9): the brains. Find a stop where a cat does the thing, set the clock there and watch.
    await page.evaluate(() => {
      T.zoom = (z) => { T.a.camera.zoom = z; T.a.camera.updateProjectionMatrix(); };
      T.findStop = (c, kind, from = 0) => { const s0 = c.scheduled(T.clock), m0 = c.stopOf(s0.lap, s0.leg) + 1 + from; for (let m = m0; m < m0 + 400; m++) if (c.outingAt(m).kind === kind) return m; return null; };
      T.at = (c, m, e) => { T.clock = c.stop(m).start + e; c.resume(); c.alpha = 1; T.run(1, 0.05); };
      T.seg = (c, m, type) => c.outingAt(m).segs.find((q) => q.type === type);
      T.away = (c, x, z, r, a0 = 0) => { for (let k = 0; k < 24; k++) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) / 24 * 6.283, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (T.O.clearWay(x, z, px, pz) && T.O.env.free(px, pz)) return [px, pz]; } return [x + r, z]; };
      T.byKind = ['playful', 'lazy'].map((k) => T.O.cats.find((q) => q.spec.kind === k)); // (not the social one, which would come over to the camera, nor the shy one)
      if (T.a.cat.visible) T.a.cat.hide();
    });
    const climb = await page.evaluate(() => {
      const { O } = T; let c = null, m = null;
      for (const q of T.byKind) { const mm = T.findStop(q, 'climb'); if (mm != null) { c = q; m = mm; break; } }
      if (!c) return { found: false };
      const o = c.outingAt(m), up = T.seg(c, m, 'up'), br = T.seg(c, m, 'branch'), dn = T.seg(c, m, 'down');
      T.at(c, m, up.t0 - 2);
      const tr = br.trunk, P = o.P, [sx, sz] = T.away(c, tr.x, tr.z, 5.5, Math.atan2(tr.z - P.z, tr.x - P.x)); T.stand(sx, sz); // (beyond the tree, so its walk there does not come near the camera)
      const trace = []; let maxH = 0, upPitch = 0, dnPitch = 0;
      for (let e = up.t0 - 2; e < br.t0 + 2; e += 0.1) { T.run(1, 0.1); maxH = Math.max(maxH, c.h); if (c.activity === 'climb') upPitch = Math.min(upPitch, c.pitch); }
      const onBranch = { st: c.st, h: +c.h.toFixed(2), y: +(c.group.position.y - O.ground(c.x, c.z)).toFixed(2), activity: c.activity, drawn: c.group.visible, full: c.puppet.object.visible,
        fromTrunk: +Math.hypot(c.x - br.trunk.x, c.z - br.trunk.z).toFixed(2), hb: +br.hb.toFixed(2) };
      // the picture from the branch's side (it does not react up there), zoomed in
      const ba = Math.atan2(c.z - br.trunk.z, c.x - br.trunk.x) + 0.45, [qx, qz] = T.away(c, br.trunk.x, br.trunk.z, 4.5, ba); T.stand(qx, qz); T.run(1, 0.05);
      T.zoom(1.6); T.look(c.x, c.group.position.y + 0.1, c.z);
      return { found: true, name: c.name, kind: c.spec.kind, m, onBranch, maxH: +maxH.toFixed(2), upPitch: +upPitch.toFixed(2), dn: { t0: dn.t0, t1: dn.t1 }, end: o.R };
    });
    check(climb.found && climb.onBranch.st === 'route' && climb.onBranch.h > 1.2 && Math.abs(climb.onBranch.y - climb.onBranch.hb) < 0.05 && climb.onBranch.drawn && climb.onBranch.full && climb.upPitch < -1,
      'a cat climbs up the trunk (nose up) and sits on a branch in the tree', climb);
    await kit.shot(page, `${out}/5-i-tradet.png`, { frames: 2 });
    await page.evaluate(() => T.zoom(1));
    const down = await page.evaluate(({ m, name }) => {
      const { O } = T, c = T.cat(name);
      const dn = T.seg(c, m, 'down'); let pitch = 0, n = 0;
      T.look(c.x, c.group.position.y, c.z);
      while (T.clock < c.stop(m).start + dn.t1 + 3 && n++ < 2000) { T.run(1, 0.1); if (c.activity === 'climb') pitch = Math.max(pitch, c.pitch); }
      return { h: +c.h.toFixed(3), y: +(c.group.position.y - O.ground(c.x, c.z)).toFixed(3), st: c.st, downPitch: +pitch.toFixed(2), activity: c.activity };
    }, { m: climb.m, name: climb.name });
    check(down.h === 0 && Math.abs(down.y) < 0.01 && down.downPitch > 1, 'and climbs down again (head first) to the ground', down);

    const bf = await page.evaluate(() => {
      const { O } = T; let c = null, m = null;
      for (const q of T.byKind) { const mm = T.findStop(q, 'butterfly'); if (mm != null) { c = q; m = mm; break; } }
      if (!c) return { found: false };
      const ch = T.seg(c, m, 'chase'); T.at(c, m, ch.t0 + 3);
      const [sx, sz] = T.away(c, ch.a.x, ch.a.z, 5); T.stand(sx, sz);
      let seen = 0, dmax = 0, frames = 0, hops = 0, moved = 0, px = c.x, pz = c.z;
      for (let i = 0; i < 80; i++) { T.run(1, 0.1); frames++; if (c.bfMesh.visible) seen++; if (c.bf) dmax = Math.max(dmax, Math.hypot(c.bf.x - c.x, c.bf.z - c.z)); if (c.hop > 0.02) hops++; moved += Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; }
      for (let i = 0; i < 40 && !(c.bf && c.bf.y > 0.5 && c.hop > 0.03); i++) T.run(1, 0.05); // (a leap at it, for the picture)
      T.zoom(2.8); T.look((c.x + c.bf.x) / 2, c.group.position.y + 0.3, (c.z + c.bf.z) / 2);
      return { found: true, name: c.name, kind: c.spec.kind, m, activity: c.activity, seen, frames, dmax: +dmax.toFixed(2), hops, moved: +moved.toFixed(1), bfY: +(c.bfMesh.position.y - O.ground(c.bf.x, c.bf.z)).toFixed(2) };
    });
    check(bf.found && bf.activity === 'chase' && bf.seen === bf.frames && bf.dmax < 3 && bf.moved > 3 && bf.hops > 0 && bf.bfY > 0.3,
      'a cat chases a butterfly that flutters close by, with leaps', bf);
    await kit.shot(page, `${out}/6-fjaril.png`, { frames: 2 });
    await page.evaluate(() => T.zoom(1));

    const social = await page.evaluate(() => {
      const { O, a } = T, c = O.cats.find((q) => q.spec.kind === 'social');
      if (a.cat.visible) a.cat.hide();
      O.cats.forEach((q) => { if (q !== c) q.group.visible = false; });
      let m = T.findStop(c, 'seek'); if (m == null) return { found: false };
      T.at(c, m, 2);
      const [sx, sz] = T.away(c, c.x, c.z, 9.5); T.stand(sx, sz); T.look(c.x, 0.3, c.z);
      const d0 = Math.hypot(sx - c.x, sz - c.z), states = []; let shot = null;
      for (let i = 0; i < 400 && c.st !== 'bound'; i++) {
        T.run(1, 0.05); if (states[states.length - 1] !== c.st) states.push(c.st);
        if (!shot && c.st === 'seek' && Math.hypot(sx - c.x, sz - c.z) < 6) { shot = +Math.hypot(sx - c.x, sz - c.z).toFixed(1); break; }
      }
      T.look(c.x, c.group.position.y + 0.2, c.z);
      return { found: true, name: c.name, m, d0: +d0.toFixed(1), states, shot };
    });
    check(social.found && social.states.includes('seek') && social.shot != null, 'the social cat gets up and walks over to a visitor standing 9.5 m away', social);
    await kit.shot(page, `${out}/7-social-kommer.png`, { frames: 2 });
    const met = await page.evaluate(() => {
      const { a } = T, c = T.O.cats.find((q) => q.spec.kind === 'social'), states = [c.st];
      for (let i = 0; i < 400 && c.st !== 'bound'; i++) { T.run(1, 0.05); if (states[states.length - 1] !== c.st) states.push(c.st); }
      const k = a.cat.object.position, eye = a.camera.position;
      T.look(k.x, k.y + 0.2, k.z);
      return { states, st: c.st, catVisible: a.cat.visible, name: a.cat.catName, d: +Math.hypot(k.x - eye.x, k.z - eye.z).toFixed(2) };
    });
    check(met.st === 'bound' && met.catVisible && met.d < 3.2, 'it comes right up to the visitor and becomes the ordinary cat (can be petted)', met);
    await kit.shot(page, `${out}/8-social-framme.png`, { frames: 2 });
    check(errors.length === 0, 'no page errors', errors.slice(0, 5));
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
