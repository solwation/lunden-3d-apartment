// #2133: the site trees' leaf cards up close in the real game — a river-park crown seen from under it at three azimuths
// (looking up into it from ~3–4 m) and the ordinary #2101 park view, BEFORE (BASE_REV's foliage.js / config.js) and AFTER.
// DIAG=1 adds diagnosis variants in the before phase: the atlas with anisotropy 16, and without mipmaps (to tell texture
// filtering from card geometry). Per view a picture, draw calls / triangles / programs; page and shader errors fail the run.
//   THREE_DIR=<three@0.170.0 package> BASE_REV=<sha> node tools/leafgraze2133browser.cjs http://127.0.0.1:8333 OUTDIR
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://127.0.0.1:8333', out = 'docs/verification/2133'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'origin/main', touched = ['foliage.js', 'config.js'];
const PHASES = (process.env.PHASES || 'before,after').split(','), DIAG = !!process.env.DIAG;
// [name, azimuth of the camera round the trunk (rad), distance from the trunk (m), pitch target height above the crown base (m)]
const UNDER = [['under-south', 0.3, 3.2, 4], ['under-west', 2.2, 3.6, 4], ['under-north', 4.1, 4.5, 2.5]];

(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await kit.launch(), result = { baseRev: BASE_REV, phases: {} };
  try {
    for (const phase of PHASES) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 }), errors = [], consoleErrors = [];
      await ctx.route('**/*', (r) => {
        const u = r.request().url(), m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
        if (m && three) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
        if (!u.startsWith(base + '/')) return r.abort();
        const f = new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
        if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`], { maxBuffer: 64e6 }) });
        return r.continue();
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&cloud=&at=0,110,180&month=6&day=2&time=13&freeze&weather=clear&wind=0&test=lazy`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000, polling: 500 }); await kit.skipNameDialog(page);
      await page.evaluate(async () => { const A = __app; A.day.month = 6; A.day.paused = true; (await import('/src/seasons.js')).applySeason(6); A.step(0); });
      const load = Date.now() - t0;
      // the #2101 park crown near the bridge specimens; its trunk foot from treeFeet
      const tree = await page.evaluate(async () => {
        const S = await import('/src/surroundings.js'); let best = null;
        for (const f of S.treeFeet) { const d = Math.hypot(f.x - 3.5, f.z - 118.6); if (!best || d < best.d) best = { d, x: f.x, y: f.y, z: f.z, kind: f.kind }; }
        return best;
      });
      const views = [['park', { from: [tree.x - 9, tree.z - 11], look: [tree.x, tree.y + 4, tree.z] }],
        ...UNDER.map(([n, a, d, h]) => [n, { from: [tree.x + Math.sin(a) * d, tree.z + Math.cos(a) * d], look: [tree.x - Math.sin(a) * 1.5, tree.y + 4 + h, tree.z - Math.cos(a) * 1.5] }])];
      const variants = phase === 'before' && DIAG ? ['', 'aniso16', 'nomip'] : [''];
      const shots = {};
      for (const variant of variants) {
        await page.evaluate(async (variant) => {
          const F = await import('/src/foliage.js'), t = F.leafAtlas(), THREE = await import('three');
          t.anisotropy = variant === 'aniso16' ? 16 : 2; t.minFilter = variant === 'nomip' ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
        }, variant);
        for (const [name, v] of views) {
          await page.evaluate(({ from, look }) => {
            const A = __app, yaw = Math.atan2(-(look[0] - from[0]), -(look[2] - from[1])), dist = Math.hypot(look[0] - from[0], look[2] - from[1]);
            A.player.spawn(from[0], from[1], yaw); A.camera.position.y = A.player.eyeY;
            A.camera.rotation.x = Math.atan2(look[1] - A.camera.position.y, dist); A.step(0);
          }, v);
          const file = path.join(out, phase === 'before' ? 'before' : '', `${name}${variant ? '-' + variant : ''}.png`);
          await kit.shot(page, file);
          const i = await page.evaluate(() => { const i = __app.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs.length, camera: __app.camera.position.toArray().map((x) => +x.toFixed(2)) }; });
          shots[`${name}${variant ? '-' + variant : ''}`] = { file, ...i };
        }
      }
      result.phases[phase] = { loadMs: load, tree, shots, errors, consoleErrors };
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(result, null, 1) + '\n');
  console.log(JSON.stringify(result, null, 1));
  if (Object.values(result.phases).some((r) => r.errors.length || r.consoleErrors.some((c) => /Shader Error|WebGLProgram/.test(c)))) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
