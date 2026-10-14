// Verification script for Issue #1036
// "Basketboll som hamnar utanför gångbart utrymme ska återvända till basketplanen"
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8871';
const SHOTS_DIR = process.argv[3] || '/tmp/lunden-shots-basketreturn1036';

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  console.log(`Starting Issue #1036 verification against ${BASE_URL}...`);
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

  // Dismiss start overlay
  await page.evaluate(() => {
    document.getElementById('start-touch')?.click();
    document.getElementById('overlay')?.setAttribute('hidden', '');
  });
  await page.waitForTimeout(500);

  // 1. Initial state: Court overview with hoop and return spot
  await page.evaluate(() => {
    const { player, camera, hoop } = window.__app;
    player.spawn(2.0, -9.9, 0);
    camera.position.set(2.0, 1.7, -9.9);
    camera.lookAt(hoop.rimC.x, 2.5, hoop.rimC.z);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, '01-court-before-throw.png') });
  console.log('Saved 01-court-before-throw.png');

  // 2. Scenario 1: Throw ball out of bounds north across OUTDOOR boundary / hedge (z < -14)
  console.log('Testing Scenario 1: Throw out of bounds north of car park...');
  const throwNorthResult = await page.evaluate(async () => {
    const { player, camera, ball, hoop, step } = window.__app;
    const T = ball.model.position.constructor;
    if (!ball.held) ball.take();

    // Stand on the court and throw northwards out of bounds (towards z = -22)
    player.spawn(6.7, -9.9, 0);
    camera.position.set(6.7, 1.7, -9.9);
    camera.lookAt(6.7, 3.0, -25.0);
    camera.updateMatrixWorld(true);

    // Release ball with strong north velocity
    ball.release(new T(0, 5, -15), false);

    let maxZ = 99, minZ = 99, detectedOutOfBounds = false, returningStarted = false;
    let frames = 0;

    // Step physics and watch ball cross z < -14 and trigger return
    for (let t = 0; t < 12; t += 1 / 60) {
      step(1 / 60);
      frames++;
      const pos = ball.model.position;
      minZ = Math.min(minZ, pos.z);
      if (!ball.isWalkable(pos)) detectedOutOfBounds = true;
      if (ball.returning) {
        returningStarted = true;
        break;
      }
    }

    return {
      minZ,
      detectedOutOfBounds,
      returningStarted,
      ballPos: ball.model.position.toArray()
    };
  });
  console.log('Throw north result:', throwNorthResult);

  // Screenshot while ball is returning to the court
  await page.evaluate(() => {
    const { camera, ball } = window.__app;
    camera.position.set(2.0, 4.0, -9.9);
    camera.lookAt(ball.model.position.x, 0.5, ball.model.position.z);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS_DIR, '02-ball-returning-from-north.png') });
  console.log('Saved 02-ball-returning-from-north.png');

  // Let ball complete its return to the court
  const returnNorthArrive = await page.evaluate(async () => {
    const { ball, step } = window.__app;
    const target = ball.courtReturnSpot();
    let arrived = false;
    for (let t = 0; t < 10; t += 1 / 60) {
      step(1 / 60);
      const pos = ball.model.position;
      if (Math.hypot(pos.x - target.x, pos.z - target.z) < 0.15 && !ball.flying && ball.placed) {
        arrived = true;
        break;
      }
    }
    return {
      arrived,
      target: target.toArray(),
      finalPos: ball.model.position.toArray(),
      placed: ball.placed,
      flying: ball.flying,
      returning: ball.returning
    };
  });
  console.log('Return arrival result (north throw):', returnNorthArrive);

  await page.screenshot({ path: path.join(SHOTS_DIR, '03-ball-rested-on-court.png') });
  console.log('Saved 03-ball-rested-on-court.png');

  // 3. Scenario 2: Throw ball over patio fence into neighbor's fenced garden
  console.log('Testing Scenario 2: Throw over patio fence into inaccessible garden...');
  const throwFenceResult = await page.evaluate(async () => {
    const { player, camera, ball, step } = window.__app;
    const T = ball.model.position.constructor;
    if (!ball.held) ball.take();

    // Stand on patio and throw west over the fence into neighbor's yard
    player.spawn(1.0, 15.0, 0);
    camera.position.set(1.0, 1.7, 15.0);
    camera.lookAt(-5.0, 4.0, 15.0);
    camera.updateMatrixWorld(true);

    ball.release(new T(-8, 8, 0), false);

    let minX = 99, detectedOutOfBounds = false, returningStarted = false;
    for (let t = 0; t < 10; t += 1 / 60) {
      step(1 / 60);
      const pos = ball.model.position;
      minX = Math.min(minX, pos.x);
      if (!ball.isWalkable(pos)) detectedOutOfBounds = true;
      if (ball.returning) {
        returningStarted = true;
        break;
      }
    }

    return {
      minX,
      detectedOutOfBounds,
      returningStarted,
      ballPos: ball.model.position.toArray()
    };
  });
  console.log('Throw fence result:', throwFenceResult);

  // Let ball complete return from fence throw to basketball court
  const returnFenceArrive = await page.evaluate(async () => {
    const { ball, step } = window.__app;
    const target = ball.courtReturnSpot();
    let arrived = false;
    for (let t = 0; t < 15; t += 1 / 60) {
      step(1 / 60);
      const pos = ball.model.position;
      if (Math.hypot(pos.x - target.x, pos.z - target.z) < 0.15 && !ball.flying && ball.placed) {
        arrived = true;
        break;
      }
    }
    return {
      arrived,
      finalPos: ball.model.position.toArray(),
      placed: ball.placed,
      flying: ball.flying
    };
  });
  console.log('Return arrival result (fence throw):', returnFenceArrive);

  // Look at the returned ball on the court
  await page.evaluate(() => {
    const { player, camera, ball } = window.__app;
    player.spawn(5.0, -9.9, 0);
    camera.position.set(5.0, 1.7, -9.9);
    camera.lookAt(ball.model.position.x, 0.2, ball.model.position.z);
    camera.updateMatrixWorld(true);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS_DIR, '04-ball-rested-after-fence-throw.png') });
  console.log('Saved 04-ball-rested-after-fence-throw.png');

  // 4. Scenario 3: Pick up returned ball and dribble
  console.log('Testing Scenario 3: Pickup returned ball and dribble...');
  const pickupResult = await page.evaluate(async () => {
    const { ball, heldItem, step } = window.__app;
    // Ball should be pickable
    ball.take();
    const held = heldItem() === ball;

    // Dribble
    ball.useAlt();
    const dribbling = ball.dribbling && ball.flying;

    // Catch dribble
    for (let t = 0; t < 2.5; t += 1 / 60) {
      step(1 / 60);
      if (heldItem() === ball) break;
    }
    const caught = heldItem() === ball;

    return { held, dribbling, caught };
  });
  console.log('Pickup and dribble result:', pickupResult);

  await page.screenshot({ path: path.join(SHOTS_DIR, '05-ball-picked-up-and-dribbled.png') });
  console.log('Saved 05-ball-picked-up-and-dribbled.png');

  const allPassed =
    throwNorthResult.detectedOutOfBounds &&
    throwNorthResult.returningStarted &&
    returnNorthArrive.arrived &&
    throwFenceResult.detectedOutOfBounds &&
    throwFenceResult.returningStarted &&
    returnFenceArrive.arrived &&
    pickupResult.held &&
    pickupResult.caught;

  console.log(`\n========================================`);
  console.log(`VERIFICATION RESULT: ${allPassed ? 'SUCCESS - ALL TESTS PASSED' : 'FAILED'}`);
  console.log(`========================================\n`);

  await browser.close();
  if (!allPassed) process.exit(1);
}

run().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
