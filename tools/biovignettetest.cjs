// #1570: the BIO's idle screen (no instruction line, vignette), the aim/action prompt on desktop and touch, the sconces dimming while a film
// runs and returning when it stops, switching the disco on beating the dimming (off keeps it, no hidden beam work, #1610), draws inside/outside, and the result pictures.
//   PLAYWRIGHT_MODULE=… node tools/biovignettetest.cjs http://localhost:8171 docs/verification/1570
const fs = require('node:fs'), assert = require('node:assert/strict'), kit = require('./testkit.cjs');
const [game = 'http://localhost:8171', out = '/tmp/bio1570'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true }), errors = [];
    await page.addInitScript(() => {
      sessionStorage.setItem('lunden.nameSkipped', '1');
      window.__texts = []; const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { window.__texts.push(String(t)); return f.call(this, t, ...r); };
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&test=lazy&cloud=&mp=0&freeze&time=12&month=6`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000 });
    await page.evaluate(() => { const a = __app; a.showOverlay(false); a.use({ kind: 'playhouse' }); });
    await page.waitForFunction(() => __app.player.inPlayroom);
    await page.waitForTimeout(700);
    await page.evaluate(() => { const a = __app; a.renderer.setAnimationLoop(null); a.touch.enabled = false; a.testMode.setFull(true); });
    const texts = await page.evaluate(() => window.__texts);
    assert.ok(texts.includes('BION') && !texts.some((t) => /tryck på duken|filmförslag/.test(t)), `idle texts ${texts}`);
    // look at the screen from the seat row (a view helper)
    const view = (from, to) => page.evaluate(async ({ from, to }) => {
      const a = __app, { PLAYROOM: R } = await import('/src/config.js');
      a.player.spawn(R.x + from[0], R.z + from[2], 0); a.step(1 / 60);
      a.camera.position.set(R.x + from[0], from[1], R.z + from[2]); a.camera.lookAt(R.x + to[0], to[1], R.z + to[2]); a.camera.updateMatrixWorld(true);
      a.step(1 / 60); a.frame(0); a.testMode.draw();
    }, { from, to });
    const S = await page.evaluate(async () => (await import('/src/config.js')).PLAYROOM.furniture.cinema.screen);
    // desktop prompt when aiming at the screen
    await page.evaluate(() => { __app.world.playroom.setDisco(false); __app.world.playroom.discoOn = false; });
    await page.evaluate(() => __app.renderer.domElement.requestPointerLock()); await page.waitForFunction(() => document.pointerLockElement);
    await view([-4.2, 1.2, S.z], [S.x + .08, S.bottom + S.h / 2, S.z]);
    const desktop = await page.evaluate(() => ({ name: __app.focus().focused?.name, verb: __app.focus().focused?.verb, prompt: document.getElementById('prompt').textContent, hidden: document.getElementById('prompt').hidden }));
    assert.equal(desktop.name, 'bioduken'); assert.ok(!desktop.hidden && /bioduken/.test(desktop.prompt), JSON.stringify(desktop));
    await page.evaluate(() => document.exitPointerLock()); await page.waitForFunction(() => !document.pointerLockElement);
    // touch prompt
    await page.evaluate(() => { __app.touch.enabled = true; __app.activeMode = 'touch'; document.body.classList.add('touch'); });
    await page.setViewportSize({ width: 844, height: 390 }); await page.evaluate(() => __app.frame(0));
    await view([-4.2, 1.2, S.z], [S.x + .08, S.bottom + S.h / 2, S.z]);
    const touch = await page.evaluate(() => ({ name: __app.focus().focused?.name, action: document.getElementById('action').textContent, hidden: document.getElementById('action').hidden }));
    assert.equal(touch.name, 'bioduken'); assert.ok(!touch.hidden && touch.action.length > 0, JSON.stringify(touch));
    await page.screenshot({ path: `${out}/duken-vila-mobil.png` });
    await page.evaluate(() => { __app.touch.enabled = false; __app.activeMode = 'mouse'; document.body.classList.remove('touch'); __app.showOverlay(false); });
    await page.setViewportSize({ width: 1280, height: 800 }); await page.evaluate(() => __app.frame(0));
    // dimming: a film starts (through the cinema state main.js reads), runs, stops
    const levels = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, { PLAYROOM: R } = await import('/src/config.js');
      room.setDisco(true); const out = {};
      const snap = (k) => { out[k] = { dim: room.filmDim, lit: room.lit, color: room.sconces.material.color.getHex(), spots: room.spots.visible, film: room.film }; };
      for (let i = 0; i < 120; i++) a.step(1 / 60); snap('idle');
      a.cinema.state = { video: 'abcdefghijk', playing: true, position: 0, at: 0, q: 1 };
      for (let i = 0; i < 400; i++) a.step(1 / 60); snap('film');
      a.cinema.state = { ...a.cinema.state, video: '' };
      for (let i = 0; i < 400; i++) a.step(1 / 60); snap('stopped');
      // #1610: while the film hides the spots no beam work is uploaded; switching the disco off keeps the dimming
      a.cinema.state = { ...a.cinema.state, video: 'abcdefghijk' };
      for (let i = 0; i < 400; i++) a.step(1 / 60); snap('filmDisco');
      const pos = room.spots.geometry.attributes.position, v0 = pos.version;
      for (let i = 0; i < 60; i++) a.step(1 / 60); out.hiddenUploads = pos.version - v0;
      room.toggleDisco(); for (let i = 0; i < 400; i++) a.step(1 / 60); snap('discoOff');
      // switching the disco on beats the film; the spots are recomputed again
      room.toggleDisco(); for (let i = 0; i < 400; i++) a.step(1 / 60); snap('override');
      const v1 = pos.version; for (let i = 0; i < 10; i++) a.step(1 / 60); out.shownUploads = pos.version - v1;
      a.cinema.state = { ...a.cinema.state, video: '' }; room.setDisco(true);
      for (let i = 0; i < 200; i++) a.step(1 / 60);
      a.cinema.state = null; out.R = R.sconces; return out;
    });
    assert.equal(levels.idle.dim, 0); assert.equal(levels.film.dim, 1); assert.ok(levels.film.film);
    assert.ok(levels.film.lit < levels.idle.lit && levels.film.color < levels.idle.color && !levels.film.spots, JSON.stringify(levels));
    assert.equal(levels.stopped.dim, 0); assert.equal(levels.stopped.color, levels.idle.color); assert.ok(levels.stopped.spots);
    assert.equal(levels.hiddenUploads, 0, 'no disco beam upload while the film hides the spots');
    assert.equal(levels.discoOff.dim, 1, 'switching the disco off keeps the film dimming');
    assert.ok(levels.discoOff.lit <= levels.filmDisco.lit && levels.discoOff.color === levels.filmDisco.color && !levels.discoOff.spots, 'disco off during a film is not brighter');
    assert.equal(levels.override.dim, 0, 'switching the disco on beats the dimming'); assert.equal(levels.override.film, true);
    assert.ok(levels.override.spots && levels.shownUploads > 0, 'the spots move again once shown');
    // pictures: lit / dimmed salon with the speakers, and the front speakers from the seats
    const pics = async (name, film) => {
      await page.evaluate(async (film) => { const a = __app; a.world.playroom.setDisco(false); a.cinema.state = film ? { video: 'abcdefghijk', playing: true, position: 0, at: 0, q: 1 } : null; for (let i = 0; i < 400; i++) a.step(1 / 60); }, film);
      await page.evaluate(() => { __app.showOverlay(false); document.getElementById('prompt').hidden = true; });
      await view([-3.4, 1.55, -1.7], [-8, 1.5, -1.7]); await page.screenshot({ path: `${out}/salong-${name}.png` });
    };
    await pics('tand', false); await pics('dimmad', true);
    await view([-5.6, 1.5, 1.0], [-8.4, .7, -3.8]); await page.screenshot({ path: `${out}/hogtalare-front.png` });
    await view([-8.2, 1.6, -1.83], [-3.1, 1.9, -1.0]); await page.screenshot({ path: `${out}/hogtalare-bak.png` });
    // draws: the sconces are one extra mesh inside; no draw outside
    const draws = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, { PLAYROOM: R } = await import('/src/config.js');
      a.cinema.state = null; for (let i = 0; i < 400; i++) a.step(1 / 60);
      a.player.spawn(R.x - 4, R.z - 1.7, 0); a.step(1 / 60); a.camera.position.set(R.x - 4, 1.4, R.z - 1.7); a.camera.lookAt(R.x - 8, 1.4, R.z - 1.7); a.camera.updateMatrixWorld(true);
      const count = () => { a.renderer.info.reset(); a.testMode.draw(); return { calls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles }; };
      const withIt = count(); room.sconces.visible = false; const without = count(); room.sconces.visible = true;
      let lights = 0; room.object.traverse((o) => { if (o.isLight) lights++; });
      room.setInside(false); const o = room.constructor.outsideSpot; a.player.spawn(o.x, o.z, o.yaw); a.step(1 / 60);
      for (let i = 0; i < 20; i++) { a.step(1 / 60); count(); }
      const outA = count(); room.sconces.visible = false; const outB = count(); room.sconces.visible = true;
      return { withIt, without, extra: withIt.calls - without.calls, lights, outA: outA.calls, outB: outB.calls, outside: room.object.visible };
    });
    assert.equal(draws.extra, 1); assert.equal(draws.lights, 0); assert.equal(draws.outA, draws.outB); assert.equal(draws.outside, false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/result.json`, JSON.stringify({ texts, desktop, touch, levels, draws, errors }, null, 2));
    console.log('PASS bio vignette', JSON.stringify({ desktop, touch, draws }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
