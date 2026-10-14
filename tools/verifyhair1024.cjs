// Verification script for Issue #1024
// "Bugg: långt hår i avataranpassningen ser ut som skägg"
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8871';
const SHOTS_DIR = process.argv[3] || '/tmp/lunden-shots-hair1024';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  console.log(`Starting Issue #1024 verification against ${BASE_URL}...`);
  console.log(`Saving screenshots to ${SHOTS_DIR}...`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 1
  });

  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
  });

  await page.goto(`${BASE_URL}/?test=lazy&shot`, { waitUntil: 'domcontentloaded' });

  // Wait for window.__app
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const ready = await page.evaluate(() => typeof window.__app !== 'undefined' && !!window.__app.avatarCustomizer);
    if (ready) {
      console.log(`window.__app ready after ${Date.now() - start}ms`);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // 1. Open avatar customizer
  await page.evaluate(() => window.__app.avatarCustomizer.open());
  await page.waitForSelector('#avatar-customizer', { state: 'visible' });
  const card = await page.$('.customizer-card');

  async function setLook(options) {
    await page.evaluate((opts) => {
      if (opts.gender !== undefined) document.querySelector(`button[data-type="gender"][data-index="${opts.gender}"]`)?.click();
      if (opts.facial !== undefined) document.querySelector(`button[data-type="facial"][data-index="${opts.facial}"]`)?.click();
      if (opts.style !== undefined) document.querySelector(`button[data-type="style"][data-index="${opts.style}"]`)?.click();
      if (opts.hair !== undefined) document.querySelector(`button[data-type="hair"][data-index="${opts.hair}"]`)?.click();
      if (opts.skin !== undefined) document.querySelector(`button[data-type="skin"][data-index="${opts.skin}"]`)?.click();
    }, options);
    await page.waitForTimeout(100);
  }

  async function snapCard(filename) {
    const outPath = path.join(SHOTS_DIR, filename);
    await card.screenshot({ path: outPath });
    console.log(`Saved screenshot: ${outPath}`);
  }

  // A: Kvinna, Långt hår (style 1), INGET skägg (facial 0) - EFTER
  await setLook({ gender: 1, facial: 0, style: 1, hair: 0 });
  await snapCard('01_2d_kvinna_longhair_nobeard_efter.png');

  // B: Man, Långt hår (style 1), INGET skägg (facial 0) - EFTER
  await setLook({ gender: 0, facial: 0, style: 1, hair: 0 });
  await snapCard('02_2d_man_longhair_nobeard_efter.png');

  // C: Långt hår MED skägg (så man ser att skägg fortfarande fungerar som separat val)
  await setLook({ gender: 0, facial: 1, style: 1, hair: 0 });
  await snapCard('03_2d_man_longhair_withbeard.png');

  // D: Långt hår MED mustasch
  await setLook({ gender: 0, facial: 2, style: 1, hair: 0 });
  await snapCard('04_2d_man_longhair_withmustache.png');

  // E: Långt hår MED skägg & mustasch
  await setLook({ gender: 0, facial: 3, style: 1, hair: 0 });
  await snapCard('05_2d_man_longhair_withcombo.png');

  // Save look with long hair and NO beard
  await setLook({ gender: 0, facial: 0, style: 1, hair: 0 });
  await page.click('#avatar-save-btn');
  await page.waitForSelector('#avatar-customizer', { state: 'hidden' });
  console.log('Saved look with long hair and no beard.');

  // Helper for mirror rendering
  async function snapMirror(filename, px, pz, lookX, lookY, lookZ) {
    await page.evaluate(({ px, pz, lookX, lookY, lookZ }) => {
      const pl = window.__app.player;
      const cam = window.__app.camera;
      pl.spawn(px, pz, 0);
      pl.unstick(0, true);
      cam.position.set(px, 1.35, pz);
      cam.lookAt(lookX, lookY, lookZ);
      const yaw = cam.rotation.y;
      window.__ghosts.track({ p: [px, pl.pos.y, pz], r: yaw, h: '', c: false, sp: false }, performance.now());
      window.__app.updateReflections(cam, 0, true, false);
      const r = window.__app.reflectors().find(m => m.name === 'nissedal');
      if (r) {
        r.r.visible = true;
        r.r.hold = false;
      }
      window.__app.renderer.render(window.__app.scene, cam);
    }, { px, pz, lookX, lookY, lookZ });

    await page.waitForTimeout(200);
    const outPath = path.join(SHOTS_DIR, filename);
    await page.screenshot({ path: outPath });
    console.log(`Saved mirror shot: ${outPath}`);
  }

  // 2. Mirror reflection framifrån
  console.log('Capturing mirror reflection framifrån (no beard)...');
  await snapMirror('06_spegel_framifran_nobeard.png', 1.45, 1.115, 2.057, 1.35, 1.115);

  // 3. Mirror reflection snett från sidan
  console.log('Capturing mirror reflection snett från sidan (no beard)...');
  try {
    await snapMirror('07_spegel_snett_nobeard.png', 1.45, 1.55, 2.057, 1.35, 1.115);
  } catch (err) {
    console.warn('Skipping optional side mirror shot:', err.message);
  }

  // 4. Mirror reflection framifrån MED skägg
  console.log('Capturing mirror reflection with long hair MED skägg...');
  await page.evaluate(() => {
    window.__app.avatarCustomizer.open();
  });
  await page.waitForSelector('#avatar-customizer', { state: 'visible' });
  await setLook({ facial: 1 });
  await page.click('#avatar-save-btn');
  await page.waitForSelector('#avatar-customizer', { state: 'hidden' });

  await snapMirror('08_spegel_framifran_withbeard.png', 1.45, 1.115, 2.057, 1.35, 1.115);

  // 5. Direct 3D camera close-up of avatar head in daylight
  console.log('Capturing direct 3D avatar close-ups...');
  await page.evaluate(() => {
    const g = window.__ghosts.selfGhost();
    g.root.visible = true;
    g.avatar.setSolid(true);

    window.__renderAvatar = (camX, camY, camZ, lookX, lookY, lookZ) => {
      const cam = window.__app.camera;
      const origPos = cam.position.clone();
      const origRot = cam.rotation.clone();

      g.root.position.set(2.875, 0, -10);
      g.root.rotation.set(0, Math.PI, 0); // facing +z
      g.animate(performance.now(), 0, 0, 0);

      cam.position.set(camX, camY, camZ);
      cam.lookAt(lookX, lookY, lookZ);
      window.__app.renderer.render(window.__app.scene, cam);

      cam.position.copy(origPos);
      cam.rotation.copy(origRot);
    };
  });

  // Direct 3D head front with beard
  await page.evaluate(() => window.__renderAvatar(2.875, 1.55, -9.35, 2.875, 1.55, -10));
  await page.screenshot({ path: path.join(SHOTS_DIR, '09_3d_head_front_withbeard.png') });

  // Direct 3D head front and angle WITHOUT beard
  await page.evaluate(() => {
    window.__app.avatarCustomizer.open();
  });
  await page.waitForSelector('#avatar-customizer', { state: 'visible' });
  await setLook({ facial: 0 });
  await page.click('#avatar-save-btn');
  await page.waitForSelector('#avatar-customizer', { state: 'hidden' });

  // Front no beard
  await page.evaluate(() => window.__renderAvatar(2.875, 1.55, -9.35, 2.875, 1.55, -10));
  await page.screenshot({ path: path.join(SHOTS_DIR, '10_3d_head_front_nobeard.png') });

  // Snett från sidan (angle) no beard
  await page.evaluate(() => window.__renderAvatar(3.35, 1.55, -9.45, 2.875, 1.55, -10));
  await page.screenshot({ path: path.join(SHOTS_DIR, '11_3d_head_angle_nobeard.png') });

  console.log('All verification steps completed successfully!');
  await browser.close();
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
