// New Year's Eve countdown (#1199): ?newyear starts at 23:59:45 on 31 December; the last 10 s every TV switches on and
// counts down, "Gott nytt år!" after midnight, the TVs it switched on go off again; champagne flutes on the coffee table
// from the countdown until 04:00 on 1 January (two draw calls). Also a real-time run through midnight.
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/newyeartest.cjs http://localhost:8137 /tmp/newyear
const kit = require('./testkit.cjs');
const fs = require('fs');
const [base = 'http://localhost:8137', out = '/tmp/newyear'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };

(async () => {
  const browser = await kit.launch();
  try {
    // 1) frozen clock, set by hand
    const { page } = await kit.open(browser, `${base}/?newyear&freeze&shot&at=3.95,12.3,0,-14`, { lazy: true });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    const state = () => page.evaluate(() => {
      const { day, newYear, world } = window.__app;
      const tvs = world.furnitureTargets.filter((t) => t.kind === 'tv');
      return { month: day.month, date: day.date, hour: day.hour, phase: newYear.phase, left: newYear.st?.left,
        on: tvs.map((t) => t.isOpen), overlay: tvs.map((t) => !!t.screen.overlay), glasses: !!newYear.glasses?.visible };
    });
    const at = (fn) => page.evaluate(async (src) => {
      const { day, step } = window.__app;
      new Function('day', src)(day);
      for (let i = 0; i < 12; i++) step(1 / 60);
    }, fn);
    let s = await state();
    check(s.month === 12 && s.date === 31 && Math.abs(s.hour - (23 + 59 / 60 + 45 / 3600)) < 1e-6, `?newyear → 31/12 ${s.hour.toFixed(5)} h`);
    check(s.phase === '' && s.on.every((v) => !v) && !s.glasses, `before the countdown: TVs off, no glasses (${JSON.stringify(s)})`);
    await at('day.hour = 24 - 7.5 / 3600;');
    s = await state();
    check(s.phase === 'count' && s.left === 8, `7.5 s to midnight: counting, shows ${s.left}`);
    check(s.on.length === 3 && s.on.every(Boolean) && s.overlay.every(Boolean), `all ${s.on.length} TVs on with the countdown`);
    check(s.glasses, 'champagne flutes on the coffee table');
    const calls = await page.evaluate(() => { // how often the flutes' meshes are drawn in one frame (every pass: mirrors too)
      const { newYear, testMode } = window.__app;
      let n = 0; const ms = newYear.glasses.children;
      for (const m of ms) m.onBeforeRender = () => { n++; };
      testMode.draw();
      for (const m of ms) m.onBeforeRender = () => {};
      return { n, meshes: ms.length };
    });
    check(calls.meshes === 2 && calls.n <= 4, `the flutes: ${calls.meshes} meshes, ${calls.n} draw calls in a frame`);
    await kit.shot(page, `${out}/countdown.png`);
    await page.evaluate(() => window.__app.camera.rotation.set(-0.55, 0, 0)); // down at the table
    await kit.shot(page, `${out}/glasses.png`);
    await page.evaluate(() => { const { camera, player } = window.__app; player.spawn(4.0, 10.85, 0); camera.rotation.set(-0.75, 0, 0); });
    await kit.shot(page, `${out}/glasses-close.png`);
    await at('day.addDays(1); day.hour = 20 / 3600;');
    s = await state();
    check(s.month === 1 && s.date === 1 && s.phase === 'cheer' && s.on.every(Boolean), 'after midnight: "Gott nytt år!" on the TVs');
    await page.evaluate(() => { const { camera, player } = window.__app; player.spawn(3.95, 12.3, 0); camera.rotation.set(-0.24, 0, 0); });
    await kit.shot(page, `${out}/cheer.png`);
    await at('day.hour = 2 / 60;');
    s = await state();
    check(s.phase === '' && s.on.every((v) => !v) && s.overlay.every((v) => !v), 'two minutes past: the TVs it switched on are off again');
    check(s.glasses, 'the flutes still stand there');
    await at('day.hour = 5;');
    s = await state();
    check(!s.glasses, 'at 05:00 the flutes are gone');
    await at('day.addDays(-1); day.hour = 24 - 5 / 3600; window.__app.world.furnitureTargets.find((t) => t.kind === "tv" && !t.room).toggle();');
    s = await state();
    check(s.phase === '' || s.on.filter(Boolean).length === 3, `a TV already on stays on through the countdown (${s.on})`);
    await at('day.addDays(1); day.hour = 3 / 60;');
    s = await state();
    check(s.on.filter(Boolean).length === 1, `afterwards only the TV switched on by hand is still on (${s.on})`);
    check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
    await page.context().close();

    // 2) the running clock through midnight
    const r = await kit.open(browser, `${base}/?newyear&shot`, { lazy: true });
    const seen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const p = await r.page.evaluate(() => { window.__app.step(1 / 30); const n = window.__app.newYear; return n.phase === 'count' ? `count${n.st.left}` : n.phase || `idle${window.__app.day.month}`; });
      seen.add(p);
      if (p === 'cheer') break;
      await new Promise((res) => setTimeout(res, 200));
    }
    check(seen.has('cheer') && [...seen].some((p) => p.startsWith('count')), `running clock: ${[...seen].join(' → ')}`);
    await r.page.context().close();
  } finally { await browser.close(); }
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
