// #1122: the talking mouth in the real app against a local Worker (node cloudflare/dev.mjs PORT). A module peer (real
// Ghosts + Chat, no app) stands in front of the app's camera by the hall mirror and sends a chat line: the app's avatar of
// that peer opens and shuts its mouth while the bubble shows, not for "skriver…", and is shut before the bubble goes; then
// the app sends a line itself and its reflection in the hall mirror talks. SwiftShader draws the whole app at about one
// frame a second, so the app's loop is paused and its real Ghosts / Chat updates (and the mirror pass) are stepped at
// ~60 Hz of real time; each screenshot is one real render. Shots: game-remote-shut/open, game-mirror-shut/open.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/shots-1122 node tools/avatarmouthgametest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8623', worker = process.argv[3] || 'http://localhost:8624';
const shots = process.env.SHOTS || '/tmp/shots-1122';
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const browsers = [await launch(), await launch()];
  try {
    const app = await browsers[0].newPage({ viewport: { width: 900, height: 600 } });
    const errors = []; app.on('pageerror', (e) => errors.push(e.message));
    await app.addInitScript(() => { localStorage.setItem('lunden.name', 'Munnen'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await app.goto(`${game}/?shot&quality=3&time=12&month=6&freeze&cloud=${encodeURIComponent(worker)}`, { waitUntil: 'commit' });
    await app.waitForFunction(() => window.__app?.renderer && window.__chat && window.__ghosts, null, { timeout: 600000 });
    const fix = await app.evaluate(() => {
      const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); a.scene.updateMatrixWorld(true);
      const m = a.reflectors().find((m) => m.name === 'nissedal'); if (!m) throw Error('hall mirror missing');
      const p = m.r.getWorldPosition(a.camera.position.clone()), n = a.camera.position.clone().set(0, 0, 1).transformDirection(m.r.matrixWorld);
      const e = p.clone().addScaledVector(n, 0.9); e.y = 1.62;
      a.player.spawn(e.x, e.z, 0); a.player.pos.y = 0; a.player.eyeY = 1.62; a.step(0);
      a.renderer.setAnimationLoop(null);
      const g = window.__ghosts, c = window.__chat;
      let last = performance.now();
      const tick = (mirror) => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
        a.camera.position.copy(e); g.update(); c.update(dt); if (mirror) { a.updateReflections(a.camera, 0, true, false); a.renderer.render(a.scene, a.camera); } }; // (the mirror poses our image in its render pass)
      window.__fix = {
        e, p, n, tick,
        // step for `ms` (or until `stop()`), sampling `get()` after each step
        run: (ms, get, stop = () => false, mirror = false) => new Promise((done) => {
          const out = [], t0 = performance.now();
          const f = () => { tick(mirror); out.push(get()); if (performance.now() - t0 < ms && !stop()) setTimeout(f, 16); else done(out); };
          f();
        }),
        look: (target, fov) => { a.camera.position.copy(e); a.camera.fov = fov; a.camera.updateProjectionMatrix(); a.camera.lookAt(target); a.camera.updateMatrixWorld(true); },
        render: (mirror) => { if (mirror) a.updateReflections(a.camera, 0, true, false); a.renderer.render(a.scene, a.camera); },
        peer: () => [...g.others.values()].find((x) => x.name === 'Pratare'),
      };
      return { e: e.toArray(), n: n.toArray(), p: p.toArray() };
    });
    await app.waitForFunction(() => { window.__fix.tick(); return window.__ghosts.connected; }, null, { timeout: 60000, polling: 100 });
    const peer = await browsers[1].newPage();
    await peer.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// module peer' }));
    await peer.goto(game);
    await peer.evaluate(async ([worker, fix]) => {
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Chat } = await import('/src/chat.js');
      const e = new T.Vector3(...fix.e), n = new T.Vector3(...fix.n), p = e.clone().addScaledVector(n, -0.62);
      const r = Math.atan2(-n.x, -n.z); // a ghost looks along (−sin r, −cos r): towards the app's eye (+n)
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1, 0.1, 100), log = document.createElement('div'); document.body.append(log);
      const ghosts = new Ghosts({ scene, camera, url: worker, name: () => 'Pratare', state: () => ({ p: [p.x, 0, p.z], r }), score: () => 0 });
      const chat = new Chat({ ghosts, log, camera, layer: document.querySelector('#speech') || document.body });
      window.peer = { ghosts, chat };
      setInterval(() => ghosts.update(), 50);
    }, [worker, fix]);
    await peer.waitForFunction(() => window.peer.ghosts.connected, null, { timeout: 60000 });
    await app.waitForFunction(() => { window.__fix.tick(); return !!window.__fix.peer(); }, null, { timeout: 30000, polling: 100 });
    await app.evaluate(() => window.__fix.run(1000, () => 0));
    const aim = () => app.evaluate(() => { const g = window.__fix.peer(), h = g.avatar.bones.head.getWorldPosition(g.root.position.clone()); h.y += 0.04 * g.avatar.look.tall; window.__fix.look(h, 12); });
    // "skriver…" only
    await peer.evaluate(() => { window.peer.chat.open = true; window.peer.chat.keyed(); });
    const typing = await app.evaluate(async () => { const s = await window.__fix.run(1500, () => window.__fix.peer().avatar.mouth); return { max: Math.max(...s), talking: window.__fix.peer().avatar.talking, bubbles: window.__chat.bubbleList() }; });
    check(typing.bubbles.some((b) => b.typing) && !typing.talking && typing.max === 0, 'skriver… shows but the mouth stays shut', JSON.stringify(typing));
    await aim(); await app.evaluate(() => window.__fix.render()); await app.screenshot({ path: `${shots}/game-remote-shut.png`, timeout: 180000 });
    // a line
    await peer.evaluate(() => window.peer.chat.send('Hej! Hur mår du idag? Kom ut på gården sen.'));
    const t0 = await app.evaluate(async () => { await window.__fix.run(20000, () => 0, () => window.__fix.peer().avatar.talking); return window.__t0 = performance.now(); });
    const samples = await app.evaluate(() => window.__fix.run(1500, () => window.__fix.peer().avatar.mouth));
    const peak = Math.max(...samples); let swings = 0; for (let i = 1; i < samples.length; i++) if ((samples[i - 1] < 0.3) !== (samples[i] < 0.3)) swings++;
    check(peak > 0.5 && swings >= 4, 'the received line opens and shuts the mouth', JSON.stringify({ n: samples.length, peak: +peak.toFixed(2), swings }));
    const open = await app.evaluate(async () => { await window.__fix.run(3000, () => 0, () => window.__fix.peer().avatar.mouth > 0.6); return window.__fix.peer().avatar.mouth; });
    await aim(); await app.evaluate(() => window.__fix.render()); await app.screenshot({ path: `${shots}/game-remote-open.png`, timeout: 180000 });
    check(open > 0.6, 'remote open frame captured', open.toFixed(2));
    const end = await app.evaluate(async () => { const { CHAT } = await import('/src/config.js'); await window.__fix.run(20000, () => 0, () => !window.__fix.peer().avatar.talking && window.__fix.peer().avatar.mouth === 0); return { ms: Math.round(performance.now() - window.__t0), ttl: CHAT.bubbleTtl, bubble: window.__chat.bubbleList().filter((b) => !b.typing).length }; });
    check(end.ms < end.ttl * 1000 && end.bubble === 1, 'shut again while the bubble still shows (line length, capped)', JSON.stringify(end));
    // our own line → the hall mirror image (the peer leaves first, out of the way)
    await peer.evaluate(() => window.peer.ghosts.disconnect()); await peer.close();
    await app.evaluate(() => window.__fix.run(1500, () => 0));
    await app.evaluate(() => { const f = window.__fix; f.look(f.p.clone().setY(1.5), 22); });
    await app.evaluate(() => window.__fix.render(true)); await app.screenshot({ path: `${shots}/game-mirror-shut.png`, timeout: 180000 });
    const sent = await app.evaluate(() => window.__chat.send('Hej spegeln, nu pratar jag med dig en stund!'));
    check(sent === '', 'our line is sent', sent);
    const self = await app.evaluate(() => window.__fix.run(6000, () => window.__ghosts.myGhost.avatar.mouth, () => window.__ghosts.myGhost.avatar.mouth > 0.5, true));
    check(Math.max(...self) > 0.5, 'the mirror image moves its mouth (posed by the mirror pass)', JSON.stringify({ n: self.length, peak: Math.max(...self).toFixed(2) }));
    // hold the opening the real pass reached for the screenshot's render (that render poses the image again)
    const mo = await app.evaluate(() => { const av = window.__ghosts.myGhost.avatar, m = av.mouth; av.mouthTarget = () => m; window.__fix.render(true); return m; });
    await app.screenshot({ path: `${shots}/game-mirror-open.png`, timeout: 180000 });
    check(mo > 0.6, 'mirror open frame captured', mo.toFixed(2));
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { check(false, 'crashed', e.stack); }
  await Promise.all(browsers.map((b) => b.close()));
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exitCode = failed ? 1 : 0;
})();
