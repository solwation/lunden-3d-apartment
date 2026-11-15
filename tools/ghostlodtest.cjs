// #1966: far players as one draw call. One real client against the local Worker, with N stand-in players added to its ghost list:
//   python3 tools/devserve.py 8196 .      node cloudflare/dev.mjs 8197 testtoken
//   tools/browsertest.sh node tools/ghostlodtest.cjs http://localhost:8196 http://localhost:8197 OUT_DIR
// Measures draw calls and triangles of the same view with the far figure on and off at 10 m (inside: nothing changes), 33.5 m (the
// zone: both levels) and 60 m (beyond: N skinned figures become one instanced mesh); a sitting player keeps the real figure.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8196', worker = 'http://localhost:8197', out = '/tmp/ghostlod'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const N = 24;
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const r = await kit.open(browser, `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=-116,12,215,0`, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: 'Anna' });
    r.page.on('pageerror', (e) => errors.push(e.message));
    await r.page.waitForFunction(() => window.__app?.renderer && window.__ghosts?.connected, null, { timeout: 900000 });
    await r.page.evaluate((N) => {
      const a = __app, G = __ghosts; a.renderer.setAnimationLoop(null); a.showOverlay(false);
      const eye = a.camera.position.clone(), ground = a.player.pos.y;
      a.camera.rotation.set(-0.05, 0, 0, 'YXZ');
      for (let i = 0; i < N; i++) G.add(`f${i}`, `Spelare ${i + 1}`);
      window.T = { a, G, eye,
        /** Everybody in rows `d` m ahead (−z), facing us; player `sit` sits. */
        async place(d, sit = -1) {
          for (let k = 0; k < 6; k++) { // (snapshots a little apart, so the delayed draw has a settled place)
            let i = 0;
            for (const g of [...G.others.values()].filter((g) => String(g.id).startsWith('f'))) { const x = eye.x + (i % 12 - 5.5) * 0.9, z = eye.z - d - Math.floor(i / 12) * 1.2; g.push({ p: [x, a.player.groundAt(x, z, ground + 3), z], r: Math.PI, pose: i === sit ? 1 : 0 }, performance.now()); i++; }
            a.step(0.05); G.update(0.05); await new Promise((r) => setTimeout(r, 120));
          }
        },
        measure(on) { G.far.enabled = on; G.update(0.016); a.frame(0.016); const i = a.renderer.info.render; return { calls: i.calls, triangles: i.triangles, far: G.far.mesh.visible ? G.far.mesh.count : 0, real: [...G.others.values()].filter((g) => g.avatar.object.visible && g.root.visible).length }; } };
    }, N);
    const m = {};
    for (const [key, d] of [['near', 10], ['zone', 33.5], ['far', 60]]) {
      await r.page.evaluate((d) => T.place(d), d);
      m[key] = { off: await r.page.evaluate(() => T.measure(false)), on: await r.page.evaluate(() => T.measure(true)) };
      await kit.shot(r.page, `${out}/${key}-${d}m.png`);
      if (key === 'far') { await r.page.evaluate(() => T.measure(false)); await kit.shot(r.page, `${out}/far-60m-real-figures.png`); await r.page.evaluate(() => T.measure(true)); }
    }
    const tri = await r.page.evaluate(() => T.G.far.triangles);
    check(m.near.on.calls === m.near.off.calls && m.near.on.triangles === m.near.off.triangles && m.near.on.far === 0 && m.near.on.real === N, `at 10 m nothing changes: ${N} real figures, no far figure`, m.near);
    check(m.zone.on.far === N && m.zone.on.real === N && m.zone.on.calls === m.zone.off.calls + 1, 'in the zone both levels draw (one more call, the dither splits the pixels)', m.zone);
    check(m.far.on.far === N && m.far.on.real === 0 && m.far.off.calls - m.far.on.calls === N - 1 && m.far.off.triangles - m.far.on.triangles > N * 3500, `at 60 m ${N} skinned figures are one instanced mesh of ${tri} triangles each`, { ...m.far, saved: { calls: m.far.off.calls - m.far.on.calls, triangles: m.far.off.triangles - m.far.on.triangles } });
    await r.page.evaluate(() => T.place(60, 3));
    const sit = await r.page.evaluate(() => T.measure(true));
    check(sit.far === N - 1 && sit.real === 1, 'a sitting player keeps the real figure at any distance', sit);
    check(!errors.length, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
