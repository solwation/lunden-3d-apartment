// #1916: matched production Avatar gallery plus main/World consumers, with an
// owned local Worker. The scheduler is stopped after startup to capture fixed
// cameras and warm render submission intervals; this is not live FPS evidence.
// Run through tools/browsertest.sh, BASE OUT [baseline revision, default2f03ba02].
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { startOwnedWorker } = require('./workerfixture.cjs');
const base = process.argv[2] || 'http://localhost:8201', out = process.argv[3] || 'docs/verification/1916';
const revision = process.argv[4] || '2f03ba02';
const files = ['src/avatar.js', 'src/config.js', 'src/olof.js', 'models/avatar-rigged.glb'];
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const original = Object.fromEntries(files.map(f => [f, execFileSync('git', ['show', `${revision}:${f}`], { maxBuffer: 8e6 })]));
const result = { baseline: revision, environment: 'Chromium1248 / SwiftShader, main/World, fixed scheduler and camera, DPR1, quality1, res=light; no device/FPS claim', versions: { node: process.version }, hashes: {}, errors: [] };
const save = () => fs.writeFileSync(path.join(out, 'world.json'), JSON.stringify(result, null, 2) + '\n');
fs.mkdirSync(out, { recursive: true });
(async () => {
 const worker = await startOwnedWorker(8202, { root: process.cwd(), outDir: path.join(out, 'worker') });
 let browser;
 try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  result.versions.chromium = browser.version();
  for (const phase of ['before', 'after']) {
   console.log('START', phase); const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
   result.hashes[phase] = Object.fromEntries(files.map(f => [f, sha(phase === 'before' ? original[f] : fs.readFileSync(f))]));
   await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', r => {
    const p = r.request().url().split('three@0.170.0/')[1];
    return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join('node_modules/three', p)) });
   });
   if (phase === 'before') for (const f of files) await ctx.route(`**/${f}`, r => r.fulfill({ contentType: f.endsWith('.glb') ? 'model/gltf-binary' : 'text/javascript', body: original[f] }));
   const page = await ctx.newPage(); page.on('pageerror', e => { result.errors.push({ phase, error: e.message }); console.error('PAGEERROR', e.message); save(); });
   page.on('console', m => { if (m.type() === 'error') console.error(m.text().slice(0, 180)); });
   await page.addInitScript(() => { localStorage.setItem('lunden.name', 'Avatarprov'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
   await page.goto(`${base}/?shot&quality=1&res=light&time=12&month=6&freeze&cloud=http://localhost:8202`, { waitUntil: 'commit' });
   await page.waitForFunction(() => window.__app?.renderer && window.__ghosts, null, { timeout: 150000, polling: 100 });
   console.log('READY', phase);
   result[phase] = await page.evaluate(async () => {
    const a = window.__app, T = await import('three');
    a.showOverlay(false); a.hideLoading(); a.renderer.setAnimationLoop(null); a.ghosts.keepConnected = () => true;
    a.frame(0); a.renderer.shadowMap.autoUpdate = false; a.renderer.shadowMap.needsUpdate = false;
    const m = a.reflectors().find(m => m.name === 'nissedal'); a.scene.updateMatrixWorld(true);
    const p = m.r.getWorldPosition(new T.Vector3()), n = new T.Vector3(0, 0, 1).transformDirection(m.r.matrixWorld);
    const e = p.clone().addScaledVector(n, 1.35); e.y = 1.62;
    const render = (from, to, mirror = false) => { a.camera.position.copy(from); a.camera.fov = 70; a.camera.updateProjectionMatrix(); a.camera.lookAt(to); a.camera.updateMatrixWorld(true); if (mirror) a.updateReflections(a.camera, 0, true, false); a.renderer.render(a.scene, a.camera); };
    a.player.spawn(e.x, e.z, 0); a.player.pos.y = 0; a.player.eyeY = 1.62; a.step(0); a.ghosts.update(0);
    window.__realism = { T, e, p, n, render };
    return { quality: a.quality.level, pixelRatio: a.renderer.getPixelRatio(), viewport: [innerWidth, innerHeight], mirror: m.name, gl: a.renderer.getContext().getParameter(a.renderer.getContext().RENDERER) };
   });
   if (result[phase].quality !== 1) throw Error('fixed quality1 was not applied');
   await page.waitForFunction(() => { window.__ghosts.update(0); return window.__ghosts.connected; }, null, { timeout: 15000, polling: 100 });
   await page.evaluate(() => { const a = window.__app, f = window.__realism; a.openAvatarCustomizer(); a.closeAvatarCustomizer(); f.render(f.e, f.p.clone().setY(1.05), true); });
   await page.screenshot({ path: path.join(out, `${phase}-mirror.png`) });
   const peer = await ctx.newPage(); await peer.route('**/src/bootstrap.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
   await peer.goto(base, { waitUntil: 'domcontentloaded' });
   const at = await page.evaluate(async () => { const C = await import('/src/config.js'); return [C.START.x, window.__app.player.groundAt(C.START.x, C.START.z - 1.5, 0), C.START.z - 1.5]; });
   await peer.evaluate(async at => { const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), C = await import('/src/config.js');
    const g = new Ghosts({ scene: new T.Scene(), camera: new T.PerspectiveCamera(), url: 'http://localhost:8202', name: () => 'Fjärravatar', state: () => ({ p: at, r: 0 }), score: () => 0 });
    g.setMyLook({ ...C.avatarLook('1907-4'), style: 1, sleeves: 0, cut: 1, legs: 1, tall: 1, build: 1 }); window.__peer = g; setInterval(() => g.update(), 50);
   }, at);
   await page.waitForFunction(() => { window.__ghosts.update(1/60); return [...window.__ghosts.others.values()].some(g => g.name === 'Fjärravatar'); }, null, { timeout: 15000, polling: 100 });
   await page.evaluate(async at => { const a = window.__app, f = window.__realism; await new Promise(r => setTimeout(r, 350)); a.ghosts.update(1/60);
    const g = [...a.ghosts.others.values()].find(g => g.name === 'Fjärravatar'); window.__realism.remote = g;
    a.player.spawn(at[0], at[2] - 2.2, Math.PI); a.player.pos.y = at[1]; a.step(0); a.ghosts.update(0);
    f.render(new f.T.Vector3(at[0], at[1] + 1.62, at[2] - 2.2), new f.T.Vector3(at[0], at[1] + 1.05, at[2]));
   }, at);
   await page.screenshot({ path: path.join(out, `${phase}-remote.png`) });
   result[phase].warm = await page.evaluate(() => { const a = window.__app, av = window.__realism.remote.avatar, r = a.renderer, gl = r.getContext();
    const stats = xs => { xs.sort((a,b)=>a-b); return { median: xs[Math.floor(xs.length*.5)], p95: xs[Math.floor(xs.length*.95)] }; };
    const update = [], render = []; let calls, triangles;
    r.setSize(640,480); // bounded software-renderer interval; same camera aspect
    const drawingBuffer = r.getDrawingBufferSize(new window.__realism.T.Vector2());
    for (let i=0;i<120;i++) { const t=performance.now(); for(let n=0;n<20;n++)av.update(1/60,{speed:1.2}); if(i>=20)update.push((performance.now()-t)/20); }
    av.update(0,{});
    for(let i=0;i<40;i++){const t=performance.now();r.render(a.scene,a.camera);gl.finish();if(i>=10)render.push(performance.now()-t);calls=r.info.render.calls;triangles=r.info.render.triangles;}
    r.setSize(1280,960);
    return { updateMsPerAvatar:stats(update), renderFinishMs:stats(render), renderSamples:render.length, drawingBuffer:[drawingBuffer.x,drawingBuffer.y], calls, triangles, skeletonBones:av.mesh.skeleton.bones.length, remoteTriangles:av.mesh.geometry.attributes.position.count/3,
      attributesBytes:Object.values(av.mesh.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0), programs:r.info.programs.length, textures:r.info.memory.textures };
   });
   console.log('MEASURED', phase, JSON.stringify(result[phase].warm)); save();
   result[phase].driver = await page.evaluate(async () => {
    const a = window.__app, f=window.__realism, C=await import('/src/config.js'), O=await import('/src/olof.js');
    a.car.park(); a.olofDriver.update(0); a.olofDriver.look=0; a.olofDriver.pose();
    for(const d of a.car.doors.filter(d=>d.front)){a.car.toggleDoor(d);for(let i=0;i<90;i++)a.car.update(1/60,false,a.player);}
    a.car.object.updateMatrixWorld(true); const fig=a.olofDriver.fig;
    const from=a.car.object.localToWorld(new f.T.Vector3(-.5,1.3,-1.6));
    const target=fig.object.localToWorld(new f.T.Vector3(0,1.05,0)); a.player.spawn(from.x,from.z,0);a.player.pos.y=from.y-1.62;a.step(0);a.olofDriver.pose();f.render(from,target);
    const pose=O.drivingPose({seat:C.OLOF.car.seat,wheel:C.OLOF.car.wheel,pedals:C.OLOF.car.pedals});fig.object.updateMatrixWorld(true);
    const error=(name,point)=>fig.object.worldToLocal(fig.bones[name].getWorldPosition(new f.T.Vector3())).distanceTo(new f.T.Vector3(...point));
    return {visible:a.olofDriver.visible,meshIdentity:fig.mesh===fig.avatar.mesh,handErrors:pose.hands.map((h,i)=>error('hand'+(i?'R':'L'),h.at)),footErrors:pose.feet.map((p,i)=>error('foot'+(i?'R':'L'),p)),triangles:fig.mesh.geometry.attributes.position.count/3};
   });
   await page.screenshot({ path: path.join(out, `${phase}-driver.png`) }); save();
   await peer.evaluate(() => window.__peer.disconnect()); await page.evaluate(() => window.__ghosts.disconnect()); await ctx.close();
  }
  for (const phase of ['before', 'after']) {
   const d=result[phase].driver;
   if(!d.visible||!d.meshIdentity||[...d.handErrors,...d.footErrors].some(v=>v>1e-5))throw Error('driver contact/consumer regression');
  }
  const a=result.before.warm,b=result.after.warm;
  if(a.calls!==b.calls||b.remoteTriangles>a.remoteTriangles*1.1||b.attributesBytes>a.attributesBytes*1.1||b.skeletonBones!==15)throw Error('runtime budget regression');
  if (result.errors.length) throw Error('main/World page errors'); result.pass = true; save();
 } finally { if(browser)await browser.close(); await worker.stop(); }
})().catch(e=>{result.error=String(e.stack);save();console.error(e);process.exitCode=1});
