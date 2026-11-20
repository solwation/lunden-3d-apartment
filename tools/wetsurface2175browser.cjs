// #2175: rain wets facades, roofs, cars and benches, in the real app. Phases: `before` (BASE_REV's versions of the touched modules; no
// wetsurface.js import) and `after`, each dry / raining / after rain (the seeded shower of 2026-09-25 07:47–09:32 seen at 10:30, clear sky),
// five views: Hus L street façade, its roof edge, the car park, a courtyard bench, Å-hus A. Per view draw calls / triangles / programs.
// `phone`: &lowmem, rain only, before and after (program count). node tools/wetsurface2175browser.cjs BASE OUT before|after|phone-before|phone-after
// (THREE_DIR = a local three@0.170.0 package: the CDN is routed to it.) Run through tools/browsertest.sh.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8250', out = 'docs/verification/2175', phase = 'after'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'a1e55c59', touched = ['config.js', 'exterior.js', 'surroundings.js', 'courtyard.js', 'busstop.js', 'carfinish.js'];
const VIEWS = { // [x, z, yaw°, pitch°, feet?]
  fasad: [-6, -12, 180, -8, 3], tak: [3, 5, 0, -22, 12.75], bilar: [-36, -6.5, -40.5, -13.8], bank: [-30, 26, 90, -33, 8], husA: [2, 23, 200, -20, 3], bil2: [-36, -6.5, 22, -10],
};
const phone = phase.startsWith('phone'), before = phase.endsWith('before');
const WEATHERS = (phone ? [['rain', '&weather=rain']] : [['dry', '&weather=clear'], ['rain', '&weather=rain'], ['afterrain', '']]).filter(([w]) => !process.env.WEATHER || process.env.WEATHER.split(',').includes(w));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), report = { phase, base: BASE_REV, shots: [], errors: [] };
  const only = process.env.ONLY?.split(',');
  try {
    for (const [w, param] of WEATHERS) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await ctx.route('**/*', (r) => {
        const u = r.request().url(), m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
        if (m && three) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
        const f = u.startsWith(base + '/') && new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
        if (before && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`], { maxBuffer: 1 << 26 }) });
        return r.continue();
      });
      const page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(w + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && /shader|program|WebGL|GLSL/i.test(m.text())) report.errors.push(w + ': ' + m.text().slice(0, 400)); });
      await page.goto(`${base}/?shot&cloud=&at=3,-14,180,0&year=2026&month=9&day=25&time=10.5&freeze${param}&nobirds&test=lazy${phone ? '&lowmem' : ''}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('south-roof'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      for (const [name, [x, z, yaw, pitch, feet]] of Object.entries(VIEWS)) {
        if (only && !only.includes(name)) continue;
        await page.evaluate(([x, z, yaw, pitch, feet]) => { const a = window.__app; a.player.spawn(x, z, yaw * Math.PI / 180); if (feet != null) { a.player.pos.y = feet; a.player.eyeY = feet + 1.62; a.camera.position.y = feet + 1.62; } a.camera.rotation.x = pitch * Math.PI / 180; a.day.paused = true; a.step?.(0); }, [x, z, yaw, pitch, feet]);
        await page.waitForTimeout(1500);
        const file = path.join(out, `${phone ? phase : phase}-${w}-${name}.png`);
        if (!phone) await kit.shot(page, file, { frames: 4 });
        const info = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera);
          return { calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs.length, rain: window.__app.weather.rain, level: window.__app.quality.level }; });
        report.shots.push({ weather: w, view: name, file: phone ? null : file, ...info });
      }
      let u = null; try { u = await page.evaluate(async () => (await import('/src/wetground.js')).wetUniforms.uGroundWet.value.toArray()); } catch {}
      report.shots.push({ weather: w, uGroundWet: u });
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, `browser-${phase}${process.env.WEATHER ? '-' + process.env.WEATHER : ''}.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1)); if (report.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
