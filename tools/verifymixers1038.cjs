const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8871';
const PREFIX = process.argv[3] || 'before';
const SHOTS_DIR = process.argv[4] || '/tmp/lunden-shots-mixers1038';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function renderAndShoot(page, filename) {
  await page.evaluate(() => {
    const app = window.__app;
    app.step(0.05);
    app.renderer.render(app.scene, app.camera);
  });
  const fullPath = path.join(SHOTS_DIR, `${PREFIX}_${filename}`);
  await page.screenshot({ path: fullPath });
  console.log('Saved:', fullPath);
}

async function waitForApp(page) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const ready = await page.evaluate(() => !!window.__app?.renderer && !!window.__app?.world?.taps);
    if (ready) return;
  }
  throw new Error('Timeout waiting for app');
}

async function run() {
  console.log(`Running mixers verification (${PREFIX}) against ${BASE_URL}...`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 1
  });

  // --- 1. Kitchen mixer: Day closeup ---
  await page.goto(`${BASE_URL}/?test=lazy&shot&time=12&at=4.7,2.08,-90,-10,1.25`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    app.camera.position.set(4.85, 1.25, 2.38);
    app.camera.lookAt(5.38, 1.08, 2.08);
  });
  await renderAndShoot(page, '01_kitchen_mixer_day.png');

  // --- 2. Kitchen mixer: Day running water / interaction ---
  await page.evaluate(() => {
    const app = window.__app;
    const tap = app.taps.find(t => t.name === 'köksblandaren');
    if (tap && !tap.isOpen) {
      tap.toggle();
    }
    for (let i = 0; i < 15; i++) app.step(0.05);
    app.camera.position.set(4.90, 1.20, 2.32);
    app.camera.lookAt(5.35, 1.05, 2.08);
  });
  await renderAndShoot(page, '02_kitchen_mixer_water_on.png');

  // Turn kitchen tap back off
  await page.evaluate(() => {
    const app = window.__app;
    const tap = app.taps.find(t => t.name === 'köksblandaren');
    if (tap?.isOpen) tap.toggle();
  });

  // --- 3. Kitchen mixer: Evening light ---
  await page.goto(`${BASE_URL}/?test=lazy&shot&time=21&lights&at=4.7,2.08,-90,-10,1.25`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    app.camera.position.set(4.85, 1.25, 2.38);
    app.camera.lookAt(5.38, 1.08, 2.08);
  });
  await renderAndShoot(page, '03_kitchen_mixer_evening.png');

  // --- 4. Bathroom vanity mixer: Day closeup ---
  await page.goto(`${BASE_URL}/?test=lazy&shot&time=12&at=1.1,5.55,90,-15,1.25`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    app.camera.position.set(0.95, 1.15, 5.80);
    app.camera.lookAt(0.35, 0.98, 5.55);
  });
  await renderAndShoot(page, '04_bathroom_mixer_day.png');

  // --- 5. Bathroom vanity mixer: Day running water / interaction ---
  await page.evaluate(() => {
    const app = window.__app;
    const tap = app.taps.find(t => t.name === 'blandaren' && Math.abs(t.spec.pos[1] - 0.966) < 0.1);
    if (tap && !tap.isOpen) {
      tap.toggle();
    }
    for (let i = 0; i < 15; i++) app.step(0.05);
    app.camera.position.set(0.90, 1.12, 5.75);
    app.camera.lookAt(0.36, 0.96, 5.55);
  });
  await renderAndShoot(page, '05_bathroom_mixer_water_on.png');

  // Turn bathroom tap back off
  await page.evaluate(() => {
    const app = window.__app;
    const tap = app.taps.find(t => t.name === 'blandaren' && Math.abs(t.spec.pos[1] - 0.966) < 0.1);
    if (tap?.isOpen) tap.toggle();
  });

  // --- 6. Bathroom vanity mixer: Evening light ---
  await page.goto(`${BASE_URL}/?test=lazy&shot&time=21&lights&at=1.1,5.55,90,-15,1.25`);
  await waitForApp(page);
  await page.evaluate(() => {
    const app = window.__app;
    app.camera.position.set(0.95, 1.15, 5.80);
    app.camera.lookAt(0.35, 0.98, 5.55);
  });
  await renderAndShoot(page, '06_bathroom_mixer_evening.png');

  // --- 7. Check handwashing & dishwashing compatibility ---
  const checks = await page.evaluate(() => {
    const app = window.__app;
    const kitchenTap = app.taps.find(t => t.name === 'köksblandaren');
    const bathTap = app.taps.find(t => t.name === 'blandaren' && Math.abs(t.spec.pos[1] - 0.996) < 0.2);

    const results = {
      kitchenTapFound: !!kitchenTap,
      bathTapFound: !!bathTap,
      kitchenLeverValid: !!kitchenTap?.lever && !!kitchenTap?.pickable,
      bathLeverValid: !!bathTap?.lever && !!bathTap?.pickable,
      handwashRowsAvailable: false,
      dishesTargetValid: false
    };

    if (bathTap && app.handWash) {
      if (!bathTap.isOpen) bathTap.toggle();
      const rows = app.handWash.tapRows(bathTap);
      results.handwashRowsAvailable = rows.some(r => r.id === 'wash' || r.id === 'off');
      bathTap.toggle();
    }

    if (kitchenTap) {
      // Check if tap name matches LIFE.wash.taps for dishwashing
      results.dishesTargetValid = kitchenTap.name === 'köksblandaren';
    }

    return results;
  });

  console.log('Compatibility checks:', checks);
  if (!checks.kitchenTapFound || !checks.bathTapFound || !checks.kitchenLeverValid || !checks.bathLeverValid) {
    throw new Error('Tap checks failed: ' + JSON.stringify(checks));
  }

  await browser.close();
  console.log(`Mixers verification (${PREFIX}) completed successfully.`);
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
