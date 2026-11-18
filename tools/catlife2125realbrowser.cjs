// #2125: the real app with an outdoor cat in view at midday (before = base revision's cat modules/config served in their place),
// normal and &lowmem profiles: the coat program `|catfur1` compiled (lampwash chained), no extra cat program variant, zero errors.
// PLAYWRIGHT_MODULE=… THREE_DIR=… node tools/catlife2125realbrowser.cjs http://localhost:8325 docs/verification/2125 [base]
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8325', out = 'docs/verification/2125', baseline = execFileSync('git', ['rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim()] = process.argv.slice(2); // (the main this commit sits on)
const OLD = ['src/cat.js', 'src/outdoorcats.js', 'src/outdoorcatbrain.js', 'src/config.js', 'src/bestiaryimages.js']; // (the files #2125 changes)
(async () => {
  const browser = await kit.launch(), report = { baseline, runs: {} };
  try {
    for (const profile of ['normal', 'lowmem']) for (const phase of ['after', 'before']) {
      const errors = [], { ctx, page } = await kit.open(browser, `${base}/?time=12&month=7&day=2&weather=clear&freeze&cloud=${profile === 'lowmem' ? '&lowmem' : ''}`,
        { viewport: { width: 800, height: 500 }, wait: false, init: () => {} });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (/THREE\.WebGLProgram|THREE\.WebGLShader/.test(m.text())) errors.push(m.text().slice(0, 400)); });
      if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
      if (phase === 'before') await ctx.route(/\/src\/(cat|outdoorcats|outdoorcatbrain|config|bestiaryimages)\.js(\?.*)?$/, (r) => {
        const f = 'src/' + new URL(r.request().url()).pathname.split('/src/')[1];
        return OLD.includes(f) ? r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${baseline}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 }) }) : r.continue();
      });
      await page.reload({ waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.outdoorCats, null, { timeout: 900000, polling: 500 });
      await kit.skipNameDialog(page);
      const r = await page.evaluate(() => {
        const a = __app, O = a.outdoorCats; a.renderer.setAnimationLoop(null); a.showOverlay?.(false);
        let clock = 1793491200 + 5000; O.now = () => clock;
        const c = O.cats.find((k) => k.name === 'Sotis');
        O.cats.forEach((k) => { k.st = 'route'; O.place(k, O.scheduled(k)); k.alpha = 1; });
        // stand 1.4 m south-east of the cat's scheduled rest spot and look at it
        const s = O.scheduled(c); a.player.spawn(s.x + 1, s.z + 1, 0); a.step(0.05);
        const look = () => { const e = a.camera.position, dx = c.x - e.x, dz = c.z - e.z, y = c.group.position.y + 0.15; a.camera.rotation.set(Math.atan2(y - e.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); };
        for (let i = 0; i < 60; i++) { clock += 1 / 30; a.step(1 / 30); look(); }
        a.renderer.render(a.scene, a.camera);
        const gl = a.renderer.getContext(), progs = a.renderer.info.programs;
        const fur = progs.filter((p) => p.cacheKey.includes('catfur1'));
        let catMats = new Set(); for (const root of [c.group, a.cat.object]) root.traverse((o) => { if (o.isMesh && o.material) catMats.add(o.material); }); // (close enough, Sotis becomes the ordinary cat: CatSpawner)
        const catKeys = [...new Set([...catMats].map((m) => { const p = a.renderer.properties.get(m).currentProgram; return p ? p.cacheKey : null; }))];
        return { cat: c.name, full: c.puppet.object.visible, activity: c.activity, st: c.st, dist: Math.hypot(a.camera.position.x - c.x, a.camera.position.z - c.z),
          programs: progs.length, catfurPrograms: fur.length, catfurLinked: fur.map((p) => !!gl.getProgramParameter(p.program, gl.LINK_STATUS)),
          catfurWithLampwash: fur.filter((p) => /lampwash/.test(p.cacheKey)).length, catPrograms: catKeys.filter(Boolean).length,
          catKeyTails: catKeys.filter(Boolean).map((k) => k.slice(-60)), ordinaryCatVisible: a.cat.object.visible };
      });
      fs.writeFileSync(path.join(out, `real-${profile}-${phase}.png`), await page.screenshot());
      report.runs[`${profile}/${phase}`] = { ...r, errors };
      console.log(profile, phase, JSON.stringify({ ...r, errors }));
      await ctx.close();
    }
    fs.writeFileSync(path.join(out, 'real-browser.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
