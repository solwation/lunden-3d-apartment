// The New Year flutes as real glasses (#1222): with ?newyear after midnight a flute on the coffee table is the look ray's
// target, taken it leaves the merged decor (still 2 meshes for the rest), drunk sip by sip until empty, put down on the
// table and filled again from the champagne bottle out of the wine rack; after N.glassesUntil the untouched ones are away
// (no target) while the one put down stays an ordinary glass. Screenshots into OUT.
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/newyearglasstest.cjs http://localhost:8137 /tmp/newyearglass
const kit = require('./testkit.cjs');
const fs = require('fs');
const [base = 'http://localhost:8137', out = '/tmp/newyearglass'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };

(async () => {
  const browser = await kit.launch();
  try {
    const { page } = await kit.open(browser, `${base}/?newyear&freeze&shot&at=4.0,10.95,0,0`, { lazy: true });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev(() => document.getElementById('start-touch').click()); // playing (touch: the HUD's buttons)
    await ev(() => { const { day, step } = window.__app; day.addDays(1); day.hour = 20 / 3600; for (let i = 0; i < 6; i++) step(1 / 60); });
    let s = await ev(() => {
      const { newYear, player, camera, step, focus } = window.__app;
      player.spawn(4.0, 11.0, 0); const aim = newYear.flutes[1].home.pos.clone(); aim.y += 0.17; camera.lookAt(aim); step(1 / 60);
      const f = focus().focused;
      return { flutes: newYear.flutes.length, decor: newYear.flutes.filter((x) => x.decor).length, meshes: newYear.glasses?.children.length,
        aim: f?.item ? newYear.flutes.indexOf(f.item) : -1, verb: f?.verb, what: f?.name ?? null, fill: newYear.flutes.map((x) => +x.fill.toFixed(2)) };
    });
    check(s.flutes === 4 && s.decor === 4 && s.meshes === 2, `four full flutes in the merged decor (${JSON.stringify(s)})`);
    check(s.aim >= 0 && s.verb === 'ta', `the look ray takes a flute (${s.aim}, "${s.verb}")`);
    check(s.fill.every((v) => Math.abs(v - 0.85) < 1e-6), `each holds champagne ${s.fill}`);
    s = await ev(() => {
      const { newYear, use, focus, heldItem, step } = window.__app;
      const f = focus().focused.item; use(f.target); for (let i = 0; i < 3; i++) step(1 / 60);
      window.__flute = f;
      let calls = 0; const counted = [...newYear.glasses.children, f.model, f.liquid.mesh];
      for (const m of counted) m.onBeforeRender = () => { calls++; };
      window.__app.testMode.draw();
      for (const m of counted) m.onBeforeRender = () => {};
      return { held: heldItem() === f, decor: newYear.flutes.filter((x) => x.decor).length, meshes: newYear.glasses.children.length,
        visible: f.model.visible, liquid: f.liquid.mesh.visible, label: f.useLabel, main: f.contents.main, calls };
    });
    check(s.held && s.visible && s.liquid && s.main === 'champagne', `in the hand, champagne in it (${JSON.stringify(s)})`);
    check(s.decor === 3 && s.meshes === 2 && s.calls <= 8, `three left in the decor: still 2 meshes; ${s.calls} draw calls in a frame for decor + held flute`);
    check(s.label === 'Drick', `"${s.label}" while it holds something`);
    await ev(() => window.__app.camera.rotation.set(-0.2, 0, 0));
    await kit.shot(page, `${out}/held.png`);
    s = await ev(() => {
      const { step } = window.__app, f = window.__flute, fills = [];
      for (let i = 0; i < 10 && f.fill > 0.01; i++) { f.use(); for (let k = 0; k < 40; k++) step(1 / 60); fills.push(+f.fill.toFixed(2)); }
      return { fills, used: f.used, label: f.useLabel, liquid: f.liquid.mesh.visible };
    });
    check(s.fills.length >= 2 && s.fills.at(-1) <= 0.01 && s.used && !s.liquid && s.label === null, `drunk sip by sip until empty (${s.fills.join(' → ')})`);
    s = await ev(() => {
      const { things, use, heldItem, step, camera } = window.__app, f = window.__flute, V = camera.position.constructor;
      f.placeAt(new V(3.6, 0.47, 10.55)); step(1 / 60);
      const bottle = things.find((t) => t.kind === 'champagne');
      use(bottle.target); step(1 / 60);
      const verb = f.target.verb;
      use(f.target); for (let k = 0; k < 90; k++) step(1 / 60);
      return { placed: f.placed, visible: f.model.visible, bottle: heldItem() === bottle, verb, fill: +f.fill.toFixed(2), main: f.contents.main, liquid: f.liquid.mesh.visible };
    });
    check(s.placed && s.visible, 'put down on the coffee table: its own model shows');
    check(s.bottle && s.verb === 'hälla champagne i' && Math.abs(s.fill - 0.85) < 1e-6 && s.main === 'champagne' && s.liquid, `filled again from the champagne bottle (${JSON.stringify(s)})`);
    await ev(() => { const { player, camera, step } = window.__app; player.spawn(3.75, 11.25, 0); camera.rotation.set(-0.6, 0, 0); step(1 / 60); });
    await kit.shot(page, `${out}/refilled.png`);
    s = await ev(() => {
      const { day, step, newYear, things } = window.__app, f = window.__flute;
      things.find((t) => t.kind === 'champagne').putBack(); day.hour = 5; for (let i = 0; i < 6; i++) step(1 / 60);
      const home = newYear.flutes.filter((x) => x !== f);
      return { glasses: !!newYear.glasses?.visible, away: home.every((x) => x.target.kind === 'none' && !x.model.visible),
        mine: f.placed && f.model.visible && f.target === f.takeTarget && Math.abs(f.fill - 0.85) < 1e-6 };
    });
    check(!s.glasses && s.away, 'at 05:00 the untouched flutes are away (no decor, no target)');
    check(s.mine, 'the flute put down stays an ordinary glass with its champagne');
    s = await ev(() => { const { toggleFurniture, step, newYear } = window.__app, f = window.__flute; toggleFurniture(false); step(1 / 60); toggleFurniture(true); step(1 / 60);
      return { home: f.atHome, away: f.target.kind === 'none', hidden: !f.model.visible, decor: newYear.flutes.some((x) => x.decor) }; });
    check(s.home && s.away && s.hidden && !s.decor, `F sends it home: put away after the night (${JSON.stringify(s)})`);
    s = await ev(() => { const { day, step, newYear } = window.__app; day.addDays(-1); day.hour = 24 - 5 / 3600; for (let i = 0; i < 6; i++) step(1 / 60);
      return { decor: newYear.flutes.filter((x) => x.decor).length, full: newYear.flutes.every((x) => Math.abs(x.fill - 0.85) < 1e-6 && !x.used) }; });
    check(s.decor === 4 && s.full, 'the next countdown: four full flutes again');
    check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
    await page.context().close();
  } finally { await browser.close(); }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
