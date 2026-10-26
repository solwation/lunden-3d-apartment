// #1619: the BIO darkens slowly when a film starts (and lights up slowly when it stops), the masking curtains follow the film's picture ratio (4:3 narrow, 16:9 apart,
// smoothly), the green emergency-exit signs hang above the three passages and the playhouse door, and none of it adds a light or more than two draws.
//   PLAYWRIGHT_MODULE=… node tools/bio1619test.cjs http://localhost:8619 docs/verification/1619
const fs = require('node:fs'), assert = require('node:assert/strict'), kit = require('./testkit.cjs');
const [game = 'http://localhost:8619', out = '/tmp/bio1619'] = process.argv.slice(2);
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
    await page.waitForFunction(() => __app.player.inPlayroom); await page.waitForTimeout(700);
    await page.evaluate(() => { const a = __app; a.renderer.setAnimationLoop(null); a.touch.enabled = false; a.testMode.setFull(true); a.world.playroom.setDisco(false); });
    const view = (from, to) => page.evaluate(async ({ from, to }) => {
      const a = __app, { PLAYROOM: R } = await import('/src/config.js');
      a.player.spawn(R.x + from[0], R.z + from[2], 0); a.step(1 / 60);
      a.camera.position.set(R.x + from[0], from[1], R.z + from[2]); a.camera.lookAt(R.x + to[0], to[1], R.z + to[2]); a.camera.updateMatrixWorld(true);
      a.step(1 / 60); a.frame(0); a.testMode.draw(); document.getElementById('prompt').hidden = true; a.showOverlay(false);
    }, { from, to });
    const S = await page.evaluate(async () => (await import('/src/config.js')).PLAYROOM.furniture.cinema.screen);
    const seats = [-3.4, 1.55, S.z], screen = [S.x + .08, 1.35, S.z];

    // 1. slow darkening: sample the fade (60 steps/s) after the start and after the stop
    const fade = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, { PLAYROOM: R } = await import('/src/config.js'), samples = [];
      const snap = (t, phase) => samples.push({ phase, t, dim: +room.filmDim.toFixed(3), lit: +room.lit.toFixed(3), sconce: +room.sconces.material.color.r.toFixed(3), posters: +room.posters.material?.color?.r?.toFixed(3) });
      for (let i = 0; i < 60; i++) a.step(1 / 60); snap(0, 'idle');
      a.cinema.state = { video: 'abcdefghijk', playing: true, position: 0, at: 0, q: 1 };
      for (let s = 1; s <= 9; s++) { for (let i = 0; i < 60; i++) a.step(1 / 60); snap(s, 'start'); }
      a.cinema.state = { ...a.cinema.state, video: '' };
      for (let s = 1; s <= 9; s++) { for (let i = 0; i < 60; i++) a.step(1 / 60); snap(s, 'stop'); }
      return { samples, cfg: R.sconces };
    });
    const at = (p, t) => fade.samples.find((s) => s.phase === p && s.t === t);
    assert.ok(at('start', 1).dim < .25 && at('start', 3).dim > .3 && at('start', 3).dim < .7 && at('start', 5).dim < 1 && at('start', 7).dim === 1, 'slow ramp down ' + JSON.stringify(fade.samples));
    assert.ok(at('start', 7).sconce < .08 * 1.001 + 0 && at('start', 7).lit < at('idle', 0).lit * .2, 'much darker');
    assert.ok(at('stop', 1).dim > .7 && at('stop', 3).dim > .3 && at('stop', 3).dim < .7 && at('stop', 7).dim === 0 && at('stop', 7).sconce === 1, 'slow ramp up');

    // 2. curtains: picture width for 4:3 and 16:9 (the surface ratio main.js passes on), measured on the mesh
    const curtains = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, { PLAYROOM: R } = await import('/src/config.js'), { pictureAspect } = await import('/src/cinemasurface.js');
      const s = R.furniture.cinema.screen, c = R.furniture.cinema.curtain, mesh = room.curtains.mesh, out = {};
      const gap = () => { // clear opening between the inner curtain edges (z), from the vertex data
        const p = mesh.geometry.attributes.position; let north = -1e9, south = 1e9;
        for (let i = 0; i < p.count; i++) { const z = p.getZ(i) - R.z; if (z < s.z) north = Math.max(north, z); else south = Math.min(south, z); }
        return south - north;
      };
      const run = (seconds) => { for (let i = 0; i < seconds * 60; i++) a.step(1 / 60); };
      a.cinema.surface.show(true);
      out.apart = gap(); out.screenW = s.w;
      const trace = [];
      for (const [name, aspect] of [['4:3', 4 / 3], ['16:9', 16 / 9], ['2.39:1', 2.39]]) {
        a.cinema.state = { video: 'abcdefghijk', playing: true, position: 0, at: 0, q: 1 }; a.cinema.surface.aspect = aspect;
        if (name === '16:9') { trace.length = 0; for (let i = 0; i < 12; i++) { run(.25); trace.push(+gap().toFixed(3)); } out.traceTo169 = trace.slice(); }
        run(6); out[name] = { gap: +gap().toFixed(3), expected: +Math.min(s.w - 2 * c.overlap, s.h * aspect + 2 * c.pad).toFixed(3), picture: +(s.h * aspect).toFixed(3) };
      }
      a.cinema.state = { ...a.cinema.state, video: '' }; a.cinema.surface.show(false); run(6); out.after = gap();
      // pictureAspect on synthetic 320x180 thumbnails
      const make = (l, t, noise = 0) => { const w = 320, h = 180, d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, inside = x >= l && x < w - l && y >= t && y < h - t, v = inside ? 90 + ((x * 7 + y * 13) % 120) : noise; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } return pictureAspect(d, w, h); };
      out.aspects = { full: make(0, 0), p43: make(40, 0), p43noise: make(40, 0, 9), l239: make(0, 23), none: pictureAspect(new Uint8ClampedArray(320 * 180 * 4).fill(0), 320, 180) };
      return out;
    });
    assert.ok(Math.abs(curtains.apart - (curtains.screenW - 2 * .06)) < .01, 'rest: apart ' + JSON.stringify(curtains));
    assert.ok(Math.abs(curtains['4:3'].gap - curtains['4:3'].expected) < .02 && curtains['4:3'].gap < curtains['16:9'].gap - .5, '4:3 ' + JSON.stringify(curtains));
    assert.ok(Math.abs(curtains['16:9'].gap - curtains['16:9'].expected) < .02 && curtains['16:9'].gap < curtains.apart && curtains['2.39:1'].gap > curtains['16:9'].gap, '16:9 ' + JSON.stringify(curtains));
    assert.ok(curtains.traceTo169.every((v, i, t) => i === 0 || v >= t[i - 1] - 1e-3) && new Set(curtains.traceTo169).size > 4, 'smooth ' + curtains.traceTo169);
    assert.ok(Math.abs(curtains.after - curtains.apart) < .01, 'back apart after the film');
    const A = curtains.aspects;
    assert.ok(Math.abs(A.full - 16 / 9) < .01 && Math.abs(A.p43 - 4 / 3) < .02 && Math.abs(A.p43noise - 4 / 3) < .02 && Math.abs(A.l239 - 320 / (180 - 46)) < .02 && A.none === 0, JSON.stringify(A));
    // the real thumbnail of a 4:3 film (needs network; skipped quietly offline)
    const real = await page.evaluate(async () => { const s = __app.cinema.surface; s.measure('jNQXAC9IVRw'); await new Promise((r) => setTimeout(r, 4000)); const v = s.aspect; s.show(false); return v; });
    assert.ok(Math.abs(real - 4 / 3) < .03, 'real 4:3 thumbnail ' + real);
    console.log('real thumbnail aspect (Me at the zoo, a 4:3 upload):', real);

    // 3. exit signs: positions, one draw, no light; counts
    const signs = await page.evaluate(async () => {
      const a = __app, room = a.world.playroom, { PLAYROOM: R } = await import('/src/config.js'), { exitSignSpots } = await import('/src/clubhouseexit.js');
      const spots = exitSignSpots(); let lights = 0; room.object.traverse((o) => { if (o.isLight) lights++; });
      a.cinema.state = null; for (let i = 0; i < 200; i++) a.step(1 / 60);
      a.player.spawn(R.x - 6, R.z - 1.4, 0); a.step(1 / 60); a.camera.position.set(R.x - 6, 1.6, R.z - 1.4); a.camera.lookAt(R.x - 6, 2.4, R.z + 1.5); a.camera.updateMatrixWorld(true);
      const count = () => { a.renderer.info.reset(); a.testMode.draw(); return a.renderer.info.render.calls; };
      const withAll = count(); room.exitSigns.visible = false; const noSigns = count(); room.exitSigns.visible = true;
      return { spots, lights, signMesh: room.exitSigns.geometry.attributes.position.count / 4, extraDraws: withAll - noSigns, material: room.exitSigns.material.type };
    });
    assert.equal(signs.signMesh, 4); assert.equal(signs.lights, 0); assert.equal(signs.extraDraws, 1); assert.equal(signs.material, 'MeshBasicMaterial');
    // curtains: no extra draws beyond the one mesh that replaced the two merged curtains
    // pictures
    const film = (aspect) => page.evaluate(async (aspect) => {
      const a = __app; a.world.playroom.setDisco(false); a.cinema.state = aspect ? { video: 'abcdefghijk', playing: true, position: 0, at: 0, q: 1 } : null;
      if (aspect) { a.cinema.surface.show(true); a.cinema.surface.aspect = aspect; } else a.cinema.surface.show(false);
      for (let i = 0; i < 600; i++) a.step(1 / 60);
    }, aspect);
    await film(0); await view(seats, screen); await page.screenshot({ path: `${out}/salong-fore.png` });
    await film(16 / 9); await view(seats, screen); await page.screenshot({ path: `${out}/salong-dimmad-16x9.png` });
    await film(4 / 3); await view(seats, screen); await page.screenshot({ path: `${out}/salong-dimmad-4x3.png` });
    await film(0);
    await view([-6, 1.6, -1.4], [-6, 2.4, 1.5]); await page.screenshot({ path: `${out}/skylt-bio.png` });
    await view([0, 1.6, 3.4], [0, 2.4, 5.2]); await page.screenshot({ path: `${out}/skylt-ytterdorr.png` });
    await view([0, 1.6, -1.6], [0, 2.4, 1.4]); await page.screenshot({ path: `${out}/skylt-biljard.png` });
    await view([6, 1.6, -1.6], [6, 2.4, 1.4]); await page.screenshot({ path: `${out}/skylt-spel.png` });
    await film(16 / 9); await view([-6, 1.6, -1.4], [-6, 2.4, 1.5]); await page.screenshot({ path: `${out}/skylt-bio-dimmad.png` });
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/result.json`, JSON.stringify({ fade, curtains, real, signs, errors }, null, 2));
    console.log('PASS bio 1619', JSON.stringify({ curtains: { apart: curtains.apart, '4:3': curtains['4:3'], '16:9': curtains['16:9'], '2.39:1': curtains['2.39:1'] }, signs }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
