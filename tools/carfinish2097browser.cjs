// #2097: the parked cars' paint/trim finish in the real app, before/after, day and night: a car seen from ~7 m, the street
// car park's row from its east end (10–55 m) and the row from ~40 m. node tools/carfinish2097browser.cjs [base] [out];
// THREE_DIR = a local three@0.170.0 package (CDN routed to it). "before" serves BASE_REV's versions of the touched modules
// (they import no carfinish.js). Per view: draw calls/triangles/programs/textures; per phase: shader errors and invalid programs.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8297', out = 'docs/verification/2097'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'origin/main', touched = ['config.js', 'eastlot.js', 'neighborglass.js', 'streetlife.js', 'viewlod.js', 'world.js'];
// [x, z, look-at x, look-at z, pitch°]
const VIEWS = { 'bil-nara': [-36, -6.5, -40.5, -13.8, -8], 'raden': [-6, -8.5, -60, -14, -3], 'parkering-40m': [-30, -50, -40, -14, -5] };
async function route(ctx, phase, log) {
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    const m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
    if (m && three) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
    if (!u.startsWith(base + '/')) { log.push(u); return r.abort(); }
    const f = new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
    if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`]) });
    return r.continue();
  });
}
const invalid = () => {
  const a = window.__app, r = a.renderer, bad = [];
  a.scene.traverse((o) => { for (const m of [].concat(o.material ?? [])) { const p = r.properties.get(m).currentProgram; if (p?.diagnostics && !p.diagnostics.runnable) bad.push(`${o.name || o.parent?.name}:${m.type}`); } });
  return [...new Set(bad)];
};
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), phases: {}, external: [] };
  try {
    for (const phase of (process.env.PHASES || 'before,after').split(',')) {
      const t0 = Date.now(), ph = report.phases[phase] = { errors: [], views: {} };
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => ph.errors.push(e.message.slice(0, 300)));
      page.on('console', (m) => { const t = m.text(); if (m.type() !== 'error' || /favicon|net::ERR|Failed to load resource/.test(t)) return; ph.errors.push(t.slice(0, 600)); });
      await page.goto(`${base}/?test&shot&month=6&day=15&time=13&freeze&weather=clear&at=-36,-6.5,0,0`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene, null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(3000); await kit.skipNameDialog(page);
      ph.loadMs = Date.now() - t0;
      ph.cars = await page.evaluate(() => { const r = []; window.__app.scene.traverse((o) => { if (o.isInstancedMesh && (o.userData.carBatch || o.userData.carLod)) { const m = o.material; r.push({ set: o.userData.carBatch || 'far', count: o.count, rough: +m.roughness.toFixed(2), metal: +m.metalness.toFixed(2), env: !!m.envMap, envI: +(m.envMapIntensity ?? 0).toFixed(2), rmap: !!m.roughnessMap }); } }); return r; });
      for (const [when, hour] of [['dag', 13], ['natt', 22.5]]) {
        for (const [name, [x, z, tx, tz, pitch]] of Object.entries(VIEWS)) {
          await page.evaluate(([x, z, tx, tz, pitch, hour]) => { const a = window.__app; a.player.spawn(x, z, Math.atan2(-(tx - x), -(tz - z))); a.camera.rotation.x = pitch * Math.PI / 180; a.day.hour = hour; a.day.paused = true; }, [x, z, tx, tz, pitch, hour]);
          await page.waitForTimeout(1500);
          await kit.shot(page, path.join(out, phase === 'before' ? 'before' : '', `${name}-${when}-${phase}.png`), { frames: 4 });
          ph.views[`${name}-${when}`] = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs.length, textures: r.info.memory.textures, eye: window.__app.camera.position.toArray().map((v) => +v.toFixed(1)) }; });
        }
      }
      ph.invalid = await page.evaluate(invalid);
      ph.ms = Date.now() - t0;
      await ctx.close();
    }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report.phases, (k, v) => (k === 'errors' ? v.map((e) => e.slice(0, 200)) : v), 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
