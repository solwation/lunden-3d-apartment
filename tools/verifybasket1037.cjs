// Verification script for Issue #1037
// "Rotera basketplanen 90 grader åt vänster så att basketkorgen hamnar på parkeringens kortsida"
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8872';
const SHOTS_DIR = process.argv[3] || '/tmp/lunden-shots-basketrotate1037';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  console.log(`Starting Issue #1037 verification against ${BASE_URL}...`);
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

  await page.goto(`${BASE_URL}/?test&time=12&hoop`, { waitUntil: 'domcontentloaded' });

  // Wait for window.__app
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const ready = await page.evaluate(() => typeof window.__app !== 'undefined' && !!window.__app.hoop && !!window.__app.ball);
    if (ready) {
      console.log(`window.__app ready after ${Date.now() - start}ms`);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Dismiss start overlay if present
  await page.evaluate(() => {
    document.getElementById('start-touch')?.click();
    document.getElementById('overlay')?.setAttribute('hidden', '');
  });
  await page.waitForTimeout(500);

  // 1. Verify Hoop orientation and placement on the east short end of the car park
  const hoopData = await page.evaluate(() => {
    const { hoop } = window.__app;
    hoop.object.updateMatrixWorld(true);
    const pos = hoop.object.position;
    const rimC = hoop.rimC;
    const baseBox = hoop.baseBox;
    const rotY = hoop.object.rotation.y;
    return {
      pos: [pos.x, pos.y, pos.z],
      rimC: [rimC.x, rimC.y, rimC.z],
      baseBox: { min: baseBox.min, max: baseBox.max },
      rotDeg: Math.round(rotY * 180 / Math.PI),
      visible: hoop.object.visible,
      up: hoop.up
    };
  });

  console.log('Hoop configuration:', JSON.stringify(hoopData, null, 2));

  // 2. Overview screenshot: player standing at west edge of court looking east towards the hoop
  await page.evaluate(() => {
    const { player, camera, hoop } = window.__app;
    player.spawn(2.0, -9.9, 0);
    camera.position.set(2.0, 1.7, -9.9);
    camera.lookAt(hoop.rimC.x, 2.5, hoop.rimC.z);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS_DIR, '01-court-overview-west-facing-hoop.png') });
  console.log('Saved 01-court-overview-west-facing-hoop.png');

  // 3. Elevated bird's eye view showing the whole court lines, hoop on kortsida, clear of walkway and cars
  await page.evaluate(() => {
    const { player, camera } = window.__app;
    camera.position.set(7.5, 14.0, -9.9);
    camera.lookAt(8.5, 0, -9.9);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS_DIR, '02-court-birdseye-layout.png') });
  console.log('Saved 02-court-birdseye-layout.png');

  // 4. Close-up on the south boundary to show walkway clearance along Hus L
  await page.evaluate(() => {
    const { camera } = window.__app;
    camera.position.set(10.0, 3.5, -1.0);
    camera.lookAt(10.0, 0, -6.0);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS_DIR, '03-walkway-clearance.png') });
  console.log('Saved 03-walkway-clearance.png');

  // 5. Test shot 1: 2-pointer inside 3p line
  const twoPointerResult = await page.evaluate(async () => {
    const { player, camera, ball, hoop, stats, step } = window.__app;
    window.Math.random = () => 0.5;
    const b0 = stats.baskets, tw0 = stats.twoPointers, pts0 = stats.basketPoints;
    player.spawn(hoop.rimC.x - 4.0, hoop.rimC.z, 0);
    camera.position.set(hoop.rimC.x - 4.0, 1.7, hoop.rimC.z);
    camera.lookAt(hoop.rimC.x, hoop.rimC.y, hoop.rimC.z);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) step(1/60);
    if (!ball.held) ball.take();
    ball.cool = 0;
    ball.use();
    for (let t = 0; t < 4; t += 1/60) {
      step(1/60);
      if (stats.baskets > b0) break;
    }
    return {
      scored: stats.baskets > b0,
      isTwo: stats.twoPointers === tw0 + 1,
      pointsAdded: stats.basketPoints - pts0
    };
  });
  console.log('2-pointer result:', twoPointerResult);
  await page.screenshot({ path: path.join(SHOTS_DIR, '04-twopointer-score.png') });
  console.log('Saved 04-twopointer-score.png');

  // 6. Test shot 2: Free throw (1 point)
  const ftResult = await page.evaluate(async () => {
    const { player, camera, ball, hoop, stats, step } = window.__app;
    window.Math.random = () => 0.5;
    const ft0 = stats.freeThrows, pts0 = stats.basketPoints;
    player.spawn(hoop.rimC.x - 5.12, hoop.rimC.z, 0);
    camera.position.set(hoop.rimC.x - 5.12, 1.7, hoop.rimC.z);
    camera.lookAt(hoop.rimC.x, hoop.rimC.y, hoop.rimC.z);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) step(1/60);
    if (!ball.held) ball.take();
    ball.cool = 0;
    ball.shootFreeThrow();
    for (let t = 0; t < 4; t += 1/60) {
      step(1/60);
      if (stats.freeThrows > ft0) break;
    }
    return {
      scored: stats.freeThrows === ft0 + 1,
      pointsAdded: stats.basketPoints - pts0
    };
  });
  console.log('Free throw result:', ftResult);
  await page.screenshot({ path: path.join(SHOTS_DIR, '05-freethrow-score.png') });
  console.log('Saved 05-freethrow-score.png');

  // 7. Test shot 3: 3-pointer from beyond the arc
  const threePointerResult = await page.evaluate(async () => {
    const { player, camera, ball, hoop, stats, step } = window.__app;
    window.Math.random = () => 0.5;
    const b0 = stats.baskets, t0 = stats.threes, pts0 = stats.basketPoints;
    player.spawn(hoop.rimC.x - 7.2, hoop.rimC.z + 2.0, 0);
    camera.position.set(hoop.rimC.x - 7.2, 1.7, hoop.rimC.z + 2.0);
    camera.lookAt(hoop.rimC.x, hoop.rimC.y, hoop.rimC.z);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) step(1/60);
    if (!ball.held) ball.take();
    ball.cool = 0;
    ball.use();
    for (let t = 0; t < 4; t += 1/60) {
      step(1/60);
      if (stats.baskets > b0) break;
    }
    return {
      scored: stats.baskets > b0,
      isThree: stats.threes === t0 + 1,
      pointsAdded: stats.basketPoints - pts0
    };
  });
  console.log('3-pointer result:', threePointerResult);
  await page.screenshot({ path: path.join(SHOTS_DIR, '06-threepointer-score.png') });
  console.log('Saved 06-threepointer-score.png');

  const allPassed = hoopData.rotDeg === -90 &&
    twoPointerResult.scored && twoPointerResult.isTwo && twoPointerResult.pointsAdded === 2 &&
    ftResult.scored && ftResult.pointsAdded === 1 &&
    threePointerResult.scored && threePointerResult.isThree && threePointerResult.pointsAdded === 3;

  console.log(`\n========================================`);
  console.log(`VERIFICATION RESULT: ${allPassed ? 'SUCCESS - ALL CRITERIA MET' : 'FAILED'}`);
  console.log(`========================================\n`);

  await browser.close();
  if (!allPassed) process.exit(1);
}

run().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
