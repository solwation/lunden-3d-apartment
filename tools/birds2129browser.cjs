// #2129: the actual birds before/after: the courtyard flock pecking on the ground, flushed by the eye walking up and landing again,
// the park flock on a perch, and landed gulls (roof, river bank). Frame sequence + draws/programs/errors. Run 'after' first: it
// writes views.json (camera poses from the real perches), which 'before' (the base revision served on another port) reuses.
//   python3 tools/devserve.py 8329 &   THREE_DIR=…/three/package node tools/birds2129browser.cjs http://localhost:8329 OUTDIR after|before
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8329', out = process.argv[3] || '/tmp/birds2129', phase = process.argv[4] || 'after';
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
    await page.goto(`${base}/?shot&time=11&month=6&day=2&weather=clear&freeze&cloud=`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.birds && window.__app.renderer, null, { timeout: 600000, polling: 500 });
    await kit.skipNameDialog(page).catch(() => {});
    const res = await page.evaluate(async (views) => {
      const a = __app, B = a.birds, T = await import('three'); a.showOverlay?.(false);
      a.day.hour = 11; a.day.paused = true; B.fade = 1;
      if (B.threats) B.threats = (o) => { o.length = 0; o.push(a.camera.position); return o; }; // only the eye flushes here (no roaming outdoor cat in the shots)
      for (let i = 0; i < 3; i++) B.update(1 / 30, 0, false); // the first shown frame reads the perches
      const frames = [], log = [], L = B.life;
      const zoom = (fov) => { a.camera.fov = fov; a.camera.updateProjectionMatrix(); };
      const look = (p, at) => { a.camera.position.set(p[0], p[1], p[2]); a.camera.lookAt(at[0], at[1], at[2]); a.camera.updateMatrixWorld(true); };
      const shot = (label) => { a.scene.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera); frames.push({ label, png: a.renderer.domElement.toDataURL('image/png') }); };
      const run = (secs) => { for (let t = 0; t < secs; t += 1 / 30) B.update(1 / 30, 0, false); };
      const v = views ?? {};
      if (!views) { // after: choose the views from the real perches
        const [court, park] = L.flocks, g = court.groups.find((q) => q.kind === 'ground' && q.surface === 'gravel') ?? court.groups.find((q) => q.kind === 'ground');
        v.ground = { x: g.x, y: g.y, z: g.z }; v.kinds = Object.fromEntries(['tree', 'roof', 'rail', 'ground'].map((k) => [k, court.groups.filter((q) => q.kind === k).length]));
        v.parkKinds = park ? Object.fromEntries(['tree', 'roof', 'rail', 'ground'].map((k) => [k, park.groups.filter((q) => q.kind === k).length])) : null;
        const pr = park?.groups.find((q) => q.kind === 'rail') ?? park?.groups.find((q) => q.kind === 'ground');
        v.park = pr ? { x: pr.x, y: pr.y, z: pr.z, kind: pr.kind } : null;
        const roost = L.roost, find = (kind) => { for (let i = 0; i < roost.count; i++) for (let t = 0; t < 4000; t += 2) { const c = roost.cycle(i, t); if (c && c.spot.kind === kind && t > c.land + 3 && t < c.up - 5) return { i, t, x: c.spot.x, y: c.spot.y, z: c.spot.z }; } return null; };
        v.gullRoof = find('roof'); v.gullBank = find('bank'); v.spots = { roof: L.spots.filter((s) => s.kind === 'roof').length, bank: L.spots.filter((s) => s.kind === 'bank').length };
      }
      // 1. the courtyard flock on the ground: camera 10 m off, eye height
      const gp = v.ground, cam = [gp.x - 5.6, gp.y + 1.2, gp.z + 7.4], at = [gp.x, gp.y + 0.1, gp.z]; zoom(24); // (zoomed: 9.3 m off: every bird outside the 7 m flush distance)
      if (L) { const f = L.flocks[0], g = f.groups.find((q) => Math.abs(q.x - gp.x) < 1e-6 && Math.abs(q.z - gp.z) < 1e-6); f.assign(g); for (const b of f.birds) { Object.assign(b, { x: b.spot.x, y: b.spot.y, z: b.spot.z, from: null, mode: 2 }); f.sitDown(b); } f.settle(); f.dwell = 1e6; }
      look(cam, at);
      for (let k = 0; k < 3; k++) { run(0.4); shot(`courtyard ground t=${(k * 0.4).toFixed(1)} s`); }
      if (L) log.push({ before: L.flocks[0].birds.map((b) => [b.mode, +b.pitch.toFixed(2), !!b.hop]) });
      // 2. the eye walks up to 3 m: the flock flushes
      const near = [gp.x - 1.8, gp.y + 1.6, gp.z + 2.4]; look(near, at); zoom(45);
      const fl0 = L?.flocks[0].flushes ?? 0;
      for (const [secs, label] of [[0.25, '0.25 s'], [0.5, '0.75 s'], [0.75, '1.5 s']]) {
        run(secs);
        const f = L?.flocks[0]; let c = at;
        if (f) { const fly = f.birds; c = [fly.reduce((s, b) => s + b.x, 0) / fly.length, fly.reduce((s, b) => s + b.y, 0) / fly.length, fly.reduce((s, b) => s + b.z, 0) / fly.length]; }
        look(near, views ? (v.flushLook?.[label] ?? at) : c); (v.flushLook ??= {})[label] = c; shot(`walked up, ${label}`);
      }
      run(20);
      if (L) { const f = L.flocks[0]; v.landed = { kind: f.group.kind, x: f.group.x, y: f.group.spots[0].y, z: f.group.z, flushes: f.flushes - fl0, state: f.state }; }
      if (L) { const f = L.flocks[0], c = [0, 1, 2].map((k) => f.birds.reduce((s, b) => s + [b.x, b.y, b.z][k], 0) / f.birds.length); v.landedAt = c; }
      const ld = v.landed, lc = v.landedAt; if (ld) { zoom(14); const hx = -24 - lc[0], hz = 30 - lc[2], hl = Math.hypot(hx, hz) || 1; look([lc[0] + hx / hl * 7, Math.max(lc[1] - 0.5, gp.y + 1.6), lc[2] + hz / hl * 7], lc); shot(`landed again (${ld.kind}) 20 s later`); }
      // 3. the park flock on its perch
      if (v.park) {
        const p = v.park;
        if (L?.flocks[1]) { const f = L.flocks[1], g = f.groups.find((q) => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.z - p.z) < 1e-6); f.assign(g); for (const b of f.birds) { Object.assign(b, { x: b.spot.x, y: b.spot.y, z: b.spot.z, from: null, mode: 2 }); f.sitDown(b); } f.settle(); f.dwell = 1e6; }
        zoom(30); a.camera.position.set(p.x + 5.6, p.y + 0.6, p.z + 4.2); run(0.5); look([p.x + 5.6, p.y + 0.6, p.z + 4.2], [p.x, p.y, p.z]); shot(`park flock on the ${p.kind}`); if (L?.flocks[1]) log.push({ park: L.flocks[1].birds.map((b) => [b.mode, +b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)]), visible: L.flocks[1].visible, inst: B.smallMesh.geometry.instanceCount });
      }
      // 4. landed gulls: roof and river bank
      for (const key of ['gullRoof', 'gullBank']) {
        const s = v[key]; if (!s) continue;
        B.time = s.t - 1 / 30; a.camera.position.set(s.x + 40, s.y + 30, s.z + 40); B.update(1 / 30, 0, false); // (far: no flush)
        zoom(20); const d = key === 'gullRoof' ? 11 : -9, cx = s.x + d, cz = s.z + d * 0.5, cy = Math.max(s.y + 4, (a.player.groundAt?.(cx, cz, 200) ?? -1e9) + 1.7); look([cx, cy, cz], [s.x, s.y + 0.3, s.z]); B.update(1 / 30, 0, false); shot(key === 'gullRoof' ? 'gull standing on a roof' : 'gull on the river bank');
        if (L) log.push({ [key]: { ...B.poses[s.i] } });
      }
      const r = a.renderer.info;
      return { views: v, log, frames, calls: r.render.calls, programs: r.programs?.length, textures: r.memory.textures,
        small: B.smallMesh ? { instances: B.smallMesh.geometry.instanceCount, tris: B.smallMesh.geometry.attributes.position.count / 3, sameMaterial: B.smallMesh.material === B.mesh.material } : null,
        perf: L ? (() => { const t0 = performance.now(); for (let i = 0; i < 300; i++) B.update(1 / 30, 0, false); return +((performance.now() - t0) / 300).toFixed(3); })() : null };
    }, views);
    res.frames.forEach((f, i) => fs.writeFileSync(path.join(out, `${phase}-${i}.png`), Buffer.from(f.png.split(',')[1], 'base64')));
    result.labels = res.frames.map((f) => f.label); delete res.frames;
    if (phase === 'after') fs.writeFileSync(path.join(out, 'views.json'), JSON.stringify(res.views));
    Object.assign(result, res);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
