// #1319 / #1326: the playhouse's secret children's room, in the real app (no Worker). A 175 cm avatar aims at the playhouse door and
// gets a friendly no, as does exactly 160 cm; 140/150 cm avatars enter and exit. A 159 cm avatar enters (short fade, hidden room
// far off the map, drawn only inside), walks into the walls, aims at the exit and comes out in front of the playhouse;
// growing past 160 cm inside still lets you walk out, and a reload inside saves the
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

    // #1344: the new strict boundary and the newly admitted range use real entry/exit.
    await setHeight(160); await toDoor();
    await page.evaluate(() => window.__app.use(window.__app.focus().focused));
    await page.waitForTimeout(700);
    const boundary = await page.evaluate(() => ({ ...window.__t.state(), badge: document.getElementById('badges').textContent }));
    check(!boundary.inRoom && /under 160 cm/.test(boundary.badge), '160 cm: denied with the current height limit', JSON.stringify(boundary));
    for (const cm of [140, 150]) {
      await setHeight(cm); await toDoor();
      await page.evaluate(() => window.__app.use(window.__app.focus().focused));
      await page.waitForTimeout(900);
      const state = await page.evaluate(() => { window.__t.frames(30); return window.__t.state(); });
      check(state.inRoom && state.roomVisible, `${cm} cm: admitted through the playhouse door`, JSON.stringify(state));
      await page.evaluate(() => window.__app.use(window.__app.world.playroom.exitTarget));
      await page.waitForTimeout(900);
      check(!(await page.evaluate(() => window.__t.state())).inRoom, `${cm} cm: the actual exit leads back out`);
    }

    // 159 cm: the tallest allowed integer height, then the whole room lifecycle.
    await setHeight(159);
    await toDoor();
    await page.evaluate(() => window.__app.use(window.__app.focus().focused));
    await page.waitForTimeout(900);
    const s2 = await page.evaluate(() => { window.__t.frames(60); return window.__t.state(); });
    check(s2.inRoom && s2.roomVisible && !s2.outdoors && s2.x < -1000, '159 cm: inside the hidden room, drawn', JSON.stringify(s2));
    check(Math.abs(s2.y) < 1e-6, 'standing on the room floor', `y=${s2.y}`);
    const inside = await page.evaluate(() => window.__t.calls());
    await page.evaluate(() => window.__t.render()); await page.screenshot({ path: `${shots}/3-inside.png` });
    // the walls hold: run into the west wall
    const wall = await page.evaluate(() => { const P = window.__app.player, r0 = window.__app.world.playroom; P.spawn(r0.bounds.x0 + 3.2, r0.bounds.z1 - 0.45, 0); window.__t.frames(10); const cam = window.__app.camera; cam.rotation.y = Math.PI / 2; P.keys = new Set(['KeyW', 'ShiftLeft']); window.__t.frames(400); P.keys = new Set(); return { x: P.pos.x, bounds: window.__app.world.playroom.bounds }; });
    check(wall.x > wall.bounds.x0 && wall.x < wall.bounds.x0 + 0.5, 'the west wall holds', `x=${wall.x.toFixed(2)} wall=${wall.bounds.x0}`);
    // #1327: the furniture. Walls and furniture hold, the sofa and stool can be sat in, nothing overlaps the billiard table, the disco spots sweep.
    const RM = await page.evaluate(async () => { const C = await import('/src/config.js'); return C.PLAYROOM; });
    const L = (lx, lz) => ({ x: RM.x + lx, z: RM.z + lz });
    const walkTo = (from, yaw, secs) => page.evaluate(({ from, yaw, secs }) => { const P = window.__app.player, cam = window.__app.camera; P.spawn(from.x, from.z, 0); window.__t.frames(10); cam.rotation.y = yaw; P.keys = new Set(['KeyW']); window.__t.frames(secs * 60); P.keys = new Set(); return { x: P.pos.x, z: P.pos.z }; }, { from, yaw, secs });
    const sofaWalk = await walkTo(L(0, -1.35), Math.PI / 2, 3); // west along the sofa's middle (north of the billiard table)
    check(sofaWalk.x > RM.x - 1.2 + 0.1 && sofaWalk.x < RM.x - 0.7, 'the sofa holds from behind', `lx=${(sofaWalk.x - RM.x).toFixed(2)}`);
    const deskWalk = await walkTo(L(1.6, 1.0), -Math.PI / 2, 3); // east into the stool / desk
    check(deskWalk.x < RM.x + 2.65 - 0.2, 'the stool and desk hold', `lx=${(deskWalk.x - RM.x).toFixed(2)}`);
    const tvWalk = await walkTo(L(-0.2, 2.1), Math.PI / 2, 4); // west along the south wall, free of furniture
    check(tvWalk.x < RM.x - 2.5 && tvWalk.x > RM.x - 3.2, 'the floor south of the sofa is walkable up to the west wall', `lx=${(tvWalk.x - RM.x).toFixed(2)}`);
    const clash = await page.evaluate(({ RM }) => { const r = window.__app.world.playroom, b = RM.billiards, hx = b.length / 2 + b.rail + 0.05, hz = b.width / 2 + b.rail + 0.05; // the table's footprint (+ 5 cm), no furniture footprint touches it
      return r.footprints.filter((q) => { const xs = q.map((p) => p[0] - RM.x - b.x), zs = q.map((p) => p[1] - RM.z - b.z); return Math.min(...xs) < hx && Math.max(...xs) > -hx && Math.min(...zs) < hz && Math.max(...zs) > -hz; }).length; }, { RM });
    check(clash === 0, 'no furniture footprint touches the billiard table', `overlaps ${clash}`);
    // sit on the sofa (left, middle, right seats), see the TV, get up in a free spot
    const sofa = RM.furniture.sofa;
    for (const [k, name] of [[0, 'left'], [1, 'middle'], [2, 'right']]) {
      const seatZ = sofa.z - sofa.w / 2 + sofa.w / 3 * (k + 0.5);
      const f = await page.evaluate(({ at, seatZ }) => { const t = window.__t, P = window.__app.player; P.spawn(at.x, at.z, 0); t.frames(10); t.aim(at.sx, 0.34, seatZ); return t.focus(); }, { at: { ...L(-0.7, sofa.z), sx: RM.x + sofa.x + 0.1 }, seatZ: RM.z + seatZ });
      check(f?.kind === 'rest' && f.name === 'soffan', `the sofa is a seat (${name})`, JSON.stringify(f));
      await page.evaluate(() => window.__app.use(window.__app.focus().focused)); await page.waitForTimeout(300);
      const sat = await page.evaluate(() => { const a = window.__app; for (let i = 0; i < 12; i++) a.rest.update(0.1); window.__t.render(); return { active: a.rest.active, kind: a.rest.kind, x: a.camera.position.x, y: a.camera.position.y, yaw: a.camera.rotation.y }; });
      check(sat.active && sat.kind === 'sit' && sat.y > 0.7 && sat.y < 1.2 && Math.abs(Math.abs(sat.yaw) - Math.PI / 2) < 0.2, `sitting in the sofa's ${name} seat, facing the TV`, JSON.stringify(sat));
      if (k === 1) await page.screenshot({ path: `${shots}/6-sofa-seated.png` });
      await page.evaluate(() => window.__app.standUp());
      await page.waitForTimeout(300);
      const up = await page.evaluate(() => { const a = window.__app, P = a.player; return { active: a.rest.active, free: P.isFree(P.pos.x, P.pos.z), inRoom: P.inPlayroom }; });
      check(!up.active && up.free && up.inRoom, `got up from the ${name} seat on free floor`, JSON.stringify(up));
    }
    const fs2 = await page.evaluate(({ RM }) => { const t = window.__t, P = window.__app.player; P.spawn(RM.x + 1.5, RM.z + RM.furniture.stool.z, Math.PI / 2); t.frames(10); t.aim(RM.x + RM.furniture.stool.x, 0.36, RM.z + RM.furniture.stool.z); return t.focus(); }, { RM });
    check(fs2?.kind === 'rest' && fs2.name === 'pallen', 'the stool at the gaming desk is a seat', JSON.stringify(fs2));
    // the disco ball: one spot mesh, all spots inside the room, and they move
    const d1 = await page.evaluate(() => { const r = window.__app.world.playroom, p = [...r.spots.geometry.attributes.position.array]; r.disco(1.3); return { a: p, b: [...r.spots.geometry.attributes.position.array], bounds: r.bounds, n: r.rays.length }; });
    const inb = d1.b.every((v, i) => i % 3 === 1 ? v > -0.2 && v < RM.ceiling + 0.2 : true) && d1.b.filter((_, i) => i % 3 === 0).every((v) => v > d1.bounds.x0 - 0.2 && v < d1.bounds.x1 + 0.2) && d1.b.filter((_, i) => i % 3 === 2).every((v) => v > d1.bounds.z0 - 0.2 && v < d1.bounds.z1 + 0.2);
    check(inb && d1.b.some((v, i) => Math.abs(v - d1.a[i]) > 0.3), `the ${d1.n} disco spots lie on the room's surfaces and sweep`, '');
    // #1365: the disco light switches off and on, from the wall switch and from the ball itself
    const DSW = RM.furniture.discoSwitch, BL = RM.furniture.ball;
    const aimAt = (from, to) => page.evaluate(({ from, to }) => { const t = window.__t, P = window.__app.player; P.spawn(from[0], from[1], 0); t.frames(20); t.aim(to[0], to[1], to[2]); return t.focus(); }, { from, to });
    const fsw = await aimAt([RM.x + DSW.x - 0.3, RM.z + 1.9], [RM.x + DSW.x, DSW.y, RM.z + DSW.z]);
    check(fsw?.kind === 'playroomDisco' && fsw.verb === 'släcka', 'the wall switch is a target (disco on: släcka)', JSON.stringify(fsw));
    await page.evaluate(() => window.__app.use(window.__app.focus().focused));
    const off = await page.evaluate(() => { const r = window.__app.world.playroom, p = [...r.spots.geometry.attributes.position.array]; r.update(1, window.__app.camera, false); return { on: r.discoOn, spots: r.spots.visible, moved: r.spots.geometry.attributes.position.array.some((v, i) => v !== p[i]), lit: r.lit, badge: document.getElementById('badges').textContent }; });
    check(!off.on && !off.spots && !off.moved && /släckt/.test(off.badge), 'switch used: disco off, spots hidden and still', JSON.stringify(off));
    await page.evaluate(() => { window.__t.render(); }); await page.screenshot({ path: `${shots}/11-disco-off.png` });
    const fb = await aimAt([RM.x, RM.z + 0.9], [RM.x + BL.x, BL.y, RM.z + BL.z]);
    check(fb?.kind === 'playroomDisco' && fb.verb === 'tända', 'the ball itself is a target (disco off: tända)', JSON.stringify(fb));
    await page.evaluate(() => window.__app.use(window.__app.focus().focused));
    const on = await page.evaluate(() => { const r = window.__app.world.playroom, p = [...r.spots.geometry.attributes.position.array]; r.update(1, window.__app.camera, false); return { on: r.discoOn, spots: r.spots.visible, moved: r.spots.geometry.attributes.position.array.some((v, i) => v !== p[i]) }; });
    check(on.on && on.spots && on.moved, 'used again: disco on, spots sweep', JSON.stringify(on));
    const lit = await page.evaluate(() => { const o = window.__app; return o.world.playroom.object.children.filter((c) => c.isLight).length; });
    check(lit === 0, 'no extra lights in the room');
    const views = { 7: [[2.9, 2.3], [-1.8, -1.3]], 8: [[-2.9, 2.3], [2.6, 0.5]], 9: [[2.9, -2.3], [-2.5, -1.3]] };
    for (const [n, [from, to]] of Object.entries(views)) {
      await page.evaluate(({ RM, from, to }) => { const t = window.__t, P = window.__app.player; P.spawn(RM.x + from[0], RM.z + from[1], 0); t.frames(20); t.aim(RM.x + to[0], 1.1, RM.z + to[1]); window.__app.world.playroom.disco(0.4); t.render(); }, { RM, from, to });
      await page.screenshot({ path: `${shots}/${n}-view.png` });
    }
    await page.evaluate(({ RM }) => { const t = window.__t, P = window.__app.player; P.spawn(RM.x, RM.z + 1.9, 0); t.frames(20); t.aim(RM.x, 2.2, RM.z - 1.5); window.__app.world.playroom.disco(0.4); t.render(); }, { RM });
    await page.screenshot({ path: `${shots}/10-disco.png` });
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
    check(inside.calls <= 15, 'inside, only the room is drawn: few draw calls', `outside ${before.calls}, inside ${inside.calls}`);
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
