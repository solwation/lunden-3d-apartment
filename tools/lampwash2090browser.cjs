// #2090: the lamp wash's "redefinition" shader error after a quality switch (kit.shot), before/after, in the real app.
// node tools/lampwash2090browser.cjs [base] [out]; THREE_DIR = a local three@0.170.0 package (CDN routed to it).
// "before" serves BASE_REV's src/lampwash.js. Per phase: a lit room at night (the lamp wash) and the nearest parked cars
// (viewlod.js's car LOD clones, which inherit the washed callback), the console's shader errors and every invalid program.
const kit = require('./testkit.cjs'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8290', out = 'docs/verification/2090'] = process.argv.slice(2), three = process.env.THREE_DIR;
const BASE_REV = process.env.BASE_REV || 'origin/main';
async function route(ctx, phase, log) {
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    const m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/);
    if (m && three) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(three, m[1].split('?')[0])) });
    if (!u.startsWith(base + '/')) { log.push(u); return r.abort(); }
    if (phase === 'before' && new URL(u).pathname === '/src/lampwash.js') return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${BASE_REV}:src/lampwash.js`]) });
    return r.continue();
  });
}
const invalid = () => { // every drawn material whose program failed (three keeps it, draws nothing with it)
  const a = window.__app, r = a.renderer, bad = [];
  a.scene.traverse((o) => { for (const m of [].concat(o.material ?? [])) { const p = r.properties.get(m).currentProgram; if (p?.diagnostics && !p.diagnostics.runnable) bad.push(`${o.name || o.parent?.name}:${m.type}`); } });
  return [...new Set(bad)];
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(), report = { base: execFileSync('git', ['rev-parse', BASE_REV], { encoding: 'utf8' }).trim(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), phases: {}, external: [] };
  try {
    for (const phase of ['before', 'after']) {
      const t0 = Date.now(), ph = report.phases[phase] = { errors: [], redefinition: 0 };
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('lunden.playerName', 'Test'); } catch {} });
      await route(ctx, phase, report.external);
      const page = await ctx.newPage(); page.on('pageerror', (e) => ph.errors.push(e.message.slice(0, 300)));
      page.on('console', (m) => { const t = m.text(); if (m.type() !== 'error' || /favicon|net::ERR|Failed to load resource/.test(t)) return; ph.errors.push(t.slice(0, 600)); if (/redefinition|already has a body/.test(t)) ph.redefinition++; });
      await page.goto(`${base}/?test&shot&month=1&day=15&time=21&freeze&weather=clear&lights&at=1.05,10.35,90,-5,1.35`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer && window.__app.lights?.wash, null, { timeout: 1500000, polling: 1000 });
      await page.waitForTimeout(3000); await kit.skipNameDialog(page);
      ph.loadMs = Date.now() - t0;
      ph.beforeSwitch = { redefinition: ph.redefinition, invalid: await page.evaluate(invalid) };
      await kit.shot(page, path.join(out, `rum-natt-${phase}.png`), { frames: 4 });
      ph.afterRoomShot = { redefinition: ph.redefinition, invalid: await page.evaluate(invalid) };
      // the nearest parked-car set, seen from 7 m (the clones the bug hits)
      const car = await page.evaluate(() => {
        const a = window.__app; let at = null;
        a.scene.traverse((o) => { if (!at && o.isInstancedMesh && o.userData.carBatch && o.count) { const m = new o.matrixWorld.constructor(); o.getMatrixAt(0, m); at = new o.position.constructor().setFromMatrixPosition(m).applyMatrix4(o.matrixWorld); } });
        if (!at) return null;
        const x = at.x + 6, z = at.z + 4; a.player.spawn(x, z, Math.atan2(-(at.x - x), -(at.z - z))); a.camera.rotation.x = -0.15; a.day.hour = 13; a.day.paused = true;
        return [at.x, at.z];
      });
      ph.car = car;
      if (car) { await page.waitForTimeout(1500); await kit.shot(page, path.join(out, `bilar-dag-${phase}.png`), { frames: 4 }); }
      ph.afterCarShot = { redefinition: ph.redefinition, invalid: await page.evaluate(invalid) };
      ph.render = await page.evaluate(() => { const r = window.__app.renderer; r.info.reset(); r.render(window.__app.scene, window.__app.camera); return { calls: r.info.render.calls, programs: r.info.programs.length }; });
      ph.ms = Date.now() - t0;
      await ctx.close();
    }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report.phases, (k, v) => (k === 'errors' ? v.map((e) => e.slice(0, 160)) : v), 1));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
