// #1136: the chosen avatar height in the real app against a local Worker (node cloudflare/dev.mjs PORT). The app stands
// in front of the hall mirror; a module peer (real Ghosts, no app) stands half a metre behind it, a little to the side. For 120, 165 and 195 cm
// both choose the height: the app's own look through the customizer's setLook (the eye height follows: PLAYER.eye and
// Player.settleEye), the peer's through its Ghosts.setMyLook (the 12-digit look code goes through the Worker). Checks: the
// peer's avatar in the app and our mirror image are the chosen height (skinned vertices' top), the eye height, old codes
// unchanged (scale = build × tall, head bone 1). Shots per height: mirror-<cm> (first person at the eye height towards the
// hall mirror), peer-<cm> (the peer outdoors in front of the north façade, a fixed camera 3.5 m away at 1.3 m).
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/shots-1136 node tools/avatarheighttest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8632', worker = process.argv[3] || 'http://localhost:8633';
const shots = process.env.SHOTS || '/tmp/shots-1136';
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const browsers = [await launch(), await launch()];
  try {
    const app = await browsers[0].newPage({ viewport: { width: 900, height: 600 } });
    const errors = []; app.on('pageerror', (e) => errors.push(e.message));
    await app.addInitScript(() => { localStorage.setItem('lunden.name', 'Langd'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await app.goto(`${game}/?shot&quality=3&time=12&month=6&freeze&cloud=${encodeURIComponent(worker)}`, { waitUntil: 'commit' });
    await app.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 600000 });
    const fix = await app.evaluate(() => {
      const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); a.scene.updateMatrixWorld(true);
      const m = a.reflectors().find((m) => m.name === 'nissedal'); if (!m) throw Error('hall mirror missing');
      const p = m.r.getWorldPosition(a.camera.position.clone()), n = a.camera.position.clone().set(0, 0, 1).transformDirection(m.r.matrixWorld);
      const e = p.clone().addScaledVector(n, 0.9); e.y = 1.62;
      a.player.spawn(e.x, e.z, 0); a.player.pos.y = 0; a.player.eyeY = 1.62; a.step(0);
      a.renderer.setAnimationLoop(null);
      const g = window.__ghosts;
      const top = (av) => { av.object.updateMatrixWorld(true); const v = a.camera.position.clone(), pos = av.mesh.geometry.attributes.position; let y = -1e9;
        for (let i = 0; i < pos.count; i++) { { const fp = av.mesh.geometry.attributes.facePart.getX(i); if (fp > 11.5 && !(fp < 17.5 ? av.look.hat : av.look.phones)) continue; } /* #1321, #1322: unchosen headwear / headphones are collapsed in the shader only */ av.mesh.getVertexPosition(i, v); v.applyMatrix4(av.mesh.matrixWorld); y = Math.max(y, v.y); } return y; };
      window.__fix = {
        e, p, n, top,
        tick: (mirror) => { a.camera.position.copy(e); g.update(); if (mirror) a.updateReflections(a.camera, 0, true, false); },
        run: (ms, stop = () => false, mirror = false) => new Promise((done) => {
          const t0 = performance.now(); const f = () => { window.__fix.tick(mirror); if (performance.now() - t0 < ms && !stop()) setTimeout(f, 16); else done(); }; f();
        }),
        look: (from, target, fov) => { a.camera.position.copy(from); a.camera.fov = fov; a.camera.updateProjectionMatrix(); a.camera.lookAt(target); a.camera.updateMatrixWorld(true); },
        render: (mirror) => { if (mirror) a.updateReflections(a.camera, 0, true, false); a.renderer.render(a.scene, a.camera); },
        peer: () => [...g.others.values()].find((x) => x.name === 'Langbent'),
      };
      return { e: e.toArray(), n: n.toArray(), p: p.toArray() };
    });
    // old codes: unchanged scale and eye height
    const old = await app.evaluate(async () => {
      const { Avatar } = await import('/src/avatar.js'), C = await import('/src/config.js');
      return ['2413021', '241302113'].map((code) => { const lk = C.decodeAvatarLook(code, 'old-seed'), av = new Avatar(lk), w = [0.93, 1, 1.08][lk.build];
        const r = { code, scale: av.object.scale.toArray(), want: [w, lk.tall, w], head: av.bones.head.scale.x, eye: C.avatarEyeHeight(lk), std: 1.62 }; av.dispose(); return r; });
    });
    check(old.every((o) => o.scale.every((v, i) => v === o.want[i]) && o.head === 1 && o.eye === o.std), 'old codes keep scale build × tall, head 1 and eye 1.62', JSON.stringify(old));
    await app.waitForFunction(() => { window.__fix.tick(); return window.__ghosts.connected; }, null, { timeout: 60000, polling: 100 });
    const peer = await browsers[1].newPage();
    await peer.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// module peer' }));
    await peer.goto(game);
    await peer.evaluate(async ([worker, fix]) => {
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js');
      const e = new T.Vector3(...fix.e), n = new T.Vector3(...fix.n), side = new T.Vector3(-n.z, 0, n.x), p = e.clone().addScaledVector(n, 0.5).addScaledVector(side, 0.35);
      const r = Math.atan2(n.x, n.z); // a ghost looks along (−sin r, −cos r) = −n: towards the mirror and the peer camera
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1, 0.1, 100);
      const ghosts = new Ghosts({ scene, camera, url: worker, name: () => 'Langbent', state: () => ({ p: window.peer.at, r: window.peer.r }), score: () => 0 });
      window.peer = { ghosts, at: [p.x, 0, p.z], r, home: { at: [p.x, 0, p.z], r } };
      setInterval(() => ghosts.update(), 50);
    }, [worker, fix]);
    await peer.waitForFunction(() => window.peer.ghosts.connected, null, { timeout: 60000 });
    await app.waitForFunction(() => { window.__fix.tick(); return !!window.__fix.peer(); }, null, { timeout: 30000, polling: 100 });
    for (const cm of [120, 165, 195]) {
      const code = await peer.evaluate(async (cm) => { const C = await import('/src/config.js'); const lk = { ...C.decodeAvatarLook('130410013', 'peer'), height: cm };
        window.peer.ghosts.setMyLook(lk); return C.encodeAvatarWireLook(lk); }, cm); // (#1202: the wire code, with #1175's d<build>)
      const mine = await app.evaluate(async (cm) => { const a = window.__app, C = await import('/src/config.js');
        const lk = { ...C.decodeAvatarLook('241302112', 'me'), height: cm };
        a.avatarCustomizer.setLook(lk);
        for (let i = 0; i < 60; i++) a.player.settleEye(0.1); // the real eased camera path
        // (#1202) the wire code carries tags after the 12 digits (#1175's d<build>, #1139's k<step>): compare the digits
        // exactly, and the whole code with the wire encoding of the look the ghosts hold
        const g = window.__ghosts, code = g.avatarCode;
        return { eye: C.PLAYER.eye, eyeY: a.player.eyeY, want: C.avatarProportions(cm).eye, code, digits: C.splitAvatarCode(code).av,
          wantDigits: C.encodeAvatarLook(lk), wire: C.encodeAvatarWireLook(g.myLook), height: g.myLook.height }; }, cm);
      check(Math.abs(mine.eye - mine.want) < 1e-9 && Math.abs(mine.eyeY - mine.want) < 1e-3 && mine.digits === mine.wantDigits && mine.digits.endsWith(String(cm))
        && mine.code === mine.wire && mine.height === cm, `${cm} cm: own eye height ${mine.want.toFixed(3)} m and code`, JSON.stringify(mine));
      await app.evaluate((code) => window.__fix.run(8000, () => window.__fix.peer()?.avatarCode === code), code);
      await app.evaluate(() => window.__fix.run(600));
      const got = await app.evaluate((code) => { const f = window.__fix, g = f.peer(); g.avatar.update(0, {}); const t = f.top(g.avatar);
        return { code: g.avatarCode, want: code, top: +t.toFixed(3), height: g.avatar.look.height, feet: +g.root.position.y.toFixed(3) }; }, code);
      check(got.code === got.want && Math.abs(got.top - got.feet - cm / 100) < 0.03, `${cm} cm: the peer's avatar is ${cm} cm in the app`, JSON.stringify(got));
      // first person towards the hall mirror (our image poses in the mirror pass)
      const shot1 = await app.evaluate(() => { const f = window.__fix, a = window.__app; f.e.y = a.player.eyeY; f.look(f.e, f.p.clone().setY(f.e.y - 0.1), 60); f.render(true);
        const me = window.__ghosts.myGhost; return me ? +(f.top(me.avatar) - me.root.position.y).toFixed(3) : null; });
      check(shot1 !== null && Math.abs(shot1 - cm / 100) < 0.03, `${cm} cm: our mirror image is ${cm} cm`, String(shot1));
      await app.screenshot({ path: `${shots}/mirror-${cm}.png`, timeout: 180000 });
      // the peer outdoors in front of the north façade (START's view), from a fixed camera 3.5 m away at 1.3 m
      const out = await app.evaluate(async () => { const { START } = await import('/src/config.js'), a = window.__app, z = START.z - 1.5;
        return [START.x, a.player.groundAt(START.x, z, 0), z]; });
      await peer.evaluate((out) => { window.peer.at = out; window.peer.r = 0; }, out); // a ghost looks along (−sin r, −cos r): r 0 = north, at the camera
      await app.evaluate((out) => window.__fix.run(8000, () => { const g = window.__fix.peer(); return g && Math.hypot(g.root.position.x - out[0], g.root.position.z - out[2]) < 0.05; }), out);
      await app.evaluate(() => window.__fix.run(1500));
      const outTop = await app.evaluate((out) => { const f = window.__fix, g = f.peer(), T = f.e.constructor; g.avatar.update(0, {});
        f.look(new T(out[0], out[1] + 1.3, out[2] - 3.5), new T(out[0], out[1] + 1.0, out[2]), 50); window.__app.renderer.render(window.__app.scene, window.__app.camera);
        return +(f.top(g.avatar) - g.root.position.y).toFixed(3); }, out);
      check(Math.abs(outTop - cm / 100) < 0.03, `${cm} cm: the peer outdoors is ${cm} cm`, String(outTop));
      await app.screenshot({ path: `${shots}/peer-${cm}.png`, timeout: 180000 });
      await peer.evaluate((fixAt) => { window.peer.at = fixAt.at; window.peer.r = fixAt.r; }, await peer.evaluate(() => window.peer.home));
    }
    // the customizer's slider: live look + eye height, saved code on close
    const ui = await app.evaluate(async () => { const a = window.__app, C = await import('/src/config.js'); a.openAvatarCustomizer();
      const input = document.getElementById('avatar-height'); input.value = '140'; input.dispatchEvent(new Event('input', { bubbles: true }));
      return { height: window.__ghosts.myLook.height, eye: C.PLAYER.eye, want: C.avatarProportions(140).eye, label: document.getElementById('avatar-height-value').textContent }; });
    check(ui.height === 140 && Math.abs(ui.eye - ui.want) < 1e-9 && ui.label === '140 cm', 'the slider sets 140 cm live', JSON.stringify(ui));
    await app.screenshot({ path: `${shots}/customizer-140.png`, timeout: 180000 });
    const saved = await app.evaluate(() => { window.__app.closeAvatarCustomizer(); return localStorage.getItem('lunden.avatar'); });
    check(/^\d{9}140$/.test(saved ?? ''), 'closing saves the 12-digit code', saved);
    await peer.evaluate(() => window.peer.ghosts.disconnect()); await peer.close();
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { check(false, 'crashed', e.stack); }
  await Promise.all(browsers.map((b) => b.close()));
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exitCode = failed ? 1 : 0;
})();
