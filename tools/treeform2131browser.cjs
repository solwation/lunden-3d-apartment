// #2131: species tree forms on the actual site (the game's own scene): river-park and courtyard trees, summer and winter, near
// and far, BEFORE (the baseline's foliage.js / surroundings.js / config.js served in place of the branch's) and AFTER in one run.
// Per view a picture plus draw calls / triangles of the frame, and the scene's tree instances and triangles (near and far LOD);
// page and shader errors fail the run.
// BASELINE=<sha> THREE_DIR=<three@0.170.0 package> node tools/treeform2131browser.cjs http://127.0.0.1:8331 OUTDIR
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8331', out = process.argv[3] || 'docs/verification/2131';
const baseline = process.env.BASELINE || '5498de36', phases = (process.env.PHASES || 'before,after').split(',');
const VIEW = { width: 960, height: 600 };
// [name, target foot (x, z) to look for the nearest tree, camera offset (dx, dz) from it, month (1–12), camera lift (m, a far look over the canopy)]
const VIEWS = [
  ['park-near', [-20, 192], [-11, -13], 7], ['park-near-winter', [-20, 192], [-11, -13], 1],
  ['bridge', [-3, 117.6], [-9, -11], 7], ['bridge-winter', [-3, 117.6], [-9, -11], 1],
  ['park-far', [-20, 192], [-60, -80], 7, 30], ['park-far-winter', [-20, 192], [-60, -80], 1, 30],
  ['courtyard', [-18.5, 53.4], [1.9, -12], 7], ['courtyard-winter', [-18.5, 53.4], [1.9, -12], 1],
];
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await kit.launch(), result = { baseline, phases: {} };
  try {
    for (const phase of phases) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 }), errors = [], consoleErrors = [];
      if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
      if (phase === 'before') for (const f of ['src/foliage.js', 'src/surroundings.js', 'src/config.js']) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 64e6 });
        await ctx.route((u) => u.pathname === '/' + f, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&cloud=&at=-20,170,180&month=7&day=2&time=13&freeze&weather=clear&wind=0&test=lazy`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000, polling: 500 }); await kit.skipNameDialog(page);
      const load = Date.now() - t0, views = {};
      for (const [name, target, off, month, lift = 0] of VIEWS) {
        const info = await page.evaluate(async ({ target, off, month, lift }) => {
          const A = __app, S = await import('/src/surroundings.js'), Se = await import('/src/seasons.js');
          A.day.month = month; A.day.paused = true; Se.applySeason(month);
          let best = null; for (const f of S.treeFeet) { const d = Math.hypot(f.x - target[0], f.z - target[1]); if (!best || d < best.d) best = { d, ...f }; }
          const fx = best.x + off[0], fz = best.z + off[1], look = [best.x, best.y + 5, best.z], dist = Math.hypot(off[0], off[1]);
          A.player.spawn(fx, fz, Math.atan2(-(look[0] - fx), -(look[2] - fz))); A.camera.position.y = A.player.eyeY + lift;
          A.camera.rotation.x = Math.atan2(look[1] - A.camera.position.y, dist);
          A.step(0);
          return { tree: { x: best.x, z: best.z, kind: best.kind }, camera: A.camera.position.toArray().map((v) => +v.toFixed(2)) };
        }, { target, off, month, lift });
        const file = path.join(out, phase === 'before' ? 'before' : '', `${name}.png`);
        await kit.shot(page, file, { viewport: VIEW });
        const stats = await page.evaluate(() => {
          const A = __app, i = A.renderer.info, trees = {};
          A.scene.traverse((o) => {
            const m = /^tree-(crowns|trunks|birches)( far)?/.exec(o.name); if (!m || !o.isInstancedMesh) return;
            const k = m[1] + (m[2] ? '-far' : ''), tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
            const e = trees[k] ??= { meshes: 0, instances: 0, drawn: 0, trianglesPerInstance: tris, drawnTriangles: 0 };
            e.meshes++; e.instances += o.instanceMatrix.count; e.drawn += o.visible ? o.count : 0; e.drawnTriangles += o.visible ? o.count * tris : 0;
          });
          return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs.length, trees };
        });
        views[name] = { ...info, ...stats, file };
      }
      result.phases[phase] = { loadMs: load, views, errors, consoleErrors };
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(result, null, 1) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result.phases).map(([p, r]) => [p, { loadMs: r.loadMs, errors: r.errors, shaderErrors: r.consoleErrors.filter((c) => /Shader|WebGLProgram/.test(c)),
    views: Object.fromEntries(Object.entries(r.views).map(([n, v]) => [n, { calls: v.calls, triangles: v.triangles, tree: v.tree, trees: v.trees }])) }])), null, 1));
  if (Object.values(result.phases).some((r) => r.errors.length || r.consoleErrors.some((c) => /Shader Error|WebGLProgram/.test(c)))) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
