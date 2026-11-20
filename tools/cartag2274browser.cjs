// #2274: a player seated in our car (either front seat) shows no name tag at all (it used to be cut in half by the roof).
// A real remote Ghost sits in each front seat at 175 / 200 cm; asserts tag.visible === false there and true on the sofa, saves side views.
//   tools/browsertest.sh node tools/cartag2274browser.cjs http://localhost:8571 docs/verification/2274
// "before" serves BASE_REV's ghosts.js. PLAYWRIGHT_MODULE, CHROME_PATH, THREE_DIR as passengerroof2269browser.cjs. Writes browser.json.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8571', out = 'docs/verification/2274'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || '9d4770a9', touched = ['ghosts.js'];
const HEIGHTS = (process.env.HEIGHTS || '175,200').split(',').map(Number), SHOTS = [175, 200];
async function route(ctx, phase, log) {
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    const m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
    if (m && three) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
    if (!u.startsWith(base + '/')) { log.push(u); return r.abort(); }
    const f = new URL(u).pathname.match(/^\/src\/([a-z0-9-]+\.js)$/);
    if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`], { maxBuffer: 1 << 28 }) });
    return r.continue();
  });
}
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), phases: {}, external: [] };
  try {
    for (const phase of (process.env.PHASES || 'before,after').split(',')) {
      const t0 = Date.now(), ph = report.phases[phase] = { errors: [], heights: {} };
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => ph.errors.push(e.message.slice(0, 300)));
      page.on('console', (m) => { const t = m.text(); if (m.type() !== 'error' || /favicon|net::ERR|Failed to load resource/.test(t)) return; ph.errors.push(t.slice(0, 600)); });
      await page.goto(`${base}/?test&shot&car&month=6&day=15&time=13&freeze&weather=clear&lights`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene && window.__app.car?.seats?.length, null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(3000); await kit.skipNameDialog(page);
      ph.loadMs = Date.now() - t0;
      await page.evaluate(async () => {
        const a = window.__app, T = await import('three'), RP = await import('/src/remote-pose.js'), C = await import('/src/config.js');
        const S = window.__seat = { T, RP, C, g: null, view: null, state: null };
        const r = a.renderer, render = r.render.bind(r);
        r.render = (scene, cam) => { // the peer drawn and the camera placed just before the game's main render
          if (cam === a.camera && S.view && S.g) {
            const t = performance.now();
            if (S.state && t - (S.pushed ?? 0) > 90) { S.g.push(S.state, t); S.pushed = t; }
            S.g.draw(t, cam.position); const p = S.g.root.position; a.ghosts.light.apply(S.g.avatar, S.g.lightSt ??= {}, p.x, p.y, p.z, t);
            a.car.object.updateMatrixWorld(true);
            cam.position.copy(a.car.object.localToWorld(new T.Vector3(...S.view.from))); cam.lookAt(a.car.object.localToWorld(new T.Vector3(...S.view.at)));
            cam.fov = 38; cam.near = 0.05; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
          }
          return render(scene, cam);
        };
        // the crown: the skull ellipsoid's top + 1.5 cm hair through the head bone (olofroof2265browser.cjs)
        const SK = C.PVP_RIFLE_HEAD.skull, hair = 0.015;
        S.crown = (head) => {
          head.updateWorldMatrix(true, false);
          const v = new T.Vector3(), best = new T.Vector3(0, -Infinity, 0);
          for (let i = 0; i <= 12; i++) for (let j = 0; j < 24; j++) {
            const th = Math.PI / 2 * i / 12, ph = 2 * Math.PI * j / 24, rr = SK.radius;
            v.set(SK.centre[0] + Math.sin(th) * Math.cos(ph) * (rr * SK.scale[0] + hair), SK.centre[1] + Math.cos(th) * (rr * SK.scale[1] + hair), SK.centre[2] + Math.sin(th) * Math.sin(ph) * (rr * SK.scale[2] + hair)).applyMatrix4(head.matrixWorld);
            if (v.y > best.y) best.copy(v);
          }
          return best;
        };
        S.roofOver = (w) => { // the car's own meshes (not Olof's figure), both sides, straight up from 0.3 m under `w`
          const fig = a.olofDriver?.fig?.object, meshes = [];
          a.car.object.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.visible !== false) { let x = o, mine = false; while (x) { if (x === fig) mine = true; x = x.parent; } if (!mine) meshes.push(o); } });
          const sides = meshes.map((m) => { const s = [].concat(m.material).map((mt) => mt.side); [].concat(m.material).forEach((mt) => mt.side = T.DoubleSide); return s; });
          const hit = new T.Raycaster(new T.Vector3(w.x, w.y - 0.3, w.z), new T.Vector3(0, 1, 0), 0, 2).intersectObjects(meshes, false)[0];
          meshes.forEach((m, i) => [].concat(m.material).forEach((mt, j) => mt.side = sides[i][j]));
          return hit ? hit.point : null;
        };
      });
      for (const cm of HEIGHTS) for (const [sn, side] of [['passagerarsätet', 1], ['förarsätet', -1]]) {
        const res = await page.evaluate(async ([cm, sn, side]) => {
          const a = window.__app, S = window.__seat, T = S.T, C = S.C, RP = S.RP;
          const look = { ...C.defaultFaceLook(), height: cm }, av = C.encodeAvatarWireLook(look), id = `peer2274-${cm}-${side}`;
          if (S.g) S.g.root.visible = false;
          const g = S.g = a.ghosts.add(id, 'Granne', av); g.root.visible = true;
          const spot = a.car.seats.find((t) => t.name === sn).spots[0];
          const st = RP.restState({ active: true, kind: 'sit', spot, camera: { rotation: { x: 0, y: spot.yaw } } }, av, id);
          S.state = { p: st.p, r: st.r, pose: st.pose, look: st.look, av }; S.pushed = 0; g.snaps.length = 0; g.seatAt = null;
          S.view = { from: [-0.15, 1.3, 2.4 * side], at: [-0.15, 1.15, 0.37 * side] };
          await new Promise((r) => setTimeout(r, 2500));
          return { tagVisible: g.tag.visible, inCarSeat: g.inCarSeat ?? null, rootVisible: g.root.visible };
        }, [cm, sn, side]);
        ph.heights[`${cm}-${sn}`] = res;
        if (SHOTS.includes(cm)) await kit.shot(page, path.join(out, phase === 'before' ? 'before' : '', `${sn === 'förarsätet' ? 'driver' : 'passenger'}-${cm}.png`), { viewport: { width: 800, height: 560 }, frames: 4 });
      }
      // an open seat (the sofa) is untouched: the same 186 cm peer's hips and head bone, to compare across the phases
      ph.sofa = await page.evaluate(async () => {
        const a = window.__app, S = window.__seat, T = S.T, C = S.C, RP = S.RP;
        const av = C.encodeAvatarWireLook({ ...C.defaultFaceLook(), height: 186 }), id = 'peer2269-sofa';
        if (S.g) S.g.root.visible = false;
        const g = S.g = a.ghosts.add(id, 'Granne', av), spot = a.world.furnitureTargets.find((t) => t.kind === 'rest' && t.name === 'soffan').spots[0];
        const st = RP.restState({ active: true, kind: 'sit', spot, camera: { rotation: { x: 0, y: spot.yaw } } }, av, id);
        S.state = { p: st.p, r: st.r, pose: st.pose, look: st.look, av }; S.pushed = 0;
        await new Promise((r) => setTimeout(r, 2500));
        g.root.updateMatrixWorld(true);
        const w = (b) => g.avatar.bones[b].getWorldPosition(new T.Vector3()).toArray().map((n) => +n.toFixed(3));
        return { tagVisible: g.tag.visible, hips: w('hips'), head: w('head') };
      });
      ph.ms = Date.now() - t0;
      await ctx.close();
    }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report.phases, null, 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
