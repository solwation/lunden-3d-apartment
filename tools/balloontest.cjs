// Hot-air balloon (#1646, #1770, src/balloon.js, src/balloonbeer.js): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/balloontest.cjs http://localhost:8646 /tmp/shots1646`
// Checks: hidden + no mesh work when not scheduled; visible when forced; landing in the basket, staying put and being carried over several
// seconds of drift; the rim holds you in; one draw call for the whole balloon; #1770: the gores are in rainbow order, the schedule is rare
// (2–3 h period, ≤ 10 min window), the basket's beers ride with it, can be taken and drunk (beer count, life portion) and are restocked at
// the next appearance; screenshots.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8646', out = process.argv[3] || '/tmp/shots1646';
require('fs').mkdirSync(out, { recursive: true });
let pass = true;
const check = (ok, name, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); pass &&= !!ok; };
async function open(browser, q) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (e) => { console.log('pageerror', e.message); pass = false; });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
  await page.goto(`${base}/index.html?shot&test&time=12&month=7&day=10&weather=clear${q}`);
  await page.waitForFunction(() => window.__app?.balloon !== undefined, null, { timeout: 420000 });
  await page.waitForTimeout(1500);
  return page;
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // 1. not scheduled: hidden, no draw call
  let page = await open(browser, '');
  const idle = await page.evaluate(() => {
    const a = window.__app, b = a.balloon; b.clock = () => 1000; // 1000 s into the period, after the 600 s window: not scheduled
    for (let i = 0; i < 5; i++) a.step(1 / 30);
    let n = 0; const r = a.renderer.renderBufferDirect; a.renderer.renderBufferDirect = function (c, s, g, m, o) { if (o === b.mesh) n++; return r.apply(this, arguments); };
    a.renderer.render(a.scene, a.camera); a.renderer.renderBufferDirect = r;
    return { visible: b.mesh.visible, active: b.active, calls: n };
  });
  check(!idle.visible && !idle.active && idle.calls === 0, 'not scheduled: hidden, no draw call', JSON.stringify(idle));
  const on = await page.evaluate(() => {
    const a = window.__app, b = a.balloon; b.clock = () => 300;
    for (let i = 0; i < 5; i++) a.step(1 / 30);
    let n = 0; const r = a.renderer.renderBufferDirect; a.renderer.renderBufferDirect = function (c, s, g, m, o) { if (o === b.mesh) n++; return r.apply(this, arguments); };
    a.camera.position.set(b.pos.x, b.pos.y + 6, b.pos.z + 40); a.camera.lookAt(b.pos.x, b.pos.y + 8, b.pos.z);
    a.renderer.render(a.scene, a.camera); a.renderer.renderBufferDirect = r;
    return { visible: b.mesh.visible, active: b.active, calls: n, tris: b.mesh.geometry.index ? b.mesh.geometry.index.count / 3 : b.mesh.geometry.attributes.position.count / 3 };
  });
  check(on.visible && on.active && on.calls === 1, 'scheduled: one draw call', JSON.stringify(on));
  // 2. land in the basket, stay, be carried
  const land = await page.evaluate(async () => {
    const a = window.__app, b = a.balloon, p = a.player; a.step = (dt) => { b.update(p, false); p.update(dt); }; let t = 300; b.clock = () => t;
    a.step(1 / 30);
    b.aboard = false; b.last.ok = false; a.step(1 / 30); p.pos.set(b.pos.x + 0.4, b.pos.y + 0.5, b.pos.z); p.vy = 0; p.fall = null;
    const log = [];
    for (let i = 0; i < 300; i++) { t += 1 / 30; a.step(1 / 30); if (i % 60 === 59) log.push([+(p.pos.y - b.pos.y).toFixed(3), +Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z).toFixed(2)]); }
    // walk at the rim: forward hard for 3 s
    p.camera.rotation.y = 0;
    return { log, aboard: b.aboard };
  });
  check(land.aboard && land.log.every(([dy, d]) => Math.abs(dy) < 0.02 && d < 1.2), 'lands, stays standing and is carried over 10 s of drift', JSON.stringify(land.log));
  const rim = await page.evaluate(() => {
    const a = window.__app, b = a.balloon, p = a.player; a.step = (dt) => { b.update(p, false); p.update(dt); }; let t = 400; b.clock = () => t; b.aboard = false; b.last.ok = false; a.step(1 / 30);
    p.pos.set(b.pos.x, b.pos.y, b.pos.z); a.step(1 / 30);
    let maxd = 0;
    for (let i = 0; i < 90; i++) { p.pos.x += 0.1; t += 1 / 30; a.step(1 / 30); maxd = Math.max(maxd, Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z)); }
    return { maxd, dy: p.pos.y - b.pos.y };
  });
  check(rim.maxd < 1.16 && Math.abs(rim.dy) < 0.02, 'rim blocks walking out', JSON.stringify(rim));
  // 4. #1770: rainbow gores, a rare schedule
  const look = await page.evaluate(async () => {
    const { BALLOON: B } = await import('/src/config.js'), { balloonScale } = await import('/src/balloongeo.js');
    const g = window.__app.balloon.mesh.geometry, P = g.attributes.position, C = g.attributes.color, cy = B.envLow + B.envR * 0.92;
    const norm = (r, gg, b) => { const m = Math.max(r, gg, b) || 1; return [r / m, gg / m, b / m]; };
    const stripes = [];
    for (let s = 0; s < B.stripes; s++) {
      const mid = -Math.PI + (s + 0.5) * (Math.PI * 2) / B.stripes; let best = null;
      for (let i = 0; i < P.count; i += 3) {
        const x = P.getX(i) + P.getX(i + 1) + P.getX(i + 2), y = (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, z = P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2);
        if (Math.abs(y - cy) > 3) continue;
        const d = Math.abs(Math.atan2(Math.sin(Math.atan2(z, x) - mid), Math.cos(Math.atan2(z, x) - mid)));
        if (!best || d < best.d) best = { d, i };
      }
      const got = norm(C.getX(best.i), C.getY(best.i), C.getZ(best.i)), hex = B.rainbow[s % B.rainbow.length];
      const want = norm(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
      // (vertex colours are linear, the config hex sRGB: compare after converting the wanted one)
      const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), wl = norm(...want.map(lin));
      stripes.push({ s, ok: got.every((v, k) => Math.abs(v - wl[k]) < 0.04) });
    }
    let on = 0; const N = 3 * B.period;
    for (let t = 0; t < N; t += 5) if (balloonScale(t) > 0) on++;
    return { stripes: stripes.filter((x) => !x.ok).map((x) => x.s), n: B.stripes, colours: B.rainbow.length, period: B.period, window: B.window, frac: on * 5 / N };
  });
  check(look.stripes.length === 0 && look.colours === 7, 'envelope gores in rainbow order (red, orange, yellow, green, blue, indigo, violet, repeated)', JSON.stringify(look));
  check(look.period >= 7200 && look.period <= 10800 && look.window <= 600 && look.frac < 0.08, 'rare schedule: 2–3 h period, ≤ 10 min window', JSON.stringify({ period: look.period, window: look.window, frac: +look.frac.toFixed(4) }));
  // 5. #1770: beers in the basket: ride along, taken + drunk like a shelf beer, restocked next appearance
  const beer = await page.evaluate(async () => {
    const { BALLOON: B } = await import('/src/config.js');
    const a = window.__app, b = a.balloon, p = a.player, bs = b.beers; let t = 300; b.clock = () => t;
    a.step = (dt) => { b.update(p, false); p.update(dt); for (const x of bs) x.update(dt); };
    const out = { count: bs.length };
    // hidden balloon: nothing to take
    p.pos.set(b.pos.x + 30, b.pos.y + 5, b.pos.z); b.aboard = false; b.clock = () => 1000; a.step(1 / 30); out.hiddenTarget = bs.every((x) => x.target !== x.takeTarget) && !b.mesh.visible; // (not aboard: aboard keeps it up)
    b.clock = () => t; b.aboard = false; b.last.ok = false; a.step(1 / 30);
    p.pos.set(b.pos.x + 0.3, b.pos.y, b.pos.z - 0.2); p.vy = 0; p.fall = null; a.step(1 / 30);
    out.shownTarget = bs.every((x) => x.target === x.takeTarget);
    const w = new (a.camera.position.constructor)();
    out.inBasket = bs.map((x) => { x.model.getWorldPosition(w); return [+Math.hypot(w.x - b.pos.x, w.z - b.pos.z).toFixed(3), +(w.y - b.pos.y).toFixed(3)]; });
    // ride along for 10 s of drift
    const w0 = bs[3].model.getWorldPosition(w.clone()), b0 = { ...b.pos };
    for (let i = 0; i < 300; i++) { t += 1 / 30; a.step(1 / 30); }
    const w1 = bs[3].model.getWorldPosition(w.clone());
    out.ride = { basket: +Math.hypot(b.pos.x - b0.x, b.pos.z - b0.z).toFixed(2), err: +Math.hypot((w1.x - w0.x) - (b.pos.x - b0.x), (w1.z - w0.z) - (b.pos.z - b0.z), w1.y - w0.y).toFixed(4), aboard: b.aboard };
    // take one and drink it up
    let consumed = [];
    const cons = a.combat.consume.bind(a.combat); a.combat.consume = (id, ...r) => { consumed.push(id); return cons(id, ...r); };
    const beers0 = a.stats.beer ?? 0, x = bs[0], id0 = x.portionId;
    x.take(); out.held = x.held && a.heldItem() === x && x.useLabel === 'Drick';
    for (let i = 0; i < B.beer.count + 10 && x.ml > 0; i++) { x.use(); for (let k = 0; k < 20; k++) { t += 1 / 30; a.step(1 / 30); } }
    a.combat.consume = cons;
    out.unsaved = !JSON.stringify(a.keepWorld()).includes('ballongkorgen'); // (held, empty: still not in the saved world)
    out.drunk = { ml: x.ml, gulps: (a.stats.beer ?? 0) - beers0, finished: !!x.portion.finished, consumed, id0, toasted: b.toasted };
    // put it back, empty; the next appearance restocks it, full, with a new portion
    x.putBack(); a.step(1 / 30);
    t += B.period; a.step(1 / 30);
    out.restock = { ml: x.ml, full: x.full, id: x.portionId, home: x.model.parent === b.beerGroup, visible: x.model.visible, toasted: b.toasted };
    // draw calls: only the balloon + one per bottle while it is up
    const meshes = new Set(bs.map((y) => y.model.children[0]));
    let n = 0; const r = a.renderer.renderBufferDirect; a.renderer.renderBufferDirect = function (c, s, g, m, o) { if (meshes.has(o)) n++; return r.apply(this, arguments); };
    a.camera.position.set(b.pos.x, b.pos.y + 2, b.pos.z + 3); a.camera.lookAt(b.pos.x, b.pos.y, b.pos.z); a.camera.updateMatrixWorld();
    a.renderer.render(a.scene, a.camera); out.calls = n; n = 0;
    b.clock = () => 1000; a.step(1 / 30); a.renderer.render(a.scene, a.camera); out.hiddenCalls = n; a.renderer.renderBufferDirect = r;
    b.clock = () => t;
    return out;
  });
  check(beer.count === 4 && beer.inBasket.every(([d, dy]) => d < 1.06 && Math.abs(dy - 0.02) < 0.01), 'beers stand on the basket floor', JSON.stringify(beer.inBasket));
  check(beer.hiddenTarget && beer.shownTarget, 'beers can be taken only while the balloon is up', JSON.stringify({ hidden: beer.hiddenTarget, shown: beer.shownTarget }));
  check(beer.ride.basket > 20 && beer.ride.err < 0.01 && beer.ride.aboard, 'beers ride with the basket over 10 s of drift', JSON.stringify(beer.ride));
  check(beer.held && beer.drunk.ml === 0 && beer.drunk.gulps === 5 && beer.drunk.finished && beer.drunk.consumed.includes(beer.drunk.id0) && beer.drunk.toasted, 'take a beer in the basket and drink it (5 gulps counted, life portion claimed)', JSON.stringify(beer.drunk));
  check(beer.unsaved, 'balloon beers are not saved (keep.js)');
  check(beer.restock.ml === beer.restock.full && beer.restock.id !== beer.drunk.id0 && beer.restock.home && beer.restock.visible && !beer.restock.toasted, 'restocked full at the next appearance', JSON.stringify(beer.restock));
  check(beer.calls >= 1 && beer.calls <= 4 && beer.hiddenCalls === 0, 'beers: ≤ one draw call per bottle while up, none while hidden', JSON.stringify({ calls: beer.calls, hidden: beer.hiddenCalls }));
  // 3. screenshots
  await page.evaluate(() => {
    const a = window.__app, b = a.balloon, p = a.player; b.clock = () => 400; b.aboard = false; b.last.ok = false; a.step(1 / 30);
    p.pos.set(b.pos.x + 0.2, b.pos.y, b.pos.z + 0.1); a.step(1 / 30);
    a.player.eyeY = p.pos.y + 1.62;
    p.camera.rotation.set(-0.35, Math.PI * 0.25, 0);
  });
  await page.addStyleTag({ content: '#player-dialog, #qr, #corner-qr, [class*=qr] { display: none !important }' }); // (the name dialog / QR panel would cover the picture)
  await page.waitForTimeout(500); await page.screenshot({ path: `${out}/in-basket.png` });
  await page.evaluate(() => { // #1770: looking down at the beers on the basket floor
    const a = window.__app, b = a.balloon, p = a.player, x = b.beers[1]; p.pos.set(b.pos.x - 0.12, b.pos.y, b.pos.z + 0.12); p.vy = 0; a.step(1 / 30);
    const w = x.model.getWorldPosition(a.camera.position.clone()); p.eyeY = p.pos.y + 1.62; p.camera.position.set(p.pos.x, p.eyeY, p.pos.z);
    p.camera.rotation.set(-1.0, Math.atan2(-(w.x - p.pos.x), -(w.z - p.pos.z)), 0, 'YXZ');
  });
  await page.waitForTimeout(500); await page.screenshot({ path: `${out}/beers-in-basket.png` });
  await page.evaluate(() => { // #1770: a beer taken and lifted to drink
    const a = window.__app, x = a.balloon.beers[2]; x.take(); x.cool = 0; x.use(); a.player.camera.rotation.x = 0.05;
  });
  await page.waitForTimeout(280); await page.screenshot({ path: `${out}/drinking.png` });
  await page.evaluate(() => { const x = window.__app.balloon.beers[2]; x.putBack(); });
  await page.evaluate(() => {
    const a = window.__app, b = a.balloon, p = a.player; b.aboard = false;
    p.pos.set(b.pos.x - 8, b.pos.y + 2, b.pos.z + 45); p.vy = 0; p.eyeY = p.pos.y + 1.62; p.camera.position.set(p.pos.x, p.eyeY, p.pos.z); p.camera.rotation.set(0.12, 0, 0);
    a.step = () => {}; // hold still for the picture
  });
  await page.waitForTimeout(500); await page.screenshot({ path: `${out}/balloon-above-clouds.png` });
  await browser.close();
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})();
