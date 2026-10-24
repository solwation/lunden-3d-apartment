// #1572: a reload inside the playhouse's children's room (F5 in the same tab, "Ladda om"/update record) comes back INSIDE the
// room, same spot and view, room drawn; a new tab / a new visit still starts as usual.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=… node tools/playroomresumetest.cjs http://localhost:PORT
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8844', shots = process.env.SHOTS || '/tmp/shots1572';
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('lunden.name', 'Barn'); sessionStorage.setItem('lunden.nameSkipped', '1'); } catch {} });
    const url = `${game}/?cloud=&mp=0&quality=3&time=12&month=6&freeze`;
    const load = async (p) => { await p.goto(url, { waitUntil: 'commit' }); await p.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 900000 }); };
    const state = (p) => p.evaluate(() => { const a = window.__app, P = a.player; return { x: +P.pos.x.toFixed(3), z: +P.pos.z.toFixed(3), y: +P.pos.y.toFixed(3), yaw: +a.camera.rotation.y.toFixed(3), pitch: +a.camera.rotation.x.toFixed(3), inRoom: P.inPlayroom, visible: a.world.playroom.object.visible }; });
    await load(page);
    await page.evaluate(() => { const a = window.__app; a.showOverlay(false); a.activeMode = 'mouse'; if (a.rest.active) a.standUp(); a.world.playroom.setInside(true); const ar = a.world.playroom.arrival; a.player.spawn(ar.x - 1.2, ar.z - 0.8, 0.25); a.camera.rotation.set(-0.05, 0.25, 0, 'YXZ'); a.player.update(1 / 60); });
    await page.waitForTimeout(500);
    const s0 = await state(page);
    check(s0.inRoom && s0.visible, 'inside the room before reload', JSON.stringify(s0));
    // the "Ladda om" / update record: the same shape as the running session record, under the one-time key
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
    const rec = await page.evaluate(() => sessionStorage.getItem('lunden.session'));
    check(!!rec && JSON.parse(rec).room === true, 'the session record says room', rec);
    // F5 in the same tab
    await load2(page);
    async function load2(p) { await p.reload({ waitUntil: 'commit' }); await p.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 900000 }); }
    await page.waitForTimeout(800);
    const s1 = await state(page);
    check(s1.inRoom && s1.visible && Math.abs(s1.x - s0.x) < 0.05 && Math.abs(s1.z - s0.z) < 0.05 && Math.abs(s1.yaw - s0.yaw) < 0.02 && Math.abs(s1.pitch - s0.pitch) < 0.02, 'F5: back inside, same spot and view', JSON.stringify(s1));
    await page.evaluate(() => { const a = window.__app; a.showOverlay(false); a.step(0); a.renderer.render(a.scene, a.camera); });
    await page.screenshot({ timeout: 180000, path: `${shots}/after-reload.png` });
    // the one-time "Ladda om" key
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); const r = JSON.parse(sessionStorage.getItem('lunden.session')); r.build = null; sessionStorage.setItem('lunden.resume', JSON.stringify(r)); });
    await load2(page); await page.waitForTimeout(800);
    const s2 = await state(page);
    check(s2.inRoom && s2.visible && Math.abs(s2.x - s0.x) < 0.05 && Math.abs(s2.yaw - s0.yaw) < 0.02, 'update/"Ladda om" record: back inside', JSON.stringify(s2));
    // the room still works: the exit door leads out
    await page.evaluate(() => { const a = window.__app; a.showOverlay(false); a.use(a.world.playroom.exitTarget); });
    await page.waitForTimeout(900);
    const s3 = await state(page);
    check(!s3.inRoom && !s3.visible, 'the exit still leads out', JSON.stringify(s3));
    // a new tab (no session record) starts as usual, outside
    const tab2 = await ctx.newPage();
    await tab2.addInitScript(() => { try { localStorage.setItem('lunden.name', 'Barn'); sessionStorage.setItem('lunden.nameSkipped', '1'); } catch {} });
    await load(tab2); await tab2.waitForTimeout(500);
    const s4 = await state(tab2);
    check(!s4.inRoom && !s4.visible, 'a new tab starts outside the room', JSON.stringify(s4));
  } catch (e) { console.log('ERROR', e.message); failed++; }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
