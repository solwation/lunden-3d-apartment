// #1297: what the real app holds (heldItem() → heldCategory → `hi` on the wire) shows in the hand of its ghost on another
// client through a local Worker (node cloudflare/dev.mjs PORT). Also: a module-level peer cycles every category and an
// invalid / weapon-overridden one. Screenshots of the peer's view.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/shots1297 node tools/ghostitempeertest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8791', worker = process.argv[3] || 'http://localhost:8792';
const shots = process.env.SHOTS || '/tmp/shots1297';
let failed = 0;
const check = (ok, label, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${d ? ' — ' + d : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const [b1, b2] = [await launch(), await launch()];
  try {
    const app = await b1.newPage({ viewport: { width: 700, height: 450 } }), errors = [];
    app.on('pageerror', (e) => errors.push(e.message));
    await app.addInitScript(() => { localStorage.setItem('lunden.name', 'Bärare'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
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
      setInterval(() => { ghosts.update(); }, 50);
    }, worker);
    const seen = () => peer.evaluate(() => { const g = [...window.peer.ghosts.others.values()].find((x) => x.name === 'Bärare'); return g ? { hi: g.hi, item: g.itemProp?.name ?? null, vis: !!g.itemProp?.visible } : null; });
    const wait = async (f) => { for (let i = 0; i < 150; i++) { const s = await seen(); if (s && f(s)) return s; await new Promise((r) => setTimeout(r, 200)); } return await seen(); };
    const shot = async (name) => { await peer.evaluate(() => { const g = [...window.peer.ghosts.others.values()].find((x) => x.name === 'Bärare'), { camera, r, scene } = window.peer;
      g.root.visible = true; g.root.rotation.y = Math.PI; g.have = false; let t = performance.now(); for (let k = 0; k < 20; k++) g.animate(t += 33, 1, 0, 0);
      camera.fov = 14; camera.updateProjectionMatrix(); camera.position.set(g.root.position.x - 0.8, 1.3, g.root.position.z + 3); camera.lookAt(g.root.position.x - 0.1, 1.05, g.root.position.z); r.render(scene, camera); });
      await peer.locator('canvas[width="900"]').screenshot({ path: `${shots}/e2e-${name}.png` }); };
    await app.evaluate(() => { const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); });
    const s0 = await wait((s) => s);
    check(!!s0 && s0.hi === '' && s0.item === null, 'the empty hand shows nothing', JSON.stringify(s0));
    const taken = await app.evaluate(() => { const a = window.__app; a.book.take(); return { held: a.heldItem()?.constructor?.name ?? null }; });
    const s1 = await wait((s) => s.hi === 'book');
    check(taken.held === 'Book' && s1?.hi === 'book' && s1.item === 'ghost-item:book', 'real Book taken: the peer sees a book proxy', JSON.stringify({ taken, s1 }));
    if (s1?.hi) await shot('book');
    await app.evaluate(() => window.__app.book.putBack());
    const s2 = await wait((s) => s.hi === '');
    check(s2?.hi === '' && s2.item === null, 'put back: the proxy is gone', JSON.stringify(s2));
    const t3 = await app.evaluate(() => { const a = window.__app, th = a.things?.find?.((x) => x.kind === 'glass') ?? a.things?.[0]; if (!th) return null; th.take(); return { cls: a.heldItem()?.constructor?.name, kind: th.kind }; });
    const want = t3 && (t3.kind === 'glass' ? 'cup' : t3.kind === 'plant' ? 'plant' : 'bottle');
    const s3 = await wait((s) => s.hi === want);
    check(!!t3 && s3?.hi === want, `a real Thing (${t3?.kind}) taken: category ${want}`, JSON.stringify({ t3, s3 }));
    if (s3?.hi) await shot('thing');
    await app.evaluate(() => { const a = window.__app; a.heldItem()?.putBack(); });
    await wait((s) => s.hi === '');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } finally { await b1.close(); await b2.close(); }
  process.exit(failed ? 1 : 0);
})();
