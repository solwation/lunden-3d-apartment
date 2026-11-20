// #2235: the real app mounts an e-scooter (sc on the wire); a module peer (real Ghosts) through a local Worker (node cloudflare/dev.mjs PORT)
// sees the scooter under the rider, standing on the deck. Reports the peer's draw calls per remote scooter rider. BEFORE=1: no assertions (baseline images).
// PLAYWRIGHT_MODULE=… SHOTS=/tmp/shots-2235 tools/browsertest.sh node tools/ghostscootertest.cjs GAME WORKER
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8720', worker = process.argv[3] || 'http://localhost:8721';
const shots = process.env.SHOTS || '/tmp/shots-2235', before = !!process.env.BEFORE;
let failed = 0;
const check = (ok, label, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${d ? ' — ' + d : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const launch = () => chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const [b1, b2] = [await launch(), await launch()], errors = [];
  const open = async (b, name) => { const pg = await b.newPage({ viewport: { width: 800, height: 500 } });
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.addInitScript((n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
    await pg.goto(`${game}/?shot&quality=1&time=12&month=6&cloud=${encodeURIComponent(worker)}`, { waitUntil: 'commit' });
    await pg.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 600000 });
    await pg.evaluate(() => { const a = window.__app; a.showOverlay(false); if (a.rest.active) a.standUp(); });
    return pg; };
  try {
    const app = await open(b1, 'Cyklist'), peer = await open(b2, 'Betraktare');
    const info = await app.evaluate(() => { const a = window.__app, list = a.world.bicycles.filter((x) => x.isScooter);
      for (const b of list) { a.player.spawn(b.position.x - 1.2, b.position.z, 0); a.player.pos.y = b.position.y; a.step(0); if (a.player.mountBicycle(b)) return { ok: true, p: [a.player.pos.x, a.player.pos.z, a.player.pos.y], yaw: a.player.riding.yaw }; }
      return { ok: false }; });
    check(info.ok, 'a scooter could be mounted', JSON.stringify(info));
    // ride off the parking spot (the peer's own world still has the parked scooter there), then stop
    const info2 = await app.evaluate(() => { const a = window.__app, pl = a.player; pl.analog.y = 1; for (let i = 0; i < 70; i++) pl.update(1 / 30); pl.analog.y = 0; for (let i = 0; i < 90; i++) pl.update(1 / 30);
      return { ok: !!pl.riding, p: [pl.pos.x, pl.pos.z, pl.pos.y], yaw: pl.riding?.yaw }; });
    Object.assign(info, info2); console.log('rode to', JSON.stringify(info2));
    // the peer stands 3 m ahead of the rider (the rider heads north, -z; the peer looks south at the front)
    await peer.evaluate((i) => { const a = window.__app; a.player.spawn(i.p[0] + 0.8, i.p[1] - 3.2, Math.PI); a.step(0); }, info);
    const seen = () => peer.evaluate(() => { const g = [...window.__ghosts.others.values()].find((x) => x.name === 'Cyklist'); return g ? { bike: !!g.bikeMesh, scooter: !!g.bikeMesh?.userData.scooter, vis: g.root.visible, d: g.dEye } : null; });
    let s1 = null; for (let i = 0; i < 150; i++) { s1 = await seen(); if (s1 && (before || s1.scooter)) break; await new Promise((r) => setTimeout(r, 200)); }
    if (!before) check(s1?.scooter === true, 'peer sees the rider on a scooter (not a bicycle)', JSON.stringify(s1));
    await new Promise((r) => setTimeout(r, 6000));
    const stats = await peer.evaluate(() => { const a = window.__app, g = [...window.__ghosts.others.values()].find((x) => x.name === 'Cyklist');
      const r = a.renderer, calls = () => { a.frame(0.016); r.info.autoReset = false; r.info.reset(); a.frame(0.016); const c = r.info.render.calls; r.info.autoReset = true; return c; };
      const sc = g.bikeMesh, withR = calls(); if (sc) sc.visible = false; const noScooter = calls(); if (sc) sc.visible = true; g.avatar.object.visible = false; const noFigure = calls(); g.avatar.object.visible = true;
      const without = withR - (sc ? withR - noScooter : 0);
      let meshes = 0; g.root.traverse((o) => { if (o.name === 'ghost-scooter') meshes++; }); return { scooterCalls: withR - noScooter, figureCalls: withR - noFigure, withR, noScooter, noFigure, scooters: meshes, wire: g.scooterWire, d: g.dEye }; });
    console.log('draw calls (the rider incl. its name tag and shadow share; the scooter is one of them)', JSON.stringify(stats));
    if (!before) check(stats.scooters === 1 && stats.wire === true, 'exactly one scooter mesh on the peer\'s figure', JSON.stringify(stats));
    await peer.evaluate(() => { window.__app.frame(0.016); });
    await peer.screenshot({ path: `${shots}/scooter.png` });
    await app.evaluate(() => { window.__app.player.dismountBicycle(); });
    let s2 = null; for (let i = 0; i < 100; i++) { s2 = await seen(); if (s2 && !s2.bike) break; await new Promise((r) => setTimeout(r, 200)); }
    check(s2 && !s2.bike, 'after dismounting: the scooter is gone', JSON.stringify(s2));
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } finally { await b1.close(); await b2.close(); }
  process.exit(failed ? 1 : 0);
})();
