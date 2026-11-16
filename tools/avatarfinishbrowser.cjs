// #1995: one bounded browser run for matched production Avatar art/costs and
// actual World mirror/driver consumers. No hardware FPS claim (SwiftShader).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { startOwnedWorker } = require('./workerfixture.cjs');
const base = process.argv[2] || 'http://localhost:8795', out = process.argv[3] || 'docs/verification/1995';
const baseline = process.argv[4] || 'HEAD';
const geometryCorrection = process.argv.includes('--geometry-correction');
const previewOnly = process.argv.includes('--preview-only');
const files = ['src/avatar.js', 'src/config.js', 'src/olof.js', 'models/avatar-rigged.glb'];
const old = Object.fromEntries(files.map(f => [f, execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 8e6 })]));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const result = { baseline: execFileSync('git', ['rev-parse', baseline], { encoding: 'utf8' }).trim(), environment: 'Chromium / SwiftShader, DPR1, fixed production component light/camera; actual World quality1 res=light', errors: [] };
if (geometryCorrection) { const prior = JSON.parse(fs.readFileSync(path.join(out, 'result.json'))); result.before = prior.before; result.reusedBefore = { baseline: prior.baseline, reason: 'unchanged baseline; geometry correction after visual rejection of material-only candidate' }; }
const save = () => fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
fs.mkdirSync(path.join(out, 'before'), { recursive: true });
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 let worker;
 try {
  result.chromium = browser.version();
  for (const phase of geometryCorrection ? ['after'] : ['before', 'after']) {
   const page = await browser.newPage({ viewport: { width: 1500, height: 1040 } });
   page.on('pageerror', e => result.errors.push({ phase, error: e.message }));
   page.on('console', m => { if (m.type() === 'error' && /Shader|GL_INVALID|VALIDATE_STATUS/.test(m.text())) result.errors.push({ phase, error: m.text() }); });
   if (phase === 'before') for (const f of files) await page.route(`**/${f}`, r => r.fulfill({ contentType: f.endsWith('.glb') ? 'model/gltf-binary' : 'text/javascript', body: old[f] }));
   await page.goto(`${base}/tools/verify-avatar-rigged.html`);
   await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
   const dest = phase === 'before' ? path.join(out, 'before') : out;
   for (const view of ['front', 'side', 'quarter']) {
    await page.evaluate(v => window.avatarView(v), view);
    await page.screenshot({ path: path.join(dest, `avatar-${view}.png`) });
   }
   result[phase] = await page.evaluate(() => {
    const { avatars, renderer: r, scene, camera, measured } = window.__avatar1907;
    scene.children.filter(v => !v.isLight && !v.isGroup).forEach(v => v.visible = false);
    r.setScissorTest(false); r.setViewport(0, 0, 1500, 800);
    const rows = avatars.map(av => {
     avatars.forEach(v => v.object.visible = v === av); r.render(scene, camera);
     return { look: av.look, calls: r.info.render.calls, triangles: r.info.render.triangles, bytes: Object.values(av.mesh.geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0), bones: av.mesh.skeleton.bones.length, material: av.material.type, textures: r.info.memory.textures, programs: r.info.programs.length };
    });
    document.querySelector('#labels').hidden = true; r.setScissorTest(true);
    for (let i = 0; i < 6; i++) {
     avatars.forEach((a, j) => a.object.visible = i === j);
     const direction = camera.position.clone().set(.35, .05, 1).normalize(), target = direction.clone().set(0, i === 3 ? 1.03 : i === 4 ? 1.05 : 1.45, 0);
     camera.position.copy(target).addScaledVector(direction, 1.25); camera.lookAt(target);
     r.setViewport(i % 3 * 500, (1 - Math.floor(i / 3)) * 400, 500, 400); r.setScissor(i % 3 * 500, (1 - Math.floor(i / 3)) * 400, 500, 400); r.render(scene, camera);
    }
    r.setScissorTest(false); return { rows, bounds: measured };
   });
   await page.screenshot({ path: path.join(dest, 'avatar-meeting.png') });
   await page.evaluate(() => {
    const { avatars, renderer: r, scene, camera } = window.__avatar1907;
    avatars.forEach((a, i) => a.object.visible = i === 0);
    const target = camera.position.clone().set(0, 1.60, 0);
    camera.position.copy(target).add(camera.position.clone().set(.18, .03, .55)); camera.lookAt(target);
    r.setViewport(0, 0, 1500, 800); camera.aspect = 1500 / 800; camera.updateProjectionMatrix(); r.render(scene, camera);
   });
   await page.screenshot({ path: path.join(dest, 'avatar-near.png') });
   if (phase === 'after') {
    for (const extreme of ['min', 'max']) {
     await page.evaluate(extreme => {
      const { avatars, renderer: r, scene, camera } = window.__avatar1907, u = avatars[0].material.userData.u;
      window.__surfaceOriginal ??= [u.uEye.value.clone(), u.uNose.value.clone(), u.uHead.value.clone()];
      if (extreme === 'min') { u.uEye.value.set(.8, .8 * .72, .8); u.uNose.value.set(.75 * .75, .75, .75); u.uHead.value.set(.9, .92, -.14); }
      else { u.uEye.value.set(1.2, 1.2 * 1.28, 1.2); u.uNose.value.set(1.3 * 1.35, 1.3, 1.3); u.uHead.value.set(1.1, 1.08, .14); }
      r.render(scene, camera);
     }, extreme);
     await page.screenshot({ path: path.join(out, `avatar-extreme-${extreme}.png`) });
    }
    await page.evaluate(() => {
     const u = window.__avatar1907.avatars[0].material.userData.u;
     [u.uEye.value, u.uNose.value, u.uHead.value].forEach((v, i) => v.copy(window.__surfaceOriginal[i]));
    });
   }
   result[phase].warm = await page.evaluate(() => {
    const { avatars, renderer: r, scene, camera } = window.__avatar1907, gl = r.getContext();
    const stats = a => { a.sort((x, y) => x - y); return { median: a[Math.floor(a.length * .5)], p95: a[Math.floor(a.length * .95)] }; };
    r.setSize(320, 256); camera.aspect = 320 / 256; camera.updateProjectionMatrix();
    const samples = [];
    for (let i = 0; i < 36; i++) { const t = performance.now(); r.render(scene, camera); gl.finish(); if (i >= 10) samples.push(performance.now() - t); }
    // Dynamic material paths are exercised on real geometry, not replacement fixtures.
    avatars[0].setSolid(false, .5); r.render(scene, camera); avatars[0].setSolid(true, 1);
    avatars[0].setSuit(true); r.render(scene, camera); avatars[0].setSuit(false);
    return { renderFinishMs: stats(samples), samples: samples.length, drawingBuffer: [320, 256], gl: gl.getParameter(gl.RENDERER) };
   });
   result[phase].hashes = Object.fromEntries(files.map(f => [f, hash(phase === 'before' ? old[f] : fs.readFileSync(f))]));
   save(); await page.close(); console.log('component', phase, JSON.stringify(result[phase].warm));
  }
  for (let i = 0; i < 6; i++) {
   const a = result.before.rows[i], b = result.after.rows[i];
   if (a.calls !== 1 || b.calls !== 1 || b.bones !== 15 || b.triangles > a.triangles || b.bytes > a.bytes * 1.02 || b.textures !== a.textures || b.programs !== a.programs) throw Error(`budget exceeded look${i}`);
  }
  worker = await startOwnedWorker(8796, { root: process.cwd(), outDir: path.join(out, 'worker') });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join('node_modules/three', r.request().url().split('three@0.170.0/')[1])) }));
  const page = await ctx.newPage(); page.on('pageerror', e => result.errors.push({ phase: 'World', error: e.message }));
  await page.addInitScript(() => { localStorage.setItem('lunden.name', 'Avatarprov'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
  await page.goto(`${base}/?shot&quality=1&res=light&time=12&month=6&freeze&cloud=http://localhost:8796`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 150000, polling: 100 });
  page.on('console', m => { if (m.type() === 'error' && /Shader|GL_INVALID|VALIDATE_STATUS/.test(m.text())) result.errors.push({ phase: 'World preview', error: m.text() }); });
  if (previewOnly) {
   await page.evaluate(() => { const a = window.__app; a.showOverlay(false); a.hideLoading(); a.renderer.setAnimationLoop(null); a.openAvatarCustomizer(); });
   await page.waitForFunction(() => document.querySelector('#avatar-preview-canvas')?.width > 100 && document.querySelector('#avatar-preview-status')?.textContent === '', null, { timeout: 30000 });
   await page.locator('[data-preview-view="face"]').click();
   await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
   await page.locator('#avatar-preview-canvas').screenshot({ path: path.join(out, 'customizer-near.png') });
   result.preview = await page.evaluate(() => {
    const c = document.querySelector('#avatar-preview-canvas'), data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return { width: c.width, height: c.height, nonEmpty: data.some((v, i) => i % 4 !== 3 && v > 80), faceSelected: document.querySelector('[data-preview-view="face"]').getAttribute('aria-pressed') };
   });
   await page.evaluate(() => window.__app.closeAvatarCustomizer());
   if (!result.preview.nonEmpty || result.preview.faceSelected !== 'true' || result.errors.length) throw Error('actual customizer preview failed');
   result.pass = true; save(); await ctx.close(); console.log('PASS corrected component and actual customizer preview', out); return;
  }
  result.world = await page.evaluate(async () => {
   const a = window.__app, T = await import('three');
   a.showOverlay(false); a.hideLoading(); a.renderer.setAnimationLoop(null); a.frame(0); a.renderer.shadowMap.autoUpdate = false; a.renderer.shadowMap.needsUpdate = false;
   const mirror = a.reflectors().find(m => m.name === 'nissedal'); a.scene.updateMatrixWorld(true);
   const p = mirror.r.getWorldPosition(new T.Vector3()), n = new T.Vector3(0, 0, 1).transformDirection(mirror.r.matrixWorld), e = p.clone().addScaledVector(n, 1.35); e.y = 1.62;
   a.player.spawn(e.x, e.z, 0); a.player.pos.y = 0; a.player.eyeY = 1.62; a.step(0); a.ghosts.update(0);
   a.camera.position.copy(e); a.camera.fov = 70; a.camera.updateProjectionMatrix(); a.camera.lookAt(p.clone().setY(1.05)); a.camera.updateMatrixWorld(true);
   a.updateReflections(a.camera, 0, true, false); a.renderer.render(a.scene, a.camera);
   window.__finish = { T };
   return { mirror: mirror.name, quality: a.quality.level, pixelRatio: a.renderer.getPixelRatio(), calls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles };
  });
  await page.screenshot({ path: path.join(out, 'world-mirror.png') });
  result.world.driver = await page.evaluate(async () => {
   const a = window.__app, { T } = window.__finish, C = await import('/src/config.js'), O = await import('/src/olof.js');
   a.car.park(); a.olofDriver.update(0); a.olofDriver.look = 0; a.olofDriver.pose();
   for (const d of a.car.doors.filter(d => d.front)) { a.car.toggleDoor(d); for (let i = 0; i < 90; i++) a.car.update(1 / 60, false, a.player); }
   a.car.object.updateMatrixWorld(true); const fig = a.olofDriver.fig;
   const from = a.car.object.localToWorld(new T.Vector3(-.5, 1.3, -1.6)), target = fig.object.localToWorld(new T.Vector3(0, 1.05, 0));
   a.player.spawn(from.x, from.z, 0); a.player.pos.y = from.y - 1.62; a.step(0); a.olofDriver.pose(); a.camera.position.copy(from); a.camera.lookAt(target); a.camera.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera);
   const pose = O.drivingPose({ seat: C.OLOF.car.seat, wheel: C.OLOF.car.wheel, pedals: C.OLOF.car.pedals }); fig.object.updateMatrixWorld(true);
   const error = (name, point) => fig.object.worldToLocal(fig.bones[name].getWorldPosition(new T.Vector3())).distanceTo(new T.Vector3(...point));
   return { visible: a.olofDriver.visible, meshIdentity: fig.mesh === fig.avatar.mesh, material: fig.mesh.material.type, handErrors: pose.hands.map((h, i) => error('hand' + (i ? 'R' : 'L'), h.at)), footErrors: pose.feet.map((p, i) => error('foot' + (i ? 'R' : 'L'), p)) };
  });
  await page.screenshot({ path: path.join(out, 'world-driver.png') });
  const d = result.world.driver;
  if (!d.visible || !d.meshIdentity || d.material !== 'MeshStandardMaterial' || [...d.handErrors, ...d.footErrors].some(x => x > 1e-5)) throw Error('actual driver material/contact regression');
  if (result.errors.length) throw Error(JSON.stringify(result.errors));
  result.pass = true; save(); await ctx.close();
 } finally { await browser.close(); if (worker) await worker.stop(); save(); }
 console.log('PASS', out);
})().catch(e => { console.error(e); process.exitCode = 1; });
