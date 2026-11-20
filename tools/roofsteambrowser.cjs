// #2204: one actual-app run, matched effect-off/effect-on roof views, warm/range/quality and phone budget.
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8424', out = process.argv[3] || 'docs/verification/2204';
fs.mkdirSync(path.join(out, 'before'), { recursive: true });
(async () => {
  const browser = await kit.launch(), errors = [], result = { environment: 'Chromium SwiftShader, 1280x720 DPR1, test lazy + full draw, quality 3', views: [] };
  try {
    const { page, ctx } = await kit.open(browser, `${base}/?shot&freeze&time=12&month=11&day=15&weather=clear&temp=-8&quality=3`, { lazy: true, viewport: { width: 1280, height: 720 }, timeout: 180000 });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /Shader Error|VALIDATE_STATUS|roofsteam/i.test(m.text())) errors.push(m.text()); });
    await kit.skipNameDialog(page);
    for (const view of ['vents', 'campus']) {
      const captures = await page.evaluate(view => {
        const a = __app, r = a.roofSteam, p = view === 'vents' ? r.sources[0] : (() => { const g = a.scene.getObjectByName('east-backdrop'), q = g?.userData.roofSteam?.[0]; return q ? { x: q[0], y: q[1], z: q[2] } : r.sources.at(-1); })();
        a.testMode.setFull(true); a.player.spawn(p.x + 12, p.z + 18, 0);
        a.camera.position.set(p.x + 8, p.y + 3, p.z + 12); a.camera.lookAt(p.x + 2, p.y + 2.4, p.z);
        a.weather.temp = -8; a.weather.wind = { x: 5, z: -1 }; r.setLevel(3); r.time = 3.5; r.update(.1);
        const render = () => { a.renderer.info.reset(); a.renderer.render(a.scene, a.camera); return { url: a.renderer.domElement.toDataURL('image/png'), calls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles, points: a.renderer.info.render.points, programs: a.renderer.info.programs.length }; };
        // Warm camera-dependent batches/shadow uploads before comparing the same stable view.
        for (let i = 0; i < 3; i++) a.renderer.render(a.scene, a.camera);
        a.renderer.shadowMap.autoUpdate = false; a.renderer.shadowMap.needsUpdate = false;
        const enabled = r.object.visible; r.object.visible = false; const before = render(); r.object.visible = enabled; const after = render();
        return { view, outlet: { x: p.x, y: p.y, z: p.z }, allSources: r.sources.length, selected: r.selected.length, count: r.count, visible: r.object.visible, before, after };
      }, view);
      console.log(view, JSON.stringify({ count: captures.count, before: { ...captures.before, url: undefined }, after: { ...captures.after, url: undefined } }));
      assert(captures.visible && captures.count > 0); assert.equal(captures.after.calls - captures.before.calls, 1);
      assert.equal(captures.after.triangles, captures.before.triangles);
      for (const [key, dest] of [['before', `before/${view}.png`], ['after', `${view}.png`]]) {
        fs.writeFileSync(path.join(out, dest), Buffer.from(captures[key].url.split(',')[1], 'base64')); delete captures[key].url;
      }
      result.views.push(captures);
    }
    result.gates = await page.evaluate(async () => {
      const a = __app, r = a.roofSteam, p = a.camera.position.clone();
      a.weather.temp = 8; r.update(.1); const warm = !r.object.visible;
      a.weather.temp = -8; a.camera.position.set(2000, 2000, 2000); r.age = 1; r.update(.1); const far = !r.object.visible;
      a.camera.position.copy(p); r.setLevel(0); r.update(.1); const low = !r.object.visible;
      r.setLevel(3); r.update(.1); const restored = r.object.visible;
      const { RoofSteam } = await import('./src/roofsteam.js');
      const phone = new RoofSteam({ scene: a.scene, camera: a.camera, weather: a.weather, day: a.day, phone: true }); phone.update(.1);
      const phoneState = { sources: phone.selected.length, count: phone.count, max: phone.maxSources * phone.perSource }; phone.dispose();
      return { warm, far, low, restored, phone: phoneState };
    });
    for (const k of ['warm', 'far', 'low', 'restored']) assert(result.gates[k], k);
    assert(result.gates.phone.count <= 72 && result.gates.phone.count > 0);
    assert.equal(errors.length, 0, errors.join('\n')); result.errors = errors;
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2)); await ctx.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
