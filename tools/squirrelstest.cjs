// #1672: the squirrels in the real scene. node tools/squirrelstest.cjs GAME OUT
//   (1) a squirrel sits in a crown, comes down and stands on the ground (pictures)
//   (2) a nut lies within reach, E on it takes it into the hand (the ordinary hold system)
//   (3) crouching still with the nut: a squirrel creeps up, takes it; score + hearts; it runs up a tree with the nut visible (pictures)
//   (4) standing up (or moving) cancels an approach
//   (5) snow months: nothing visible, no nuts, no AI; spring brings them back (picture)
//   (6) draw calls with / without the squirrels in view
// #1728: deterministic. The AI draws on Math.random (state choices, nut spots, wander goals) and on Date.now() (home-range drift), so the
// checks were flaky (a forager choosing 'search' instead of 'forage', a nut spot out of reach...). T.seed(n) reseeds every consumer
// (the module, the nut field, the shared brain env) with a fixed generator and puts the brains' wall clock on simulated time; each section
// reseeds, so a run is the same on every machine and no section depends on how many draws an earlier one used. No check is loosened.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [base = 'http://localhost:8761', out = '/tmp/squirrels'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(data)}`); if (!ok) failed++; };
(async () => {
  const browser = await kit.launch(); const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && /shader|THREE|WebGL|squirrel/i.test(m.text())) errors.push(m.text()); });
    await page.goto(`${base}/?test&time=12&month=7&weather=clear&freeze&cloud=`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.squirrels, null, { timeout: 900000 });
    await kit.skipNameDialog(page);
    await page.evaluate(() => {
      const a = __app, S = a.squirrels; a.renderer.setAnimationLoop(null); a.showOverlay(false); a.touch.enabled = true; // (without touch the unlocked page resets the crouch every frame)
      const mulberry = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      window.T = { a, S, clock: 1e6,
        seed(n) { const r = mulberry(n); S.rnd = r; S.nuts.rnd = r; const env = S.animals[0].brain.env; env.rnd = r; env.now = () => T.clock; },
        run(n, dt = 0.1) { for (let i = 0; i < n; i++) { T.clock += dt; a.step(dt); } },
        stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.1); },
        look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
        aim(x, y, z, n = 3) { for (let i = 0; i < n; i++) { T.look(x, y, z); a.step(0.05); } T.look(x, y, z); },
        near(i, dist = 6, dir = 0.8) { const b = S.animals[i].brain; T.stand(b.x + Math.cos(dir) * dist, b.z + Math.sin(dir) * dist); T.look(b.x, b.y + 0.15, b.z); },
        calls() { a.renderer.info.reset(); a.renderer.render(a.scene, a.camera); return a.renderer.info.render.calls; } };
      T.seed(1728); a.player.crouch = false; T.run(5);
      // (the scene starts from Math.random and the wall clock: the nuts lie where the first draws put them and each squirrel's tree follows its drifting
      // home range. Lay the nuts out again from the fixed seed, then put every squirrel, with a clean memory, on its home tree at the fixed clock,
      // so every run starts from the same scene.)
      S.nuts.setActive(false); S.nuts.setActive(true); T.run(110);
      S.animals.forEach((q) => { const b = q.brain; b.hasNut = false; b.calmT = 0; b.caches = []; b.visits?.clear?.(); b.target = null; b.route = []; b.enterPerch(b.homeTree(b.homeS(), true), 0.8); });
    });
    // (1) in a crown, then on the ground
    const crown = await page.evaluate(() => {
      T.seed(1); const { a, S } = T, b = S.animals[1].brain; b.enterPerch(b.tree, 0.8); T.near(1, 7, 0.8); T.run(3, 0.02); a.camera.zoom = 3; a.camera.updateProjectionMatrix();
      const v = S.animals[1].group.visible; T.look(b.x, b.y + 0.1, b.z); T.run(1, 0.001); T.look(b.x, b.y + 0.1, b.z); return { visible: v, y: b.y, ground: S.ground(b.x, b.z), state: b.state };
    });
    check(crown.visible && crown.y > crown.ground + 2, 'a squirrel sits visible in a crown above the ground', crown);
    await kit.shot(page, `${out}/1-i-tradet.png`);
    await page.evaluate(() => { T.a.camera.zoom = 1; T.a.camera.updateProjectionMatrix(); });
    const down = await page.evaluate(() => {
      T.seed(2); const { S } = T, b = S.animals[1].brain, seen = new Set(); b.startDown(false); for (let i = 0; i < 400 && !['forage', 'search'].includes(b.state); i++) { T.run(1, 0.05); seen.add(b.state); }
      const landed = Math.abs(b.y - S.ground(b.x, b.z)) < 0.05, y0 = +b.y.toFixed(2), g0 = +S.ground(b.x, b.z).toFixed(2), st0 = b.state, f = { x: b.x + Math.cos(0.8) * 3.5, z: b.z + Math.sin(0.8) * 3.5 }; // out on the grass, clear of the trunk
      Object.assign(b, { x: f.x, z: f.z, y: S.ground(f.x, f.z) }); b.set('search', 60); b.rise = 1; T.stand(f.x + Math.cos(0.8) * 1.8, f.z + Math.sin(0.8) * 1.8); b.yaw = Math.atan2(T.a.camera.position.x - b.x, T.a.camera.position.z - b.z); T.look(b.x, b.y + 0.12, b.z);
      return { seen: [...seen], grounded: landed, state: b.state, y: y0, ground: g0, endState: st0 };
    });
    check(down.seen.includes('down') && down.grounded, 'it climbs down and stands on the ground', down);
    // (2) a nut within reach, E takes it
    const pick = await page.evaluate(() => {
      T.seed(3); const { a, S } = T, slot = S.nuts.slots.find((s) => s.alive); const item = S.nutItems[S.nuts.slots.indexOf(slot)];
      T.stand(slot.x + 0.7, slot.z + 0.4); a.player.crouch = true; T.run(12); T.aim(slot.x, slot.y + 0.02, slot.z);
      const f = a.focus().focused, seen = f?.item === item;
      if (seen) a.use(f);
      return { visibleNut: item.model.visible, targeted: seen, held: a.heldItem() === item, name: f?.name, count: S.nuts.count };
    });
    check(pick.visibleNut && pick.targeted && pick.held, 'a nut on the ground is aimed at and taken into the hand with E', pick);
    // (3) crouch still with the nut: feeding
    const feed = await page.evaluate(() => {
      T.seed(4); const { a, S } = T, b = S.animals[0].brain, pl = a.player.pos; window.chirps = []; S.sfx = { chirp: (p, k) => window.chirps.push({ x: p.x, y: p.y, z: p.z, k }) }; const d = a.camera.getWorldDirection(new (a.camera.position.constructor)());
      const l = Math.hypot(d.x, d.z) || 1, gx = pl.x + d.x / l * 5, gz = pl.z + d.z / l * 5;
      Object.assign(b, { x: gx, z: gz, y: S.ground(gx, gz) }); b.startForage(); b.set('forage', 30); b.goal.x = gx; b.goal.z = gz;
      a.stats.squirrelFeeds = 0; const s0 = a.totalScore(), trail = new Set(); let lure = false, hearts = false; const crouched = a.player.crouched;
      for (let i = 0; i < 700 && !b.hasNut; i++) { T.run(1, 0.05); trail.add(b.state); lure ||= S.player_.lure; }
      hearts = S.hearts.points.visible; const fed = a.stats.squirrelFeeds, ds = a.totalScore() - s0, heldAfter = a.heldItem();
      return { lure, crouched, trail: [...trail], hasNut: b.hasNut, fed, ds, hearts, heldAfter: !!heldAfter, chirps: window.chirps, at: { x: b.x, z: b.z } };
    });
    check(feed.lure && feed.hasNut && feed.fed === 1 && feed.ds > 0 && feed.hearts && !feed.heldAfter && feed.trail.includes('approach'), 'crouching still with a nut: a squirrel creeps up, takes it, score and hearts, hand empty', feed);
    check(feed.chirps.length === 1 && Math.hypot(feed.chirps[0].x - feed.at.x, feed.chirps[0].z - feed.at.z) < 0.5, 'feeding plays the chirp once, at the squirrel', feed.chirps);
    // (3b) a follower applying the leader's 'F' chirps once too, from that squirrel
    const fol = await page.evaluate(() => { const { S } = T, b = S.animals[1].brain; window.chirps.length = 0; S.fedBy(1, 'someone-else'); return { n: window.chirps.length, ok: window.chirps[0] && Math.hypot(window.chirps[0].x - b.x, window.chirps[0].z - b.z) < 0.01 }; });
    check(fol.n === 1 && fol.ok, "a remote feeding ('F' applied) plays the chirp once at the squirrel", fol);
    const flee = await page.evaluate(() => {
      T.seed(5); const { a, S } = T, q = S.animals[0], b = q.brain, seen = new Set(); let mouth = false;
      for (let i = 0; i < 600 && !(b.state === 'perch' && b.hasNut); i++) { T.run(1, 0.05); seen.add(b.state); mouth ||= q.mouth.visible; }
      T.look(b.x, b.y + 0.1, b.z);
      return { seen: [...seen], perchWithNut: b.state === 'perch' && b.hasNut, mouth, y: b.y, ground: S.ground(b.x, b.z) };
    });
    check(flee.perchWithNut && flee.mouth && flee.y > flee.ground + 2 && flee.seen.includes('up'), 'it runs up a tree with the nut visible in its mouth', flee);
    // hearts picture: redo a feed close up
    await page.evaluate(() => {
      T.seed(6); const { a, S } = T, slot = S.nuts.slots.find((s) => s.alive), item = S.nutItems[S.nuts.slots.indexOf(slot)];
      T.stand(slot.x + 0.6, slot.z + 0.3); a.player.crouch = true; T.run(12); T.aim(slot.x, slot.y + 0.02, slot.z); a.use(a.focus().focused);
      const b = S.animals[2].brain, pl = a.player.pos, d = a.camera.getWorldDirection(new (a.camera.position.constructor)()), l = Math.hypot(d.x, d.z) || 1;
      const gx = pl.x + d.x / l * 3.2, gz = pl.z + d.z / l * 3.2; Object.assign(b, { x: gx, z: gz, y: S.ground(gx, gz) }); b.startForage(); b.set('forage', 30); b.goal.x = gx; b.goal.z = gz;
      for (let i = 0; i < 700 && b.state !== 'take'; i++) T.run(1, 0.05);
      T.run(5, 0.05); const q = S.animals[2]; T.look(q.brain.x, q.brain.y + 0.1, q.brain.z);
    });
    await kit.shot(page, `${out}/3-ekorre-tar-notan.png`);
    const hearts = await page.evaluate(() => { const { a, S } = T, b = S.animals[2].brain; for (let i = 0; i < 40 && !b.hasNut; i++) T.run(1, 0.05); T.run(6, 0.05); const q = S.animals[2], h = S.hearts.points.geometry.attributes.position; let n = 0, hx = 0, hy = 0, hz = 0; for (let i = 0; i < h.count; i++) if (h.getY(i) > -100) { n++; hx += h.getX(i); hy += h.getY(i); hz += h.getZ(i); } T.look(n ? hx / n : q.brain.x, n ? hy / n - 0.1 : q.brain.y + 0.3, n ? hz / n : q.brain.z); return { hasNut: b.hasNut, hearts: S.hearts.points.visible, state: b.state }; });
    check(hearts.hasNut && hearts.hearts, 'the slim one is fed too: hearts rise', hearts);
    await kit.shot(page, `${out}/4-hjartan.png`);
    // (4) standing up cancels
    const cancel = await page.evaluate(() => {
      T.seed(7); const { a, S } = T; a.player.crouch = false; T.run(15);
      const slot = S.nuts.slots.find((s) => s.alive && !s.held), item = S.nutItems[S.nuts.slots.indexOf(slot)];
      T.stand(slot.x + 0.6, slot.z + 0.3); a.player.crouch = true; T.run(12); T.aim(slot.x, slot.y + 0.02, slot.z); a.use(a.focus().focused); T.run(15, 0.05);
      const b = S.animals[1].brain, pl = a.player.pos, d = a.camera.getWorldDirection(new (a.camera.position.constructor)()), l = Math.hypot(d.x, d.z) || 1;
      b.calmT = 0; b.hasNut = false; const gx = pl.x + d.x / l * 6, gz = pl.z + d.z / l * 6; Object.assign(b, { x: gx, z: gz, y: S.ground(gx, gz) }); b.startForage(); b.set('forage', 30); b.goal.x = gx; b.goal.z = gz;
      const f0 = a.stats.squirrelFeeds; let approached = false; for (let i = 0; i < 300 && !approached; i++) { T.run(1, 0.05); approached = b.state === 'approach'; }
      a.player.crouch = false; T.run(3, 0.1); const after = b.state;
      T.run(60, 0.1); return { approached, after, fed: a.stats.squirrelFeeds - f0, stillHolding: a.heldItem()?.isSquirrelNut === true };
    });
    check(cancel.approached && !['approach', 'take'].includes(cancel.after) && cancel.fed === 0 && cancel.stillHolding, 'standing up cancels the approach: no nut taken', cancel);
    // (4b) #1698: somebody runs past a squirrel that creeps up to a still, crouching feeder: it takes fright and runs up a tree
    const scare = await page.evaluate(() => {
      T.seed(8); const { a, S } = T; a.player.crouch = false; T.run(15); S.animals.forEach((q) => { q.brain.hasNut = false; q.brain.calmT = 0; });
      const slot = S.nuts.slots.find((s) => s.alive && !s.held); T.stand(slot.x + 0.6, slot.z + 0.3); a.player.crouch = true; T.run(12); T.aim(slot.x, slot.y + 0.02, slot.z); a.use(a.focus().focused);
      T.run(15, 0.05); const still = S.player_.lure; // (still crouched with the nut for 0.75 s)
      const b = S.animals[1].brain, pl = a.player.pos, d = a.camera.getWorldDirection(new (a.camera.position.constructor)()), l = Math.hypot(d.x, d.z) || 1;
      const gx = pl.x + d.x / l * 6, gz = pl.z + d.z / l * 6; Object.assign(b, { x: gx, z: gz, y: S.ground(gx, gz) }); b.startForage(); b.set('forage', 30); b.goal.x = gx; b.goal.z = gz;
      let approached = false; for (let i = 0; i < 300 && !approached; i++) { T.run(1, 0.05); approached = b.state === 'approach'; }
      T.look(b.x, b.y + 0.15, b.z);
      return { still, approached, state: b.state };
    });
    check(scare.still && scare.approached, 'still and crouched with a nut for half a second: a squirrel creeps up', scare);
    await kit.shot(page, `${out}/6-ekorre-narmar-sig.png`);
    const run = await page.evaluate(() => {
      T.seed(9); const { a, S } = T, b = S.animals[1].brain, seen = new Set(), fed = a.stats.squirrelFeeds;
      // the other visitor: a sprinting body beside the squirrel (what a ghost's speed estimate says); the crouched feeder stays put
      const other = { id: 'x', x: b.x + 1.5, z: b.z, lure: false, hx: 0, hz: 0, v: 5, rose: false };
      b.env.scares = [other]; // (watchPlayer rebuilds S.cand every frame: the visitor goes in the brains' own list)
      const step = () => T.run(1, 0.05);
      for (let i = 0; i < 6; i++) { step(); seen.add(b.state); }
      const up = { fled: seen.has('flee') || seen.has('up'), calm: b.calmT, fed: a.stats.squirrelFeeds - fed };
      for (let i = 0; i < 400 && b.state !== 'perch'; i++) { step(); seen.add(b.state); }
      T.look(b.x, b.y + 0.1, b.z); return { ...up, seen: [...seen], perch: b.state, high: b.y - S.ground(b.x, b.z) };
    });
    check(run.fled && run.calm > 0 && run.fed === 0 && run.perch === 'perch' && run.high > 2, 'another visitor running past: it flees up a tree without taking the nut', run);
    await kit.shot(page, `${out}/7-ekorre-flyr-upp.png`);
    // (5) winter
    const winter = await page.evaluate(() => {
      const { a, S } = T; a.heldItem()?.putBack?.(); a.day.month = 1; T.run(5);
      const r = { winter: S.winter, animalsVisible: S.animals.filter((q) => q.group.visible).length, nuts: S.nuts.count, items: S.nutItems.filter((n) => !n.broken || n.model.visible).length, drawn: 0 };
      const b1 = S.animals[1].brain; b1.enterPerch(b1.tree, 0.8); // (the place of picture 1)
      const before = S.animals.map((q) => [q.brain.x, q.brain.z, q.brain.state]); T.run(100); r.frozen = S.animals.every((q, i) => q.brain.x === before[i][0] && q.brain.state === before[i][2]);
      T.near(1, 7, 0.8); r.callsWinter = T.calls(); T.a.camera.zoom = 3; T.a.camera.updateProjectionMatrix();
      return r;
    });
    check(winter.winter && winter.animalsVisible === 0 && winter.nuts === 0 && winter.items === 0 && winter.frozen, 'in the snow months: no squirrel visible, no nut, no AI', winter);
    await kit.shot(page, `${out}/5-vinter.png`);
    await page.evaluate(() => { T.a.camera.zoom = 1; T.a.camera.updateProjectionMatrix(); });
    const spring = await page.evaluate(() => { const { a, S } = T; a.day.month = 6; T.run(60); return { winter: S.winter, nuts: S.nuts.count }; });
    check(!spring.winter && spring.nuts > 0, 'spring brings the nuts back', spring);
    // (6) draw calls
    const cost = await page.evaluate(() => {
      const { a, S } = T; const b = S.animals[1].brain; b.enterPerch(b.tree, 0.8); T.near(1, 5, 0.8); T.run(2, 0.02);
      const c = a.camera.position, d = a.camera.getWorldDirection(new (c.constructor)()); // worst case: all three on the ground in front of the eye
      S.animals.forEach((q, i) => { const x = c.x + d.x * 3 - d.z * (i - 1) * 0.8, z = c.z + d.z * 3 + d.x * (i - 1) * 0.8; Object.assign(q.brain, { x, z, y: S.ground(x, z) }); q.brain.set('search', 99); });
      T.run(1, 0.0001); const m = S.animals[1].brain; T.look(m.x, m.y + 0.1, m.z);
      const vis = S.animals.filter((q) => q.group.visible).length, on = T.calls(); const hold = S.animals.map((q) => q.group.visible); S.animals.forEach((q) => { q.group.visible = false; });
      S.nutItems.forEach((n) => { n._v = n.model.visible; n.model.visible = false; }); const off = T.calls(); S.nutItems.forEach((n) => { n.model.visible = n._v; }); S.animals.forEach((q, i) => { q.group.visible = hold[i]; });
      return { visibleSquirrels: vis, on, off, extra: on - off, nuts: S.nuts.count, pos: S.animals.map((q) => [q.group.position.x - c.x, q.group.position.y - c.y, q.group.position.z - c.z].map((v) => +v.toFixed(1))), dir: [d.x, d.y, d.z].map((v) => +v.toFixed(2)) };
    });
    check(cost.extra <= 3 + cost.nuts, 'draw calls added by squirrels and nuts in view stay small', cost);
    // #1720: F's show-all (world.refreshFurniture, also run by the Christmas season at start) must not draw the nuts that are not lying out
    const hidden = await page.evaluate(() => { const { a, S } = T; a.world.refreshFurniture(); a.step(0.1);
      const out = S.nutItems.filter((n) => n.broken && n.model.visible).length; return { brokenVisible: out, broken: S.nutItems.filter((n) => n.broken).length }; });
    check(hidden.brokenVisible === 0, 'nuts not lying out stay hidden after the furniture refresh', hidden);
    // #1726: a shot-to-pieces holdable (hidden by shatter) must stay hidden through the same refresh, while an intact one is shown
    const shot = await page.evaluate(() => { const { a } = T, hs = a.world.looseItems.filter((o) => o.userData.keepHidden), item = a.breaker.items.find((i) => hs.includes(i.model)), m = item.model;
      const other = hs.find((o) => o !== m); other.visible = false;
      const was = m.visible; item.shatter(); a.world.refreshFurniture(); a.step(0.1);
      const r = { found: hs.length, wasVisible: was, brokenFlag: item.broken, brokenVisible: m.visible, otherVisible: other.visible };
      item.mend(); a.world.refreshFurniture(); r.mendedVisible = m.visible; return r; });
    check(shot.found > 3 && shot.brokenFlag && !shot.brokenVisible && shot.otherVisible && shot.mendedVisible, 'a shot-to-pieces thing stays hidden after the furniture refresh, others are shown', shot);
    check(errors.length === 0, 'no page or WebGL errors', errors.slice(0, 5));
  } finally { await browser.close(); }
  process.exit(failed ? 1 : 0);
})();
