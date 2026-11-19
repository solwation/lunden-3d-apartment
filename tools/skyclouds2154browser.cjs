// #2154: procedural sky clouds before/after on the actual scene: looking up over the park, clear / code 2 (0.2) / code 3 (0.55) / overcast,
// a 2-frame drift sequence (30 s of wind apart), dusk; render cost at quality 0 and full.
// node tools/skyclouds2154browser.cjs [base] [out] [before|after]   (THREE_DIR = local three@0.170.0; "before" serves BASE_REV's daycycle.js)
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8226', out = process.argv[3] || '/tmp/sky2154', phase = process.argv[4] || 'after';
const ALL = [{ name: 'clear', hour: 13, oc: 0 }, { name: 'part', hour: 13, oc: 0.2 }, { name: 'cloudy', hour: 13, oc: 0.55 }, { name: 'overcast', hour: 13, oc: 1 },
  { name: 'part-t30', hour: 13, oc: 0.2, drift: 30 }, { name: 'dusk-part', hour: 21.55, oc: 0.3 }];
const VIEWS = process.env.ONLY ? ALL.filter((v) => process.env.ONLY.split(',').includes(v.name)) : ALL;
(async () => {
  const browser = await kit.launch(), result = { phase, views: [], errors: [], shaderErrors: [] };
  let baseFile = null;
  if (phase === 'before') { baseFile = path.join(out, 'base-daycycle.js'); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(baseFile, execFileSync('git', ['show', `${process.env.BASE_REV || '9f55bc1a'}:src/daycycle.js`])); }
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    if (baseFile) await ctx.route(/\/src\/daycycle\.js(\?.*)?$/, (r) => r.fulfill({ path: baseFile, contentType: 'text/javascript' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(t)) result.shaderErrors.push(t.slice(0, 400)); });
    await page.goto(`${base}/?shot&cloud=&at=-8,52,106,14,22&month=6&day=15&year=2026&time=13&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 600000, polling: 200 }); await kit.skipNameDialog(page);
    for (const v of VIEWS) {
      await page.evaluate(({ hour, oc, drift }) => { const A = __app;
        A.weather.state = () => ({ rain: 0, storm: false, overcast: oc, kind: null, id: null, temp: 18, source: 'forced' });
        A.day.wind = { x: 8, z: -3 }; if (!drift) { A.day.cloudPos = { x: 0, z: 0, dx: 0, dz: 0 }; }
        A.camera.rotation.set(35 * Math.PI / 180, 106 * Math.PI / 180, 0, 'YXZ'); A.day.hour = hour; A.day.paused = true;
        for (let i = 0; i < 3; i++) A.step(0); if (drift) for (let i = 0; i < 3; i++) A.day.update(drift / 3); A.step(0); }, v);
      const file = path.join(out, `${phase}-${v.name}.png`); fs.mkdirSync(out, { recursive: true }); await kit.shot(page, file);
      const info = await page.evaluate((cost) => { const A = __app, r = A.renderer.info; const o = { calls: r.render.calls, triangles: r.render.triangles, programs: r.programs.length, offset: A.day.cloudPos && [+A.day.cloudPos.x.toFixed(1), +A.day.cloudPos.z.toFixed(1)], skyClouds: A.day.skyClouds };
        if (cost) { const ms = () => { const t = performance.now(); for (let i = 0; i < 3; i++) A.renderer.render(A.scene, A.camera); A.renderer.getContext().finish(); return +((performance.now() - t) / 3).toFixed(1); };
          o.msQ0 = ms(); A.testMode.setFull(true); A.step(0); o.msFull = ms(); o.qFull = A.quality.level; o.skyCloudsFull = A.day.skyClouds; A.testMode.setFull(false); } return o; }, !!process.env.COST);
      result.views.push({ when: v.name, file, ...info });
    }
    await ctx.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.shaderErrors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
