// #2101: the site wind sway on its actual consumers (park trees, river reeds, courtyard shrubs) in one page: per view a still
// frame (power 0 = the old geometry exactly), calm-breeze and windy frames at two wind times; pixel motion between the two
// times per power, draw/triangle counts, the compiled sway programs and shader errors.
// tools/browsertest.sh node tools/sitewind2101browser.cjs http://localhost:8301 OUTDIR   (THREE_DIR = local three@0.170.0 package)
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8301', out = process.argv[3] || '/tmp/sitewind2101';
const ONLY = process.env.VIEWS?.split(',');
(async () => {
  const browser = await kit.launch(), result = { views: [], errors: [], console: [] };
  try {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram/.test(m.text())) result.console.push(m.text().slice(0, 400)); });
    await page.goto(`${base}/?shot&cloud=&at=0,110,180&month=6&day=2&time=13&freeze&weather=clear&test=lazy`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000, polling: 500 }); await kit.skipNameDialog(page);
    await page.evaluate(async () => { const A = __app; A.day.month = 6; A.day.paused = true; (await import('/src/seasons.js')).applySeason(6); A.step(0); });
    // the views, from the actual geometry: a river-park tree crown, a reed tuft, a courtyard shrub
    const views = (await page.evaluate(async () => {
      const R = await import('/src/riverpark.js'), A = __app, v = [];
      const crowns = []; A.scene.traverse((o) => { if (/^tree-crowns \d/.test(o.name) && o.count) crowns.push(o); });
      const m = new A.camera.matrix.constructor(), p = A.camera.position.clone();
      // a park crown near the bridge specimens (the #1531 bridge view), seen from 14 m south-west, a little below
      let best = null; for (const c of crowns) for (let i = 0; i < c.count; i++) { c.getMatrixAt(i, m); p.setFromMatrixPosition(m); const d = Math.hypot(p.x - 3.5, p.z - 118.6); if (!best || d < best.d) best = { d, x: p.x, y: p.y, z: p.z }; }
      if (best) v.push({ name: 'park-trees', target: [best.x, best.y - 1, best.z], from: [best.x - 9, best.z - 11] });
      const reed = R.parkReedFeet[Math.floor(R.parkReedFeet.length / 3)];
      if (reed) v.push({ name: 'river-reeds', target: [reed.x, reed.y + 0.6, reed.z], from: [reed.x - 3.5, reed.z - 3.5] });
      const sh = A.scene.getObjectByName('courtyard-shrubs');
      if (sh?.count) { sh.getMatrixAt(Math.floor(sh.count / 2), m); p.setFromMatrixPosition(m); v.push({ name: 'courtyard-shrubs', target: [p.x, p.y, p.z], from: [p.x - 2.5, p.z + 3] }); }
      return v;
    })).filter((v) => !ONLY || ONLY.includes(v.name));
    fs.mkdirSync(out, { recursive: true });
    for (const v of views) {
      const shots = {};
      for (const [label, power, t] of [['still', 0, 0.8], ['still-b', 0, 2.3], ['calm-a', 'calm', 0.8], ['calm-b', 'calm', 2.3], ['windy-a', 1, 0.8], ['windy-b', 1, 2.3]]) {
        const info = await page.evaluate(async ({ v, power, t }) => {
          const A = __app, S = await import('/src/sitewind.js'), THREE = await import('three');
          A.player.spawn(v.from[0], v.from[1], 0); A.camera.position.y = A.player.eyeY;
          const look = new THREE.Vector3(...v.target);
          const yaw = Math.atan2(-(look.x - v.from[0]), -(look.z - v.from[1])), dist = Math.hypot(look.x - v.from[0], look.z - v.from[1]);
          A.player.spawn(v.from[0], v.from[1], yaw); A.camera.position.y = A.player.eyeY;
          A.camera.rotation.x = Math.atan2(look.y - A.camera.position.y, dist);
          const pw = power === 'calm' ? S.siteWindPower({}) : power;
          S.siteWind.force = pw; S.siteWind.hold = true; S.siteWind.time = t; // the game's own SiteWind.update applies them each frame
          A.step(0);
          return { power: pw, t };
        }, { v, power, t });
        const file = path.join(out, `${v.name}-${label}.png`);
        await kit.shot(page, file);
        const r = await page.evaluate(async () => { const S = await import('/src/sitewind.js'); const i = __app.renderer.info; return { power: S.siteWindUniforms.uSiteWindPower.value, t: S.siteWindUniforms.uSiteWindTime.value, calls: i.render.calls, triangles: i.render.triangles, programs: i.programs.length }; });
        shots[label] = { file, ...r };
      }
      result.views.push({ ...v, shots });
    }
    // pixel motion: mean |difference| between the two times, per power, and still vs windy, measured in the page
    for (const v of result.views) {
      const load = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
      const pairs = { noise: ['still', 'still-b'], calm: ['calm-a', 'calm-b'], windy: ['windy-a', 'windy-b'], stillVsWindy: ['still', 'windy-a'], stillVsCalm: ['still', 'calm-a'] };
      v.motion = {};
      for (const [k, [a, b]] of Object.entries(pairs)) v.motion[k] = await page.evaluate(async ([a, b]) => {
        const img = async (src) => { const i = new Image(); i.src = src; await i.decode(); const c = new OffscreenCanvas(i.width, i.height), g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
        const A = await img(a), B = await img(b); let s = 0, changed = 0;
        for (let i = 0; i < A.length; i += 4) { const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); s += d; if (d > 24) changed++; }
        return { meanAbs: +(s / (A.length / 4) / 3).toFixed(3), changedPct: +(100 * changed / (A.length / 4)).toFixed(2) };
      }, [load(v.shots[a].file), load(v.shots[b].file)]);
    }
    result.programs = await page.evaluate(() => __app.renderer.info.programs.map((p) => p.cacheKey).filter((k) => /site-wind/.test(k)).map((k) => k.slice(k.indexOf('foliage') >= 0 ? k.indexOf('foliage') : Math.max(0, k.indexOf('site-wind') - 40))).map((k) => k.slice(0, 120)));
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || result.console.some((c) => /Shader Error|WebGLProgram/.test(c))) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
