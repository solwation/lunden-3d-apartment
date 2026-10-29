// #1688: starting a film in the BIO froze the game on phones. The masking curtains (#1619) rewrite their normals as they follow the
// film's picture ratio, but the phone profile (lowmemory.js) had packed and freed those normals after the first upload, so the first
// curtain move marked an empty array for upload and three threw "WebGLAttributes … Resizing buffer attributes is not supported" in
// render. This runs the phone profile (`&lowmem`, small touch viewport), draws the curtains, starts a film and draws while they move.
//   PLAYWRIGHT_MODULE=… node tools/cinema1688lowmemtest.cjs http://localhost:8772 docs/verification/1688
// Reproduction against an older src/cinemacurtains.js: CURTAINS_FILE=<path> EXPECT_CRASH=1 node tools/cinema1688lowmemtest.cjs …
const fs = require('node:fs'), assert = require('node:assert/strict'), kit = require('./testkit.cjs');
const [game = 'http://localhost:8772', out = '/tmp/cinema1688'] = process.argv.slice(2);
const override = process.env.CURTAINS_FILE, expectCrash = process.env.EXPECT_CRASH === '1';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true }), page = await context.newPage(), errors = [];
    if (override) await page.route('**/src/cinemacurtains.js', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(override, 'utf8') }));
    await page.addInitScript(() => sessionStorage.setItem('lunden.nameSkipped', '1'));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?lowmem&shot&test=lazy&cloud=&mp=0&freeze&time=12&month=6`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000 });
    await page.evaluate(() => { const a = __app; a.showOverlay(false); a.use({ kind: 'playhouse' }); });
    await page.waitForFunction(() => __app.player.inPlayroom); await page.waitForTimeout(700);
    const result = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, { PLAYROOM: R } = await import('/src/config.js'), { lowMemory } = await import('/src/lowmemory.js');
      a.renderer.setAnimationLoop(null); a.touch.enabled = false; a.testMode.setFull(true); room.setDisco(false);
      const S = R.furniture.cinema.screen, c = R.furniture.cinema.curtain, g = room.curtains.mesh.geometry;
      const look = () => { a.player.spawn(R.x - 3.4, R.z + S.z, 0); a.step(1 / 60); a.camera.position.set(R.x - 3.4, 1.55, R.z + S.z); a.camera.lookAt(R.x + S.x + .08, 1.35, R.z + S.z); a.camera.updateMatrixWorld(true); };
      const attr = (n) => { const x = g.attributes[n]; return { itemSize: x.itemSize, length: x.array.length, count: x.count, freed: !!x.cpuFreed, dynamic: x.usage === 35048 }; };
      const gap = () => { const p = g.attributes.position; let north = -1e9, south = 1e9; for (let i = 0; i < p.count; i++) { const z = p.getZ(i) - R.z; if (z < S.z) north = Math.max(north, z); else south = Math.min(south, z); } return south - north; };
      const thrown = [];
      const draw = () => { try { a.testMode.draw(); } catch (e) { thrown.push(String(e.message || e)); } };
      look(); for (let i = 0; i < 3; i++) { a.step(1 / 60); draw(); } // the curtains are on the GPU: the phone profile frees what it may
      const before = { normal: attr('normal'), position: attr('position'), keepCpu: !!g.userData.keepCpu, gap: gap() };
      a.cinema.state = { video: 'abcdefghijk', playing: true, position: 0, at: 0, q: 1 }; a.cinema.surface.show(true); a.cinema.surface.aspect = 4 / 3;
      for (let i = 0; i < 6 * 60 && thrown.length === 0; i++) { a.step(1 / 60); if (i % 10 === 0) { look(); draw(); } }
      look(); draw();
      const n = g.attributes.normal; let unit = 0;
      for (let i = 0; i < n.count; i++) if (Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < .02) unit++;
      return { lowMemory, before, after: { normal: attr('normal'), gap: gap(), unitNormals: unit / n.count }, expected43: Math.min(S.w - 2 * c.overlap, S.h * 4 / 3 + 2 * c.pad), thrown };
    });
    fs.writeFileSync(`${out}/result${override ? '-before' : ''}.json`, JSON.stringify({ result, errors }, null, 2));
    console.log(JSON.stringify(result));
    assert.equal(result.lowMemory, true, 'the phone profile is on');
    if (expectCrash) {
      assert.ok(result.thrown.some((m) => /WebGLAttributes.*Resizing buffer attributes/.test(m)), 'reproduces the reported render error ' + JSON.stringify(result.thrown));
      console.log('REPRODUCED #1688 with', override);
      return;
    }
    if (!override) await page.screenshot({ path: `${out}/mobil-bio-4x3.png` });
    assert.deepEqual(result.thrown, [], 'no render error while the curtains move');
    assert.deepEqual(errors, []);
    assert.ok(result.before.keepCpu && result.before.normal.dynamic && result.before.position.dynamic, 'curtain geometry is marked as rewritten ' + JSON.stringify(result.before));
    assert.ok(!result.after.normal.freed && result.after.normal.itemSize === 3 && result.after.normal.length === result.after.normal.count * 3, 'float normals kept on the CPU ' + JSON.stringify(result.after));
    assert.ok(result.after.unitNormals > .99, 'normals stay unit length ' + result.after.unitNormals);
    assert.ok(result.after.gap < result.before.gap - .3 && Math.abs(result.after.gap - result.expected43) < .03, 'curtains reached the 4:3 opening ' + JSON.stringify(result));
    console.log('PASS cinema 1688 lowmem');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
