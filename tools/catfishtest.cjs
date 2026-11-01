// #1766: the cats eat a raw caught fish (like a fish finger, #163) lying near them or held out, and ignore a cooked / burnt one; in the real
// game, outdoors, for an ordinary cat and a kitten. Once per fish (+SCORE.each.catFishFeeds, the stat `catFishFeeds`), the fishing quest and
// `fishEaten` stay out of it.
//   python3 tools/devserve.py 8193 .
//   tools/browsertest.sh node tools/catfishtest.cjs http://localhost:8193 OUT_DIR
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8193', out = '/tmp/catfish'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = async () => {
  const a = __app, Fi = a.fishing; a.renderer.setAnimationLoop(null); a.showOverlay?.(false); a.touch.enabled = true; document.getElementById('corner-qr')?.style.setProperty('display', 'none');
  const [THREE, cfg] = await Promise.all([import('three'), import('/src/config.js')]);
  window.T = { a, Fi, THREE, cfg, cat: a.cat,
    async pump(ms, dt = 0.05, until = null) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); if (until?.()) return true; await new Promise((r) => setTimeout(r, 10)); } return false; },
    /** a cat of breed i (kitten or not) on the ground 2 m in front of the player, the player looking at it */
    spawn(i, kitten) {
      const c = a.cat, P = a.player, b = a.BREEDS[i]; P.spawn(1, -40, 0); a.step(0.05);
      c.hide(); c.setCat(b, b.coats[0], kitten); c.object.visible = true; c.leaving = null; c.fish = null; c.ignored = 0; c.awayFor = 0;
      const x = P.pos.x + 1.8, z = P.pos.z, y = P.groundAt(x, z, P.pos.y + 0.3);
      c.object.position.set(x, y, z); c.object.rotation.y = Math.PI / 2; c.object.scale.setScalar(c.shape.size); c.photoDone = true;
      return { x, y, z };
    },
    lay(raw, at, dx = -0.9) {
      const f = Fi.addFish({ species: 'abborre', cm: 24, raw }, new THREE.Vector3(at.x, at.y, at.z)); f.take(); f.placeAt(new THREE.Vector3(at.x + dx, at.y, at.z), 0.3); return f;
    },
    run(sec, dt = 0.05) { for (let t = 0; t < sec; t += dt) a.step(dt); },
  };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const { page } = await kit.open(browser, `${game}/?life&shot&time=13&month=7&day=15&weather=clear&freeze&at=1.0,11.8,-40,0`, { init: () => { localStorage.setItem('lunden.name', 'Fia'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => window.__app?.fishing && window.__app.cat, null, { timeout: 1500000 });
    await page.evaluate(setup);
    const p = (f, ...x) => page.evaluate(f, ...x);
    const shot = async (file) => { await kit.shot(page, `${out}/${file}`); };
    await p(() => T.pump(600));
    const watch = (both) => p((both) => { // low and close (camera 1.2 m to the side, 0.8 m up; closer for the eating cat, 0.7 m / 0.55 m, so the bite is clear), at the cat (and the fish lying next to it when `both`)
      const c = T.cat.object.position, P = T.a.player, f = T.Fi.fish[0], fp = f ? f.middle(new T.THREE.Vector3()) : c;
      const tx = both ? (c.x + fp.x) / 2 : c.x - 0.15, tz = c.z, ty = c.y + 0.12; const D = both ? 1.2 : 0.7, H = both ? 0.8 : 0.55; P.spawn(tx, tz + D, 0); T.a.step(0.001);
      const cam = T.a.camera; cam.position.set(tx, c.y + H, tz + D); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld(true);
    }, both);

    // 1. a raw fish put down near an ordinary cat: it goes there, eats it (shrinking), the fish is gone, counted and scored once
    const r1 = await p(async () => {
      const A = T.a, at = T.spawn(0, false), f = T.lay(true, at), s0 = A.totalScore(), n0 = A.stats.catFishFeeds ?? 0, e0 = A.stats.fishEaten ?? 0, q0 = JSON.stringify(A.stats.fishQuestSteps ?? null);
      const saw = { notice: false, walk: false, eat: false, shrunk: false };
      for (let t = 0; t < 30 && !f.broken; t += 0.05) {
        A.step(0.05); const ph = T.cat.fish?.phase; if (ph) saw[ph] = true; if (ph === 'eat' && f.model.scale.x < 0.9) saw.shrunk = true;
      }
      T.run(1);
      return { gone: f.broken, saw, feeds: (A.stats.catFishFeeds ?? 0) - n0, pts: A.totalScore() - s0, fishEaten: (A.stats.fishEaten ?? 0) - e0, questSame: JSON.stringify(A.stats.fishQuestSteps ?? null) === q0, inList: T.Fi.fish.includes(f) };
    });
    check(r1.gone && r1.saw.notice && r1.saw.walk && r1.saw.eat && r1.saw.shrunk, 'a raw fish near the cat: it notices, walks there, eats it (the fish shrinks) and the fish is gone', r1);
    check(r1.feeds === 1 && r1.pts === 5 && r1.fishEaten === 0 && r1.questSame && !r1.inList, 'counted once (catFishFeeds, +5), not as the player eating it (fishEaten) and the quest untouched', r1);

    // 2. a cooked and a burnt fish do not lure it
    const r2 = await p(async () => {
      const A = T.a, at = T.spawn(0, false), s0 = A.totalScore(), n0 = A.stats.catFishFeeds ?? 0;
      const cooked = T.lay(false, at), burnt = T.lay(false, at, -1.3); burnt.cook = T.cfg.FISHING.cook.burn; burnt.paint();
      let looked = false; for (let t = 0; t < 8; t += 0.05) { A.step(0.05); if (T.cat.fish) looked = true; }
      return { looked, cooked: !cooked.broken, burnt: !burnt.broken, state: [cooked.cookState, burnt.cookState], feeds: (A.stats.catFishFeeds ?? 0) - n0, pts: A.totalScore() - s0 };
    });
    check(!r2.looked && r2.cooked && r2.burnt && r2.feeds === 0, 'a cooked / burnt fish near the cat: ignored, nothing eaten, no points', r2);
    await watch(true); await kit.shot(page, `${out}/katten-struntar-i-tillagad-fisk.png`); check(true, 'picture katten-struntar-i-tillagad-fisk.png');
    await p(() => { for (const f of T.Fi.fish) f.remove(); T.Fi.fish = []; });

    // 3. the picture: the cat bent over the raw fish, eating
    const at3 = await p(() => { const at = T.spawn(0, false); T.lay(true, at, -0.7); return at; });
    const ate = await p(() => T.pump(20000, 0.05, () => T.cat.fish?.phase === 'eat' && T.cat.fish.t > 1.2));
    await watch(false); await shot('katten-aeter-ra-fisk.png');
    check(ate, 'the cat is seen eating (picture katten-aeter-ra-fisk.png)');
    await p(() => T.pump(8000, 0.05, () => !T.cat.fish)); await p(() => { for (const f of T.Fi.fish) f.remove(); T.Fi.fish = []; });

    // 4. a raw fish held out: the cat comes to it, eats it out of the hand; the hand is empty after
    const r4 = await p(async () => {
      const A = T.a, at = T.spawn(1, false), P = A.player, f = T.Fi.addFish({ species: 'mört', cm: 18, raw: true }, new T.THREE.Vector3(P.pos.x, P.pos.y, P.pos.z)); f.take();
      const n0 = A.stats.catFishFeeds ?? 0, held0 = A.heldItem() === f; T.a.camera.rotation.set(-0.3, -Math.PI / 2, 0, 'YXZ');
      for (let t = 0; t < 30 && !f.broken; t += 0.05) A.step(0.05);
      return { held0, gone: f.broken, handEmpty: !A.heldItem(), feeds: (A.stats.catFishFeeds ?? 0) - n0 };
    });
    check(r4.held0 && r4.gone && r4.handEmpty && r4.feeds === 1, 'a raw fish held out in the hand: the cat eats it from there (any breed), once', r4);

    // 5. a kitten too
    const r5 = await p(async () => {
      const A = T.a, at = T.spawn(0, true), f = T.lay(true, at), n0 = A.stats.catFishFeeds ?? 0;
      for (let t = 0; t < 30 && !f.broken; t += 0.05) A.step(0.05);
      return { kitten: T.cat.kitten, gone: f.broken, feeds: (A.stats.catFishFeeds ?? 0) - n0 };
    });
    check(r5.kitten && r5.gone && r5.feeds === 1, 'a kitten eats a raw fish too', r5);

    // 6. the squirrels and the fish quest are not involved; the stats list shows the row
    const r6 = await p(() => { document.body.dataset.t = ''; return { row: T.a.stats.catFishFeeds, quest: T.a.stats.fishQuestSteps?.t ?? 0 }; });
    check(r6.row === 4 && !r6.quest, 'four raw fish fed in all; the quest is not completed', r6);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
