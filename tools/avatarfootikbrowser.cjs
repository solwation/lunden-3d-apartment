// #2015: the avatar's feet on stairs and a slope, in the real app with the real ground (Player.groundAt) and the real consumers
// (Ghost = another player, Ghost with self = our own mirror image, both built exactly as Ghosts builds them; `ground` is main.js's hook).
// A ghost walks up and down L1007's own stair (house L), Hus A's stair (lane x -0.75) and the ramp by Hus L's east gable, once with the foot
// adaption (as shipped) and once without it (`ground` removed = the old behaviour). Per frame it logs the lowest sole point of every stance foot
// against the ground under the ankle. Writes OUT/footik-<name>.png (contact sheet), OUT/footik.json (the numbers).
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarfootikbrowser.cjs http://localhost:8615 docs/verification/2015 [only]
const fs = require('fs'), path = require('path');
const kit = require('./testkit.cjs');
const [base = 'http://localhost:8615', out = 'docs/verification/2015', only = ''] = process.argv.slice(2);
// walk: [x, z] from, to (up the stair / slope, then back down), `y0` the floor it starts on (null: Entréplan), `cam`: [m to the side, m behind, m up from the floor]
const SEQ = [
  { name: 'house-L-stair', house: 'Hus L (L1007)', pts: [[3.0, 7.13], [4.35, 7.13]], y0: null, cam: [0, 1.1, 0.5, 0.4, 55], self: false },
  { name: 'house-A-stair', house: 'Hus A', pts: [[-0.75, 42.45], [-0.75, 43.85]], y0: 0, cam: [-1.5, 0.0, 0.6, 0.4, 62], self: false },
  { name: 'house-B-stair', house: 'Hus B', pts: [[-32.5, 46.7], [-32.5, 48.1]], y0: 0, cam: [-0.9, 0.0, 0.6, 0.4, 62], self: false }, // (#2029)
  { name: 'house-C-stair', house: 'Hus C', pts: [[-61.9, 27.45], [-61.9, 28.85]], y0: 0, cam: [-1.5, 0.0, 0.6, 0.4, 62], self: false },
  { name: 'ramp', house: 'rampen vid Hus L:s östra gavel', pts: [[12.5, 12.0], [12.5, 24.0]], y0: 0.9, cam: [-0.55, 2.3, 1.1, 0.35, 50], self: false },
  { name: 'house-L-stair-mirror', house: 'Hus L (L1007), spegelbilden', pts: [[3.0, 7.13], [4.35, 7.13]], y0: null, cam: [0, 1.1, 0.5, 0.4, 55], self: true },
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch();
  const result = [], errors = [];
  try {
    const { page } = await kit.open(browser, base + '/index.html?shot&quality=0', { lazy: true, viewport: { width: 840, height: 640 } });
    page.on('pageerror', (e) => errors.push(e.message));
    for (const sq of SEQ.filter((s) => !only || s.name === only)) {
      const r = await page.evaluate(async ({ sq, frames }) => {
        const A = window.__app, { player, scene, camera, ghosts } = A;
        const { Ghost } = await import('/src/ghosts.js');
        const cfg = await import('/src/config.js');
        player.pos.set(sq.pts[0][0], sq.y0 ?? cfg.LEVELS[0].floor, sq.pts[0][1]); camera.position.set(sq.pts[0][0], (sq.y0 ?? 0) + 1.6, sq.pts[0][1]);
        for (let i = 0; i < 8; i++) { A.frame(0.016); await new Promise((r) => setTimeout(r, 60)); } // (the stair's detail group is drawn near the player)
        const startY = sq.y0 ?? cfg.LEVELS[0].floor;
        const DT = 1 / 60, V = 1.0, Y = 2.2; // walking speed m/s (a stair pace)
        const run = (withIK, shotAt) => {
          const g = new Ghost(scene, sq.self ? 'me' : 'fik', 'Test', sq.self, null);
          g.ground = withIK ? ghosts.ground : null; g.root.visible = true; if (g.tag) g.tag.visible = false;
          const [a, b] = sq.pts, len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
          const stats = { stance: [], pen: 0, hipLow: 1e9, frames: 0, hipRel: [], gapAll: [] }, shots = [];
          const sole = [[0, -0.05, -0.084], [0, -0.05, 0.194]], p = new camera.position.constructor();
          let t = 1000, y = startY;
          const total = 2 * len + 1.0; // up, then back down (with a settle at each end)
          const steps = Math.round(total / V / DT);
          for (let i = 0; i < steps; i++) {
            // position along the polyline: lead-in 0.5 m before, up, a short stop, back
            const u = (i * DT * V) - 0.5; let s = u < len ? u : 2 * len - u;
            const dir = u < len ? 1 : -1;
            s = Math.max(0, Math.min(len, s));
            const x = a[0] + dx * s, z = a[1] + dz * s;
            y = player.groundAt(x, z, y); if (!Number.isFinite(y)) y = startY;
            // heading: the figure faces its walking direction (root yaw = body; the avatar's own forward is root −z)
            const hx = dx * dir, hz = dz * dir;
            g.root.position.set(x, y, z); g.root.rotation.y = Math.atan2(-hx, -hz);
            const moving = (u > 0 && u < 2 * len) ? V : 0;
            g.air = 0; t += DT * 1000;
            g.animate(t, 1, hx * moving, hz * moving);
            g.root.updateMatrixWorld(true);
            const av = g.avatar;
            if (u < 0.3 || u > 2 * len - 0.1) continue;
            for (let k = 0; k < 2; k++) {
              const bone = av.bones[k ? 'footR' : 'footL']; let low = 1e9;
              for (const sp of sole) { p.set(...sp).applyMatrix4(bone.matrixWorld); low = Math.min(low, p.y); }
              p.setFromMatrixPosition(bone.matrixWorld);
              const gr = player.groundAt(p.x, p.z, y + 0.02), gap = low - gr, st = av.gaitInfo?.stance?.[k] ?? -1;
              stats.pen = Math.min(stats.pen, gap);
              if (av.gaitInfo?.contact?.[k] && st > 0.15 && st < 0.85) stats.stance.push(gap);
            }
            av.bones.hips.getWorldPosition(p); stats.hipRel.push(+(p.y - y).toFixed(3));
            stats.frames++;
            if (shotAt && shotAt.has(i)) {
              // a camera beside the walker: `cam` = [m to the walker's side (perpendicular), m behind it]
              const c = sq.cam;
              camera.position.set(x - dz * c[0] - dx * c[1], y + c[2], z + dx * c[0] - dz * c[1]); // (fixed to the stair's line, not to the walker's heading)
              camera.lookAt(x, y + (c[3] ?? 0.45), z); camera.fov = c[4] ?? 50; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
              A.testMode.draw();
              const cv = document.createElement('canvas'); cv.width = A.renderer.domElement.width; cv.height = A.renderer.domElement.height;
              cv.getContext('2d').drawImage(A.renderer.domElement, 0, 0); shots.push(cv.toDataURL('image/png'));
            }
          }
          scene.remove(g.root); g.dispose?.();
          return { stats, shots };
        };
        // the frames of the contact sheet: up (3) and down (3)
        const [a, b] = sq.pts, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const at = new Set(), N = frames;
        for (let n = 0; n < N; n++) at.add(Math.round(((0.5 + 0.35 + (2 * len - 0.6) * n / (N - 1)) / V / DT)));
        const withIK = run(true, at), without = run(false, null);
        const sum = (a) => { const s = [...a].map(Math.abs).sort((x, y) => x - y); return a.length ? { n: a.length, max: s[s.length - 1], p95: s[Math.floor(s.length * 0.95)], mean: s.reduce((x, y) => x + y, 0) / s.length } : null; };
        const hl = (h) => (h.length ? { min: Math.min(...h), max: Math.max(...h) } : null);
        // #2029: the camera's eye height while walking up and down at 1.4 m/s (Player.settleEye smooths the tread steps): largest eye move per 60 Hz frame (cm), largest lag behind the target (cm)
        let eyeMax = 0, lagMax = 0, groundSteps = 0, prevG = null;
        { const [a, b] = sq.pts, len = Math.hypot(b[0] - a[0], b[1] - a[1]), W = 1.4; let y = startY; player.pos.set(a[0], startY, a[1]); player.eyeY = startY + cfg.PLAYER.eye;
          for (let i = 0, n = Math.round((2 * len + 0.6) / W / DT); i < n; i++) { const u = i * DT * W - 0.3, s2 = Math.max(0, Math.min(len, u < len ? u : 2 * len - u)); const x = a[0] + (b[0] - a[0]) / len * s2, z = a[1] + (b[1] - a[1]) / len * s2;
            y = player.groundAt(x, z, y); player.pos.set(x, y, z); const e0 = player.eyeY; player.settleEye(DT); eyeMax = Math.max(eyeMax, Math.abs(player.eyeY - e0)); lagMax = Math.max(lagMax, Math.abs(y + cfg.PLAYER.eye - player.eyeY)); if (prevG !== null && Math.abs(y - prevG) > 1e-4) groundSteps++; prevG = y; } }
        return { eye: { maxStepCm: eyeMax * 100, maxLagCm: lagMax * 100, groundSteps }, shots: withIK.shots, ik: { stance: sum(withIK.stats.stance), pen: withIK.stats.pen, hip: hl(withIK.stats.hipRel) }, old: { stance: sum(without.stats.stance), pen: without.stats.pen, hip: hl(without.stats.hipRel) }, startY };
      }, { sq, frames: 6 });
      const entry = { name: sq.name, house: sq.house, self: sq.self, startY: r.startY, withFootIK: r.ik, withoutFootIK: r.old, eye: r.eye };
      result.push(entry); console.log(JSON.stringify(entry));
      r.shots.forEach((d, i) => fs.writeFileSync(path.join(out, `.tmp-${sq.name}-${i}.png`), Buffer.from(d.split(',')[1], 'base64')));
    }
    // contact sheets: one page draws them from the files
    const sheet = await kit.open(browser, 'about:blank', { test: false, wait: false });
    for (const e of result) {
      const files = fs.readdirSync(out).filter((f) => new RegExp(`^\\.tmp-${e.name}-\\d+\\.png$`).test(f)).sort();
      const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(path.join(out, f)).toString('base64'));
      const png = await sheet.page.evaluate(async (list) => {
        const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
        const im = await Promise.all(list.map(load)), w = im[0].width, h = im[0].height, cols = 3, rows = Math.ceil(im.length / cols);
        const c = document.createElement('canvas'); c.width = w * cols; c.height = h * rows; const x = c.getContext('2d');
        im.forEach((i, n) => x.drawImage(i, (n % cols) * w, Math.floor(n / cols) * h));
        return c.toDataURL('image/png');
      }, imgs);
      fs.writeFileSync(path.join(out, `footik-${e.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
      files.forEach((f) => fs.unlinkSync(path.join(out, f)));
    }
    fs.writeFileSync(path.join(out, 'footik.json'), JSON.stringify(result, null, 1));
    if (errors.length) { console.log('ERRORS', errors.slice(0, 5)); process.exitCode = 1; }
  } finally { await browser.close(); }
})();
