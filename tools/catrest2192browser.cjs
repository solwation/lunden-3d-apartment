// #2192: the cat that turns up behind a door sleeps curled up in the sun patch on a sunny afternoon: before (base revision's cat.js)
// vs after, the real door-opening path (CatSpawner.onOpen, one seeded draw sequence), the real sun and windows, a camera 1.8 m from it.
// PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/catrest2192browser.cjs http://localhost:8414 docs/verification/2192 [baseline-sha]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8414', out = 'docs/verification/2192', baseline = 'bc36271e'] = process.argv.slice(2);
const hidePrompt = (page) => page.evaluate(() => { // the player-name prompt covers the view: hide whatever fixed overlay holds it
  for (const el of document.querySelectorAll('body *')) if (el.children.length === 0 && /Välj spelarnamn/.test(el.textContent)) { let n = el; while (n && n !== document.body) { if (getComputedStyle(n).position === 'fixed') { n.style.display = 'none'; break; } n = n.parentElement; } }
});
(async () => {
  fs.mkdirSync(path.join(out, 'before'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = { errors: [], phases: {} };
  try {
    for (const phase of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
      page.on('pageerror', (e) => report.errors.push(`${phase}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/.test(m.text())) report.errors.push(`${phase}: ${m.text()}`); });
      await page.route('**/*', (r) => {
        const u = new URL(r.request().url());
        
        if (phase === 'before' && u.pathname === '/src/cat.js') return r.fulfill({ contentType: 'text/javascript', body: execFileSync('git', ['show', `${baseline}:src/cat.js`], { encoding: 'utf8', maxBuffer: 1 << 26 }) });
        return r.continue();
      });
      await page.goto(`${base}/?shot&test&at=3.2,6.4,0,0,3.25&time=15&month=3&day=21&freeze&weather=clear&quality=1`);
      await page.waitForFunction(() => window.__app?.cat && window.__app.world, null, { timeout: 240000 }).catch((e) => { console.log(JSON.stringify(report.errors)); throw e; });
      await page.waitForTimeout(3000);
      const info = await page.evaluate(async () => {
        const A = window.__app, cat = A.cat, door = A.world.doors.find((d) => d.kind !== 'wardrobe' && Math.abs(d.object.position.y - 3.25) < 0.1 && Math.abs(d.opening().center[1] - 7.8042) < 0.01 && Math.abs(d.opening().center[0] - 3.18165) < 0.01);
        let seed = 7; cat.rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        cat.chance.appear = 1; cat.chance.furniture = 0; cat.forceKitten = false; cat.chance.kitten = 0;
        const { center, normal } = door.opening(), from = { x: center[0] + normal[0] * 1.5, z: center[1] + normal[1] * 1.5 };
        // the same door and side as the base run; an after-run tries until it has slept in the sun (the base never does)
        let tries = 0;
        for (; tries < 40; tries++) { cat.hide(); cat.onOpen(door, from); if (cat.visible && (cat.rest || !('rest' in cat))) break; if (!('rest' in cat) && tries >= 3) break; }
        const o = cat.object.position, dx = center[0] - o.x, dz = center[1] - o.z, d = Math.hypot(dx, dz) || 1, cx = o.x + (dx / d) * 1.8, cz = o.z + (dz / d) * 1.8;
        const yaw = Math.atan2(-(o.x - cx), -(o.z - cz)); // player yaw: 0 = north (-z), 90 deg = west
        A.player.spawn(cx, cz, yaw); A.player.pos.y = 3.25; A.player.eyeY = 3.25 + 1.62; A.camera.position.y = A.player.eyeY; A.camera.rotation.x = -0.42;
        cat.ignored = -1e9;
        return { tries, cat: [o.x, o.y, o.z], rest: cat.rest?.kind ?? null, cam: [cx, cz], yawDeg: yaw * 180 / Math.PI, on: cat.on, kitten: cat.kitten, breed: cat.breed.name };
      });
      await page.waitForTimeout(2500);
      const stats = await page.evaluate(() => { const i = window.__app.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length }; });
      const file = phase === 'before' ? path.join(out, 'before', 'cat-sun.png') : path.join(out, 'cat-sun.png');
      await hidePrompt(page); await page.waitForTimeout(500);
      await page.screenshot({ path: file });
      report.phases[phase] = { ...info, ...stats, file };
      if (phase === 'after') { // the visitor comes closer: it gets up and stretches
        await page.evaluate(() => { const A = window.__app; const c = A.cat.object.position, p = A.player; const dx = p.pos.x - c.x, dz = p.pos.z - c.z, d = Math.hypot(dx, dz); p.pos.x = c.x + dx / d * 1.2; p.pos.z = c.z + dz / d * 1.2; A.camera.position.x = p.pos.x; A.camera.position.z = p.pos.z; });
        await page.waitForTimeout(3500);
        report.phases.after.woke = await page.evaluate(() => ({ rest: window.__app.cat.rest, stand: window.__app.cat.stand }));
        await hidePrompt(page);
        await page.screenshot({ path: path.join(out, 'cat-wakes.png') });
      }
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 1));
    if (report.errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
