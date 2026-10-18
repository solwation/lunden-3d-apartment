// Washing up the free-standing glasses (#1238): the wine, whisky and champagne glasses from the glass cabinet are dishes like the
// coffee cups: drunk from (used) they are washed by hand at the running kitchen tap ("diska vinglaset"; with a drink in them it
// is poured out first) or stood in the dishwasher's upper rack and washed by the programme, and taken out again. The right-click
// "Skåla" action on a held glass stays. Screenshots into OUT.
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/glasswashtest.cjs http://localhost:8781 /tmp/glasswash
const kit = require('./testkit.cjs');
const fs = require('fs');
const [base = 'http://localhost:8781', out = '/tmp/glasswash'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };

(async () => {
  const browser = await kit.launch();
  try {
    const { page } = await kit.open(browser, `${base}/?life&shot`, { lazy: true });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluate(() => document.getElementById('start-touch')?.click());
    const names = ['vinglaset', 'whiskyglaset', 'champagneglaset'];
    const results = await page.evaluate((names) => {
      const A = window.__app, { life, step, things, dishProg } = A, I = life.items, res = [];
      const secs = (s) => { for (let t = 0; t < s; t += 1 / 20) step(1 / 20); };
      const tap = A.taps.find((t) => t.name === 'köksblandaren');
      const row = (id, target) => life.options(target).find((o) => o.id === id);
      const run = (id, target, s) => { const r = row(id, target); const ok = !!r && !r.reason && r.run(); secs(s + 0.2); return ok ? true : r?.reason ?? `no ${id}`; };
      const door = A.world.lids.find((l) => l.name === 'diskmaskinen'), [lower, upper] = door.racks, S = A.lifeStores.stores;
      if (!tap.isOpen) tap.toggle();
      door.isOpen = true; door.t = 1; door.pose(1); upper.isOpen = true; upper.t = 1; upper.pose(1); lower.isOpen = true; lower.t = 1; lower.pose(1);
      const washedBefore = () => A.stats.washed ?? 0;
      for (const name of names) {
        const g = things.find((t) => t.kind === 'glass' && t.name === name), r = { name };
        if (!g) { r.missing = true; res.push(r); continue; }
        g.take(); step(1 / 60);
        r.held = A.heldItem() === g;
        r.cleanReason = row('wash', tap)?.reason; // clean: nothing to wash
        r.alt = g.altLabel;
        g.contents.set('wine', 0.5); g.show(); g.use(); secs(0.5); // a sip: used, still wine in it
        r.used = g.used; r.dirty = g.dirty; r.fillBefore = g.fill > 0.01;
        r.fullReason = row('wash', tap)?.reason;
        r.pourOut = run('pourOut', tap, 2); r.emptied = g.fill <= 0.01;
        const w0 = washedBefore();
        r.wash = run('wash', tap, 5); r.afterWash = { used: g.used, dirty: g.dirty }; r.counted = washedBefore() === w0 + 1;
        r.again = row('wash', tap)?.reason;
        // the dishwasher
        g.contents.set('wine', 0.3); g.show(); g.use(); secs(0.5); g.contents.clear(); g.show(); g.use?.();
        g.used = true;
        const putIn = row('putIn', S.dwUpper.target);
        r.putIn = putIn?.reason ?? 'ok'; r.putLabel = putIn?.label;
        r.putLower = row('putIn', S.dwLower.target)?.reason;
        r.put = run('putIn', S.dwUpper.target, 0.2);
        r.parts = { inMap: [...S.dwUpper.parkedCups.values()].includes(g), held: A.heldItem() === g, gheld: g.held, store: !!g.rackStore };
        r.parked = [...S.dwUpper.parkedCups.values()].includes(g) && A.heldItem() !== g && !g.held && !!g.rackStore;
        r.dirtyInside = dishProg.dirtyCupsInside().includes(g); r.dbg = { used: g.used, inside: dishProg.cupsInside().includes(g) };
        door.isOpen = false; door.t = 0;
        r.started = dishProg.start();
        dishProg.left = 0.01; secs(1); if (dishProg.state !== 'done') dishProg.finish();
        r.cleanAfter = !g.used;
        door.isOpen = true; door.t = 1; dishProg.state = 'idle';
        g.take(); step(1 / 60);
        r.takenBack = A.heldItem() === g && !g.rackStore && ![...S.dwUpper.parkedCups.values()].includes(g);
        g.putBack();
        res.push(r);
      }
      return res;
    }, names);
    for (const r of results) {
      check(!r.missing, `${r.name} exists`);
      if (r.missing) continue;
      check(r.held && r.cleanReason?.includes('redan'), `${r.name}: held, clean one says "${r.cleanReason}"`);
      check(r.alt === 'Skåla', `${r.name}: right-click action "${r.alt}" kept`);
      check(r.used && r.dirty && r.fillBefore, `${r.name}: drunk from is used/dirty`);
      check(/Häll ut/.test(r.fullReason ?? ''), `${r.name}: with wine in: "${r.fullReason}"`);
      check(r.pourOut === true && r.emptied, `${r.name}: poured out at the tap (${r.pourOut})`);
      check(r.wash === true && !r.afterWash.used && !r.afterWash.dirty && r.counted, `${r.name}: washed by hand (${r.wash})`);
      check(/redan/.test(r.again ?? ''), `${r.name}: again "${r.again}"`);
      check(r.putIn === 'ok' && r.put === true && r.parked && r.dirtyInside, `${r.name}: in the upper rack (${r.putIn}/${r.put}) ${JSON.stringify(r.parts)} inside=${r.dirtyInside} ${JSON.stringify(r.dbg)}`);
      check(/överkorgen|Tallrikar|Glas/.test(r.putLower ?? ''), `${r.name}: not in the lower rack "${r.putLower}"`);
      check(r.started && r.cleanAfter, `${r.name}: the dishwasher programme washes it`);
      check(r.takenBack, `${r.name}: taken out of the rack again`);
    }
    await page.evaluate(() => { // a wine glass parked in the open upper rack, looked at
      const A = window.__app, g = A.things.find((t) => t.name === 'vinglaset'), S = A.lifeStores.stores;
      g.take(); g.used = true; A.life.items.store('dwUpper').parkCup(g, A.life.items.store('dwUpper').freeSlot(g)); A.scene.updateMatrixWorld(true);
      const p = g.where(), V = p.constructor, c = A.camera;
      A.player.spawn(p.x - 0.8, p.z, 0); c.position.set(p.x - 0.55, p.y + 0.45, p.z); c.lookAt(p); A.step(1 / 60); console.log('glass', p.toArray().map((v) => v.toFixed(2)).join(','));
    });
    await kit.shot(page, `${out}/rack.png`);
    // reload (#1245): the glass stays parked in the rack — dirty / clean kept, door open or shut — through a page-made reload
    // (the same save/restore path as "Ny version laddad": keep.js things.save/load). A fresh page without &life: that
    // developer scenario never saves or resumes (resume.js).
    await page.context().close();
    const second = await kit.open(browser, `${base}/?shot`, { lazy: true });
    const page2 = second.page; page2.on('pageerror', (e) => errors.push(String(e)));
    await page2.evaluate(() => document.getElementById('start-touch')?.click());
    for (const [door, dirty] of [['open', true], ['shut', true], ['open', false], ['shut', false]]) {
      await page2.evaluate(({ door: d, dirty: dt }) => {
        const A = window.__app, g = A.things.find((t) => t.name === 'vinglaset'), S = A.lifeStores.stores;
        const dw = A.world.lids.find((l) => l.name === 'diskmaskinen');
        if (g.rackStore) g.unpark();
        g.take(); g.used = dt; const st = A.life.items.store('dwUpper'); st.parkCup(g, 2); g.contents.clear(); g.show();
        const open = d === 'open';
        dw.isOpen = open; dw.t = open ? 1 : 0; dw.pose(dw.t);
        for (const r of dw.racks) { r.isOpen = open; r.t = open ? 1 : 0; r.pose(r.t); }
        window.__beforeReload = true;
        document.getElementById('gl-lost-reload').click(); // glReload(): save the world to the resume record, location.reload()
      }, { door, dirty });
      await page2.waitForFunction(() => !window.__beforeReload && window.__app?.things?.length, null, { timeout: 600000, polling: 500 });
      const r = await page2.evaluate(() => {
        const A = window.__app, g = A.things.find((t) => t.name === 'vinglaset'), st = A.life.items.store('dwUpper'), dw = A.world.lids.find((l) => l.name === 'diskmaskinen');
        A.scene.updateMatrixWorld(true);
        const anchor = A.life.anchors.get('dwUpper')(2), w = g.model.getWorldPosition(new g.model.position.constructor()), a = anchor.getWorldPosition(new g.model.position.constructor());
        return { parked: st.parkedCups.get(2) === g && !!g.rackStore && g.rackSlot === 2, held: A.heldItem() === g, used: !!g.used, dirty: g.dirty, doorOpen: dw.isOpen,
          dist: w.distanceTo(a), inRackNode: g.model.parent === anchor };
      });
      check(r.parked && !r.held && r.inRackNode && r.dist < 0.05, `reload, door ${door}, ${dirty ? 'dirty' : 'clean'}: glass parked in rack slot 2 ${JSON.stringify(r)}`);
      check(r.used === dirty && r.dirty === dirty, `reload, door ${door}: ${dirty ? 'still dirty' : 'still clean'}`);
      check(r.doorOpen === (door === 'open'), `reload: door stays ${door}`);
    }
    await page2.evaluate(() => { // look at the reloaded glass in its rack (the last round left the door shut: open it for the picture)
      const A = window.__app, g = A.things.find((t) => t.name === 'vinglaset'), dw = A.world.lids.find((l) => l.name === 'diskmaskinen');
      dw.isOpen = true; dw.t = 1; dw.pose(1); for (const r of dw.racks) { r.isOpen = true; r.t = 1; r.pose(1); }
      A.scene.updateMatrixWorld(true);
      const p = g.where(), c = A.camera; A.player.spawn(p.x - 0.8, p.z, 0); c.position.set(p.x - 0.55, p.y + 0.45, p.z); c.lookAt(p); A.step(1 / 60);
    });
    await kit.shot(page2, `${out}/rack-reloaded.png`);
    await page2.context().close();
    check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
  } finally { await browser.close(); }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
