// #2151: what the room probe costs — shader programs after the warm-up and after the first capture, draw calls of the view,
// the capture's per-face time, with and without the probe (`&noprobe` = the old look) at &quality=0, &quality=3 and the
// phone profile (&lowmem). Headless SwiftShader: fps and ms are relative only.
//   tools/browsertest.sh node tools/roomprobe2151perf.cjs http://localhost:8223 docs/verification/2151/perf.json
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const base = process.argv[2] || 'http://localhost:8223', out = process.argv[3];
const ONLY = process.argv[4]?.split(','); // optional: a comma list of run names
const ALL = { 'q0-before': 'quality=0&noprobe', 'q0-after': 'quality=0', 'lowmem-before': 'lowmem&noprobe', 'lowmem-after': 'lowmem', 'q3-after': 'quality=3' };
const RUNS = Object.fromEntries(Object.entries(ALL).filter(([n]) => !ONLY || ONLY.includes(n)));
const result = out && ONLY && fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const [name, q] of Object.entries(RUNS)) {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/?shot&warm&perf&${q}&time=12&month=6&day=15&freeze&weather=clear&at=4.0,3.6,-60,-5`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.warm?.done && window.__app.roomProbe, null, { timeout: 900000, polling: 500 });
      const warmProgs = await page.evaluate(() => window.__app.renderer.info.programs.length);
      // the first capture (none at quality 0 / with &noprobe): wait for it, or 8 s
      await page.waitForFunction(() => { const p = window.__app.roomProbe; return p.mode === 'off' || p.mode === 'painted' || (p.stats.captures > 0 && p.face < 0); }, null, { timeout: 300000, polling: 250 });
      await page.waitForTimeout(8000);
      result[name] = await page.evaluate(() => {
        const a = window.__app, r = a.renderer, p = a.roomProbe;
        const progs = r.info.programs.length;
        r.render(a.scene, a.camera);
        const calls = r.info.render.calls, tris = r.info.render.triangles;
        const t0 = performance.now(); for (let i = 0; i < 5; i++) r.render(a.scene, a.camera); const viewMs = (performance.now() - t0) / 5;
        let faceMs = null;
        if (p.mode === 'live' && p.cams) { // one face again (as a capture does), timed: its draw calls and ms
          p.zone ??= { x: 4.4, y: 1.3, z: 3 }; const t = performance.now(); p.renderFace(0); faceMs = performance.now() - t;
        }
        const faceCalls = faceMs !== null ? r.info.render.calls : null;
        return { mode: p.mode, captures: p.stats.captures, mats: p.mats.size, maps: p.maps.size, programs: progs, calls, tris, viewMs: +viewMs.toFixed(1), faceMs: faceMs && +faceMs.toFixed(1), faceCalls,
          perf: document.getElementById('perf')?.textContent.split('\n')[0], gpuTextures: r.info.memory.textures };
      });
      result[name].programsAfterWarmUp = warmProgs;
      result[name].errors = errors;
      console.log(name, JSON.stringify(result[name]));
      if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2)); // (after every run: a time-out keeps what was measured)
      await page.close();
    }
  } finally {
    await browser.close();
    if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
  }
})().catch((e) => { console.error(e); process.exit(1); });
