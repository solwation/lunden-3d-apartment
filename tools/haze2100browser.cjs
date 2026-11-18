// #2100: aerial perspective before/after on the actual scene: over the park (22 m up) and along the street north of the house (eye height), each at
// day (13:00), sunset (21:12, facing the sun) and in rain, June. node tools/haze2100browser.cjs [base] [out] [before|after]
// THREE_DIR = a local three@0.170.0 package (CDN routed to it). "before" serves BASE_REV's daycycle.js/divelook.js (no haze import).
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8300', out = process.argv[3] || '/tmp/haze2100', phase = process.argv[4] || 'after';
const PLACES = [{ name: 'park', at: '-8,52,110,-3,22' }, { name: 'street', at: '0,-21,95,-1' }];
const WHEN = [{ name: 'day', hour: 13, force: 'clear' }, { name: 'sunset', hour: 21.2, force: 'clear' }, { name: 'rain', hour: 13, force: 'rain' }];
(async () => {
  const browser = await kit.launch(), result = { phase, views: [], errors: [], shaderErrors: [] };
  const baseFiles = {};
  if (phase === 'before') for (const f of ['daycycle.js', 'divelook.js']) {
    const p = path.join(out, 'base-' + f); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(p, execFileSync('git', ['show', `${process.env.BASE_REV || 'origin/main'}:src/${f}`])); baseFiles[f] = p;
  }
  try {
    for (const pl of PLACES) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
      for (const f in baseFiles) await ctx.route(new RegExp(`/src/${f.replace('.', '\\.')}(\\?.*)?$`), (r) => r.fulfill({ path: baseFiles[f], contentType: 'text/javascript' }));
      const page = await ctx.newPage();
      page.on('pageerror', (e) => result.errors.push(e.message));
      page.on('console', (m) => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(t)) result.shaderErrors.push(t.slice(0, 400)); });
      await page.goto(`${base}/?shot&cloud=&at=${pl.at}&month=6&day=15&year=2026&time=13&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 600000, polling: 200 }); await kit.skipNameDialog(page);
      for (const w of WHEN) {
        await page.evaluate(({ hour, force }) => { const A = __app; A.weather.force = force; A.day.hour = hour; A.day.paused = true; for (let i = 0; i < 4; i++) A.step(0); }, w);
        const file = path.join(out, `${phase}-${pl.name}-${w.name}.png`); fs.mkdirSync(out, { recursive: true }); await kit.shot(page, file);
        const info = await page.evaluate(() => { const A = __app, r = A.renderer.info, f = A.scene.fog; return { calls: r.render.calls, triangles: r.render.triangles, programs: r.programs.length,
          fog: { near: f.near, far: f.far, color: f.color.getHexString() }, overcast: +A.day.overcast.toFixed(2) }; });
        result.views.push({ place: pl.name, when: w.name, file, ...info });
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.shaderErrors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
