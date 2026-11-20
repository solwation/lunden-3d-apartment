// #2230: one real whole-app visit, original panels and real movement-to-stats wiring.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), kit = require('./testkit.cjs');
const [base = 'http://localhost:8454', out = '/tmp/movement2230'] = process.argv.slice(2);
const files = ['src/player.js', 'src/main.js', 'src/movementstats.js', 'src/stats.js', 'src/medalcatalog.js', 'src/boardcatalog.js', 'src/config.js'];
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const source = Object.fromEntries(files.map(f => [f, hash(fs.readFileSync(path.resolve(__dirname, '..', f)))]));
fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], external = [], started = Date.now();
function check(ok, name, data) { checks.push({ ok: !!ok, name, data }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(data ?? {})}`); if (!ok) throw Error(name); }
(async () => {
  const browser = await kit.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1, hasTouch: true });
    await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.origin === new URL(base).origin || u.protocol === 'data:') return r.continue(); external.push(u.origin); return r.abort(); });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/?lowmem&phone&quality=0&cloud=&time=12&month=6&freeze&at=-56.4,3.1,90', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && __app.loadingEl.hidden, null, { timeout: 240000, polling: 200 });
    await kit.skipNameDialog(page);
    if (await page.locator('#install-skip').isVisible()) await page.locator('#install-skip').tap();
    await page.locator('#start-go').tap();
    await page.evaluate(() => { __app.renderer.setAnimationLoop(null); clearInterval(__app.medals.timer); });
    check(await page.evaluate(() => __app.testMode === null && __app.touch.enabled && __app.world.bicycles.length > 0), 'actual whole World, ordinary touch play, no partial test scene');
    for (const f of files) { const response = await page.request.get(base + '/' + f); check(response.ok() && hash(await response.body()) === source[f], 'served source matches frozen checkout ' + f); }
    await page.locator('#stats-btn').tap();
    check(await page.evaluate(() => !document.getElementById('stats').hidden && ['Cyklat', 'Simmat', 'Tid under ytan'].every(s => document.getElementById('stats-body').textContent.includes(s))), 'native stats button opens all three new rows at zero');
    await page.screenshot({ path: path.join(out, 'stats-before.png') });
    await page.locator('#stats-close').click();
    const cycle = await page.evaluate(() => {
      const a = __app, p = a.player, before = a.stats.cycleMetres;
      const mounted = p.mountBicycle(a.world.bicycles[0]);
      if (!mounted) return { mounted };
      p.keys.add('KeyW'); for (let i = 0; i < 20; i++) p.bikeStep(.05); p.keys.clear();
      return { mounted, before, after: a.stats.cycleMetres, pos: p.pos.toArray() };
    });
    check(cycle.mounted && cycle.after > cycle.before && cycle.after - cycle.before < 6, 'real World bicycle producer reaches actual stats binding', cycle);
    await page.locator('#stats-btn').tap();
    const paused = await page.evaluate(() => {
      const a = __app, before = [a.stats.cycleMetres, a.stats.swimMetres, a.stats.diveSeconds], pos = a.player.pos.toArray();
      a.player.keys.add('KeyW'); a.step(.05); a.player.keys.clear();
      return { same: JSON.stringify(before) === JSON.stringify([a.stats.cycleMetres, a.stats.swimMetres, a.stats.diveSeconds]), position: JSON.stringify(pos) === JSON.stringify(a.player.pos.toArray()) };
    });
    check(paused.same && paused.position, 'actual stats panel pause freezes all movement counters and body', paused);
    await page.locator('#stats-close').click();
    const swim = await page.evaluate(async () => {
      const a = __app, p = a.player, { riverAt } = await import('/src/riverbridge.js'), { swimBedY } = await import('/src/farwalk.js');
      p.keys.clear(); const dismounted = p.dismountBicycle();
      const r = riverAt(100, 120), before = { cycle: a.stats.cycleMetres, swim: a.stats.swimMetres, dive: a.stats.diveSeconds };
      p.spawn(r.x, r.z, 0); p.pos.y = swimBedY(r.x, r.z); const entered = p.swimCheck();
      if (!entered) return { dismounted, entered };
      for (let i = 0; i < 20; i++) p.swimStep(.05, 0, 0, 0);
      const drift = a.stats.swimMetres;
      for (let i = 0; i < 20; i++) p.swimStep(.05, 1, 0, 1);
      p.crouch = true; for (let i = 0; i < 35; i++) p.swimStep(.05, 0, 0, 0); p.crouch = false;
      return { dismounted, entered, before, drift, swim: a.stats.swimMetres, dive: a.stats.diveSeconds, cycle: a.stats.cycleMetres };
    });
    check(swim.dismounted && swim.entered && swim.drift === swim.before.swim && swim.swim > swim.drift && swim.dive > 1 && swim.cycle === swim.before.cycle, 'actual World swim/dive binding counts own strokes and underwater time, excludes drift/teleport', swim);
    // Controlled cumulative totals for a readable level/progress view; not claimed as organically earned in this short visit.
    const medals = await page.evaluate(async () => {
      const a = __app, s = await import('/src/stats.js');
      a.player.spawn(-56.4, 3.1, 0);
      Object.assign(a.stats, { cycleMetres: 1250, swimMetres: 140, diveSeconds: 75 });
      a.medals.check(); const paid = a.stats.medalPoints; a.medals.check(); s.saveStats();
      const saved = JSON.parse(localStorage.getItem('lunden.stats'));
      return { levels: ['cycling', 'swimming', 'diving'].map(k => a.stats.medals[k]?.l), paid, again: a.stats.medalPoints,
        saved: [saved.cycleMetres, saved.swimMetres, saved.diveSeconds] };
    });
    check(medals.levels.every(l => l === 1) && medals.paid === medals.again && JSON.stringify(medals.saved) === '[1250,140,75]', 'all three real medal levels advance once and actual statistics save retains aggregate totals', medals);
    await page.locator('#stats-btn').tap();
    check(await page.evaluate(() => { const rows = [...document.querySelectorAll('#stats-body .stat-row')]; return ['Cyklat', 'Simmat', 'Tid under ytan'].every(t => rows.some(r => r.textContent.includes(t) && r.getBoundingClientRect().bottom < innerHeight)); }), 'new statistics rows visible inside native viewport');
    await page.screenshot({ path: path.join(out, 'stats-after.png') });
    await page.locator('#stats-close').click();
    await page.evaluate(() => { __app.showOverlay(true); });
    await page.locator('#menu-medals').click();
    check(await page.evaluate(() => { const cards = [...document.querySelectorAll('#medal-grid .medal-card')]; return ['Cyklist', 'Åsimmare', 'Dykare'].every(t => cards.some(c => c.textContent.includes(t) && c.textContent.includes('Nivå 1') && c.getBoundingClientRect().bottom < innerHeight)); }), 'native menu opens medal grid with all three names, level and progress in view');
    await page.screenshot({ path: path.join(out, 'medals-after.png') });
    check(errors.length === 0, 'no page errors', errors);
    check(Object.keys(source).every(f => hash(fs.readFileSync(path.resolve(__dirname, '..', f))) === source[f]), 'production sources stayed frozen throughout app evidence');
  } finally {
    fs.writeFileSync(path.join(out, 'app-results.json'), JSON.stringify({ source, checks, errors, externalBlocked: [...new Set(external)], elapsedMs: Date.now() - started, environment: 'Chromium/SwiftShader, whole app, lowmem phone quality0, 1100x760 DPR1; isolated fresh context, remote HTTP blocked', staging: '1250/140/75 cumulative UI totals are controlled fixture values after real producer checks' }, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
