// #2124: dawn / dusk sky before/after on the actual scene: 22 m above the park facing the setting sun (west-north-west, June 15
// 21:33, sun just above the horizon) and the rising sun (north-east, 04:36), each under a clear and a partly cloudy sky (overcast 0.45).
// node tools/skydusk2124browser.cjs [base] [out] [before|after]
// THREE_DIR = a local three@0.170.0 package (CDN routed to it). "before" serves BASE_REV's daycycle.js and aerialhaze.js.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8324', out = process.argv[3] || '/tmp/sky2124', phase = process.argv[4] || 'after';
const VIEWS = [{ name: 'sunset-clear', hour: 21.55, yaw: 106, oc: 0 }, { name: 'sunset-part', hour: 21.55, yaw: 106, oc: 0.45 },
  { name: 'dawn-clear', hour: 4.6, yaw: 12, oc: 0 }, { name: 'dawn-part', hour: 4.6, yaw: 12, oc: 0.45 },
  { name: 'dusk-away', hour: 21.9, yaw: -75, oc: 0 }, { name: 'noon', hour: 13, yaw: 106, oc: 0 }, { name: 'night', hour: 1, yaw: 106, oc: 0 }];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; // (tuning: a subset of the views)
(async () => {
  const browser = await kit.launch(), result = { phase, views: [], errors: [], shaderErrors: [] };
  const baseFiles = {};
  if (phase === 'before') for (const f of ['daycycle.js', 'aerialhaze.js']) {
    const p = path.join(out, 'base-' + f); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(p, execFileSync('git', ['show', `${process.env.BASE_REV || 'origin/main'}:src/${f}`])); baseFiles[f] = p;
  }
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    for (const f in baseFiles) await ctx.route(new RegExp(`/src/${f.replace('.', '\\.')}(\\?.*)?$`), (r) => r.fulfill({ path: baseFiles[f], contentType: 'text/javascript' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(t)) result.shaderErrors.push(t.slice(0, 400)); });
    await page.goto(`${base}/?shot&cloud=&at=-8,52,106,14,22&month=6&day=15&year=2026&time=13&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 600000, polling: 200 }); await kit.skipNameDialog(page);
    for (const v of VIEWS.filter((x) => !ONLY || ONLY.includes(x.name))) {
      await page.evaluate(({ hour, yaw, oc }) => { const A = __app;
        A.weather.state = () => ({ rain: 0, storm: false, overcast: oc, kind: null, id: null, temp: 18, source: 'forced' });
        A.camera.rotation.set(14 * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'); A.day.hour = hour; A.day.paused = true; for (let i = 0; i < 4; i++) A.step(0); }, v);
      const file = path.join(out, `${phase}-${v.name}.png`); fs.mkdirSync(out, { recursive: true }); await kit.shot(page, file);
      const info = await page.evaluate(() => { const A = __app, r = A.renderer.info, f = A.scene.fog; return { calls: r.render.calls, triangles: r.render.triangles, programs: r.programs.length,
        fog: f.color.getHexString(), sunY: +A.day.sunDir.y.toFixed(3), overcast: +A.day.overcast.toFixed(2), zenith: A.day.uniforms.uZenith.value.getHexString(),
        halo: A.day.uniforms.uHalo ? A.day.uniforms.uHalo.value.getHexString() : null }; });
      result.views.push({ when: v.name, file, ...info });
    }
    await ctx.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.shaderErrors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
