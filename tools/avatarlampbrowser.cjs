// #2039: avatars under the street lamps at night, in the real game: an avatar right under a lit street lamp, halfway between two
// lamps, in a room at night and under the same lamp by day, with the avatar's mean luminance / warmth (R/B) and the light state, plus
// the number of shadow-casting lights. Run once before and once after the change (same views, different output dirs).
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarlampbrowser.cjs http://localhost:8239 docs/verification/2039
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8239', out = 'docs/verification/2039'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], report = {};
  try {
    for (const [tag, hour] of [['natt', 21], ['dag', 13]]) {
      const page = await browser.newPage({ viewport: { width: 760, height: 520 } });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/index.html?shot&test&time=${hour}&month=11&day=17&freeze&weather=clear&quality=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__app?.player && window.__app.ghosts && document.getElementById('overlay')?.hidden !== false, null, { timeout: 150000, polling: 500 });
      await page.waitForTimeout(4000); // (the lamps fade in over 1.5 s)
      const res = await page.evaluate(async ([tag]) => {
        const a = __app, { player, world, camera, ghosts, renderer, scene } = a, THREE = { Matrix4: camera.matrix.constructor, Vector3: camera.position.constructor };
        renderer.setAnimationLoop(null);
        const out = { shots: {} };
        let casters = 0; scene.traverse((o) => { if (o.isLight && o.castShadow) casters++; }); out.shadowCasters = casters;
        // the street lamps' heads (from the instanced mesh: the same in both versions)
        const heads = scene.getObjectByName('streetLampHeads'), m = new THREE.Matrix4(), hs = [];
        for (let i = 0; i < heads.count; i++) { heads.getMatrixAt(i, m); hs.push(new THREE.Vector3(0, 6.47, 1.3).applyMatrix4(m)); }
        // a lamp on our pavement of Sankt Lars väg (the first row: consecutive instances 24 m apart) and the next one
        let i0 = 0, best = Infinity;
        for (let i = 0; i + 1 < hs.length; i++) { const d = Math.hypot(hs[i].x + 12, hs[i].z + 24); if (d < best && hs[i].distanceTo(hs[i + 1]) < 30) { best = d; i0 = i; } }
        const A = hs[i0], B = hs[i0 + 1], dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
        const yaw = Math.atan2(ux, uz); // the camera looks along -(sin yaw, cos yaw): back towards A from beyond
        const at = (x, z) => ({ x, z, y: player.groundAt(x, z, 2) });
        const spots = {};
        // camera 2.25 m from the avatar along the row, the avatar facing it
        const view = (p) => { const s = at(p.x + Math.sin(yaw) * 2.25, p.z + Math.cos(yaw) * 2.25); s.yaw = yaw; s.avatar = [p.x, p.z]; return s; };
        spots.lampa = view({ x: A.x, z: A.z });
        if (tag === 'natt') {
          spots.mellan = view({ x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 });
          const room = []; for (let x = 0; x < world.size.x; x += 0.25) for (let z = 0; z < world.size.z; z += 0.25) if (world.roomAt(0, x, z) === 'Vardagsrum') room.push([x, z]);
          const rc = room.length ? [room.reduce((s, p) => s + p[0], 0) / room.length, room.reduce((s, p) => s + p[1], 0) / room.length] : [3, 3];
          spots.rum = { x: rc[0], z: rc[1], y: player.groundAt(rc[0], rc[1], 0), yaw: 0 };
        }
        out.lamps = { count: hs.length, A: [A.x, A.y, A.z], B: [B.x, B.y, B.z], dist: len };
        ghosts.on = true; ghosts.capped = true; const g = ghosts.add('lt1', 'Spelare');
        const place = (s) => {
          player.pos.set(s.x, s.y, s.z); camera.position.set(s.x, s.y + 1.6, s.z); camera.rotation.set(-0.05, s.yaw, 0, 'YXZ');
          const [gx, gz] = s.avatar ?? [s.x - Math.sin(s.yaw) * 2.25, s.z - Math.cos(s.yaw) * 2.25], gy = player.groundAt(gx, gz, s.y + 0.3);
          g.lightSt = {}; // (a fresh light state: snaps to the new place instead of easing from the last view)
          g.snaps.length = 0; const t0 = performance.now() - 3000; for (const dt of [0, 100, 200]) g.push({ p: [gx, Number.isFinite(gy) ? gy : s.y, gz], r: s.yaw + Math.PI, look: [0, 0] }, t0 + dt);
        };
        const settle = (n = 90) => { for (let i = 0; i < n; i++) { a.step(1 / 60); ghosts.update(1 / 60); } };
        const pix = (c) => { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.drawImage(c, 0, 0); return x.getImageData(0, 0, t.width, t.height).data; };
        out.views = {};
        for (const [name, s] of Object.entries(spots)) {
          if (!Number.isFinite(s.y)) { out.views[name] = { skipped: true }; continue; }
          place(s); g.tag && (g.tag.visible = false);
          settle(); a.testMode.setFull(true);
          g.root.visible = true; renderer.render(scene, camera);
          renderer.info.reset(); renderer.render(scene, camera);
          const W = pix(renderer.domElement), calls = renderer.info.render.calls;
          out.shots[name] = renderer.domElement.toDataURL('image/png');
          g.root.visible = false; renderer.render(scene, camera); const Bg = pix(renderer.domElement); g.root.visible = true;
          a.testMode.setFull(false);
          let n = 0, r = 0, gg = 0, b = 0;
          for (let i = 0; i < W.length; i += 4) if (Math.abs(W[i] - Bg[i]) + Math.abs(W[i + 1] - Bg[i + 1]) + Math.abs(W[i + 2] - Bg[i + 2]) > 24) { n++; r += W[i]; gg += W[i + 1]; b += W[i + 2]; }
          const st = g.lightSt ?? {};
          out.views[name] = { pixels: n, lum: +((0.2126 * r + 0.7152 * gg + 0.0722 * b) / Math.max(n, 1)).toFixed(1), rb: +(r / Math.max(b, 1)).toFixed(3),
            factor: +(st.f ?? 1).toFixed(3), lamp: st.lamp === undefined ? null : +(+st.lamp).toFixed(3), zone: st.zone ?? null, calls, root: [g.root.position.x, g.root.position.y, g.root.position.z].map((v) => +v.toFixed(2)) };
        }
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
