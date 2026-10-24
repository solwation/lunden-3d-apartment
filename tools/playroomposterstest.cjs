// #1574: the playhouse's posters, neon and zoned light. One page load: draw cost per view inside the room, the same views with the poster mesh removed,
// none of it outside (the room's group is hidden), no light sources, the light switch + disco ball still work, the zone levels (SPEL darker, BILJARD
// pub-like) and the result pictures. `before` only takes pictures + draw counts (the state before #1574).
//   PLAYWRIGHT_MODULE=… node tools/playroomposterstest.cjs http://localhost:8183 docs/verification/1574 after
const fs = require('node:fs'), assert = require('node:assert/strict'), kit = require('./testkit.cjs');
const [game = 'http://localhost:8183', out = '/tmp/posters1574', mode = 'after'] = process.argv.slice(2);
const VIEWS = {
  hall1: [[-1.2, 1.45, 4.6], [-4.2, 1.2, 1.66]], hall2: [[-1.5, 1.5, 3.0], [4.5, 1.2, 5.2]], hall3: [[-4.5, 1.5, 2.7], [6, 1.3, 4.2]],
  spel1: [[4.2, 1.5, 0.9], [7.5, 1.7, -4.6]], spel2: [[7.8, 1.5, -4.2], [4.2, 1.5, -.2]], spel3: [[4, 1.5, -4.2], [8.9, 1.8, -.6]],
  bilj1: [[-2.2, 1.45, 0.9], [0.4, 1.2, -4.8]], bilj2: [[-2.2, 1.5, -4.2], [2.9, 1.4, -.8]], bilj3: [[0, 1.5, 1.1], [0, 1.3, -3.6]],
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
    await page.addInitScript(() => sessionStorage.setItem('lunden.nameSkipped', '1'));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&test=lazy&cloud=&mp=0&freeze&time=12&month=6`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000 });
    await page.evaluate(() => { const a = __app; a.showOverlay(false); a.use({ kind: 'playhouse' }); });
    await page.waitForFunction(() => __app.player.inPlayroom);
    await page.waitForTimeout(700);
    await page.evaluate(() => { const a = __app; a.renderer.setAnimationLoop(null); a.touch.enabled = false; a.world.playroom.setDisco(false); a.testMode.setFull(true); });
    const view = (name, key, posters = true) => page.evaluate(async ({ name, key, posters, v }) => {
      const a = __app, { PLAYROOM: R } = await import('/src/config.js'), room = a.world.playroom, [from, to] = v;
      if (room.roomPosters) room.roomPosters.mesh.visible = posters;
      a.player.spawn(R.x + from[0], R.z + from[2], 0); a.step(1 / 60);
      a.camera.position.set(R.x + from[0], from[1], R.z + from[2]); a.camera.lookAt(R.x + to[0], to[1], R.z + to[2]); a.camera.updateMatrixWorld(true);
      a.step(1 / 60); a.renderer.info.reset(); a.testMode.draw();
      return { calls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles, lit: room.lit };
    }, { name, key, posters, v: VIEWS[key] });
    const counts = {};
    for (const key of Object.keys(VIEWS)) {
      counts[key] = await view(key, key, true);
      await page.screenshot({ path: `${out}/${key}.png` });
      if (mode === 'after') counts[key].without = await view(key, key, false);
    }
    if (mode === 'after') await page.evaluate(() => { __app.world.playroom.roomPosters.mesh.visible = true; });
    // disco on in SPEL and BILJARD (the ball's sweeping spots are unchanged)
    await page.evaluate(() => __app.world.playroom.setDisco(true));
    await view('d', 'spel1'); await page.screenshot({ path: `${out}/spel1-disco.png` });
    await view('d', 'bilj1'); await page.screenshot({ path: `${out}/bilj1-disco.png` });
    const report = { mode, counts };
    // the light switch and the ball behave as before: off = off (ball dull, spots hidden, ambient up), on = on
    report.light = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, o = {};
      const snap = (k) => { a.step(1 / 60); o[k] = { on: room.discoOn, lit: room.lit, ball: room.ball.material.color.r, spots: room.spots.visible, level: room.roomPosters?.probe() }; };
      room.setDisco(true); snap('on'); a.use(room.discoTarget); snap('toggled'); room.setDisco(true); snap('on2');
      o.zones = room.zones ? { lamp: room.zones.lamp.toArray(), ambient: room.zones.ambient.toArray() } : null;
      o.lights = 0; room.object.traverse((m) => { if (m.isLight) o.lights++; });
      return o;
    });
    // outside: nothing of it draws (the group is hidden), the same draws without the poster mesh
    report.outside = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom;
      room.setInside(false); const o = room.constructor.outsideSpot; a.player.spawn(o.x, o.z, o.yaw); a.step(1 / 60);
      const count = () => { a.renderer.info.reset(); a.testMode.draw(); return a.renderer.info.render.calls; };
      for (let i = 0; i < 20; i++) { a.step(1 / 60); count(); }
      const before = count(), m = room.roomPosters?.mesh, p = m?.parent;
      m?.removeFromParent(); const removed = count(); if (m) p.add(m);
      return { visible: room.object.visible, before, removed };
    });
    report.errors = errors;
    fs.writeFileSync(`${out}/result-${mode}.json`, JSON.stringify(report, null, 2));
    if (mode === 'after') {
      for (const [k, c] of Object.entries(counts)) assert.ok(c.calls - c.without.calls <= 1, `${k}: extra draws ${c.calls - c.without.calls}`);
      assert.equal(report.outside.visible, false); assert.equal(report.outside.before, report.outside.removed, 'nothing drawn outside');
      assert.equal(report.light.lights, 0, 'no light sources');
      const L = report.light; assert.ok(L.on.on && L.on.spots && L.on.ball === 1 && !L.toggled.on && !L.toggled.spots && L.toggled.ball < .5 && L.on2.on, JSON.stringify(L));
      assert.ok(L.toggled.lit > L.on.lit, 'switch off raises ambient as before');
      assert.ok(L.on.level.poster > 0.1 && Math.abs(L.on.level.poster - L.on2.level.poster) < 1e-6 && L.toggled.level.poster > L.on.level.poster, 'posters follow the room ambient: ' + JSON.stringify(L));
      assert.ok(L.on.level.panel_spel < L.on.level.panel_biljard && L.on.level.panel_biljard < 1 && L.on.level.panel_spel > 0, 'panels follow the zones');
    }
    assert.deepEqual(errors, []);
    console.log('PASS', mode, JSON.stringify(report));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
