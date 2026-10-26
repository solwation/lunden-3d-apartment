// #1355: the shared children's-room billiard table with two (then three) real clients through a local Worker.
//   node cloudflare/dev.mjs 8782 &  python3 tools/devserve.py 8781 . &
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/billiardpeer node tools/billiardpeertest.cjs http://localhost:8781 http://localhost:8782
// Client A is the whole app (real entry through the door, real E/use on the table and the board); client B and later C are
// component pages with the real Billiards + Ghosts classes wired as main.js wires them. Checks: same balls / turn / mode on every
// client, a refused foreign stroke, simultaneous strokes make one game, a late client gets the existing table.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const [game = 'http://localhost:8781', worker = 'http://localhost:8782'] = process.argv.slice(2), shots = process.env.SHOTS || '/tmp/billiardpeer';
let failed = 0; const check = (ok, name, data = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(data)}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const COMPONENT = async (page, at, name, look = [0, 0.58, 0]) => { // a light client: real Billiards + Ghosts, wired like main.js
  await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '//' }));
  await page.goto(game);
  await page.evaluate(async ({ worker, at, name, look }) => {
    const hide = document.createElement('style'); hide.textContent = 'body>*:not(canvas){display:none!important}'; document.head.append(hide); // only our renderer in the screenshot
    const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Billiards } = await import('/src/billiards.js'), S = await import('/src/billiardsync.js'), C = await import('/src/config.js');
    const R = C.PLAYROOM, scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1.5, 0.05, 50);
    scene.background = new T.Color(0x20252b); scene.add(new T.HemisphereLight(0xffffff, 0x445566, 2.2), new T.AmbientLight(0xffffff, 1));
    const b = new Billiards(); b.active = true; scene.add(b.object);
    const ox = R.x + R.billiards.x, oz = R.z + R.billiards.z; camera.position.set(ox + at[0], 1.35, oz + at[1]); camera.lookAt(ox + look[0], look[1], oz + look[2]);
    const g = new Ghosts({ scene, camera, url: worker, name: () => name, state: () => ({ p: [camera.position.x, 0, camera.position.z], r: camera.rotation.y }), score: () => 0, weapon: () => '', active: () => true });
    b.net = { ready: () => g.connected, send: (m) => g.pool(m), id: () => g.me }; g.onPool = (m) => { (window.__strokes ??= []).push(m); b.onNet(m); };
    b.peers = () => g.others.values(); // #1637: the others' cues, wired like main.js
    b.events = []; b.onEvent = (t) => b.events.push(t);
    const renderer = new T.WebGLRenderer({ antialias: false }); renderer.setSize(720, 480); document.body.prepend(renderer.domElement); renderer.domElement.style.cssText = 'position:fixed;left:0;top:0;z-index:9';
    let last = performance.now();
    setInterval(() => { const t = performance.now(), dt = (t - last) / 1000; last = t; g.update(); b.update(Math.min(dt, 0.1), camera, window.__aimed ?? true); renderer.render(scene, camera); }, 33);
    window.__c = { b, g, camera, table: () => JSON.stringify(S.snapshotTable(b.physics, b.rules, b.seq)), S };
  }, { worker, at, name, look });
};
const state = (page) => page.evaluate(() => window.__c.table());
const until = async (f, n = 150) => { for (let i = 0; i < n; i++) { if (await f()) return true; await sleep(200); } return false; };

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args });
  try {
    // --- client A: the whole app, in the children's room at the west end of the table
    const A = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage(); const errors = [];
    A.on('pageerror', (e) => errors.push(e.message));
    await A.addInitScript(() => { localStorage.setItem('lunden.name', 'Anna'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await A.goto(`${game}/?shot&quality=3&time=12&month=6&freeze&cloud=${encodeURIComponent(worker)}`, { waitUntil: 'commit' });
    await A.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 600000 });
    await A.evaluate(async () => {
      const a = window.__app, C = await import('/src/config.js'); a.showOverlay(false); if (a.rest.active) a.standUp(); a.renderer.setAnimationLoop(null);
      a.avatarCustomizer.setLook({ ...C.decodeAvatarLook('241302112', 'me'), height: 140 }); // small enough for the children's room
      window.__bt = { aim: (x, y, z) => { const d = new a.camera.position.constructor(x, y, z).sub(a.camera.position); a.camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); },
        focus: () => { a.touch.enabled = true; a.step(0); a.step(0); a.touch.enabled = false; return a.focus().focused?.kind; }, render: () => { a.step(0); a.renderer.render(a.scene, a.camera); } };
      a.player.spawn(-28.85, 22.7, Math.PI); for (let i = 0; i < 60; i++) a.player.update(1 / 60); window.__bt.aim(-28.85, .6, 23.6); window.__bt.focus(); a.use(a.focus().focused); // through the real door
      const render = a.renderer.render; window.__render = render; a.renderer.render = () => {}; // no frames while waiting; the table itself still updates
      setInterval(() => { a.step(0.05); window.__ghosts.update(0.05); }, 50); // (ghosts.update runs in main.js's frame(), not step())
    });
    await sleep(1500);
    const standA = () => A.evaluate(() => { const a = window.__app, r = a.world.playroom, c = r.billiards.c, o = r.billiards.object.position; a.player.spawn(o.x, o.z + c.length / 2 + .65, 0); window.__bt.aim(o.x, c.height, o.z); });
    await standA();
    const bA = () => A.evaluate(() => { const b = window.__app.world.playroom.billiards; return { seq: b.seq, ready: b.netReady(), inside: window.__app.world.playroom.inside, mode: b.rules.mode, turn: b.rules.turn, moving: b.physics.moving || b.inShot, events: window.__ev ?? [] }; });
    check(await until(async () => (await bA()).ready && (await bA()).seq > 0), 'A: connected, in the children\'s room, got the table from the room', await bA());
    await A.evaluate(() => { const b = window.__app.world.playroom.billiards; window.__ev = []; const f = b.onEvent; b.onEvent = (t) => { window.__ev.push(t); f?.(t); }; window.__tbl = async () => JSON.stringify((await import('/src/billiardsync.js')).snapshotTable(b.physics, b.rules, b.seq)); });

    // --- client B: component page at the north short end
    const B = await (await browser.newContext({ viewport: { width: 760, height: 500 } })).newPage(); B.on('pageerror', (e) => errors.push(e.message));
    await COMPONENT(B, [0, -1.45], 'Bertil');
    const lookAtBoard = () => B.evaluate(() => { const c = window.__c.camera, b = window.__c.b, p = b.controlPickables[0].getWorldPosition(c.position.clone()); c.position.set(p.x + .95, 1.25, p.z); c.lookAt(p); });
    check(await until(() => B.evaluate(() => window.__c.b.seq > 0)), 'B: joined the existing table');
    const same = async (list, label, minQ = 0) => { const ok = await until(async () => { const s = await Promise.all(list.map((p) => p === A ? A.evaluate(() => window.__tbl()) : state(p))); return s.every((x) => x === s[0]) && JSON.parse(s[0]).q >= minQ && !(await Promise.all(list.map((p) => p === A ? bA().then((v) => v.moving) : p.evaluate(() => window.__c.b.physics.moving || window.__c.b.inShot)))).some(Boolean); }, 100);
      const s = await Promise.all(list.map((p) => p === A ? A.evaluate(() => window.__tbl()) : state(p))); check(ok, label, { q: JSON.parse(s[0]).q, mode: JSON.parse(s[0]).m, turn: JSON.parse(s[0]).t, msg: JSON.parse(s[0]).s }); return JSON.parse(s[0]); };
    await same([A, B], 'A and B show the same table when B arrives');

    // B switches to 8-ball on the board: everyone gets a new rack in that mode
    const t = await B.evaluate(() => window.__c.b.toggleMode());
    const s1 = await same([A, B], 'B switches the mode: A and B both in 8-ball with a new rack', 2); check(s1.m === 'eight' && t === '', 'shared mode switch answered by the room, not locally', { t, m: s1.m });

    // A strokes through the real use() on the table; both animate and end on the same state
    await standA(); await A.evaluate(() => { const b = window.__app.world.playroom.billiards, o = b.object.position; window.__bt.aim(o.x, b.c.height, o.z); window.__bt.focus(); const f = window.__app.focus().focused; window.__app.use(f); b.charge.t = b.c.chargeSeconds; window.__app.use(f); }); // (#1637: E charges, E strikes; full power as before)
    const started = await until(() => B.evaluate(() => window.__c.b.inShot || window.__c.b.seq > 2), 30);
    check(started, 'B sees A\'s stroke start');
    const s2 = await same([A, B], 'after A\'s stroke both clients rest in the same state (balls, turn, verdict)', 3);
    const worldBalls = await Promise.all([A.evaluate(async()=>{const T=await import('three'),b=window.__app.world.playroom.billiards,m=new T.Matrix4();b.object.updateMatrixWorld(true);b.mesh.getMatrixAt(0,m);return new T.Vector3().setFromMatrixPosition(m).applyMatrix4(b.object.matrixWorld).toArray();}),B.evaluate(async()=>{const T=await import('three'),b=window.__c.b,m=new T.Matrix4();b.object.updateMatrixWorld(true);b.mesh.getMatrixAt(0,m);return new T.Vector3().setFromMatrixPosition(m).applyMatrix4(b.object.matrixWorld).toArray();})]);
    check(worldBalls[0].every((v,i)=>Math.abs(v-worldBalls[1][i])<.005),'both clients render the shared cue ball at the same rotated world position',worldBalls);
    const drift = await Promise.all([A.evaluate(() => window.__app.world.playroom.billiards.drift), B.evaluate(() => window.__c.b.drift)]);
    check(drift.every((d) => d >= 0 && d < 5), 'each client\'s own fixed-step animation ended within 5 mm of the room\'s authoritative result', drift);
    check(s2.q === s1.q + 1 && s2.q === 3 && s2.p.some((v, i) => v !== s1.p[i]), 'the stroke moved the balls and advanced the table sequence once', { q: s2.q });

    // foreign stroke: whoever does not hold the turn is refused (8-ball)
    const turn = s2.t, holderIsA = turn === 0; // A took seat 1 with the first stroke
    const loser = holderIsA ? 'B' : 'A';
    if (holderIsA) { // A keeps the turn: B must be refused
      await B.evaluate(() => { window.__c.b.events.length = 0; window.__c.b.shoot(window.__c.camera); });
      check(await until(() => B.evaluate(() => window.__c.b.events.includes('Det är inte din tur')), 30), 'B shooting out of turn is refused by the room with a message', await B.evaluate(() => window.__c.b.events));
      check((await state(B)) === (await A.evaluate(() => window.__tbl())), 'a refused stroke changes nobody\'s table');
    } else check(true, `turn passed to Spelare 2 (${loser} is the next shooter): foreign refusal covered by the Worker tests`);

    // simultaneous strokes: only one is played, both clients agree
    await sleep(500);
    const q0 = JSON.parse(await state(B)).q;
    const modeA = await A.evaluate(() => window.__app.world.playroom.billiards.rules.mode);
    await B.evaluate(() => window.__c.b.toggleMode()); await A.evaluate(() => window.__app.world.playroom.billiards.toggleMode()); // both press at once (same q)
    await sleep(1500);
    const s3 = await same([A, B], 'two (nearly) simultaneous board presses leave ONE game, identical on both clients', q0 + 1);
    check(s3.q <= q0 + 2, 'no more than the two requests were applied (a request on a stale q is refused; the Worker tests race exactly the same q)', { q0, q: s3.q });
    await A.evaluate(() => { const a = window.__app, r = a.renderer.render; a.renderer.render = window.__render; window.__bt.render(); a.renderer.render = () => {}; });
    await A.screenshot({ path: `${shots}/A-app.png` }); await B.screenshot({ path: `${shots}/B-table.png` }); await lookAtBoard(); await sleep(500); await B.screenshot({ path: `${shots}/B-board.png` });

    // --- #1637: B sees A's cue while A aims and charges, and A's charged stroke; a short vs a long charge = a weak vs a hard stroke
    if (s3.m !== 'free') { await B.evaluate(() => window.__c.b.toggleMode()); await same([A, B], 'back to free play for the power checks', s3.q + 1); }
    await sleep(700);
    await B.evaluate(() => { window.__aimed = false; const c = window.__c.camera, o = window.__c.b.object.position; c.position.set(o.x + 1.6, 1.45, o.z - .9); c.lookAt(o.x, .72, o.z + .4); });
    const aimA = () => A.evaluate(() => { const a = window.__app, b = a.world.playroom.billiards, o = b.object.position; a.player.spawn(o.x - .35, o.z + b.c.length / 2 + .65, 0); window.__bt.aim(o.x - .1, b.c.height, o.z); a.touch.enabled = true; a.step(0); a.step(0); return a.focus().focused?.kind; });
    check((await aimA()) === 'playroomBilliards', 'A aims at the table (touch-enabled focus)');
    const remote = () => B.evaluate(async () => { const T = await import('three'), b = window.__c.b, m = b.remoteCues.find((q) => q.visible), ball = b.physics.balls[0];
      if (!m) return { visible: false, count: b.remoteCues.filter((q) => q.visible).length };
      const back = new T.Vector3(m.position.x - ball.x, 0, m.position.z - ball.z), dist = back.length(); back.normalize();
      return { visible: true, count: b.remoteCues.filter((q) => q.visible).length, dir: [-back.x, -back.z], dist, pull: m.userData.pull, cue: [...(window.__c.g.others.values())].map((g) => g.cue).find(Boolean) }; });
    check(await until(async () => (await remote()).visible, 30), 'B draws A\'s cue at the cue ball while A only aims', await remote());
    const aimDir = await A.evaluate(() => window.__app.world.playroom.billiards.cueState);
    await until(async () => { const r = await remote(); return r.visible && r.dir[0] * aimDir[0] + r.dir[1] * aimDir[1] > .995; }, 20); // (the 5 Hz state catches up with the new aim)
    let r1 = await remote(); check(r1.count === 1 && r1.dir[0] * aimDir[0] + r1.dir[1] * aimDir[1] > .995 && r1.pull < .01, 'B\'s copy points the way A aims (table-local), not drawn back', { r1, aimDir });
    await A.evaluate(() => { const a = window.__app; a.use(a.focus().focused); }); // A starts charging
    await sleep(1300);
    const chargeA = await A.evaluate(() => { const b = window.__app.world.playroom.billiards; return { power: b.chargePower, label: document.getElementById('action')?.textContent, meter: !document.getElementById('cue-power').hidden }; });
    const r2 = await remote();
    check(chargeA.power > .5 && chargeA.meter && /^Stöt \d+ %$/.test(chargeA.label) && r2.visible && r2.pull > .04 && r2.dist > r1.dist + .04, 'A charging (touch label + meter): B sees A\'s cue drawn back', { chargeA, r2 });
    await B.screenshot({ path: `${shots}/B-sees-A-charge.png` });
    await A.evaluate(() => { const a = window.__app; a.renderer.render = window.__render; window.__bt.render(); a.renderer.render = () => {}; }); await A.screenshot({ path: `${shots}/A-charge-touch.png` });
    const drawCalls = await B.evaluate(() => { const b = window.__c.b; return { remoteMeshes: b.remoteCues.length, sharedGeometry: b.remoteCues.every((m) => m.geometry === b.cue.geometry && m.material === b.cue.material) }; });
    check(drawCalls.remoteMeshes === 1 && drawCalls.sharedGeometry, 'one extra cue mesh (one draw) per remote aimer, sharing the cue geometry + material', drawCalls);
    await B.evaluate(() => { window.__strokes = []; });
    const powerA = await A.evaluate(() => { const a = window.__app, b = a.world.playroom.billiards, w = Math.round(b.chargePower * 100) / 100; a.use(a.focus().focused); return w; });
    check(await until(() => B.evaluate(() => window.__c.b.strokeT > 0 && window.__c.b.strokePull > 0), 30), 'B animates A\'s charged stroke with A\'s cue', await B.evaluate(() => ({ strokeT: window.__c.b.strokeT, pull: window.__c.b.strokePull })));
    await sleep(60); await B.screenshot({ path: `${shots}/B-sees-A-stroke.png` });
    const sMsg = await B.evaluate(() => window.__strokes.find((m) => m.k === 'S'));
    check(sMsg && Math.abs(sMsg.w - powerA) < .011, 'the stroke reaches B with A\'s power', { sent: powerA, got: sMsg?.w });
    check(await until(async () => !(await remote()).visible, 20), 'B hides A\'s aiming cue while the balls roll');
    const s4 = await same([A, B], 'after A\'s charged stroke both clients rest in the same state', s3.q + 1);
    const strokeWith = async (wait) => { // new rack, then E, wait, E from A; what B saw of it
      const q0 = JSON.parse(await state(B)).q;
      await until(async () => { if (JSON.parse(await state(B)).q > q0) return true; await B.evaluate(() => window.__c.b.requestRack()); await sleep(800); return JSON.parse(await state(B)).q > q0; }, 10); // (refused while the room still counts the last stroke as rolling)
      const start = await same([A, B], 'new rack before a power stroke', q0 + 1);
      await aimA(); await B.evaluate(() => { window.__strokes = []; });
      await A.evaluate(() => { const a = window.__app; a.use(a.focus().focused); }); if (wait) await sleep(wait);
      await A.evaluate(() => { const a = window.__app; a.use(a.focus().focused); });
      const end = await same([A, B], `after a ${wait ? 'long' : 'short'} charge both clients agree`, start.q + 1);
      const m = await B.evaluate(() => window.__strokes.find((q) => q.k === 'S'));
      return { w: m?.w, ms: m?.ms, cue: Math.hypot(end.p[0] - start.p[0], end.p[1] - start.p[1]), moved: end.p.filter((v, i) => v !== start.p[i]).length };
    };
    const weak = await strokeWith(0), hard = await strokeWith(2200);
    check(weak.w === 0.15 && hard.w === 1 && weak.ms < hard.ms && weak.moved < hard.moved, 'a short charge = a weak stroke (15 %), a long one = full power: shorter roll, fewer balls moved', { weak, hard });

    // --- a late client C and a reconnect: the existing table, not a new rack
    await B.evaluate(() => window.__c.g.disconnect()); await B.close();
    const C2 = await (await browser.newContext({ viewport: { width: 760, height: 500 } })).newPage(); C2.on('pageerror', (e) => errors.push(e.message)); await COMPONENT(C2, [0, 1.3], 'Cecilia');
    check(await until(() => C2.evaluate(() => window.__c.b.seq > 0)), 'C: a late visitor gets a table');
    await same([A, C2], 'C (late / reconnecting) sees the same table as A');
    await C2.screenshot({ path: `${shots}/C-late.png` });
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
