// #1659: verification test for DJ booth:
// - 24 tracks available in clubhouse playlist
// - Visible spinning turntables while playing (left deck spins)
// - Both turntables spin simultaneously during crossfade mix
// - Turntables freeze/stop when paused or off
// - Shuffle toggle and randomized track selection
const fs = require('node:fs'), assert = require('node:assert/strict'), kit = require('./testkit.cjs');
const [game = 'http://localhost:8879', out = 'docs/verification/1659'] = process.argv.slice(2);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(['--autoplay-policy=no-user-gesture-required']);
  try {
    const { page } = await kit.open(browser, `${game}/?shot&cloud=&mp=0&freeze&time=12&weather=clear`, {
      lazy: true,
      timeout: 180000,
      viewport: { width: 960, height: 600 },
      contextOptions: { hasTouch: true, isMobile: true }
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Teleport player into playroom and walk to DJ bench
    await page.evaluate(async () => {
      const a = __app;
      a.showOverlay(false);
      document.getElementById('player-dialog')?.remove();
      a.touch.enabled = true;
      document.body.classList.add('touch');
      a.use({ kind: 'playhouse' });
    });
    await page.waitForFunction(() => __app.player.inPlayroom);

    // Position player right in front of the DJ bench with direct, high-detail view of both turntables
    await page.evaluate(async () => {
      const a = __app, C = await import('/src/config.js'), R = C.PLAYROOM;
      window.C = C;
      // Stand ~1.2m south of DJ bench facing north
      a.player.spawn(R.x + R.dj.x, R.z + R.dj.z + 1.25, 0);
      for (let i = 0; i < 15; i++) a.player.update(1 / 60);
      const cam = a.camera;
      cam.updateMatrixWorld(true);
      // Look slightly downward directly at the DJ bench surface and turntables
      const targetY = R.dj.h + 0.08;
      const d = new cam.position.constructor(R.x + R.dj.x, targetY, R.z + R.dj.z).sub(cam.position);
      cam.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ');
      a.step(0);
    });

    const aim = () => page.evaluate(() => { __app.step(0); __app.renderer.render(__app.scene, __app.camera); });
    const rows = () => page.evaluate(() => [...document.querySelectorAll('#choices button')].map(b => b.textContent.trim()));
    const djState = () => page.evaluate(() => {
      const pr = __app.world.playroom;
      const m = pr.music;
      return {
        musicState: m.state,
        trackIndex: m.index,
        shuffle: m.shuffle,
        deckSide: m.deckSide,
        mixing: !!m.mixing,
        turntableAngles: [...pr.turntableAngles],
        deck0Spinning: m.isDeckSpinning(0),
        deck1Spinning: m.isDeckSpinning(1),
        curTrack: C.PLAYROOM_TRACKS[m.index]?.title,
        curArtist: C.PLAYROOM_TRACKS[m.index]?.artist,
        totalTracks: C.PLAYROOM_TRACKS.length,
      };
    });

    // 1. Initial state (Off): both turntables stopped
    await aim();
    let st0 = await djState();
    console.log('1. Initial (off):', st0);
    assert.equal(st0.musicState, 'off');
    assert.equal(st0.totalTracks, 24, 'All 24 clubhouse tracks present');
    assert.equal(st0.deck0Spinning, false);
    assert.equal(st0.deck1Spinning, false);
    let r = await rows();
    assert.ok(r.some(t => /Spela musik/.test(t)));
    await aim();
    await page.screenshot({ path: `${out}/1659-1-dj-avstangd.png` });
    console.log('Saved 1659-1-dj-avstangd.png');

    // 2. Start playback: Deck 0 rotates
    await page.locator('#choices button', { hasText: 'Spela musik' }).tap();
    await page.waitForTimeout(500);
    await aim();

    // Advance 60 frames to simulate turntable spinning
    for (let f = 0; f < 60; f++) {
      await page.evaluate(() => { __app.step(1 / 60); });
    }
    await aim();
    let st1 = await djState();
    console.log('2. Playing (Deck 0 spinning):', st1);
    assert.equal(st1.musicState, 'playing');
    assert.equal(st1.deck0Spinning, true, 'Deck 0 is spinning');
    assert.equal(st1.deck1Spinning, false, 'Deck 1 is stopped');
    assert.ok(st1.turntableAngles[0] > 0.5, 'Deck 0 angle has rotated noticeably');
    assert.equal(st1.turntableAngles[1], 0, 'Deck 1 remains at angle 0');
    await page.screenshot({ path: `${out}/1659-2-spelar-skivspelare1-roterar.png` });
    console.log('Saved 1659-2-spelar-skivspelare1-roterar.png');

    // 3. Toggle shuffle: show shuffle ON in menu
    r = await rows();
    assert.ok(r.some(t => /Slumpad låtordning: Av/.test(t)));
    await page.locator('#choices button', { hasText: /Slumpad låtordning: Av/ }).tap();
    await aim();
    let st2 = await djState();
    console.log('3. Shuffle toggled on:', st2);
    assert.equal(st2.shuffle, true);
    r = await rows();
    assert.ok(r.some(t => /Slumpad låtordning: På/.test(t)));
    await page.screenshot({ path: `${out}/1659-3-slumpad-latordning-pa.png` });
    console.log('Saved 1659-3-slumpad-latordning-pa.png');

    // 4. Mix to next track (crossfade): BOTH turntables rotate simultaneously!
    await page.locator('#choices button', { hasText: /^Mixa till nästa/ }).tap();
    await page.waitForTimeout(300);
    for (let f = 0; f < 40; f++) {
      await page.evaluate(() => { __app.step(1 / 60); });
    }
    await aim();
    let st3 = await djState();
    console.log('4. Mixing (both turntables spinning):', st3);
    assert.equal(st3.mixing, true, 'Crossfade is in progress');
    assert.equal(st3.deck0Spinning, true, 'Deck 0 spins during mix');
    assert.equal(st3.deck1Spinning, true, 'Deck 1 spins during mix');
    assert.ok(st3.turntableAngles[1] > 0.1, 'Deck 1 has started spinning');
    await page.screenshot({ path: `${out}/1659-4-mixar-bada-skivorna-roterar.png` });
    console.log('Saved 1659-4-mixar-bada-skivorna-roterar.png');

    // Wait for mix to finish (approx 6 seconds crossfade)
    console.log('Waiting for mix to complete...');
    await page.waitForFunction(() => !__app.world.playroom.music.mixing, { timeout: 15000 });
    // Run a few frames to step simulation
    for (let f = 0; f < 30; f++) {
      await page.evaluate(() => { __app.step(1 / 60); });
    }
    await aim();
    let st4 = await djState();
    console.log('Mix completed:', st4);
    assert.equal(st4.mixing, false, 'Mix completed');
    assert.equal(st4.deckSide, 1, 'Active deck is now Deck 1');
    assert.equal(st4.deck0Spinning, false, 'Deck 0 has stopped spinning');
    assert.equal(st4.deck1Spinning, true, 'Deck 1 is spinning alone');

    // 5. Pause: both turntables freeze in place immediately
    await page.locator('#choices button', { hasText: /^Pausa musiken/ }).tap();
    await aim();
    let st5 = await djState();
    console.log('5. Paused (both stopped):', st5);
    assert.equal(st5.musicState, 'paused');
    assert.equal(st5.deck0Spinning, false);
    assert.equal(st5.deck1Spinning, false);
    const frozenAngle1 = st5.turntableAngles[1];

    // Advance 60 frames while paused: angles must NOT change
    for (let f = 0; f < 60; f++) {
      await page.evaluate(() => { __app.step(1 / 60); });
    }
    await aim();
    let st5b = await djState();
    assert.equal(st5b.turntableAngles[1], frozenAngle1, 'Turntable stayed frozen while paused');
    await page.screenshot({ path: `${out}/1659-5-pausad-skivorna-stannar.png` });
    console.log('Saved 1659-5-pausad-skivorna-stannar.png');

    // 6. Resume: Deck 1 resumes spinning from exact frozen position
    await page.locator('#choices button', { hasText: /^Fortsätt musiken/ }).tap();
    for (let f = 0; f < 30; f++) {
      await page.evaluate(() => { __app.step(1 / 60); });
    }
    await aim();
    let st6 = await djState();
    console.log('6. Resumed:', st6);
    assert.equal(st6.musicState, 'playing');
    assert.equal(st6.deck1Spinning, true);
    assert.notEqual(st6.turntableAngles[1], frozenAngle1, 'Turntable resumed spinning');

    // 7. Cut to next track with shuffle: jumps to a random track and flips to Deck 0
    await page.locator('#choices button', { hasText: /^Nästa låt/ }).tap();
    for (let f = 0; f < 30; f++) {
      await page.evaluate(() => { __app.step(1 / 60); });
    }
    await aim();
    let st7 = await djState();
    console.log('7. Next cut (with shuffle):', st7);
    assert.notEqual(st7.trackIndex, st6.trackIndex, 'New track chosen');
    assert.equal(st7.deck0Spinning, true, 'Deck 0 is spinning');
    assert.equal(st7.deck1Spinning, false, 'Deck 1 stopped');
    await page.screenshot({ path: `${out}/1659-6-slumpad-nasta-lat.png` });
    console.log('Saved 1659-6-slumpad-nasta-lat.png');

    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/test-result.json`, JSON.stringify({ st0, st1, st2, st3, st4, st5, st6, st7, errors }, null, 2));
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
