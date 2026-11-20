// #2229: the e-scooters in the real app (World, Player, the main loop, the HUD). Checks: scooters stand on pavements and can be
// mounted; draw calls with / without the scooter batch; the screwdriver from the EL/C cabinet tunes a scooter at its hatch (hold E,
// release pauses, done after SCOOTER.tune.time); the speed display while riding; untuned capped at 20 km/h, tuned faster; a kerb hop
// counts as a jump; a big flight gives the local slow motion with the chase camera, which returns on landing. Images (JPEG) to OUT.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/scooter2229browser.cjs http://localhost:8600 docs/verification/2229
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8600', out = process.argv[3] || '/tmp/scooter2229';
let failed = 0;
const check = (ok, label, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${d !== '' ? ' — ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await kit.launch(), errors = [];
  try {
    const { page } = await kit.open(browser, `${base}/?shot&time=13&month=6&weather=clear&mp=0`, { lazy: true, viewport: kit.FULL,
      init: () => { localStorage.setItem('lunden.name', 'Testare'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
    page.on('pageerror', (e) => errors.push(e.message));
    await kit.skipNameDialog(page);
    await page.waitForFunction(() => window.__app?.scooters && !document.documentElement.classList.contains('resuming'), null, { timeout: 600000 });
    const shot = async (name, frames = 3) => {
      await page.evaluate(async (n) => { window.__app.testMode.setFull(true); for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r())); }, frames);
      await page.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 82 });
      await page.evaluate(() => window.__app.testMode.setFull(false));
      console.log('image', path.join(out, name), fs.statSync(path.join(out, name)).size, 'bytes');
    };
    // 1. placement: every scooter on a pavement spot, mountable; pick the one nearest the block's east pavement for the views
    const info = await page.evaluate(() => {
      const A = window.__app, list = A.scooters.scooters, rows = [];
      A.showOverlay(false); document.getElementById('hud').hidden = false; const qr = document.getElementById('corner-qr'); if (qr) qr.hidden = true; // (`?shot` starts with the overlay hidden, so showOverlay(false) leaves the HUD hidden)
      for (const sc of list) {
        const p = sc.position, side = { x: Math.sin(sc.yaw) * 1.1, z: Math.cos(sc.yaw) * 1.1 };
        let ok = false;
        for (const s of [1, -1]) { A.player.spawn(p.x + side.x * s, p.z + side.z * s, 0); if (A.player.mountBicycle(sc)) { ok = true; break; } }
        if (A.player.riding) { const r = A.player.riding; A.player.dismountBicycle(); sc.place(new sc.position.constructor(sc.home.x, sc.home.y, sc.home.z), sc.home.yaw, 0); }
        rows.push({ i: sc.index, x: +p.x.toFixed(1), z: +p.z.toFixed(1), ok });
      }
      const far = A.world.bicycles.filter((b) => b.isScooter).length;
      return { n: list.length, inWorld: far, rows, mesh: A.scooters.mesh.count };
    });
    check(info.n >= 8 && info.inWorld === info.n && info.mesh === info.n, 'scooters built, in world.bicycles, one instance each', { n: info.n, mesh: info.mesh });
    const mountable = info.rows.filter((r) => r.ok).length;
    check(mountable >= Math.ceil(info.n * 0.8), `scooters mountable from beside them (${mountable}/${info.n})`, info.rows.filter((r) => !r.ok));
    const pick = info.rows.filter((r) => r.ok).sort((a, b) => Math.hypot(a.x - 20, a.z - 44) - Math.hypot(b.x - 20, b.z - 44))[0];
    // 2. the parked view, with and without the batch (before = no scooters): draw calls at the same camera
    const view = async (hidden) => page.evaluate(async ({ i, hidden }) => {
      const A = window.__app, sc = A.scooters.scooters[i], p = sc.position, f = { x: Math.cos(sc.yaw), z: -Math.sin(sc.yaw) }, n = { x: -f.z, z: f.x };
      A.player.spawn(p.x + n.x * 2.6 + f.x * 1.4, p.z + n.z * 2.6 + f.z * 1.4, 0);
      A.camera.position.set(p.x + n.x * 2.6 + f.x * 1.4, p.y + 1.45, p.z + n.z * 2.6 + f.z * 1.4); A.camera.lookAt(p.x - f.x * 0.4, p.y + 0.45, p.z - f.z * 0.4);
      A.scooters.mesh.visible = !hidden;
      A.testMode.setFull(true); for (let k = 0; k < 4; k++) await new Promise((r) => requestAnimationFrame(() => r()));
      const r = A.renderer.info.render; return { calls: r.calls, triangles: r.triangles, programs: A.renderer.info.programs?.length ?? 0 };
    }, { i: pick.i, hidden });
    const without = await view(true);
    await page.screenshot({ path: path.join(out, 'before', 'pavement.jpg'), type: 'jpeg', quality: 82 });
    const withS = await view(false);
    await page.screenshot({ path: path.join(out, 'scooters-pavement.jpg'), type: 'jpeg', quality: 82 });
    await page.evaluate(() => window.__app.testMode.setFull(false));
    console.log('draw calls without / with the scooter batch:', JSON.stringify(without), JSON.stringify(withS));
    check(withS.calls - without.calls <= 2, 'the scooters cost at most 2 draw calls (main + shadow)', { without, with: withS });
    // 3. the screwdriver from the EL/C cabinet; stand in front of the scooter and aim at the hatch; hold E
    const aim = await page.evaluate(({ i }) => {
      const A = window.__app, sc = A.scooters.scooters[i], p = sc.position, f = { x: Math.cos(sc.yaw), z: -Math.sin(sc.yaw) };
      const home = A.screwdriver.home.pos.toArray();
      A.screwdriver.take();
      A.player.spawn(p.x + f.x * 1.15, p.z + f.z * 1.15, 0);
      const h = sc.hatchWorld(), c = A.camera.position;
      c.set(A.player.pos.x, A.player.pos.y + 1.62, A.player.pos.z);
      const yaw = Math.atan2(-(h.x - c.x), -(h.z - c.z)), pitch = Math.atan2(h.y - c.y, Math.hypot(h.x - c.x, h.z - c.z));
      A.camera.rotation.set(pitch, yaw, 0, 'YXZ');
      return { held: A.heldItem() === A.screwdriver, home };
    }, { i: pick.i });
    check(aim.held, 'the screwdriver (home in the hall EL/C cabinet) is in the hand', aim.home);
    await page.evaluate(() => window.__app.renderer.domElement.requestPointerLock());
    await page.waitForFunction(() => document.pointerLockElement && document.getElementById('overlay').hidden, null, { timeout: 30000 });
    await sleep(600);
    const focus = await page.evaluate(() => window.__app.focus().focused?.kind ?? null);
    check(focus === 'scooterTune', 'aimed at the hatch with the screwdriver: the tune target', focus);
    await page.keyboard.down('KeyE');
    await sleep(4000);
    const f1 = await page.evaluate(({ i }) => window.__app.scooters.tuner.fraction(window.__app.scooters.scooters[i]), { i: pick.i });
    await shot('tuning-progress.jpg', 2);
    await page.keyboard.up('KeyE');
    const f2 = await page.evaluate(({ i }) => window.__app.scooters.tuner.fraction(window.__app.scooters.scooters[i]), { i: pick.i });
    await sleep(1200);
    const f3 = await page.evaluate(({ i }) => window.__app.scooters.tuner.fraction(window.__app.scooters.scooters[i]), { i: pick.i });
    check(f1 > 0.15 && f1 < 0.95, 'holding E advances the progress', f1);
    check(Math.abs(f3 - f2) < 1e-9, 'releasing E pauses it', { f2, f3 });
    await page.keyboard.down('KeyE');
    await page.waitForFunction(({ i }) => window.__app.scooters.scooters[i].tuned, { i: pick.i }, { timeout: 20000 }).catch(() => null);
    await page.keyboard.up('KeyE');
    const tuned = await page.evaluate(({ i }) => ({ tuned: window.__app.scooters.scooters[i].tuned, tunes: window.__app.stats.scooterTunes }), { i: pick.i });
    check(tuned.tuned && tuned.tunes >= 1, 'held to the end: the scooter is tuned and counted', tuned);
    // 4. ride: teleport the mounted scooter onto Sankt Lars väg's carriageway, along the road; untuned (another scooter) first
    const ride = async (i, seconds) => {
      await page.evaluate(async ({ i }) => {
        const A = window.__app, R = await import('/src/roads.js'), { SITE } = await import('/src/config.js'), sc = A.scooters.scooters[i];
        const road = SITE.roads.find((r) => r.name === 'Sankt Lars väg'), S = R.samples(road);
        let k = 1, best = Infinity; for (let j = 1; j < S.length - 1; j++) { const d = Math.hypot(S[j].x - 20, S[j].z - 60); if (d < best) { best = d; k = j; } }
        const a = S[k - 1], b = S[k + 1], len = Math.hypot(b.x - a.x, b.z - a.z), tx = (b.x - a.x) / len, tz = (b.z - a.z) / len;
        if (A.player.riding) { const b = A.player.riding.bike; A.player.dismountBicycle(); b.place(new b.position.constructor(b.home.x, b.home.y, b.home.z), b.home.yaw, 0); } // (the last one back on its pavement spot, out of the road)
        A.player.spawn(sc.position.x + Math.sin(sc.yaw) * 1.1, sc.position.z + Math.cos(sc.yaw) * 1.1, 0);
        if (!A.player.mountBicycle(sc)) A.player.spawn(sc.position.x - Math.sin(sc.yaw) * 1.1, sc.position.z - Math.cos(sc.yaw) * 1.1, 0);
        if (!A.player.riding && !A.player.mountBicycle(sc)) return;
        const r = A.player.riding, x = S[k].x - tx * 30, z = S[k].z - tz * 30; // (30 m back, heading along the road)
        A.player.pos.set(x, A.player.groundAt(x, z, 50), z); r.yaw = Math.atan2(-tz, tx); r.speed = 0; r.airborne = false; A.player.vy = 0;
        A.camera.rotation.y = r.yaw - Math.PI / 2;
      }, { i });
      await page.keyboard.down('KeyW');
      let top = 0;
      for (let t = 0; t < seconds * 10; t++) { await sleep(100); top = Math.max(top, await page.evaluate(() => window.__app.player.riding?.speed ?? 0)); }
      return top;
    };
    const other = info.rows.find((r) => r.ok && r.i !== pick.i).i;
    const topUntuned = await ride(other, 5);
    const speedoU = await page.evaluate(() => document.getElementById('speedo')?.textContent ?? '');
    await page.keyboard.up('KeyW');
    check(topUntuned * 3.6 > 15 && topUntuned * 3.6 <= 20.05, 'untuned: rides up to and never over 20 km/h', `${(topUntuned * 3.6).toFixed(2)} km/h, display "${speedoU}"`);
    const topTuned = await ride(pick.i, 2.5);
    const speedoT = await page.evaluate(() => document.getElementById('speedo')?.textContent ?? '');
    await shot('riding-speed-display.jpg', 2);
    await page.keyboard.up('KeyW');
    check(topTuned * 3.6 > 30, 'tuned: well past 20 km/h within 2.5 s', `${(topTuned * 3.6).toFixed(1)} km/h, display "${speedoT}"`);
    check(/km\/h/.test(speedoT) && /Trimmad/i.test(speedoT), 'the speed display shows km/h and that it is tuned', speedoT);
    // 4b. the CPU cost of one riding step on the open carriageway at 20 and 90 km/h (substeps grow with the distance per frame;
    // indicative only: this host, shared with other test browsers)
    const cost = await page.evaluate(async () => {
      const A = window.__app, p = A.player, r = p.riding, start = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: r.yaw }, out = {};
      for (const [k, v] of [['kmh20', 20 / 3.6], ['kmh90', 25]]) {
        let best = Infinity;
        for (let rep = 0; rep < 3; rep++) {
          p.pos.set(start.x, start.y, start.z); r.yaw = start.yaw; r.airborne = false; p.vy = 0; A.camera.rotation.y = r.yaw - Math.PI / 2;
          let t = 0; for (let i = 0; i < 20; i++) { r.speed = v; const t0 = performance.now(); p.update(1 / 60); t += performance.now() - t0; }
          best = Math.min(best, t / 20);
          await new Promise((res) => setTimeout(res, 50));
        }
        out[k] = +best.toFixed(2);
      }
      p.pos.set(start.x, start.y, start.z); r.yaw = start.yaw; r.speed = 0; A.camera.rotation.y = r.yaw - Math.PI / 2;
      return out;
    });
    console.log('ms per player.update while riding on the open road (best of 3 × 20 frames):', JSON.stringify(cost));
    // 5. a kerb: from the carriageway's middle turn towards the pavement and ride at it
    const hop = await page.evaluate(async () => {
      const A = window.__app, r = A.player.riding, before = A.stats.scooterJumps;
      r.speed = 0; r.yaw += Math.PI / 2; A.camera.rotation.y = r.yaw - Math.PI / 2;
      return { before };
    });
    await page.keyboard.down('KeyW');
    let air = 0;
    for (let t = 0; t < 30; t++) { await sleep(100); air = Math.max(air, await page.evaluate(() => window.__app.player.riding?.clear ?? 0)); }
    await page.keyboard.up('KeyW');
    let jumps = await page.evaluate(() => window.__app.stats.scooterJumps);
    if (!(jumps > hop.before)) { // the other side of the road
      await page.evaluate(() => { const A = window.__app, r = A.player.riding; r.speed = 0; r.yaw += Math.PI; A.camera.rotation.y = r.yaw - Math.PI / 2; });
      await page.keyboard.down('KeyW');
      for (let t = 0; t < 40; t++) { await sleep(100); air = Math.max(air, await page.evaluate(() => window.__app.player.riding?.clear ?? 0)); }
      await page.keyboard.up('KeyW');
      jumps = await page.evaluate(() => window.__app.stats.scooterJumps);
    }
    console.log('kerb run: highest clearance', air.toFixed(3), 'm; jumps', hop.before, '→', jumps);
    check(jumps > hop.before, 'riding up a kerb at speed hops and counts as a scooter jump', { air, jumps });
    // 6. a big flight (the launch set by the test: 1.4 m up, 2.5 m/s up, at speed): slow motion + chase camera, back on landing
    await page.evaluate(async () => {
      const A = window.__app, R = await import('/src/roads.js'), { SITE } = await import('/src/config.js'), road = SITE.roads.find((r) => r.name === 'Sankt Lars väg'), S = R.samples(road);
      let k = 1, best = Infinity; for (let j = 1; j < S.length - 1; j++) { const d = Math.hypot(S[j].x - 20, S[j].z - 60); if (d < best) { best = d; k = j; } }
      const a = S[k - 1], b = S[k + 1], len = Math.hypot(b.x - a.x, b.z - a.z), tx = (b.x - a.x) / len, tz = (b.z - a.z) / len, r = A.player.riding;
      const x = S[k].x - tx * 20, z = S[k].z - tz * 20;
      A.player.pos.set(x, A.player.groundAt(x, z, 50) + 1.4, z); r.yaw = Math.atan2(-tz, tx); A.camera.rotation.y = r.yaw - Math.PI / 2;
      r.speed = 12; r.airborne = true; A.player.vy = 2.5; window.__jump0 = { t: performance.now(), best: A.stats.scooterJumpCm };
    });
    await page.waitForFunction(() => window.__app.scooterFx.slow.k > 0.9 && window.__app.scooterFx.chase, null, { timeout: 15000 }).catch(() => null);
    const mid = await page.evaluate(() => { const A = window.__app, s = A.scooterFx.slow, p = A.player.pos, c = A.camera.position;
      return { on: s.on, k: s.k, scale: s.scale, chase: A.scooterFx.chase, camDist: Math.hypot(c.x - p.x, c.z - p.z), camUp: c.y - p.y, clear: A.player.riding?.clear }; });
    check(mid.on && mid.scale < 0.5 && mid.chase && mid.camDist > 3, 'a big flight: slow motion on, the chase camera behind the rider', mid);
    await shot('slowmo-chase-jump.jpg', 2);
    await page.waitForFunction(() => !window.__app.player.riding?.airborne && window.__app.scooterFx.slow.k === 0, null, { timeout: 30000 }).catch(() => null);
    await sleep(300);
    const after = await page.evaluate(() => { const A = window.__app, p = A.player.pos, c = A.camera.position, s = A.scooterFx.slow;
      return { airborne: !!A.player.riding?.airborne, k: s.k, chase: A.scooterFx.chase, camDist: Math.hypot(c.x - p.x, c.z - p.z), best: A.stats.scooterJumpCm, was: window.__jump0.best, realS: (performance.now() - window.__jump0.t) / 1000 }; });
    check(!after.airborne && after.k === 0 && !after.chase && after.camDist < 0.5, 'landed: real time again, the camera back on the scooter', after);
    check(after.best >= 100, 'the flight counts as the best jump (cm)', after);
    const st = await page.evaluate(() => { const s = window.__app.stats; return { m: s.scooterMetres, jumps: s.scooterJumps, best: s.scooterJumpCm, top: s.scooterTopKmh, tunes: s.scooterTunes }; });
    check(st.m > 10 && st.top > 20 && st.jumps >= 2 && st.tunes >= 1, 'statistics: metres, top speed, jumps, tunings', st);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `FAILED ${failed}` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
