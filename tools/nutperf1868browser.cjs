// #1868: Performance when carrying a nut in the hand outdoors, native placement and retake.
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const [base = 'http://localhost:8968', out = 'docs/verification/1868'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await kit.launch();
  const checks = [], errors = [];
  const check = (ok, label, data) => {
    checks.push({ ok: !!ok, label, data });
    console.log((ok ? 'PASS ' : 'FAIL ') + label);
    if (!ok) throw Error(label);
  };

  try {
    const page = await browser.newPage({ viewport: kit.SMALL });
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(base + '/?test=lazy&shot&time=12&month=6&weather=clear&freeze&cloud=', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__app?.squirrels, null, { polling: 100, timeout: 180000 });
    await kit.skipNameDialog(page);
    await page.evaluate(() => __app.showOverlay(true));
    if (await page.locator('#start-go').isVisible()) await page.locator('#start-go').click();
    else await page.locator('#start-touch').click();

    // 1. Position player in the park and spawn a nut right in front
    const setup = await page.evaluate(async () => {
      const A = __app, S = A.squirrels;
      A.renderer.setAnimationLoop(null);
      A.touch.enabled = true;
      A.showOverlay(false);

      // Spawn player outdoors in the park on actual ground facing south
      const gy = A.player.groundAt(20, 45, 0);
      A.player.spawn(20, 45, Math.PI);
      A.player.pos.y = gy;
      A.camera.position.copy(A.player.pos).y += 1.65;
      A.camera.rotation.set(-0.5, Math.PI, 0, 'YXZ');
      A.step(0.05);

      // Setup nut slot 0 right in front of the player
      S.nuts.setActive(true);
      const slot = S.nuts.slots[0];
      slot.x = 20;
      slot.z = 44;
      slot.y = S.ground(slot.x, slot.z);
      slot.alive = true;
      slot.life = 1000;
      slot.age = 0;
      slot.held = false;
      slot.by = null;
      slot.kind = 0; // acorn
      S.nutItems[0].appear();
      S.nutItems[0].sync();

      // Pick up nut directly
      S.nutItems[0].take();
      A.step(0.02);

      const it = A.heldItem();
      return {
        held: !!it,
        isSquirrelNut: !!it?.isSquirrelNut,
        outdoorPlace: !!it?.outdoorPlace,
        playerOutdoors: A.player.outdoors,
      };
    });

    check(setup.playerOutdoors, 'player is outdoors in the park', setup);
    check(setup.isSquirrelNut && setup.outdoorPlace, 'nut is held in hand with outdoorPlace flag', setup);

    // 2. Measure performance when walking 60 frames with nut in hand
    const walkPerf = await page.evaluate(() => {
      const A = __app;
      // Warmup 5 frames
      for (let i = 0; i < 5; i++) A.step(0.016);
      const times = [];
      A.touch.analog.y = 1; // Walk forward with analog touch stick
      for (let i = 0; i < 60; i++) {
        const t0 = performance.now();
        A.step(0.016);
        times.push(performance.now() - t0);
      }
      A.touch.analog.y = 0; // Stop
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      const f = A.focus().focused;
      return {
        avgMs: avg,
        maxMs: max,
        focusedKind: f?.kind,
        focusedVerb: f?.verb,
        focusedName: f?.name,
        point: f?.point ? [f.point.x, f.point.y, f.point.z] : null
      };
    });

    check(walkPerf.avgMs < 8, 'walking with nut in hand has fast step time (< 8ms under SwiftShader)', walkPerf);
    check(walkPerf.focusedKind === 'place', 'place target is available on ground while holding nut', walkPerf);

    // Take screenshot of walking with nut in hand
    await kit.shot(page, path.join(out, 'nut-held-walk.png'), { frames: 1 });

    // 3. Put the nut down on the ground
    const putDown = await page.evaluate(() => {
      const A = __app;
      const f = A.focus().focused;
      if (f?.kind === 'place') {
        f.item.placeAt(f.point, f.yaw ?? 0);
      }
      A.step(0.05);
      const slot = A.squirrels.nuts.slots[0];
      return {
        held: !!A.heldItem(),
        slotHeld: slot.held,
        slotAlive: slot.alive,
        slotPos: [slot.x, slot.y, slot.z]
      };
    });

    check(!putDown.held && !putDown.slotHeld && putDown.slotAlive, 'nut is placed down on the ground and no longer held', putDown);

    // Look at placed nut and take screenshot
    await page.evaluate(() => {
      const A = __app, slot = A.squirrels.nuts.slots[0];
      const c = A.camera.position, dx = slot.x - c.x, dz = slot.z - c.z;
      A.camera.rotation.set(Math.atan2(slot.y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
      A.step(0.02);
    });
    await kit.shot(page, path.join(out, 'nut-placed-ground.png'), { frames: 1 });

    check(errors.length === 0, 'zero page errors', errors);
    fs.writeFileSync(out + '/result.json', JSON.stringify({ checks, setup, walkPerf, putDown, errors }, null, 2));

  } catch (e) {
    errors.push(e.stack);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(out + '/summary.json', JSON.stringify({ checks, errors }, null, 2));
    await browser.close();
  }
})();
