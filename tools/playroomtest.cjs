// Room lifecycle: all avatar heights can enter (#1489), including the former160cm
// boundary and tallest200cm look. Room navigation/cinema/disco remain covered here;
// shared computer apps use tools/computermediatest.cjs.
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
    const page = await browser.newPage(process.env.MOBILE ? {viewport:{width:844,height:390},isMobile:true,hasTouch:true} : { viewport: { width: 900, height: 600 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('lunden.name', 'Barn'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await page.goto(`${game}/?shot&cloud=&mp=0&quality=3&time=12&month=6&freeze`, { waitUntil: 'commit' });
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

    // The playhouse door is a target for tall avatars too.
    await setHeight(175);
    const f1 = await toDoor();
    check(f1?.kind === 'playhouse' && f1.verb === 'gå in i', 'the playhouse door is a target', JSON.stringify(f1));
    const before = await page.evaluate(() => window.__t.calls());
    await page.evaluate(() => { window.__t.render(); }); await page.screenshot({ path: `${shots}/1-outside.png` });
    await page.evaluate(() => window.__app.use(window.__app.focus().focused));
    await page.waitForTimeout(700);
    const s1 = await page.evaluate(() => window.__t.state());
    check(s1.inRoom && s1.roomVisible, '175 cm: admitted without a height gate', JSON.stringify(s1));
    await page.evaluate(() => window.__app.use(window.__app.world.playroom.exitTarget));
    await page.waitForTimeout(900);
    for (const cm of [140,160,200]) {
      await setHeight(cm); await toDoor();
      await page.evaluate(() => window.__app.use(window.__app.focus().focused));
      await page.waitForTimeout(900);
      const state = await page.evaluate(() => { window.__t.frames(30); return window.__t.state(); });
      check(state.inRoom && state.roomVisible, `${cm} cm: admitted through the playhouse door`, JSON.stringify(state));
      await page.evaluate(() => window.__app.use(window.__app.world.playroom.exitTarget));
      await page.waitForTimeout(900);
      check(!(await page.evaluate(() => window.__t.state())).inRoom, `${cm} cm: the actual exit leads back out`);
    }

    // A shorter avatar still has the same room lifecycle.
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
    // #1375: walk from the BIO doorway into the cinema's open center aisle and round the back row.
    const RM = await page.evaluate(async () => { const C = await import('/src/config.js'); return C.PLAYROOM; });
    const L = (lx, lz) => ({ x: RM.x + lx, z: RM.z + lz });
    const walkTo = (from, yaw, secs) => page.evaluate(({ from, yaw, secs }) => { const P = window.__app.player, cam = window.__app.camera; P.spawn(from.x, from.z, 0); window.__t.frames(10); cam.rotation.y = yaw; P.keys = new Set(['KeyW']); window.__t.frames(secs * 60); P.keys = new Set(); return { x: P.pos.x, z: P.pos.z }; }, { from, yaw, secs });
    const cinema = RM.furniture.cinema, seat = cinema.seat;
    const aisleWalk = await walkTo(L(-5.6, 1.35), 0, 1.55); // north from the BIO doorway into the center aisle
    check(Math.abs(aisleWalk.z - (RM.z + (cinema.seat.z[1] + cinema.seat.z[2]) / 2)) < 0.5, 'walk from the BIO doorway to the open center aisle', `z=${(aisleWalk.z - RM.z).toFixed(2)}`);
    const behindWalk = await walkTo(L(-4.15, (cinema.seat.z[1] + cinema.seat.z[2]) / 2), -Math.PI / 2, 1.8);
    check(behindWalk.x > RM.x - 4.72 + seat.depth / 2 + 0.3, 'the route remains open behind the rear seat row', `lx=${(behindWalk.x - RM.x).toFixed(2)}`);
    const deskWalk = await walkTo(L(6,-.3), -Math.PI / 2, 3); // east into the stool / desk
    check(deskWalk.x < RM.x+8.6, 'the computer chair and desk hold', `lx=${(deskWalk.x - RM.x).toFixed(2)}`);
    const clash = await page.evaluate(({ RM }) => { const r = window.__app.world.playroom, b = RM.billiards, hx = b.length / 2 + b.rail + 0.05, hz = b.width / 2 + b.rail + 0.05; // the table's footprint (+ 5 cm), no furniture footprint touches it
      return r.footprints.filter((q) => { const xs = q.map((p) => p[0] - RM.x - b.x), zs = q.map((p) => p[1] - RM.z - b.z); return Math.min(...xs) < hx && Math.max(...xs) > -hx && Math.min(...zs) < hz && Math.max(...zs) > -hz; }).length; }, { RM });
    check(clash === 0, 'cinema screen and seats stay clear of the billiard table', `overlaps ${clash}`);
    check(cinema.seat.z[2] - cinema.seat.z[1] - seat.width > 0.75, 'the center aisle has a clear walking width', `${(cinema.seat.z[2] - cinema.seat.z[1] - seat.width).toFixed(2)} m`);
    check(cinema.seat.rowX[1] - cinema.seat.rowX[0] > seat.depth + 0.9, 'there is standing and walking space between seat rows');
    if (!process.env.MOBILE) {
      await page.evaluate(() => document.getElementById('game-canvas').requestPointerLock());
      await page.waitForFunction(() => document.pointerLockElement?.id === 'game-canvas');
    }
    const nativeUse = async () => {
      if (process.env.MOBILE) {
        await page.evaluate(() => { __app.touch.enabled = true; document.body.classList.add('touch'); __app.showOverlay(false); __app.step(0); });
        await page.locator('#action').tap();
      } else await page.keyboard.press('KeyE');
    };
    const nativeStand = async () => {
      if (process.env.MOBILE) {
        await page.evaluate(() => __app.step(0));
        if (await page.locator('#stand-btn').isVisible()) await page.locator('#stand-btn').tap();
        else {
          const action = page.locator('#action');
          check(await action.isVisible() && await action.textContent() === 'Res dig', 'touch action offers a safe stand-up');
          await action.tap();
        }
      }
      else await page.keyboard.press('KeyC');
    };
    // User clarification #1496: front-row cropping is intentional; rear seats retain full-screen checks.
    // Sit in all eight individually selectable seats, face the screen, then stand safely from each one.
    const seatCases = [[0, 0, 'front outer'], [0, 1, 'front aisle'], [0, 2, 'front aisle'], [0, 3, 'front outer'], [1, 0, 'rear outer'], [1, 1, 'rear aisle'], [1, 2, 'rear aisle'], [1, 3, 'rear outer']];
    for (const [row, i, name] of seatCases) {
      const x = cinema.seat.rowX[row], z = cinema.seat.z[i], seatName = `biostol ${row * cinema.seat.z.length + i + 1}`;
      const f = await page.evaluate(async ({ x, z, seatName }) => { const { PLAYROOM: RM } = await import('/src/config.js'), t = window.__t, P = window.__app.player; P.spawn(RM.x + x + 0.78, RM.z + z, 0); t.frames(10); t.aim(RM.x + x, 0.48, RM.z + z); return t.focus(); }, { x, z, seatName });
      check(f?.kind === 'rest' && f.name === seatName, `E/touch focus reaches ${name} seat`, JSON.stringify(f));
      await nativeUse(); await page.waitForTimeout(300);
      const sat = await page.evaluate(async ({ x, z }) => { const { PLAYROOM: RM } = await import('/src/config.js'), { Vector3 } = await import('three'), a = window.__app; for (let i = 0; i < 12; i++) a.rest.update(0.1); window.__t.render(); const yaw = a.camera.rotation.y, expected = Math.atan2(-(RM.furniture.cinema.screen.x - x), -(RM.furniture.cinema.screen.z - z)); let d = Math.atan2(Math.sin(yaw - expected), Math.cos(yaw - expected)); const s = RM.furniture.cinema.screen, tx = RM.furniture.tv.x + 0.08, corners = [[s.z-s.w/2,s.bottom],[s.z+s.w/2,s.bottom],[s.z-s.w/2,s.bottom+s.h],[s.z+s.w/2,s.bottom+s.h]].map(([zz, yy]) => new Vector3(RM.x+tx, yy, RM.z+zz).project(a.camera)); return { active: a.rest.active, kind: a.rest.kind, x: a.camera.position.x, y: a.camera.position.y, yaw, viewError: d, screenInView: corners.every((p) => Math.abs(p.x)<1 && Math.abs(p.y)<1 && p.z>-1 && p.z<1) }; }, { x, z });
      check(sat.active && sat.kind === 'sit' && sat.y > 0.8 && sat.y < 1.3 && Math.abs(sat.viewError) < 0.2 && (row === 0 || sat.screenInView), `${name} seat faces the screen${row === 0 ? ' (front-row cropping is intentional)' : ' with the full screen in view'}`, JSON.stringify(sat));
      if (row === 0 && i === 1) await page.screenshot({ path: `${shots}/6-front-seat.png` });
      if (row === 1 && i === 2) await page.screenshot({ path: `${shots}/7-rear-seat.png` });
      if ((row === 0 && i === 0) || (row === 1 && i === 3)) await nativeStand();
      else await page.evaluate(() => window.__app.standUp());
      await page.waitForTimeout(300);
      const up = await page.evaluate(() => { const a = window.__app, P = a.player; return { active: a.rest.active, free: P.isFree(P.pos.x, P.pos.z), inRoom: P.inPlayroom }; });
      check(!up.active && up.free && up.inRoom, `${name} seat has a safe standing spot`, JSON.stringify(up));
    }
    await setHeight(140);
    for (const [row, i] of [[0, 0], [1, 3]]) {
      const x = cinema.seat.rowX[row], z = cinema.seat.z[i];
      const focus = await page.evaluate(async ({ x, z, row, i }) => { const { PLAYROOM: RM } = await import('/src/config.js'), P = window.__app.player; P.spawn(RM.x + x + 0.78, RM.z + z, 0); window.__t.frames(10); window.__t.aim(RM.x + x, 0.48, RM.z + z); const f = window.__t.focus(); return { f, expected: `biostol ${row * RM.furniture.cinema.seat.z.length + i + 1}` }; }, { x, z, row, i });
      check(focus.f?.kind === 'rest' && focus.f.name === focus.expected, `140 cm avatar focuses the ${row ? 'rear' : 'front'} seat`, JSON.stringify(focus));
      await nativeUse(); await page.waitForTimeout(300);
      const view = await page.evaluate(async () => { const { PLAYROOM: RM } = await import('/src/config.js'), { Vector3 } = await import('three'), a = window.__app, s = RM.furniture.cinema.screen, tx = RM.furniture.tv.x + 0.08; for (let i=0;i<12;i++) a.rest.update(.1); a.camera.updateMatrixWorld(true); const p = [[s.z-s.w/2,s.bottom],[s.z+s.w/2,s.bottom],[s.z-s.w/2,s.bottom+s.h],[s.z+s.w/2,s.bottom+s.h]].map(([z,y])=>new Vector3(RM.x+tx,y,RM.z+z).project(a.camera)); return { active: a.rest.active, kind: a.rest.kind, visible: p.every(v=>Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z>-1&&v.z<1), camera: [a.camera.position.x,a.camera.position.y,a.camera.position.z,a.camera.rotation.x,a.camera.rotation.y], corners:p.map(v=>[v.x,v.y,v.z]) }; });
      check(view.visible, `140 cm avatar sees the whole ${row ? 'rear' : 'front'} row screen in landscape`, JSON.stringify(view));
      await page.evaluate(() => window.__app.standUp());
    }
    await setHeight(159);
    // Computer chair/screen and app controls: tools/computermediatest.cjs (#1488).
    // the disco ball: one spot mesh, all spots inside the room, and they move
    const d1 = await page.evaluate(() => { const r = window.__app.world.playroom, p = [...r.spots.geometry.attributes.position.array]; r.disco(1.3); return { a: p, b: [...r.spots.geometry.attributes.position.array], bounds: r.bounds, n: r.rays.length }; });
    const inb = d1.b.every((v, i) => i % 3 === 1 ? v > -0.2 && v < RM.ceiling + 0.2 : true) && d1.b.filter((_, i) => i % 3 === 0).every((v) => v > d1.bounds.x0 - 0.2 && v < d1.bounds.x1 + 0.2) && d1.b.filter((_, i) => i % 3 === 2).every((v) => v > d1.bounds.z0 - 0.2 && v < d1.bounds.z1 + 0.2);
    check(inb && d1.b.some((v, i) => Math.abs(v - d1.a[i]) > 0.3), `the ${d1.n} disco spots lie on the room's surfaces and sweep`, '');
    // #1365: the disco light switches off and on, from the wall switch and from the ball itself
    const DSW = RM.furniture.discoSwitch, BL = RM.furniture.ball;
    const aimAt = (from, to) => page.evaluate(({ from, to }) => { const t = window.__t, P = window.__app.player; P.spawn(from[0], from[1], 0); t.frames(20); t.aim(to[0], to[1], to[2]); return t.focus(); }, { from, to });
    const fsw = await aimAt([RM.x + DSW.x - 0.3, RM.z + DSW.z-.7], [RM.x + DSW.x, DSW.y, RM.z + DSW.z]);
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
    // #1365: actual native keyboard E / mobile action button, not direct device calls.
    const deviceUse = nativeUse;

    const cinemaSeat = { x: cinema.seat.rowX[1], z: cinema.seat.z[0] };
    await aimAt([RM.x+cinemaSeat.x+0.78,RM.z+cinemaSeat.z], [RM.x+cinemaSeat.x,.48,RM.z+cinemaSeat.z]);
    await deviceUse();
    const screenFocus = await page.evaluate(async ({RM}) => { const a=__app,F=RM.furniture; for(let i=0;i<12;i++)a.rest.update(.1); const sc=F.cinema.screen; __t.aim(RM.x+sc.x+.08,sc.bottom+sc.h/2,RM.z+sc.z); return { seated:a.rest.active, focus:__t.focus() }; }, {RM});
    check(screenFocus.seated && screenFocus.focus?.name === 'bioduken' && screenFocus.focus?.verb === 'välja film på', 'cinema screen can be selected from a real seat', JSON.stringify(screenFocus));
    await deviceUse(); check(await page.locator('#cinema-player').evaluate(el => el.open), 'native E/touch opens film choice while seated');
    await page.evaluate(() => __t.render()); await page.screenshot({ path: `${shots}/15-cinema-screen.png` });
    await page.locator('#cinema-player [data-cinema=close]').click();
    check(!await page.locator('#cinema-player').evaluate(el => el.open), 'cinema back button closes the player and restores room controls');
    await page.evaluate(() => __app.standUp());
    await page.evaluate(() => { window.deviceSwitches = []; __app.world.playroom.onSwitch = (name, on) => deviceSwitches.push([name, on]); });
    const tvFocus = await aimAt([RM.x-RM.w/2+1,RM.z+cinema.screen.z], [RM.x+RM.furniture.tv.x+.08,RM.furniture.tv.y+RM.furniture.tv.h/2,RM.z+cinema.screen.z]);
    check(tvFocus?.name === 'bioduken' && tvFocus.verb === 'välja film på', 'screen itself opens film discovery', JSON.stringify(tvFocus));
    await deviceUse();
    check(await page.locator('#cinema-player').evaluate(el => el.open), 'native E/touch opens cinema by the screen');
    await page.locator('#cinema-player [data-cinema=close]').click();
    // Shared computers replace the local timing game; covered with a real Worker
    // and two actual apps in computermediatest.cjs. This offline room test retains cinema/disco/exit.
    const cost = await page.evaluate(() => {const d=__app.world.playroom.devices,screens=[d.tv,...d.computers];for(const s of screens)s.mesh.frustumCulled=false;const shown=__t.calls();d.object.visible=false;const hidden=__t.calls();d.object.visible=true;for(const s of screens)s.mesh.frustumCulled=true;return{calls:shown.calls-hidden.calls,tris:shown.tris-hidden.tris};});
    check(cost.calls===5&&cost.tris===10,'cinema and four monitors submit five planes',JSON.stringify(cost));
    await aimAt([RM.x-RM.w/2+1,RM.z+cinema.screen.z], [RM.x+RM.furniture.tv.x+.08,RM.furniture.tv.y+RM.furniture.tv.h/2,RM.z+cinema.screen.z]);
    if (!process.env.MOBILE) { await page.evaluate(() => document.exitPointerLock()); await page.waitForFunction(() => !document.pointerLockElement); await page.evaluate(() => __app.showOverlay(false)); }
    const lit = await page.evaluate(() => { const o = window.__app; return o.world.playroom.object.children.filter((c) => c.isLight).length; });
    check(lit === 0, 'no extra lights in the room');
    const views = { 7: [[0,4.4],[0,1.6]], 8: [[5,0.5],[8.5,0.6]], 9: [[-6,1.25],[-5.9,-1.8]], 16: [[-5.6,-1.6],[-8.3,-1.65]], 17: [[-4.72,-0.8],[-8.3,-1.65]] };
    for (const [n, [from, to]] of Object.entries(views)) {
      await page.evaluate(({ RM, from, to }) => { const t = window.__t, P = window.__app.player; P.spawn(RM.x + from[0], RM.z + from[1], 0); t.frames(20); t.aim(RM.x + to[0], to[2] ?? 1.7, RM.z + to[1]); window.__app.world.playroom.disco(0.4); t.render(); }, { RM, from, to });
      await page.screenshot({ path: `${shots}/${n}-view.png` });
    }
    await page.evaluate(({ RM }) => { const t = window.__t, P = window.__app.player; P.spawn(RM.x, RM.z + 1.9, 0); t.frames(20); t.aim(RM.x, 2.2, RM.z - 1.5); window.__app.world.playroom.disco(0.4); t.render(); }, { RM });
    await page.screenshot({ path: `${shots}/10-disco.png` });
    // #1374: the three real doorway routes and a complete unobstructed walk around the centred table.
    for(const x of [-2*RM.clubhouse.side,0,2*RM.clubhouse.side]){
      const p=await walkTo(L(x,RM.d/2-.8),0,2);
      check(p.z<RM.z+RM.clubhouse.front-.3,'walk through a labelled room entrance at x='+x,JSON.stringify(p));
      const back=await walkTo(p,Math.PI,2);
      check(back.z>RM.z+RM.clubhouse.front+.3,'walk back to the hall at x='+x,JSON.stringify(back));
    }
    const circle=await page.evaluate(({RM})=>{const a=__app,P=a.player,targets=[[1.5,-1],[1.5,1.1],[-1.5,1.1],[-1.5,-1]],results=[];P.spawn(RM.x-1.5,RM.z+RM.billiards.z-1,0);__t.frames(10);for(const[x,z]of targets){let d=Infinity;for(let i=0;i<300;i++){const dx=RM.x+x-P.pos.x,dz=RM.z+RM.billiards.z+z-P.pos.z;d=Math.hypot(dx,dz);if(d<.1)break;a.camera.rotation.y=Math.atan2(-dx,-dz);P.keys=new Set(['KeyW']);P.update(1/60);}P.keys=new Set();results.push(d);}return results;},{RM});
    check(circle.every(d=>d<.1),'walk all four sides of the table without sofa or partition obstruction',JSON.stringify(circle));
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
    const stopped = await page.evaluate(() => { const d = __app.world.playroom.devices;d.update(3);return !d.active&&!d.tvOn&&!__app.computerHub.open; });
    check(stopped, 'leaving closes computer controls and deactivates clubhouse devices');
    check(Math.abs(s4.yaw) < 0.01, 'facing away from the door');
    await page.evaluate(() => { window.__t.aim(-28.85, 1.0, 10); window.__t.render(); }); await page.screenshot({ path: `${shots}/5-out-again.png` });
    await setHeight(175); await toDoor();
    const after = await page.evaluate(() => window.__t.calls());
    check(before.calls === after.calls && before.tris === after.tris, 'draw calls outside unchanged after a visit', `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    check(inside.calls <= 20, 'inside, only the room is drawn: cinema plus four computer planes', `outside ${before.calls}, inside ${inside.calls}`);
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
