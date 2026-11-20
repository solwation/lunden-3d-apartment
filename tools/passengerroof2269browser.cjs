// #2269: does a seated player's head clear our car's roof in the passenger seat? Another player (a local Ghost fed with the
// production restState, as tools/seatlegs2158browser.cjs) sits in the passenger seat at each height; the crown (the head's own
// skull ellipsoid + 1.5 cm hair through the head bone, as tools/olofroof2265browser.cjs) is measured against the roof's inner
// surface straight above it (a ray up through the car's meshes), looking ahead, down and up. Also the first-person eye
// (rest.js eyeAt with main.js's closedFit) against the peer's own eyes (the head bone + AVATAR_HEIGHT.eye) and the roof.
// Saves the passenger side view per height. "before" serves BASE_REV's versions of the touched modules.
//   tools/browsertest.sh node tools/passengerroof2269browser.cjs http://localhost:8541 docs/verification/2269
// PLAYWRIGHT_MODULE, CHROME_PATH; THREE_DIR = a local three@0.170.0 package (CDN routed to it). Writes browser.json.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8541', out = 'docs/verification/2269'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || '0918a52b', touched = ['config.js', 'ghosts.js', 'remote-pose.js', 'main.js', 'car.js', 'rest.js'];
const HEIGHTS = (process.env.HEIGHTS || '100,140,175,186,200').split(',').map(Number), SHOTS = [140, 175, 186, 200];
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
      for (const cm of HEIGHTS) {
        const res = await page.evaluate(async (cm) => {
          const a = window.__app, S = window.__seat, T = S.T, C = S.C, RP = S.RP;
          const look = { ...C.defaultFaceLook(), height: cm }, av = C.encodeAvatarWireLook(look), id = `peer2269-${cm}`;
          if (S.g) S.g.root.visible = false;
          const g = S.g = a.ghosts.add(id, 'Granne', av); g.root.visible = true;
          const seat = a.car.seats.find((t) => t.name === 'passagerarsätet'), spot = seat.spots[0];
          const out = { scale: null, looks: {} };
          for (const [name, pitch] of Object.entries({ ahead: 0, down: -0.6, up: 0.6 })) {
            const st = RP.restState({ active: true, kind: 'sit', spot, camera: { rotation: { x: pitch, y: spot.yaw } } }, av, id);
            S.state = { p: st.p, r: st.r, pose: st.pose, look: st.look, av }; S.pushed = 0; g.snaps.length = 0; g.seatAt = null;
            S.view = { from: [-0.15, 1.3, 2.4], at: [-0.15, 1.15, 0.37] };
            await new Promise((r) => setTimeout(r, 2200));
            g.root.updateMatrixWorld(true); g.avatar.mesh?.skeleton?.update();
            const cw = S.crown(g.avatar.bones.head), rw = S.roofOver(cw), L = (w) => a.car.object.worldToLocal(w.clone());
            const c = L(cw), rf = rw && L(rw), r3 = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(3));
            out.scale = +g.avatar.object.scale.y.toFixed(4);
            out.looks[name] = { crown: r3(c), roof: rf ? +rf.y.toFixed(3) : null, clearance: rf ? +(rf.y - c.y).toFixed(3) : null };
            if (name === 'ahead') {
              // the first-person eye: rest.js eyeAt for this look (main.js applyBody) vs the figure's eyes (head bone + AVATAR_HEIGHT.eye, level)
              const rest = Object.create(Object.getPrototypeOf(a.rest)); Object.assign(rest, { scale: C.avatarBody(look).scale, closedFit: RP.closedSeatFitLook?.(look) ?? null });
              const eye = L(rest.eyeAt(spot)), hb = L(g.avatar.bones.head.getWorldPosition(new T.Vector3()));
              const head = C.avatarProportions(cm).head, eyeFig = hb.clone(); eyeFig.y += C.AVATAR_HEIGHT.eye * head * g.avatar.object.scale.y;
              const er = S.roofOver(a.car.object.localToWorld(eye.clone()));
              out.eye = { camera: r3(eye), figure: r3(eyeFig), off: +eye.distanceTo(eyeFig).toFixed(3), roofOverCamera: er ? +(L(er).y - eye.y).toFixed(3) : null };
              out.fit = RP.closedSeatFitLook ? Object.fromEntries(Object.entries(RP.closedSeatFitLook(look)).map(([k, v]) => [k, +v.toFixed(3)])) : null;
              out.hipY = +L(g.avatar.bones.hips.getWorldPosition(new T.Vector3())).y.toFixed(3);
              out.feet = ['L', 'R'].map((s) => r3(L(g.avatar.bones['foot' + s].getWorldPosition(new T.Vector3()))));
            }
          }
          // leave it looking ahead for the picture
          const st = RP.restState({ active: true, kind: 'sit', spot, camera: { rotation: { x: 0, y: spot.yaw } } }, av, id);
          S.state = { p: st.p, r: st.r, pose: st.pose, look: st.look, av }; S.pushed = 0;
          await new Promise((r) => setTimeout(r, 1200));
          return out;
        }, cm);
        ph.heights[cm] = res;
        if (SHOTS.includes(cm)) await kit.shot(page, path.join(out, phase === 'before' ? 'before' : '', `passenger-${cm}.png`), { viewport: { width: 800, height: 560 }, frames: 4 });
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
        return { hips: w('hips'), head: w('head'), footL: w('footL'), seatFit: g.seatFit ?? null };
      });
      ph.ms = Date.now() - t0;
      await ctx.close();
    }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report.phases, null, 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
