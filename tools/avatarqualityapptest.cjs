// #1907: bounded creator, reflection and Worker-delivered peer evidence.
// Run with tools/browsertest.sh; GAME and WORKER must both be local fixtures.
// AVATAR_COMPONENT=1 uses actual consumer modules with controlled surroundings;
// the default checks main/World and currently exposes independent blocker #1914.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://127.0.0.1:8191';
const worker = process.argv[3] || 'http://localhost:8192';
const out = process.argv[4] || 'docs/verification/1907';
const assert = (ok, message) => { if (!ok) throw Error(message); console.log(`PASS ${message}`); };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], result = { environment: 'actual app, local Worker, two real Ghosts clients; other not-yet-published GLBs return404, matching Pages fallback', screenshots: [] };
  try {
    const app = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    let startupFailure;
    const fatalStartup = new Promise((_, reject) => { startupFailure = reject; });
    app.on('pageerror', e => { errors.push(e.message); console.error('PAGEERROR', e.message); });
    app.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()); if (m.text().startsWith('Startup failed')) startupFailure(Error(m.text())); });
    await browser.contexts()[0].route('**/models/*.glb', r => r.request().url().endsWith('/avatar-rigged.glb') ? r.continue() : r.fulfill({ status: 404, body: 'Not yet published; Pages fallback fixture' }));
    await app.addInitScript(() => { localStorage.setItem('lunden.name', 'Avatarprov'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const route = process.env.AVATAR_COMPONENT ? '/tools/avatar-consumers.html' : '/';
    await app.goto(`${game}${route}?shot&test=lazy&time=12&month=6&freeze&cloud=${encodeURIComponent(worker)}`, { waitUntil: 'commit' });
    await Promise.race([fatalStartup, app.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 210000 })]).catch(async e => {
      console.error('STARTUP', await app.locator('body').innerText({ timeout: 3000 }).catch(() => 'unavailable'));
      console.error('ERRORS', JSON.stringify(errors)); throw e;
    });
    result.environment = await app.evaluate(() => window.__avatarConsumerEnvironment || 'actual app, local Worker, two real Ghosts clients; other not-yet-published GLBs return404, matching Pages fallback');
    const fix = await app.evaluate(() => {
      const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); a.scene.updateMatrixWorld(true);
      const m = a.reflectors().find(m => m.name === 'nissedal');
      if (!m) throw Error('hall mirror missing');
      const p = m.r.getWorldPosition(a.camera.position.clone());
      const n = a.camera.position.clone().set(0, 0, 1).transformDirection(m.r.matrixWorld);
      const e = p.clone().addScaledVector(n, 1.35); e.y = 1.62;
      a.player.spawn(e.x, e.z, 0); a.player.pos.y = 0; a.player.eyeY = 1.62; a.step(0);
      a.renderer.setAnimationLoop(null);
      window.__avatarFix = { e, p, n,
        tick: () => { window.__ghosts.update(); },
        run: ms => new Promise(done => { const t = performance.now(); const f = () => { window.__ghosts.update(); if (performance.now() - t < ms) setTimeout(f, 30); else done(); }; f(); }),
        render: (from, to, fov, mirror) => { a.camera.position.copy(from); a.camera.fov = fov; a.camera.updateProjectionMatrix(); a.camera.lookAt(to); a.camera.updateMatrixWorld(true); if (mirror) a.updateReflections(a.camera, 0, true, false); a.renderer.render(a.scene, a.camera); },
      };
      return { e: e.toArray(), n: n.toArray() };
    });
    await app.waitForFunction(() => { window.__avatarFix.tick(); return window.__ghosts.connected; }, null, { timeout: 25000, polling: 100 });
    // Choose through the production UI, then verify its mirror consumer.
    result.creator = await app.evaluate(() => {
      const a = window.__app; a.openAvatarCustomizer();
      for (const [kind, index] of [['hat', 1], ['glasses', 2], ['style', 3]]) {
        const b = document.querySelector(`button[data-type="${kind}"][data-index="${index}"]`);
        if (!b) throw Error(`missing customizer ${kind}`); b.click();
      }
      const g = window.__ghosts;
      return { look: { hat: g.myLook.hat, glasses: g.myLook.glasses, style: g.myLook.style }, code: g.avatarCode,
        mirrorHat: g.myGhost.avatar.material.userData.u.uHat.value };
    });
    assert(result.creator.look.hat === 1 && result.creator.look.glasses === 2 && result.creator.look.style === 3 && result.creator.mirrorHat === 1,
      'creator buttons update actual look and mirror material');
    await app.screenshot({ path: `${out}/app-creator.png` }); result.screenshots.push('app-creator.png');
    await app.evaluate(() => { const a = window.__app, f = window.__avatarFix; a.closeAvatarCustomizer(); f.render(f.e, f.p.clone().setY(1.05), 70, true); });
    await app.screenshot({ path: `${out}/app-mirror.png` }); result.screenshots.push('app-mirror.png');
    const peer = await browser.newPage();
    peer.on('pageerror', e => errors.push(e.message));
    await peer.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '// local module peer' }));
    await peer.goto(game, { waitUntil: 'domcontentloaded' });
    await peer.evaluate(async ([worker, fix]) => {
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), C = await import('/src/config.js');
      const p = new T.Vector3(...fix.e).addScaledVector(new T.Vector3(...fix.n), 0.7); p.y = 0;
      const ghosts = new Ghosts({ scene: new T.Scene(), camera: new T.PerspectiveCamera(60, 1, .1, 100), url: worker,
        name: () => 'Fjärravatar', state: () => ({ p: window.__peer.at, r: 0 }), score: () => 0 });
      const look = { ...C.decodeAvatarLook('130410013', 'remote'), style: 4, sleeves: 2, legs: 2, cut: 1, hat: 0, glasses: 1 };
      window.__peer = { ghosts, at: p.toArray(), code: C.encodeAvatarWireLook(look) }; ghosts.setMyLook(look);
      setInterval(() => ghosts.update(), 50);
    }, [worker, fix]);
    await peer.waitForFunction(() => window.__peer.ghosts.connected, null, { timeout: 25000 });
    await app.waitForFunction(() => { window.__avatarFix.tick(); return [...window.__ghosts.others.values()].some(g => g.name === 'Fjärravatar' && g.avatar.look.style === 4); }, null, { timeout: 25000, polling: 100 });
    await app.evaluate(() => window.__avatarFix.run(700));
    result.peer = await app.evaluate(async () => {
      const a = window.__app, f = window.__avatarFix, g = [...window.__ghosts.others.values()].find(g => g.name === 'Fjärravatar');
      const { START } = await import('/src/config.js');
      const pos = [START.x, a.player.groundAt(START.x, START.z - 1.5, 0), START.z - 1.5];
      return { at: pos, code: g.avatarCode, style: g.avatar.look.style, palettePrivate: g.avatar.mesh.geometry.attributes.color.array !== window.__ghosts.myGhost.avatar.mesh.geometry.attributes.color.array };
    });
    await peer.evaluate(at => { window.__peer.at = at; }, result.peer.at);
    await app.evaluate(() => window.__avatarFix.run(2200));
    result.peer.bounds = await app.evaluate(at => {
      const a = window.__app, f = window.__avatarFix, T = f.e.constructor;
      const g = [...window.__ghosts.others.values()].find(g => g.name === 'Fjärravatar');
      g.avatar.update(0, {}); g.root.updateMatrixWorld(true);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], v = new T();
      for (let i = 0; i < g.avatar.mesh.geometry.attributes.position.count; i++) { g.avatar.mesh.getVertexPosition(i, v); v.applyMatrix4(g.avatar.mesh.matrixWorld); v.toArray().forEach((x, j) => { min[j] = Math.min(min[j], x); max[j] = Math.max(max[j], x); }); }
      f.render(new T(at[0], at[1] + 1.05, at[2] - 3.3), new T(at[0], at[1] + .95, at[2]), 42, false);
      return { min, max, height: max[1] - min[1] };
    }, result.peer.at);
    assert(result.peer.style === 4 && result.peer.palettePrivate && result.peer.bounds.height > 1.3 && result.peer.bounds.height < 2.3,
      'Worker-delivered remote keeps distinct hair/appearance, private palette and whole-body bounds');
    await app.screenshot({ path: `${out}/app-peer.png` }); result.screenshots.push('app-peer.png');
    await peer.evaluate(() => window.__peer.ghosts.disconnect());
    assert(errors.length === 0, 'no consumer/peer page errors');
    result.errors = errors; fs.writeFileSync(`${out}/app-consumers.json`, JSON.stringify(result, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
