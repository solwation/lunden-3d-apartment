// The harpoon gun (#1953): one headless page (no Worker needed: solo, the catches are local). Start the site first:
//   python3 tools/devserve.py 8137 .
//   [SHOTS=/dir] tools/browsertest.sh node tools/harpoontest.cjs http://localhost:8137
// Checks: the cushion box stands on the shore flat by the southern river, clear of the trees; shut, the gun is neither seen nor
// takeable; open, it lies there; taken, a shot into the ground sticks and is reeled back (no second shot meanwhile); a shot over the
// river never gets further than the line; a river fish hit from the bank is a catch (gone from the river, a caught fish at your
// feet, counted); under water (diving) the same, the fish laid on the bank and the gun still in the hand; the shark that attacks a
// swimmer can be harpooned (the attack ends, its fin on the bank); it is no weapon; E on the box puts it back.
// Not covered here: the shared weekly shark (#1769, needs its window) and a room's verdict (solo answers at once).
// Screenshots: the open box, the gun in the hand, the spear on its line under water, the fish on the bank. Frames are driven by hand.
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8137', shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const step = (msg) => console.log(`  … +${Math.round((Date.now() - T0) / 1000)}s ${msg}`);
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 40 * 60000).unref();

(async () => {
  const browser = await kit.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    step('loading');
    await page.goto(`${game}/?shot&cloud=&quality=0&month=7&time=13&freeze&weather=clear&mess=0&at=-218.5,233.55,31,-48`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__harpoon !== undefined, null, { timeout: 1500000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const run = (n = 1, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    const shot = async (name) => { await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); }); await page.screenshot({ path: `${shots}/${name}.png`, timeout: 300000 }); };
    step('loaded');
    await run(3);
    // helpers in the page
    await page.evaluate(async () => {
      const app = window.__app, h = window.__harpoon, fw = await import('/src/farwalk.js'), rb = await import('/src/riverbridge.js'), fs = await import('/src/riverfishswim.js'), C = await import('/src/config.js');
      const T = window.__ht = { fw, rb, fs, C, said: [] };
      if (h) h.say = (t) => T.said.push(t);
      app.fishing.onMessage = (t) => T.said.push(t);
      /** Aim the camera so a shot (from 0.35 m in front of the eye, 0.1 m below it) goes through (x, y, z). */
      T.aim = (x, y, z) => {
        const c = app.camera, e = c.getWorldPosition(new c.position.constructor());
        for (let i = 0; i < 3; i++) { // (the shot's origin depends on the direction: settle it)
          const d = c.getWorldDirection(new c.position.constructor()), ox = e.x + d.x * 0.35, oy = e.y + d.y * 0.35 - 0.1, oz = e.z + d.z * 0.35;
          const dx = x - ox, dy = y - oy, dz = z - oz;
          c.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); c.updateMatrixWorld(true);
        }
      };
      /** One frame as while playing: the page is not pointer-locked, so main.js's frame leaves the player (and the shark's attack) alone. */
      T.step = (dt) => { if (!app.fall.active) { app.player.update(dt); app.sharkHunt?.update(dt); } app.frame(dt); };
      /** Frames until the spear is back and nothing is being decided (at most `s` s). Returns the furthest it got from the muzzle. */
      T.fly = (s = 4, dt = 1 / 30) => {
        let far = 0;
        for (let t = 0; t < s; t += dt) {
          T.step(dt);
          const st = h.st, m = h.muzzle();
          if (st.phase !== 'ready') far = Math.max(far, Math.hypot(st.x - m.x, st.y - m.y, st.z - m.z));
          else if (!h.catch) break;
        }
        return far;
      };
      /** The river fish nearest (x, z) that swims where a swimmer can be (they keep to their own stretches: it may be far off). */
      T.fish = (x, z) => app.riverFish.near(x, z, 1e5).filter((f) => fw.swimWater(f.x, f.z)).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0] ?? null;
    });
    const box = await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app, T = window.__ht;
      if (!h) return null;
      let root = h.box.lid.object; while (root.parent && !root.userData.box) root = root.parent;
      const w = root.getWorldPosition(new app.camera.position.constructor());
      const segD = (x, z, [x0, z0, x1, z1]) => { const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz, k = l2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2)) : 0; return Math.hypot(x - x0 - dx * k, z - z0 - dz * k); };
      let wall = Infinity; for (const g of T.fw.farWalls(w.x, w.z, w.y)) wall = Math.min(wall, segD(w.x, w.z, g));
      return { x: w.x, y: w.y, z: w.z, ground: app.player.groundAt(w.x, w.z, w.y + 0.5), river: T.rb.riverAt(w.x, w.z).distance, water: T.rb.waterYAt(w.x, w.z), wall, swim: T.fw.swimWater(...(({ x, z }) => [x, z])(T.rb.riverAt(w.x, w.z))) };
    });
    check(!!box, 'the harpoon gun and its box exist');
    check(box && Math.abs(box.y - box.ground) < 0.06, 'the box stands on the ground (terrain at its centre)', JSON.stringify(box));
    check(box && box.river < 12 && box.y > box.water + 0.5 && box.swim, 'on the dry shore, within 12 m of the swimmable river', JSON.stringify(box && [box.river, box.water]));
    check(box && box.wall > 1.5, 'no trunk or wall within 1.5 m of it', String(box?.wall));
    check(await page.evaluate(() => { const h = window.__harpoon; window.__app.frame(0.05); return !h.model.visible && h.target.kind === 'none'; }), 'shut: the gun is neither seen nor takeable');
    await page.evaluate(() => window.__harpoon.box.lid.toggle());
    await run(30, 0.05);
    check(await page.evaluate(() => { const h = window.__harpoon; return h.model.visible && h.target === h.takeTarget; }), 'open: the gun lies in the box, E takes it');
    await shot('harpoon-box-open');
    await page.evaluate(() => window.__harpoon.take());
    await run(2);
    check(await page.evaluate(() => { const h = window.__harpoon; return window.__app.heldItem() === h && h.model.visible && h.spear.parent === h.model; }), 'taken: in the hand, the spear on the gun');
    check(await page.evaluate(() => { const h = window.__harpoon; return h.clickIsUse === true && !h.shoots && !h.hitsTarget; }), 'no weapon: it fires on a click but has no `shoots` / `hitsTarget`');
    await page.evaluate(() => window.__app.camera.rotation.set(-0.08, 0.5, 0, 'YXZ'));
    await run(2);
    await shot('harpoon-held');

    // into the ground: it sticks, comes back, and only then can be shot again
    const ground = await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app, out = {};
      app.camera.rotation.set(-0.5, Math.PI, 0, 'YXZ'); app.camera.updateMatrixWorld(true); // (south: away from the river, down at the grass)
      out.fired = h.shoot(); out.line = h.line.visible; out.inScene = h.spear.parent === app.scene;
      let stuck = null;
      for (let i = 0; i < 60 && !stuck; i++) { app.frame(1 / 60); if (h.st.phase === 'stuck') { const d = h.spear.getWorldDirection(new app.camera.position.constructor()), tip = h.spear.position.clone().addScaledVector(d, window.__ht.C.HARPOON.spear); stuck = { tip: tip.y, ground: app.player.groundAt(tip.x, tip.z, 0) }; } }
      out.stuck = stuck; out.again = h.shoot();
      out.far = window.__ht.fly(3); out.phase = h.st.phase; out.docked = h.spear.parent === h.model && !h.line.visible; out.shots = h.shots;
      return out;
    });
    check(ground.fired && ground.line && ground.inScene, 'a shot: the spear leaves the gun on its line', JSON.stringify(ground));
    check(!!ground.stuck && Math.abs(ground.stuck.tip - ground.stuck.ground) < 0.15, 'it sticks in the ground, its point just under the grass', JSON.stringify(ground.stuck));
    check(ground.again === false && ground.shots === 1, 'no second shot while the spear is out');
    check(ground.phase === 'ready' && ground.docked, 'reeled in: the spear is on the gun again, the line gone');

    // over the river: never further than the line
    const reach = await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app, T = window.__ht, p = app.player.pos, r = T.rb.riverAt(p.x, p.z);
      T.aim(r.x, p.y + 6, r.z); // up over the water: nothing within reach
      const fired = h.shoot(), far = T.fly(5);
      return { fired, far, phase: h.st.phase, line: T.C.HARPOON.line };
    });
    check(reach.fired && reach.far > reach.line - 1.5 && reach.far <= reach.line + 0.02 && reach.phase === 'ready', 'the spear stops at the end of the line and comes back', JSON.stringify(reach));

    // a fish from the bank
    step('a fish from the bank');
    const bank = await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app, T = window.__ht, p = app.player;
      const f0 = T.fish(p.pos.x, p.pos.z);
      if (!f0) return { none: true, shown: app.riverFish.shown.length };
      const q = T.fs.riverProject(f0.x, f0.z), c = T.fs.riverPoint(q.s);
      let spot = null; const side = q.d >= 0 ? 1 : -1; // the water's edge on the fish's side of the river, abreast of it
      for (let d = Math.abs(q.d); d < 14 && !spot; d += 0.1) { const x = c.x + c.nx * side * d, z = c.z + c.nz * side * d, y = p.groundAt(x, z, 0); if (Number.isFinite(y) && y > T.fs.waterAt(q.s) + 0.1 && !T.fw.inWater(x, z, y)) spot = { x, y, z }; }
      if (!spot) return { noSpot: true };
      p.spawn(spot.x, spot.z, 0); p.pos.y = spot.y;
      T.aim(f0.x, T.fs.waterAt(q.s), f0.z);
      app.frame(1 / 60); app.frame(1 / 60);
      const f = app.riverFish.shown.find((e) => e.id === f0.id);
      if (!f) return { notShown: true, shown: app.riverFish.shown.length };
      const before = { catches: app.fishing.catches, fish: app.fishing.fish.length, hits: h.hits };
      const dist = Math.hypot(f.x - app.camera.position.x, f.z - app.camera.position.z);
      T.aim(f.x, f.drawnY + 4.9 * (dist / T.C.HARPOON.speed) ** 2, f.z); // (in the air the spear falls: aim that much over the fish)
      const fired = h.shoot();
      let carried = false; for (let i = 0; i < 40 && h.st.phase !== 'ready'; i++) { app.frame(1 / 60); carried ||= !!h.carried; }
      T.fly(4);
      const got = app.fishing.fish.at(-1), gp = got?.model.getWorldPosition(new app.camera.position.constructor());
      return { id: f.id, species: f.species, dist, fired, carried, hits: h.hits - before.hits, catches: app.fishing.catches - before.catches, added: app.fishing.fish.length - before.fish, gone: app.riverFish.sync.isGone(f.id),
        got: got && { species: got.species, cm: got.cm, placed: got.placed, held: got.held, d: Math.hypot(gp.x - p.pos.x, gp.z - p.pos.z), dy: gp.y - p.pos.y }, held: app.heldItem() === h, said: T.said.slice(-1)[0], look: [gp?.x, gp?.y, gp?.z] };
    });
    check(!bank.none && !bank.noSpot && !bank.notShown && bank.dist < 12, 'a river fish within reach of the bank', JSON.stringify(bank));
    check(bank.fired && bank.hits === 1 && bank.carried, 'the spear hits the fish and brings it back on the line');
    check(bank.catches === 1 && bank.added === 1 && bank.gone, 'it counts as a catch: the fish is gone from the river, a caught fish is yours');
    check(bank.got && bank.got.species === bank.species && bank.got.placed && !bank.got.held && bank.got.d < 1.2 && Math.abs(bank.got.dy) < 0.4, 'the fish lies at your feet');
    check(bank.held && /harpunerade/.test(bank.said ?? ''), 'the gun stays in the hand; the badge says so', bank.said);
    if (bank.look?.[0] !== undefined) {
      await page.evaluate(([x, y, z]) => { const c = window.__app.camera, e = c.getWorldPosition(new c.position.constructor()); c.rotation.set(Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)), Math.atan2(-(x - e.x), -(z - e.z)), 0, 'YXZ'); }, bank.look);
      await shot('harpoon-fish-at-feet');
    }

    // under water
    step('under water');
    const dive = await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app, T = window.__ht, p = app.player, dt = 1 / 30;
      const f0 = T.fish(p.pos.x, p.pos.z);
      if (!f0) return { none: true };
      const q = T.fs.riverProject(f0.x, f0.z), c = T.fs.riverPoint(q.s - 3.5); // mid-channel, 3.5 m upstream of the fish
      if (!T.fw.swimWater(c.x, c.z)) return { noWater: true };
      p.pos.set(c.x, T.fw.swimBedY(c.x, c.z), c.z); // set down in the channel (as tools/sharkattacktest.cjs `dip`)
      let t = 0; while (!p.swim && t < 3) { T.step(dt); t += dt; }
      const d0 = T.rb.riverAt(p.pos.x, p.pos.z); app.camera.rotation.set(-0.1, Math.atan2(-d0.nz, d0.nx), 0, 'YXZ'); // facing downstream
      p.crouch = true; for (t = 0; t < 2.5; t += dt) T.step(dt);
      const f = app.riverFish.shown.find((e) => e.id === f0.id);
      return { swim: !!p.swim, diving: p.diving, held: app.heldItem() === h, eye: app.camera.position.y - T.rb.waterYAt(p.pos.x, p.pos.z), fish: f && { id: f.id, species: f.species, d: Math.hypot(f.x - p.pos.x, f.z - p.pos.z) } };
    });
    check(dive.swim && dive.diving && dive.eye < 0 && dive.held, 'diving in the river with the gun still in the hand', JSON.stringify(dive));
    check(!!dive.fish && dive.fish.d < 9, 'a fish within reach under water', JSON.stringify(dive.fish));
    // the picture: the spear on its line, a few frames into a shot along the river
    await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app, T = window.__ht, p = app.player.pos, d = T.rb.riverAt(p.x, p.z);
      T.aim(p.x + d.nz * 6, app.camera.position.y - 0.25, p.z - d.nx * 6); // downstream, just under the surface
      h.shoot(); for (let i = 0; i < 9; i++) T.step(1 / 60);
      app.camera.rotation.y -= 0.12; app.camera.rotation.x += 0.03; app.camera.updateMatrixWorld(true);
    });
    const mid = await page.evaluate(() => ({ phase: window.__harpoon.st.phase, wet: window.__harpoon.wet(window.__harpoon.spear.position), line: window.__harpoon.line.visible }));
    check(mid.phase !== 'ready' && mid.wet && mid.line, 'a shot under water: the spear flies on its line', JSON.stringify(mid));
    await shot('harpoon-underwater-line');
    const under = await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app, T = window.__ht, p = app.player;
      T.fly(4);
      const f = app.riverFish.shown.slice().sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0], e = app.riverFish.feed.off.get(f.id), before = { catches: app.fishing.catches, hits: h.hits };
      T.aim(f.x + (e?.x ?? 0), f.y + (e?.y ?? 0), f.z + (e?.z ?? 0));
      const fired = h.shoot(), dist = Math.hypot(f.x - p.pos.x, f.z - p.pos.z);
      T.fly(4);
      const got = app.fishing.fish.at(-1), gp = got.model.getWorldPosition(new app.camera.position.constructor());
      return { id: f.id, dist, fired, hits: h.hits - before.hits, catches: app.fishing.catches - before.catches, gone: app.riverFish.sync.isGone(f.id), species: f.species, got: got.species,
        ashore: gp.y - T.rb.waterYAt(gp.x, gp.z), inWater: T.fw.swimWater(gp.x, gp.z), far: Math.hypot(gp.x - p.pos.x, gp.z - p.pos.z), placed: got.placed, held: app.heldItem() === h, swim: !!p.swim, said: T.said.slice(-1)[0] };
    });
    check(under.fired && under.hits === 1 && under.catches === 1 && under.gone && under.got === under.species, 'under water: a hit fish is a catch', JSON.stringify(under));
    check(under.placed && under.ashore > 0.3 && !under.inWater && under.far < 26, 'the fish is laid on the dry bank', `${under.ashore?.toFixed(2)} m over the water, ${under.far?.toFixed(1)} m away`);
    check(under.held && under.swim && /stranden/.test(under.said ?? ''), 'the swimmer keeps the gun; the badge says where the fish is', under.said);

    // the attacking shark
    step('the shark');
    const shark = await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app, T = window.__ht, p = app.player, hunt = app.sharkHunt, dt = 1 / 30;
      if (!hunt) return { none: true };
      let bitten = false; const bite = hunt.onBite; hunt.onBite = () => { bitten = true; };
      p.crouch = false; hunt.test = true;
      let t = 0, tg = null;
      for (; t < 40; t += dt) { T.step(dt); tg = hunt.target(); if (tg && Math.hypot(tg.x - p.pos.x, tg.z - p.pos.z) < 7) break; }
      if (!tg) { hunt.onBite = bite; return { noShark: true, t, phase: hunt.st.phase, swim: !!p.swim }; }
      const before = { fins: app.fishing.fins.length, hits: h.hits };
      T.aim(tg.x, tg.y - 0.3, tg.z);
      const fired = h.shoot(); T.fly(4);
      const fin = app.fishing.fins.at(-1), gp = fin?.model.getWorldPosition(new app.camera.position.constructor());
      const out = { t, fired, hits: h.hits - before.hits, fins: app.fishing.fins.length - before.fins, phase: hunt.st.phase, bitten, ashore: gp && gp.y - T.rb.waterYAt(gp.x, gp.z), said: T.said.slice(-1)[0], held: app.heldItem() === h };
      hunt.test = false; hunt.onBite = bite;
      return out;
    });
    check(!shark.none && !shark.noShark && shark.fired && shark.hits === 1, 'the shark that attacks a swimmer can be hit', JSON.stringify(shark));
    check(shark.phase !== 'warn' && !shark.bitten, 'the attack is over: no bite');
    check(shark.fins === 1 && shark.ashore > 0.3 && /hajen/.test(shark.said ?? ''), 'it counts as catching the shark: its fin lies on the bank', shark.said);

    // back in the box
    const back = await page.evaluate(() => {
      const h = window.__harpoon, app = window.__app;
      h.shoot(); app.frame(1 / 60); app.frame(1 / 60);
      const out = h.st.phase !== 'ready';
      h.putBack(); app.frame(1 / 60);
      return { out, held: h.held, phase: h.st.phase, docked: h.spear.parent === h.model && !h.line.visible, home: h.model.position.distanceTo(h.home.pos) };
    });
    check(back.out && !back.held && back.phase === 'ready' && back.docked && back.home < 0.01, 'put back with the spear out: the gun lies in the box again, the spear on it', JSON.stringify(back));
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { console.log(`FAIL ${e.stack || e}`); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
