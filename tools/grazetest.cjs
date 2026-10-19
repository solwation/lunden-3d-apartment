// Grazing (#1315): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/grazetest.cjs http://localhost:PORT /tmp/shots1315`
// Checks: the long-grass tufts are ONE instanced draw call within the triangle budget, the mask starts patchy (grazed patches + long grass), a grazing pony with its head down
// crops the grass in front of its muzzle, ten simulated minutes leave a patchy (not uniform) mask, the grass regrows slowly, snow months hide the tufts,
// screenshots of a pony grazing and of the long/short pattern from above.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8137', out = process.argv[3] || '/tmp/shots1315';
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
  const stats = () => page.evaluate(() => { const p = window.__app.paddock, g = p.gm, c = 1.5; let n = 0, s = 0, lo = 0, hi = 0; for (let j = 0; j < g.H; j++) for (let i = 0; i < g.W; i++) { const x = g.x0 + (i + 0.5) * c, z = g.z0 + (j + 0.5) * c; if (!p.inside(x, z)) continue; const q = g.v[j * g.W + i]; n++; s += q; if (q < 0.3) lo++; if (q > 0.8) hi++; } return { mean: s / n, lo: lo / n, hi: hi / n }; });
  const info = await page.evaluate(() => { const g = window.__app.paddock.grass; return { n: g.count, tris: g.count * g.geometry.attributes.position.count / 3, name: g.name }; });
  check(info.n > 500 && info.tris < 50000, 'tufts: one instanced mesh within budget', JSON.stringify(info));
  const s0 = await stats();
  check(s0.lo > 0.05 && s0.hi > 0.4, 'the mask starts patchy: grazed patches and long grass', JSON.stringify(s0));
  await at(-105, 232, 90, -3);
  await page.evaluate(() => { const a = window.__app; for (let i = 0; i < 5; i++) a.step(1 / 30); });
  const calls = await page.evaluate(() => {
    const { paddock, renderer, scene, camera } = window.__app; let n = 0, v = paddock.grass.visible; const r = renderer.renderBufferDirect;
    renderer.renderBufferDirect = function (cam, s, g, m, o) { if (o === paddock.grass) n++; return r.apply(this, arguments); };
    renderer.render(scene, camera); renderer.renderBufferDirect = r; return { n, v };
  });
  check(calls.n === 1 && calls.v, 'one draw call for the grass', JSON.stringify(calls));
  // force Zoey to graze on a long spot and check the cropping
  const crop = await page.evaluate(() => {
    const a = window.__app, p = a.paddock, z = p.ponies[0], g = p.gm;
    let best = null; for (const w of p.waypoints) if (p.grassAt(w[0], w[1]) > 0.95 && (!best || Math.hypot(w[0] + 105, w[1] - 232) < Math.hypot(best[0] + 105, best[1] - 232))) best = w;
    z.x = best[0]; z.z = best[1]; z.yaw = 1.57; z.state = 'graze'; z.left = 1e6; z.target = null; z.goal = null;
    const mx = () => [z.x + Math.sin(z.yaw) * 1.15, z.z + Math.cos(z.yaw) * 1.15];
    const before = p.grassAt(...mx()); for (let i = 0; i < 600; i++) a.step(1 / 30); // 20 s
    return { before, after: p.grassAt(...mx()), neck: z.neck };
  });
  check(crop.before > 0.9 && crop.after < 0.4 && crop.neck > 1.1, 'a pony grazing with its head down crops the grass at its muzzle', JSON.stringify(crop));
  const zp = await page.evaluate(() => { const z = window.__app.paddock.ponies[0]; return [z.x, z.z]; });
  await at(zp[0] + 1.5, zp[1] + 5, 0, -12);
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__app.step(1 / 30); });
  await page.screenshot({ path: `${out}/grazing-near.png` });
  await at(-40, 232, 90, 0);
  // ten simulated minutes: ponies decide for themselves, the pattern stays patchy and they move on from short grass
  await page.evaluate(() => { for (const q of window.__app.paddock.ponies) { q.state = 'idle'; q.left = 0.1; } });
  const walked = await page.evaluate(() => { const a = window.__app, p = a.paddock; const s = new Set(); for (let i = 0; i < 18000; i++) { a.step(1 / 30); if (i % 300 === 0) p.ponies.forEach((q) => s.add(q.state)); } return [...s]; });
  const s1 = await stats();
  check(s1.lo > 0.03 && s1.hi > 0.3 && walked.includes('graze') && walked.includes('walk'), 'after ten minutes the pattern is still patchy and the ponies graze and walk', JSON.stringify({ s1, walked }));
  // regrowth: nothing eaten for a long time raises the mean
  const grow = await page.evaluate(() => { const a = window.__app, p = a.paddock, m = () => { let s = 0; for (const q of p.gm.v) s += q; return s / p.gm.v.length; }; const b = m(); for (const q of p.ponies) { q.state = 'idle'; q.left = 1e9; } for (let i = 0; i < 9000; i++) a.step(1 / 30); return { b, a: m() }; });
  check(grow.a > grow.b, 'the grass regrows slowly', JSON.stringify(grow));
  // #1342: 72 h of real time regrow the whole meadow, also while nobody is near (the mask is caught up by the wall clock)
  const real = await page.evaluate(() => { const a = window.__app, p = a.paddock, m = () => { let s = 0; for (const q of p.gm.v) s += q; return s / p.gm.v.length; }; p.gm.v.fill(0.05); const b = m(); p.gm.real -= 72 * 3600e3; for (const q of p.ponies) { q.state = 'idle'; q.left = 1e9; } for (let i = 0; i < 40; i++) a.step(1 / 30); return { b, a: m() }; });
  check(real.a > 0.99, 'a fully grazed meadow is long again after 72 h of real time', JSON.stringify(real));
  // screenshots from above
  await page.evaluate(() => { const p = window.__app.paddock; p.ponies.forEach((q) => { q.left = 0.1; }); });
  await at(-118, 232, 90, -55, 28);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__app.step(1 / 30); });
  await page.screenshot({ path: `${out}/pattern-above.png` });
  await at(-105, 232, 90, -8);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__app.step(1 / 30); });
  await page.screenshot({ path: `${out}/pattern-gate.png` });
  // winter: the tufts are hidden
  const snow = await page.evaluate(() => { const a = window.__app; a.paddock.snowy = true; a.step(1 / 30); const h = !a.paddock.grass.visible; a.paddock.snowy = false; a.step(1 / 30); return h && a.paddock.grass.visible; });
  check(snow, 'snow months hide the tufts');
  console.log(pass ? 'ALL PASS' : 'SOME FAILED'); await browser.close(); process.exit(pass ? 0 : 1);
})();
