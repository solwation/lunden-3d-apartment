// Hot-air balloon (#1646, src/balloon.js): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/balloontest.cjs http://localhost:8646 /tmp/shots1646`
// Checks: hidden + no mesh work when not scheduled; visible when forced; landing in the basket, staying put and being carried over several
// seconds of drift; the rim holds you in; one draw call for the whole balloon; screenshots.
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
    const a = window.__app, b = a.balloon; b.clock = () => 1000; // 1000 s into a 1500 s period, window 600: not scheduled
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
  // 3. screenshots
  await page.evaluate(() => {
    const a = window.__app, b = a.balloon, p = a.player; b.clock = () => 400; b.aboard = false; b.last.ok = false; a.step(1 / 30);
    p.pos.set(b.pos.x + 0.2, b.pos.y, b.pos.z + 0.1); a.step(1 / 30);
    a.player.eyeY = p.pos.y + 1.62;
    p.camera.rotation.set(-0.35, Math.PI * 0.25, 0);
  });
  await page.addStyleTag({ content: '#player-dialog, #qr, [class*=qr] { display: none !important }' }); // (the name dialog / QR panel would cover the picture)
  await page.waitForTimeout(500); await page.screenshot({ path: `${out}/in-basket.png` });
  await page.evaluate(() => {
    const a = window.__app, b = a.balloon, p = a.player; b.aboard = false;
    p.pos.set(b.pos.x - 8, b.pos.y + 2, b.pos.z + 45); p.vy = 0; p.eyeY = p.pos.y + 1.62; p.camera.position.set(p.pos.x, p.eyeY, p.pos.z); p.camera.rotation.set(0.12, 0, 0);
    a.step = () => {}; // hold still for the picture
  });
  await page.waitForTimeout(500); await page.screenshot({ path: `${out}/balloon-above-clouds.png` });
  await browser.close();
  console.log(pass ? 'ALL PASS' : 'FAILED'); process.exit(pass ? 0 : 1);
})();
