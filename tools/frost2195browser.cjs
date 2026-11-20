// #2195: hoar frost and snow on parked cars, in the real app. Phases `before` (BASE_REV's versions of the touched modules: no frost, no car snow)
// and `after`; scenarios frost (a cold clear morning) and snow (snow lying, `&snow=`). Views: the car park, a lawn + roofs, a bench in the courtyard.
// node tools/frost2195browser.cjs BASE OUT before|after   (THREE_DIR = a local three@0.170.0 package: the CDN is routed to it.) Run through tools/browsertest.sh.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8462', out = 'docs/verification/2195', phase = 'after'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || '30002987', touched = ['config.js', 'main.js', 'seasons.js', 'snowground.js', 'exterior.js', 'surroundings.js', 'courtyard.js', 'busstop.js', 'carfinish.js', 'grass.js'];
const before = phase === 'before';
const VIEWS = { // [x, z, yaw°, pitch°, feet?]
  bank: [-30, 26, 90, -33, 8], bilar: [-36, -6.5, -40.5, -13.8], bil2: [-36, -6.5, 22, -10], tak: [3, 5, 0, -22, 12.75], gard: [-30, 26, 90, -20, 3], husA: [2, 23, 200, -20, 3],
};
const SCEN = { frost: '&month=11&day=21&time=8&weather=clear&temp=-4', melt: '&month=11&day=21&time=8.6&weather=clear&temp=-4', snow: '&month=1&day=14&time=12&weather=clear&temp=-3&snow=0.9' };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), report = { phase, base: BASE_REV, shots: [], errors: [] };
  const only = process.env.ONLY?.split(','), scen = process.env.SCEN?.split(',') ?? Object.keys(SCEN);
  const viewsFor = (sc) => (sc === 'melt' ? ['bilar', 'bank'] : null); // (the half-melted morning: two views are enough)
  try {
    for (const s of scen) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await ctx.route('**/*', (r) => {
        const u = r.request().url(), m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
        if (m && three) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
        const f = u.startsWith(base + '/') && new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
        if (before && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`], { maxBuffer: 1 << 26 }) });
        return r.continue();
      });
      const page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(s + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && /shader|program|WebGL|GLSL/i.test(m.text())) report.errors.push(s + ': ' + m.text().slice(0, 400)); });
      await page.goto(`${base}/?shot&cloud=&at=3,-14,180,0&year=2026${SCEN[s]}&freeze&nobirds&test=lazy${process.env.EXTRA || ''}`, { waitUntil: 'commit' });
      try { await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('south-roof'), null, { timeout: Number(process.env.LOAD_MS) || 1500000, polling: 1000 }); }
      catch (e) { report.errors.push(s + ': load timeout'); console.log(JSON.stringify(report.errors)); throw e; }
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      for (const [name, [x, z, yaw, pitch, feet]] of Object.entries(VIEWS)) {
        if (only && !only.includes(name)) continue;
        if (viewsFor(s) && !viewsFor(s).includes(name)) continue;
        await page.evaluate(([x, z, yaw, pitch, feet]) => { const a = window.__app; a.player.spawn(x, z, yaw * Math.PI / 180); if (feet != null) { a.player.pos.y = feet; a.player.eyeY = feet + 1.62; a.camera.position.y = feet + 1.62; } a.camera.rotation.x = pitch * Math.PI / 180; a.day.paused = true; a.step?.(0); }, [x, z, yaw, pitch, feet]);
        await page.waitForTimeout(1500);
        const file = path.join(out, `${phase}-${s}-${name}.png`);
        await kit.shot(page, file, { frames: 4 });
        const info = await page.evaluate(() => { const a = window.__app, r = a.renderer; r.info.reset(); r.render(a.scene, a.camera);
          return { calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs.length, temp: a.weather.temp, overcast: a.weather.overcast, wind: a.weather.wind, frost: a.frostCover?.shown ?? null, snow: a.snowState.cover, sunY: a.day.sunDir.y }; });
        report.shots.push({ scen: s, view: name, file, ...info });
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, `browser-${phase}.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1)); if (report.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
