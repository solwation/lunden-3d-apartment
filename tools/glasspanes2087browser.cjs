// #2087: the actual façade glass (Hus L neighbours, ABC, the school, far backdrops) before/after, day and night, walk view.
// node tools/glasspanes2087browser.cjs [base] [out] [mode]; THREE_DIR = a local three@0.170.0 package (CDN routed to it).
// "before" serves origin/main's versions of the touched modules. mode "probe" only prints the view positions.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8287', out = 'docs/verification/2087', mode = 'shots'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'origin/main', touched = ['config.js', 'exterior.js', 'neighborglass.js', 'sitebackdrop.js', 'southbackdrop.js', 'surroundings.js'];
const types = { js: 'text/javascript' };
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
      await page.waitForFunction(() => window.__app?.renderer && window.__app.scene.getObjectByName('siteNeighborGlass') && window.__app.scene.getObjectByName('east-schoolGlass') && window.__app.scene.getObjectByName('south-glass'), null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(1000); await kit.skipNameDialog(page);
      const info = await page.evaluate(() => {
        const s = window.__app.scene, glass = {}, missing = [];
        s.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m.vertexColors && !o.geometry.attributes.color) missing.push(o.name || o.parent?.name);
          if (/glass/i.test(o.name) && /neighbor|Neighbor|backdrop/.test(`${o.name} ${o.parent?.name}`)) glass[o.parent.name + '/' + o.name] = { vertices: o.geometry.attributes.position.count, index: o.geometry.index?.count ?? null, color: !!o.geometry.attributes.color, vertexColors: [].concat(o.material).map((m) => m.vertexColors), type: [].concat(o.material)[0].type, envMap: !!o.material.envMap }; });
        const ex = s.getObjectByName('neighborGlass').parent.userData.neighborOpenings, site = s.getObjectByName('siteNeighborGlass').parent.userData.siteNeighborOpenings;
        const sb = new (s.getObjectByName('east-schoolGlass').geometry.boundingBox.constructor)().setFromObject(s.getObjectByName('east-schoolGlass'));
        let meshes = 0; s.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes++; });
        return { glass, missing, meshes, exPanes: ex.reduce((n, r) => n + (r.panes?.length ?? 0), 0), sitePanes: site.reduce((n, r) => n + (r.panes?.length ?? 0), 0), siteSample: site.slice(0, 3).map((r) => ({ n: r.n, p: r.panes[0] })), school: [sb.min.toArray(), sb.max.toArray()] };
      });
      info.loadMs = Date.now() - t0; report.phases[phase] = info;
      if (mode === 'probe') { console.log(JSON.stringify(info, null, 1)); await ctx.close(); break; }
      const views = JSON.parse(process.env.VIEWS);
      for (const [name, [x, z, yaw, pitch]] of Object.entries(views)) for (const [when, hour] of [['dag', 12], ['natt', 22.5]]) {
        await page.evaluate(([x, z, yaw, pitch, hour]) => { const a = window.__app; a.player.spawn(x, z, yaw * Math.PI / 180); a.camera.rotation.x = pitch * Math.PI / 180; a.day.hour = hour; a.day.paused = true; }, [x, z, yaw, pitch, hour]);
        await page.waitForTimeout(1500);
        const file = path.join(out, `${name}-${when}-${phase}.png`);
        await kit.shot(page, file, { frames: 4 });
        const calls = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, triangles: r.info.render.triangles, textures: r.info.memory.textures, programs: r.info.programs.length }; });
        (info.views ??= {})[`${name}-${when}`] = calls;
      }
      await ctx.close();
    }
    if (mode !== 'probe') fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ errors: report.errors, external: report.external.slice(0, 5) }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
