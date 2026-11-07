// #1887: realistic cooking after #1881 — each food only where it sensibly cooks, oven food on a holdable oven tray — the real
// game (?life&shot&test).
//   python3 tools/devserve.py 8187   (or python3 -m http.server 8187 where jsdelivr is reachable)
//   [PLAYWRIGHT_MODULE=…] [CHROME_PATH=…] node tools/cook1887browser.cjs http://localhost:8187 docs/verification/1887
// Through the actual main focus/use where a player aims: the fries bag at the pan on the hob is refused ("Pommes gör man i
// ugnen eller airfryern"); a raw egg into the open oven and into the open air fryer is refused ("Ägg steker man i
// stekpannan"); the tray is taken out of the open oven, the empty oven then refuses food ("Lägg maten på ugnsplåten"), the
// tray goes down on the worktop, fries are poured on it, it slides back in, they bake golden with the door shut, and the tray
// comes out again with them on it; fish fingers on the tray in the oven; the chicken roasts on the tray (#1219) and rides out
// on it; a sausage on the tray; the tray's place is in the reload record.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8187', out = process.argv[3] || '/tmp/cook1887';
fs.mkdirSync(out, { recursive: true });
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout'); process.exit(2); }, 25 * 60000).unref();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2 });
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
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
      const oven = A.world.lids.find((l) => l.name === 'ugnen');
      const T = window.__t = {
        V, oven, tray: A.chicken.oven, freezer: A.world.lids.find((l) => l.kind === 'fridge' && l.freezer), fridge: A.world.lids.find((l) => l.kind === 'fridge' && !l.freezer),
        top: new V(5.25, 0.931, 3.18), // a free spot on the east worktop, south of the tall unit
        settle(o) { for (let i = 0; i < 40; i++) o.update(0.1); A.scene.updateMatrixWorld(true); },
        open(o, on = true) { if (o.isOpen !== on) { o.toggle(); T.settle(o); } },
        look(p, from) { // like a player: stand at `from`, turn the view towards `p`, let a frame pick the focus
          A.player.spawn(from.x, from.z, from.level ?? 0); A.frame(1 / 60);
          const d = p.clone().sub(A.camera.getWorldPosition(new V()));
          A.camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); A.frame(1 / 60);
          return A.focus().focused;
        },
        rackW() { return oven.parts.localToWorld(oven.rack.clone()); },
        intoOven() { const w = T.rackW(); return T.look(w, new V(w.x - 0.85, 0, w.z)); },
        atTop() { const w = T.top; return T.look(w.clone().setY(w.y + 0.01), new V(w.x - 0.75, 0, w.z)); },
        lifeOut(packType) { // one out of a life package in the fridge into the hand (open it first)
          const pack = I.all().find((i) => i.type === packType), t = L.view(pack).target, run = (id) => L.options(t).find((a) => a.id === id)?.run();
          if (pack.pkg === 'closed') { run('open'); L.runner.update(1); }
          run('dispense'); L.runner.update(1); return I.held();
        },
        tick(s, ...fs) { for (let t = 0; t < s - 1e-6; t += 0.1) for (const f of fs) f(0.1); },
        rows(f) { return f?.options ? f.options().map((a) => a.reason ?? 'ok') : [f?.blockedText]; },
      };
    });
    const shot = async (name, view) => {
      await r((v) => { const A = window.__app, { V } = window.__t; if (v) { A.camera.position.set(...v.pos); A.camera.lookAt(new V(...v.at)); } A.camera.updateMatrixWorld(); A.renderer.render(A.scene, A.camera); }, view);
      await page.screenshot({ path: path.join(out, `${name}.png`), timeout: 300000 });
      console.log(`  shot ${name}.png`);
    };
    const hud = () => r(() => { window.__app.frame(1 / 60); for (let e = document.getElementById('prompt'); e && e !== document.body; e = e.parentElement) { e.hidden = false; if (getComputedStyle(e).display === 'none') e.style.display = 'block'; } return document.getElementById('prompt')?.textContent; }); // (?shot hides the HUD: show the real prompt the frame just wrote)

    // 1. the fries bag at the pan on the hob is refused (#1887: no fries in the pan)
    let s = await r(() => {
      const A = window.__app, { freezer, open, look, V } = window.__t, F = A.fries, P = A.pan, zone = A.world.hob.zone;
      P.take(); P.placeAt(zone.clone()); open(freezer); F.bag.take();
      const f = look(zone.clone(), new V(zone.x - 0.75, 0, zone.z));
      return { onHob: P.onHob, kind: f?.kind, blocked: f?.blocked, text: f?.blockedText, tray: !!window.__t.tray?.isOvenTray, home: window.__t.tray?.inOven };
    });
    check(s.tray && s.home, 'the chicken / fish / fries know the oven tray, at home in the oven', s);
    check(s.onHob && s.kind === 'cookRefused' && s.blocked && s.text === 'Pommes gör man i ugnen eller airfryern', 'fries bag at the pan on the hob: "Pommes gör man i ugnen eller airfryern"', s);
    console.log('  hud:', await hud());
    await shot('pommes-nekas-i-stekpannan', null);

    // 2. a raw egg into the open oven (tray in) and the open air fryer is refused (#1887: eggs only in the pan)
    s = await r(() => {
      const A = window.__app, { fridge, open, oven, lifeOut, intoOven, look, rows, V } = window.__t, L = A.life, fr = A.airFryer;
      A.fries.bag.putBack(); A.pan.take(); A.pan.putBack();
      open(fridge); const egg = lifeOut('eggCarton'); open(fridge, false);
      open(oven); const f = intoOven(); return { egg: egg?.type, ovenKind: f?.kind, ovenRows: rows(f) };
    });
    console.log('  hud:', await hud());
    await shot('agg-nekas-i-ugnen', null);
    s = { ...s, ...await r(() => {
      const A = window.__app, { look, rows, V } = window.__t, L = A.life, fr = A.airFryer, egg = L.items.held(), o = {};
      fr.setOpen(true); fr.update(1); A.scene.updateMatrixWorld(true);
      const g = look(fr.object.localToWorld(new V(0, 0.05, -0.2)), fr.object.localToWorld(new V(0, 0.1, -0.5)));
      o.fryerKind = g?.kind; o.fryerRows = rows(g); fr.setOpen(false); fr.update(1);
      L.view(egg).placeAt(new V(5.25, 0.931, 3.9)); return o;
    }) };
    check(s.egg === 'rawEgg' && s.ovenRows.includes('Ägg steker man i stekpannan'), 'a raw egg into the open oven: "Ägg steker man i stekpannan"', s);
    check(s.fryerRows.includes('Ägg steker man i stekpannan'), 'a raw egg into the open air fryer: "Ägg steker man i stekpannan"', s);

    // 3. the tray out of the open oven, the empty oven refuses food, the tray goes down on the worktop
    s = await r(() => {
      const A = window.__app, { oven, tray, open, intoOven, atTop, freezer } = window.__t;
      open(oven, false); A.frame(1 / 60); const shutT = intoOven(); const o = { shutTake: shutT === tray.takeTarget && !shutT.blocked };
      open(oven); const f = intoOven(); o.kind = f?.kind; o.name = f?.name; o.verb = f?.verb; o.blocked = !!f?.blocked;
      A.use(f); o.held = A.heldItem() === tray && tray.held && !tray.inOven;
      open(freezer); const p = atTop(); o.place = p?.kind; o.placeName = p?.name; A.use(p); o.placed = tray.placed && !tray.held && tray.open;
      o.y = +tray.model.position.y.toFixed(3);
      A.fries.bag.take(); const g = intoOven(); o.bare = g?.blockedText;
      return o;
    });
    check(s.kind === 'holdable' && s.name === 'ugnsplåten' && s.verb === 'ta ut' && !s.blocked && s.held, 'aimed into the open oven: "ta ut ugnsplåten"; it comes out into the hand', s);
    check(s.place === 'place' && s.placed && Math.abs(s.y - 0.932) < 0.01, 'the tray goes down on the worktop', s);
    check(s.bare === 'Lägg maten på ugnsplåten', 'the open oven without its tray refuses food: "Lägg maten på ugnsplåten"', s);

    // 4. fries poured on the tray on the worktop, the tray slid back in, baked golden, out again with them on it
    s = await r(() => {
      const A = window.__app, { oven, tray, open, intoOven, atTop, tick } = window.__t, F = A.fries;
      const f = atTop(); const o = { kind: f?.kind, where: f?.where, name: f?.name, blocked: f?.blockedText };
      A.use(f); o.count = F.count; o.onTray = F.where === 'oven' && F.load.parent === tray.model;
      tick(3, (dt) => F.update(dt)); o.coldCook = F.cook;
      F.bag.putBack();
      A.frame(1 / 60); tray.takeTarget.toggle(); o.held = tray.held && F.load.parent === tray.model; // (E on the tray itself; the heap in front of it is the fries' own target)
      const b = intoOven(); o.back = b === tray.backTarget && !b.blocked; o.backName = `${b?.verb} ${b?.name}`; A.use(b); o.inOven = tray.inOven;
      return o;
    });
    check(s.kind === 'pourfries' && s.where === 'oven' && !s.blocked, 'the fries bag at the tray on the worktop offers "lägga pommes frites på ugnsplåten"', s);
    check(s.count > 0 && s.onTray && s.coldCook === 0, 'the portion lies on the tray; out of the oven nothing cooks', s);
    check(s.held && s.back && s.inOven, 'the tray is lifted with the fries on it and slid back into the open oven ("skjuta in ugnsplåten i ugnen")', s);
    await shot('plat-med-pommes-in-i-ugnen', await r(() => { const w = window.__t.rackW(); return { pos: [w.x - 0.62, w.y + 0.42, w.z + 0.1], at: [w.x + 0.03, w.y, w.z] }; }));
    s = await r(() => {
      const A = window.__app, { oven, tray, open, atTop, tick } = window.__t, F = A.fries;
      tick(3, (dt) => F.update(dt)); const openCook = F.cook;
      open(oven, false); tick(23, (dt) => F.update(dt)); const o = { openCook, done: F.done, burnt: F.burnt, cook: +F.cook.toFixed(2) };
      oven.mains(false); const before = F.cook; tick(3, (dt) => F.update(dt)); o.powerCut = F.cook === before; oven.mains(true);
      open(oven); tray.takeTarget.toggle(); o.out = tray.held && F.load.parent === tray.model;
      const p = atTop(); A.use(p); o.placed = tray.placed;
      return o;
    });
    check(s.openCook === 0 && s.done && !s.burnt, 'the open oven does nothing; shut, the fries on the tray bake golden', s);
    check(s.powerCut, 'a power cut stops the oven', s);
    check(s.out && s.placed, 'the tray comes out with the golden fries on it and goes down on the worktop', s);
    await shot('plat-med-pommes-klar-pa-banken', await r(() => { const t = window.__t.top; return { pos: [t.x - 0.5, t.y + 0.45, t.z + 0.25], at: [t.x, t.y, t.z] }; }));
    s = await r(() => {
      const A = window.__app, { tray } = window.__t, F = A.fries;
      const blocked = F.takeTarget.blocked; F.takeTarget.toggle(); const bunch = A.heldItem();
      const o = { blocked, bunch: !!bunch?.isFries, n: bunch?.n }; bunch?.putBack(); F.reset(); o.reset = F.where === 'airfryer';
      const w = A.keepWorld(); const k = Object.keys(w?.things?.items ?? {}).find((x) => x.startsWith('ugnsplåten|')); o.saved = k ? w.things.items[k] : null;
      return o;
    });
    check(!s.blocked && s.bunch && s.n > 0 && s.reset, 'a bunch is taken off the tray; F returns the heap to the basket', s);
    check(Array.isArray(s.saved?.p) && s.saved.p.length === 3, 'the tray put down is in the reload record (its place)', s);

    // 5. fish fingers on the tray in the open oven, baked, then the tray out with them on it
    s = await r(() => {
      const A = window.__app, { oven, tray, open, intoOven, tick, freezer } = window.__t, F = A.fish;
      tray.takeTarget.toggle(); open(oven); const b = intoOven(); A.use(b); const o = { inOven: tray.inOven };
      open(freezer); F.press(); const f = intoOven(); o.kind = f?.kind; o.name = f?.name; o.blocked = f?.blockedText; A.use(f);
      for (let i = 0; i < 2; i++) { F.press(); F.ovenHeld(); }
      o.n = F.inOven.length; o.onTray = F.inOven.every((x) => x.model.parent === tray.model);
      open(oven, false); tick(16, (dt) => F.update(dt)); o.fried = F.inOven.every((x) => x.fried && !x.burnt);
      open(oven); tray.takeTarget.toggle(); o.ride = tray.held && F.inOven.length === 3 && F.inOven.every((x) => x.model.parent === tray.model);
      tray.putBack(); o.home = tray.inOven;
      for (const x of F.inOven) x.hide();
      return o;
    });
    check(s.inOven && s.kind === 'ovenfish' && s.name === 'fiskpinnen på ugnsplåten' && !s.blocked, 'a fish finger aimed into the open oven offers "lägga fiskpinnen på ugnsplåten"', s);
    check(s.n === 3 && s.onTray && s.fried && s.ride && s.home, 'three on the tray bake golden, ride out on it and back in', s);

    // 6. the chicken roasts on the tray (#1219 unchanged otherwise) and rides out on it; the sausage on the tray
    s = await r(() => {
      const A = window.__app, { oven, tray, open, intoOven, atTop, tick, fridge, lifeOut, rows, V } = window.__t, B = A.chicken, L = A.life;
      open(fridge); B.take(); open(fridge, false); open(oven);
      const f = intoOven(); const o = { kind: f?.kind, name: f?.name, blocked: f?.blockedText }; A.use(f);
      o.onTray = B.inOven && B.model.parent === tray.model;
      open(oven, false); B.update(0.1); oven.update(0); o.lamp = oven.heating && oven.lamp.emissiveIntensity > 0;
      tick(10.5, (dt) => B.update(dt)); o.roasted = B.done && !B.burnt && B.inOven;
      o.saved = B.saveState().place?.oven === true;
      open(oven); tray.takeTarget.toggle(); o.ride = tray.held && B.model.parent === tray.model && B.inOven;
      const p = atTop(); A.use(p); o.placed = tray.placed && B.model.parent === tray.model;
      return o;
    });
    check(s.kind === 'ovenChicken' && s.name === 'kycklingen på ugnsplåten' && !s.blocked && s.onTray, 'the chicken aimed into the open oven goes on the tray', s);
    check(s.lamp && s.roasted && s.saved, 'shut, it roasts golden (the lamp glows) and is saved as in the oven', s);
    check(s.ride && s.placed, 'the tray comes out with the roasted chicken and goes down on the worktop', s);
    await shot('kyckling-pa-ugnsplat', await r(() => { const t = window.__t.top; return { pos: [t.x - 0.55, t.y + 0.5, t.z + 0.3], at: [t.x, t.y + 0.05, t.z] }; }));
    s = await r(() => {
      const A = window.__app, { oven, tray, open, atTop, tick, fridge, lifeOut, rows, V } = window.__t, B = A.chicken, L = A.life;
      B.take(); const o = {}; B.putBack();
      open(fridge); const sz = lifeOut('sausagePack'); open(fridge, false);
      const f = atTop(); o.kind = f?.kind; o.store = f?.store; o.rows = rows(f); A.use(f); L.runner.update(1);
      o.onTray = sz.place.store === 'ovenRack' && L.view(sz).model.parent?.parent === tray.model;
      tray.takeTarget.toggle(); open(oven); tray.putBack(); open(oven, false); tick(17, (dt) => A.cookStores.update(dt));
      o.cooked = !!sz.machine.cooked; o.name = L.items.name(sz);
      open(oven); L.view(sz).take(); o.out = L.items.held() === sz; L.view(sz).placeAt(new V(5.25, 0.931, 3.9));
      return o;
    });
    check(s.kind === 'life' && s.store === 'ovenRack' && s.onTray, 'a raw sausage goes on the tray on the worktop', s);
    check(s.cooked && s.out, 'slid in and shut, it cooks; taken off the tray', s);
    check(!errors.length, 'no page errors', errors.slice(0, 5).join(' | '));
  } catch (e) { check(false, 'exception', e.stack); } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
