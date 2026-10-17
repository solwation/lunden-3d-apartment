// #1210: warming a plate of food in the microwave through the real E ("Använd") path.
//   python3 tools/devserve.py 8771 .
//   PLAYWRIGHT_MODULE=… [CHROME_PATH=…] [SHOTS=/dir] node tools/microwavetest.cjs http://localhost:8771
// Aims the real focus (raycast + main.js updateFocus) at the microwave door, the turntable and the panel and calls the real
// use(): opening the door, the plate (with food) going in, the closed-door / no-plate / power-cut refusals, the time button,
// a run warming ("varm"), a long run ("het", "bränd"), the door pausing a run, save / load of the warmed food, the plate back out.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8771';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 20 * 60000).unref();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?life&shot&test&quality=0&time=14&month=7&day=15&freeze`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.microwave && window.__app.life, null, { timeout: 900000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const shot = async (name) => {
      await page.evaluate(() => { const app = window.__app; app.frame(1 / 60); app.camera.updateMatrixWorld(); app.renderer.render(app.scene, app.camera); });
      try { await page.screenshot({ path: `${shots}/${name}.png`, timeout: 120000 }); console.log(`  shot ${name}.png`); }
      catch (e) { console.log(`  (shot ${name} skipped: ${String(e.message).split('\n')[0]})`); } // a loaded machine may not finish a software-GL capture
    };
    await page.evaluate(() => {
      const A = window.__app, V = A.camera.position.constructor, mw = A.microwave, cav = mw.cav;
      const W = (x, y, z) => cav.parts.localToWorld(new V(x, y, z));
      window.__t = {
        // like a player: stand 0.9 m in front of the oven unit (its front faces −x), look at a world point, let a frame pick the focus
        look(p, back = 0.9, side = 0) {
          A.player.spawn(p.x - back, p.z + side, 0); A.frame(1 / 60);
          const d = p.clone().sub(A.camera.getWorldPosition(new V()));
          A.camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); A.frame(1 / 60);
          return A.focus().focused;
        },
        turntable: () => W(cav.x, cav.y + 0.08, cav.z),
        panel: () => cav.panel.getWorldPosition(new V()).add(new V(-0.02, -0.08, 0)),
        timeBtn: () => cav.timeBtn.getWorldPosition(new V()),
        door: () => mw.door.door.children[0].getWorldPosition(new V()),
        run(s) { for (let t = 0; t < s - 1e-6; t += 0.05) { A.frame(0.05); } },
      };
    });
    const r = (fn, arg) => page.evaluate(fn, arg);
    await r(() => document.getElementById('start-touch')?.click()); await r(() => { for (let i = 0; i < 2; i++) window.__app.frame(0.05); });

    let s = await r(() => {
      const A = window.__app, T = window.__t, I = A.life.items, mw = A.microwave;
      const f = T.look(T.panel(), 0.9);
      return { kind: f?.kind, blocked: f?.blocked, text: f?.blockedText, store: !!I.store('microwave'), door: mw.door.name };
    });
    check(s.store && s.door === 'mikron', 'the microwave is a life store and its door is "mikron"', JSON.stringify(s));
    check(s.kind === 'microwave' && s.blocked && s.text === 'Ställ in en tallrik först', 'panel aimed at: real focus, "Ställ in en tallrik först" with an empty turntable', JSON.stringify(s));
    await shot('micro-closed');

    // the door opens with the real use()
    s = await r(() => {
      const A = window.__app, T = window.__t, mw = A.microwave;
      const f = T.look(T.door(), 0.9, 0.5); const kind = f?.kind, name = f?.name; A.use(f); T.run(1.5);
      return { kind, name, open: mw.door.isOpen };
    });
    check(s.open && s.name === 'mikron', 'E on the door opens it', JSON.stringify(s));

    // a plate with a fried egg and a grilled sausage in hand
    s = await r(() => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items, mw = A.microwave;
      const raw = L.create('friedEgg', { at: 'world', pos: [0, 0, 0], yaw: 0 }); // (replaced below: a cooked egg on the plate)
      I.remove(raw);
      const plate = I.all().find((i) => i.type === 'plate' && i.place.at === 'slot');
      L.view(plate).take();
      const egg = L.create('friedEgg', { at: 'on', parent: plate.id, slot: 0 }, { machine: { cook: 8, cooked: true } });
      const sau = L.create('sausage', { at: 'on', parent: plate.id, slot: 1 }, { machine: { cook: 12, cooked: true } });
      const rawSau = L.create('sausage', { at: 'on', parent: plate.id, slot: 2 }); // a raw one: must not warm
      const pizza = L.create('billys', { at: 'on', parent: plate.id, slot: 3 }, { pkg: 'open' }); // an unwrapped frozen pizza (#1209)
      const pirog = L.create('pirog', { at: 'on', parent: plate.id, slot: 4 }); // still in its plastic: must not heat
      T.run(0.2);
      const f = T.look(T.turntable(), 0.9);
      const out = { held: I.held()?.id === plate.id, kind: f?.kind, store: f?.store, blocked: f?.blocked, plateId: plate.id, egg: egg?.id, sau: sau?.id, raw: rawSau?.id, pizza: pizza?.id, pirog: pirog?.id, label: f?.options?.()[0]?.label };
      A.use(f); T.run(0.3);
      out.inStore = plate.place.at === 'slot' && plate.place.store === 'microwave'; out.handEmpty = !I.held(); out.eggOn = egg.place.parent === plate.id;
      return out;
    });
    check(s.held && s.kind === 'life' && s.store === 'microwave' && !s.blocked, 'plate in hand: the open microwave offers the turntable', JSON.stringify(s));
    check(s.inStore && s.handEmpty && s.eggOn, 'E puts the plate (with its food) in the microwave', JSON.stringify(s));
    const ids = s;
    await r(() => { const A = window.__app, T = window.__t; T.look(T.turntable(), 0.7, 0); A.camera.rotation.x -= 0.25; });
    await shot('micro-open-plate');

    // starting with the door open is refused; shut, then the real panel
    s = await r(() => { const A = window.__app, T = window.__t, mw = A.microwave; const f = T.look(T.panel(), 0.9); return { kind: f?.kind, blocked: f?.blocked, text: f?.blockedText, running: mw.running }; });
    check(s.kind === 'microwave' && s.blocked && s.text === 'Stäng luckan först' && !s.running, 'door open: the panel says "Stäng luckan först"', JSON.stringify(s));
    s = await r(() => {
      const A = window.__app, T = window.__t, mw = A.microwave;
      const f = T.look(T.door(), 0.9, 0.5); A.use(f); T.run(1.5); return { open: mw.door.isOpen };
    });
    check(s.open === false, 'E on the door shuts it');

    // the time button cycles the presets (60 → 90 → 120 → 30)
    s = await r(() => {
      const A = window.__app, T = window.__t, mw = A.microwave, seen = [mw.seconds];
      const f = T.look(T.timeBtn(), 0.6); const kind = f?.id;
      for (let i = 0; i < 3; i++) { A.use(T.look(T.timeBtn(), 0.6)); seen.push(mw.seconds); }
      return { kind, seen };
    });
    check(s.kind === 'microwave-time' && s.seen.join() === '60,90,120,30', 'the time button (real focus) cycles 60 / 90 / 120 / 30 s', JSON.stringify(s));

    // 30 s: warm, not hot; the raw sausage stays raw; the machine runs on game seconds / clock
    s = await r((ids) => {
      const A = window.__app, T = window.__t, I = A.life.items, mw = A.microwave;
      const events = []; A.life.events.push((k, d) => { if (k.startsWith('microwave')) events.push(k + (d?.state ? ':' + d.state : '')); });
      window.__events = events;
      const f = T.look(T.panel(), 0.9); const before = { kind: f?.kind, blocked: f?.blocked };
      A.use(f);
      const out = { before, running: mw.running, left: mw.left };
      T.run(1); out.mid = I.get(ids.egg).machine.heat; out.stillRunning = mw.running;
      T.run(5);
      const egg = I.get(ids.egg), sau = I.get(ids.sau), raw = I.get(ids.raw);
      Object.assign(out, { done: mw.done, running2: mw.running, eggHeat: egg.machine.heat, eggWarm: !!egg.machine.warm, eggHot: !!egg.machine.hot, eggName: I.name(egg), sauName: I.name(sau), rawHeat: raw.machine.heat ?? null, pizza: I.get(ids.pizza).machine.cooked, pizzaName: I.name(I.get(ids.pizza)), pirogHeat: I.get(ids.pirog).machine.heat ?? null, pirogName: I.name(I.get(ids.pirog)), rawName: I.name(raw), events: [...events] });
      return out;
    }, ids);
    check(s.before.kind === 'microwave' && !s.before.blocked && s.running && Math.abs(s.left - 5) < 0.01, 'E on the panel starts a 30 s run (5 real seconds)', JSON.stringify(s));
    check(s.mid > 0 && s.stillRunning, 'the food gathers heat while it runs', JSON.stringify({ mid: s.mid }));
    check(s.done && !s.running2 && Math.abs(s.eggHeat - 30) < 0.8, 'the run ends by itself after the time (done / "End")', JSON.stringify({ done: s.done, heat: s.eggHeat }));
    check(s.eggWarm && !s.eggHot && s.eggName === 'det stekta ägget (varm)' && s.sauName === 'den grillade korven (varm)', 'egg and sausage are "varm", not "het"', JSON.stringify({ egg: s.eggName, sau: s.sauName }));
    check(s.rawHeat === null && s.rawName === 'den råa korven', 'a raw sausage on the plate does not warm', JSON.stringify({ raw: s.rawName }));
    check(s.pizza === true && s.pizzaName === 'den varma pizzan' && s.pirogHeat === null && s.pirogName === 'den inplastade pirogen', 'unwrapped frozen pizza thaws and is hot; the wrapped pirog does not heat', JSON.stringify({ pizza: s.pizzaName, pirog: s.pirogName }));
    check(s.events.includes('microwaveStarted') && s.events.includes('microwaved:warm') && s.events.includes('microwaveDone'), 'domain events fire', s.events.join());
    await shot('micro-display');

    // door pauses a run
    s = await r((ids) => {
      const A = window.__app, T = window.__t, I = A.life.items, mw = A.microwave;
      A.use(T.look(T.panel(), 0.9)); T.run(1);
      const h1 = I.get(ids.egg).machine.heat;
      A.use(T.look(T.door(), 0.9, 0.5)); T.run(1.5); // open: paused
      const h2 = I.get(ids.egg).machine.heat; T.run(2); const h3 = I.get(ids.egg).machine.heat;
      const out = { h1, h2, h3, running: mw.running, open: mw.door.isOpen, left: mw.left };
      A.use(T.look(T.door(), 0.9, 0.5)); T.run(1.5); // shut: carries on
      T.run(1); out.h4 = I.get(ids.egg).machine.heat; out.running2 = mw.running;
      return out;
    }, ids);
    check(s.open && s.running && s.h3 === s.h2 && s.h2 > s.h1 - 0.01, 'opening the door pauses the run (no heat while open)', JSON.stringify(s));
    check(s.h4 > s.h3 && s.running2, 'shutting it carries on with the time left');
    // let it finish and go on with a long run: hot, then burnt
    s = await r((ids) => {
      const A = window.__app, T = window.__t, I = A.life.items, mw = A.microwave;
      T.run(5);
      const a = { heat: I.get(ids.egg).machine.heat, running: mw.running };
      while (mw.seconds !== 90) A.use(T.look(T.timeBtn(), 0.6));
      A.use(T.look(T.panel(), 0.9)); T.run(15.2);
      const egg = I.get(ids.egg), sau = I.get(ids.sau);
      const hot = { heat: egg.machine.heat, name: I.name(egg), sau: I.name(sau) };
      while (mw.seconds !== 120) A.use(T.look(T.timeBtn(), 0.6));
      A.use(T.look(T.panel(), 0.9)); T.run(21);
      return { a, hot, burnt: { heat: egg.machine.heat, name: I.name(egg), sau: I.name(sau), cook: egg.machine.cook, sauCook: sau.machine.cook } };
    }, ids);
    check(s.a.heat > 30 && !s.a.running, 'finished the paused run', JSON.stringify(s.a));
    check(/\(het\)$/.test(s.hot.name) && /\(het\)$/.test(s.hot.sau), 'a long run: "het" (too hot)', JSON.stringify(s.hot));
    check(/\(bränd\)$/.test(s.burnt.name) && /\(bränd\)$/.test(s.burnt.sau) && s.burnt.cook >= 24 && s.burnt.sauCook >= 36, 'left far too long: "bränd", and the existing burnt look follows', JSON.stringify(s.burnt));

    // save / load (the warmed state is kept with the plate in the microwave)
    s = await r((ids) => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items;
      const rec = JSON.parse(JSON.stringify(L.serialize())); L.load(rec);
      const plate = I.get(ids.plateId), egg = I.get(ids.egg), sau = I.get(ids.sau);
      return { plate: plate?.place, eggOn: egg?.place?.parent === ids.plateId, heat: egg?.machine.heat, burnt: !!egg?.machine.burnt, name: I.name(egg), sauBurnt: !!sau?.machine.burnt, rawHeat: I.get(ids.raw)?.machine.heat ?? null };
    }, ids);
    check(s.plate?.at === 'slot' && s.plate.store === 'microwave' && s.eggOn, 'save / load: the plate and food are still in the microwave', JSON.stringify(s.plate));
    check(s.burnt && s.sauBurnt && s.heat > 110 && /\(bränd\)$/.test(s.name) && s.rawHeat === null, 'save / load: the heat state of every food is kept', JSON.stringify(s));

    // a fresh run on a saved warm state continues from the saved heat, and a power cut stops it
    s = await r((ids) => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items, mw = A.microwave;
      // open (the loaded door is shut after the earlier shut), take the plate out through the real E on the plate
      A.use(T.look(T.door(), 0.9, 0.5)); T.run(1.5);
      const view = L.view(I.get(ids.plateId));
      const out = { open: mw.door.isOpen };
      view.take(); out.inHand = I.held()?.id === ids.plateId; out.egg = I.get(ids.egg).place.parent === ids.plateId;
      // empty turntable refuses again
      A.use(T.look(T.door(), 0.9, 0.5)); T.run(1.5);
      const f = T.look(T.panel(), 0.9); out.empty = f?.blockedText;
      // power cut: no start with a plate inside
      return out;
    }, ids);
    check(s.open && s.inHand && s.egg, 'the plate comes out of the microwave with its food', JSON.stringify(s));
    check(s.empty === 'Ställ in en tallrik först', 'empty turntable: the panel refuses again', s.empty);

    s = await r((ids) => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items, mw = A.microwave;
      A.use(T.look(T.door(), 0.9, 0.5)); T.run(1.5);
      A.use(T.look(T.turntable(), 0.9)); T.run(0.3); // the plate goes back in
      A.use(T.look(T.door(), 0.9, 0.5)); T.run(1.5);
      mw.door.mains(false);
      const f = T.look(T.panel(), 0.9); const out = { blocked: f?.blocked, text: f?.blockedText, kind: f?.kind };
      mw.door.mains(true); return out;
    }, ids);
    check(s.blocked && s.text === 'Strömmen är borta', 'power cut: "Strömmen är borta"', JSON.stringify(s));
    await shot('micro-after');
  } catch (e) { check(false, 'harness', e.stack); }
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
