// #1137: the local body follows the chosen avatar height in the real app (no Worker). For 120, 165 and 195 cm (and the
// unchosen adult as the baseline) the look goes in through the customizer's setLook, then the real Player walks and
// crouches: standing and crouched eye heights, the wall clearance (body radius) at the bathroom wall, up the stair
// standing and on the haunches, sitting on the living-room sofa (the seated eye follows the body), and aiming within reach
// at a door (handle height) and the coffee jar on the kitchen worktop. Shots per height: counter-<cm> (first person at
// the eye height towards the kitchen worktop) and stair-<cm> (looking up the stair from its foot).
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/shots-1137 node tools/avatarbodytest.cjs GAME
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8632';
const shots = process.env.SHOTS || '/tmp/shots-1137';
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const app = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = []; app.on('pageerror', (e) => errors.push(e.message));
    await app.addInitScript(() => { localStorage.setItem('lunden.name', 'Kropp'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await app.goto(`${game}/?shot&quality=3&time=12&month=6&freeze`, { waitUntil: 'commit' });
    await app.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 600000 });
    await app.evaluate(() => {
      const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); a.renderer.setAnimationLoop(null);
      const dt = 1 / 60, P = a.player, cam = a.camera;
      const frames = (n) => { for (let i = 0; i < n; i++) P.update(dt); };
      const aim = (target) => { cam.updateMatrixWorld(true); const d = target.clone().sub(cam.position);
        cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); };
      window.__body = {
        frames,
        eye: () => P.eyeY - P.pos.y,
        wall: () => { P.spawn(1.3, 3.5, -Math.PI / 2); P.keys = new Set(['KeyW']); frames(120); P.keys = new Set(); return P.pos.x; },
        stair: (crouch) => { P.spawn(2.7, 7.13, -Math.PI / 2); P.crouch = crouch; frames(40);
          for (const [x, z] of [[4.3, 7.13], [5.1, 7.0], [5.15, 6.2], [4.3, 6.2], [3.0, 6.2]])
            for (let t = 0; t < 12 && Math.hypot(P.pos.x - x, P.pos.z - z) > 0.12; t += dt) {
              cam.rotation.y = Math.atan2(-(x - P.pos.x), -(z - P.pos.z)); P.keys = new Set(['KeyW']); P.update(dt); }
          P.keys = new Set(); const level = P.level, y = P.pos.y; P.crouch = false; frames(60); return { level, y, standUp: P.crouched === false }; },
        // aim from `from` (feet x, z) at a world point; what the focus ray picks
        focusAt: (x, z, point) => { P.spawn(x, z, 0); frames(60); a.touch.enabled = true; // (main.js active(): playing)
          aim(point); a.step(0); aim(point); a.step(0);
          const f = a.focus(); a.touch.enabled = false; return { focused: f.focused, point: f.focusPoint?.clone() ?? null }; },
      };
    });
    const base = await app.evaluate(() => { const b = window.__body; b.frames(1); return { wall: b.wall() }; });
    for (const cm of [120, 165, 195]) {
      const r = await app.evaluate(async (cm) => {
        const a = window.__app, C = await import('/src/config.js'), b = window.__body, P = a.player;
        a.avatarCustomizer.setLook({ ...C.decodeAvatarLook('241302112', 'me'), height: cm });
        const want = C.avatarBody({ height: cm });
        const out = { cm, want, body: { eye: C.PLAYER.eye, crouchEye: C.PLAYER.crouchEye, headroom: C.PLAYER.headroom, radius: C.PLAYER.radius }, scale: a.rest.scale };
        P.spawn(1.3, 0.8, Math.PI); b.frames(60); out.stand = b.eye();
        P.crouch = true; b.frames(60); out.crouch = b.eye(); P.crouch = false; b.frames(60); out.up = b.eye();
        out.wall = b.wall();
        out.stairUp = b.stair(false); out.stairCrouch = b.stair(true);
        // the living-room sofa: a rest target, sit through the real E path
        const sofa = a.world.furnitureTargets.find((t) => t.kind === 'rest' && t.rest === 'sit' && t.level === 0 && t.spots.length > 1);
        const spot = sofa.spots[0], toward = new a.camera.position.constructor(spot.dir?.[0] ?? 0, 0, spot.dir?.[1] ?? 1);
        const from = spot.pos.clone();
        // stand 1 m in front of the seat (the way the face points, spot.yaw)
        from.x += -Math.sin(spot.yaw) * 1.0; from.z += -Math.cos(spot.yaw) * 1.0;
        const f = b.focusAt(from.x, from.z, spot.aimPos ?? spot.pos.clone().setY(spot.pos.y - 0.5));
        out.sofaFocus = f.focused === sofa;
        if (out.sofaFocus) { a.touch.enabled = true; a.use(sofa); for (let i = 0; i < 60; i++) a.rest.update(1 / 60); a.touch.enabled = false; }
        out.sitting = a.rest.active; out.seatEye = a.camera.position.y; out.seatWant = a.rest.active ? a.rest.spot.pos.y - C.REST.sitEye * (1 - want.scale) : null;
        out.seatName = sofa.name;
        if (a.rest.active) a.standUp(); b.frames(30);
        // a door at handle height (the bathroom door: the swing door nearest the hall)
        const T = await import('three'), bb = new T.Box3();
        const doors = a.world.doors.filter((d) => d.kind === 'swing' && d.pickable && (d.level ?? 0) === 0);
        out.door = null;
        for (const d of doors) {
          bb.setFromObject(d.pickable); const c = bb.getCenter(new T.Vector3()), s = bb.getSize(new T.Vector3());
          if (c.y > 2 || s.y < 1.8) continue;
          const n = s.x < s.z ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1); // the door leaf's normal (closed)
          for (const side of [1, -1]) {
            const feet = c.clone().addScaledVector(n, side * 0.8);
            if (!P.isFree(feet.x, feet.z, 0)) continue;
            const handle = c.clone().setY(bb.min.y + 1.0);
            const got = b.focusAt(feet.x, feet.z, handle);
            out.door = { name: d.name ?? '', ok: got.focused === d, at: feet.toArray().map((v) => +v.toFixed(2)) };
            break;
          }
          if (out.door) break;
        }
        // the coffee jar on the worktop, from the middle of the kitchen
        bb.setFromObject(a.coffeeJar.object); const jar = bb.getCenter(new T.Vector3());
        const got = b.focusAt(jar.x - 0.9, jar.z, jar);
        out.jar = { ok: !!got.focused && !!got.point && got.point.distanceTo(jar) < 0.3, name: got.focused?.name ?? null, top: +bb.max.y.toFixed(3) };
        return out;
      }, cm);
      const near = (x, y, e = 1e-9) => Math.abs(x - y) < e;
      check(['eye', 'crouchEye', 'headroom', 'radius'].every((k) => near(r.body[k], r.want[k])) && near(r.scale, r.want.scale), `${cm} cm: PLAYER body follows the height`, JSON.stringify(r.body));
      check(near(r.stand, r.want.eye, 0.01) && near(r.crouch, r.want.crouchEye, 0.01) && r.crouch < r.stand - 0.2 && near(r.up, r.want.eye, 0.01),
        `${cm} cm: stand ${r.stand.toFixed(3)} m, crouch ${r.crouch.toFixed(3)} m, up again`);
      check(near(r.wall - base.wall, 0.22 - r.want.radius, 0.03), `${cm} cm: the bathroom wall stops the body at its radius ${r.want.radius.toFixed(3)} m`, `x ${r.wall.toFixed(3)} vs adult ${base.wall.toFixed(3)}`);
      check(r.stairUp.level === 1 && r.stairCrouch.level === 1 && r.stairUp.standUp, `${cm} cm: up the stair standing and crouched`, JSON.stringify([r.stairUp, r.stairCrouch]));
      check(r.sitting && near(r.seatEye, r.seatWant, 0.01), `${cm} cm: sits on ${r.seatName}, seated eye ${r.seatEye?.toFixed(3)} m`, `want ${r.seatWant?.toFixed(3)}`);
      check(r.door?.ok, `${cm} cm: aims at a door at handle height`, JSON.stringify(r.door));
      check(r.jar.ok, `${cm} cm: reaches the coffee jar on the worktop`, JSON.stringify(r.jar));
      // screenshots: the worktop and the stair from the eye height
      await app.evaluate(async () => { const a = window.__app, b = window.__body, P = a.player, T = await import('three');
        P.spawn(4.3, 2.4, -Math.PI / 2); b.frames(60); a.camera.rotation.set(-0.15, -Math.PI / 2, 0, 'YXZ'); a.renderer.render(a.scene, a.camera); });
      await app.screenshot({ path: `${shots}/counter-${cm}.png` });
      await app.evaluate(() => { const a = window.__app, b = window.__body, P = a.player;
        P.spawn(2.4, 7.13, -Math.PI / 2); b.frames(60); a.camera.rotation.set(0.1, -Math.PI / 2, 0, 'YXZ'); a.renderer.render(a.scene, a.camera); });
      await app.screenshot({ path: `${shots}/stair-${cm}.png` });
    }
    check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  } finally { await browser.close(); }
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
