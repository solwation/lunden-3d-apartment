// #1286: the real app mounts a bicycle and wears the jetpack; a module peer (real Ghosts) through a local Worker
// (node cloudflare/dev.mjs PORT) sees the rider on a bike (bk) and the pack (jp); screenshots of the peer's view.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/shots-1286 node tools/ghostbiketest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8782', worker = process.argv[3] || 'http://localhost:8792';
const shots = process.env.SHOTS || '/tmp/shots-1286';
let failed = 0;
const check = (ok, label, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${d ? ' — ' + d : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const [b1, b2] = [await launch(), await launch()];
  try {
    const app = await b1.newPage({ viewport: { width: 700, height: 450 } }), errors = [];
    app.on('pageerror', (e) => errors.push(e.message));
    await app.addInitScript(() => { localStorage.setItem('lunden.name', 'Cyklist'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await app.goto(`${game}/?shot&quality=1&time=12&month=6&cloud=${encodeURIComponent(worker)}`, { waitUntil: 'commit' });
    await app.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 600000 });
    const peer = await b2.newPage({ viewport: { width: 900, height: 450 } });
    peer.on('pageerror', (e) => errors.push(e.message));
    await peer.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '//' }));
    await peer.goto(game);
    await peer.evaluate(async (worker) => {
      const T = await import('three'), { Ghosts } = await import('/src/ghosts.js');
      const scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 2, 0.1, 100);
      scene.background = new T.Color(0xbfc6cc); scene.add(new T.HemisphereLight(0xffffff, 0x8a7f72, 1.8));
      const r = new T.WebGLRenderer({ preserveDrawingBuffer: true }); r.setSize(900, 450); document.body.replaceChildren(r.domElement); r.domElement.style.cssText = 'position:fixed;inset:0;z-index:99';
      const ghosts = new Ghosts({ scene, camera, url: worker, name: () => 'Betraktare', state: () => ({ p: [0, 0, 0], r: 0 }), score: () => 0 });
      window.peer = { ghosts, scene, camera, r }; camera.position.set(0, 1.5, 4);
      setInterval(() => { const g = [...ghosts.others.values()].find((x) => x.name === 'Cyklist'); if (g) { camera.position.set(g.root.position.x + 3.2, 1.3, g.root.position.z + 1.2); camera.lookAt(g.root.position.x, 0.9, g.root.position.z); } ghosts.update(); }, 50);
    }, worker);
    const seen = () => peer.evaluate(() => { const g = [...window.peer.ghosts.others.values()].find((x) => x.name === 'Cyklist'); return g ? { bike: !!g.bikeMesh, pack: g.pack ? (g.pack.children[0].visible ? 2 : 1) : 0 } : null; });
    const wait = async (f) => { for (let i = 0; i < 150; i++) { const s = await seen(); if (s && f(s)) return s; await new Promise((r) => setTimeout(r, 200)); } return await seen(); };
    const shot = async (name) => { await peer.evaluate(() => { const g = [...window.peer.ghosts.others.values()].find((x) => x.name === 'Cyklist'), { camera, r, scene } = window.peer;
      g.root.visible = true; camera.position.set(g.root.position.x + 3.2, 1.3, g.root.position.z + 1.2); camera.lookAt(g.root.position.x, 0.9, g.root.position.z); r.render(scene, camera); });
      await peer.locator('canvas[width="900"]').screenshot({ path: `${shots}/e2e-${name}.png` }); };
    await app.evaluate(() => { const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); });
    const info = await app.evaluate(() => { const a = window.__app, b = a.world.bicycles?.find((x) => x.atSource || true);
      if (!b) return { err: 'no bike' };
      a.player.spawn(b.position.x - 1.2, b.position.z, 0); a.player.pos.y = b.position.y; a.step(0);
      return { n: a.world.bicycles.length, pos: b.position.toArray(), ok: a.player.mountBicycle(b) }; });
    console.log(JSON.stringify(info));
    if (!info.ok) { // not every bike can be taken out; try them all
      const ok = await app.evaluate(() => { const a = window.__app; for (const b of a.world.bicycles) { a.player.spawn(b.position.x - 1.2, b.position.z, 0); a.player.pos.y = b.position.y; a.step(0); if (a.player.mountBicycle(b)) return true; } return false; });
      check(ok, 'some bicycle could be mounted');
    }
    const s1 = await wait((s) => s.bike);
    check(s1?.bike === true, 'peer sees the rider on a bicycle', JSON.stringify(s1));
    if (s1?.bike) await shot('bike');
    await app.evaluate(() => { const a = window.__app; a.player.dismountBicycle(); a.jetpack.putOn(); });
    const s2 = await wait((s) => !s.bike && s.pack);
    check(s2 && !s2.bike && s2.pack >= 1, 'after dismounting: no bicycle; the jetpack is seen', JSON.stringify(s2));
    if (s2?.pack) await shot('jetpack');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } finally { await b1.close(); await b2.close(); }
  process.exit(failed ? 1 : 0);
})();
