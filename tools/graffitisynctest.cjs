// #1724: the spray paint shared between two real clients through the local Worker (cloudflare/dev.mjs). Start the Worker first:
//   node cloudflare/dev.mjs 8170 testtoken
//   tools/browsertest.sh node tools/graffitisynctest.cjs http://localhost:8137 http://localhost:8170 OUT_DIR
// Without a game server: GAME_ROOT=. THREE_DIR=<three package> serves the checkout from disk through a Playwright route under the
// game URL (e.g. http://127.0.0.1:8170, the Worker's port on another host name: nothing else listens) and three from THREE_DIR.
// Checks: A's spots reach B and B's reach A (painted through graffiti.js `hit` + `add`, the spray can's own path); both keep them after a
// reload; a newcomer gets the union from the room; with the clock 72 h + 1 min ahead they are gone. Screenshots of both views.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path');
const [game = 'http://localhost:8137', worker = 'http://localhost:8170', out = '/tmp/graffitisync'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const ROOT = process.env.GAME_ROOT, THREE = process.env.THREE_DIR;
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
async function serve(ctx) {
  if (!ROOT) return;
  const g = new URL(game), w = new URL(worker);
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    let file = null;
    if (u.host === g.host) file = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    else if (THREE && u.host === 'cdn.jsdelivr.net' && /^\/npm\/three@[\d.]+\//.test(u.pathname)) file = path.join(THREE, u.pathname.replace(/^\/npm\/three@[\d.]+\//, ''));
    else if (u.host === w.host) return route.continue();
    else return route.abort();
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' } });
  });
}
const setup = () => {
  const a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false);
  window.T = { a,
    async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 50)); } },
    // spots in a row of `n` across the view (a facade), painted where the eye's ray meets a surface (the can's own path: hit + add)
    paint(c, n, row) {
      const cam = a.camera; cam.updateMatrixWorld(true);
      const from = cam.getWorldPosition(new cam.position.constructor()), q = cam.getWorldQuaternion(new cam.quaternion.constructor());
      let got = 0;
      for (let i = 0; i < n; i++) {
        const dir = new cam.position.constructor(-0.45 + 0.9 * i / (n - 1), -0.05 + row * 0.07, -1).normalize().applyQuaternion(q);
        const to = from.clone().addScaledVector(dir, 6), h = __graffiti.hit(from, to);
        if (h && __graffiti.add(h, c, h.point.distanceTo(from))) got++;
      }
      return got;
    },
    keys() { return __graffiti.spots.map((s) => `${Math.round(s.p[0] * 100)},${Math.round(s.p[1] * 100)},${Math.round(s.p[2] * 100)},${s.c},${Math.round(s.t / 1000)}`).sort(); },
    info() { return { me: __ghosts.me, connected: __ghosts.connected, room: __graffitiSync.room, sent: __graffitiSync.sent, got: __graffitiSync.got, count: __graffiti.count, colours: [...new Set(__graffiti.spots.map((s) => s.c))].sort() }; },
  };
};
(async () => {
  const browser = await kit.launch(['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests']), errors = []; // (a routed page counts as public: let it reach the local Worker)
  const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}`;
  const open = async (name, { clear = true, offset = 0, at = '22,60.4,0,4' } = {}) => {
    const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
    await serve(ctx);
    await ctx.addInitScript(([n, c, off]) => {
      if (c && !sessionStorage.getItem('gfDone')) { localStorage.removeItem('lunden.graffiti'); sessionStorage.setItem('gfDone', '1'); }
      localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1');
      if (off) { const now = Date.now; Date.now = () => now() + off; }
    }, [name, clear, offset]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(`${q}&at=${at}&test`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__graffitiSync, null, { timeout: 900000 });
    await page.evaluate(setup);
    await page.evaluate(async () => { for (let i = 0; i < 200 && __graffitiSync.room === null; i++) await T.pump(100); });
    return { ctx, page, name };
  };
  try {
    const A = await open('Alma', { at: '25,55.4,-90,4' }), B = await open('Bo', { at: '25,58.2,-90,4' }); // side by side before a brick facade east of the street
    const pa = (f, ...x) => A.page.evaluate(f, ...x), pb = (f, ...x) => B.page.evaluate(f, ...x), both = (ms) => Promise.all([pa((m) => T.pump(m), ms), pb((m) => T.pump(m), ms)]);
    check((await pa(() => T.info())).room && (await pb(() => T.info())).room, 'both connected and got the room\'s snapshot', [await pa(() => T.info()), await pb(() => T.info())]);
    const nA = await pa(() => T.paint(0, 24, 0) + T.paint(0, 24, 1) + T.paint(0, 24, 2)); // red, three rows
    await both(3000);
    const nB = await pb(() => T.paint(1, 24, -1) + T.paint(1, 24, 1) + T.paint(3, 24, 0) + T.paint(3, 24, 2)); // blue and yellow
    await both(4000);
    const [ia, ib] = [await pa(() => T.info()), await pb(() => T.info())];
    const [ka, kb] = [await pa(() => T.keys()), await pb(() => T.keys())];
    check(nA >= 20 && nB >= 20, 'both painted', { nA, nB });
    check(ia.count === nA + nB && ib.count === nA + nB && JSON.stringify(ka) === JSON.stringify(kb), 'A and B hold the same spots (each other\'s too)', { ia, ib });
    check(ia.colours.join() === '0,1,3' && ib.colours.join() === '0,1,3', 'red at B, blue/yellow at A');
    await kit.shot(A.page, `${out}/1-spelare-a.png`); await kit.shot(B.page, `${out}/2-spelare-b.png`);
    // a reload of both: the store keeps the spots; the room hands them out again
    await pa(() => __graffiti.save()); await pb(() => __graffiti.save());
    await Promise.all([A.page.reload({ waitUntil: 'commit' }), B.page.reload({ waitUntil: 'commit' })]);
    for (const P of [A, B]) { await P.page.waitForFunction(() => window.__app?.renderer && window.__graffitiSync, null, { timeout: 900000 }); await P.page.evaluate(setup); }
    await both(3000);
    const [ra, rb] = [await pa(() => T.info()), await pb(() => T.info())];
    check(ra.count === nA + nB && rb.count === nA + nB, 'kept after a reload', { ra, rb });
    // a newcomer with an empty store gets the union from the room
    const C = await open('Cilla', { at: '19.6,56.8,-90,5' }); // behind them: the wall and both players
    await C.page.evaluate(() => T.pump(2500));
    const ic = await C.page.evaluate(() => T.info());
    check(ic.count === nA + nB && ic.sent === 0, 'a newcomer gets every spot from the room and sends nothing back', ic);
    await kit.shot(C.page, `${out}/3-nykomling-c.png`);
    await C.ctx.close();
    // 72 h + 1 min later (the clock moved ahead in a fresh page with A's store): gone, also from the room's snapshot
    const storeA = await pa(() => localStorage.getItem('lunden.graffiti'));
    await A.ctx.close(); await B.ctx.close();
    const D = await open('Dag', { clear: false, offset: (72 * 3600 + 60) * 1000 });
    await D.page.evaluate((s) => { localStorage.setItem('lunden.graffiti', s); __graffiti.load(); }, storeA);
    await D.page.evaluate(() => T.pump(2500));
    const id = await D.page.evaluate(() => T.info());
    check(id.count === 0, '72 h + 1 min later the paint is gone', id);
    await D.ctx.close();
    check(!errors.length, 'no page errors', errors);
  } catch (e) { console.log('FAIL', e.stack); failed++; }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
