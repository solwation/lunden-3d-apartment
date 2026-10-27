const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8847';
const out = process.argv[3] || 'docs/verification/1642';

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

    // Helper to position camera and render frame
    const lookAtBall = async () => page.evaluate(({ RM, BL }) => {
      const a = window.__app, P = a.player, cam = a.camera;
      P.spawn(RM.x, RM.z + 1.2, 0);
      cam.position.set(RM.x, 1.4, RM.z + 1.2);
      cam.lookAt(RM.x + BL.x, BL.y, RM.z + BL.z);
      cam.updateMatrixWorld(true);
      a.step(0);
      a.renderer.render(a.scene, a.camera);
    }, { RM, BL });

    // 1. Initial state: Disco ON, cozy dark in BILJARD, spots sweeping directly
    await lookAtBall();
    const sOn1 = await page.evaluate(() => {
      const a = window.__app, r = a.world.playroom;
      const p0 = Array.from(r.spots.geometry.attributes.position.array.slice(0, 6));
      for (let i = 0; i < 30; i++) a.step(1 / 60);
      const p1 = Array.from(r.spots.geometry.attributes.position.array.slice(0, 6));
      const moved = !p0.every((v, i) => Math.abs(v - p1[i]) < 1e-4);
      a.renderer.render(a.scene, a.camera);
      return {
        discoOn: r.discoOn,
        spotsVisible: r.spots.visible,
        moved,
        lit: r.lit,
        ballColor: r.ball.material.color.r,
        zoneLamp: r.zones.lamp.y,
        zoneAmbient: r.zones.ambient.y,
        panelProbe: r.roomPosters?.probe()
      };
    });

    check('disco initially on with spots sweeping directly', sOn1.discoOn && sOn1.spotsVisible && sOn1.moved, sOn1);
    check('disco initial lighting is cozy dark in BILJARD', sOn1.lit < 0.35 && sOn1.zoneLamp <= 0.06 && sOn1.panelProbe.panel_biljard <= 0.1, sOn1);

    await page.screenshot({ path: path.join(out, 'discolampa-pa-mork.png') });

    // 2. Toggle disco OFF
    await page.evaluate(() => {
      const a = window.__app;
      a.use({ kind: 'playroomDisco' });
      for (let i = 0; i < 30; i++) a.step(1 / 60);
      a.renderer.render(a.scene, a.camera);
    });

    const sOff = await page.evaluate(() => {
      const a = window.__app, r = a.world.playroom;
      return {
        discoOn: r.discoOn,
        spotsVisible: r.spots.visible,
        lit: r.lit,
        ballColor: r.ball.material.color.r,
        zoneLamp: r.zones.lamp.y,
        zoneAmbient: r.zones.ambient.y,
        panelProbe: r.roomPosters?.probe()
      };
    });

    check('disco switched off: spots hidden, normal pub lighting restored', !sOff.discoOn && !sOff.spotsVisible && sOff.lit > 0.5 && sOff.zoneLamp >= 0.4 && sOff.panelProbe.panel_biljard >= 0.5, sOff);
    await page.screenshot({ path: path.join(out, 'discolampa-av-tand.png') });

    // 3. Toggle disco ON again
    await page.evaluate(() => {
      const a = window.__app;
      a.use({ kind: 'playroomDisco' });
    });

    const sOn2 = await page.evaluate(() => {
      const a = window.__app, r = a.world.playroom;
      const p0 = Array.from(r.spots.geometry.attributes.position.array.slice(0, 6));
      for (let i = 0; i < 60; i++) a.step(1 / 60);
      const p1 = Array.from(r.spots.geometry.attributes.position.array.slice(0, 6));
      const moved = !p0.every((v, i) => Math.abs(v - p1[i]) < 1e-4);
      a.renderer.render(a.scene, a.camera);
      return {
        discoOn: r.discoOn,
        spotsVisible: r.spots.visible,
        moved,
        lit: r.lit,
        ballColor: r.ball.material.color.r,
        zoneLamp: r.zones.lamp.y,
        zoneAmbient: r.zones.ambient.y,
        panelProbe: r.roomPosters?.probe(),
        inPlayroom: a.player.inPlayroom
      };
    });

    check('disco switched back on: spots sweep directly and cozy dark returns', sOn2.discoOn && sOn2.spotsVisible && sOn2.moved && sOn2.lit < 0.35 && sOn2.zoneLamp <= 0.06, sOn2);
    await page.screenshot({ path: path.join(out, 'discolampa-pa-igen.png') });

    const result = { checks, errors, pass: checks.every(c => c.ok) && errors.length === 0 };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log('Result written to', path.join(out, 'result.json'));
    if (!result.pass) process.exitCode = 1;
  } catch (err) {
    console.error('Execution error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
