// #1881: one cooking rule for the pan, the oven and the air fryer; the grill only takes meat — the real game (?life&shot&test).
//   python3 -m http.server 8181 (repo root)
//   PLAYWRIGHT_MODULE=… [CHROME_PATH=…] [THREE_DIR=…/node_modules/three] node tools/cook1881browser.cjs http://localhost:8181 docs/verification/1881
// Through the actual main focus/use where a player aims: fries poured into the pan on the hob and fried golden; sausage put in
// the air fryer's basket and cooked by a run; fish fingers baked on the oven's rack (shut door), the egg refused while they lie
// there, then an egg cracked into the oven and baked; the fries bag and a raw egg refused at the patio kettle ("Det går inte att
// grilla …"); the whole chicken refused at the air fryer; the existing chicken-in-oven, fish-fingers-in-air-fryer flows still cook.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8181', out = process.argv[3] || '/tmp/cook1881';
const threeDir = process.env.THREE_DIR;
fs.mkdirSync(out, { recursive: true });
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout'); process.exit(2); }, 25 * 60000).unref();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2 });
    if (threeDir) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/, (r) => {
      const rel = r.request().url().match(/three@0\.170\.0\/(.*)$/)[1].split('?')[0], f = path.join(threeDir, rel);
      return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: 'application/javascript' }) : r.abort();
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => (/cdn\.jsdelivr\.net\/npm\/three/.test(r.request().url()) ? r.fallback() : r.abort()));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?life&shot&test&quality=0&time=13&month=7&day=15&freeze&cloud=`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.fries && window.__app.chicken, null, { timeout: 1500000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const r = (fn, arg) => page.evaluate(fn, arg);
    await r(() => document.getElementById('start-touch')?.click());
    if (await page.locator('#player-skip').isVisible().catch(() => false)) await page.locator('#player-skip').click();
    await r(() => { const q = document.getElementById('corner-qr'); if (q) q.style.display = 'none'; });
    await r(() => {
      const A = window.__app, V = A.camera.position.constructor, L = A.life, I = L.items;
      window.__t = {
        V, oven: A.world.lids.find((l) => l.name === 'ugnen'), freezer: A.world.lids.find((l) => l.kind === 'fridge' && l.freezer), fridge: A.world.lids.find((l) => l.kind === 'fridge' && !l.freezer),
        kettle: A.world.furnitureTargets.find((t) => t.kind === 'kettle'),
        settle(o) { for (let i = 0; i < 40; i++) o.update(0.1); A.scene.updateMatrixWorld(true); },
        look(p, from) { // like a player: stand at `from`, turn the view towards `p`, let a frame pick the focus
          A.player.spawn(from.x, from.z, from.level ?? 0); A.frame(1 / 60);
          const d = p.clone().sub(A.camera.getWorldPosition(new V()));
          A.camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); A.frame(1 / 60);
          return A.focus().focused;
        },
        lifeOut(packType) { // one out of a life package in the fridge into the hand (open it first)
          const pack = I.all().find((i) => i.type === packType), t = L.view(pack).target, run = (id) => L.options(t).find((a) => a.id === id)?.run();
          if (pack.pkg === 'closed') { run('open'); L.runner.update(1); }
          run('dispense'); L.runner.update(1); return I.held();
        },
        tick(s, ...fs) { for (let t = 0; t < s - 1e-6; t += 0.1) for (const f of fs) f(0.1); },
      };
    });
    const shot = async (name, view) => {
      await r((v) => { const A = window.__app, { V } = window.__t; if (v === 'frame') A.frame(1 / 60); else if (v) { A.camera.position.set(...v.pos); A.camera.lookAt(new V(...v.at)); } A.camera.updateMatrixWorld(); A.renderer.render(A.scene, A.camera); }, view);
      await page.screenshot({ path: path.join(out, `${name}.png`), timeout: 300000 });
      console.log(`  shot ${name}.png`);
    };

    // 1. fries poured into the pan on the hob (a new combination), fried golden on a lit zone, then a bunch taken
    let s = await r(() => {
      const A = window.__app, { freezer, settle, look, tick, V } = window.__t, F = A.fries, P = A.pan, zone = A.world.hob.zone;
      P.take(); P.placeAt(zone.clone()); freezer.toggle(); settle(freezer); F.bag.take();
      const f = look(zone.clone(), new V(zone.x - 0.75, 0, zone.z));
      const o = { onHob: P.onHob, kind: f?.kind, where: f?.where, blocked: f?.blockedText };
      A.use(f); o.count = F.count; o.inPan = F.where === 'pan' && F.load.parent === P.model;
      tick(3, (dt) => F.update(dt)); o.coldCook = F.cook;
      A.world.hob.set(true); tick(14, (dt) => F.update(dt)); o.done = F.done; o.burnt = F.burnt; o.cook = F.cook;
      A.airFryer.setOpen(true); A.airFryer.update(1); o.fryerBlocked = F.pourTargetFor('airfryer').blockedText; A.airFryer.setOpen(false); A.airFryer.update(1);
      o.panBusy = !A.fish.canFry(false);
      return o;
    });
    check(s.onHob && s.kind === 'pourfries' && s.where === 'pan' && !s.blocked, 'fries bag aimed at the pan on the hob offers "hälla pommes frites i stekpannan"', s);
    check(s.count > 0 && s.inPan, 'the portion lies in the pan', s);
    check(s.coldCook === 0 && s.done && !s.burnt, 'an unlit zone does nothing; lit, they fry golden (pan rate)', s);
    check(s.fryerBlocked === 'Pommesen ligger redan i stekpannan' && s.panBusy, 'one vessel at a time: no second pour elsewhere, no fish finger in the busy pan', s);
    await shot('fries-in-pan', await r(() => { const z = window.__app.world.hob.zone; return { pos: [z.x - 0.45, z.y + 0.45, z.z + 0.12], at: [z.x, z.y, z.z] }; }));
    s = await r(() => {
      const A = window.__app, F = A.fries; F.bag.putBack(); A.world.hob.set(false);
      const blocked = F.takeTarget.blocked; F.takeTarget.toggle(); const bunch = A.heldItem();
      const o = { blocked, bunch: !!bunch?.isFries, n: bunch?.n }; bunch?.putBack(); F.reset(); o.back = F.where === 'airfryer' && F.load.parent === A.airFryer.basket; return o;
    });
    check(!s.blocked && s.bunch && s.n > 0 && s.back, 'a bunch is taken out of the pan; F returns the heap to the basket', s);

    // 2. a raw sausage in the air fryer's basket (new), cooked by one run; a fish finger is then refused there
    s = await r(() => {
      const A = window.__app, { fridge, settle, lifeOut, look, tick, V } = window.__t, L = A.life, I = L.items, fr = A.airFryer;
      fridge.toggle(); settle(fridge); const sz = lifeOut('sausagePack'); fridge.toggle(); settle(fridge);
      fr.setOpen(true); fr.update(1); A.scene.updateMatrixWorld(true);
      const front = fr.object.localToWorld(new V(0, 0.1, -0.45)), mid = fr.object.localToWorld(new V(0, 0.05, -0.2));
      const f = look(mid, front); const o = { held: sz?.type, kind: f?.kind, store: f?.store, rows: f?.options?.().map((a) => `${a.id}:${a.reason ?? 'ok'}`) };
      A.use(f); o.inBasket = sz.place.store === 'fryerBasket';
      fr.setOpen(false); fr.update(1); fr.press(); tick(13, (dt) => { fr.update(dt); A.cookStores.update(dt); });
      o.cooked = !!sz.machine.cooked; o.name = I.name(sz); tick(8, (dt) => { fr.update(dt); A.cookStores.update(dt); }); o.done = fr.done;
      fr.setOpen(true); fr.update(1);
      return o;
    });
    check(s.held === 'sausage' && s.kind === 'life' && s.store === 'fryerBasket', 'a raw sausage aimed at the open basket offers its store', s);
    check(s.inBasket && s.cooked && s.name === 'den grillade korven' && s.done, 'it lies in the basket and one run cooks it', s);
    await shot('sausage-in-airfryer', await r(() => { const fr = window.__app.airFryer, { V } = window.__t, a = fr.object.localToWorld(new V(0, 0.04, -0.28)), p = fr.object.localToWorld(new V(0, 0.42, -0.62)); return { pos: p.toArray(), at: a.toArray() }; }));
    s = await r(() => {
      const A = window.__app, { freezer, settle } = window.__t; if (!freezer.isOpen) { freezer.toggle(); settle(freezer); }
      A.fish.press(); const o = { holding: !!A.fish.holding, can: A.fish.canAirfry(), why: A.vesselBusy?.('airfryer', 'fishFinger') };
      return o;
    });
    check(s.holding && !s.can, 'a fish finger is refused in the basket while the sausage lies there', s);

    // 3. fish fingers on the oven's rack (new), baked with the door shut; an egg is refused while they lie there
    s = await r(() => {
      const A = window.__app, { oven, settle, look, tick, V } = window.__t, F = A.fish;
      oven.toggle(); settle(oven); const rack = oven.parts.localToWorld(oven.rack.clone());
      const f = look(rack, new V(rack.x - 0.85, 0, rack.z)); const o = { kind: f?.kind, blocked: f?.blockedText };
      A.use(f); for (let i = 0; i < 2; i++) { F.press(); F.ovenHeld(); }
      o.inOven = F.inOven.length; o.held = !!A.heldItem();
      tick(5, (dt) => F.update(dt)); o.openCook = F.inOven[0].cook;
      oven.toggle(); settle(oven); tick(16, (dt) => F.update(dt)); o.fried = F.inOven.every((x) => x.fried && !x.burnt);
      oven.toggle(); settle(oven);
      return o;
    });
    check(s.kind === 'ovenfish' && !s.blocked, 'a fish finger aimed into the open oven offers "lägga fiskpinnen i ugnen"', s);
    check(s.inOven === 3 && !s.held && s.openCook === 0 && s.fried, 'three on the rack; the open oven does not cook; shut, they bake golden', s);
    await shot('fishfingers-in-oven', await r(() => { const o = window.__t.oven, w = o.parts.localToWorld(o.rack.clone()); return { pos: [w.x - 0.55, w.y + 0.4, w.z + 0.05], at: [w.x + 0.05, w.y, w.z] }; }));
    s = await r(() => {
      const A = window.__app, { fridge, settle, lifeOut, oven } = window.__t, L = A.life, F = A.fish;
      fridge.toggle(); settle(fridge); const egg = lifeOut('eggCarton'); fridge.toggle(); settle(fridge);
      const t = A.cookStores.of('oven').target, row = L.options(t).find((a) => a.id === 'crackEggCook');
      const o = { egg: egg?.type, busy: row?.reason };
      L.view(egg).placeAt(new window.__t.V(5.25, 0.931, 3.2)); F.inOven[0].take(); o.hot = A.heldItem()?.hot > 0; A.heldItem().hide(); for (const f of F.inOven) f.hide(); L.view(egg).take();
      const row2 = L.options(t).find((a) => a.id === 'crackEggCook'); o.free = row2 && !row2.reason; o.why = row2?.reason ?? L.options(t).map((a) => a.id + ':' + a.reason).join(); o.heldNow = L.items.held()?.type; row2?.run(); L.runner.update(2);
      const fe = L.items.all().find((i) => i.type === 'friedEgg' && i.place.store === 'ovenRack'); o.inOven = !!fe;
      oven.toggle(); window.__t.settle(oven); window.__t.tick(17, (dt) => A.cookStores.update(dt)); o.cooked = !!fe?.machine.cooked; o.name = fe && L.items.name(fe);
      oven.toggle(); window.__t.settle(oven);
      return o;
    });
    check(s.egg === 'rawEgg' && s.busy === 'Det ligger redan fiskpinnar i ugnen', 'an egg is refused while fish fingers lie in the oven', s);
    check(s.hot && s.free && s.inOven && s.cooked && s.name === 'det stekta ägget', 'out they come steaming; then an egg is cracked onto the rack and bakes', s);
    await shot('egg-in-oven', await r(() => { const o = window.__t.oven, w = o.parts.localToWorld(o.rack.clone()); return { pos: [w.x - 0.55, w.y + 0.4, w.z + 0.05], at: [w.x + 0.05, w.y, w.z] }; }));

    // 4. the grill only takes meat: the fries bag and a raw egg are refused at the patio kettle; a sausage is offered
    s = await r(() => {
      const A = window.__app, { kettle, look, V, freezer, settle } = window.__t, L = A.life;
      A.heldItem()?.putBack?.(); if (L.items.held()) L.view(L.items.held()).placeAt(new V(5.25, 0.931, 3.2));
      if (!kettle) return { kettle: false };
      const p = kettle.grateWorld().clone(), from = p.clone().add(new V(0, 0, -1.1));
      if (!freezer.isOpen) { freezer.toggle(); settle(freezer); } A.fries.bag.take();
      const f = look(p.clone().setY(p.y - 0.1), from); const o = { kettle: true, bag: A.heldItem() === A.fries.bag, kind: f?.kind, text: f?.blockedText };
      return o;
    });
    check(s.kettle && s.bag && s.text === 'Det går inte att grilla pommes', 'the fries bag aimed at the patio kettle: "Det går inte att grilla pommes"', s);
    await r(() => { window.__app.frame(1 / 60); for (let e = document.getElementById('prompt'); e && e !== document.body; e = e.parentElement) { e.hidden = false; if (getComputedStyle(e).display === 'none') e.style.display = 'block'; } }); // (?shot hides the HUD: show the real prompt the frame just wrote)
    await shot('grill-refuses-fries', null); // the player's own view and HUD (the action button / prompt says why)
    console.log('  hud:', await r(() => [document.getElementById('prompt')?.textContent, document.getElementById('action')?.textContent, document.getElementById('prompt')?.hidden].join(' | ')));
    s = await r(() => {
      const A = window.__app, { kettle, look, V, lifeOut, fridge, settle } = window.__t, L = A.life;
      A.fries.bag.putBack(); A.player.spawn(4.2, 3, 0); A.frame(1 / 60);
      fridge.toggle(); settle(fridge); const egg = lifeOut('eggCarton'); fridge.toggle(); settle(fridge);
      const p = kettle.grateWorld().clone(), f = look(p.clone().setY(p.y - 0.1), p.clone().add(new V(0, 0, -1.1)));
      const rows = f?.options ? f.options().map((a) => a.reason ?? 'ok') : [f?.blockedText];
      return { egg: egg?.type, kind: f?.kind, rows, text: f?.blockedText };
    });
    check(s.egg === 'rawEgg' && (s.text === 'Det går inte att grilla ägg' || s.rows.includes('Det går inte att grilla ägg')), 'a raw egg at the kettle: "Det går inte att grilla ägg"', s);

    // 5. the whole chicken: refused at the air fryer (too big), still roasts in the oven; fish fingers still air-fry
    s = await r(() => {
      const A = window.__app, { fridge, settle, look, V, tick, oven, freezer } = window.__t, L = A.life, B = A.chicken, fr = A.airFryer;
      if (L.items.held()) L.view(L.items.held()).placeAt(new V(5.25, 0.931, 3.25));
      for (const it of L.items.all().filter((i) => i.place.store === 'fryerBasket')) { L.view(it).take(); L.view(it).placeAt(new V(5.25, 0.931, 3.0 + Math.random() * 0.2)); }
      fridge.toggle(); settle(fridge); B.take(); fridge.toggle(); settle(fridge);
      fr.setOpen(true); fr.update(1); A.scene.updateMatrixWorld(true);
      const f = look(fr.object.localToWorld(new V(0, 0.05, -0.2)), fr.object.localToWorld(new V(0, 0.1, -0.5))); const o = { kind: f?.kind };
      const said = []; const say = L.say; L.say = (t) => { said.push(t); say?.(t); }; A.use(f); L.say = say;
      o.said = said.at(-1); o.stillHeld = A.heldItem() === B;
      if (!oven.isOpen) { oven.toggle(); settle(oven); } B.intoOven(); oven.toggle(); settle(oven); tick(10.5, (dt) => B.update(dt)); o.roasted = B.done && B.inOven;
      oven.toggle(); settle(oven); B.take(); B.putBack();
      if (!freezer.isOpen) { freezer.toggle(); settle(freezer); }
      A.fish.press(); o.canAirfry = A.fish.canAirfry(); A.fish.airfryHeld(); fr.setOpen(false); fr.update(1); fr.press();
      tick(19, (dt) => { fr.update(dt); A.fish.update(dt); }); o.airfried = A.fish.inFryer.length === 1 && A.fish.inFryer[0].fried && !A.fish.inFryer[0].burnt;
      return o;
    });
    check(s.kind === 'fryChicken' && s.stillHeld && s.said === 'Kycklingen är för stor för airfryern – använd ugnen eller grillen', 'the whole chicken at the air fryer is refused and stays in hand', s);
    check(s.roasted, 'the chicken still roasts in the oven (#1219)', s);
    check(s.canAirfry && s.airfried, 'fish fingers still air-fry golden in one run (#287)', s);
    // 6. a caught fish (#1754, pan + grill) into the oven too (new): baked with the door shut; saved as lying in the oven
    s = await r(() => {
      const A = window.__app, { oven, settle, look, tick, V } = window.__t, Fi = A.fishing;
      A.heldItem()?.putBack?.(); if (A.life.items.held()) A.life.view(A.life.items.held()).placeAt(new V(5.25, 0.931, 3.25));
      for (const f of A.fish.inFryer) f.hide();
      if (!oven.isOpen) { oven.toggle(); settle(oven); }
      for (const it of A.life.items.all().filter((i) => i.place.store === 'ovenRack')) { A.life.view(it).take(); A.life.view(it).placeAt(new V(5.25, 0.931, 3.1)); } // (the egg out first: one kind per vessel)
      const fish = Fi.addFish({ species: 'abborre', cm: 24, raw: true }, new V(4.6, 0.931, 3)); fish.take();
      if (!oven.isOpen) { oven.toggle(); settle(oven); } const rack = oven.parts.localToWorld(oven.rack.clone());
      const f = look(rack, new V(rack.x - 0.85, 0, rack.z)); const o = { held: A.heldItem() === fish, kind: f?.kind, blocked: f?.blockedText };
      A.use(f); o.heat = fish.heat?.kind;
      tick(5, (dt) => fish.cookTick(dt)); o.openCook = fish.cook;
      oven.toggle(); settle(oven); tick(21, (dt) => fish.cookTick(dt)); o.cooked = fish.cooked && !fish.burnt; o.name = fish.name;
      o.saved = Fi.saveState()?.fish.find((e) => e.cm === 24)?.on;
      oven.toggle(); settle(oven); fish.take(); o.out = A.heldItem() === fish && !fish.heat; fish.putBack();
      return o;
    });
    check(s.held && s.kind === 'ovenCatch' && !s.blocked && s.heat === 'oven', 'a caught fish aimed into the open oven goes on the rack', s);
    check(s.openCook === 0 && s.cooked && /ugnsbakad abborre/.test(s.name) && s.saved === 'oven' && s.out, 'shut, it bakes ("en ugnsbakad abborre"), is saved in the oven and taken out', s);
    check(!errors.length, 'no page errors', errors.slice(0, 5).join(' | '));
  } catch (e) { check(false, 'exception', e.stack); } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
