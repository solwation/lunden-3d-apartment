// #2127: the actual paddock ponies before/after their secondary motion: a frame sequence (summer, a fresh breeze from the side) of a grazing
// pony and a standing one, plus bone/uniform motion numbers, draws and programs. Before = BEFORE_PADDOCK served as /src/paddock.js.
//   python3 tools/devserve.py 8327 &   then   node tools/ponymotion2127browser.cjs http://localhost:8327 OUTDIR before|after
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8327', out = process.argv[3] || '/tmp/ponymotion2127', phase = process.argv[4] || 'after';
(async () => {
  const browser = await kit.launch(), result = { phase, errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
    if (phase === 'before') await ctx.route(/\/src\/paddock\.js(\?.*)?$/, (r) => r.fulfill({ path: process.env.BEFORE_PADDOCK, contentType: 'text/javascript' }));
    await ctx.addInitScript(() => { let a; Object.defineProperty(window, '__app', { get: () => a, set: (v) => { a = v; v.renderer.setAnimationLoop(null); } }); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && /shader|program|WebGL/i.test(m.text())) result.errors.push(m.text()); });
    await page.goto(`${base}/?shot&time=13&month=7&weather=clear&freeze&cloud=&wind=0.75`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.paddock?.riggedPonies?.length === 2, null, { timeout: 600000, polling: 500 });
    await kit.skipNameDialog(page).catch(() => {});
    const frames = await page.evaluate(async () => {
      const a = __app, p = a.paddock, sw = await import('/src/sitewind.js'), S = await import('/src/seasons.js'); a.showOverlay?.(false);
      S.applySeason(7); sw.siteWind.dir.set(0.71, -0.71).normalize();
      const [g, s] = p.ponies, G = await import('/src/paddockgeo.js');
      const yaw = Math.PI / 4; // the downwind direction (0.71, -0.71) is the pony's left (+x local): the wind comes from its right side
      const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
      // a flat spot well inside the fence for both ponies and the camera (rear-left three-quarter view of the grazing pony)
      const ok = (x, z) => G.insideFence(x, z, 3.5);
      const cam = (w) => [w[0] - fx * 3.3 + lx * 2.4, w[1] - fz * 3.3 + lz * 2.4], other = (w) => [w[0] + fx * 1.0 - lx * 3.0, w[1] + fz * 1.0 - lz * 3.0];
      const mid = p.waypoints.find((w) => ok(...w) && ok(...cam(w)) && ok(...other(w)) && Math.abs(p.ground(...w) - p.ground(...cam(w))) < 0.4) ?? p.waypoints[0];
      const place = (q, x, z, st) => { q.x = x; q.z = z; q.y = p.ground(x, z); q.yaw = yaw; q.state = st; q.left = 1e9; q.target = q.goal = null; q.net = null; q.spot = null; q.neck = st === 'graze' ? 1.5 : 0.1; if (q.motion) { q.motion.flyT = 0.3; q.motion.driftT = 1e9; } };
      place(g, mid[0], mid[1], 'graze'); place(s, ...other(mid), 'idle');
      const [cx, cz] = cam(mid), gy = p.ground(cx, cz);
      const camAt = () => { a.camera.position.set(cx, gy + 1.45, cz); a.camera.lookAt((g.x + s.x) / 2, p.ground(g.x, g.z) + 0.75, (g.z + s.z) / 2); a.camera.updateMatrixWorld(true); };
      a.player.spawn?.(cx, cz, 0); camAt();
      for (let i = 0; i < 60; i++) { sw.siteWind.time += 1 / 30; p.update(1 / 30); } // settle into the poses
      const out = [], track = [], rp = p.riggedPonies;
      const q = (b) => b ? b.quaternion.toArray().map((v) => +v.toFixed(4)) : null;
      for (let f = 0; f < 8; f++) {
        for (let i = 0; i < 12; i++) { sw.siteWind.time += 1 / 30; p.update(1 / 30); camAt(); } // 0.4 s a frame
        a.scene.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera);
        out.push(a.renderer.domElement.toDataURL('image/png'));
        const get = (k, n) => rp[k].object.getObjectByName(n);
        track.push({ t: +(f * 0.4).toFixed(1), tailBase: [q(get(0, 'Joint_Tail_Base')), q(get(1, 'Joint_Tail_Base'))], tailTip: [q(get(0, 'Joint_Tail_Tip')), q(get(1, 'Joint_Tail_Tip'))],
          earL: [q(get(0, 'Joint_Ear_L')), q(get(1, 'Joint_Ear_L'))], head: q(get(0, 'Joint_Head')), roll: [+rp[0].object.rotation.z.toFixed(4), +rp[1].object.rotation.z.toFixed(4)],
          mane: rp[0].motionUniforms ? rp[0].motionUniforms.uPonyMane.value.toArray().map((v) => +v.toFixed(4)) : null, twitch: rp[0].motionUniforms ? rp[0].motionUniforms.uPonyTwitch.value.w : null,
          pos: [+g.x.toFixed(3), +g.z.toFixed(3)], states: [g.state, s.state], rugShared: p.blankets.instanceMatrix === p.mesh.instanceMatrix });
      }
      // a short graze-drift check: the grazing pony steps on, head down, inside the fence
      let drift = null;
      if (g.motion) { g.motion.driftT = 0; const x0 = g.x, z0 = g.z; let stepped = 0; for (let i = 0; i < 150; i++) { p.update(1 / 30); if (g.drift) stepped++; } drift = { moved: +Math.hypot(g.x - x0, g.z - z0).toFixed(3), framesStepping: stepped, neck: +g.neck.toFixed(2), state: g.state }; }
      a.renderer.render(a.scene, a.camera);
      const r = a.renderer.info;
      return { frames: out, track, drift, calls: r.render.calls, triangles: r.render.triangles, programs: r.programs?.length, textures: r.memory.textures, wind: { power: sw.siteWind.power, dir: sw.siteWind.dir.toArray() } };
    });
    fs.mkdirSync(out, { recursive: true });
    frames.frames.forEach((d, i) => fs.writeFileSync(path.join(out, `${phase}-${i}.png`), Buffer.from(d.split(',')[1], 'base64')));
    delete frames.frames; Object.assign(result, frames);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify({ ...result, track: result.track?.length }, null, 1));
  if (result.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
