// #1782: a roaming outdoor cat eats a raw caught fish (as the ordinary cat's #1766) in the real scene, on its own, while the ordinary cat
// is busy elsewhere. PLAYWRIGHT_MODULE=… [CHROME_PATH=…] node tools/outdoorcatfishtest.cjs GAME OUT
//   (1) a raw fish on the lawn near Sotis (social): it goes there, eats it (the fish shrinks) and the fish is gone; +1 catFishFeeds,
//       +SCORE.each.catFishFeeds once, never `fishEaten` or the fishing quest; the ordinary cat stays where it was
//   (2) a cooked and a burnt fish near Kanel: ignored
//   (3) Smulan (shy) and a raw fish held out by a visitor standing still: she hesitates, then eats it out of the hand
//   pictures: Sotis bent over the fish, eating; Kanel beside a cooked fish
// Deterministic: the cats' clock (`outdoorCats.now`) is the test's own.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [base = 'http://localhost:8204', out = '/tmp/outdoorcatfish'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(data)}`); if (!ok) failed++; };
(async () => {
  const browser = await kit.launch(); const errors = [];
  try {
    const { page } = await kit.open(browser, `${base}/?life&time=12&month=7&day=15&weather=clear&freeze&cloud=`, { timeout: 900000,
      init: () => { localStorage.setItem('lunden.name', 'Fia'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => window.__app?.outdoorCats && window.__app.fishing, null, { timeout: 900000 });
    await kit.skipNameDialog(page);
    await page.evaluate(async () => {
      const a = __app, O = a.outdoorCats; a.renderer.setAnimationLoop(null); a.showOverlay(false);
      const [THREE, cfg] = await Promise.all([import('three'), import('/src/config.js')]);
      window.T = { a, O, THREE, cfg, Fi: a.fishing, clock: 1793491200 + 5000,
        run(n, dt = 0.1) { for (let i = 0; i < n; i++) { T.clock += dt; a.step(dt); } },
        stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
        look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
        cat(name) { return O.cats.find((c) => c.name === name); },
        /** the ordinary cat busy: shown sitting indoors in the flat, far from the lawns */
        busy() { const k = a.cat, b = a.BREEDS[0]; k.hide(); k.setCat(b, b.coats[0], false); k.object.visible = true; k.leaving = null; k.fish = null; k.ignored = -1e9; k.awayFor = 0; k.object.position.set(2, 11.8, -40); k.photoDone = true; },
        /** a spot `r` m from cat `c` the cat can walk to (no road, water, drop or wall) */
        spot(c, r) { for (let k = 0; k < 24; k++) { const an = k * 0.2618, x = c.x + Math.cos(an) * r, z = c.z + Math.sin(an) * r; if (c.clearOut(c.x, c.z, x, z)) return { x, z }; } return null; },
        lay(raw, at) { const y = O.ground(at.x, at.z), f = T.Fi.addFish({ species: 'abborre', cm: 24, raw }, new THREE.Vector3(at.x, y, at.z)); f.take(); f.placeAt(new THREE.Vector3(at.x, y, at.z), 0.3); return f; },
        clear() { for (const f of T.Fi.fish) f.remove(); T.Fi.fish = []; },
        /** stop the cats' loops while a check runs (a resting cat; the clock stays still) */
        still(c) { for (let i = 0; i < 400 && O.scheduled(c).walking; i++) T.clock += 2; O.cats.forEach((q) => { q.st = 'route'; q.alpha = 1; O.place(q, O.scheduled(q)); }); },
      };
      O.now = () => T.clock;
    });

    // (1) a raw fish near Sotis, the ordinary cat busy
    const r1 = await page.evaluate(() => {
      const { O, a } = T, c = T.cat('Sotis'), k = a.cat;
      T.still(c); T.busy(); T.stand(c.x - 7, c.z + 4); T.run(5, 0.1);
      const at = T.spot(c, 2.6), f = T.lay(true, at), s0 = a.totalScore(), n0 = a.stats.catFishFeeds ?? 0, e0 = a.stats.fishEaten ?? 0, q0 = JSON.stringify(a.stats.fishQuestSteps ?? null);
      a.heldItem()?.putBack?.();
      const seen = new Set(), k0 = k.object.position.clone(); let shrunk = false, path = 0, px = c.x, pz = c.z, minD = 99;
      for (let i = 0; i < 400 && !f.broken; i++) {
        T.run(1, 0.05); seen.add(c.st); if (c.st === 'eat' && f.model.scale.x < 0.9) shrunk = true;
        path += Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; minD = Math.min(minD, Math.hypot(c.x - at.x, c.z - at.z));
      }
      T.run(20, 0.05);
      return { at: at && [+at.x.toFixed(1), +at.z.toFixed(1)], seen: [...seen], shrunk, gone: f.broken, inList: T.Fi.fish.includes(f), path: +path.toFixed(2), minD: +minD.toFixed(2),
        feeds: (a.stats.catFishFeeds ?? 0) - n0, pts: a.totalScore() - s0, fishEaten: (a.stats.fishEaten ?? 0) - e0, questSame: JSON.stringify(a.stats.fishQuestSteps ?? null) === q0,
        ordinary: { visible: k.visible, outdoorCat: k.outdoorCat, moved: +k.object.position.distanceTo(k0).toFixed(2) }, stAfter: c.st, claim: f.outdoorCat ?? null };
    });
    check(r1.seen.includes('food') && r1.seen.includes('eat') && r1.shrunk && r1.gone && !r1.inList && r1.path > 1.5 && r1.minD < 0.4,
      'a raw fish near the roaming Sotis: she walks there, eats it (it shrinks) and the fish is gone', r1);
    check(r1.feeds === 1 && r1.pts === 5 && r1.fishEaten === 0 && r1.questSame, 'counted once (catFishFeeds, +5), not as the player eating it, the quest untouched', r1);
    check(r1.ordinary.visible && !r1.ordinary.outdoorCat && r1.ordinary.moved < 0.01, 'the ordinary cat was busy elsewhere the whole time', r1.ordinary);

    // picture: Sotis eating, low and close
    const pic = await page.evaluate(() => {
      const { O, a } = T, c = T.cat('Sotis');
      T.clear(); T.still(c); T.stand(c.x - 7, c.z + 4); T.run(5, 0.1);
      const at = T.spot(c, 1.8), f = T.lay(true, at); a.heldItem()?.putBack?.();
      for (let i = 0; i < 400 && !(c.st === 'eat' && c.eatT > 1.2); i++) T.run(1, 0.05);
      const gy = O.ground(c.x, c.z), dx = Math.sin(c.yaw + 1.2), dz = Math.cos(c.yaw + 1.2);
      T.stand(c.x + dx * 1.3, c.z + dz * 1.3); const cam = a.camera; cam.position.set(c.x + dx * 1.1, gy + 0.6, c.z + dz * 1.1); T.look((c.x + at.x) / 2, gy + 0.1, (c.z + at.z) / 2);
      O.update(0.001, false, 0);
      return { st: c.st, eatT: +(c.eatT ?? 0).toFixed(2), scale: +f.model.scale.x.toFixed(2), full: c.puppet.object.visible };
    });
    check(pic.st === 'eat' && pic.scale < 0.7 && pic.full, 'picture: Sotis bent over the fish, eating', pic);
    await kit.shot(page, `${out}/1-sotis-aeter-ra-fisk.png`, { frames: 1 });
    await page.evaluate(() => { for (let i = 0; i < 100 && T.cat('Sotis').fish; i++) T.run(1, 0.05); T.clear(); });

    // (2) cooked and burnt fish near Kanel: ignored
    const r2 = await page.evaluate(() => {
      const { O, a, cfg } = T, c = T.cat('Kanel');
      T.still(c); T.busy(); T.stand(c.x - 7, c.z + 4); T.run(5, 0.1);
      const cooked = T.lay(false, T.spot(c, 1.8)), b = T.spot(c, 2.6), burnt = T.lay(false, b); burnt.cook = cfg.FISHING.cook.burn; burnt.paint(); a.heldItem()?.putBack?.();
      const n0 = a.stats.catFishFeeds ?? 0, seen = new Set();
      for (let i = 0; i < 200; i++) { T.run(1, 0.05); seen.add(c.st); }
      return { seen: [...seen], cooked: !cooked.broken, burnt: !burnt.broken, states: [cooked.cookState, burnt.cookState], claims: [cooked.outdoorCat ?? null, burnt.outdoorCat ?? null], feeds: (a.stats.catFishFeeds ?? 0) - n0 };
    });
    check(!r2.seen.includes('food') && !r2.seen.includes('eat') && r2.cooked && r2.burnt && r2.feeds === 0 && !r2.claims[0] && !r2.claims[1], 'a cooked / burnt fish near Kanel: ignored, nothing eaten', r2);
    await page.evaluate(() => { // from the side, the cat and the cooked fish both in view, from a spot it could walk to (no bench in front)
      const c = T.cat('Kanel'), f = T.Fi.fish[0].middle(new T.THREE.Vector3()), mx = (c.x + f.x) / 2, mz = (c.z + f.z) / 2, l = Math.hypot(f.x - c.x, f.z - c.z), px = -(f.z - c.z) / l, pz = (f.x - c.x) / l;
      const sd = [1, -1].find((k) => c.clearOut(mx, mz, mx + px * k * 2.4, mz + pz * k * 2.4)) ?? 1, gy = T.O.ground(c.x, c.z);
      T.stand(mx + px * sd * 2.6, mz + pz * sd * 2.6); T.a.camera.position.set(mx + px * sd * 2.2, gy + 0.9, mz + pz * sd * 2.2); T.look(mx, gy + 0.1, mz); T.O.update(0.001, false, 0);
    });
    await kit.shot(page, `${out}/2-kanel-struntar-i-tillagad-fisk.png`, { frames: 1 });
    await page.evaluate(() => T.clear());

    // (3) Smulan (shy) and a raw fish held out by a visitor standing still 4 m away
    const r3 = await page.evaluate(() => {
      const { O, a, THREE } = T, c = T.cat('Smulan'), P = a.player;
      T.still(c); T.busy(); const s = T.spot(c, 4); T.stand(s.x, s.z); T.look(c.x, O.ground(c.x, c.z), c.z);
      const f = T.Fi.addFish({ species: 'mört', cm: 18, raw: true }, new THREE.Vector3(P.pos.x, P.pos.y, P.pos.z)); f.take();
      const held0 = a.heldItem() === f, n0 = a.stats.catFishFeeds ?? 0, seen = []; let firstFood = -1, firstEat = -1;
      for (let i = 0; i < 1200 && !f.broken; i++) {
        T.run(1, 0.05); if (seen[seen.length - 1] !== c.st) seen.push(c.st);
        if (c.st === 'food' && firstFood < 0) firstFood = i * 0.05; if (c.st === 'eat' && firstEat < 0) firstEat = i * 0.05;
      }
      return { held0, gone: f.broken, handEmpty: !a.heldItem(), seen: seen.slice(0, 10), hesitated: +(firstEat - firstFood).toFixed(2), feeds: (a.stats.catFishFeeds ?? 0) - n0, wait: +c.foodWait().toFixed(2) };
    });
    check(r3.held0 && r3.gone && r3.handEmpty && r3.feeds === 1 && r3.seen.includes('eat') && r3.hesitated > r3.wait, 'shy Smulan hesitates, then eats a raw fish held out by a visitor standing still', r3);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
