// #1969: the east campus' detailed batches fade into their light level by distance (src/lod.js BatchLod). One client, no Worker:
//   python3 tools/devserve.py 8196 .
//   tools/browsertest.sh node tools/campuslodtest.cjs http://localhost:8196 OUT_DIR
// Measures draw calls and triangles of the same views with the far level on and off: from the courtyard looking at the campus
// (every batch beyond the zone: light), from among the campus buildings (inside: full detail, nothing changes), and in between.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8196', out = '/tmp/campuslod'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const r = await kit.open(browser, `${game}/?time=12&month=7&weather=clear&freeze&shot&test&at=2.5,0,5,0`, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: 'Anna' });
    r.page.on('pageerror', (e) => errors.push(e.message));
    await r.page.waitForFunction(() => window.__app?.renderer, null, { timeout: 900000 });
    await r.page.evaluate(() => {
      const a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false);
      const lods = new Set(); a.scene.traverse((o) => { if (o.userData.batchLod) lods.add(o.userData.batchLod); });
      const tris = (m) => Math.round((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3);
      window.T = { a, lods: [...lods],
        view(x, z, tx, ty, tz, lift = 0) { a.player.spawn(x, z, 0); a.step(0.05); a.camera.position.y += lift; const c = a.camera.position, dx = tx - c.x, dz = tz - c.z; a.camera.rotation.set(Math.atan2(ty - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
        measure(on) { for (const l of T.lods) l.enabled = on; a.frame(0.016); a.frame(0.016); const i = a.renderer.info.render;
          return { calls: i.calls, triangles: i.triangles, levels: T.lods.map((l) => `${l.near.name}:${Math.round(l.d)}m:${l.near.visible ? 'N' : ''}${l.far.visible ? 'F' : ''}`) }; },
        snap(on) { for (const l of T.lods) l.enabled = on; a.frame(0.016); a.frame(0.016); return a.renderer.domElement.toDataURL('image/png'); }, // (the very same camera for both levels)
        sizes() { return T.lods.map((l) => ({ name: l.near.name, near: tris(l.near), far: tris(l.far), shadow: !!l.near.customDepthMaterial && !!l.far.customDepthMaterial })); } };
    });
    const sizes = await r.page.evaluate(() => T.sizes());
    const saved = sizes.reduce((n, s) => n + s.near - s.far, 0);
    check(sizes.length === 3 && sizes.every((s) => s.far < s.near * 0.75 && s.far > s.near * 0.2 && s.shadow), `three campus batches with a light level (${saved} triangles lighter in all), shadows follow`, sizes);
    const m = {};
    for (const [key, v] of Object.entries({ yard: [14, 22, 60, 8, -75, 14], between: [36, -8, 80, 6, -80, 6], campus: [40, -47, 90, 6, -95, 3] })) {
      await r.page.evaluate((v) => T.view(...v), v);
      m[key] = { off: await r.page.evaluate(() => T.measure(false)), on: await r.page.evaluate(() => T.measure(true)) };
      for (const [name, on] of [['light', true], ['full-detail', false]]) fs.writeFileSync(`${out}/${key}-${name}.png`, Buffer.from((await r.page.evaluate((on) => T.snap(on), on)).split(',')[1], 'base64'));
    }
    check(m.yard.on.calls === m.yard.off.calls && m.yard.off.triangles - m.yard.on.triangles > 5000 && m.yard.on.levels.every((l) => l.endsWith(':F')), 'from the courtyard every batch is light: the same draw calls, fewer triangles', { ...m.yard, saved: m.yard.off.triangles - m.yard.on.triangles });
    check(m.campus.on.levels.filter((l) => l.endsWith(':N')).length >= 2 && !m.campus.on.levels.some((l) => l.endsWith(':F')) && m.campus.on.triangles <= m.campus.off.triangles + saved, 'among the campus buildings the batches one stands in or beside keep their full detail (none is light only)', m.campus);
    check(m.between.on.triangles <= m.between.off.triangles + saved, 'in between: never more than both levels of a batch at once', m.between);
    check(!errors.length, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
