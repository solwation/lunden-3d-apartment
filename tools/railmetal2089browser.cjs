// #2089: the actual outdoor railings (Hus L loftgång/terraces, ABC loggias, the garage-box railings, the bus stop)
// before/after, day and dusk, walk view. node tools/railmetal2089browser.cjs [base] [out] [mode]; THREE_DIR = a local
// three@0.170.0 package (CDN routed to it); VIEWS = {"name":[x,z,yawDeg,pitchDeg,feetY?]}. "before" serves BASE_REV's touched
// modules (railmetal.js is then simply unused). mode "probe" prints the railing meshes and their bounds only.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8289', out = 'docs/verification/2089', mode = 'shots'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'origin/main', touched = ['config.js', 'exterior.js', 'surroundings.js', 'busstop.js'];
async function route(ctx, phase, log) {
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    const m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
    if (m) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
    if (!u.startsWith(base + '/')) { log.push(u); return r.abort(); }
    const f = new URL(u).pathname.match(/^\/src\/([a-z0-9]+\.js)$/);
    if (phase === 'before' && f && touched.includes(f[1])) return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/${f[1]}`]) });
    return r.continue();
  });
}
// The railing meshes by material (before: unnamed meshes are found by their old material values), with geometry sizes.
const inspect = () => {
  const s = window.__app.scene, rails = [], B = s.children[0].position.constructor;
  let meshes = 0, railMetal = 0;
  s.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) meshes++;
    if (!o.isMesh) return; const m = o.material; if (Array.isArray(m)) return;
    if (m.userData?.railMetal) railMetal++;
    const old = m.isMeshStandardMaterial && ((m.metalness === 0.3 && m.roughness === 0.5 && [0x8fa396, 0xb9bdbd].includes(m.color.getHex())) || (m.metalness === 0.2 && m.roughness === 0.45) || (m.map && m.alphaTest === 0.5 && m.roughness === 0.6 && m.side === 2));
    if (m.userData?.railMetal || old || o.name === 'bus-stop-furniture') {
      o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      rails.push({ name: o.name || '?', parent: o.parent?.name, vertices: o.geometry.attributes.position.count, index: o.geometry.index?.count ?? null, attrs: Object.keys(o.geometry.attributes).sort().join(), color: m.color.getHex().toString(16), rough: m.roughness, metal: m.metalness, patched: !!m.userData?.railMetal, min: b.min.toArray().map((v) => +v.toFixed(1)), max: b.max.toArray().map((v) => +v.toFixed(1)) });
    }
  });
  return { meshes, railMetal, rails };
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), phases: {}, errors: [], external: [] };
  try {
    for (const phase of mode === 'probe' || mode === 'after' ? ['after'] : ['before', 'after']) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => report.errors.push(phase + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) report.errors.push(phase + ': ' + m.text()); });
      const t0 = Date.now();
      await page.goto(`${base}/?shot&test&month=6&day=15&time=12&freeze&weather=clear&at=3,-14,180,0`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('terraceRails') && window.__app.scene.getObjectByName('bus-stop-furniture'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      const info = await page.evaluate(inspect);
      info.loadMs = Date.now() - t0; report.phases[phase] = info;
      if (mode === 'probe') { console.log(JSON.stringify(info, null, 1)); await ctx.close(); break; }
      const views = JSON.parse(process.env.VIEWS);
      for (const [name, [x, z, yaw, pitch, feet = null]] of Object.entries(views)) for (const [when, hour] of [['dag', 12], ['skymning', 22.2]]) {
        await page.evaluate(([x, z, yaw, pitch, feet, hour]) => { const a = window.__app, p = a.player; p.spawn(x, z, yaw * Math.PI / 180); if (feet !== null) { p.pos.y = feet; p.eyeY = feet + 1.62; a.camera.position.y = p.eyeY; } a.camera.rotation.x = pitch * Math.PI / 180; a.day.hour = hour; a.day.paused = true; }, [x, z, yaw, pitch, feet, hour]);
        await page.waitForTimeout(1500);
        await kit.shot(page, path.join(out, `${name}-${when}-${phase}.png`), { frames: 4 });
        const calls = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, programs: r.info.programs.length }; });
        (info.views ??= {})[`${name}-${when}`] = calls;
      }
      await ctx.close();
    }
    if (mode !== 'probe') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ errors: report.errors, external: report.external.slice(0, 5) }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
