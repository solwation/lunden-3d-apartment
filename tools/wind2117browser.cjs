// #2117: the weather's wind on its actual consumers in the real game — a windy hour and a calm hour from a hand-made Open-Meteo fixture
// (June 2024, served as /tools/fixtures/wind2117-2024-06.json through &weatherapi=, never the live service) and a future day (the
// seeded draw) — before/after. Per condition: the park trees at two wind-clock times (power and direction from the weather; the
// `siteWind.hold` clock only, no `&wind=` power), a motion image (the per-pixel difference of the two frames, amplified) and the
// state: weather.wind, the sway's power/direction, the rain slant, the cloud drift velocity, draw calls/triangles and errors.
//   THREE_DIR=… BASE_REV=<rev> node tools/wind2117browser.cjs http://localhost:8317 OUTDIR
// "before" serves BASE_REV's versions of the touched modules (it has no windsim.js and ignores the fixture's wind).
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8317', out = '/tmp/wind2117'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'origin/main', touched = ['config.js', 'realweather.js', 'weather.js', 'sitewind.js', 'cloudshadow.js', 'daycycle.js'];
const PHASES = (process.env.PHASES || 'before,after').split(',');

/** June 2024, hand-made in Open-Meteo's response shape: a south-west–west gale with light rain on the 12th (12 m/s from 250° at noon),
 * a calm clear easterly on the 5th (0.8 m/s from 90°), a moderate breeze from 230° otherwise. Not real data. */
function fixture() {
  const h = { time: [], temperature_2m: [], precipitation: [], rain: [], snowfall: [], weather_code: [], wind_speed_10m: [], wind_direction_10m: [] };
  for (let d = 1; d <= 30; d++) for (let hr = 0; hr < 24; hr++) {
    const windy = d === 12, calm = d === 5, wet = windy && hr >= 9 && hr <= 16;
    h.time.push(`2024-06-${String(d).padStart(2, '0')}T${String(hr).padStart(2, '0')}:00`);
    h.temperature_2m.push(+(15 + 5 * Math.sin(((hr - 9) / 24) * 2 * Math.PI)).toFixed(1));
    h.precipitation.push(wet ? 0.6 : 0); h.rain.push(wet ? 0.6 : 0); h.snowfall.push(0); h.weather_code.push(wet ? 61 : calm ? 0 : 2);
    h.wind_speed_10m.push(windy ? +(4 + 8 * Math.sin(Math.PI * Math.min(1, Math.max(0, (hr - 4) / 16)))).toFixed(1) : calm ? 0.8 : 4);
    h.wind_direction_10m.push(windy ? 250 : calm ? 90 : 230);
  }
  return JSON.stringify({ _note: 'Hand-made fixture (#2117), not real data', latitude: 55.7, longitude: 13.2, hourly_units: { wind_speed_10m: 'm/s', wind_direction_10m: '°' }, hourly: h });
}
const ONLY = process.env.CONDITIONS?.split(','); // e.g. CONDITIONS=windy: only that one
const CONDITIONS = [
  { name: 'windy', y: 2024, m: 6, d: 12, h: 12 }, // real (fixture): 12 m/s from 250°, light rain
  { name: 'calm', y: 2024, m: 6, d: 5, h: 12 }, // real (fixture): 0.8 m/s from 90°
  { name: 'future', y: 2027, m: 6, d: 10, h: 12 }, // no data: the seeded draw
];

