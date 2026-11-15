// Food and cups in the inventory (#1960): one headless page, reloaded for real (pagehide → goto, then page.reload like #1959).
//   python3 tools/devserve.py 8195 .
//   [SHOTS=/dir] nice -n 15 tools/browsertest.sh node tools/inventoryfoodtest.cjs http://localhost:8195
// A cup with coffee, a fruit, a fish finger and a glass go on separate places; swapping brings each back unchanged; one sip and one
// bite from the hand; the whole row comes back after a reload (goto and F5); a cup put down afterwards is a normal dirty cup (once).
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8195', shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 30 * 60000).unref();
const URL_ = `${game}/?shot&cloud=&quality=0&month=7&time=13&freeze&weather=clear&mess=0`;
const DESCRIBE = () => {
  const app = window.__app, I = window.__inventory;
  return I.inventorySlots().map((s) => { const it = s.item; return { n: s.count, on: s.active, name: it?.name ?? null, cup: !!it?.isCup, fruit: !!it?.isFruit, fish: !!it?.isFish, a: it?.contents ? JSON.stringify(it.contents.a) : null, bites: it?.bites ?? null, dirty: it?.dirty ?? null }; });
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
      await page.waitForFunction(() => window.__app?.renderer && window.__inventory && window.__harpoon !== undefined, null, { timeout: 1500000 });
      await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    };
    const run = (n = 1, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    const describe = () => page.evaluate(DESCRIBE);
    await page.goto(URL_, { waitUntil: 'commit' });
    await ready();
    await run(3);
    const first = await page.evaluate(() => {
      const app = window.__app, out = {};
      document.getElementById('hud').hidden = false;
      const cup = app.cups.cups[0];
      cup.take(); cup.contents.clear(); cup.contents.a = { coffee: 0.8 }; cup.heat = 0.9; cup.show(); app.frame(0.05);
      const fruit = app.fruit.fruit.find((f) => f.kind === 'apple') ?? app.fruit.fruit[0]; fruit.take(); app.frame(0.05);
      fruit.use(); for (let i = 0; i < 20; i++) app.frame(0.05); // one bite
      const fing = app.fish.fingers.find((f) => f.state === 'box'); out.fing = !!fing; if (fing) { fing.take(); app.frame(0.05); }
      const glass = app.things.find((t) => t.constructor.name === 'Glass' && !t.held && !t.placed); out.glass = !!glass; if (glass) { glass.take(); app.frame(0.05); }
      out.cupPuts = cup.state; out.fruitBites = fruit.bites; out.cupParent = !!cup.model.parent;
      return out;
    });
    console.log('first', JSON.stringify(first));
    let d = await describe();
    console.log(JSON.stringify(d));
    const expected = 2 + (first.fing ? 1 : 0) + (first.glass ? 1 : 0);
    check(d.filter((s) => s.n).length === expected, 'cup, fruit' + (first.fing ? ', fish finger' : '') + (first.glass ? ', glass' : '') + ' are carried on separate places', `${d.filter((s) => s.n).length}/${expected}`);
    check(first.fruitBites === 1 && !first.cupParent, 'one bite taken; the carried cup has no model in the world');
    // swap to the cup, drink, swap back, eat
    const sw = await page.evaluate(() => {
      const app = window.__app, I = window.__inventory, cups = app.cups.cups;
      const slots = I.inventorySlots(), ci = slots.findIndex((s) => s.item?.isCup), fi = slots.findIndex((s) => s.item?.isFruit);
      I.selectSlot(ci); app.frame(0.05);
      const cup = app.heldItem(), before = cup.fill;
      cup.use(); for (let i = 0; i < 30; i++) app.frame(0.05);
      const out = { inHand: cup.isCup && cup.held && cup.model.parent === app.camera, drank: cup.fill < before, dirty: cup.dirty, heat: cup.heat };
      I.selectSlot(fi); app.frame(0.05);
      const fruit = app.heldItem(); const b = fruit.bites; fruit.use(); for (let i = 0; i < 20; i++) app.frame(0.05);
      out.ate = fruit.isFruit && fruit.bites === b + 1; out.cupHeld = cups.filter((c) => c.state === 'held').length;
      return out;
    });
    console.log('swap', JSON.stringify(sw));
    check(sw.inHand && sw.drank && sw.dirty, 'swapping to the cup puts it in the hand; a sip goes down and the cup is dirty', JSON.stringify(sw));
    check(sw.ate && sw.cupHeld === 1, 'swapping to the fruit: a bite from the hand; exactly one cup counts as held (no duplicate)');
    d = await describe(); const want = d;
    await run(2);
    await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); });
    await page.screenshot({ path: `${shots}/inventory-food-before.png`, timeout: 300000 });
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const saved = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('lunden.playerWorld') ?? 'null'); return r?.world?.inventory ?? null; });
    check(!!saved && saved.s.flat().length === expected, 'the playerWorld record carries cup, food and glass', JSON.stringify(saved)?.slice(0, 300));
    await page.goto(URL_, { waitUntil: 'commit' });
    await ready(); await run(3);
    d = await describe();
    console.log('want ', JSON.stringify(want)); console.log('after', JSON.stringify(d));
    check(JSON.stringify(d) === JSON.stringify(want), 'goto: the same things on the same places, with contents, bites and dirt');
    await page.evaluate(() => { document.getElementById('hud').hidden = false; });
    await run(2);
    await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); });
    await page.screenshot({ path: `${shots}/inventory-food-after-reload.png`, timeout: 300000 });
    await page.evaluate(() => window.__inventory.selectSlot(1)); await run(1);
    const want5 = await describe();
    await page.reload({ waitUntil: 'commit' });
    await ready(); await run(3);
    const d5 = await describe();
    check(JSON.stringify(d5) === JSON.stringify(want5), 'F5 (page.reload): the same places and the same things');
    // dish rules: the carried cup put down is one normal dirty cup
    const dish = await page.evaluate(() => {
      const app = window.__app, I = window.__inventory;
      const ci = I.inventorySlots().findIndex((s) => s.item?.isCup); I.selectSlot(ci); app.frame(0.05);
      const cup = app.heldItem(); const fill = cup.fill;
      cup.placeAt(app.cups.counter ?? cup.counter); app.frame(0.05);
      const same = app.cups.cups.filter((c) => c === cup).length;
      return { placed: cup.state === 'placed', dirty: cup.dirty, kept: Math.abs(cup.fill - fill) < 1e-6 && fill > 0, other: app.cups.cups.filter((c) => c.state === 'held').length, same, left: I.inventorySlots().filter((s) => s.count).length };
    });
    console.log('dish', JSON.stringify(dish));
    check(dish.placed && dish.dirty && dish.kept && dish.other === 0, 'the cup put down is a placed, dirty cup with its coffee left; none is left in a hand', JSON.stringify(dish));
    check(dish.left === expected - 1, 'its place is free again');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { console.log('FAIL exception', e.stack ?? e); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
