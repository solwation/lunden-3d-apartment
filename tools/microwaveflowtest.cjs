// #1224 (part of #1210): the whole pizza flow through the real E ("Använd") path: the freezer door and its top drawer, the Billys
// box, one wrapped pizza in the hand, unwrapped, onto a plate, the plate into the microwave, shut, start → "den varma pizzan".
//   python3 tools/devserve.py 8778 .
//   PLAYWRIGHT_MODULE=… [CHROME_PATH=…] [ANGLE=gl] [SHOTS=/dir] node tools/microwaveflowtest.cjs http://localhost:8778
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8778';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 20 * 60000).unref();

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', ...(process.env.ANGLE === 'gl' ? ['--use-angle=gl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?life&shot&test=lazy&quality=0&time=14&month=7&day=15&freeze`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.microwave && window.__app.life, null, { timeout: 900000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const shot = async (name) => {
      await page.evaluate(() => { const app = window.__app; app.frame(1 / 60); app.camera.updateMatrixWorld(); app.renderer.render(app.scene, app.camera); });
      try { await page.screenshot({ path: `${shots}/${name}.png`, timeout: 120000 }); console.log(`  shot ${name}.png`); }
      catch (e) { console.log(`  (shot ${name} skipped: ${String(e.message).split('\n')[0]})`); }
    };
    await page.evaluate(() => {
      const fz0 = window.__app.world.lids.find((l) => l.kind === 'fridge' && l.freezer);
      const A = window.__app, V = A.camera.position.constructor, Box3 = fz0.drawers[0].bounds.constructor, mw = A.microwave, cav = mw.cav;
      const fz = A.world.lids.find((l) => l.kind === 'fridge' && l.freezer);
      const T0 = window.__t = {
        // stand `back` m from a world point on the given side ('x': −x of it, 'z': −z of it — the freezer's front), look at it, pick the focus
        look(p, { back = 0.9, side = 0, axis = 'x', up = 0 } = {}) {
          if (axis === 'z') A.player.spawn(p.x + side, p.z - back, 0); else A.player.spawn(p.x - back, p.z + side, 0);
          A.frame(1 / 60);
          const d = p.clone().sub(A.camera.getWorldPosition(new V()));
          A.camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); A.frame(1 / 60);
          return A.focus().focused;
        },
        grip() { const bb = (T0.drawer.body.geometry.boundingBox ??= (T0.drawer.body.geometry.computeBoundingBox(), T0.drawer.body.geometry.boundingBox)); return T0.drawer.body.localToWorld(new V((bb.min.x + bb.max.x) / 2, bb.max.y - 0.035, bb.min.z)); }, // the drawer front's grip
        // the menu row with this label (as the player clicks / presses its number): the HUD rows of the current aim
        rows: () => (A.choices.rows ?? []).map((x) => x.label + (x.reason ? ` [${x.reason}]` : '')),
        pick(re) { const i = (A.choices.rows ?? []).findIndex((x) => re.test(x.label) && !x.reason); return i >= 0 && A.runChoice(i) ? A.choices.rows?.[i]?.label ?? true : false; },
        Box3,
        center: (o) => new Box3().setFromObject(o).getCenter(new V()),
        fz, drawer: fz.drawers.find((d) => d.storeId === 'freezerDrawer4'),
        wp: (o) => o.getWorldPosition(new V()),
        turntable: () => cav.parts.localToWorld(new V(cav.x, cav.y + 0.08, cav.z)),
        panel: () => cav.panel.getWorldPosition(new V()).add(new V(-0.02, -0.08, 0)),
        door: () => mw.door.door.children[0].getWorldPosition(new V()),
        run(s) { for (let t = 0; t < s - 1e-6; t += 0.05) A.frame(0.05); },
        // the first allowed row — what plain E runs — as the HUD would label it
        label: (f) => f?.options?.().find((a) => !a.reason)?.label ?? f?.blockedText ?? null,
      };
    });
    const r = (fn, arg) => page.evaluate(fn, arg);
    await r(() => document.getElementById('start-touch')?.click()); await r(() => { for (let i = 0; i < 2; i++) window.__app.frame(0.05); });

    // 1. the freezer door (aimed at its handle side), then its top drawer, through E
    let s = await r(() => {
      const A = window.__app, T = window.__t, I = A.life.items;
      const box = I.all().find((i) => i.type === 'billysBox');
      const out = { home: box?.place.store + '#' + box?.place.slot };
      const fp = T.wp(T.fz.object); fp.y = 1.0;
      let f = T.look(T.wp(T.fz.pickable), { axis: 'z', back: 0.9 });
      out.doorKind = f?.name; out.doorOpenBefore = T.fz.isOpen;
      A.use(f); T.run(2.5); out.doorOpen = T.fz.isOpen && T.fz.t >= 1;
      f = T.look(T.grip(), { axis: 'z', back: 0.9 });
      out.drawerName = f?.name; A.use(f); T.run(2.5); out.drawerOut = T.drawer.isOpen;
      return out;
    });
    check(s.home === 'freezerDrawer4#0' && s.doorOpen, 'E on the freezer door opens it; the Billys box is at home in the top drawer (#1219)', JSON.stringify(s));
    check(s.drawerOut && /fryslåda 4/.test(s.drawerName ?? ''), 'E on the top drawer pulls it out', JSON.stringify({ name: s.drawerName, out: s.drawerOut }));
    await shot('flow-freezer-open');

    // 2. open the box, take one wrapped pizza (E on the box each time)
    s = await r(() => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items;
      const box = I.all().find((i) => i.type === 'billysBox'), out = {};
      const aim = () => { // a few tries around the box (its open lid / flaps move the bounds)
        const V = A.camera.position.constructor; let f = null;
        for (const [back, dy, side] of [[0.7, 0, 0], [0.7, 0.03, 0], [0.5, 0, 0], [0.5, 0.04, 0], [0.5, -0.03, 0.03], [0.4, 0.02, -0.03]]) { f = T.look(T.center(L.view(box).model).add(new V(side, dy, 0)), { axis: 'z', back }); if (f?.options?.().length) return f; }
        if (!f) throw new Error('no focus on the box: ' + JSON.stringify({ c: T.center(L.view(box).model).toArray(), cam: A.camera.position.toArray(), drawerT: T.drawer.t, pkg: box.pkg, held: I.held()?.type }));
        return f;
      };
      let f = aim(); out.rows1 = T.rows(); out.l1 = T.pick(/^öppna Billys/i); T.run(1); out.pkg = box.pkg;
      f = aim(); out.rows2 = T.rows(); out.l2 = T.pick(/ta en Billys pan pizza/); T.run(1);
      const pz = I.held(); out.held = pz?.type; out.name = pz ? I.name(pz) : null; out.left = box.amount;
      return out;
    });
    check(s.pkg === 'open' && s.held === 'billys' && s.name === 'den inplastade pizzan', 'E opens the box, then takes a wrapped pizza into the hand', JSON.stringify(s));

    // 3. unwrap it in the hand (E menu row "packa upp pizzan"), then it is still frozen
    s = await r(() => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items, pz = I.held(), out = {};
      T.look(T.wp(T.fz.pickable), { axis: 'z', back: 0.9 }); out.rows = T.rows(); out.label = T.pick(/packa upp pizzan/) || null;
      if (!out.label) { const row = L.options({ instance: pz }).find((a) => a.id === 'open'); out.fallback = true; out.label = row?.label; row.run(); }
      T.run(1); out.pkg = pz.pkg; out.name = I.name(pz); out.cooked = !!pz.machine?.cooked;
      return out;
    });
    check(s.label === 'packa upp pizzan' && s.pkg === 'open' && s.name === 'den frysta pizzan' && !s.cooked, 'unwrapped: "den frysta pizzan", not warm yet', JSON.stringify(s));

    // 4. shut the drawer and the door (E), then the plate: aim at the plate lying out and E, put the pizza on it
    s = await r(() => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items, pz = I.held(), out = {};
      let f = T.look(T.grip(), { axis: 'z', back: 0.9 });
      A.use(f); T.run(2.5); out.drawerShut = !T.drawer.isOpen;
      f = T.look(T.wp(T.fz.pickable), { axis: 'z', back: 0.9 }); A.use(f); T.run(2.5); out.doorShut = !T.fz.isOpen;
      out.held = I.held()?.id === pz.id;
      // the plate: first put the pizza down on the worktop beside it by E, take the plate, then the pizza onto the plate
      const plate = I.all().find((i) => i.type === 'plate' && i.place.at === 'world');
      out.plateAt = plate?.place.pos;
      return { ...out, plate: plate?.id };
    });
    check(s.drawerShut && s.doorShut && s.held && s.plate, 'E shuts the drawer and the freezer; the pizza stays in the hand', JSON.stringify(s));
    const plateId = s.plate;
    s = await r((plateId) => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items, V = A.camera.position.constructor, pz = I.held(), plate = I.get(plateId), out = {};
      // hand → plate: aim at the plate (pizza in hand) and E ("lägga pizzan på tallriken")
      const f = T.look(L.view(plate).model.getWorldPosition(new V()).add(new V(0, 0.02, 0)), { back: 0.6 });
      out.label = T.label(f); A.use(f); T.run(0.5);
      out.onPlate = pz.place.at === 'on' && pz.place.parent === plate.id; out.hand = I.held()?.id ?? null;
      // plate into the hand: aim at its rim (not at the pizza) until the first row is about the plate, then E
      const bb = new T.Box3().setFromObject(L.view(plate).model), c = bb.getCenter(new V()), half = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
      let g = null; out.tries = [];
      for (const [dx, dz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
        g = T.look(c.clone().add(new V(dx * half, 0.015, dz * half)), { back: 0.6 }); const l = T.label(g); out.tries.push(l);
        if (/tallrik/.test(l ?? '') && !/pizza/.test(l)) break; g = null;
      }
      out.label2 = g ? T.label(g) : null; if (g) { A.use(g); T.run(0.5); } out.plateHeld = I.held()?.id === plate.id; out.stillOn = pz.place.parent === plate.id;
      return out;
    }, plateId);
    check(s.onPlate && s.plateHeld && s.stillOn, 'E puts the pizza on the plate; E again takes the plate (with the pizza) into the hand', JSON.stringify(s));

    // 5. open the microwave, plate in, shut, start (the panel)
    s = await r(() => {
      const A = window.__app, T = window.__t, mw = A.microwave, out = {};
      A.use(T.look(T.door(), { back: 0.9, side: 0.5 })); T.run(1.5); out.open = mw.door.isOpen;
      const f = T.look(T.turntable(), { back: 0.9 }); out.label = T.label(f); A.use(f); T.run(0.3);
      out.in = A.life.items.all().some((i) => i.type === 'plate' && i.place.store === 'microwave') && !A.life.items.held();
      A.use(T.look(T.door(), { back: 0.9, side: 0.5 })); T.run(1.5); out.shut = !mw.door.isOpen;
      return out;
    });
    check(s.open && s.in && s.shut && s.label === 'ställa tallriken i mikron', 'plate into the microwave through E, door shut', JSON.stringify(s));
    await r(() => { const A = window.__app, T = window.__t; T.look(T.turntable(), { back: 0.7 }); A.camera.rotation.x -= 0.25; });
    await shot('flow-pizza-in-microwave');
    s = await r(() => {
      const A = window.__app, T = window.__t, I = A.life.items, mw = A.microwave, pz = I.all().find((i) => i.type === 'billys'), out = {};
      const f = T.look(T.panel(), { back: 0.9 }); out.blocked = f?.blocked; out.kind = f?.kind;
      A.use(f); out.running = mw.running; T.run(2); out.mid = pz.machine.heat;
      out.secs = mw.seconds; for (let t = 0; mw.running && t < 14; t += 0.5) T.run(0.5); out.done = mw.done && !mw.running; out.name = I.name(pz); out.cooked = !!pz.machine.cooked; out.heat = pz.machine.heat;
      return out;
    });
    check(s.kind === 'microwave' && !s.blocked && s.running && s.done && s.cooked && s.name === 'den varma pizzan', 'E on the panel runs the set time (default 60 s); the pizza becomes "den varma pizzan"', JSON.stringify(s));
    await r(() => { const A = window.__app, T = window.__t; T.look(T.panel(), { back: 0.9 }); });
    await shot('flow-micro-display-done');

    // 6. the warm pizza can be eaten (not blocked as "djupfryst")
    s = await r(() => {
      const A = window.__app, T = window.__t, L = A.life, I = L.items, pz = I.all().find((i) => i.type === 'billys');
      L.view(pz).take(); const eat = L.options({ instance: pz }).find((a) => a.id === 'eat'); return { reason: eat?.reason ?? null, has: !!eat, label: eat?.label, held: I.held()?.id === pz.id };
    });
    check(s.has && !s.reason, 'the warm pizza is edible (no "djupfryst" refusal)', JSON.stringify(s));
  } catch (e) { check(false, 'harness', e.stack); }
  check(errors.length === 0, 'no page errors', errors.join(' | '));
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
