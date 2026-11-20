// #2196: the corvids in the real app, in winter daylight: jackdaws on a roof, a crow and a magpie on the courtyard lawn (the flocks are PINNED to
// those perches so the views are reproducible: the real seeded behaviour is the same code, only the starting group is forced). `after` writes
// views.json; `before` (the same URL with &nocorvids) reuses it. Also reports draws/programs and a walk sequence.
//   python3 -m http.server 8470 &   THREE_DIR=…/three PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/corvids2196browser.cjs http://localhost:8470 OUT after|before
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8470', out = process.argv[3] || '/tmp/corvids2196', phase = process.argv[4] || 'after';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const views = phase === 'before' ? JSON.parse(fs.readFileSync(path.join(out, 'views.json'), 'utf8')) : null;
  const browser = await kit.launch(), result = { phase, errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    await ctx.addInitScript(() => { let a; Object.defineProperty(window, '__app', { get: () => a, set: (v) => { a = v; v.renderer.setAnimationLoop(null); } }); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && /shader|program|WebGL/i.test(m.text())) result.errors.push(m.text()); });
    await page.goto(`${base}/?shot&time=11&month=1&day=14&weather=clear&snow=1&freeze&cloud=${phase === 'before' ? '&nocorvids' : ''}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.birds && window.__app.renderer, null, { timeout: 600000, polling: 500 });
    await kit.skipNameDialog(page).catch(() => {});
    const res = await page.evaluate(async (views) => {
      const a = __app, B = a.birds; a.showOverlay?.(false);
      a.day.hour = 11; a.day.paused = true; B.fade = 1;
      B.threats = (o) => { o.length = 0; return o; }; // (forced: nothing flushes the shot flocks)
      const SC = await import('/src/snowcover.js'); SC.snowUniform.value = 1; Object.assign(SC.snowState, { cover: 1, lies: true, driven: true, source: 'forced' }); // (the loop that drives the cover is stopped here: pin the snow)
      for (let i = 0; i < 3; i++) B.update(1 / 30, 0, false);
      const frames = [], L = B.life, v = views ?? {};
      const zoom = (fov) => { a.camera.fov = fov; a.camera.updateProjectionMatrix(); };
      const look = (p, at) => { a.camera.position.set(p[0], p[1], p[2]); a.camera.lookAt(at[0], at[1], at[2]); a.camera.updateMatrixWorld(true); };
      const shot = (label) => { a.scene.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera); frames.push({ label, png: a.renderer.domElement.toDataURL('image/png') }); };
      const run = (secs) => { for (let t = 0; t < secs; t += 1 / 30) B.update(1 / 30, 0, false); };
      const pin = (f, g, dx = 0, dz = 0) => { f.assign(g); for (const b of f.birds) { Object.assign(b, { x: b.spot.x + dx, y: b.spot.y, z: b.spot.z + dz, from: null, mode: 2 }); f.sitDown(b); } f.settle(); f.dwell = 1e6; };
      const C = L.corvids ?? [];
      if (!views) {
        const court = C.filter((f) => f.home.name === 'gården'), grounds = court[0].groups.filter((q) => q.kind === 'ground'), roofs = court[0].groups.filter((q) => q.kind === 'roof');
        const lawn = grounds.find((q) => q.surface === 'grass') ?? grounds[0], roof = roofs[0];
        v.lawn = { x: lawn.x, y: lawn.y, z: lawn.z, surface: lawn.surface }; v.roof = roof ? { x: roof.x, y: roof.y, z: roof.z, n: roof.spots.length } : null;
        v.kinds = court.map((f) => [f.kind, f.birds.length]); v.groups = court[0].groups.map((q) => q.kind);
      }
      const court = C.filter((f) => f.home.name === 'gården'), by = (k) => court.find((f) => f.kind === k);
      if (C.length) { const lawn = by('crow').groups.find((q) => Math.abs(q.x - v.lawn.x) < 1e-6 && Math.abs(q.z - v.lawn.z) < 1e-6); pin(by('crow'), lawn); pin(by('magpie'), lawn, 1.6, 0.9);
        if (v.roof) { const roof = by('jackdaw').groups.find((q) => Math.abs(q.x - v.roof.x) < 1e-6 && Math.abs(q.z - v.roof.z) < 1e-6); pin(by('jackdaw'), roof); } }
      // a camera spot on a ring round `at`, `lo`..`hi` m away at eye height, with an unobstructed line to the target (a Raycaster against the scene)
      const T = await import('three'), rc = Object.assign(new T.Raycaster(), { camera: a.camera }), vis = (p, at) => { const d = new T.Vector3(at[0] - p[0], at[1] - p[1], at[2] - p[2]), len = d.length(); rc.set(new T.Vector3(...p), d.normalize()); rc.far = len; return !rc.intersectObjects(a.scene.children, true).some((h) => h.distance < len - 0.4 && h.object.visible && !h.object.name?.startsWith('corvids') && h.object.isMesh); };
      const spot = (at, lo, hi, tag) => { if (v[tag]) return v[tag]; for (let r = lo; r <= hi; r += 1) for (let k = 0; k < 24; k++) { const th = k / 24 * 6.2832, x = at[0] + Math.cos(th) * r, z = at[2] + Math.sin(th) * r, gy = a.player.groundAt?.(x, z, 200) ?? at[1], p = [x, gy + 1.6, z]; if (gy > -50 && vis(p, at)) return (v[tag] = p); } return (v[tag] = [at[0] - lo, at[1] + 1.6, at[2] + lo]); };
      const centre = (fs) => { const bs = fs.flatMap((f) => f.birds); return [0, 1, 2].map((k) => bs.reduce((s, b) => s + [b.x, b.y, b.z][k], 0) / bs.length); };
      // 1. the lawn: a crow strides, a magpie hops, 3 frames ~1 s apart
      run(0.3); const lc = v.lawnAt ??= (() => { const c = centre([by('crow'), by('magpie')]); c[1] += 0.15; return c; })(); zoom(34);
      const lcam = spot(lc, 3.5, 9, 'lawnCam'); look(lcam, lc);
      for (let k = 0; k < 3; k++) { run(k ? 1.2 : 0); shot(`lawn t+${k}`); }
      // 2. the roof: jackdaws on the eave
      if (v.roof) { run(0.3); const rc2 = v.roofAt ??= centre([by('jackdaw')]); zoom(24); const rcam = spot(rc2, 9, 22, 'roofCam'); look(rcam, rc2); shot('roof'); }
      // draws/programs of the same view with the corvid meshes on and off (render twice each: the first render compiles)
      const draw = () => { a.renderer.info.reset(); a.scene.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera); return { calls: a.renderer.info.render.calls, tris: a.renderer.info.render.triangles, programs: a.renderer.info.programs.length }; };
      const measure = {};
      if (B.corvidMeshes.length) { for (let k = 0; k < 2; k++) measure.on = draw(); const vis = B.corvidMeshes.map((m) => m.visible); B.corvidMeshes.forEach((m) => { m.visible = false; }); for (let k = 0; k < 2; k++) measure.off = draw(); B.corvidMeshes.forEach((m, i) => { m.visible = vis[i]; }); measure.visibleMeshes = vis.filter(Boolean).length; }
      const r = a.renderer.info;
      return { views: v, frames, measure, calls: r.render.calls, programs: r.programs?.length, tris: r.render.triangles,
        corvidMeshes: B.corvidMeshes.map((m) => [m.name, m.geometry.instanceCount, m.geometry.attributes.position.count / 3, m.material === B.corvidMaterial]),
        flocks: C.map((f) => [f.kind, f.home.name, f.birds.length, f.group.kind]),
        perf: C.length ? (() => { const t0 = performance.now(); for (let i = 0; i < 300; i++) B.update(1 / 30, 0, false); return +((performance.now() - t0) / 300).toFixed(3); })() : null };
    }, views);
    res.frames.forEach((f, i) => fs.writeFileSync(path.join(out, `${phase}-${i}.png`), Buffer.from(f.png.split(',')[1], 'base64')));
    result.labels = res.frames.map((f) => f.label); delete res.frames;
    if (phase === 'after') fs.writeFileSync(path.join(out, 'views.json'), JSON.stringify(res.views));
    Object.assign(result, res);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
