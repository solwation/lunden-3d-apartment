// The plants and stones of Höje å (#1956): one headless page (solo). Start the site first:
//   python3 tools/devserve.py 8137 .
//   [SHOTS=/dir] tools/browsertest.sh node tools/riverfloratest.cjs http://localhost:8137
// Checks in the real game: stones, weed clumps, lily leaves and flowers exist along the river; from the bank only the lilies (and in
// summer their flowers) are drawn, at most two draw calls; under the surface the stones and the weed too, at most four; every stone
// sits on the drawn bed, every weed ends under the surface, every leaf lies on the water over open water; none in winter (leaves),
// nothing far from the river; the weed's sway clock runs. Screenshots: the lilies from the bank, the bed seen by a diver.
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8137', shots = process.env.SHOTS || '/tmp';
let failed = 0;
const T0 = Date.now();
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} +${Math.round((Date.now() - T0) / 1000)}s ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
setTimeout(() => { console.log('FAIL total timeout\nSOME FAILED'); process.exit(2); }, 30 * 60000).unref();

(async () => {
  const browser = await kit.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { sessionStorage.setItem('lunden.nameSkipped', '1'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${game}/?shot&cloud=&quality=0&month=7&time=13&freeze&weather=clear&mess=0&nofish&at=-150,206,0,-20`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.riverFlora, null, { timeout: 1500000 });
    await page.evaluate(() => window.__app.renderer.setAnimationLoop(null));
    const shot = async (name) => { await page.evaluate(() => { const app = window.__app; app.camera.updateMatrixWorld(); app.detail()?.update(app.camera); app.renderer.render(app.scene, app.camera); }); await page.screenshot({ path: `${shots}/${name}.png`, timeout: 300000 }); };
    const lay = await page.evaluate(async () => {
      const app = window.__app, f = app.riverFlora, fw = await import('/src/farwalk.js'), rb = await import('/src/riverbridge.js'), THREE = await import('three');
      window.__ft = { fw, rb, THREE, step: (dt) => { if (!app.fall.active) app.player.update(dt); app.frame(dt); } };
      for (let i = 0; i < 3; i++) app.frame(0.05);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), out = { total: f.state().total, bad: { stones: 0, weeds: 0, lilies: 0 }, worst: {} };
      for (const e of f.items.stones) { e.m.decompose(p, q, s); const bed = fw.swimBedY(p.x, p.z), d = Math.abs(p.y - bed); if (!fw.swimWater(p.x, p.z) || d > s.y + 0.02) out.bad.stones++; out.worst.stone = Math.max(out.worst.stone ?? 0, d - s.y); }
      for (const e of f.items.weeds) { e.m.decompose(p, q, s); const top = p.y + s.y, water = rb.waterYAt(p.x, p.z); if (!fw.swimWater(p.x, p.z) || top > water - 0.05 || Math.abs(p.y - fw.swimBedY(p.x, p.z)) > 0.06) out.bad.weeds++; }
      for (const e of f.items.lilies) { e.m.decompose(p, q, s); const water = rb.waterYAt(p.x, p.z); if (!fw.swimWater(p.x, p.z) || Math.abs(p.y - water) > 0.05) out.bad.lilies++; }
      // the lily cluster nearest the start, to look at from the bank
      const first = f.items.lilies.slice().sort((a, b) => Math.abs(a.s - f.near.s) - Math.abs(b.s - f.near.s))[0]; first.m.decompose(p, q, s); out.lily = [p.x, p.y, p.z];
      return out;
    });
    check(lay.total.stones > 150 && lay.total.weeds > 150 && lay.total.lilies > 30 && lay.total.flowers > 5, 'stones, weed, lily leaves and flowers along the river', JSON.stringify(lay.total));
    check(lay.bad.stones === 0, 'every stone sits on the drawn bed, in open water', JSON.stringify(lay.worst));
    check(lay.bad.weeds === 0, 'every weed is rooted in the bed and ends under the surface');
    check(lay.bad.lilies === 0, 'every lily leaf lies on the water');
    // from the bank beside the nearest lilies
    const bank = await page.evaluate(([x, y, z]) => {
      const app = window.__app, T = window.__ft, f = app.riverFlora, p = app.player, r = T.rb.riverAt(x, z);
      let spot = null; const side = ((x - r.x) * r.nx + (z - r.z) * r.nz) >= 0 ? 1 : -1;
      for (let d = 1; d < 14 && !spot; d += 0.2) { const px = r.x + r.nx * side * d, pz = r.z + r.nz * side * d, gy = p.groundAt(px, pz, 0); if (Number.isFinite(gy) && gy > y + 0.25 && !T.fw.inWater(px, pz, gy)) spot = [px, gy, pz]; }
      p.spawn(spot[0], spot[2], 0); p.pos.y = spot[1];
      for (let i = 0; i < 3; i++) app.frame(0.05);
      const c = app.camera, e = c.position; c.rotation.set(Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)), Math.atan2(-(x - e.x), -(z - e.z)), 0, 'YXZ');
      app.frame(0.05);
      const summer = f.state();
      f.update(0, c.position, false, false, 1); const winter = f.state();
      f.update(0, c.position, false, false, 5); const may = f.state();
      f.update(0, { x: 0, y: 0, z: 0 }, false, false, 7); const far = f.state();
      f.update(0, c.position, true, false, 7); const hidden = f.state();
      app.frame(0.05);
      return { summer, winter, may, far, hidden };
    }, lay.lily);
    check(bank.summer.drawn.lilies > 0 && bank.summer.drawn.flowers > 0 && bank.summer.drawn.stones === 0 && bank.summer.drawn.weeds === 0 && bank.summer.calls === 2, 'from the bank in July: lily leaves and flowers only, two draw calls', JSON.stringify(bank.summer));
    check(bank.winter.calls === 0 && bank.may.drawn.lilies > 0 && bank.may.drawn.flowers === 0, 'no leaves in January; leaves without flowers in May');
    check(bank.far.calls === 0 && bank.hidden.calls === 0, 'nothing is drawn far from the river or while hidden');
    await shot('riverflora-lilies');
    // under the surface, in a planted stretch
    const dive = await page.evaluate(() => {
      const app = window.__app, T = window.__ft, f = app.riverFlora, p = app.player, dt = 1 / 30, v = new T.THREE.Vector3(), q = new T.THREE.Quaternion(), s = new T.THREE.Vector3();
      const mid = f.items.weeds.filter((e) => Math.abs(e.s - f.near.s) < 60), w = mid[Math.floor(mid.length / 2)]; w.m.decompose(v, q, s);
      const r = T.rb.riverAt(v.x, v.z), x = r.x - r.nz * 4, z = r.z + r.nx * 4; // on the centre line, 4 m upstream of a clump
      p.pos.set(x, T.fw.swimBedY(x, z), z);
      let t = 0; while (!p.swim && t < 3) { T.step(dt); t += dt; }
      app.camera.rotation.set(-0.25, Math.atan2(-r.nz, r.nx), 0, 'YXZ');
      p.crouch = true; for (t = 0; t < 2.5; t += dt) T.step(dt);
      const t0 = f.uniforms.uFloraT.value; T.step(dt);
      return { swim: !!p.swim, diving: p.diving, state: f.state(), clock: f.uniforms.uFloraT.value - t0, depth: T.rb.waterYAt(p.pos.x, p.pos.z) - app.camera.position.y };
    });
    check(dive.swim && dive.diving, 'diving among the plants (nothing stops the swimmer)', JSON.stringify(dive.depth));
    check(dive.state.drawn.stones > 0 && dive.state.drawn.weeds > 0 && dive.state.calls <= 4, 'under the surface: stones and weed are drawn too, at most four draw calls', JSON.stringify(dive.state));
    check(dive.clock > 0, 'the weed sways (its clock runs)');
    await shot('riverflora-under');
    check(errors.length === 0, 'no page errors', errors.join(' | '));
  } catch (e) { console.log(`FAIL ${e.stack || e}`); failed++; } finally { await browser.close(); }
  console.log(failed ? 'SOME FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
