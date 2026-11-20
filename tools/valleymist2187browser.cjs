// #2187: valley mist before/after on the actual scene, a calm cool October morning at 06:50 (a date the seeded chance gives mist) over Höje å.
// node tools/valleymist2187browser.cjs [base] [out] [before|after]   ("before" = the same scene with the mist switched off: weather.mistOff)
// THREE_DIR = a local three@0.170.0 package (CDN routed to it).
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://localhost:8366', out = process.argv[3] || '/tmp/valleymist2187', phase = process.argv[4] || 'after';
const VIEWS = [{ name: 'river', at: process.env.AT1 || '125,112,90,-18,26' }, { name: 'park', at: process.env.AT2 || '62,92,180,-24,24' }].slice(0, +(process.env.NVIEWS || 2));
const WHEN0 = [{ name: 'morning', hour: 7.7, force: null, temp: 6 }, { name: 'clearday', hour: 13, force: 'clear', temp: 12 }];
const WHEN = process.env.ONLYMORNING ? WHEN0.slice(0, 1) : WHEN0;
(async () => {
  const browser = await kit.launch(), result = { phase, views: [], errors: [], shaderErrors: [] };
  try {
    for (const v of VIEWS) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
      const page = await ctx.newPage();
      page.on('pageerror', (e) => result.errors.push(e.message));
      page.on('console', (m) => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(t)) result.shaderErrors.push(t.slice(0, 400)); });
      await page.goto(`${base}/?shot&quality=3&cloud=&at=${v.at}&month=10&day=${process.env.DAY || 12}&year=2026&time=7.7&freeze&test=lazy`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 600000, polling: 200 }); await kit.skipNameDialog(page); await page.evaluate(() => __app.testMode.setFull(true));
      for (const w of WHEN) {
        await page.evaluate(({ hour, force, temp, phase, process_noveil }) => { const A = __app; A.weather.force = force; A.weather.real = { tick() {}, at: () => ({ rain: 0, kind: null, storm: false, overcast: force ? 0 : 0.1, temp, wind: force ? { x: 2, z: 1.5 } : { x: 0.3, z: 0.2 }, fog: 0 }) }; A.weather.mistOff = phase === 'before'; if (process_noveil) A.valleyVeils.update = () => false; A.day.hour = hour; A.day.paused = true; A.testMode.setFull(true); for (let i = 0; i < 200; i++) A.step(0.2); }, { ...w, phase, process_noveil: !!process.env.NOVEIL });
        const file = path.join(out, `${phase}-${v.name}-${w.name}.png`); fs.mkdirSync(out, { recursive: true }); await kit.shot(page, file);
        const probe = await page.evaluate(async () => { const A = __app; A.testMode.setFull(true); for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(() => r())); const o = { level: A.quality.level, cards: A.valleyVeils.cards.length, visible: !!A.valleyVeils.mesh?.visible, density: +A.valleyVeils.density.toFixed(2) }; A.testMode.setFull(false); return o; });
        const info = await page.evaluate(() => { const A = __app, r = A.renderer.info, f = A.scene.fog; return { calls: r.render.calls, triangles: r.render.triangles, programs: r.programs.length,
          fog: { near: +f.near.toFixed(1), far: +f.far.toFixed(1) }, mist: +(A.day.mist || 0).toFixed(2), veils: A.valleyVeils.mesh?.visible ? A.valleyVeils.cards.length : 0, vd: +A.valleyVeils.density.toFixed(2), eye: [A.camera.position.x|0, A.camera.position.y|0, A.camera.position.z|0], below: A.player.below, upd: A.valleyVeils.update(0, A.day.mist, A.scene.fog.color, A.camera.position, false), vis: A.valleyVeils.mesh?.visible, lvl: A.valleyVeils.level, ql: A.quality.level, sp: A.valleyVeils.spacing, nc: A.valleyVeils.cards.length, lm: A.valleyVeils.lowMemory, sunY: +A.day.sunDir.y.toFixed(2), near: A.valleyVeils.near, wind: A.weather.wind }; });
        result.views.push({ probe, place: v.name, when: w.name, file, ...info });
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.shaderErrors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
