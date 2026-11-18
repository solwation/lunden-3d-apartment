// #2102: cloud shadows before/after on the actual scene, June 13:00, a partly cloudy sky (overcast 0.45, no rain) and clear sky:
// over the park and over the courtyard / roofs, each at two moments (cloud clock 0 and 40 s) to show the drift.
// node tools/cloudshadow2102browser.cjs [base] [out] [before|after]
// THREE_DIR = a local three@0.170.0 package (CDN routed to it). "before" serves BASE_REV's daycycle.js (cloudshadow.js never loads).
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8302', out = process.argv[3] || '/tmp/cloud2102', phase = process.argv[4] || 'after';
const PLACES = [{ name: 'park', at: '-8,52,110,-28,55' }, { name: 'yard', at: '20,70,0,-22,30' }];
const WHEN = [{ name: 'part-t0', oc: 0.45, t: 0 }, { name: 'part-t40', oc: 0.45, t: 40 }, { name: 'clear', oc: 0, t: 0 }];
(async () => {
  const browser = await kit.launch(), result = { phase, views: [], errors: [], shaderErrors: [] };
  let baseDay = null;
  if (phase === 'before') { baseDay = path.join(out, 'base-daycycle.js'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(baseDay, execFileSync('git', ['show', `${process.env.BASE_REV || 'origin/main'}:src/daycycle.js`])); }
  try {
    for (const pl of PLACES) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
      if (baseDay) await ctx.route(/\/src\/daycycle\.js(\?.*)?$/, (r) => r.fulfill({ path: baseDay, contentType: 'text/javascript' }));
      const page = await ctx.newPage();
      page.on('pageerror', (e) => result.errors.push(e.message));
      page.on('console', (m) => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(t)) result.shaderErrors.push(t.slice(0, 400)); });
      await page.goto(`${base}/?shot&cloud=&at=${pl.at}&month=6&day=15&year=2026&time=13&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 600000, polling: 200 }); await kit.skipNameDialog(page);
      for (const w of WHEN) {
        await page.evaluate(({ oc, t }) => { const A = __app; A.weather.state = () => ({ rain: 0, storm: false, overcast: oc, kind: null, id: null, temp: 18, source: 'forced' });
          A.day.hour = 13; A.day.paused = true; Object.defineProperty(A.day, 'cloudT', { get: () => t, set() {}, configurable: true }); // (a fixed cloud clock)
          for (let i = 0; i < 3; i++) A.step(0); }, w);
        const file = path.join(out, `${phase}-${pl.name}-${w.name}.png`); fs.mkdirSync(out, { recursive: true }); await kit.shot(page, file);
        const info = await page.evaluate(() => { const A = __app, r = A.renderer.info; A.testMode.setFull(true); A.step(0); const cs = A.day.cloudShadow, on = A.day.cloudShadows, q = A.quality.level; A.testMode.setFull(false); return { calls: r.render.calls, programs: r.programs.length, overcast: +A.day.overcast.toFixed(2),
          indoor: A.day.indoor, cloudShadows: on, quality: q, strength: cs ? +cs.strength.toFixed(3) : null }; });
        result.views.push({ place: pl.name, when: w.name, file, ...info });
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.shaderErrors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
