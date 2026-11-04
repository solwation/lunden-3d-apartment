// Verification script for #1870: lofted shot (höjdskott) and heading (nickning) at the football field.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game, worker, out] = process.argv.slice(2);
if (!game || !worker || !out) throw Error('Usage: footballverif.cjs GAME WORKER OUT');
const log = (name, data) => console.log('PASS', name, data ? JSON.stringify(data) : '');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    const make = async (name) => {
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      p.on('console', (m) => { if (/THREE.WebGLProgram|GL_INVALID_OPERATION/.test(m.text())) errors.push(m.text()); });
      await p.addInitScript((name) => { localStorage.setItem('lunden.name', name); sessionStorage.setItem('lunden.nameSkipped', '1'); }, name);
      await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=14&month=6`, { waitUntil: 'commit' });
      await p.waitForFunction(() => window.__app?.renderer, null, { timeout: 180000 });
      await p.evaluate(() => {
        const a = __app;
        a.showOverlay(false);
        document.getElementById('hud').hidden = false;
        document.getElementById('overlay').hidden = true;
      });
      return p;
    };

    const [A, B] = await Promise.all([make('Zlatan'), make('Henke')]);
    await A.waitForFunction(() => __ghosts.connected && __app.football?.available, null, { timeout: 60000 });
    await B.waitForFunction(() => __ghosts.connected && __app.football?.available, null, { timeout: 60000 });
    log('two players connected with shared football');

    // Spawn A at center of pitch [-262, -21], facing North (Goal 0, z = -33)
    await A.evaluate(async () => {
      const a = __app, C = (await import('/src/config.js')).FOOTBALL;
      const x = C.at[0], z = C.at[1];
      const gy = a.world.football.ground(x, z);
      a.player.spawn(x, z, 0);
      for (let i = 0; i < 10; i++) a.player.update(1 / 60);
      // Look towards goal and slightly up (pitch 0.38 rad ~22 deg up)
      a.camera.rotation.x = 0.38;
      a.camera.updateMatrixWorld(true);
      a.step(0);
    });

    // Spawn B at [-262, -27] (standing in the path towards Goal 0, facing South towards A, yaw = Math.PI)
    await B.evaluate(async () => {
      const a = __app, C = (await import('/src/config.js')).FOOTBALL;
      const x = C.at[0], z = C.at[1] - 6;
      a.player.spawn(x, z, Math.PI);
      for (let i = 0; i < 10; i++) a.player.update(1 / 60);
      a.camera.rotation.set(-0.1, Math.PI, 0);
      a.camera.updateMatrixWorld(true);
      a.step(0);
    });

    await A.waitForTimeout(1000);
    await B.waitForTimeout(1000);

    // Player A approaches and takes ball 0
    await A.evaluate(() => {
      const fb = __app.football;
      // Put ball 0 right at A's feet for take
      if (fb.pred?.balls[0]) fb.pred.balls[0].p = [-0.1, 0];
      fb.use(0);
    });
    await A.waitForFunction(() => __app.football?.controlled, null, { timeout: 10000 });
    log('Player A controlled the football');

    // Player A kicks with loft towards B and Goal 0
    await A.evaluate(() => {
      __app.camera.rotation.x = 0.42; // aim ~24 degrees up
      __app.camera.updateMatrixWorld(true);
      __app.football.kick(1); // hard lofted kick
    });

    // Wait 350 ms: ball is now in the air!
    await A.waitForTimeout(350);
    await A.evaluate(() => __app.testMode?.draw?.());
    await B.evaluate(() => __app.testMode?.draw?.());

    const ballAir = await A.evaluate(() => {
      const b = __app.football?.pred?.balls[0];
      return { h: b?.h, vy: b?.vy, p: b?.p };
    });
    log('Ball is in the air', ballAir);
    assert.ok(ballAir.h > 0.3, 'ball must be elevated in the air');

    // Screenshot from B watching A's lofted shot in flight
    await B.screenshot({ path: `${out}/1-hojdskott-i-luften.png` });
    // Screenshot from A's point of view
    await A.screenshot({ path: `${out}/2-hojdskott-sikte.png` });

    // Wait until ball reaches B and gets headed
    await B.waitForFunction(() => {
      const b = __app.football?.pred?.balls[0];
      return b?.headerAt > 0 || b?.last === 'Henke';
    }, null, { timeout: 10000 });

    await B.evaluate(() => __app.testMode?.draw?.());
    await B.screenshot({ path: `${out}/3-nick-av-spelare.png` });
    log('Player B headed the ball');

    // Player A controls ball 1 and takes a lofted shot into Goal 0 (North, z = -33)
    await A.waitForTimeout(1000);
    await A.evaluate(async () => {
      const a = __app;
      a.player.spawn(-262, -21, 0);
      for (let i = 0; i < 10; i++) a.player.update(1 / 60);
      a.camera.rotation.set(0.2, 0, 0);
      a.camera.updateMatrixWorld(true);
      a.football.use(1);
    });

    await A.waitForFunction(() => __app.football?.controlled, null, { timeout: 10000 });
    // Shoot into Goal 0 with loft under crossbar
    await A.evaluate(() => {
      __app.camera.rotation.x = 0.22;
      __app.camera.updateMatrixWorld(true);
      __app.football.kick(1);
    });

    // Wait for goal to register
    await A.waitForFunction(() => {
      const s = __app.football?.auth?.score;
      return s && (s[0] > 0 || s[1] > 0);
    }, null, { timeout: 15000 });

    await A.waitForTimeout(600);
    await A.evaluate(() => __app.testMode?.draw?.());
    await A.screenshot({ path: `${out}/4-hojdskott-i-mal.png` });
    log('Goal scored with lofted shot');

    assert.deepEqual(errors, []);
    log('no page or shader exceptions');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
