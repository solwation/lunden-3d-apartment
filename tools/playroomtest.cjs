// #1319 / #1326: the playhouse's secret children's room, in the real app (no Worker). A 175 cm avatar aims at the playhouse door and
// gets a friendly no; a 120 cm avatar goes in (short fade, hidden room far off the map, drawn only inside), walks into the walls,
// aims at the way out, and comes out in front of the door; growing past 140 cm inside lets you walk out; a reload inside saves the
// spot at the door. Draw calls: the same outside before and after a visit; the room costs a few calls inside only.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/shots1319 node tools/playroomtest.cjs http://localhost:PORT
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8844', shots = process.env.SHOTS || '/tmp/shots1319';
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('lunden.name', 'Barn'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await page.goto(`${game}/?shot&quality=3&time=12&month=6&freeze`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 600000 });
    await page.evaluate(() => {
      const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); a.renderer.setAnimationLoop(null);
      const P = a.player, cam = a.camera;
      window.__t = {
        frames: (n) => { for (let i = 0; i < n; i++) P.update(1 / 60); },
        render: () => { a.step(0); a.renderer.render(a.scene, a.camera); },
        calls: () => { a.step(0); a.renderer.info.reset(); a.renderer.render(a.scene, a.camera); return { calls: a.renderer.info.render.calls, tris: a.renderer.info.render.triangles }; },
        aim: (x, y, z) => { cam.updateMatrixWorld(true); const d = new cam.position.constructor(x, y, z).sub(cam.position); cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); },
        focus: () => { a.touch.enabled = true; a.step(0); a.step(0); const f = a.focus(); a.touch.enabled = false; return f.focused ? { kind: f.focused.kind, name: f.focused.name, verb: f.focused.verb } : null; },
        state: () => ({ x: P.pos.x, y: P.pos.y, z: P.pos.z, inRoom: P.inPlayroom, outdoors: P.outdoors, roomVisible: a.world.playroom.object.visible, eye: P.eyeY - P.pos.y, yaw: cam.rotation.y }),
      };
    });
    const setHeight = (cm) => page.evaluate(async (cm) => { const C = await import('/src/config.js'); window.__app.avatarCustomizer.setLook({ ...C.decodeAvatarLook('241302112', 'me'), height: cm }); }, cm);
    const door = { x: -28.85, z: 23.8 };
    const toDoor = () => page.evaluate((door) => { const t = window.__t, P = window.__app.player; P.spawn(door.x, door.z - 1.1, Math.PI); t.frames(60); t.aim(door.x, 0.6, door.z - 0.2); return t.focus(); }, door);

    // outside, before: the playhouse door is a target; a tall avatar gets a no
    await setHeight(175);
    const f1 = await toDoor();
    check(f1?.kind === 'playhouse' && f1.verb === 'gå in i', 'the playhouse door is a target', JSON.stringify(f1));
    const before = await page.evaluate(() => window.__t.calls());
    await page.evaluate(() => { window.__t.render(); }); await page.screenshot({ path: `${shots}/1-outside.png` });
    await page.evaluate(() => window.__app.use(window.__app.focus().focused));
    await page.waitForTimeout(700);
    const s1 = await page.evaluate(() => window.__t.state());
    check(!s1.inRoom && !s1.roomVisible && Math.abs(s1.z - 22.7) < 0.2, '175 cm: not let in', JSON.stringify(s1));
    await page.evaluate(() => window.__t.render()); await page.screenshot({ path: `${shots}/2-denied.png` });

    // 120 cm: in
    await setHeight(120);
    await toDoor();
    await page.evaluate(() => window.__app.use(window.__app.focus().focused));
    await page.waitForTimeout(900);
    const s2 = await page.evaluate(() => { window.__t.frames(60); return window.__t.state(); });
    check(s2.inRoom && s2.roomVisible && !s2.outdoors && s2.x < -1000, '120 cm: inside the hidden room, drawn', JSON.stringify(s2));
    check(Math.abs(s2.y) < 1e-6, 'standing on the room floor', `y=${s2.y}`);
    const inside = await page.evaluate(() => window.__t.calls());
    await page.evaluate(() => window.__t.render()); await page.screenshot({ path: `${shots}/3-inside.png` });
    // the walls hold: run into the west wall
    const wall = await page.evaluate(() => { const P = window.__app.player, cam = window.__app.camera; cam.rotation.y = Math.PI / 2; P.keys = new Set(['KeyW', 'ShiftLeft']); window.__t.frames(400); P.keys = new Set(); return { x: P.pos.x, bounds: window.__app.world.playroom.bounds }; });
    check(wall.x > wall.bounds.x0 && wall.x < wall.bounds.x0 + 0.5, 'the west wall holds', `x=${wall.x.toFixed(2)} wall=${wall.bounds.x0}`);
    // the exit door
    const f2 = await page.evaluate(() => { const t = window.__t, P = window.__app.player, r = window.__app.world.playroom, a = r.arrival; P.spawn(a.x, a.z, a.yaw); t.frames(30); t.aim(a.x, 0.7, r.bounds.z1); return t.focus(); });
    check(f2?.kind === 'playroomExit' && f2.verb === 'gå ut ur', 'the exit door is a target', JSON.stringify(f2));
    await page.evaluate(() => window.__t.render()); await page.screenshot({ path: `${shots}/4-exit-door.png` });
    // growing past the limit inside: no throwing out; the door still works
    await setHeight(170);
    const s3 = await page.evaluate(() => window.__t.state());
    check(s3.inRoom, 'height changed inside: still in the room');
    // a reload inside is saved at the playhouse door
    const saved = await page.evaluate(() => { window.__app.player.pos.x; sessionStorage.clear(); window.dispatchEvent(new Event('pagehide')); return Object.entries(sessionStorage).map(([k, v]) => [k, v.slice(0, 200)]); });
    check(saved.some(([, v]) => /"z":22\.8|"z":22\.9/.test(v) || /-28\.85/.test(v)), 'the saved place is at the playhouse door', JSON.stringify(saved));
    await page.evaluate(() => window.__app.use(window.__app.focus().focused));
    await page.waitForTimeout(900);
    const s4 = await page.evaluate(() => { window.__t.frames(60); return window.__t.state(); });
    check(!s4.inRoom && !s4.roomVisible && Math.abs(s4.x + 28.85) < 0.05 && Math.abs(s4.z - 22.85) < 0.1 && s4.outdoors, 'out again in front of the door, room undrawn', JSON.stringify(s4));
    check(Math.abs(s4.yaw) < 0.01, 'facing away from the door');
    await page.evaluate(() => { window.__t.aim(-28.85, 1.0, 10); window.__t.render(); }); await page.screenshot({ path: `${shots}/5-out-again.png` });
    await setHeight(175); await toDoor();
    const after = await page.evaluate(() => window.__t.calls());
    check(before.calls === after.calls && before.tris === after.tris, 'draw calls outside unchanged after a visit', `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    check(inside.calls <= 20, 'inside, only the room is drawn: few draw calls', `outside ${before.calls}, inside ${inside.calls}`);
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
