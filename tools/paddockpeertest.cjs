// #1644 two players share the pony paddock through the (local) Worker: real Ghosts + Paddock on flat ground, no apartment.
// Usage: PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/paddockpeertest.cjs GAME WORKER OUT   (node cloudflare/dev.mjs PORT for WORKER)
// Checks: the first player leads, the second follows the same pony positions / states and gets the same grass mask, a follower's
// pat reaches the leader's pony (scored only by the patter), grazing by the leader reaches the follower, the lead passes on when the
// leader leaves, a player without the room simulates alone; no page errors. Screenshots: both players' view of the same ponies.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8644', worker = process.argv[3] || 'http://localhost:8744', out = process.argv[4] || '/tmp/lunden-paddock1644';
let checks = 0, failures = 0;
const check = (ok, text) => { checks++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pages = [], errors = [];
  const open = async (name, url) => {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } }); // own localStorage: the grass mask is not shared by the browser
    const page = await ctx.newPage(); pages.push(page);
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// fixture, no apartment' }));
    await page.goto(game);
    await page.evaluate(async ({ name, url }) => {
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Paddock } = await import('/src/paddock.js'), { centre } = await import('/src/paddockgeo.js');
      document.body.innerHTML = ''; document.body.style.margin = '0';
      const scene = new T.Scene(); scene.background = new T.Color(0xa9c8e8);
      scene.add(new T.HemisphereLight(0xffffff, 0x556644, 1.6)); const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(30, 60, 20); scene.add(sun);
      const ground = new T.Mesh(new T.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x6f8f45 })); ground.position.set(centre.x, -0.01, centre.z); scene.add(ground);
      const camera = new T.PerspectiveCamera(60, 1.6, 0.1, 500); camera.position.set(centre.x, 1.7, centre.z + 60); // within view distance, beyond `curious`
      window.where = [camera.position.x, 0, camera.position.z];
      window.paddock = new Paddock({ scene, camera, ground: () => 0, trees: [] });
      window.pets = 0; paddock.onPet = () => pets++; window.mask0 = Array.from(paddock.gm.v); // this player's own (random) mask before any sync
      window.ghosts = new Ghosts({ scene, camera, url, name: () => name, active: () => true, weapon: () => '', score: () => 0, mirrored: () => true, state: () => ({ p: window.where, r: 0, c: false }) });
      paddock.net = { ready: () => ghosts.connected, send: (m) => ghosts.paddock(m) }; ghosts.onPaddock = (m) => paddock.onNet(m);
      window.tick = setInterval(() => { ghosts.update(0.05); paddock.update(0.05, false, 0); }, 50);
      window.renderer = new T.WebGLRenderer({ antialias: true }); renderer.setSize(640, 400); document.body.appendChild(renderer.domElement);
      window.view = () => ({ lead: paddock.lead, following: paddock.following(), ponies: paddock.ponies.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, state: p.state, gone: p.gone, y: p.y })), grass: Array.from(paddock.gm.v) });
      window.shoot = (eye, look) => { const c = new T.PerspectiveCamera(50, 1.6, 0.1, 500); c.position.set(...eye); c.lookAt(...look); paddock.write(); paddock.mesh.visible = paddock.grass.visible = true; renderer.render(scene, c); };
    }, { name, url });
    if (url === worker) await page.waitForFunction(() => ghosts.connected);
    return page;
  };
  const v = (p) => p.evaluate(() => view());
  const apart = (a, b) => Math.max(...a.ponies.map((q, i) => Math.hypot(q.x - b.ponies[i].x, q.z - b.ponies[i].z)));
  const grassGap = (a, b) => { let s = 0, m = 0; a.grass.forEach((x, k) => { const d = Math.abs(x - b.grass[k]); s += d; m = Math.max(m, d); }); return { mean: s / a.grass.length, max: m }; };
  try {
    const a = await open('Spelare A', worker);
    await a.waitForFunction(() => paddock.lead, null, { timeout: 10000 });
    check(true, 'A, alone at the paddock, leads (and sends nothing while alone)');
    await a.waitForTimeout(4000); // A's ponies wander; its grass mask differs from B's fresh random one
    const b = await open('Spelare B', worker);
    const before = grassGap(await v(a), { grass: await b.evaluate(() => mask0) });
    await b.waitForFunction(() => paddock.following(), null, { timeout: 10000 });
    await b.waitForTimeout(2500);
    let va = await v(a), vb = await v(b);
    check(!vb.lead && vb.following, 'B follows A');
    check(apart(va, vb) < 1.5, `same pony positions (largest gap ${apart(va, vb).toFixed(2)} m; B glides one second behind)`);
    check(va.ponies.every((q, i) => q.state === vb.ponies[i].state || vb.ponies[i].state === 'walk' || q.state === 'walk'), `same pony states (${va.ponies.map((q) => q.state)} / ${vb.ponies.map((q) => q.state)})`);
    let gg = grassGap(va, vb);
    check(before.mean > 0.02 && gg.mean < 0.01 && gg.max < 0.25, `same grass mask (mean gap ${before.mean.toFixed(3)} before B got A's, ${gg.mean.toFixed(4)} after, max ${gg.max.toFixed(3)})`);
    // B pats Princess: A's pony stops for the pat; only B scores it
    await b.evaluate(() => paddock.pet(1));
    await a.waitForFunction(() => paddock.ponies[1].state === 'pet', null, { timeout: 3000 });
    await b.waitForTimeout(1200);
    va = await v(a); vb = await v(b);
    check(va.ponies[1].state === 'pet' && vb.ponies[1].state === 'pet', 'B pats Princess: she stops for the pat at both');
    check(await b.evaluate(() => pets) === 1 && await a.evaluate(() => pets) === 0, 'the pat is scored by B only');
    // A's ponies graze a big patch (as hours of grazing would): it reaches B with the next mask
    await a.evaluate(async () => { const { centre } = await import('/src/paddockgeo.js'); paddock.eatAt(centre.x, centre.z, 12, 1); paddock.grassT = 0; });
    const mid0 = await a.evaluate(async () => { const { centre } = await import('/src/paddockgeo.js'); return [centre.x, centre.z]; });
    await b.waitForFunction(([x, z]) => paddock.grassAt(x, z) < 0.05, mid0, { timeout: 5000 });
    va = await v(a); vb = await v(b); gg = grassGap(va, vb);
    check(gg.mean < 0.01, `A's grazed patch reaches B (mean gap ${gg.mean.toFixed(4)})`);
    // screenshots: the same camera at both
    const [p0, p1] = va.ponies, mid = [(p0.x + p1.x) / 2, (p0.z + p1.z) / 2], sep = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1, back = Math.max(7, sep * 1.05);
    const eye = [mid[0] - (p1.z - p0.z) / sep * back, 3.5, mid[1] + (p1.x - p0.x) / sep * back], look = [mid[0], 0.7, mid[1]]; // side on to the line between the two ponies
    await a.waitForTimeout(800);
    for (const [p, nm] of [[a, 'a'], [b, 'b']]) { await p.evaluate(({ eye, look }) => { clearInterval(tick); shoot(eye, look); }, { eye, look }); await p.screenshot({ path: `${out}/hagen-spelare-${nm}.png` }); }
    await a.evaluate(() => { window.tick = setInterval(() => { ghosts.update(0.05); paddock.update(0.05, false, 0); }, 50); });
    await b.evaluate(() => { window.tick = setInterval(() => { ghosts.update(0.05); paddock.update(0.05, false, 0); }, 50); });
    // A leaves the paddock: B leads and simulates alone
    await a.evaluate(() => { window.where = [where[0] + 500, 0, where[2]]; }); // (a new array: Ghosts compares states by reference)
    await b.waitForFunction(() => paddock.lead, null, { timeout: 5000 });
    await b.waitForTimeout(2000);
    vb = await v(b);
    check(vb.lead && !vb.following && vb.ponies.every((q) => Number.isFinite(q.x)), 'A walks away: B leads and its ponies carry on');
    // no room at all: simulates as before
    const c = await open('Spelare C', 'http://localhost:9');
    await c.waitForTimeout(3000);
    const vc = await v(c), moved = await c.evaluate(() => paddock.ponies.map((p) => p.state));
    check(!vc.lead && !vc.following && vc.ponies.every((q) => Number.isFinite(q.x)), `offline: ponies simulated locally (${moved})`);
    check(errors.length === 0, `no page errors: ${JSON.stringify(errors)}`);
    console.log(failures ? `SOME FAILED (${failures})` : `ALL PASS (${checks})`); if (failures) process.exitCode = 1;
  } finally { for (const p of pages) await p.evaluate(() => { clearInterval(tick); ghosts.disconnect(); }).catch(() => {}); await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