async function route(ctx, phase, log) {
  const fx = fixture();
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    const m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
    if (m && three) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
    if (!u.startsWith(base + '/')) { log.push(u.slice(0, 120)); return r.abort(); }
    const p = new URL(u).pathname;
    if (p === '/tools/fixtures/wind2117-2024-06.json') return r.fulfill({ contentType: 'application/json', body: fx });
    const f = p.match(/^\/src\/([a-z0-9]+\.js)$/);
    if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`]) });
    return r.continue();
  });
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), phases: {}, errors: [], external: [] };
  try {
    for (const phase of PHASES) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(), t0 = Date.now();
      page.on('pageerror', (e) => report.errors.push(phase + ': ' + e.message));
      page.on('console', (m) => { if (/Shader Error|WebGLProgram|VALIDATE_STATUS/.test(m.text()) || (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text()))) report.errors.push(phase + ': ' + m.text().slice(0, 300)); });
      await page.goto(`${base}/?shot&cloud=&at=0,110,180&year=2024&month=6&day=12&time=12&freeze&test=lazy&weatherapi=/tools/fixtures/wind2117-2024-06.json`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 1500000, polling: 500 }); await kit.skipNameDialog(page);
      await page.waitForFunction(() => { const A = __app; A.step(1 / 30); return A.weather.real?.months.has('2024-06'); }, null, { timeout: 120000, polling: 500 });
      // the view: a river-park crown near the bridge (as #2101's harness), seen from 14 m
      const view = await page.evaluate(() => {
        const A = __app, m = new A.camera.matrix.constructor(), p = A.camera.position.clone(); let best = null;
        A.scene.traverse((o) => { if (!/^tree-crowns \d/.test(o.name) || !o.count) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); p.setFromMatrixPosition(m); const d = Math.hypot(p.x - 3.5, p.z - 118.6); if (!best || d < best.d) best = { d, x: p.x, y: p.y, z: p.z }; } });
        return { target: [best.x, best.y - 1, best.z], from: [best.x - 9, best.z - 11] };
      });
      const res = report.phases[phase] = { loadSeconds: Math.round((Date.now() - t0) / 1000), view, conditions: {} };
      for (const c of CONDITIONS.filter((x) => !ONLY || ONLY.includes(x.name))) {
        const shots = {};
        for (const [label, t] of [['a', 0.8], ['b', 2.3]]) {
          const info = await page.evaluate(async ({ c, v, t }) => {
            const A = __app, S = await import('/src/sitewind.js'), THREE = await import('three');
            Object.assign(A.day, { year: c.y, month: c.m, date: c.d, hour: c.h, paused: true });
            A.weather.src = undefined; // (the date jumps: no fade between the conditions)
            A.player.spawn(v.from[0], v.from[1], 0); A.camera.position.y = A.player.eyeY;
            const look = new THREE.Vector3(...v.target), dist = Math.hypot(look.x - v.from[0], look.z - v.from[1]);
            A.player.spawn(v.from[0], v.from[1], Math.atan2(-(look.x - v.from[0]), -(look.z - v.from[1]))); A.camera.position.y = A.player.eyeY;
            A.camera.rotation.x = Math.atan2(look.y - A.camera.position.y, dist);
            S.siteWind.force = null; S.siteWind.hold = true; S.siteWind.time = t; // the clock only: power and direction from the weather
            for (let i = 0; i < 3; i++) A.step(0);
            const w = A.weather, i = A.renderer.info, cs = await import('/src/cloudshadow.js').catch(() => ({}));
            const r = (x) => (x == null ? null : +x.toFixed(3));
            return { weatherWind: w.wind ? { x: r(w.wind.x), z: r(w.wind.z), speed: r(Math.hypot(w.wind.x, w.wind.z)) } : null, rain: r(w.rain), kind: w.kind, source: w.src,
              power: r(S.siteWind.power), dir: [r(S.siteWind.dir.x), r(S.siteWind.dir.y)], slant: w.slant ? [r(w.slant.x), r(w.slant.z)] : null,
              cloudVelocity: cs.cloudVelocity ? Object.values(cs.cloudVelocity(A.day.wind)).map(r) : null, cloudStrength: r(A.day.cloudShadow?.strength), calls: i.render.calls, triangles: i.render.triangles };
          }, { c, v: view, t });
          const file = path.join(out, `${phase}-${c.name}-${label}.png`);
          await kit.shot(page, file);
          shots[label] = { file, ...info };
        }
        // the motion between the two wind-clock frames: mean |Δ|, changed share, and an amplified difference image
        const load = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
        const mo = await page.evaluate(async ([a, b]) => {
          const img = async (src) => { const i = new Image(); i.src = src; await i.decode(); const c = new OffscreenCanvas(i.width, i.height), g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height); };
          const A = await img(a), B = await img(b), D = new ImageData(A.width, A.height); let s = 0, changed = 0;
          for (let i = 0; i < A.data.length; i += 4) {
            const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]); s += d; if (d > 24) changed++;
            const g = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 * 0.35, k = Math.min(255, d * 3);
            D.data[i] = Math.min(255, g + k); D.data[i + 1] = Math.min(255, g + k * 0.35); D.data[i + 2] = g; D.data[i + 3] = 255;
          }
          const c = new OffscreenCanvas(A.width, A.height); c.getContext('2d').putImageData(D, 0, 0);
          const blob = await c.convertToBlob({ type: 'image/png' }), buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode(...buf.subarray(i, i + 32768));
          return { meanAbs: +(s / (A.data.length / 4) / 3).toFixed(3), changedPct: +(100 * changed / (A.data.length / 4)).toFixed(2), png: btoa(bin) };
        }, [load(shots.a.file), load(shots.b.file)]);
        const motionFile = path.join(out, `${phase}-${c.name}-motion.png`); fs.writeFileSync(motionFile, Buffer.from(mo.png, 'base64'));
        res.conditions[c.name] = { ...c, shots, motion: { meanAbs: mo.meanAbs, changedPct: mo.changedPct, file: motionFile } };
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1)); console.log(JSON.stringify(report, null, 1));
  if (report.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
