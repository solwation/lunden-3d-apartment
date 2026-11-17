// #2017: avatar light in the real game: an avatar next to the camera in a room, the stairwell, open sun and shade, by day and by night,
// with the light factor off (before) and on (after), plus draw calls and the per-frame cost of the probe.
//   CHROME_PATH=… tools/browsertest.sh node tools/avatarlightbrowser.cjs http://localhost:8617 docs/verification/2017
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8617', out = 'docs/verification/2017'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], report = {};
  try {
    for (const [tag, hour] of [['dag', 13], ['natt', 23]]) {
      const page = await browser.newPage({ viewport: { width: 760, height: 520 } });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/index.html?shot&test&time=${hour}&month=6&day=15&freeze&weather=clear&quality=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__app?.player && window.__app.ghosts && document.getElementById('overlay')?.hidden !== false, null, { timeout: 150000, polling: 500 });
      await page.waitForTimeout(3000);
      const res = await page.evaluate(async ([tag]) => {
        const a = __app, { player, world, camera, ghosts, renderer, scene } = a;
        renderer.setAnimationLoop(null);
        const out = { shots: {} };
        // --- find the places
        const find = (pred, xs, zs, y) => { const hit = []; for (let x = xs[0]; x < xs[1]; x += 0.25) for (let z = zs[0]; z < zs[1]; z += 0.25) if (pred(x, z, y)) hit.push([x, z]); return hit; };
        const mean = (h) => [h.reduce((s, p) => s + p[0], 0) / h.length, h.reduce((s, p) => s + p[1], 0) / h.length];
        const room = find((x, z) => world.roomAt(0, x, z) === 'Vardagsrum', [0, world.size.x], [0, world.size.z], 0);
        const { storeyFloor } = await import('/src/config.js');
        const y1 = storeyFloor(1) + 0.05;
        const core = find((x, z, y) => world.core.contains(x, z, y) && Math.abs(player.groundAt(x, z, y) - (y - 0.05)) < 0.05, [-40, 20], [-10, 60], y1);
        out.counts = { room: room.length, core: core.length };
        const spots = {};
        const rc = room.length ? mean(room) : [3, 3];
        spots.rum = { x: rc[0], z: rc[1], y: player.groundAt(rc[0], rc[1], 0), yaw: 0 };
        if (core.length) { const c = mean(core); const near = core.reduce((b, p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(b[0] - c[0], b[1] - c[1]) ? p : b); const has = new Set(core.map((p) => p.join())); const T = core.find(([x, z]) => has.has([x, z + 2.25].join()) && has.has([x, z + 1.0].join()) && has.has([x, z - 1.0].join())) ?? near; spots.trapphus = { x: T[0], z: T[1] + 2.25, y: y1 - 0.05, yaw: 0 }; } spots.sol = { x: -28.85, z: 22.7, y: player.groundAt(-28.85, 22.7, 0), yaw: 0 };
        const shade = find((x, z) => { const g = player.groundAt(x, z, 0); return Number.isFinite(g) && g < 1 && !player.inFootprint(x, z) && (world.roofs?.above(x, z, g + 0.3) ?? Infinity) < g + 6; }, [-45, 5], [-5, 60], 0);
        out.counts.shade = shade.length;
        if (shade.length) { const hs = new Set(shade.map((p) => p.join())); const s = shade.find(([x, z]) => hs.has([x, z + 2.25].join()) && hs.has([x, z - 1].join())) ?? shade[0]; spots.skugga = { x: s[0], z: s[1] + 2.25, y: player.groundAt(s[0], s[1] + 2.25, 0), yaw: 0 }; }
        out.spots = spots;
        // --- the avatar
        ghosts.on = true; ghosts.capped = true; const g = ghosts.add('lt1', 'Spelare');
        const place = (s, yaw) => {
          player.pos.set(s.x, s.y, s.z); camera.position.set(s.x, s.y + 1.6, s.z); camera.rotation.set(-0.05, yaw, 0, 'YXZ');
          const gx = s.x - Math.sin(yaw) * 2.25, gz = s.z - Math.cos(yaw) * 2.25, gy = player.groundAt(gx, gz, s.y + 0.3);
          const t0 = performance.now(); for (const dt of [0, 100, 200]) g.push({ p: [gx, Number.isFinite(gy) ? gy : s.y, gz], r: yaw + Math.PI, look: [0, 0] }, t0 + dt);
          return [gx, gz];
        };
        const settle = (n = 90) => { for (let i = 0; i < n; i++) { a.step(1 / 60); ghosts.update(1 / 60); } };
        const calls = {};
        for (const [name, s] of Object.entries(spots)) {
          if (!Number.isFinite(s.y)) continue;
          const yaw = s.yaw;
          out.spots[name].ghost = place(s, yaw);
          for (const mode of ['before', 'after']) {
            if (mode === 'before') { const z = ghosts.light.zone; ghosts.light.zone = null; g.avatar.setLight(1); g.lightSt = {}; ghosts.light.__z = z; } else { ghosts.light.zone = ghosts.light.__z; g.lightSt = {}; }
            settle(); a.testMode.setFull(true); renderer.info.reset(); renderer.render(scene, camera);
            calls[`${name}-${mode}`] = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, factor: g.lightSt?.f ?? 1, zone: g.lightSt?.zone?.kind ?? null };
            out.shots[`${name}-${mode}`] = renderer.domElement.toDataURL('image/png');
            a.testMode.setFull(false);
          }
        }
        out.calls = calls;
        // --- cost: ghosts.update with and without the probe, 400 frames each, avatar in the room
        const s = spots.rum; place(s, 0); settle(30);
        const time = (n) => { const t = performance.now(); for (let i = 0; i < n; i++) ghosts.update(1 / 60); return (performance.now() - t) / n; };
        const z = ghosts.light.zone; time(100);
        out.msOn = time(600); ghosts.light.zone = null; out.msOff = time(600); ghosts.light.zone = z;
        // the probe alone (1000 zone lookups, the worst case: all different places)
        const t = performance.now(); for (let i = 0; i < 1000; i++) z(s.x + (i % 7) * 0.3, s.y, s.z + (i % 5) * 0.3); out.probeMs = (performance.now() - t) / 1000;
        out.zonesAt = { room: z(spots.rum.x, spots.rum.y, spots.rum.z), core: spots.trapphus && z(spots.trapphus.x, spots.trapphus.y, spots.trapphus.z), sol: z(spots.sol.x, spots.sol.y, spots.sol.z), skugga: spots.skugga && z(spots.skugga.x, spots.skugga.y, spots.skugga.z) };
        out.level = (await import('/src/avatarlight.js')).sceneLevel(ghosts.light.lights);
        return out;
      }, [tag]);
      for (const [k, v] of Object.entries(res.shots)) fs.writeFileSync(`${out}/${tag}-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
      delete res.shots; report[tag] = res; console.log(tag, JSON.stringify(res));
      await page.close();
    }
    fs.writeFileSync(`${out}/measurements.json`, JSON.stringify(report, null, 1));
    if (errors.length) { console.log('ERRORS', errors.slice(0, 5)); process.exitCode = 1; }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
