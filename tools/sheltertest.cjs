// Pony shelter, shade trees and snow (#1316, src/paddockshelter.js, src/paddock.js): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/sheltertest.cjs http://localhost:PORT /tmp/shots1316`
// Checks: the shade trees are in treeFeet and block a real walk; in rain (the paddock's own rain input, then the real forced weather) the ponies walk to the shed / under a
// tree and stay until it has been dry for PADDOCK.rain.dry s, then go out into the paddock; in the snow months (&month=1) both ponies remain visible in the shed and
// walk back out when the month is July; the ponies stay inside the fence throughout. Screenshots: trees, sheltering in rain, the occupied winter shed.
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
    await page.evaluate(() => {
      // Simulate the real app without drawing thousands of identical GPU frames;
      // screenshots below explicitly use the original full-quality renderer.
      const a = window.__app, r = a.renderer, render = r.render;
      r.setAnimationLoop(null); r.render = () => {};
      window.__shelterDraw = () => { const idle = r.render; r.render = render; try { r.render(a.scene, a.camera); } finally { r.render = idle; } };
    });
    return page;
  };
  const view = (page, x, z, yaw, pitch = 0, y = null) => page.evaluate(({ x, z, yaw, pitch, y }) => {
    const a = window.__app; a.day.paused = true; a.player.spawn(x, z, 0); a.step(1 / 30);
    a.camera.position.set(x, y ?? a.camera.position.y, z); a.camera.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); a.camera.updateMatrixWorld(true);
  }, { x, z, yaw, pitch, y });
  const shot = async (page, name) => { await page.evaluate(() => window.__shelterDraw()); await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 }); };

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
    for (let i = 0; i < 200; i++) p.update(0.1, false, 0); // dry: not sheltering (#1353: measure the shelter state, not distance — a pony may graze beside the shed by chance)
    const dryUnder = p.ponies.filter((q) => q.spot || q.seek).length, dryKinds = p.ponies.map((q) => q.state);
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

  // --- winter: both ponies actually occupy the visible shed, also on a cold start
  page = await open('month=1&weather=snow');
  await view(page, -108, 238, 90, -3);
  const win = await page.evaluate(async () => {
    const a = window.__app, p = a.paddock;
    const under = () => p.ponies.every((q, i) => { const s = p.stable(i); return s && Math.hypot(q.x-s.x, q.z-s.z)<0.1 && !q.gone; });
    for (let i = 0; i < 600; i++) a.step(0.1);
    const T = await import('three'), m = new T.Matrix4(), scale = new T.Vector3(), pos = new T.Vector3(), rot = new T.Quaternion();
    const scales = p.ponies.map((_,i) => { p.mesh.getMatrixAt(i,m);m.decompose(pos,rot,scale);return scale.x; });
    const r = { winter:p.winter, gone:p.ponies.map(q=>q.gone), under:under(), visible:p.mesh.visible, targets:p.targets().length, grass:p.grass.visible, scales };
    // A camera outside the view range hides the draw, but must not erase winter occupants.
    a.player.spawn(0,0,0);a.step(0.1);r.far={visible:p.mesh.visible,gone:p.ponies.map(q=>q.gone)};
    a.player.spawn(-108,238,0);a.step(0.1);r.returned=p.mesh.visible&&under();
    return r;
  });
  check(win.winter && win.under && win.visible && win.scales.every(s=>s>0) && win.targets===2 && !win.grass,
    'snow months: two visible, full-size ponies stand in the shed; snowy grass stays hidden',JSON.stringify(win));
  check(!win.far.visible && win.far.gone.every(g=>!g) && win.returned,'distance culling preserves both winter occupants and restores their draw');
  const front=await page.evaluate(()=>{const p=window.__app.paddock,s=p.spots.shelter;return{x:s.x+Math.sin(s.yaw)*9,z:s.z+Math.cos(s.yaw)*9,yaw:s.yaw*180/Math.PI};});
  await view(page,front.x,front.z,front.yaw,-4);await shot(page,'winter-occupied-shed');
  const back=await page.evaluate(()=>{const a=window.__app,p=a.paddock;a.day.month=7;for(let i=0;i<1800;i++)a.step(0.1);return{winter:p.winter,visible:p.mesh.visible,targets:p.targets().length,spots:p.ponies.map(q=>q.spot),out:p.ponies.some((q,i)=>Math.hypot(q.x-p.stable(i).x,q.z-p.stable(i).z)>3)};});
  check(!back.winter&&back.visible&&back.targets===2&&back.spots.every(s=>!s)&&back.out,'summer releases the ponies back into the paddock',JSON.stringify(back));
  // Change to winter in view: they walk in, never vanish or teleport in the open.
  const walkIn=await page.evaluate(()=>{
    const a=window.__app,p=a.paddock;a.player.spawn(-108,238,0);a.step(0.1);a.day.month=1;
    let gone=0,maxJump=0;const start=p.ponies.map(q=>[q.x,q.z]);
    for(let i=0;i<2400;i++){const before=p.ponies.map(q=>[q.x,q.z]);a.step(0.1);p.ponies.forEach((q,j)=>{gone+=q.gone?1:0;maxJump=Math.max(maxJump,Math.hypot(q.x-before[j][0],q.z-before[j][1]));});}
    return{gone,maxJump,under:p.ponies.every((q,i)=>{const s=p.stable(i);return Math.hypot(q.x-s.x,q.z-s.z)<0.1}),moved:p.ponies.some((q,i)=>Math.hypot(q.x-start[i][0],q.z-start[i][1])>3)};
  });
  check(walkIn.under&&walkIn.gone===0&&walkIn.maxJump<0.6&&walkIn.moved,'visible ponies walk into the winter shed without disappearing',JSON.stringify(walkIn));
  await view(page,front.x,front.z,front.yaw,-4);await shot(page,'winter-after-walk-in');
  await page.close();
  await browser.close();
  console.log(pass ? 'ALL PASS' : 'SOME FAILED'); process.exit(pass ? 0 : 1);
})();
