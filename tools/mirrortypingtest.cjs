// #743: real Chat/Ghosts + local Worker lifecycle; default also verifies an actual apartment mirror.
// PLAYWRIGHT_MODULE=... CHROME_PATH=... SHOTS=... node tools/mirrortypingtest.cjs BASE WORKER [--module-only]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8743', worker = process.argv[3] || 'http://localhost:8744';
const shots = process.env.SHOTS || '/tmp/lunden-mirror743';
const moduleOnly = process.argv.includes('--module-only');
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '// Module fixture; no app or WebGL renderer.' }));
    await page.goto(game);
    await page.evaluate(async worker => {
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Chat } = await import('/src/chat.js'), { CHAT, GHOSTS } = await import('/src/config.js');
      const names = ['First', 'Second'], peers = [];
      for (let i = 0; i < 2; i++) {
        const log = document.createElement('div'), holder = document.createElement('div'); holder.append(log); document.body.append(holder);
        const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1, .1, 100);
        const ghosts = new Ghosts({ scene, camera, url: worker, name: () => names[i], state: () => ({ p: [i, 0, 0], r: 0 }), score: () => 0 });
        const chat = new Chat({ ghosts, log, camera, layer: document.querySelector('#speech') });
        peers.push({ scene, camera, ghosts, chat });
      }
      window.typingFixture = { T, CHAT, GHOSTS, names, peers };
    }, worker);
    await page.waitForFunction(() => { typingFixture.peers.forEach(p => p.ghosts.update()); return typingFixture.peers.every(p => p.ghosts.connected); }, null, { timeout: 15000, polling: 100 });
    const lifecycle = await page.evaluate(async () => {
      const f = typingFixture, [a, b] = f.peers, rows = [], ok = (value, label) => rows.push([!!value, label]);
      const mirror = p => { p.ghosts.beforeMirror(); const g = p.ghosts.myGhost, shown = !!g?.typingSprite?.visible && g.root.visible; p.ghosts.afterMirror(); return shown; };
      ok(!mirror(a) && !a.ghosts.myGhost.typingSprite, 'no typing texture/sprite allocated before a real key');
      a.chat.keyed(); ok(!mirror(a), 'closed chat never shows local typing');
      a.chat.opened(true); a.chat.keyed(); ok(mirror(a), 'real connected Chat.keyed enables the existing mirror hook');
      const ga = a.ghosts.myGhost, atlas = ga.typingAtlas, map = atlas.material.map;
      ok(ga.typingSprite.position.y === f.GHOSTS.tagY + (ga.avatar.look.tall - 1) * 1.8, 'own above-head anchor reserves no absent self-name-tag space');
      ok(!ga.root.visible && !ga.typingSprite.visible, 'afterMirror hides both own avatar and typing sprite');
      ok(map.image.width === 512 && map.image.height === 96 && !map.generateMipmaps, 'one bounded 192 KiB RGBA atlas without mipmaps');
      ga.root.updateMatrixWorld(true);
      ok(new f.T.Raycaster(new f.T.Vector3(0, 2, 3), new f.T.Vector3(0, 0, -1)).intersectObject(ga.typingSprite).length === 0, 'typing sprite is never a raycast action/collision target');
      ga.mirrorTyping(true, 100);
      const version = map.version, phase = map.offset.toArray();
      ga.mirrorTyping(true, 250); ga.typingSprite.visible = false;
      ok(map.version === version && map.offset.toArray().some((x, i) => x !== phase[i]), 'dot UV phase advances without texture-version/upload changes');
      for (let i = 0; i < 30; i++) mirror(a);
      ok(ga.typingAtlas === atlas && atlas.users === 1 && map.version === version, 'repeated mirror frames reuse one texture/material lease');
      a.chat.lastKey = performance.now() - f.CHAT.typingMs - 1;
      ok(!mirror(a) && a.chat.typing, 'timeout hides the mirror bubble even before Chat.update clears the flag');
      a.chat.update(0); ok(!a.chat.typing, 'ordinary Chat.update retains its typing timeout');
      a.chat.keyed(); ok(mirror(a), 'a fresh key shows typing again');
      ok(a.chat.send('Skriver test') === '' && !mirror(a), 'successful actual Chat.send hides local typing immediately');
      a.chat.keyed(); a.chat.opened(false); ok(!mirror(a), 'closing terminal stops its local mirror bubble');
      a.chat.opened(true); a.chat.keyed(); a.chat.hide(true); ok(!mirror(a), 'chat-hidden suppresses mirror typing');
      a.chat.hide(false); ok(mirror(a), 'showing chat preserves still-current outgoing typing state');
      b.chat.opened(true); b.chat.keyed(); ok(mirror(b), 'second actual self ghost can use its own mirror hook');
      const gb = b.ghosts.myGhost;
      ok(gb.typingAtlas === atlas && gb.typingSprite.material === ga.typingSprite.material && atlas.users === 2, 'two self ghosts share the bounded atlas/material');
      let disposedMap = 0, disposedMaterial = 0;
      map.addEventListener('dispose', () => disposedMap++); atlas.material.addEventListener('dispose', () => disposedMaterial++);
      a.ghosts.reset(); a.ghosts.reset(); ga.clearMirrorTyping();
      ok(atlas.users === 1 && disposedMap === 0 && disposedMaterial === 0 && mirror(b), 'reset/repeated clear of first owner keeps second owner alive');
      const roundRect = CanvasRenderingContext2D.prototype.roundRect;
      try { CanvasRenderingContext2D.prototype.roundRect = undefined; f.names[1] = 'Renamed'; ok(mirror(b), 'self-name replacement still shows typing with older-canvas rect fallback'); }
      finally { CanvasRenderingContext2D.prototype.roundRect = roundRect; }
      const renamed = b.ghosts.myGhost;
      ok(renamed !== gb && !gb.root.parent && disposedMap === 1 && disposedMaterial === 1, 'last old owner/name replacement disposes old atlas/material exactly once');
      const replacement = renamed.typingAtlas;
      let replacementDisposed = 0; replacement.material.map.addEventListener('dispose', () => replacementDisposed++);
      b.ghosts.disconnect(); b.ghosts.reset(); renamed.clearMirrorTyping();
      ok(!mirror(b) && replacementDisposed === 1 && !renamed.typingSprite, 'disconnect/repeated reset releases replacement and prevents local typing');
      ok(!b.chat.typing && !a.chat.typing && !a.ghosts.talkbox.length && !b.ghosts.talkbox.length, 'transport reset stops typing immediately without queued old-room off events');
      const reconnectUntil = performance.now() + 5000;
      while (!b.ghosts.connected && performance.now() < reconnectUntil) { b.ghosts.update(); await new Promise(r => setTimeout(r, 50)); }
      ok(b.ghosts.connected && !mirror(b) && !renamed.typingSprite, 'actual reconnect cannot resurrect typing without a fresh key');
      b.chat.keyed(); ok(mirror(b), 'fresh key after reconnect creates current mirror typing again');
      b.ghosts.disconnect(); a.ghosts.disconnect();
      return { rows, atlas: map.image.toDataURL('image/png'), version, dimensions: [map.image.width, map.image.height], disposedMap, disposedMaterial, replacementDisposed, noRenderer: !window.__app };
    });
    for (const [value, label] of lifecycle.rows) check(value, label);
    check(lifecycle.noRenderer, 'module lifecycle probe has no apartment or WebGL renderer');
    fs.writeFileSync(`${shots}/typing-atlas.png`, Buffer.from(lifecycle.atlas.split(',')[1], 'base64'));
    delete lifecycle.atlas; fs.writeFileSync(`${shots}/module-results.json`, JSON.stringify({ ...lifecycle, errors }, null, 2));
    check(errors.length === 0, 'module lifecycle has no page errors', errors.join(' | '));
    await page.close();
    if (!moduleOnly) {
      const appPage = await browser.newPage({ viewport: { width: 900, height: 600 } });
      const appErrors = []; appPage.on('pageerror', e => appErrors.push(e.message));
      await appPage.addInitScript(() => { localStorage.setItem('lunden.name', 'Spegeltest'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
      await appPage.goto(`${game}/?shot&quality=3&time=12&month=6&freeze&cloud=${encodeURIComponent(worker)}`, { waitUntil: 'commit' });
      await appPage.waitForFunction(() => window.__app?.renderer && window.__chat && window.__ghosts, null, { timeout: 600000 });
      await appPage.evaluate(() => {
        const a = window.__app, g = window.__ghosts;
        a.renderer.setAnimationLoop(null); a.showOverlay(false); if (a.rest.active) a.standUp();
        a.scene.updateMatrixWorld(true);
        const m = a.reflectors().find(m => m.name === 'nissedal'); if (!m) throw Error('Actual hall mirror missing');
        const p = m.r.getWorldPosition(a.camera.position.clone()), n = a.camera.position.clone().set(0, 0, 1).transformDirection(m.r.matrixWorld);
        const eye = p.clone().addScaledVector(n, .9); eye.y = 1.62;
        a.player.spawn(eye.x, eye.z, 0); a.player.pos.y = 0; a.player.eyeY = 1.62; a.step(0);
        a.camera.position.copy(eye); a.camera.lookAt(p.clone().setY(1.7)); a.camera.updateMatrixWorld(true); g.update();
        let glassContained = null;
        const counters = { before: 0, after: 0, typingPasses: 0, spriteDraws: 0, mainLeaks: 0 };
        const before = g.beforeMirror.bind(g), after = g.afterMirror.bind(g);
        g.beforeMirror = () => {
          before(); counters.before++;
          const sprite = g.myGhost?.typingSprite;
          if (sprite?.visible) {
            counters.typingPasses++;
            sprite.onBeforeRender = (_, __, camera) => {
              counters.spriteDraws++; if (camera === a.camera) counters.mainLeaks++;
              const center = sprite.getWorldPosition(p.clone()), right = p.clone().setFromMatrixColumn(camera.matrixWorld, 0), up = p.clone().setFromMatrixColumn(camera.matrixWorld, 1);
              const origin = camera.getWorldPosition(p.clone()), size = m.r.geometry.parameters;
              glassContained = [-1, 1].every(x => [-1, 1].every(y => {
                const corner = center.clone().addScaledVector(right, x * sprite.scale.x / 2).addScaledVector(up, y * sprite.scale.y / 2);
                const direction = corner.sub(origin), distance = p.clone().sub(origin).dot(n) / direction.dot(n);
                const hit = m.r.worldToLocal(origin.clone().addScaledVector(direction, distance));
                return distance > 0 && distance < 1 && Math.abs(hit.x) <= size.width / 2 && Math.abs(hit.y) <= size.height / 2;
              }));
            };
          }
        };
        g.afterMirror = () => { after(); counters.after++; };
        window.actualMirrorFixture = { mirror: m.name, counters, render: () => {
          g.update(); a.scene.updateMatrixWorld(true); a.updateReflections(a.camera, 0, true, false);
          Object.keys(counters).forEach(k => counters[k] = 0); glassContained = null;
          const info = a.renderer.info, auto = info.autoReset; info.autoReset = false; info.reset();
          try { a.renderer.render(a.scene, a.camera); } finally { info.autoReset = auto; }
          return { ...counters, glassContained, calls: info.render.calls, textures: info.memory.textures,
            avatarHidden: !g.myGhost.root.visible, spriteHidden: !g.myGhost.typingSprite?.visible,
            atlasVersion: g.myGhost.typingAtlas?.material.map.version ?? null };
        } };
      });
      const connected = async () => appPage.waitForFunction(() => { window.__ghosts.update(); return window.__ghosts.connected; }, null, { timeout: 30000, polling: 100 });
      await connected();
      await appPage.evaluate(() => actualMirrorFixture.render()); // real solid-avatar shader/scene warm-up, not a fabricated mirror
      await connected();
      const baseline = await appPage.evaluate(() => actualMirrorFixture.render());
      check(baseline.before === 1 && baseline.after === 1 && baseline.avatarHidden && baseline.typingPasses === 0, 'actual hall mirror uses one existing reflection pass and hides our body afterwards', JSON.stringify(baseline));
      await appPage.evaluate(() => window.__app.showTerminal(true));
      await appPage.fill('#terminal-code', 'Ett meddelande');
      const warmTyping = await appPage.evaluate(() => actualMirrorFixture.render());
      await connected();
      // Keep a current real input event after a cold shader upload, then measure the warmed pass/capture.
      await appPage.fill('#terminal-code', 'Ett meddelande till');
      const typing = await appPage.evaluate(() => actualMirrorFixture.render());
      check(typing.before === 1 && typing.after === 1 && typing.typingPasses === 1 && typing.spriteDraws === 1 && typing.mainLeaks === 0,
        'actual typing sprite draws once inside the mirror and never for the main camera', JSON.stringify(typing));
      check(typing.glassContained, 'actual sprite corners project inside the hall mirror glass at normal standing eye height');
      check(typing.avatarHidden && typing.spriteHidden, 'actual afterMirror hides both objects from the main camera');
      check(typing.calls === baseline.calls + 1 && typing.textures === baseline.textures + 1,
        'typing adds only one sprite draw and one bounded texture in the existing mirror pass', JSON.stringify({ baseline, warmTyping, typing }));
      await appPage.screenshot({ path: `${shots}/actual-hall-mirror-typing.png`, timeout: 180000 });
      const cases = [];
      const record = async label => { const r = await appPage.evaluate(() => actualMirrorFixture.render()); cases.push({ label, result: r });
        check(r.before === 1 && r.after === 1 && r.typingPasses === 0 && r.spriteDraws === 0 && r.mainLeaks === 0 && r.avatarHidden && r.spriteHidden, `actual mirror has no typing after ${label}`, JSON.stringify(r)); };
      await appPage.keyboard.press('Enter'); await record('successful send');
      await connected(); await appPage.evaluate(() => window.__app.showTerminal(true)); await appPage.fill('#terminal-code', 'Stänger');
      await appPage.evaluate(() => window.__app.showTerminal(false)); await record('terminal close');
      await connected(); await appPage.evaluate(() => window.__app.showTerminal(true)); await appPage.fill('#terminal-code', 'Väntar');
      await appPage.evaluate(async () => { const { CHAT } = await import('/src/config.js'); window.__chat.lastKey = performance.now() - CHAT.typingMs - 1; });
      await record('last-key deadline without Chat.update');
      await connected(); await appPage.fill('#terminal-code', 'Döljer'); await appPage.evaluate(() => window.__chat.hide(true)); await record('chat hidden');
      await appPage.evaluate(() => window.__chat.hide(false)); await appPage.fill('#terminal-code', 'Kopplar från');
      await appPage.evaluate(() => window.__ghosts.disconnect());
      await record('disconnect'); // genuine ordinary update may reconnect, but reset has already cleared the typing flag
      check(appErrors.length === 0, 'actual mirror app has no page errors', appErrors.join(' | '));
      fs.writeFileSync(`${shots}/actual-results.json`, JSON.stringify({ baseline, warmTyping, typing, cases, errors: appErrors, viewport: [900, 600], query: 'shot&quality=3&time=12&month=6&freeze&cloud=local-worker', originalReflectionPass: true }, null, 2));
      await appPage.close();
    }
  } catch (e) { check(false, 'mirror typing test crashed', e.stack); }
  await browser.close();
  console.log(failed ? `SOME FAILED (${failed})` : (moduleOnly ? 'ALL PASS (module-only; actual mirror not run)' : 'ALL PASS'));
  process.exitCode = failed ? 1 : 0;
})();
