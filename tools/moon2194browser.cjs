// #2194: the moon's phase on the actual sky, before/after: night views looking at the moon on dates of new / crescent / half / gibbous / full moon
// (the clock is moved to the first night hour with the moon 18-50 deg up). "before" serves BASE_REV's daycycle.js (always a full moon).
// node tools/moon2194browser.cjs [base] [out] [before|after]   (THREE_DIR = local three@0.170.0)
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8446', out = process.argv[3] || '/tmp/moon2194', phase = process.argv[4] || 'after';
const ALL = [{ name: 'crescent', y: 2026, m: 11, d: 14 }, { name: 'half', y: 2026, m: 11, d: 17 }, { name: 'gibbous', y: 2026, m: 11, d: 21 }, { name: 'full', y: 2026, m: 11, d: 24 }, { name: 'new', y: 2026, m: 11, d: 9 }];
const VIEWS = process.env.ONLY ? ALL.filter((v) => process.env.ONLY.split(',').includes(v.name)) : ALL;
(async () => {
  const browser = await kit.launch(), result = { phase, views: [], errors: [], shaderErrors: [] };
  const routes = [];
  if (phase === 'before') { fs.mkdirSync(out, { recursive: true });
    for (const f of ['daycycle.js']) { const p = path.join(out, 'base-' + f); fs.writeFileSync(p, execFileSync('git', ['show', `${process.env.BASE_REV || 'origin/main'}:src/${f}`])); routes.push([new RegExp(`/src/${f.replace('.', '\\.')}(\\?.*)?$`), p]); } }
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    for (const [re, p] of routes) await ctx.route(re, (r) => r.fulfill({ path: p, contentType: 'text/javascript' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(t)) result.shaderErrors.push(t.slice(0, 400)); });
    await page.goto(`${base}/?shot&cloud=&at=-8,52,106,14,22&month=11&day=12&year=2026&time=19&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 600000, polling: 200 }); await kit.skipNameDialog(page);
    for (const v of VIEWS) {
      const info = await page.evaluate(({ y, m, d }) => { const A = __app, D = A.day; Object.assign(D, { year: y, month: m, date: d, paused: true });
        A.weather.state = () => ({ rain: 0, storm: false, overcast: 0, kind: null, id: null, temp: 5, source: 'forced' });
        let pick = null; for (let h = 16; h < 30 && !pick; h += 0.25) { D.hour = h % 24; if (h >= 24) { D.hour = h - 24; } D.update(0); if (D.sunDir.y < -0.15 && D.moonDir.y > 0.3 && D.moonDir.y < 0.78) pick = D.hour; }
        if (pick === null) { for (let h = 16; h < 24 && pick === null; h += 0.25) { D.hour = h; D.update(0); if (D.sunDir.y < -0.1 && D.moonDir.y > 0.1) pick = h; } }
        D.hour = pick ?? 20; D.update(0);
        const dir = D.moonDir, yaw = Math.atan2(-dir.x, -dir.z), pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        A.camera.rotation.set(Math.max(pitch, -0.2), yaw, 0, 'YXZ'); A.camera.fov = 22; A.camera.updateProjectionMatrix();
        for (let i = 0; i < 3; i++) A.step(0); const r = A.renderer.info;
        return { hour: +D.hour.toFixed(2), moonAlt: +(Math.asin(dir.y) * 180 / Math.PI).toFixed(1), illum: D.moon ? +D.moon.illum.toFixed(3) : 1, light: +D.lights.sun.intensity.toFixed(3), calls: r.render.calls, triangles: r.render.triangles, programs: r.programs.length }; }, v);
      const file = path.join(out, `${phase}-${v.name}.png`); fs.mkdirSync(out, { recursive: true }); await kit.shot(page, file);
      result.views.push({ when: v.name, file, ...info });
    }
    await ctx.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.shaderErrors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
