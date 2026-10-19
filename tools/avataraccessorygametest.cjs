// #1321, #1322, #1323, #1324 (#1318): headwear (tag q), headphones (tag f), necklaces (tag x) and rings (tags i, z) in the real app against a local Worker (node cloudflare/dev.mjs PORT). The app stands in front of the hall mirror;
// a module peer (real Ghosts) stands behind it. Checks: the customizer's "Huvudbonad" / "Hörlurar" / "Halsband" buttons set look.hat / look.phones / look.necklace and the saved code carries `q<n>` / `f<n>` / `x<n>`
// (a look without headwear keeps its code), the peer's headwear reaches the app through the Worker (look + uniform), our mirror image wears it.
// Shots: mirror-<kind><n>, peer-<kind><n> (outdoors, 1.6 m), customizer-<kind>. Old codes keep hat 0.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/shots-1321 node tools/avataraccessorygametest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8632', worker = process.argv[3] || 'http://localhost:8633';
const shots = process.env.SHOTS || '/tmp/shots-1321';
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const browsers = [await launch(), await launch()];
  try {
    const app = await browsers[0].newPage({ viewport: { width: 900, height: 600 } });
    const errors = []; app.on('pageerror', (e) => errors.push(e.message));
    await app.addInitScript(() => { localStorage.setItem('lunden.name', 'Hatt'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
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
        for (let i = 0; i < pos.count; i++) { av.mesh.getVertexPosition(i, v); v.applyMatrix4(av.mesh.matrixWorld); y = Math.max(y, v.y); } return y; };
      window.__fix = {
        e, p, n, top,
        tick: (mirror) => { a.camera.position.copy(e); g.update(); if (mirror) a.updateReflections(a.camera, 0, true, false); },
        run: (ms, stop = () => false, mirror = false) => new Promise((done) => {
          const t0 = performance.now(); const f = () => { window.__fix.tick(mirror); if (performance.now() - t0 < ms && !stop()) setTimeout(f, 16); else done(); }; f();
        }),
        look: (from, target, fov) => { a.camera.position.copy(from); a.camera.fov = fov; a.camera.updateProjectionMatrix(); a.camera.lookAt(target); a.camera.updateMatrixWorld(true); },
        render: (mirror) => { if (mirror) a.updateReflections(a.camera, 0, true, false); a.renderer.render(a.scene, a.camera); },
        peer: () => [...g.others.values()].find((x) => x.name === 'Hattbent'),
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
      const ghosts = new Ghosts({ scene, camera, url: worker, name: () => 'Hattbent', state: () => ({ p: window.peer.at, r: window.peer.r }), score: () => 0 });
      window.peer = { ghosts, at: [p.x, 0, p.z], r, home: { at: [p.x, 0, p.z], r } };
      setInterval(() => ghosts.update(), 50);
    }, [worker, fix]);
    await peer.waitForFunction(() => window.peer.ghosts.connected, null, { timeout: 60000 });
    await app.waitForFunction(() => { window.__fix.tick(); return !!window.__fix.peer(); }, null, { timeout: 30000, polling: 100 });
    for (const [kind, tag, cfg, uni, vals, mult = 1] of [['hat', 'q', 'AVATAR_HAT', 'uHat', [1, 2, 3, 4]], ['phones', 'f', 'AVATAR_PHONES', 'uPhones', [1, 2]], ['necklace', 'x', 'AVATAR_NECKLACE', 'uNecklace', [1, 2, 3, 4]], ['ring', 'i', 'AVATAR_RING', 'uRingFinger', [1, 4, 7, 10]], ['earrings', 'g', 'AVATAR_EARRINGS', 'uEarrings', [1, 2, 3, 4], 10], ['bracelet', 'z', 'AVATAR_WRIST', 'uBracelet', [1, 3, 4, 6], 0], ['watch', 'z', 'AVATAR_WRIST', 'uWatch', [1, 2, 5, 6], 0]]) for (const hat of vals) { // #1325: earrings share the `g` tag (glasses + 10 * earrings)
      // the customizer's own buttons (own look), then the wire (the peer's)
      const mine = await app.evaluate(async ([hat, kind, cfg, uni]) => { const a = window.__app, C = await import('/src/config.js'); a.openAvatarCustomizer();
        const b = document.querySelector(`#avatar-customizer button[data-type="${kind}"][data-index="${hat}"], button[data-type="${kind}"][data-index="${hat}"]`); b.click();
        const g = window.__ghosts, u = g.myGhost?.avatar?.mesh?.material?.userData?.u;
        return { hat: g.myLook[kind], uHat: u?.[uni].value, sel: b.classList.contains('sel') || b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true', code: g.avatarCode, name: (C[cfg].names ?? C[cfg].fingers ?? [])[hat % 5] ?? kind, decoded: C.decodeAvatarLook(g.avatarCode, 'p')[kind], fp: a.hand?.wrist?.meshes.length }; }, [hat, kind, cfg, uni]);
      check(mine.hat === hat && (mult ? mine.code.includes(`${tag}${hat * mult}`) : mine.decoded === hat && new RegExp(`${tag}\\d`).test(mine.code)) && mine.uHat === hat, `own look: ${mine.name} (button) → ${tag}${hat * mult || '…'} in the wire code`, JSON.stringify(mine));
      if (!mult) check(mine.fp > 0, `first-person hand wears ${kind} ${hat}`, JSON.stringify(mine));
      if (hat === (kind === 'hat' ? 3 : 1)) { await app.evaluate((kind) => document.querySelector(`button[data-type="${kind}"][data-index="1"]`).scrollIntoView({ block: 'center' }), kind); await app.screenshot({ path: `${shots}/customizer-${kind}.png`, timeout: 180000 }); }
      await app.evaluate(() => window.__app.closeAvatarCustomizer());
      const code = await peer.evaluate(async ([hat, kind]) => { const C = await import('/src/config.js'); const lk = { ...C.decodeAvatarLook('130410013', 'peer'), [kind]: hat };
        window.peer.ghosts.setMyLook(lk); return C.encodeAvatarWireLook(lk); }, [hat, kind]);
      await app.evaluate((code) => window.__fix.run(8000, () => window.__fix.peer()?.avatarCode === code), code);
      await app.evaluate(() => window.__fix.run(600));
      const got = await app.evaluate(([kind, uni]) => { const g = window.__fix.peer(); g.avatar.update(0, {}); return { code: g.avatarCode, hat: g.avatar.look[kind], u: g.avatar.mesh.material.userData.u[uni].value }; }, [kind, uni]);
      check(got.code === code && got.hat === hat && got.u === hat, `the peer's ${kind} ${hat} reaches the app (look and uniform)`, JSON.stringify(got));
      const mir = await app.evaluate((uni) => { const f = window.__fix, a = window.__app; f.e.y = a.player.eyeY; f.look(f.e, f.p.clone().setY(f.e.y - 0.1), 60); f.render(true);
        const me = window.__ghosts.myGhost; return me ? me.avatar.mesh.material.userData.u[uni].value : null; }, uni);
      check(mir === hat, `our mirror image wears ${kind} ${hat}`, String(mir));
      await app.screenshot({ path: `${shots}/mirror-${kind}${hat}.png`, timeout: 180000 });
      const out = await app.evaluate(async () => { const { START } = await import('/src/config.js'), a = window.__app, z = START.z - 1.5;
        return [START.x, a.player.groundAt(START.x, z, 0), z]; });
      await peer.evaluate((out) => { window.peer.at = out; window.peer.r = 0; }, out);
      await app.evaluate((out) => window.__fix.run(8000, () => { const g = window.__fix.peer(); return g && Math.hypot(g.root.position.x - out[0], g.root.position.z - out[2]) < 0.05; }), out);
      await app.evaluate(() => window.__fix.run(1500));
      await app.evaluate((out) => { const f = window.__fix, g = f.peer(), T = f.e.constructor; g.avatar.update(0, {});
        f.look(new T(out[0], out[1] + 1.55, out[2] - 1.6), new T(out[0], out[1] + 1.6, out[2]), 35); window.__app.renderer.render(window.__app.scene, window.__app.camera); }, out);
      await app.screenshot({ path: `${shots}/peer-${kind}${hat}.png`, timeout: 180000 });
      await peer.evaluate((h) => { window.peer.at = h.at; window.peer.r = h.r; }, await peer.evaluate(() => window.peer.home));
    }
    const saved = await app.evaluate(() => { return localStorage.getItem('lunden.avatar'); });
    check(/z\d/.test(saved ?? '') && /q4/.test(saved ?? '') && /f2/.test(saved ?? '') && /x4/.test(saved ?? '') && /i10/.test(saved ?? '') && /g40/.test(saved ?? ''), 'closing saves the code with the headwear, the headphones, the necklace, the ring and the earrings', saved);
    // #1324: the ring's metal (buttons data-type=metal): own look, the uniform's colour, the code's z tag and the first-person hand's material
    for (const m of [1, 2, 3]) {
      const r = await app.evaluate(async (m) => { const a = window.__app, C = await import('/src/config.js'); a.openAvatarCustomizer();
        document.querySelector(`button[data-type="metal"][data-index="${m}"]`).click();
        const g = window.__ghosts, u = g.myGhost?.avatar?.mesh?.material?.userData?.u; a.closeAvatarCustomizer();
        const hand = a.hand.rings.r ?? a.hand.rings.l;
        return { metal: g.myLook.metal, colour: u?.uRingColor.value.getHex(), want: C.AVATAR_RING.colours[m], code: g.avatarCode, decMetal: C.decodeAvatarLook(g.avatarCode, 'p').metal, hand: hand?.material.color.getHex() }; }, m);
      check(r.metal === m && r.colour === r.want && r.hand === r.want && r.decMetal === m, `metal ${m}: look, shader colour, first-person ring and the z tag's metal in the code`, JSON.stringify(r));
    }
    const none = await app.evaluate(async () => { const C = await import('/src/config.js'); const lk = window.__ghosts.myLook; return C.encodeAvatarLook({ ...lk, hat: 0, phones: 0, necklace: 0, ring: 0, metal: 0, earrings: 0, glasses: 0, bracelet: 0, watch: 0 }); });
    check(!/[qfxizg]\d/.test(none), 'headwear / headphones / necklace / ring none is not written', none);
    await peer.evaluate(() => window.peer.ghosts.disconnect()); await peer.close();
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { check(false, 'crashed', e.stack); }
  await Promise.all(browsers.map((b) => b.close()));
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exitCode = failed ? 1 : 0;
})();
