// #2172: the stair gait (forward lean + knee lift up, shorter backward-leaning steps down, a hand on the rail) in the real app: a Ghost (another player,
// built exactly as Ghosts builds it) walks up and down a stairwell, once with the stair gait zeroed in AVATAR_STAIRS (before) and once as shipped (after).
// Writes OUT/before/stairs-<name>.png and OUT/stairs-<name>.png (3 frames up on the top row, 3 down on the bottom row), OUT/stairs2172.json (numbers).
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarstairs2172browser.cjs http://localhost:8247 docs/verification/2172 [only]
const fs = require('fs'), path = require('path');
const kit = require('./testkit.cjs');
const [base = 'http://localhost:8247', out = 'docs/verification/2172', only = ''] = process.argv.slice(2);
// pts: walk [x, z] from, to (up, then back down); y0 the floor it starts on (null: Entréplan); cam: [m to the side, m behind, m up, look height, fov]
const SEQ = [
  { name: 'house-L-stair', house: 'lagenhetens trappa (Hus L, L1007)', pts: [[3.0, 7.13], [4.35, 7.13]], y0: null, cam: [0.0, 1.6, 1.5, 1.1, 56], fr: [0.65, 0.8, 0.95] },
  { name: 'house-A-stair', house: 'Hus A:s trapphus', pts: [[-0.75, 42.45], [-0.75, 43.85]], y0: 0, cam: [-1.5, 0.2, 1.2, 1.15, 62] },
  { name: 'house-B-stair', house: 'Hus B:s trapphus', pts: [[-32.5, 46.7], [-32.5, 48.1]], y0: 0, cam: [-0.9, 0.2, 1.2, 1.15, 66] },
  { name: 'house-C-stair', house: 'Hus C:s trapphus', pts: [[-61.9, 27.45], [-61.9, 28.85]], y0: 0, cam: [-1.5, 0.2, 1.2, 1.15, 62] },
];
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await kit.launch();
  const result = [], errors = [];
  try {
    const { page } = await kit.open(browser, base + '/index.html?shot&quality=0', { lazy: true, viewport: { width: 520, height: 520 } });
    page.on('pageerror', (e) => errors.push(e.message));
    for (const sq of SEQ.filter((s) => !only || s.name === only)) {
      const r = await page.evaluate(async ({ sq }) => {
        const A = window.__app, { player, scene, camera, ghosts } = A;
        const { Ghost } = await import('/src/ghosts.js');
        const cfg = await import('/src/config.js');
        const STR = cfg.AVATAR_STAIRS, orig = { ...STR };
        const off = { upLean: 0, upLift: 0, upShrink: 1, upHip: 0, downLean: 0, downLift: 0, downShrink: 1, downHip: 0, reach: 0 };
        player.pos.set(sq.pts[0][0], sq.y0 ?? cfg.LEVELS[0].floor, sq.pts[0][1]); camera.position.set(sq.pts[0][0], (sq.y0 ?? 0) + 1.6, sq.pts[0][1]);
        for (let i = 0; i < 8; i++) { A.frame(0.016); await new Promise((r) => setTimeout(r, 60)); }
        const startY = sq.y0 ?? cfg.LEVELS[0].floor, DT = 1 / 60, V = 1.0;
        const [a, b] = sq.pts, len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
        const run = (after) => {
          Object.assign(STR, orig); if (!after) Object.assign(STR, off);
          const g = new Ghost(scene, 'st', 'Test', false, null);
          g.ground = ghosts.ground; g.root.visible = true; if (g.tag) g.tag.visible = false;
          const st = { up: { lean: -9, hand: 0, stride: [], lift: 0, n: 0 }, down: { lean: 9, hand: 0, stride: [], lift: 0, n: 0 } }, shots = [];
          const total = 2 * len + 1.0, steps = Math.round(total / V / DT), shotAt = new Set();
          for (const s of sq.fr ?? [0.3, 0.55, 0.8]) { shotAt.add(Math.round((s * len + 0.5) / V / DT)); }
          for (const s of [...(sq.fr ?? [0.3, 0.55, 0.8])].reverse()) { shotAt.add(Math.round(((2 * len - s * len) + 0.5) / V / DT)); }
          let t = 1000, y = startY; const p = new camera.position.constructor();
          for (let i = 0; i < steps; i++) {
            const u = (i * DT * V) - 0.5; let s = u < len ? u : 2 * len - u; const dir = u < len ? 1 : -1; s = Math.max(0, Math.min(len, s));
            const x = a[0] + dx * s, z = a[1] + dz * s;
            y = player.groundAt(x, z, y); if (!Number.isFinite(y)) y = startY;
            const hx = dx * dir, hz = dz * dir;
            g.root.position.set(x, y, z); g.root.rotation.y = Math.atan2(-hx, -hz);
            const moving = (u > 0 && u < 2 * len) ? V : 0;
            g.air = 0; t += DT * 1000; g.animate(t, 1, hx * moving, hz * moving); g.root.updateMatrixWorld(true);
            const av = g.avatar, k = dir > 0 ? st.up : st.down;
            if (u > 0.5 && u < 2 * len - 0.4) {
              const o = av.stair?.out; if (o) { k.lean = dir > 0 ? Math.max(k.lean, o.lean) : Math.min(k.lean, o.lean); }
              k.hand = Math.max(k.hand, av.railHand?.w ?? 0); k.n++;
              if (av.gaitInfo?.strideLen) k.stride.push(av.gaitInfo.strideLen);
              for (const nm of ['footL', 'footR']) { p.setFromMatrixPosition(av.bones[nm].matrixWorld); k.lift = Math.max(k.lift, p.y - player.groundAt(p.x, p.z, y + 0.02)); }
            }
            if (shotAt.has(i)) {
              const c = sq.cam;
              camera.position.set(x - dz * c[0] - dx * c[1], y + c[2], z + dx * c[0] - dz * c[1]);
              camera.lookAt(x, y + c[3], z); camera.fov = c[4]; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
              A.testMode.draw();
              const cv = document.createElement('canvas'); cv.width = A.renderer.domElement.width; cv.height = A.renderer.domElement.height;
              cv.getContext('2d').drawImage(A.renderer.domElement, 0, 0); shots.push(cv.toDataURL('image/png'));
            }
          }
          scene.remove(g.root); g.dispose?.();
          const mean = (v) => (v.length ? v.reduce((x, y2) => x + y2, 0) / v.length : 0);
          for (const k of [st.up, st.down]) { k.stride = +mean(k.stride).toFixed(3); k.lift = +k.lift.toFixed(3); k.lean = +k.lean.toFixed(3); k.hand = +k.hand.toFixed(2); }
          return { st, shots };
        };
        const before = run(false), after = run(true);
        Object.assign(STR, orig);
        return { before, after, rails: (await import('/src/avatarstairs.js')).railCount() };
      }, { sq });
      const entry = { name: sq.name, house: sq.house, rails: r.rails, before: r.before.st, after: r.after.st };
      result.push(entry); console.log(JSON.stringify(entry));
      for (const [tag, dir] of [['before', path.join(out, 'before')], ['after', out]]) r[tag].shots.forEach((d, i) => fs.writeFileSync(path.join(dir, `.tmp-${sq.name}-${i}.png`), Buffer.from(d.split(',')[1], 'base64')));
    }
    const sheet = await kit.open(browser, 'about:blank', { test: false, wait: false });
    for (const e of result) for (const dir of [path.join(out, 'before'), out]) {
      const files = fs.readdirSync(dir).filter((f) => new RegExp(`^\\.tmp-${e.name}-\\d+\\.png$`).test(f)).sort();
      const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'));
      const png = await sheet.page.evaluate(async (list) => {
        const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
        const im = await Promise.all(list.map(load)), w = im[0].width, h = im[0].height, cols = 3, rows = Math.ceil(im.length / cols);
        const c = document.createElement('canvas'); c.width = w * cols; c.height = h * rows; const x = c.getContext('2d');
        im.forEach((i, n) => x.drawImage(i, (n % cols) * w, Math.floor(n / cols) * h));
        return c.toDataURL('image/png');
      }, imgs);
      fs.writeFileSync(path.join(dir, `stairs-${e.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
      files.forEach((f) => fs.unlinkSync(path.join(dir, f)));
    }
    fs.writeFileSync(path.join(out, 'stairs2172.json'), JSON.stringify(result, null, 1));
    if (errors.length) { console.log('ERRORS', errors.slice(0, 5)); process.exitCode = 1; }
  } finally { await browser.close(); }
})();
