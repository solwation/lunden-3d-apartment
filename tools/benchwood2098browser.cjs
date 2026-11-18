// #2098: a courtyard park bench (close and a few metres off) and the bus stop's bench before/after, day, walk view.
// node tools/benchwood2098browser.cjs [base] [out]; THREE_DIR = a local three@0.170.0 package (CDN routed to it).
// "before" serves BASE_REV's touched modules (benchwood.js is then simply unused). Writes <out>/<view>-after.jpg,
// <out>/before/<view>-before.jpg and <out>/browser.json (draw calls, triangles, textures, programs, bench-batch sizes).
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8298', out = 'docs/verification/2098'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'origin/main', touched = ['config.js', 'courtyard.js', 'busstop.js'];
async function route(ctx, phase, log) {
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    const m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
    if (m) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
    if (!u.startsWith(base + '/')) { log.push(u); return r.abort(); }
    const f = new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
    if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`]) });
    return r.continue();
  });
}
// The views (camera x, z, yaw, pitch) from the scene itself, so both phases use the same ones: the first configured park
// bench (seen from in front, 1.7 m and 4.5 m) and the bus stop bench (its wood-coloured vertices, seen from the shelter's front).
const views = () => {
  const s = window.__app.scene, bus = s.getObjectByName('bus-stop-furniture'), p = bus.geometry.attributes.position, c = bus.geometry.attributes.color;
  let n = 0, bx = 0, bz = 0; const sx = [0, 0];
  for (let i = 0; i < p.count; i++) { if (Math.abs(c.getX(i) - c.getZ(i)) > 0.2) { n++; bx += p.getX(i); bz += p.getZ(i); } } // (the wood: red ≫ blue)
  bx /= n; bz /= n; const dx = 36.89 - bx, dz = 189.99 - bz, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
  const look = (cx, cz, tx, tz, pitch) => [cx, cz, Math.atan2(-(tx - cx), -(tz - cz)) * 180 / Math.PI, pitch];
  const b = { x: -37.3, z: 22.2, rot: -90 }, yaw = (b.rot + 180) * Math.PI / 180, fx = Math.sin(yaw), fz = Math.cos(yaw); // the bench's facing
  return { 'gard-bank-nara': look(b.x + fx * 1.5 + 0.5, b.z + fz * 1.5 + 0.6, b.x, b.z, -32), 'gard-bank': look(b.x + fx * 4 + 1.5, b.z + fz * 4 + 2, b.x, b.z, -14),
    'busskur-bank': look(bx + ux * 1.6 + 0.4 * uz, bz + uz * 1.6 - 0.4 * ux, bx, bz, -24), _busBench: [bx, bz, n] };
};
const batches = () => {
  const out = []; window.__app.scene.traverse((o) => { if (o.isMesh && (o.name === 'bus-stop-furniture' || o.material?.map && o.material.vertexColors && o.material.roughness === 0.8 && o.material.color?.getHex() === 0x8a6544)) {
    o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; out.push({ name: o.name || 'courtyard-wood', vertices: o.geometry.attributes.position.count, attrs: Object.keys(o.geometry.attributes).sort().join(), bytes: Object.values(o.geometry.attributes).reduce((t, a) => t + a.array.byteLength, 0), benchWood: !!o.material.userData.benchWood, railMetal: !!o.material.userData.railMetal, min: b.min.toArray().map((v) => +v.toFixed(3)), max: b.max.toArray().map((v) => +v.toFixed(3)) }); } });
  return out;
};
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), phases: {}, errors: [], external: [] };
  try {
    for (const phase of ['before', 'after']) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(phase + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) report.errors.push(phase + ': ' + m.text()); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&test&month=6&day=15&time=12&freeze&weather=clear&at=-36,23,90,0`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('bus-stop-furniture'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      const info = { loadMs: Date.now() - t0, batches: await page.evaluate(batches), views: {} }, V = await page.evaluate(views);
      info.busBench = V._busBench; delete V._busBench; report.phases[phase] = info;
      for (const [name, [x, z, yaw, pitch]] of Object.entries(V)) {
        await page.evaluate(([x, z, yaw, pitch]) => { const a = window.__app; a.player.spawn(x, z, yaw * Math.PI / 180); a.camera.rotation.x = pitch * Math.PI / 180; a.day.hour = 12; a.day.paused = true; }, [x, z, yaw, pitch]);
        await page.waitForTimeout(1500);
        await kit.shot(page, path.join(out, phase === 'before' ? 'before' : '', `${name}-${phase}.jpg`), { frames: 4 });
        info.views[name] = { at: [x, z, yaw, pitch].map((v) => +v.toFixed(2)), ...(await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, programs: r.info.programs.length }; })) };
      }
      await ctx.close();
    }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ errors: report.errors, external: report.external.slice(0, 5), views: Object.fromEntries(Object.entries(report.phases).map(([k, v]) => [k, v.views])) }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
