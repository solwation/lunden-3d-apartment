// The whole chicken and several chicken pieces in the inventory (#1983): one headless page, reloaded for real (pagehide → goto, then page.reload).
//   python3 -m http.server 8199 --bind 127.0.0.1
//   [SHOTS=/dir] nice -n 15 tools/browsertest.sh node tools/inventorychickentest.cjs http://localhost:8199
// A cooked bird gives two legs and a bit of the body (three pieces alive at once) and is itself taken: four places. One piece is bitten
// from the hand, places are swapped, everything (bites, which parts are gone, the cooking) comes back after goto and F5; eating the last
// piece of the carried ones frees only its own place.
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8199', shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 30 * 60000).unref();
const URL_ = `${game}/?shot&cloud=&quality=0&month=7&time=13&freeze&weather=clear&mess=0`;
const DESCRIBE = () => {
  const app = window.__app, I = window.__inventory, b = app.chicken;
  return { slots: I.inventorySlots().map((s) => { const it = s.item; return { n: s.count, on: s.active, piece: !!it?.isChickenPiece, whole: it === b, name: it?.name ?? null, bites: it?.bites ?? null, id: it?.portionId ?? null }; }),
    bird: { gone: b.parts.map((p) => !!p.gone), left: b.bodyLeft, done: b.done, cooked: Math.round(b.cooked), pieces: b.pieces.length, gen: b.generation } };
};
(async () => {
  const browser = await kit.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const ready = async () => {
      await page.waitForFunction(() => window.__app?.renderer && window.__app.chicken && window.__inventory && window.__harpoon !== undefined, null, { timeout: 1500000 });
      await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    };
    const run = (n = 1, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    const describe = () => page.evaluate(DESCRIBE);
    const shot = async (name) => {
      await page.evaluate(() => { document.getElementById('hud').hidden = false; });
      await run(2);
      await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); });
      await page.screenshot({ path: `${shots}/${name}.png`, timeout: 300000 });
    };
    await page.goto(URL_, { waitUntil: 'commit' });
    await ready(); await run(3);
    const first = await page.evaluate(() => {
      const app = window.__app, b = app.chicken, out = {};
      b.loadState({ v: 1, generation: 0, cooked: 15, brown: 0, done: true, rewarded: true, burntCounted: false, gone: [false, false, false, false], bodyLeft: 3, place: null });
      app.frame(0.05);
      out.done = b.done;
      b.breakOff(b.parts[0]); app.frame(0.05); const p1 = app.heldItem();
      b.breakOff(b.parts[1]); app.frame(0.05); const p2 = app.heldItem();
      p2.use(); for (let i = 0; i < 20; i++) app.frame(0.05); // one bite
      b.breakOff(null); app.frame(0.05); const p3 = app.heldItem();
      out.distinct = new Set([p1, p2, p3]).size; out.alive = b.pieces.length; out.p2bites = p2.bites;
      b.take(); app.frame(0.05); out.wholeInHand = app.heldItem() === b;
      return out;
    });
    console.log('first', JSON.stringify(first));
    let d = await describe(); console.log(JSON.stringify(d));
    check(first.done && first.distinct === 3 && first.alive === 3, 'two legs and a body piece exist at once (three distinct pieces alive)', JSON.stringify(first));
    check(d.slots.filter((s) => s.n).length === 4 && d.slots.filter((s) => s.piece).length === 3 && d.slots.some((s) => s.whole && s.on), 'three pieces on three places and the whole bird in the hand', JSON.stringify(d.slots.map((s) => s.name)));
    check(first.p2bites === 1 && d.slots.some((s) => s.piece && s.bites === 1), 'the bitten piece keeps its bite while carried');
    const sw = await page.evaluate(() => {
      const app = window.__app, I = window.__inventory, b = app.chicken;
      const i = I.inventorySlots().findIndex((s) => s.item?.isChickenPiece && s.item.bites === 0 && s.item !== app.heldItem());
      I.selectSlot(i); app.frame(0.05);
      const p = app.heldItem(), out = { inHand: !!p?.isChickenPiece && p.held && p.model.parent === app.camera, wholeCarried: !b.held && !b.model.parent };
      p.use(); for (let k = 0; k < 20; k++) app.frame(0.05);
      out.bites = p.bites; // (a piece is eaten at the second bite: C.bites = 2)
       out.parts = b.parts.map((x) => !!x.gone);
      return out;
    });
    check(sw.inHand && sw.wholeCarried && sw.bites === 1, 'swapping to a never-bitten piece puts it in the hand (the bird stays carried, no model in the world); a bite from the hand', JSON.stringify(sw));
    d = await describe(); const want = d;
    await shot('inventory-chicken-before');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const saved = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('lunden.playerWorld') ?? 'null'); return r?.world?.inventory ?? null; });
    check(!!saved && saved.s.flat().length === 4, 'the playerWorld record carries three pieces and the whole bird', JSON.stringify(saved)?.slice(0, 400));
    await page.goto(URL_, { waitUntil: 'commit' });
    await ready(); await run(3);
    d = await describe();
    console.log('want ', JSON.stringify(want)); console.log('after', JSON.stringify(d));
    check(JSON.stringify(d) === JSON.stringify(want), 'goto: the same pieces, bird, bites and cooking on the same places');
    await shot('inventory-chicken-after-reload');
    await page.evaluate(() => window.__inventory.selectSlot(window.__inventory.inventorySlots().findIndex((s) => s.item === window.__app.chicken))); await run(1);
    const want5 = await describe();
    await page.reload({ waitUntil: 'commit' });
    await ready(); await run(3);
    const d5 = await describe();
    check(JSON.stringify(d5) === JSON.stringify(want5), 'F5 (page.reload): the same places and things');
    // eat one carried piece up: only its place is freed; the others and the bird stay
    const eat = await page.evaluate(() => {
      const app = window.__app, I = window.__inventory, b = app.chicken;
      const i = I.inventorySlots().findIndex((s) => s.item?.isChickenPiece && s.item.bites === 1 && s.item !== app.heldItem());
      I.selectSlot(i); app.frame(0.05);
      const p = app.heldItem();
      while (p.bites < 2 && p.held) { p.use(); for (let k = 0; k < 20; k++) app.frame(0.05); }
      app.frame(0.05);
      return { eaten: !p.held, alive: b.pieces.length, places: I.inventorySlots().filter((s) => s.count).length, restocked: b.generation };
    });
    check(eat.eaten && eat.alive === 2 && eat.places === 3 && eat.restocked === 0, 'eating a piece up frees only its place; the other pieces and the bird stay (no new chicken yet)', JSON.stringify(eat));
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { console.log('FAIL exception', e.stack ?? e); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
