// #2158: another player seated on the real sofa, a cinema chair, the gaming chair and our car's passenger seat, before/after,
// in the real app. The peer is a local Ghost fed with the production restState (src/remote-pose.js) for that spot; the main
// camera is placed for a side view of the feet against the floor (only for the picture: the game's own camera is replaced
// in the main render). "before" serves BASE_REV's versions of the touched modules (they import no seatlegs.js).
//   tools/browsertest.sh node tools/seatlegs2158browser.cjs http://localhost:8233 docs/verification/2158
// PLAYWRIGHT_MODULE, CHROME_PATH; THREE_DIR = a local three@0.170.0 package (CDN routed to it). Writes browser.json with the
// left ankle's height over the floor under it for each seat and phase.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8233', out = 'docs/verification/2158'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'origin/main', touched = ['config.js', 'ghosts.js', 'remote-pose.js', 'main.js', 'car.js', 'carmodel.js'];
// seat → how to find its spot, and the view: side (+1 the figure's left, −1 its right), az (rad from straight across towards
// the front), dist (m), eye height over the floor, look height over the floor, forward offset of the look point (m)
const SEATS = {
  soffa: { find: "a.world.furnitureTargets.find((t) => t.kind === 'rest' && t.name === 'soffan').spots[0]", side: 1, az: 0.55, dist: 2.1, eye: 0.75, look: 0.35, fwd: 0.35 },
  biostol: { find: "a.world.playroom.targets.find((t) => t.name === 'biostol 1').spots[0]", room: true, side: -1, az: 0.6, dist: 2.0, eye: 0.75, look: 0.35, fwd: 0.35 },
  dynbox: { find: "a.world.furnitureTargets.find((t) => t.kind === 'rest' && t.name === 'dynboxen').spots[0]", side: 1, az: 0.5, dist: 1.8, eye: 0.7, look: 0.3, fwd: 0.3 },
  gamingstol: { find: "a.world.furnitureTargets.find((t) => t.kind === 'rest' && t.name === 'gamingstolen').spots[0]", side: -1, az: 0.5, dist: 1.3, eye: 0.7, look: 0.35, fwd: 0.3 },
  bil: { find: "(() => { const c = a.car, s = c.seats.find((t) => t.name === 'passagerarsätet'); const d = s.door; if (!d.isOpen) d.toggle(); return s.spots[0]; })()", car: true, side: -1, az: -0.35, dist: 1.9, eye: 0.95, look: 0.5, fwd: 0.35 },
};
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
  const only = (process.env.SEATS || Object.keys(SEATS).join(',')).split(',');
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), phases: {}, external: [] };
  try {
    for (const phase of (process.env.PHASES || 'before,after').split(',')) {
      const t0 = Date.now(), ph = report.phases[phase] = { errors: [], seats: {} };
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => ph.errors.push(e.message.slice(0, 300)));
      page.on('console', (m) => { const t = m.text(); if (m.type() !== 'error' || /favicon|net::ERR|Failed to load resource/.test(t)) return; ph.errors.push(t.slice(0, 600)); });
      await page.goto(`${base}/?test&shot&car&month=6&day=15&time=13&freeze&weather=clear&lights`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene && window.__app.world?.furnitureTargets, null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(3000); await kit.skipNameDialog(page);
      ph.loadMs = Date.now() - t0;
      await page.evaluate(async () => {
        const a = window.__app, T = await import('three'), { restState } = await import('/src/remote-pose.js');
        const g = a.ghosts.add('peer2158', 'Granne');
        window.__seat = { g, T, restState, view: null, state: null };
        const r = a.renderer, render = r.render.bind(r);
        r.render = (scene, cam) => { // the peer drawn and the camera placed just before the game's main render
          const S = window.__seat;
          if (cam === a.camera && S.view) {
            const t = performance.now();
            if (S.state && t - (S.pushed ?? 0) > 90) { S.g.push(S.state, t); S.pushed = t; }
            S.g.draw(t, cam.position); const p = S.g.root.position; a.ghosts.light.apply(S.g.avatar, S.g.lightSt ??= {}, p.x, p.y, p.z, t); a.ghosts.shadows.update(a.ghosts.others.values(), cam.position);
            cam.position.copy(S.view.eye); cam.lookAt(S.view.at); cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
          }
          return render(scene, cam);
        };
      });
      for (const [name, v] of Object.entries(SEATS)) {
        if (!only.includes(name)) continue;
        const res = await page.evaluate(async ([name, v]) => {
          const a = window.__app, S = window.__seat, T = S.T;
          if (a.world.playroom) a.world.playroom.setInside(!!v.room);
          const spot = new Function('a', `return ${v.find};`)(a);
          const st = S.restState({ active: true, kind: 'sit', spot, camera: { rotation: { x: 0, y: spot.yaw } } }, null, S.g.id);
          S.state = { p: st.p, r: st.r, pose: st.pose, look: st.look }; S.pushed = 0; S.g.snaps.length = 0;
          const f = new T.Vector3(-Math.sin(spot.yaw), 0, -Math.cos(spot.yaw)), side = new T.Vector3(Math.cos(spot.yaw), 0, -Math.sin(spot.yaw)).multiplyScalar(-v.side);
          const floorY = v.car ? a.car.cabinFloorAt?.(st.p[0] + f.x * 0.35, st.p[2] + f.z * 0.35, st.p[1]) ?? (a.car.object.position.y + 0.315) : a.player.groundAt(st.p[0] + f.x * 0.35, st.p[2] + f.z * 0.35, st.p[1] + 0.05);
          const at = new T.Vector3(st.p[0], floorY + v.look, st.p[2]).addScaledVector(f, v.fwd);
          const dir = side.clone().multiplyScalar(Math.cos(v.az)).addScaledVector(f, Math.sin(v.az));
          const eye = at.clone().addScaledVector(dir, v.dist); eye.y = floorY + v.eye;
          a.player.spawn(eye.x, eye.z, Math.atan2(-(at.x - eye.x), -(at.z - eye.z))); // (the visitor stands at the camera, out of the picture)
          S.view = { eye, at };
          await new Promise((r) => setTimeout(r, 2500));
          const g = S.g, k = g.avatar.object.scale.y; g.root.updateMatrixWorld(true);
          const foot = (s) => g.avatar.bones['foot' + s].getWorldPosition(new T.Vector3()), knee = g.avatar.bones.kneeL.getWorldPosition(new T.Vector3()), hip = g.avatar.bones.hips.getWorldPosition(new T.Vector3());
          return { pose: g.pose, scale: +k.toFixed(3), floorY: +floorY.toFixed(3), rootY: +g.root.position.y.toFixed(3), hipOverFloor: +(hip.y - floorY).toFixed(3), kneeOverFloor: +(knee.y - floorY).toFixed(3),
            ankleOverFloor: ['L', 'R'].map((s) => +(foot(s).y - floorY).toFixed(3)), seatTop: +(spot.pos.y - 0.72 - floorY).toFixed(3) };
        }, [name, v]);
        ph.seats[name] = res;
        await kit.shot(page, path.join(out, phase === 'before' ? 'before' : '', `${name}-${phase}.png`), { viewport: { width: 800, height: 560 }, frames: 4 });
      }
      ph.ms = Date.now() - t0;
      await ctx.close();
    }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report.phases, null, 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
