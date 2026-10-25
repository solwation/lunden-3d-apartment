const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('/home/olof/untappdbolaget/node_modules/playwright');
const base = process.argv[2] || 'http://localhost:8847';
const out = process.argv[3] || 'docs/verification/1595';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const checks = [], errors = [];
  const check = (name, ok, info) => { checks.push({ name, ok, info }); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
    await ctx.addInitScript(() => { localStorage.setItem('lunden.name', 'Mobilprov'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { console.error('PAGEERROR:', e); errors.push(e.message); });
    page.on('crash', () => { console.error('CRASH'); errors.push('page crashed'); });

    await page.goto(`${base}/?freeze&time=12&month=6&cloud=`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.warm && ['done', 'drawn', 'skipped'].includes(window.__app.warm.state), null, { timeout: 900000, polling: 1000 });

    // Close overlays
    await page.evaluate(() => {
      for (const id of ['install', 'player-dialog']) { const e = document.getElementById(id); if (e) { if (e.open && e.close) e.close(); e.hidden = true; } }
      document.getElementById('start-touch').click();
    });
    await page.waitForTimeout(500);

    const isLowMem = await page.evaluate(() => window.__app.isPhoneDevice());
    check('phone profile lowMemory active', isLowMem);

    // Teleport to playhouse and enter
    await page.evaluate(() => {
      const a = window.__app;
      a.showOverlay(false);
      a.player.spawn(-28.85, 22.7, Math.PI);
      a.step(0);
      a.use({ kind: 'playhouse' });
    });
    await page.waitForTimeout(800);

    const RM = await page.evaluate(async () => { const C = await import('/src/config.js'); return C.PLAYROOM; });
    const DSW = RM.furniture.discoSwitch, BL = RM.furniture.ball;

    // Aim helper
    const aimAt = async (from, to) => page.evaluate(({ from, to }) => {
      const a = window.__app, P = a.player, cam = a.camera;
      P.spawn(from[0], from[1], 0);
      for (let i = 0; i < 20; i++) P.update(1 / 60);
      cam.updateMatrixWorld(true);
      const d = new cam.position.constructor(to[0], to[1], to[2]).sub(cam.position);
      cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ');
      a.touch.enabled = true;
      a.step(0);
      a.step(0);
      const f = a.focus();
      return { focused: f.focused ? { kind: f.focused.kind, name: f.focused.name, verb: f.focused.verb } : null, actionText: document.getElementById('action').textContent, actionHidden: document.getElementById('action').hidden };
    }, { from, to });

    // 1. Initial state: Disco ON
    await aimAt([RM.x, RM.z + 0.9], [RM.x + BL.x, BL.y, RM.z + BL.z]);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, 'discolampa-pa.png') });

    const sOn1 = await page.evaluate(() => {
      const a = window.__app, r = a.world.playroom;
      return { discoOn: r.discoOn, spotsVisible: r.spots.visible, lit: r.lit, ballColor: r.ball.material.color.r };
    });
    check('disco initially on', sOn1.discoOn && sOn1.spotsVisible, sOn1);

    // 2. Aim at switch and toggle OFF
    const fsw = await aimAt([RM.x + DSW.x - 0.3, RM.z + DSW.z - 0.7], [RM.x + DSW.x, DSW.y, RM.z + DSW.z]);
    check('switch aimed to turn off', fsw.focused?.kind === 'playroomDisco' && !fsw.actionHidden);
    await page.locator('#action').tap();
    await page.waitForTimeout(500);

    // Aim back at ball to show OFF state
    await aimAt([RM.x, RM.z + 0.9], [RM.x + BL.x, BL.y, RM.z + BL.z]);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, 'discolampa-av.png') });

    const sOff = await page.evaluate(() => {
      const a = window.__app, r = a.world.playroom;
      return { discoOn: r.discoOn, spotsVisible: r.spots.visible, lit: r.lit, ballColor: r.ball.material.color.r, actionText: document.getElementById('action').textContent };
    });
    check('disco switched off without error', !sOff.discoOn && !sOff.spotsVisible && sOff.ballColor < 0.5, sOff);

    // 3. Aim at ball and toggle ON again
    await page.locator('#action').tap();
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(out, 'discolampa-pa-igen.png') });

    const sOn2 = await page.evaluate(() => {
      const a = window.__app, r = a.world.playroom;
      for (let i = 0; i < 60; i++) a.step(1 / 60);
      return { discoOn: r.discoOn, spotsVisible: r.spots.visible, lit: r.lit, ballColor: r.ball.material.color.r, inPlayroom: a.player.inPlayroom };
    });
    check('disco switched back on and rendered 60 frames cleanly', sOn2.discoOn && sOn2.spotsVisible && sOn2.inPlayroom, sOn2);

    check('zero page errors throughout', errors.length === 0, errors);

    const allPassed = checks.every((c) => c.ok);
    const resultData = {
      issue: 1595,
      timestamp: new Date().toISOString(),
      passed: allPassed,
      checks,
      errors,
      states: { initialOn: sOn1, turnedOff: sOff, backOn: sOn2 }
    };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(resultData, null, 2));
    console.log(allPassed ? 'ALL PASS' : 'FAILURES OCCURRED');
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Execution error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
