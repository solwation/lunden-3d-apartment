// The paddock's stile (#1295, src/paddockgeo.js `stile`, src/farwalk.js `stileSurface`, src/paddock.js): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/stiletest.cjs http://localhost:PORT /tmp/shots1295`
// Checks: a real held-W walk goes in over the stile (the feet reach the platform height on the way) and a held-W walk back out again; the fence beside the stile and the gate still
// stop a walk; screenshots of the stile from the footpath side and from inside the paddock.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8137', out = process.argv[3] || '/tmp/shots1295';
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
  const walk = await page.evaluate(async () => {
    const a = window.__app, geo = await import('/src/paddockgeo.js'), fw = await import('/src/farwalk.js'), S = geo.stile, p = a.player;
    a.day.hour = 12; a.day.paused = true; a.touch.enabled = true; // (movement is only read while the pointer is locked or touch is on)
    const run = (x, z, dx, dz, frames) => { // walk from (x, z) towards (dx, dz) holding W
      p.spawn(x, z, 0); a.step(1 / 30); p.keys.add('KeyW'); let maxY = -9, minY = 99;
      for (let i = 0; i < frames; i++) { a.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ'); a.step(1 / 30); maxY = Math.max(maxY, p.pos.y); minY = Math.min(minY, p.pos.y); }
      p.keys.delete('KeyW'); return { x: p.pos.x, z: p.pos.z, y: p.pos.y, maxY, minY, hp: a.fall?.active };
    };
    const base = fw.stileBase(), top = base + 3 * 0.38;
    const fromOut = [S.x - S.nx * 2.6, S.z - S.nz * 2.6], fromIn = [S.x + S.nx * 2.6, S.z + S.nz * 2.6];
    const inn = run(...fromOut, S.nx, S.nz, 200), inside = geo.insideFence(inn.x, inn.z);
    const back = run(inn.x, inn.z, -S.nx, -S.nz, 200), outside = !geo.insideFence(back.x, back.z);
    const gx = (geo.posts[geo.gateSpan][0] + geo.posts[(geo.gateSpan + 1) % geo.posts.length][0]) / 2, gz = (geo.posts[geo.gateSpan][1] + geo.posts[(geo.gateSpan + 1) % geo.posts.length][1]) / 2;
    const beside = run(S.x + S.tx * 1.0 - S.nx * 2.0, S.z + S.tz * 1.0 - S.nz * 2.0, S.nx, S.nz, 200); // on the fence 1 m beside the stile's axis (inside its side wall)
    const beside2 = run(S.x - S.tx * 1.0 - S.nx * 2.0, S.z - S.tz * 1.0 - S.nz * 2.0, S.nx, S.nz, 200);
    const gate = run(gx - S.nx * 2.0 * 0 - geo.stile.nx * 2.0, gz - geo.stile.nz * 2.0, geo.stile.nx, geo.stile.nz, 200); // (the gate's span has the same inward normal side)
    a.touch.enabled = false;
    return { inn, inside, back, outside, base, top, beside: geo.insideFence(beside.x, beside.z), beside2: geo.insideFence(beside2.x, beside2.z), gate: geo.insideFence(gate.x, gate.z), stile: [S.x, S.z, S.nx, S.nz] };
  });
  console.log(JSON.stringify(walk));
  check(walk.inside && walk.inn.maxY > walk.top - 0.05, 'walking in over the stile: the feet reach the platform and end inside the paddock', `maxY ${walk.inn.maxY.toFixed(2)} top ${walk.top.toFixed(2)}`);
  check(walk.outside && walk.back.maxY > walk.top - 0.05, 'walking out again over the stile ends outside the fence', `maxY ${walk.back.maxY.toFixed(2)}`);
  check(!walk.beside && !walk.beside2, 'the fence beside the stile still stops a walk', '');
  check(!walk.gate, 'the closed gate still stops a walk', '');
  const shot = async (name, outSide, dist, h, extra = '') => {
    const d = await page.evaluate(async ({ outSide, dist, h, extra }) => {
      const a = window.__app, geo = await import('/src/paddockgeo.js'), S = geo.stile, k = outSide ? -1 : 1;
      a.touch.enabled = false; a.day.hour = 12; a.day.paused = true;
      const cx = S.x + S.nx * k * dist + (extra ? S.tx * 0.6 : 0), cz = S.z + S.nz * k * dist + (extra ? S.tz * 0.6 : 0);
      a.player.spawn(cx, cz, 0); a.step(1 / 30);
      a.camera.position.set(cx, a.paddock.ground(cx, cz) + h, cz); a.camera.lookAt(S.x, a.paddock.ground(S.x, S.z) + 1.0, S.z); a.camera.updateMatrixWorld(true);
      a.renderer.render(a.scene, a.camera); return a.renderer.domElement.toDataURL('image/png');
    }, { outSide, dist, h, extra });
    require('fs').writeFileSync(`${out}/${name}.png`, Buffer.from(d.split(',')[1], 'base64'));
  };
  await shot('stile-outside', true, 3.5, 1.6, 'a');
  await shot('stile-inside', false, 3.5, 1.6, 'a');
  await browser.close();
  console.log(pass ? 'ALL PASS' : 'SOME FAILED'); process.exit(pass ? 0 : 1);
})();
