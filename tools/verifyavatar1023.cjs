// Verification script for Issue #1023
// Avataranpassning: välj man/kvinna samt separat skägg och mustasch
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8871';
const SHOTS_DIR = process.argv[3] || '/tmp/lunden-shots-avatar1023';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  console.log(`Starting browser verification against ${BASE_URL}...`);
  console.log(`Screenshots will be saved to ${SHOTS_DIR}`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    devicePixelRatio: 1
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => {
    console.error('Page error:', err.message);
    errors.push(err.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('Console error:', msg.text());
      errors.push(msg.text());
    }
  });

  async function waitForApp(timeoutMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ready = await page.evaluate(() => typeof window.__app !== 'undefined' && !!window.__app.avatarCustomizer);
        if (ready) {
          console.log(`window.__app ready after ${Date.now() - start}ms`);
          return;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Timeout waiting for window.__app after ${timeoutMs}ms`);
  }

  try {
    // 1. Navigate to the app with ?test=lazy&shot
    await page.goto(`${BASE_URL}/?test=lazy&shot`, { waitUntil: 'domcontentloaded' });
    console.log('Page loaded, waiting for window.__app...');

    // Wait until window.__app is initialized
    await waitForApp();
    console.log('window.__app is ready!');

    // 2. Open customizer dialog
    await page.evaluate(() => {
      window.__app.avatarCustomizer.open();
    });

    await page.waitForSelector('#avatar-customizer', { state: 'visible' });
    console.log('Customizer dialog opened.');

    const card = await page.$('.customizer-card');

    // Helper to click options and take shot
    async function selectAndSnap(filename, genderIdx, facialIdx, styleIdx, hairIdx) {
      await page.evaluate(({ genderIdx, facialIdx, styleIdx, hairIdx }) => {
        if (genderIdx !== undefined) {
          const btn = document.querySelector(`button[data-type="gender"][data-index="${genderIdx}"]`);
          btn?.click();
        }
        if (facialIdx !== undefined) {
          const btn = document.querySelector(`button[data-type="facial"][data-index="${facialIdx}"]`);
          btn?.click();
        }
        if (styleIdx !== undefined) {
          const btn = document.querySelector(`button[data-type="style"][data-index="${styleIdx}"]`);
          btn?.click();
        }
        if (hairIdx !== undefined) {
          const btn = document.querySelector(`button[data-type="hair"][data-index="${hairIdx}"]`);
          btn?.click();
        }
      }, { genderIdx, facialIdx, styleIdx, hairIdx });

      await page.waitForTimeout(100);
      const outPath = path.join(SHOTS_DIR, filename);
      await card.screenshot({ path: outPath });
      console.log(`Saved screenshot: ${outPath}`);
    }

    // A: Man, Inget ansiktshår, Kort hår
    await selectAndSnap('01_man_nofacial.png', 0, 0, 0, 0);

    // B: Man, Mustasch
    await selectAndSnap('02_man_mustache.png', 0, 2, 0, 0);

    // C: Man, Skägg
    await selectAndSnap('03_man_beard.png', 0, 1, 0, 0);

    // D: Man, Skägg & mustasch
    await selectAndSnap('04_man_combo.png', 0, 3, 0, 0);

    // E: Kvinna, Inget ansiktshår, Kort hår
    await selectAndSnap('05_kvinna_nofacial.png', 1, 0, 0, 0);

    // F: Kvinna, Långt hår utan skägg/mustasch
    await selectAndSnap('06_kvinna_longhair_nobeard.png', 1, 0, 1, 0);

    // G: Kvinna, Skägg & mustasch
    await selectAndSnap('07_kvinna_combo.png', 1, 3, 1, 0);

    // H: Kvinna, Blont hår (ansiktshår matchar hårfärg)
    await selectAndSnap('08_kvinna_blonde_facial.png', 1, 3, 1, 4);

    // 3. Save current look
    await page.click('#avatar-save-btn');
    await page.waitForSelector('#avatar-customizer', { state: 'hidden' });
    console.log('Saved customizer settings.');

    const savedCode = await page.evaluate(() => localStorage.getItem('lunden.avatar'));
    console.log('Saved avatar code in localStorage:', savedCode);
    if (!/^[0-4][0-9][0-5][0-3][0-7][0-4][0-1][0-1][0-3]$/.test(savedCode)) {
      throw new Error(`Saved avatar code invalid format: ${savedCode}`);
    }

    // 4. Test reload persistence
    console.log('Reloading page to test persistence...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp();

    const restoredLook = await page.evaluate(() => window.__app.avatarCustomizer.getLook());
    console.log('Restored look after reload:', JSON.stringify(restoredLook));
    if (restoredLook.gender !== 1 || restoredLook.facial !== 3) {
      throw new Error(`Restored look does not match saved values: gender=${restoredLook.gender}, facial=${restoredLook.facial}`);
    }

    // Reopen customizer to verify active button states
    await page.evaluate(() => window.__app.avatarCustomizer.open());
    await page.waitForSelector('#avatar-customizer', { state: 'visible' });
    const card2 = await page.$('.customizer-card');
    await card2.screenshot({ path: path.join(SHOTS_DIR, '09_reloaded_active_buttons.png') });

    // 5. Test 3D selfGhost geometry in the scene
    const ghostInfo = await page.evaluate(() => {
      const g = window.__ghosts.selfGhost();
      return {
        look: g.avatar.look,
        vertexCount: g.mesh.geometry.attributes.position.count,
        triangles: g.mesh.geometry.attributes.position.count / 3,
        hasHair: !!g.mesh.geometry.attributes.color
      };
    });
    console.log('Self ghost 3D geometry info:', ghostInfo);

    // Close customizer
    await page.click('#avatar-close-btn');
    await page.waitForSelector('#avatar-customizer', { state: 'hidden' });

    // 6. Test backward compatibility: load legacy 7-digit code
    console.log('Testing backward compatibility with legacy 7-digit code...');
    await page.evaluate(() => {
      localStorage.setItem('lunden.avatar', '2413021'); // legacy 7 digits
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp();

    const legacyLook = await page.evaluate(() => window.__app.avatarCustomizer.getLook());
    console.log('Legacy decoded look:', JSON.stringify(legacyLook));
    if (legacyLook.gender !== 0 || legacyLook.facial !== 0) {
      throw new Error(`Legacy look failed: gender=${legacyLook.gender}, facial=${legacyLook.facial}`);
    }

    // Open customizer to capture legacy look
    await page.evaluate(() => window.__app.avatarCustomizer.open());
    await page.waitForSelector('#avatar-customizer', { state: 'visible' });
    const card3 = await page.$('.customizer-card');
    await card3.screenshot({ path: path.join(SHOTS_DIR, '10_legacy_look.png') });

    console.log('All browser verifications passed successfully!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
