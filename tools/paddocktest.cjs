// Pony paddock (#1280, src/paddock.js, src/paddockgeo.js): `PLAYWRIGHT_MODULE=$(npm root -g)/playwright CHROME_PATH=… node tools/paddocktest.cjs http://localhost:PORT /tmp/shots1280`
// Checks: one fence mesh and one pony mesh (one draw call each), triangle budgets, the two named ponies and their coats, ponies stay inside the
// fence (and clear of trunks) for ten simulated minutes, they walk to the visitor, nothing moves or draws when far away, rays pass through them,
// the fence stops a real walk (held W from outside) and sits in farWalls, screenshots from outside the fence and from above.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8137', out = process.argv[3] || '/tmp/shots1280';
require('fs').mkdirSync(out, { recursive: true });
let pass = true;
const check = (ok, name, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); pass &&= !!ok; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${base}/index.html?shot&time=12&month=7&day=10&weather=clear`);
  await page.waitForFunction(() => window.__app?.paddock, null, { timeout: 420000 });
  await page.waitForTimeout(2000);
  const at = (x, z, yaw, pitch = 0, y = null) => page.evaluate(({ x, z, yaw, pitch, y }) => {
    const a = window.__app; a.day.hour = 12; a.day.paused = true; a.player.spawn(x, z, 0); a.step(1 / 30);
    a.camera.position.set(x, y ?? a.camera.position.y, z); a.camera.rotation.set(pitch * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); a.camera.updateMatrixWorld(true);
  }, { x, z, yaw, pitch, y });
  // geometry, names, coats
  const info = await page.evaluate(() => {
    const p = window.__app.paddock, tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const coat = Array.from(p.mesh.geometry.attributes.aCoat.array);
    return { fence: tris(p.fence), pony: tris(p.mesh) / p.mesh.count, n: p.mesh.count, names: p.ponies.map((q) => q.name), coat, waypoints: p.waypoints.length, shelter: !!p.spots.shelter, trough: !!p.spots.trough };
  });
  check(info.names.join() === 'Zoey,Princess' && info.n === 2, 'two ponies, Zoey and Princess', JSON.stringify(info.names));
  check(info.coat[0] > 0.7 && info.coat[1] > 0.7 && info.coat[2] > 0.6 && info.coat[3] < 0.25, 'Zoey white, Princess brown (linear coat rgb)', info.coat.map((v) => v.toFixed(2)).join());
  check(info.fence < 12000 && info.pony < 1200, 'triangle budgets', `fence ${info.fence}, pony ${info.pony}`);
  check(info.waypoints > 50 && info.shelter && info.trough, 'waypoints, trough and shelter', `${info.waypoints}`);
  // one draw call each
  await at(-105, 232, 90, -3);
  await page.evaluate(() => { const a = window.__app; for (let i = 0; i < 5; i++) a.step(1 / 30); });
  const calls = await page.evaluate(() => {
    const { paddock, renderer, scene, camera } = window.__app; const c = { fence: 0, ponies: 0 }, r = renderer.renderBufferDirect;
    renderer.renderBufferDirect = function (cam, s, g, m, o) { if (o === paddock.fence) c.fence++; if (o === paddock.mesh) c.ponies++; return r.apply(this, arguments); };
    renderer.render(scene, camera); renderer.renderBufferDirect = r; return c;
  });
  check(calls.fence === 1 && calls.ponies === 1, 'one draw call each for the fence and the ponies', JSON.stringify(calls));
  // long simulation with the visitor outside the east fence: ponies come to the fence and never leave it
  const sim = await page.evaluate(async () => {
    const a = window.__app, p = a.paddock, geo = await import('/src/paddockgeo.js'), { treeFeet } = await import('/src/surroundings.js');
    a.player.spawn(-108, 238, 0); a.step(1 / 30);
    let outside = 0, treeHit = 0, minTree = 99, near = 1e9;
    for (let i = 0; i < 6000; i++) { // 600 s at 10 Hz
      p.update(0.1);
      for (const q of p.ponies) {
        if (!geo.insideFence(q.x, q.z, 1.0)) outside++;
        for (const t of treeFeet) { const d = Math.hypot(t.x - q.x, t.z - q.z); if (d < minTree) minTree = d; }
      }
      if (i > 1500) near = Math.min(near, ...p.ponies.map((q) => Math.hypot(q.x + 108, q.z - 238)));
    }
    return { outside, minTree, near, pos: p.ponies.map((q) => [q.x.toFixed(1), q.z.toFixed(1), q.state]) };
  });
  check(sim.outside === 0, 'ponies stay inside the fence for 10 simulated minutes', JSON.stringify(sim));
  check(sim.minTree > 0.9, 'ponies keep clear of tree trunks', sim.minTree.toFixed(2));
  check(sim.near < 14, 'a pony walks to the visitor at the fence', sim.near.toFixed(1));
  // far away: no simulation, not drawn
  const far = await page.evaluate(() => {
    const a = window.__app, p = a.paddock; a.player.spawn(-30, 25, 0); a.step(1 / 30); const before = JSON.stringify(p.ponies.map((q) => [q.x, q.z, q.yaw]));
    for (let i = 0; i < 100; i++) p.update(0.1);
    return { visible: p.mesh.visible, same: before === JSON.stringify(p.ponies.map((q) => [q.x, q.z, q.yaw])) };
  });
  check(!far.visible && far.same, 'ponies neither drawn nor simulated from the courtyard', JSON.stringify(far));
  // not a target
  await at(-105, 232, 90, -3);
  const ray = await page.evaluate(async () => {
    const T = await import('three'), a = window.__app, p = a.paddock, q = p.ponies[0]; p.update(0.01);
    const o = new T.Vector3(q.x + 3, q.y + 1, q.z), rc = new T.Raycaster(o, new T.Vector3(-1, 0, 0), 0, 10);
    return { ponies: rc.intersectObject(p.mesh).length, fence: rc.intersectObject(p.fence).length };
  });
  check(ray.ponies === 0 && ray.fence === 0, 'rays and darts pass through ponies and fence (no raycast)', JSON.stringify(ray));
  // the fence blocks a real walk
  const walk = await page.evaluate(async () => {
    const a = window.__app, geo = await import('/src/paddockgeo.js'), fw = await import('/src/farwalk.js');
    const res = []; a.touch.enabled = true; // (movement is only read while the pointer is locked or touch is on)
    for (const [x, z] of [[-110, 236], [-111.5, 225], [-109, 244]]) {
      a.player.spawn(x, z, 0); a.camera.rotation.set(0, Math.PI / 2, 0, 'YXZ'); a.player.keys.add('KeyW');
      for (let i = 0; i < 300; i++) a.step(1 / 30);
      a.player.keys.delete('KeyW'); res.push([a.player.pos.x.toFixed(1), geo.insideFence(a.player.pos.x, a.player.pos.z), +(a.player.pos.x - x).toFixed(1)]);
    }
    a.touch.enabled = false;
    const segs = fw.farWalls(-113, 236, 0), n = geo.fenceSegments().filter((f) => segs.some((s) => s[0] === f[0] && s[1] === f[1] && s[2] === f[2] && s[3] === f[3])).length;
    return { res, n };
  });
  check(walk.res.every(([, inside, moved]) => !inside && moved < -1) && walk.n > 0, 'walking west into the fence is stopped (gate included); fence segments are in farWalls', JSON.stringify(walk));
  // Klappa (#1293): looking at a pony within reach focuses it (kind 'pony', verb klappa); E pats it: it turns its head, flicks its ears, lowers its muzzle, then carries on
  const pet = await page.evaluate(async () => {
    const T = await import('three'), a = window.__app, p = a.paddock, q = p.ponies[0];
    a.touch.enabled = true; a.player.spawn(q.x - 1.4, q.z, 0); q.state = 'idle'; q.left = 99; q.yaw = 1.5; p.update(0.1); // facing east to the pony's side
    a.camera.rotation.set(-0.2, -Math.PI / 2, 0, 'YXZ'); a.camera.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) { a.camera.rotation.set(-0.2, -Math.PI / 2, 0, 'YXZ'); a.step(1 / 30); }
    const f = a.focus().focused; const kind = f?.kind, name = f?.name, verb = f?.verb;
    f?.pet(); let maxEar = 0, maxYaw = 0, minNeck = 9, maxNeck = 0; const st = [];
    for (let i = 0; i < 40; i++) { p.update(0.1); maxEar = Math.max(maxEar, q.ear); maxYaw = Math.max(maxYaw, Math.abs(q.headYaw)); minNeck = Math.min(minNeck, q.neck); maxNeck = Math.max(maxNeck, q.neck); if (i === 5) st.push(q.state); }
    for (let i = 0; i < 100; i++) p.update(0.1);
    a.touch.enabled = false;
    return { kind, name, verb, maxEar, maxYaw, maxNeck, during: st[0], after: q.state };
  });
  check(pet.kind === 'pony' && pet.verb === 'klappa' && pet.name === 'Zoey', 'the crosshair focuses Zoey with the verb klappa', JSON.stringify(pet));
  check(pet.during === 'pet' && pet.maxEar > 0.3 && pet.maxNeck > 0.35 && pet.after !== 'pet', 'petting: stops, flicks the ears, lowers the muzzle, then moves on', JSON.stringify(pet));
  // screenshots
  const shot = async (name, x, z, yaw, pitch, y) => { await at(x, z, yaw, pitch, y); const d = await page.evaluate(() => { const a = window.__app; for (let i = 0; i < 3; i++) a.step(1 / 30); a.renderer.render(a.scene, a.camera); return a.renderer.domElement.toDataURL('image/png'); }); require('fs').writeFileSync(`${out}/${name}.png`, Buffer.from(d.split(',')[1], 'base64')); };
  await page.evaluate(() => { const a = window.__app; a.player.spawn(-108, 238, 0); for (let i = 0; i < 800; i++) a.paddock.update(0.1); });
  await shot('after-gate', -110.5, 224, 90, -4);
  await shot('after-above', -100, 235, 90, -35, 40);
  await browser.close();
  console.log(pass ? 'ALL PASS' : 'SOME FAILED'); process.exit(pass ? 0 : 1);
})();
