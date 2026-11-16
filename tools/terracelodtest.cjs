// #1968: the roof terraces' decor and the pergolas' string lights by distance (the dithered fade of src/lod.js).
//   python3 tools/devserve.py 8696 .
//   tools/browsertest.sh node tools/terracelodtest.cjs http://localhost:8696 OUT_DIR [lowmem]
// One page, desktop profile (`lowmem`: the phone profile, three merged terrace meshes and its own distances). Draw calls and triangles of the same rendered frame with the fade on and off (the terraces'
// `gate.setLod`, the bulbs' `BatchLod.enabled`) at chosen distances, from raised viewpoints with the whole terrace row /
// the Borggården's pergola in view, and from two walking viewpoints; pictures by day and (the bulbs) by night into OUT_DIR.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8696', out = '/tmp/terracelod', profile = ''] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    // (not the small `&test` look: this measures drawing, shadows included)
    const r = await kit.open(browser, `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=&at=-16,33,0,15${profile ? `&${profile}` : ''}`, { test: false, viewport: kit.FULL, init: () => { localStorage.setItem('lunden.name', 'Anna'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
    r.page.on('pageerror', (e) => errors.push(e.message));
    await r.page.waitForFunction(() => window.__app.warm.done, null, { timeout: 1500000 });
    const cfg = await r.page.evaluate(async () => {
      const C = await import('./src/config.js'), { lowMemory } = await import('./src/lowmemory.js'), a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false);
      const gate = a.scene.getObjectByName('terrace-decor'), near = [], far = [];
      a.scene.traverse((o) => { if (o.name === 'courtyard-pergola-bulbs') near.push(o); if (o.name === 'courtyard-pergola-bulbs far') far.push(o); });
      const tri = (o) => (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      const B = C.COURTYARD.bulbLod, b = gate.box, TL = lowMemory ? C.TERRACE_DECOR.lod.phone : C.TERRACE_DECOR.lod;
      near.sort((p, q) => p.id - q.id); far.sort((p, q) => p.id - q.id);
      const n0 = C.COURTYARD.pergolas.length && near[0].userData.bulbs;
      window.T = { a, gate, near, far,
        /** Stand at (x, feet y, z) looking at (tx, ty, tz). */
        look(x, y, z, tx, ty, tz) {
          const p = a.player, e = y + 1.62, yaw = Math.atan2(-(tx - x), -(tz - z)), pitch = Math.atan2(ty - e, Math.hypot(tx - x, tz - z));
          T.place = () => { p.spawn(x, z, yaw); p.pos.y = y; p.eyeY = e; a.camera.position.set(x, e, z); a.camera.rotation.set(pitch, yaw, 0, 'YXZ'); };
          T.place();
        },
        terrace(on) { gate.setLod(on); }, pergola(on) { for (const m of near) if (m.userData.batchLod) m.userData.batchLod.enabled = on; },
        measure() {
          T.place(); a.frame(0.016); T.place(); a.frame(0.016); const i = a.renderer.info.render, shown = (o) => o.visible && o.layers.test(a.camera.layers);
          const kinds = { solid: 0, soft: 0, bulbs: 0 }; for (const m of gate.meshes) if (shown(m)) kinds[m.userData.lodKind]++;
          return { calls: i.calls, triangles: i.triangles, ...kinds, sphere: shown(near[0]) ? n0 : 0, octa: far[0] && shown(far[0]) ? n0 : 0 }; // (the Borggården's pergola: bulbs drawn per level)
        } };
      const count = { solid: 0, soft: 0, bulbs: 0 }, tris = { solid: 0, soft: 0, bulbs: 0 };
      for (const m of gate.meshes) { count[m.userData.lodKind]++; tris[m.userData.lodKind] += tri(m); }
      return { lowMemory, lod: TL, far: C.TERRACE_DECOR.far, B, row: { x: (b.xw + b.xe) / 2, y: b.deck, z: b.zs }, count, tris, bulbs: [n0], bulbTri: [tri(near[0]) / n0, far[0] ? tri(far[0]) / n0 : 0], box: near[0].userData.batchLod?.box ?? null, pergolaLod: !!far.length };
    });
    console.log('INFO', JSON.stringify(cfg));
    const m = {}, both = async (key, set) => {
      await r.page.evaluate((k) => T[k](false), set); const off = await r.page.evaluate(() => T.measure());
      await r.page.evaluate((k) => T[k](true), set); const on = await r.page.evaluate(() => T.measure());
      m[key] = { off, on, saved: { calls: off.calls - on.calls, triangles: off.triangles - on.triangles } };
      console.log('MEASURE', key, JSON.stringify(m[key]));
    };
    const shot = async (name) => { await r.page.evaluate(() => T.measure()); await r.page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 }); };

    // the terraces: a raised viewpoint south of the row's middle, d m from the row's nearest point (the eye 6 m above the deck)
    const L = cfg.lod, mid = (a) => (a[0] + a[1]) / 2, R = cfg.row;
    const at = (d) => r.page.evaluate(([d, R]) => T.look(R.x, R.y + 6 - 1.62, R.z + Math.sqrt(d * d - 36), R.x, R.y + 1, R.z + 0.9), [d, R]);
    for (const [key, d] of [['terrace-near', 20], ['terrace-bulbs-zone', mid(L.bulbs)], ['terrace-mid', mid([L.bulbs[1], L.soft[0]])], ['terrace-soft-zone', mid(L.soft)], ['terrace-far', mid([L.soft[1], L.solid[0]])], ['terrace-solid-zone', mid(L.solid)], ['terrace-gone', mid([L.solid[1], cfg.far])], ['terrace-beyond', cfg.far + 10]]) {
      await at(d); await both(key, 'terrace'); await shot(`${key}-${Math.round(d)}m`);
      if (/zone|far|gone/.test(key)) { await r.page.evaluate(() => { T.terrace(false); T.measure(); }); await shot(`${key}-${Math.round(d)}m-before`); await r.page.evaluate(() => T.terrace(true)); }
    }
    const C = cfg.count, X = cfg.tris, t = m;
    check(t['terrace-near'].saved.calls === 0 && t['terrace-near'].saved.triangles === 0 && t['terrace-near'].on.bulbs === C.bulbs, 'at 20 m the terraces draw as before (no call, no triangle more or less)', t['terrace-near']);
    check(t['terrace-bulbs-zone'].saved.calls === 0 && t['terrace-bulbs-zone'].on.bulbs === C.bulbs, 'in the bulbs\' zone they still draw (the dither thins them)', t['terrace-bulbs-zone'].saved);
    check(t['terrace-mid'].on.bulbs === 0 && t['terrace-mid'].on.soft === C.soft && t['terrace-mid'].saved.calls === C.bulbs && t['terrace-mid'].saved.triangles === X.bulbs, `beyond ${L.bulbs[1]} m the ${C.bulbs} bulb meshes are not drawn`, t['terrace-mid']);
    check(t['terrace-soft-zone'].on.soft === C.soft && t['terrace-soft-zone'].saved.calls === C.bulbs, 'in the soft things\' zone they still draw', t['terrace-soft-zone'].saved);
    check(t['terrace-far'].on.soft === 0 && t['terrace-far'].on.solid === C.solid && t['terrace-far'].saved.calls === C.bulbs + C.soft && t['terrace-far'].saved.triangles === X.bulbs + X.soft, `beyond ${L.soft[1]} m only the ${C.solid} solid meshes draw`, t['terrace-far']);
    check(t['terrace-solid-zone'].on.solid === C.solid && t['terrace-solid-zone'].saved.calls === C.bulbs + C.soft, 'in the solid things\' zone they still draw', t['terrace-solid-zone'].saved);
    check(t['terrace-gone'].on.solid === 0 && t['terrace-gone'].off.solid === C.solid && t['terrace-gone'].saved.calls === C.bulbs + C.soft + C.solid && t['terrace-gone'].saved.triangles === X.bulbs + X.soft + X.solid, `beyond ${L.solid[1]} m no terrace decor is drawn (it was, up to ${cfg.far} m)`, t['terrace-gone']);
    check(t['terrace-beyond'].on.solid === 0 && t['terrace-beyond'].off.solid === 0 && t['terrace-beyond'].saved.calls === 0, `nothing beyond ${cfg.far} m, as before`, t['terrace-beyond']);

    // the Borggården's pergola (desktop only): from the south, d m from its box (the shader's distance), 0.4 d above its top
    if (cfg.pergolaLod) {
      const bx = cfg.box, B = cfg.B, pc = { x: (bx.min.x + bx.max.x) / 2, y: bx.max.y, z: bx.max.z };
      const by = (d) => r.page.evaluate(([d, c, mid]) => T.look(c.x, c.y + 0.4 * d - 1.62, c.z + d * Math.sqrt(1 - 0.16), c.x, c.y - 0.3, mid), [d, pc, (bx.min.z + bx.max.z) / 2]);
      const series = [['pergola-near', 8], ['pergola-zone', mid([B.start, B.end])], ['pergola-far', 40]];
      for (const [key, d] of series) { await by(d); await both(key, 'pergola'); await shot(`${key}-${d}m-day`); }
      const pn = m['pergola-near'], pz = m['pergola-zone'], pf = m['pergola-far'], n0 = cfg.bulbs[0], [st, ot] = cfg.bulbTri;
      check(pn.saved.calls === 0 && pn.saved.triangles === 0 && pn.on.octa === 0 && pn.on.sphere === n0, `at 8 m the pergola's bulbs draw as before`, pn);
      check(pz.on.sphere === n0 && pz.on.octa === n0 && pz.saved.calls === -1, 'in the zone both levels draw (one call more, the dither splits the pixels)', pz);
      check(pf.on.sphere === 0 && pf.on.octa === n0 && pf.saved.calls === 0 && pf.saved.triangles >= n0 * (st - ot), `at 40 m its ${n0} bulbs are octahedra: the same calls, ${n0 * (st - ot)} triangles fewer`, pf);
      await r.page.evaluate(() => { T.a.day.hour = 22; T.a.day.update(0); });
      for (const [key, d] of series) {
        await by(d); await r.page.evaluate(() => { T.pergola(true); T.measure(); }); await shot(`${key}-${d}m-night`);
        if (key !== 'pergola-near') { await r.page.evaluate(() => { T.pergola(false); T.measure(); }); await shot(`${key}-${d}m-night-before`); await r.page.evaluate(() => T.pergola(true)); }
      }
      await r.page.evaluate(() => { T.a.day.hour = 12; T.a.day.update(0); });
    } else check(cfg.bulbTri[1] === 0, 'phone profile: the pergolas keep one level (no far mesh)', cfg.bulbTri);

    // two walking viewpoints: the courtyard beside the pergola (everything near: nothing may change) and the lawn south of the yard
    const walk = async (key, x, z, feet) => {
      await r.page.evaluate(([x, z, feet, R]) => { const p = T.a.player; p.spawn(x, z, 0); T.look(x, feet ?? p.pos.y, z, R.x, R.y + 1, R.z); }, [x, z, feet, R]);
      await r.page.evaluate(() => { T.terrace(false); T.pergola(false); }); const off = await r.page.evaluate(() => T.measure());
      await r.page.evaluate(() => { T.terrace(true); T.pergola(true); }); const on = await r.page.evaluate(() => T.measure());
      m[key] = { off, on, saved: { calls: off.calls - on.calls, triangles: off.triangles - on.triangles } };
      console.log('MEASURE', key, JSON.stringify(m[key]));
      await shot(key);
    };
    await walk('walk-courtyard', -24, 31, 0);
    await walk('walk-south', -12, 110);
    const wc = m['walk-courtyard'];
    check(wc.saved.calls === 0 && wc.saved.triangles === 0 && wc.on.bulbs === C.bulbs && wc.on.octa === 0, 'walking in the courtyard: no call more, no triangle more', wc);
    check(m['walk-south'].saved.calls >= 0 && m['walk-south'].saved.triangles > 0, 'walking south of the yard: fewer triangles, no call more', m['walk-south']);
    check(!errors.length, 'no page errors', errors);
    fs.writeFileSync(`${out}/measure.json`, JSON.stringify({ cfg, m }, null, 1));
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL crashed', e); process.exit(1); });
