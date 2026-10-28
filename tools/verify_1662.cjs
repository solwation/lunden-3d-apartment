const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8847';
const out = process.argv[3] || 'docs/verification/1662';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--headless=new']
  });
  const checks = [], errors = [];
  const check = (name, ok, info) => {
    checks.push({ name, ok, info });
    console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info));
  };

  try {
    const ctx = await browser.newContext({
      viewport: { width: 960, height: 540 }
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('lunden.name', 'Provspelare');
      sessionStorage.setItem('lunden.nameSkipped', '1');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { console.error('PAGEERROR:', e); errors.push(e.message); });
    page.on('crash', () => { console.error('CRASH'); errors.push('page crashed'); });

    await page.goto(`${base}/?test=lazy&shot&time=12&month=6`, { waitUntil: 'domcontentloaded' });

    // Wait for app ready
    const start = Date.now();
    let ready = false;
    while (Date.now() - start < 60000) {
      ready = await page.evaluate(() => !!window.__app?.renderer && !!window.__app?.player);
      if (ready) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!ready) throw Error('Timeout waiting for window.__app');

    // Close overlays and enter playhouse
    await page.evaluate(() => {
      const a = window.__app;
      for (const id of ['install', 'player-dialog']) {
        const e = document.getElementById(id);
        if (e) { if (e.open && e.close) e.close(); e.hidden = true; }
      }
      a.showOverlay(false);
      a.player.spawn(-28.85, 22.7, Math.PI);
      a.step(0);
      a.use({ kind: 'playhouse' });
    });

    const enterStart = Date.now();
    let inside = false;
    while (Date.now() - enterStart < 30000) {
      inside = await page.evaluate(() => !!window.__app?.player?.inPlayroom);
      if (inside) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!inside) throw Error('Timeout waiting for inPlayroom');

    const RM = await page.evaluate(async () => {
      const C = await import('/src/config.js');
      return C.PLAYROOM;
    });
    const BL = RM.furniture.ball;
    const DJ = RM.dj;

    // Verify ball coordinates
    check('disco ball x matches DJ counter center', Math.abs(BL.x - DJ.x) < 0.05, { ballX: BL.x, djX: DJ.x });
    check('disco ball z is above DJ booth', BL.z >= DJ.podium.z0 && BL.z <= DJ.podium.z1 + 0.2, { ballZ: BL.z, podiumZ: [DJ.podium.z0, DJ.podium.z1] });
    check('disco ball has headroom above podium', BL.y - BL.r - DJ.podium.h >= 1.85, { headroom: BL.y - BL.r - DJ.podium.h });

    // Helper to view scene
    const viewScene = async (camPos, lookTarget) => page.evaluate(({ camPos, lookTarget }) => {
      const a = window.__app, P = a.player, cam = a.camera;
      P.spawn(camPos[0], camPos[2], 0);
      cam.position.set(camPos[0], camPos[1], camPos[2]);
      cam.lookAt(lookTarget[0], lookTarget[1], lookTarget[2]);
      cam.updateMatrixWorld(true);
      for (let i = 0; i < 15; i++) a.step(1 / 60);
      a.renderer.render(a.scene, a.camera);
    }, { camPos, lookTarget });

    // 1. Overview screenshot of DJ booth with disco ball hanging above it
    await viewScene(
      [RM.x + 0.2, 1.45, RM.z - 2.5],
      [RM.x + BL.x, BL.y - 0.3, RM.z + BL.z]
    );
    await page.screenshot({ timeout: 180000, path: path.join(out, '01-discokula-over-dj-bas.png') });
    check('captured overview of disco ball above DJ booth', true);

    // 2. Close-up screenshot of disco ball and DJ booth
    await viewScene(
      [RM.x + 1.2, 1.6, RM.z - 3.2],
      [RM.x + BL.x, BL.y, RM.z + BL.z]
    );
    await page.screenshot({ timeout: 180000, path: path.join(out, '02-discokula-narbild.png') });
    check('captured close-up of disco ball', true);

    // 3. Test aiming at the disco ball itself and switching it off
    const aimResult = await page.evaluate(({ RM, BL }) => {
      const a = window.__app, P = a.player, cam = a.camera;
      P.spawn(RM.x + BL.x, RM.z + BL.z + 1.2, 0);
      for (let i = 0; i < 20; i++) P.update(1 / 60);
      cam.updateMatrixWorld(true);
      const d = new cam.position.constructor(RM.x + BL.x, BL.y, RM.z + BL.z).sub(cam.position);
      cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ');
      a.touch.enabled = true;
      a.step(0);
      a.step(0);
      const f = a.focus();
      a.touch.enabled = false;
      return { focused: f.focused ? { kind: f.focused.kind, name: f.focused.name, verb: f.focused.verb } : null };
    }, { RM, BL });
    check('ball itself is an interact target to turn off', aimResult.focused?.kind === 'playroomDisco' && aimResult.focused?.verb === 'släcka', aimResult);

    // Toggle off
    await page.evaluate(({ RM, BL }) => {
      const a = window.__app, P = a.player, cam = a.camera;
      P.spawn(RM.x + BL.x, RM.z + BL.z + 1.2, 0);
      for (let i = 0; i < 20; i++) P.update(1 / 60);
      cam.updateMatrixWorld(true);
      const d = new cam.position.constructor(RM.x + BL.x, BL.y, RM.z + BL.z).sub(cam.position);
      cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ');
      a.touch.enabled = true;
      a.step(0);
      a.use(a.focus().focused);
      a.touch.enabled = false;
      for (let i = 0; i < 10; i++) a.step(1 / 60);
      a.renderer.render(a.scene, a.camera);
    }, { RM, BL });
    const stateOff = await page.evaluate(() => {
      const r = window.__app.world.playroom;
      return { discoOn: r.discoOn, spotsVisible: r.spots.visible, ballColor: r.ball.material.color.r };
    });
    check('disco turned off: ball dull and spots hidden', !stateOff.discoOn && !stateOff.spotsVisible && stateOff.ballColor < 0.5, stateOff);

    await page.screenshot({ timeout: 180000, path: path.join(out, '03-discokula-slackt.png') });

    // Toggle back on
    await page.evaluate(({ RM, BL }) => {
      const a = window.__app, P = a.player, cam = a.camera;
      P.spawn(RM.x + BL.x, RM.z + BL.z + 1.2, 0);
      for (let i = 0; i < 20; i++) P.update(1 / 60);
      cam.updateMatrixWorld(true);
      const d = new cam.position.constructor(RM.x + BL.x, BL.y, RM.z + BL.z).sub(cam.position);
      cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ');
      a.touch.enabled = true;
      a.step(0);
      a.use(a.focus().focused);
      a.touch.enabled = false;
      for (let i = 0; i < 10; i++) a.step(1 / 60);
      a.renderer.render(a.scene, a.camera);
    }, { RM, BL });
    const stateOn = await page.evaluate(() => {
      const r = window.__app.world.playroom;
      return { discoOn: r.discoOn, spotsVisible: r.spots.visible, ballColor: r.ball.material.color.r };
    });
    check('disco turned back on: spots visible and ball bright', stateOn.discoOn && stateOn.spotsVisible && stateOn.ballColor > 0.8, stateOn);

    console.log(`\nVerification complete: ${checks.filter(c => c.ok).length}/${checks.length} checks passed.`);
    if (checks.some(c => !c.ok) || errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})();
