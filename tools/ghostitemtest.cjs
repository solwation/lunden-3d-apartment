// #1297: other players show what is in the hand (category proxy) on tools/ghostitem.html; per-category shots + checks.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostitemtest.cjs http://localhost:8791 OUTDIR
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8791', out = '/tmp/shots1297'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghostitem-'));
  const files = ['tools/ghostitemtest.cjs', 'tools/ghostitem.html', 'src/heldcategory.js', 'src/ghostprops.js', 'src/ghosts.js', 'src/avatar.js', 'src/config.js'];
  const root = path.resolve(__dirname, '..');
  fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    hashes: Object.fromEntries(files.map((p) => [p, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')])),
    profile: dir, executable: process.env.CHROME_PATH, base }, null, 2));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, executablePath: process.env.CHROME_PATH,
    viewport: { width: 2400, height: 460 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], shots = []; let checks = 0;
  const check = (ok, label) => { checks++; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) errors.push(label); };
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/tools/ghostitem.html');
    await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
    // One canonical whitelist, rather than a second list whose stale length shifts the negative-case indices (#1937).
    const CATS = await page.evaluate(async () => [...(await import('/src/heldcategory.js')).HELD_CATEGORIES]);
    const r = await page.evaluate(() => window.__shot());
    check(CATS.length > 0 && new Set(CATS).size === CATS.length && r.cases.length === CATS.length + 3, 'all canonical categories plus three negative cases');
    CATS.forEach((k, i) => check(r.cases[i].key === k && r.his[i] === k && r.items[i] === `ghost-item:${k}`, `category ${k}: intended wire input and effective proxy`));
    for (const k of CATS) check(r.itemTris[k] > 0 && r.itemTris[k] <= (k === 'fish' ? 180 : 80), `${k} proxy triangle budget`);
    const indices = Object.fromEntries(r.cases.map((c, i) => [c.key, i]));
    check(r.items[indices.none] === null && r.his[indices.none] === '', 'empty category shows no proxy');
    check(r.items[indices.weapon] === null && r.his[indices.weapon] === 'cup' && r.weapons[indices.weapon] === 'ghost-prop:saber', 'actual saber wins over cup category');
    check(r.items[indices.unknown] === null && r.his[indices.unknown] === '', 'unknown wire category is sanitized to no proxy');
    const finite = (v) => v.transformsFinite && v.projections.every((p) => !p || (p.geometryFinite && p.finite));
    check(finite(r), 'all model, camera and projected proxy coordinates finite');
    const bare = await page.evaluate(() => window.__shot(null, true)); // beyond poseFar: avatars without any proxy
    check(r.calls - bare.calls === CATS.length, 'one submitted draw per category proxy; saber remains in both');
    console.log('draw calls', r.calls, 'without proxies', bare.calls);
    await page.evaluate(() => window.__shot());
    await page.locator('canvas').screenshot({ path: path.join(out, 'ghostitem-all.png') });
    for (const { key } of r.cases) {
      const i = indices[key], shot = await page.evaluate((i) => window.__shot(i), i); shots.push({ key, ...shot });
      check(finite(shot), `${key}: finite model/camera/projection`);
      if (CATS.includes(key)) {
        const p = shot.projections[i];
        check(p.effectiveVisible && p.min.every((n, axis) => n < 1 && p.max[axis] > -1) && shot.proxyCalls === 1 && shot.proxyPixels > 0,
          `${key}: intended visible proxy submits one draw and changes actual pixels`);
      } else check(shot.proxyCalls === 0 && shot.proxyPixels === 0, `${key}: no hidden/empty proxy pixels or submitted draws`);
      // ghostProp('saber') has the hilt mesh plus its separately lit blade; category proxies still cost one draw each.
      if (key === 'weapon') check(shot.weapon?.drawCalls === 2 && shot.weapon.changedPixels > 0, 'weapon: actual saber hilt/blade submit two draws and change pixels');
      await page.locator('canvas').screenshot({ path: path.join(out, `ghostitem-${key}.png`) });
    }
    const far = await page.evaluate(() => window.__shot(null, true)); // beyond AVATAR.poseFar: the proxies are hidden
    check(finite(far) && far.items.every((item) => item === null), 'far ghosts have finite state and no effective proxies');
    const farShot = await page.evaluate((i) => window.__shot(i, true), indices.fish);
    check(finite(farShot) && farShot.proxyCalls === 0 && farShot.proxyPixels === 0, 'far fish has no proxy draw or pixels');
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, categories: CATS, indices, near: r, bare, shots, far, farShot }, null, 2));
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); fs.writeFileSync(path.join(out, 'completion.json'), JSON.stringify({ checks, errors, contextClosed: true, profileRemoved: !fs.existsSync(dir) }, null, 2)); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
