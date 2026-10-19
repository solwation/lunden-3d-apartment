// Pony shelter, shade trees and snow (#1316, src/paddockshelter.js, src/paddock.js): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/sheltertest.cjs http://localhost:PORT /tmp/shots1316`
// Checks: the shade trees are in treeFeet and block a real walk; in rain (the paddock's own rain input, then the real forced weather) the ponies walk to the shed / under a
// tree and stay until it has been dry for PADDOCK.rain.dry s, then go out into the paddock; in the snow months (&month=1) the ponies are gone, not drawn, not pettable, and
// come back when the month is July; the ponies stay inside the fence throughout. Screenshots: trees, sheltering in rain, the empty winter paddock.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8137', out = process.argv[3] || '/tmp/shots1316';
require('fs').mkdirSync(out, { recursive: true });
let pass = true;
const check = (ok, name, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); pass &&= !!ok; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (query) => {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(`${base}/index.html?shot&time=12&day=10&freeze&${query}`);
    await page.waitForFunction(() => window.__app?.paddock, null, { timeout: 420000 });
    await page.waitForTimeout(1500);
    return page;
  };
  const view = (page, x, z, yaw, pitch = 0, y = null) => page.evaluate(({ x, z, yaw, pitch, y }) => {
    const a = window.__app; a.day.paused = true; a.player.spawn(x, z, 0); a.step(1 / 30);
    a.camera.position.set(x, y ?? a.camera.position.y, z); a.camera.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); a.camera.updateMatrixWorld(true);
  }, { x, z, yaw, pitch, y });
  const shot = async (page, name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 }); };

  // --- summer, dry: trees, then rain through the paddock's own input
  let page = await open('month=7&weather=clear');
  const trees = await page.evaluate(async () => {
    const { treeFeet } = await import('/src/surroundings.js'), { PADDOCK } = await import('/src/config.js'), { riverAt } = await import('/src/riverbridge.js');
    return PADDOCK.trees.map(([x, z]) => ({ n: treeFeet.filter((t) => Math.hypot(t.x - x, t.z - z) < 0.01 && t.kind === 'big').length, river: riverAt(x, z).distance - riverAt(x, z).width / 2 }));
  });
  check(trees.length >= 2 && trees.every((t) => t.n === 1), 'the shade trees are big trees in treeFeet', JSON.stringify(trees));
  check(trees.every((t) => t.river > 15), 'the shade trees are well away from the river', JSON.stringify(trees.map((t) => t.river.toFixed(0))));
  const walk = await page.evaluate(async () => { // a real held-W walk straight at the first trunk stops short of it
    const { PADDOCK } = await import('/src/config.js'), a = window.__app, [tx, tz] = PADDOCK.trees[0];
    a.touch.enabled = true; a.player.spawn(tx, tz + 6, 0); a.camera.rotation.set(0, 0, 0, 'YXZ'); a.player.keys.add('KeyW');
    for (let i = 0; i < 300; i++) a.step(1 / 30);
    a.player.keys.delete('KeyW'); a.touch.enabled = false;
    const d = Math.hypot(a.player.pos.x - tx, a.player.pos.z - tz);
    return d;
  });
  check(walk > 0.5 && walk < 4, 'walking into a trunk is stopped by it', `${walk.toFixed(2)} m from the trunk`);
  await view(page, -150, 236, 120, 0); await shot(page, 'trees-from-the-east');
  await view(page, -192, 250, -35, -32, 30); await shot(page, 'trees-from-above');
  const rain = await page.evaluate(async () => {
    const a = window.__app, p = a.paddock, geo = await import('/src/paddockgeo.js');
    a.player.spawn(-108, 238, 0); a.step(1 / 30);
    const near = (q) => p.shelterPlaces.some((s) => Math.hypot(s.x - q.x, s.z - q.z) < 1.2);
    for (let i = 0; i < 200; i++) p.update(0.1, false, 0); // dry: not sheltering
    const dryUnder = p.ponies.filter(near).length, dryKinds = p.ponies.map((q) => q.state);
    let outside = 0;
    for (let i = 0; i < 1500; i++) { p.update(0.1, false, 0.8); for (const q of p.ponies) if (!geo.insideFence(q.x, q.z, 1.0)) outside++; } // 150 s of rain
    const under = p.ponies.filter(near).length, seekers = p.ponies.filter((q) => q.seek).length, kinds = p.ponies.map((q) => p.shelterPlaces.find((s) => Math.hypot(s.x - q.x, s.z - q.z) < 1.2)?.kind ?? null);
    const apart = Math.hypot(p.ponies[0].x - p.ponies[1].x, p.ponies[0].z - p.ponies[1].z);
    window.__rainPos = p.ponies.map((q) => [q.x, q.z]);
    for (let i = 0; i < 100; i++) p.update(0.1, false, 0.8); // …and they stay put while it keeps raining
    const stay = p.ponies.every((q, i) => Math.hypot(q.x - window.__rainPos[i][0], q.z - window.__rainPos[i][1]) < 1.5 || !q.seek);
    return { dryUnder, under, seekers, kinds, apart, outside, stay };
  });
  check(rain.dryUnder === 0, 'dry weather: nobody is under cover', JSON.stringify(rain));
  check(rain.under >= 1 && rain.under >= rain.seekers - 0, 'rain: the ponies that seek cover are under the shed or a tree', JSON.stringify(rain));
  check(rain.apart > 1.5 && rain.outside === 0 && rain.stay, 'sheltering ponies keep apart, inside the fence and stay while it rains');
  await view(page, -108, 238, 90, -3); // from the gate side
  const where = await page.evaluate(() => { const q = window.__app.paddock.ponies.find((p) => p.seek); return [q.x, q.z, q.spot?.kind]; });
  await view(page, where[0] + (where[2] === 'tree' ? 9 : 7), where[1] + 2, 90, -5); await page.evaluate(() => window.__app.weather.kind); await shot(page, 'sheltering-from-the-side');
  const dry = await page.evaluate(async () => {
    const p = window.__app.paddock, geo = await import('/src/paddockgeo.js'), { PADDOCK } = await import('/src/config.js');
    for (let i = 0; i < (PADDOCK.rain.dry - 5) * 10; i++) p.update(0.1, false, 0); const early = p.ponies.filter((q) => q.spot).length;
    for (let i = 0; i < 1800; i++) p.update(0.1, false, 0); // 3 more minutes dry
    return { early, late: p.ponies.filter((q) => q.spot).length, states: p.ponies.map((q) => q.state), inside: p.ponies.every((q) => geo.insideFence(q.x, q.z, 1)) };
  });
  check(dry.early >= 1 && dry.late === 0 && dry.inside, 'after the rain (and the dry delay) the ponies go back out', JSON.stringify(dry));
  await page.close();

  // --- the real forced weather reaches the ponies through main.js
  page = await open('month=7&weather=rain');
  const real = await page.evaluate(() => {
    const a = window.__app, p = a.paddock; a.player.spawn(-108, 238, 0);
    let on = 0; for (let i = 0; i < 1200; i++) { a.step(0.1); if (p.rainy) on++; }
    return { rainy: p.rainy, rainFrames: on, rain: a.weather.rain, kind: a.weather.kind, seekers: p.ponies.filter((q) => q.seek).length, spots: p.ponies.filter((q) => q.spot).length };
  });
  check(real.rainy && real.seekers >= 1 && real.spots >= 1, 'forced rain in the real app sends ponies to shelter', JSON.stringify(real));
  await page.close();

  // --- winter: the snow months
  page = await open('month=1&weather=snow');
  await view(page, -108, 238, 90, -3);
  const win = await page.evaluate(async () => {
    const a = window.__app, p = a.paddock; a.player.spawn(-108, 238, 0);
    for (let i = 0; i < 400; i++) a.step(0.1);
    const r = { winter: p.winter, gone: p.ponies.map((q) => q.gone), visible: p.mesh.visible, targets: p.targets().length, calls: 0 };
    a.day.month = 7; for (let i = 0; i < 200; i++) a.step(0.1);
    r.back = { winter: p.winter, gone: p.ponies.map((q) => q.gone), visible: p.mesh.visible, targets: p.targets().length };
    return r;
  });
  check(win.winter && win.gone.every(Boolean) && !win.visible && win.targets === 0, 'snow months: the ponies are gone, not drawn and not pettable', JSON.stringify(win));
  check(!win.back.winter && win.back.gone.every((g) => !g) && win.back.visible && win.back.targets === 2, 'when the snow is gone they are back', JSON.stringify(win.back));
  await page.close();
  page = await open('month=1&weather=snow');
  await view(page, -108, 238, 90, -3);
  const walkIn = await page.evaluate(async () => { // the ponies are out when the month flips to winter in front of the visitor: they walk to the shed first
    const a = window.__app, p = a.paddock; a.day.month = 7; for (let i = 0; i < 100; i++) a.step(0.1);
    a.player.spawn(-108, 238, 0); for (let i = 0; i < 300; i++) a.step(0.1);
    const before = p.ponies.filter((q) => !q.gone).length; a.day.month = 1;
    let popped = 0, first = -1; for (let i = 0; i < 1500; i++) { a.step(0.1); const n = p.ponies.filter((q) => q.gone).length; if (n && first < 0) first = i / 10; }
    return { before, first, gone: p.ponies.map((q) => q.gone) };
  });
  check(walkIn.before === 2 && walkIn.gone.every(Boolean) && walkIn.first > 1, 'a pony in view walks to the shelter before it is gone (no pop in the open)', JSON.stringify(walkIn));
  await view(page, -108, 238, 90, -3); await shot(page, 'winter-empty-paddock');
  await page.close();
  await browser.close();
  console.log(pass ? 'ALL PASS' : 'SOME FAILED'); process.exit(pass ? 0 : 1);
})();
