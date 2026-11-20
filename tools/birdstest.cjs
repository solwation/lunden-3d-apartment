// Birds (#1252, src/birds.js): `PLAYWRIGHT_MODULE=$(npm root -g)/playwright CHROME_PATH=… node tools/birdstest.cjs http://localhost:8772 /tmp/shots1252`
// Checks: one instanced mesh / one draw call, shown by day, hidden at night, in rain, in the cloud whiteout and far away; fewer
// with &lowmem; high flock hidden behind the cloud deck; deterministic motion; no per-frame allocation in update(); screenshots.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8772', out = process.argv[3] || '/tmp/shots1252';
require('fs').mkdirSync(out, { recursive: true });
let pass = true;
const check = (ok, name, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); pass &&= !!ok; };
async function open(browser, q) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${base}/index.html?shot&time=12&month=7&day=10${q}`);
  await page.waitForFunction(() => window.__app?.birds !== undefined, null, { timeout: 420000 });
  await page.waitForTimeout(1500);
  return page;
}
const calls = (page) => page.evaluate(() => {
  const { birds, renderer, scene, camera } = window.__app;
  let n = 0; const r = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (c, s, g, m, o) { if (birds.meshes?.includes(o) || o === birds.mesh) n++; return r.apply(this, arguments); };
  renderer.render(scene, camera); renderer.renderBufferDirect = r; return n;
});
// run a few frames with the weather / clock forced, then report whether the birds are visible
const state = (page, { hour = 12, weather = null, y = null, steps = 90 }) => page.evaluate(({ hour, weather, y, steps }) => {
  const a = window.__app; a.day.hour = hour; a.day.paused = true;
  a.player.spawn(-30, 25, 0); a.player.pos.y = y ?? 0; a.player.eyeY = (y ?? 0) + 1.62; a.camera.position.y = a.player.eyeY;
  for (let i = 0; i < steps; i++) a.step(1 / 30);
  return { visible: a.birds.mesh.visible, fade: a.birds.fade, rain: a.weather.rain, overcast: a.day.overcast, above: a.day.above };
}, { hour, weather, y, steps });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let page = await open(browser, '&weather=clear');
  const info = await page.evaluate(() => { const b = window.__app.birds; return { n: b.count, inst: b.meshes.reduce((n,m)=>n+m.geometry.instanceCount,0), tris: b.mesh.geometry.attributes.position.count / 3, nearTris:b.nearMesh.geometry.attributes.position.count/3, lights: 0 }; });
  check(info.n >= 5 && info.inst === info.n, 'exclusive LOD batches contain all birds', JSON.stringify(info));
  check(info.tris <= 12 && info.nearTris <= 400, 'bounded far and near triangles per bird', JSON.stringify(info));
  let s = await state(page, {});
  check(s.visible && s.fade > 0.99, 'visible by day in clear weather', JSON.stringify(s));
  check(await calls(page) === 1, 'exactly one draw call');
  const pos = () => page.evaluate(() => { const a = window.__app; a.step(1 / 30); return a.birds.uniforms.uTime.value; });
  const t1 = await pos(); await pos(); check((await pos()) > t1, 'animation time advances');
  // determinism: a second page has the same instance seeds. #2220: read the source seeds (birds.seeds), not mesh.geometry.attributes.aSeed:
  // since the LOD split (#1924) that attribute is rewritten every frame (far/near batches in camera-distance order), so it differs per visit.
  const seeds = (p) => p.evaluate(() => { const s = window.__app.birds.seeds; return Array.from(s.a).concat(Array.from(s.b)).map((v) => v.toFixed(4)).join(); });
  const page2 = await open(browser, '&weather=clear');
  check((await seeds(page)) === (await seeds(page2)), 'same flock every visit (seeded)');
  await page2.close();
  // allocation: update() stays cheap on the heap. #2220: performance.memory is a coarse, GC-timing-dependent number (+13 MB / -1 MB between
  // identical runs, and a young-gen GC mid-run makes the delta meaningless), so use the sampling heap profiler, which counts every allocation
  // (also collected ones) with its allocating function. Per call this is NOT zero: V8 boxes doubles and the flocks' for-of loops allocate
  // iterators (a few KB per call, measured ~17 KB with 13 outdoor cats out). The regression that failed before #2220 was a terrain query per
  // cat per frame in birdThreats (groundY -> riverAt, ~105 KB per call). The bound sits between the two; a positive control proves the sampler works.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const sampled = async (fn) => {
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await page.evaluate(fn);
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    let all = 0; const walk = (n) => { all += n.selfSize; n.children.forEach(walk); }; walk(profile.head); return all;
  };
  const CALLS = 5000;
  await page.evaluate(() => { const b = window.__app.birds; for (let i = 0; i < 4000; i++) b.update(1 / 60, 0, false); }); // warm-up (perch setup, JIT)
  const control = await sampled(() => { for (let i = 0; i < 5000; i++) window.__sink = [i, i + 1, i + 2, i + 3, i + 4, i + 5, i + 6, i + 7]; });
  check(control > 1e5, 'heap sampler sees allocations (positive control)', `${control} bytes`);
  const alloc = await sampled(() => { const b = window.__app.birds; for (let i = 0; i < 5000; i++) b.update(1 / 60, 0, false); });
  check(alloc / CALLS < 40e3, 'update() allocation stays small per call', `${Math.round(alloc / CALLS)} bytes per call over ${CALLS} calls (limit 40000)`);
  await page.screenshot({ path: `${out}/ground.png`, timeout: 60000 }).catch(() => {});
  // night
  s = await state(page, { hour: 1 }); check(!s.visible, 'hidden at night', JSON.stringify(s));
  // far away
  await page.evaluate(() => { const a = window.__app; a.player.spawn(-30, 25, 0); });
  s = await state(page, { hour: 12 }); check(s.visible, 'back by day');
  await page.evaluate(() => { window.__app.birds.uniforms.uCenter.value.x += 2000; });
  s = await state(page, { hour: 12 }); check(!s.visible, 'hidden when far from the area', JSON.stringify(s));
  await page.evaluate(() => { window.__app.birds.uniforms.uCenter.value.x -= 2000; });
  await page.close();
  // rain
  page = await open(browser, '&weather=rain');
  s = await state(page, { hour: 12, steps: 400 }); check(s.rain > 0.3 && !s.visible, 'hidden in rain', JSON.stringify(s));
  // cloud whiteout: climb into the deck (cloudy weather)
  s = await state(page, { hour: 12, y: 170, steps: 60 }); check(!s.visible, 'hidden inside the cloud whiteout', JSON.stringify(s));
  s = await state(page, { hour: 12, y: 260, steps: 120 }); check(s.above > 0.9 && s.visible, 'visible above the clouds', JSON.stringify(s));
  const hi = await page.evaluate(() => window.__app.birds.uniforms.uHigh.value); check(hi === 1, 'high flock on above the deck');
  await page.screenshot({ path: `${out}/above.png`, timeout: 60000 }).catch(() => {});
  await page.close();
  // phone: fewer
  page = await open(browser, '&weather=clear&lowmem');
  const low = await page.evaluate(() => window.__app.birds.count);
  check(low < info.n, 'fewer birds on phones (&lowmem)', `${low} < ${info.n}`);
  await page.close();
  // nobirds
  page = await browser.newPage(); await page.goto(`${base}/index.html?shot&nobirds`); await page.waitForFunction(() => window.__app, null, { timeout: 420000 });
  check(await page.evaluate(() => window.__app.birds === null), '&nobirds turns them off');
  await browser.close();
  console.log(pass ? 'ALL PASSED' : 'SOME FAILED'); process.exit(pass ? 0 : 1);
})();
