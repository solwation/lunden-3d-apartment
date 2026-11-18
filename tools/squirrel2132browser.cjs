// #2132: the squirrels climbing the trees' real skeletons, in the game's own river park. AFTER (this checkout) and BEFORE (the baseline's
// config.js / squirrelbrain.js / squirrels.js / squirrelsync.js served in place of the branch's) in one run. One real squirrel is put at the
// foot of a park tree that has a branch hop to a neighbour and driven through the production brain and pose (SquirrelBrain.update +
// Squirrels.pose, the leader's consumer): up the trunk, a perch, the jump to the neighbouring crown (a run out along the limb first) and the
// descent; a camera beside it takes a frame sequence of each. Also: the park's trees with climbing frames and branch hops, draws/programs
// with the squirrel in view, page/shader errors (fail the run).
// BASELINE=<sha> THREE_DIR=<three@0.170.0 package> node tools/squirrel2132browser.cjs http://127.0.0.1:8332 OUTDIR
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process'), kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://127.0.0.1:8332', out = process.argv[3] || 'docs/verification/2132';
const baseline = process.env.BASELINE || 'ab7b1953', phases = (process.env.PHASES || 'after,before').split(',');
const VIEW = { width: 900, height: 560 }, CLIP = { x: 900 / 2 - 210, y: 560 / 2 - 170, width: 420, height: 340 };
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await kit.launch(), result = { baseline, phases: {} };
  let pick = null; // (the after phase's trees, reused before so both show the same place)
  try {
    for (const phase of phases) {
      const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 }), errors = [], consoleErrors = [];
      if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
      if (phase === 'before') for (const f of ['src/config.js', 'src/squirrels.js', 'src/squirrelbrain.js', 'src/squirrelsync.js']) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 64e6 });
        await ctx.route((u) => u.pathname === '/' + f, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
      const t0 = Date.now();
      await page.goto(`${game}/?test&cloud=&month=7&time=12&freeze&weather=clear&wind=0.5`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.squirrels?.animals?.[1]?.isRigged, null, { timeout: 900000, polling: 500 });
      await kit.skipNameDialog(page);
      const load = Date.now() - t0;
      const setup = await page.evaluate(async (pick) => {
        const LOD = await import('/src/lod.js'); // (the trees' near / far level follows this camera, as main.js does every frame)
        const A = __app, S = A.squirrels; A.renderer.setAnimationLoop(null); A.showOverlay(false); A.testMode?.setFull(true);
        for (let i = 0; i < 3; i++) A.step(0.1);
        const ts = S.trees, framed = ts.filter((t) => t.cf).length, hops = ts.reduce((n, t) => n + t.near.length, 0) / 2;
        const gaps = ts.flatMap((t, i) => Object.entries(t.hops ?? {}).filter(([j]) => +j > i).map(([, h]) => h.d));
        // the tree: (after) the park tree nearest the river park's centre with a branch hop, (before) the same trees by position
        let i0, j0;
        if (pick) { const at = (p) => ts.findIndex((t) => Math.hypot(t.x - p[0], t.z - p[1]) < 0.01); i0 = at(pick.a); j0 = at(pick.b); }
        else {
          const c = [-20, 192], order = ts.map((t, i) => [Math.hypot(t.x - c[0], t.z - c[1]), i]).sort((a, b) => a[0] - b[0]);
          i0 = order.find(([, i]) => ts[i].g == null && Object.keys(ts[i].hops ?? {}).length)?.[1] ?? order[0][1];
          j0 = +Object.keys(ts[i0].hops ?? {})[0];
        }
        const q = S.animals[0], b = q.brain; b.env.now = () => 1e6; b.env.hour = () => 11; b.route = []; b.calmT = 0; b.travelAfter = b.approachAfter = false; b.target = null;
        S.animals.forEach((o) => { if (o !== q) { o.brain.coarse = () => {}; o.group.visible = false; } }); // (the others out of the pictures)
        const t = ts[i0], u = ts[j0], toward = Math.atan2(u.z - t.z, u.x - t.x);
        window.T = { A, S, q, b, i0, j0, cam: { x: 0, y: 0, z: 0 },
          /** n steps of `dt` of the production brain and pose, then a frame from beside the squirrel (outward from the trunk it is on). */
          step(n, dt = 0.05) {
            for (let k = 0; k < n; k++) { b.update(dt); S.time += dt; S.pose(q, 3, dt); }
            // (on the stem: from outside it, the squirrel's back to the camera; out in the crown: from beside the limb, so the limb shows)
            const tr = b.tr, ox = b.x - tr.x, oz = b.z - tr.z, l = Math.hypot(ox, oz) || 1, stem = Math.abs(b.pitch) > 1.2 || b.state === 'down' && b.y - S.ground(b.x, b.z) < 0.3;
            const [out, side] = stem ? [2.4, 0.5] : [0.7, 2.3];
            const want = { x: b.x + ox / l * out - oz / l * side, y: b.y + (stem ? 0.35 : 0.6), z: b.z + oz / l * out + ox / l * side };
            const c = A.camera; c.position.set(want.x, want.y, want.z); c.zoom = 1.6; c.updateProjectionMatrix();
            c.rotation.set(Math.atan2(b.y + 0.05 - c.position.y, Math.hypot(b.x - c.position.x, b.z - c.position.z)), Math.atan2(-(b.x - c.position.x), -(b.z - c.position.z)), 0, 'YXZ'); c.updateMatrixWorld(true);
            LOD.updateInstanceLods(c); A.renderer.info.reset(); A.renderer.render(A.scene, c);
            return { state: b.state, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), up: +(b.y - S.ground(b.x, b.z)).toFixed(2), pitch: +b.pitch.toFixed(2), yaw: +b.yaw.toFixed(2),
              tree: b.tree, limb: b.limb ?? null, calls: A.renderer.info.render.calls, programs: A.renderer.info.programs?.length ?? 0, visible: q.group.visible };
          } };
        // at the trunk's foot on the side away from the neighbour, about to climb
        b.tree = i0; b.ang = toward + Math.PI * 0.8; b.place(b.env.trees[i0].cf ? { x: t.x + Math.cos(b.ang) * (t.cf.r0 + 0.06), y: S.ground(t.x, t.z), z: t.z + Math.sin(b.ang) * (t.cf.r0 + 0.06) } : { x: t.x + Math.cos(b.ang) * 0.3, y: S.ground(t.x, t.z), z: t.z + Math.sin(b.ang) * 0.3 });
        b.startUp();
        return { framed, trees: ts.length, hops, gaps: gaps.length ? [Math.min(...gaps), Math.max(...gaps)].map((v) => +v.toFixed(2)) : null, pick: { a: [t.x, t.z], b: [u.x, u.z] }, i0, j0, trunkGap: +Math.hypot(u.x - t.x, u.z - t.z).toFixed(2), near: t.near.includes(j0) };
      }, pick);
      pick ??= setup.pick;
      const frames = [], shoot = async (name, n, dt) => { const f = await page.evaluate(([n, dt]) => T.step(n, dt), [n, dt]); f.name = name; frames.push(f); await page.screenshot({ path: path.join(out, phase === 'before' ? 'before' : '', `${name}.png`), clip: CLIP }); return f; };
      // up the trunk: frames through the climb
      let f = await shoot('climb-0', 6, 0.05);
      for (let k = 1; k < 6 && f.state === 'up'; k++) { const dur = await page.evaluate(() => T.b.dur); f = await shoot(`climb-${k}`, Math.max(1, Math.round(dur / 6 / 0.05)), 0.05); }
      while ((await page.evaluate(() => T.b.state)) === 'up') await page.evaluate(() => T.step(4));
      await shoot('perch', 2, 0.05);
      // the jump to the neighbouring crown (after: out along the limbs to the take-off point, then the branch jump)
      await page.evaluate(() => { const b = T.b; b.route = [T.j0]; b.act({ k: 'leap', j: T.j0 }); });
      for (let k = 0, guard = 0; k < 6 && guard < 400; guard++) {
        const st = await page.evaluate(() => T.b.state);
        if (st === 'perch') break;
        if (st === 'leap' || (st === 'limb' && k < 2)) { await shoot(`hop-${k}`, st === 'leap' ? 3 : 8, 0.05); k++; } else await page.evaluate(() => T.step(4));
      }
      while (['limb', 'leap'].includes(await page.evaluate(() => T.b.state))) await page.evaluate(() => T.step(4));
      await shoot('landed', 2, 0.05);
      // down head first
      await page.evaluate(() => T.b.startDown(false));
      for (let k = 0; k < 6; k++) { const dur = await page.evaluate(() => T.b.dur); f = await shoot(`down-${k}`, Math.max(1, Math.round(dur / 6 / 0.05)), 0.05); if (f.state !== 'down') break; }
      result.phases[phase] = { loadMs: load, setup, frames, errors, consoleErrors };
      await ctx.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(result, null, 1) + '\n');
  for (const [p, r] of Object.entries(result.phases)) console.log(p, JSON.stringify({ loadMs: r.loadMs, setup: r.setup, errors: r.errors, shader: r.consoleErrors.filter((c) => /Shader|WebGLProgram/.test(c)) }), '\n ', r.frames.map((x) => `${x.name}:${x.state} up ${x.up} p ${x.pitch} t${x.tree} calls ${x.calls}`).join('\n  '));
  if (Object.values(result.phases).some((r) => r.errors.length || r.consoleErrors.some((c) => /Shader Error|WebGLProgram/.test(c)))) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
