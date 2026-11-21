// #2370: the same measurements used by the PIE tests, against the browser's pointer-locked mouse handler.
// With the web app served locally: node tools/unreal-engine/tests/player-pitch.cjs <web-url> <measurements.json>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const kit = require('../../testkit.cjs');

(async () => {
  const [url, file] = process.argv.slice(2);
  const { pitchLimit, mouseSens } = JSON.parse(fs.readFileSync(file, 'utf8')).spawn.player;
  assert.ok(pitchLimit > 0 && pitchLimit < Math.PI / 2);
  const browser = await kit.launch();
  try {
    const { page } = await kit.open(browser, new URL('/?shot&cloud=&freeze&weather=clear', url).href,
      { lazy: true, timeout: 240000 });
    await kit.skipNameDialog(page);
    await page.evaluate(() => document.getElementById('game-canvas').requestPointerLock());
    await page.waitForFunction(() => !!document.pointerLockElement);
    const samples = await page.evaluate(() => {
      const move = (movementY) => {
        document.dispatchEvent(new MouseEvent('mousemove', { movementY }));
        return window.__app.camera.rotation.x;
      };
      return [move(-100000), move(1), move(100000), move(-1)];
    });
    const expected = [pitchLimit, pitchLimit - mouseSens, -pitchLimit, -pitchLimit + mouseSens];
    samples.forEach((pitch, i) => assert.ok(Math.abs(pitch - expected[i]) < 1e-9,
      `mouse sample ${i}: measured ${pitch} rad, expected ${expected[i]} from spawn.player`));
    console.log('PASS web mouse pitch (rad)', samples);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
