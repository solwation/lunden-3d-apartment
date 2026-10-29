// #1670: the playhouse's real posters in the real app. One page load: nothing fetched before entering; the endpoint failing → the canvas designs
// (pictures "before"); then a faked GET /playroom/posters (POSTER_ROOMS=<file>: a saved answer, e.g. the real Commons pick of a day) with the
// thumbnails loaded from Wikimedia → the same views again ("after"). Draw calls per view and the atlas size must not change, no light sources.
//   PLAYWRIGHT_MODULE=… POSTER_ROOMS=/path/answer.json node tools/playroomphotostest.cjs http://localhost:8291 docs/verification/1670
const fs = require('node:fs'), assert = require('node:assert/strict'), kit = require('./testkit.cjs');
const [game = 'http://localhost:8291', out = '/tmp/playroom1670'] = process.argv.slice(2);
const CLOUD = 'http://localhost:8181', ANSWER = JSON.parse(fs.readFileSync(process.env.POSTER_ROOMS, 'utf8'));
const VIEWS = { // [from, to] in the room's local metres (the #1574 views)
  hall: [[-1.5, 1.5, 3.0], [4.5, 1.2, 5.2]], spel: [[4.2, 1.5, 0.9], [7.5, 1.7, -4.6]], spel2: [[7.8, 1.5, -4.2], [4.2, 1.5, -.2]],
  biljard: [[-2.2, 1.5, -4.2], [2.9, 1.4, -.8]], hallnear: [[-2.75, 1.3, 2.3], [-2.75, 1.25, 1.55]],
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    let mode = 'fail', calls = 0;
    await ctx.route(`${CLOUD}/**`, (route) => {
      const url = new URL(route.request().url()), cors = { 'Access-Control-Allow-Origin': '*' };
      if (url.pathname === '/playroom/posters') { calls++; return mode === 'ok' ? route.fulfill({ json: ANSWER, headers: cors }) : route.fulfill({ status: 502, json: { error: 'posters unavailable' }, headers: cors }); }
      return route.fulfill({ status: 404, json: { error: 'not found' }, headers: cors });
    });
    const page = await ctx.newPage(), errors = [];
    await page.addInitScript(() => { sessionStorage.setItem('lunden.nameSkipped', '1'); localStorage.removeItem('lunden.playroomPosters'); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&test=lazy&cloud=${CLOUD}&mp=0&freeze&time=12&month=6`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000 });
    assert.equal(calls, 0, 'nothing fetched before entering the playhouse');
    await page.evaluate(() => { const a = __app; a.showOverlay(false); a.use({ kind: 'playhouse' }); });
    await page.waitForFunction(() => __app.player.inPlayroom);
    await page.waitForFunction(() => !__app.world.playroom.roomPhotos.loading, null, { timeout: 20000 });
    await page.evaluate(() => { const a = __app; a.renderer.setAnimationLoop(null); a.touch.enabled = false; a.testMode.setFull(true); a.world.playroom.setDisco(false); });
    const view = (key) => page.evaluate(async (v) => {
      const a = __app, { PLAYROOM: R } = await import('/src/config.js'), [from, to] = v;
      a.player.spawn(R.x + from[0], R.z + from[2], 0); a.step(1 / 60);
      a.camera.position.set(R.x + from[0], from[1], R.z + from[2]); a.camera.lookAt(R.x + to[0], to[1], R.z + to[2]); a.camera.updateMatrixWorld(true);
      a.step(1 / 60); document.getElementById('prompt').hidden = true; const qr = document.getElementById('corner-qr'); if (qr) qr.hidden = true; a.renderer.info.reset(); a.testMode.draw();
      return a.renderer.info.render.calls;
    }, VIEWS[key]);
    const state = () => page.evaluate(() => { const r = __app.world.playroom, p = r.roomPhotos, map = r.roomPosters.mesh.material.map, info = __app.renderer.info;
      let lights = 0; r.object.traverse((o) => { if (o.isLight) lights++; });
      return { source: p.source, painted: p.painted, loaded: p.loaded ?? 0, atlas: [map.image.width, map.image.height], textures: info.memory.textures, lights }; });
    const before = { state: await state(), calls: {} };
    assert.equal(calls, 1); assert.equal(before.state.source, 'generic'); assert.equal(before.state.painted, 0);
    for (const key of Object.keys(VIEWS)) { before.calls[key] = await view(key); await page.screenshot({ path: `${out}/fore-${key}.png` }); }
    before.state.textures = await page.evaluate(() => __app.renderer.info.memory.textures); // (uploaded on the first draw)
    mode = 'ok';
    await page.evaluate(() => { const p = __app.world.playroom.roomPhotos; p.nextTry = 0; return p.refresh(); });
    const after = { state: await state(), calls: {} };
    for (const key of Object.keys(VIEWS)) { after.calls[key] = await view(key); await page.screenshot({ path: `${out}/efter-${key}.png` }); }
    after.state.textures = await page.evaluate(() => __app.renderer.info.memory.textures);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lunden.playroomPosters') ?? 'null'));
    await page.evaluate(() => __app.world.playroom.roomPhotos.refresh()); // same day, already live: no second fetch
    const report = { before, after, calls, stored: stored && Object.fromEntries(Object.entries(stored.rooms).map(([k, v]) => [k, v.length])), errors };
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(report, null, 2));
    assert.equal(after.state.source, 'live'); assert.equal(after.state.painted, 1); assert.ok(after.state.loaded >= 20, `pictures loaded: ${after.state.loaded}`);
    assert.deepEqual(after.calls, before.calls, 'the same draw calls in every view');
    assert.deepEqual(after.state.atlas, before.state.atlas, 'the same atlas size');
    assert.equal(after.state.textures, before.state.textures, 'the old atlas is freed: no extra texture');
    assert.equal(after.state.lights, 0);
    assert.deepEqual(report.stored, { hall: 10, spel: 9, biljard: 9 });
    assert.equal(calls, 2, 'one fetch per day once live');
    assert.deepEqual(errors, []);
    console.log('PASS', JSON.stringify(report));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
