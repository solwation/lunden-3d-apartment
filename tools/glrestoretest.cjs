// WebGL context loss on a phone (#628): headless test. Start first: python3 tools/devserve.py 8137 .
//   PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=…] [SHOTS=/tmp/dir] node tools/glrestoretest.cjs http://localhost:8137
// Phone profile (iPhone UA, touch, &lowmem): textures freed after upload (freeCanvasAfterUpload) are blank if three re-uploads
// them after webglcontextrestored. Checks that (1) the fix reloads the page once, back at the same place, and a freed canvas
// texture (curtain / rug / sign) looks the same as before; (2) a second loss within 60 s does not reload again (no loop);
// (3) CONTROL: with the reload suppressed (guard flag set) the same texture really is blank, so the test catches the bug.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8137';
const shots = process.env.SHOTS || '/tmp';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Turn on the spot (the resume keeps yaw and pitch) to face the nearest opaque mesh whose canvas texture was freed (street signs, plates, rugs). */
const aim = () => {
  const a = window.__app, rc = new (a.focus().raycaster.constructor)();
  a.scene.updateMatrixWorld(true);
  const freed = (o) => { const m = o.material && (Array.isArray(o.material) ? o.material[0] : o.material), t = m && m.map; return !!t && t.isCanvasTexture && t.image.width === 1 && !m.transparent; };
  let best = null;
  for (let k = 0; k < 12; k++) {
    a.camera.rotation.set(0, k * Math.PI / 6, 0, 'YXZ'); a.camera.updateMatrixWorld(true);
    for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) {
      rc.setFromCamera({ x: i / 10, y: j / 10 }, a.camera);
      const hit = rc.intersectObjects(a.scene.children, true).find((h) => h.object.visible && h.object.isMesh && !h.object.material?.transparent);
      if (hit && hit.distance > 1.5 && hit.distance < 25 && freed(hit.object) && (!best || hit.distance < best.d)) best = { d: hit.distance, p: hit.point.clone(), name: hit.object.name || hit.object.parent?.name || 'mesh' };
    }
  }
  if (!best) return null;
  // close in to 3 m (a valid spot only: the resume rejects a place inside something) so that the texture fills a good part of the view
  const p0 = a.player.pos.clone(), e0 = a.camera.position, l0 = Math.hypot(best.p.x - p0.x, best.p.z - p0.z);
  if (l0 > 3.5) {
    const k = (l0 - 3) / l0, nx = p0.x + (best.p.x - p0.x) * k, nz = p0.z + (best.p.z - p0.z) * k;
    a.player.spawn(nx, nz, a.camera.rotation.y); a.player.pos.y = p0.y;
    const before = a.player.pos.clone(); a.player.update(1 / 60);
    if (a.player.pos.distanceTo(before) > 0.05 || Math.abs(a.player.groundAt(nx, nz, p0.y) - p0.y) > 0.3) { a.player.spawn(p0.x, p0.z, a.camera.rotation.y); a.player.pos.y = p0.y; }
    else best.d = 3;
  }
  const e = a.camera.position, dx = best.p.x - e.x, dz = best.p.z - e.z;
  a.camera.rotation.set(Math.atan2(best.p.y - e.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
  return `${best.name} @${best.d.toFixed(1)} m`;
};
/** 12×12 grid of the colours in the middle of the game canvas (rendered now, read in the same task). */
const grid = () => {
  const a = window.__app; a.renderer.render(a.scene, a.camera);
  const c = a.renderer.domElement, o = document.createElement('canvas'); o.width = 12; o.height = 12;
  const x = o.getContext('2d'); const w = c.width * 0.3, h = c.height * 0.2; x.drawImage(c, (c.width - w) / 2, (c.height - h) / 2, w, h, 0, 0, 12, 12); // the middle of the view, where the texture is
  return Array.from(x.getImageData(0, 0, 12, 12).data);
};
const png = () => { const a = window.__app; a.renderer.render(a.scene, a.camera); return a.renderer.domElement.toDataURL('image/png'); };
const diff = (p, q) => { let s = 0, n = 0; for (let i = 0; i < p.length; i += 4) { for (let k = 0; k < 3; k++) s += Math.abs(p[i + k] - q[i + k]); n += 3; } return s / n; };
const lose = () => { const e = window.__app.renderer.getContext().getExtension('WEBGL_lose_context'); e.loseContext(); setTimeout(() => e.restoreContext(), 400); };
const poseOf = () => { const a = window.__app; return [a.player.pos.x, a.player.pos.z, a.camera.rotation.y]; };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const run = async (control) => {
    const tag = control ? 'control' : 'fix';
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: UA });
    const page = await ctx.newPage();
    const logs = [], navs = [];
    page.on('console', (m) => logs.push(m.text()));
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
    page.on('dialog', (d) => d.accept());
    const ready = async () => { await page.waitForFunction(() => window.__app?.renderer && window.__app.player, null, { timeout: 240000 }); await sleep(8000); };
    await page.goto(`${game}/?lowmem&shot&freeze&time=12&lights`, { waitUntil: 'commit' });
    await ready();
    const name = await page.evaluate(aim);
    check(!!name, `${tag}: a freed canvas texture exists on a phone`, String(name));
    await sleep(1500);
    const pose = await page.evaluate(poseOf);
    const before = await page.evaluate(grid);
    require('fs').writeFileSync(`${shots}/${tag}-1-before.png`, Buffer.from((await page.evaluate(png)).split(',')[1], 'base64')); // (page.screenshot can stall under SwiftShader)
    const n0 = navs.length;
    if (control) await page.evaluate(() => sessionStorage.setItem('lunden.glReloadAt', String(Date.now()))); // as if it had just reloaded
    await page.evaluate(lose);
    if (!control) {
      for (let i = 0; i < 100 && navs.length === n0; i++) await sleep(300); // the reload follows the restore
      await sleep(3000);
      check(navs.length === n0 + 1, 'fix: the page reloaded once', `${navs.length - n0} navigation(s)`);
      await ready();
      const pose2 = await page.evaluate(poseOf);
      check(pose.every((v, i) => Math.abs(v - pose2[i]) < 0.02), 'fix: back at the same place and view', JSON.stringify([pose, pose2]));
      await sleep(1500);
    } else await sleep(6000);
    const after = await page.evaluate(grid);
    require('fs').writeFileSync(`${shots}/${tag}-2-after.png`, Buffer.from((await page.evaluate(png)).split(',')[1], 'base64')); // (page.screenshot can stall under SwiftShader)
    const d = diff(before, after);
    if (control) {
      check(navs.length === n0, 'control: no reload (suppressed)');
      check(d > 6, 'control: WITHOUT the reload the freed texture is blank/different (the test catches the bug)', `mean diff ${d.toFixed(2)}`);
    } else {
      check(d < 3, 'fix: the texture looks the same after the reload', `mean diff ${d.toFixed(2)}`);
      // The warm-up under SwiftShader takes longer than the 60 s guard, so the second loss is made "within 60 s" by dating the flag
      // (which the fix itself wrote before the reload) to now.
      const flag = await page.evaluate(() => Number(sessionStorage.getItem('lunden.glReloadAt')));
      check(flag > 0 && Date.now() - flag < 15 * 60 * 1000, 'fix: the reload wrote its loop-guard timestamp', String(flag));
      await page.evaluate(() => sessionStorage.setItem('lunden.glReloadAt', String(Date.now())));
      const n1 = navs.length;
      await page.evaluate(lose);
      await sleep(12000);
      check(navs.length === n1, 'fix: a second loss within 60 s does not reload again (no loop)', `${navs.length - n1} navigation(s)`);
      check(logs.some((l) => /no second reload/.test(l)), 'fix: the skipped reload is logged');
    }
    await ctx.close();
  };
  try { await run(false); await run(true); } catch (e) { console.log('FAIL', e.message); failed++; }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
