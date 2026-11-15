// #1959: the inventory survives a page reload (keep.js `inventory`). One headless page, reloaded for real (pagehide → playerWorld → new page).
//   python3 tools/devserve.py 8137 .
//   [SHOTS=/dir] tools/browsertest.sh node tools/inventorykeeptest.cjs http://localhost:8137
// Carries three things on three places and a nut (when the park has one lying out), makes place 2 the active one, reloads, and
// checks: the same things on the same places, the same active place, models detached / in the hand like before, nothing home,
// the HUD row shows them. Screenshot: the row after the reload.
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8137', shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 30 * 60000).unref();
const URL_ = (at) => `${game}/?shot&cloud=&quality=0&month=7&time=13&freeze&weather=clear&mess=0${at ? '&at=-218.5,233.55,31,-20' : ''}`;

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
    const run = (n = 1) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__app.frame(0.05); }, n);
    await page.goto(URL_(true), { waitUntil: 'commit' });
    await ready();
    await run(3);
    const before = await page.evaluate(() => {
      const app = window.__app, I = window.__inventory, out = {};
      document.getElementById('hud').hidden = false;
      window.__harpoon.take(); app.frame(0.05); window.__bow.take(); app.frame(0.05); window.__binoculars.take(); app.frame(0.05);
      const sq = app.squirrels, nut = (sq?.nutItems ?? []).find((n) => !n.broken && !n.held && n.slot.alive);
      if (nut) { nut.take(); app.frame(0.05); }
      out.nut = !!nut;
      out.slots = I.inventorySlots().map((s) => ({ n: s.count, on: s.active, name: s.item?.name ?? null }));
      out.active = I.inventorySlots().findIndex((s) => s.active);
      return out;
    });
    console.log('before', JSON.stringify(before.slots), 'nut:', before.nut);
    check(before.slots.filter((s) => s.n).length === (before.nut ? 4 : 3), 'things are carried on separate places before the reload');
    await page.evaluate(() => { window.__inventory.selectSlot(1); window.__app.frame(0.05); });
    const want = await page.evaluate(() => window.__inventory.inventorySlots().map((s) => ({ n: s.count, on: s.active, name: s.item?.name ?? null })));
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const saved = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('lunden.playerWorld') ?? 'null'); return r?.world?.inventory ?? null; });
    check(!!saved && saved.s.flat().length === (before.nut ? 4 : 3), 'the playerWorld record carries the inventory part', JSON.stringify(saved));
    await page.goto(URL_(false), { waitUntil: 'commit' });
    await ready();
    await run(3);
    const after = await page.evaluate(() => {
      const app = window.__app, I = window.__inventory;
      document.getElementById('hud').hidden = false;
      const r = document.getElementById('inventory');
      return { slots: I.inventorySlots().map((s) => ({ n: s.count, on: s.active, name: s.item?.name ?? null })), hand: app.heldItem()?.name ?? null,
        handOk: !app.heldItem() || (app.heldItem().held && app.heldItem().model.parent === app.camera),
        row: [...r.children].map((b) => b.children[1].textContent + b.children[2].textContent), hidden: r.hidden, heldCount: [window.__harpoon, window.__bow, window.__binoculars].filter((x) => x.held).length };
    });
    console.log('want  ', JSON.stringify(want)); console.log('after ', JSON.stringify(after.slots));
    check(JSON.stringify(after.slots) === JSON.stringify(want), 'the same things on the same places, the same active place after the reload');
    check(after.handOk && after.heldCount === 1, 'exactly one model in the hand, the others carried (never duplicated)', `hand ${after.hand}`);
    check(!after.hidden, 'the HUD row is shown again', after.row.join(' '));
    await run(2);
    await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); });
    await page.screenshot({ path: `${shots}/inventory-after-reload.png`, timeout: 300000 });
    const again = await page.evaluate(() => { const I = window.__inventory; I.selectSlot(0); window.__app.frame(0.05); return { h: window.__app.heldItem() === window.__harpoon, bow: window.__bow.held === false }; });
    check(again.h && again.bow, 'choosing place 1 after the reload swaps in the harpoon as before');
    // F5 (#1959 review): a plain browser reload of the same tab, no synthetic pagehide; place 1 is active now.
    const want5 = await page.evaluate(() => window.__inventory.inventorySlots().map((s) => ({ n: s.count, on: s.active, name: s.item?.name ?? null })));
    await page.reload({ waitUntil: 'commit' });
    await ready();
    await run(3);
    const after5 = await page.evaluate(() => window.__inventory.inventorySlots().map((s) => ({ n: s.count, on: s.active, name: s.item?.name ?? null })));
    console.log('want5 ', JSON.stringify(want5)); console.log('after5', JSON.stringify(after5));
    check(JSON.stringify(after5) === JSON.stringify(want5), 'F5 (page.reload) brings back the same places and active place');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { console.log('FAIL exception', e.stack ?? e); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
