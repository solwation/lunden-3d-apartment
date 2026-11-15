// The inventory (#1954): one headless page (solo). Start the site first:
//   python3 tools/devserve.py 8137 .
//   [SHOTS=/dir] tools/browsertest.sh node tools/inventorytest.cjs http://localhost:8137
// Checks, with the real things of the game: a second and third thing taken while one is held go to their own places (nothing is
// sent home, nothing duplicated: one model in the hand, the others detached); choosing a place / stepping with the wheel's function
// swaps the hand; only the held weapon is the weapon; the row in the HUD shows the places, the hand's highlighted; squirrel nuts
// stack on one place and come back one by one; a cup keeps the one-at-a-time rule; putting the held thing back frees its place;
// the touch button opens the row and a tap on a box chooses. Screenshots: the row with three things, the touch row.
// Not covered: the real wheel / F keys (they need pointer lock: the handlers call the same pickSlot / cycleSlot), the bicycle.
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8137', shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 30 * 60000).unref();

(async () => {
  const browser = await kit.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&cloud=&quality=0&month=7&time=13&freeze&weather=clear&mess=0&at=-218.5,233.55,31,-20`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__inventory && window.__harpoon !== undefined, null, { timeout: 1500000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const run = (n = 1, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) window.__app.frame(dt); }, [n, dt]);
    const shot = async (name) => { await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); }); await page.screenshot({ path: `${shots}/${name}.png`, timeout: 300000 }); };
    await run(3);
    await page.evaluate(() => {
      const I = window.__inventory, app = window.__app;
      window.__it = {
        slots: () => I.inventorySlots().map((s) => ({ n: s.count, on: s.active, name: s.item?.name ?? null })),
        inHand: (x) => app.heldItem() === x && x.held && x.model.parent === app.camera,
        away: (x) => app.heldItem() !== x && !x.held && !x.model.parent,
        row: () => { const r = document.getElementById('inventory'); return { hidden: r.hidden, boxes: [...r.children].map((b) => ({ on: b.classList.contains('on'), icon: b.children[1].textContent, count: b.children[2].textContent, key: b.children[0].textContent })) }; },
      };
      document.getElementById('hud').hidden = false; // (the &shot page keeps the HUD hidden)
    });
    const three = await page.evaluate(() => {
      const h = window.__harpoon, b = window.__bow, k = window.__binoculars, T = window.__it, app = window.__app, out = {};
      h.take(); app.frame(0.05); out.one = { slots: T.slots(), h: T.inHand(h) };
      out.blockedBefore = b.takeTarget.blocked;
      b.take(); app.frame(0.05); out.two = { slots: T.slots(), b: T.inHand(b), h: T.away(h) };
      k.take(); app.frame(0.05); out.three = { slots: T.slots(), k: T.inHand(k), b: T.away(b), h: T.away(h) };
      out.row = T.row();
      return out;
    });
    check(three.one.h && three.one.slots[0].n === 1 && three.one.slots[0].on, 'the first thing is in the hand, on place 1', JSON.stringify(three.one.slots));
    check(three.blockedBefore === false, 'a second thing is not blocked while a carriable one is held');
    check(three.two.b && three.two.h && three.two.slots[1].on && three.two.slots[0].n === 1, 'the second thing takes place 2; the first is carried (detached, not sent home)', JSON.stringify(three.two.slots));
    check(three.three.k && three.three.b && three.three.h && three.three.slots.map((s) => s.n).join('') === '11100', 'three things on three places, one model in the hand', JSON.stringify(three.three.slots));
    check(!three.row.hidden && three.row.boxes.length === 5 && three.row.boxes[2].on && three.row.boxes[0].icon === '🔱' && three.row.boxes[1].icon === '🏹' && three.row.boxes[2].icon === '🔭' && three.row.boxes[4].key === 'F6', 'the HUD row shows the five places, the hand\'s highlighted', JSON.stringify(three.row.boxes));
    await page.evaluate(() => window.__app.camera.rotation.set(-0.05, 0.6, 0, 'YXZ'));
    await run(2);
    await shot('inventory-row');
    const swap = await page.evaluate(() => {
      const h = window.__harpoon, b = window.__bow, k = window.__binoculars, T = window.__it, I = window.__inventory, app = window.__app, out = {};
      out.r1 = I.pickSlot(0); app.frame(0.05); out.first = T.inHand(h) && T.away(b) && T.away(k);
      out.fire = h.shoot(); for (let i = 0; i < 4; i++) app.frame(1 / 60); // the spear is out …
      out.r2 = I.pickSlot(1); app.frame(0.05); out.second = T.inHand(b) && T.away(h); out.spearBack = h.st.phase === 'ready' && !h.line.visible; // … and is back when the gun is put away
      const n = window.__arrows.fired; b.use(); out.arrow = window.__arrows.fired - n;
      out.wheel = I.cycleSlot(1); app.frame(0.05); out.third = T.inHand(k);
      out.wheel2 = I.cycleSlot(1); app.frame(0.05); out.wrap = T.inHand(h);
      out.empty = I.pickSlot(4); app.frame(0.05); out.hand = app.heldItem() === null; out.slots = T.slots();
      out.back = I.cycleSlot(-1); app.frame(0.05); out.prev = T.inHand(k);
      return out;
    });
    check(swap.r1 === true && swap.first, 'choosing place 1 puts the harpoon gun back in the hand');
    check(swap.fire && swap.r2 === true && swap.second && swap.spearBack, 'put away mid-shot: the spear is back on the gun, the bow in the hand');
    check(swap.arrow === 1, 'the held weapon shoots (the bow\'s arrow)');
    check(swap.wheel && swap.third && swap.wheel2 && swap.wrap, 'stepping forward goes through the carried things and wraps round');
    check(swap.empty === true && swap.hand && swap.slots.map((s) => s.n).join('') === '11100', 'an empty place = empty hands, everything still carried', JSON.stringify(swap.slots));
    check(swap.back && swap.prev, 'stepping back from the empty place finds the nearest carried thing');

    const nuts = await page.evaluate(() => {
      const T = window.__it, I = window.__inventory, app = window.__app, sq = app.squirrels;
      const free = (sq?.nutItems ?? []).filter((n) => !n.broken && !n.held && n.slot.alive);
      if (free.length < 3) return { few: free.length };
      I.pickSlot(4);
      const got = free.slice(0, 3); for (const n of got) { n.take(); app.frame(0.05); }
      const out = { slots: T.slots(), top: T.inHand(got[2]), under: T.away(got[0]) && T.away(got[1]), row: T.row().boxes[4] };
      got[2].putBack(); app.frame(0.05); app.frame(0.05);
      out.next = T.inHand(got[1]); out.after = T.slots()[4].n;
      return out;
    });
    if (nuts.few !== undefined) console.log(`NOTE only ${nuts.few} nuts lie out now: the stacking is covered by src/inventory.test.mjs only`);
    else {
      check(nuts.slots[4].n === 3 && nuts.top && nuts.under && nuts.row.count === '3' && nuts.row.icon === '🌰', 'three nuts share one place; the row shows the count', JSON.stringify(nuts.slots));
      check(nuts.next && nuts.after === 2, 'the held nut put down: the next one comes into the hand');
    }

    const rest = await page.evaluate(() => {
      const h = window.__harpoon, b = window.__bow, T = window.__it, I = window.__inventory, app = window.__app, out = {};
      I.pickSlot(1); app.frame(0.05);
      b.putBack(); app.frame(0.05);
      out.bowHome = !b.held && b.model.parent === app.scene && b.model.position.distanceTo(b.home.pos) < 0.01; out.slots = T.slots();
      I.pickSlot(0); app.frame(0.05); out.h = T.inHand(h);
      return out;
    });
    check(rest.bowHome && rest.slots[1].n === 0, 'the held thing put back in its box leaves its place empty', JSON.stringify(rest.slots));
    check(rest.h, 'the others are still carried');
    // touch: the button opens the row, a tap on a box chooses
    await page.evaluate(() => { document.body.classList.add('touch'); window.__inventory.hud.touch = () => true; window.__app.frame(0.05); });
    const t0 = await page.evaluate(() => ({ btn: document.getElementById('inventory-btn').hidden, row: document.getElementById('inventory').hidden }));
    check(t0.btn === false && t0.row === true, 'touch: the 🎒 button is shown, the row closed', JSON.stringify(t0));
    await page.evaluate(() => document.getElementById('inventory-btn').click()); await run(1); // (a DOM click: on this &shot page the canvas lies over the forced-open HUD)
    check(await page.evaluate(() => !document.getElementById('inventory').hidden), 'touch: the button opens the row');
    await shot('inventory-touch');
    await page.evaluate(() => document.querySelector('#inventory button:nth-child(3)').click()); await run(1);
    const t1 = await page.evaluate(() => ({ k: window.__it.inHand(window.__binoculars), row: document.getElementById('inventory').hidden }));
    check(t1.k && t1.row, 'touch: a tap on a box puts that thing in the hand and closes the row', JSON.stringify(t1));
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { console.log(`FAIL ${e.stack || e}`); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
