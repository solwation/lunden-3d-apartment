// #1773: footprints in the snow, three real clients against the local Worker. Start both first:
//   python3 tools/devserve.py 8196 .      node cloudflare/dev.mjs 8197 testtoken
//   tools/browsertest.sh node tools/footprintstest.cjs http://localhost:8196 http://localhost:8197 OUT_DIR
// In January with snow falling: A walks over the courtyard lawn, across Karpvägen's ploughed road and into our flat (through the walls:
// spawned step by step). A makes shoe prints on the snow, none on the road or indoors; B sees A's prints, made from A's synced positions;
// a late third client C sees them from the room's history in its welcome. Paw prints follow an outdoor cat on a snow-day outing. With the
// clock 15 min on the prints are half faded, 30 min on gone and nothing is drawn. Pictures: fresh shoe and paw prints, half faded.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8196', worker = 'http://localhost:8197', out = '/tmp/footprints'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
// the route: on the courtyard lawn west to east, then north across the road west of the house, then into the flat
const setup = async () => {
  const a = __app, F = a.footprints; a.renderer.setAnimationLoop(null); a.showOverlay(false); document.getElementById('corner-qr')?.style.setProperty('display', 'none');
  const roads = await import('/src/roads.js');
  window.T = { a, F, roads,
    async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 50)); } },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.02); },
    /** walk (spawned every 0.12 m, the game's frames between) along the points; ~1.5 m/s with the frames' pumping */
    async walk(pts) { for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.12), yaw = Math.atan2(-(bx - ax), -(bz - az)); for (let k = 0; k <= n; k++) { a.player.spawn(ax + (bx - ax) * k / n, az + (bz - az) * k / n, yaw); a.step(0.08); if (k % 3 === 0) { __ghosts.update(0.08); await new Promise((r) => setTimeout(r, 70)); } } } },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    info() { const s = F.state(); return { snow: s.snow, count: s.count, live: s.live, drawn: s.drawn, net: s.net, shoes: s.list.filter((p) => p.kind === 'shoe' && p.fade > 0).length, paws: s.list.filter((p) => p.kind === 'paw' && p.fade > 0).length, me: __ghosts.me, others: __ghosts.others.size }; },
    /** live shoe prints near a path segment list (within r m of it) */
    near(pts, r = 0.6, kind = 'shoe') { const seg = (p, a1, b1) => { const vx = b1[0] - a1[0], vz = b1[1] - a1[1], L = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((p.x - a1[0]) * vx + (p.z - a1[1]) * vz) / L)); return Math.hypot(p.x - a1[0] - vx * t, p.z - a1[1] - vz * t); };
      return F.state().list.filter((p) => p.kind === kind && p.fade > 0 && pts.slice(1).some((b1, i) => seg(p, pts[i], b1) < r)); },
    bad() { const s = F.state(), W = a.world.size; return s.list.filter((p) => roads.onRoad(p.x, p.z, 0) || (p.x > 0 && p.x < W.x && p.z > 0 && p.z < W.z)).map((p) => [p.x.toFixed(2), p.z.toFixed(2)]); },
    hideOthers(on) { for (const g of __ghosts.others.values()) g.root.visible = !on; },
    zoom(fov) { a.camera.userData.fov0 ??= a.camera.fov; a.camera.fov = fov ?? a.camera.userData.fov0; a.camera.updateProjectionMatrix(); } };
};
const LAWN = [[-9, 22.6], [-4, 22.2], [1, 22.8], [5, 23.6]]; // the courtyard's middle lawn (Sotis's loop runs here, so it is grass)
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=1&weather=snow&freeze&shot&cloud=${worker}&at=-12,26,0,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.footprints && window.__ghosts?.connected, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const A = await open('Alma'), B = await open('Bo');
    const pa = (f, x) => A.page.evaluate(f, x), pb = (f, x) => B.page.evaluate(f, x);
    await Promise.all([pa(() => T.pump(1500)), pb(() => T.pump(1500))]);
    const start = await pb(() => T.info());
    check(start.snow && start.others === 1, 'January: snow lies, B sees A', start);
    // the road and the flat: where are they relative to the lawn? (a road crossing found from roads.js, the flat from its size)
    const route = await pa(() => {
      const { roads, a } = T; let road = null;
      let z0 = null, z1 = null; // the first road north of the courtyard along x = -12: from where it starts to where it ends
      for (let z = 20; z > -60; z -= 0.25) { const on = roads.onRoad(-12, z, 0); if (on && z0 === null) z0 = z; if (!on && z0 !== null) { z1 = z; break; } }
      return { road: z0 !== null && z1 !== null ? [z0, z1] : null, W: a.world.size };
    });
    // A walks: the lawn (snow), then across the road found south of it, then inside our flat
    const crossing = route.road ? [[-12, route.road[0] + 3], [-12, route.road[1] - 3]] : null; // (northwards)
    const inFlat = [[1, 3], [route.W.x - 1, route.W.z - 2]];
    const walking = B.page.evaluate(() => T.pump(16000));
    await pa((p) => T.walk(p), LAWN);
    if (crossing) { await pa((p) => { T.stand(...p[0]); }, crossing); await pa((p) => T.walk(p), crossing); }
    await pa((p) => { T.stand(...p[0]); }, inFlat); await pa((p) => T.walk(p), inFlat);
    await pa(() => T.stand(-12, 26)); await pa(() => T.pump(1500));
    await walking;
    const mine = await pa((L) => ({ lawn: T.near(L).length, info: T.info(), bad: T.bad() }), LAWN);
    const seen = await pb((L) => ({ lawn: T.near(L).length, info: T.info(), bad: T.bad() }), LAWN);
    const expected = Math.floor(15 / 0.68);
    check(mine.lawn >= expected * 0.8, `A leaves shoe prints on the snowy lawn (~${expected})`, mine);
    check(seen.lawn >= expected * 0.6, 'B sees A\'s prints, made from A\'s synced positions', seen);
    if (crossing) {
      const road = await pb((c) => ({ road: T.near(c, 0.6).filter((p) => T.roads.onRoad(p.x, p.z, 0)).length, beside: T.near(c, 0.6).length }), crossing);
      check(road.road === 0, 'no prints on the ploughed road', road);
    } else check(false, 'found a road to cross', route);
    check(mine.bad.length === 0 && seen.bad.length === 0, 'no prints on any road or inside the flat (A and B)', { a: mine.bad.slice(0, 5), b: seen.bad.slice(0, 5) });
    // a late third client: the room's history
    const C = await open('Cleo'), pc = (f, x) => C.page.evaluate(f, x);
    await pc(() => T.pump(1500));
    const late = await pc((L) => ({ lawn: T.near(L).length, info: T.info(), bad: T.bad() }), LAWN);
    check(late.info.net > 0 && late.lawn >= expected * 0.5 && late.bad.length === 0, 'a late joiner sees A\'s prints from the room\'s history', late);
    // pictures: B looking at A's fresh prints on the lawn
    const picture = async (page, at, target, file, fov = 50) => { await page.evaluate(({ at, target, fov }) => { T.a.testMode.setFull(true); T.stand(at[0], at[1]); T.hideOthers(true); T.look(target[0], T.a.player.pos.y, target[1]); T.zoom(fov); T.a.step(0.016); }, { at, target, fov }); await kit.shot(page, `${out}/${file}`); await page.evaluate(() => { T.zoom(); T.hideOthers(false); }); };
    await picture(B.page, [-6, 26.5], [-3, 22.4], '1-spelarspar-farska.png');
    // paw prints: a cat on a snow-day outing (the cats' and the prints' clock moved to a window where Sotis was out walking)
    const paws = await pb(() => {
      const O = T.a.outdoorCats, c = O.cats.find((q) => q.name === 'Sotis'), now = Date.now() / 1000;
      let shift = null;
      for (let s = 0; s < 86400 * 3 && shift === null; s += 30) if (O.snowOut(c, now + s) && O.snowOut(c, now + s - 240)) shift = s;
      T.F.skew = shift; O.now = () => Date.now() / 1000 + shift; T.F.rebuild(T.F.now(), true);
      O.cats.forEach((q) => { if (q.st === 'away') { q.st = 'route'; q.awayUntil = 0; } });
      return { shift, info: T.info() };
    });
    await pb(() => T.pump(2500));
    const pawInfo = await pb(() => { const s = T.F.state(), P = s.list.filter((p) => p.kind === 'paw' && p.fade > 0); const c = T.a.outdoorCats.cats.find((q) => q.name === 'Sotis'); return { n: P.length, onRoad: P.filter((p) => T.roads.onRoad(p.x, p.z, 0)).length, cat: [c.x, c.z, c.group.visible, c.st], last: P.slice(-3).map((p) => [p.x.toFixed(2), p.z.toFixed(2), p.age.toFixed(0)]) }; });
    check(paws.shift !== null && pawInfo.n > 20 && pawInfo.onRoad === 0, 'paw prints behind an outdoor cat on a snow-day outing (rebuilt from its clock-driven loop)', pawInfo);
    const cp = await pb(() => { const c = T.a.outdoorCats.cats.find((q) => q.name === 'Sotis'), P = T.F.state().list.filter((p) => p.kind === 'paw' && p.fade > 0.9); const p = P[P.length - 1] ?? { x: c.x, z: c.z }; return [p.x, p.z]; });
    await picture(B.page, [cp[0] + 1.6, cp[1] + 1.6], cp, '2-tassavtryck-farska.png', 40);
    // half faded: 15 minutes on (all the prints so far)
    await Promise.all([pb(() => { T.F.skew += 900; T.a.step(0.05); }), pc(() => { T.F.skew = 900; T.a.step(0.05); })]);
    const half = await pc((L) => T.near(L).map((p) => p.fade), LAWN);
    check(half.length > 0 && half.every((f) => f > 0.3 && f < 0.7), 'a quarter of an hour on: half faded', { n: half.length, min: Math.min(...half), max: Math.max(...half) });
    await picture(C.page, [-6, 26.5], [-3, 22.4], '3-spelarspar-halvt-blekta.png');
    await picture(B.page, [cp[0] + 1.6, cp[1] + 1.6], cp, '4-tassavtryck-halvt-blekta.png', 40);
    // 30 minutes after they were made: gone, nothing drawn
    const gone = await pc(async () => { const w = T.F.sources; T.F.sources = () => w().filter((x) => x.kind === 0); T.F.skew = 1801; await T.pump(1500); const s = T.F.state(); return { live: s.live, drawn: s.drawn, visible: s.visible, count: s.count }; }); // (C's cats keep still: only the old prints count)
    check(gone.live === 0 && gone.drawn === 0 && !gone.visible, 'half an hour on: every print gone and nothing drawn', gone);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
