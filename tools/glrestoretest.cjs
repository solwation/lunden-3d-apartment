// Real phone-profile context restore (#628, #713). Start: python3 tools/devserve.py 8137 .
// PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome SHOTS=/tmp/dir node tools/glrestoretest.cjs http://localhost:8137
// Full production app/reload/resume hook, with its animation loop stopped by the harness. Pixel evidence is a
// production curtain texture in a 64×64 probe using app.renderer, not the full scene or a physical phone.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const path = require('path');
const game = process.argv[2] || 'http://localhost:8137';
const shots = process.env.SHOTS || '/tmp';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const poseOf = () => {
  const a = window.__app;
  return [a.player.pos.x, a.player.pos.z, a.camera.rotation.y, a.camera.rotation.x];
};
const diff = (p, q) => {
  if (p.length !== q.length) throw new Error('pixel sample sizes differ');
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) sum += Math.abs(p[i + k] - q[i + k]);
  return sum / (p.length / 4 * 3);
};

// No generated fallback: select the real seeded curtain map by stable production id, then reuse that SAME
// texture and renderer through context loss. Rendering uploads it through freeCanvasAfterUpload's real hook.
const prepareProbe = async (id) => {
  const THREE = await import('three');
  const a = window.__app;
  const curtain = id ? a.blinds.curtains.find((c) => c.id === id) : a.blinds.curtains[0];
  if (!curtain?.tex?.isCanvasTexture) throw new Error('production curtain CanvasTexture missing');
  const map = curtain.tex;
  const scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  const target = new THREE.WebGLRenderTarget(64, 64);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  window.__glProbe = { map, scene, camera, target, canvas, events: [] };
  a.renderer.domElement.addEventListener('webglcontextlost', () => window.__glProbe.events.push('lost'));
  a.renderer.domElement.addEventListener('webglcontextrestored', () => window.__glProbe.events.push('restored'));
  return { id: curtain.id, theme: curtain.spec.theme, width: map.image.width, height: map.image.height, uploadHook: typeof map.onUpdate === 'function' };
};
const sample = () => {
  const a = window.__app, p = window.__glProbe, renderer = a.renderer;
  const old = renderer.getRenderTarget();
  const pixels = new Uint8Array(64 * 64 * 4);
  try {
    renderer.setRenderTarget(p.target);
    renderer.render(p.scene, p.camera);
    renderer.readRenderTargetPixels(p.target, 0, 0, 64, 64, pixels);
  } finally { renderer.setRenderTarget(old); }
  const image = p.canvas.getContext('2d').createImageData(64, 64);
  for (let y = 0; y < 64; y++) image.data.set(pixels.subarray(y * 256, (y + 1) * 256), (63 - y) * 256);
  p.canvas.getContext('2d').putImageData(image, 0, 0);
  return { pixels: Array.from(pixels), png: p.canvas.toDataURL('image/png'), width: p.map.image.width, height: p.map.image.height,
    uploadHook: typeof p.map.onUpdate === 'function', glError: renderer.getContext().getError() };
};
const lose = () => {
  const p = window.__glProbe;
  p.events.length = 0;
  const ext = window.__app.renderer.getContext().getExtension('WEBGL_lose_context');
  if (!ext) throw new Error('WEBGL_lose_context unavailable');
  ext.loseContext();
  setTimeout(() => ext.restoreContext(), 400);
};

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const hook = 'renderer.setAnimationLoop(() => frame(clock.getDelta()));';
  if (main.split(hook).length !== 2) throw new Error('animation-loop harness hook changed');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const run = async (control) => {
    const tag = control ? 'control' : 'fix';
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: UA });
    await ctx.route('**/src/main.js*', (route) => route.fulfill({ contentType: 'application/javascript',
      body: main.replace(hook, 'renderer.setAnimationLoop(null); // glrestoretest: probe renders only') }));
    const page = await ctx.newPage(), logs = [], navs = [];
    // Playwright evaluate has no timeout of its own; a stuck GPU readback must not hold the browser indefinitely.
    const evaluate = async (fn, arg) => {
      let timer;
      try {
        return await Promise.race([page.evaluate(fn, arg), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${tag}: probe task exceeded 60 s`)), 60000);
        })]);
      } finally { clearTimeout(timer); }
    };
    page.on('console', (m) => logs.push(m.text()));
    page.on('pageerror', (e) => logs.push(`PAGE ERROR: ${e.message}`));
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
    page.on('dialog', (d) => d.accept());
    const ready = () => page.waitForFunction(() => window.__app?.blinds?.curtains?.length && window.__app.player,
      null, { timeout: 180000 }); // construction readiness, deliberately not a completed first full view
    const save = (name, result) => fs.writeFileSync(`${shots}/${name}.png`, Buffer.from(result.png.split(',')[1], 'base64'));
    try {
      await page.goto(`${game}/?lowmem&shot&freeze&time=12&lights`, { waitUntil: 'commit' });
      await ready();
      const asset = await evaluate(prepareProbe);
      check(asset.width > 1 && asset.height > 1 && asset.uploadHook, `${tag}: real production canvas and freeing hook exist before upload`, JSON.stringify(asset));
      if (asset.width <= 1 || !asset.uploadHook) throw new Error('cannot prove initial production canvas upload');
      // Exercise restoration of a deliberately non-default view, not just the initial spawn defaults.
      await evaluate(() => {
        const camera = window.__app.camera;
        camera.rotation.y += 0.37;
        camera.rotation.x = 0.18;
      });
      const before = await evaluate(sample);
      check(before.width === 1 && before.height === 1 && !before.uploadHook, `${tag}: production upload actually freed the source to 1×1`);
      check(before.glError === 0, `${tag}: probe rendered without GL error`, String(before.glError));
      const colors = new Set(before.pixels.filter((_, i) => i % 4 !== 3));
      check(colors.size > 20, `${tag}: production print has measurable pixel detail`, `${colors.size} channel values`);
      save(`${tag}-1-before`, before);
      const pose = await evaluate(poseOf), n0 = navs.length;
      if (control) await evaluate(() => sessionStorage.setItem('lunden.glReloadAt', String(Date.now())));
      await evaluate(lose);
      if (control) {
        await page.waitForFunction(() => window.__glProbe?.events.includes('restored'), null, { timeout: 15000 });
      } else {
        for (let i = 0; i < 50 && navs.length === n0; i++) await sleep(200);
        check(navs.length === n0 + 1, 'fix: the real app reloaded exactly once', `${navs.length - n0} navigation(s)`);
        if (navs.length !== n0 + 1) throw new Error('reload did not occur');
        await ready();
        const pose2 = await evaluate(poseOf);
        check(pose.every((v, i) => Math.abs(v - pose2[i]) < 0.02), 'fix: resumed at the same place and view', JSON.stringify([pose, pose2]));
        const rebuilt = await evaluate(prepareProbe, asset.id);
        check(rebuilt.id === asset.id && rebuilt.theme === asset.theme && rebuilt.width === asset.width && rebuilt.height === asset.height && rebuilt.uploadHook,
          'fix: matched production asset was rebuilt on reload', JSON.stringify(rebuilt));
      }
      const after = await evaluate(sample), d = diff(before.pixels, after.pixels);
      save(`${tag}-2-after`, after);
      check(after.glError === 0, `${tag}: restored probe rendered without GL error`, String(after.glError));
      check(after.width === 1 && after.height === 1 && !after.uploadHook, `${tag}: source remains freed after the probe`);
      if (control) {
        check(navs.length === n0, 'control: no reload (suppressed)');
        check(await evaluate(() => !document.getElementById('gl-lost').hidden), 'control: suppressed reload shows the tap-to-reload notice (#1128)');
        check(d > 6, 'control: without reload the SAME freed production map loses its pixels', `mean RGB difference ${d.toFixed(2)}`);
      } else {
        check(d < 3, 'fix: matched production texture pixels survive the app reload', `mean RGB difference ${d.toFixed(2)}`);
        const flag = await evaluate(() => Number(sessionStorage.getItem('lunden.glReloadAt')));
        check(flag > 0 && Date.now() - flag < 15 * 60 * 1000, 'fix: production reload wrote its loop-guard timestamp', String(flag));
        // Construction under SwiftShader may exceed 60 s: date the production-written guard to now for this second loss.
        await evaluate(() => sessionStorage.setItem('lunden.glReloadAt', String(Date.now())));
        const n1 = navs.length;
        await evaluate(lose);
        await page.waitForFunction(() => window.__glProbe?.events.includes('restored'), null, { timeout: 15000 });
        await sleep(500);
        check(navs.length === n1, 'fix: a second loss within 60 s does not reload again', `${navs.length - n1} navigation(s)`);
        check(logs.some((l) => /no second reload/.test(l)), 'fix: skipped reload is logged');
        // #1128: the scene stays broken without a reload (freed normals/uv), so the page must offer one tap to reload.
        check(await evaluate(() => !document.getElementById('gl-lost').hidden), 'fix: skipped reload shows the tap-to-reload notice (#1128)');
      }
    } finally {
      fs.writeFileSync(`${shots}/${tag}-console.txt`, logs.join('\n'));
      await ctx.close();
    }
  };
  try {
    if (process.env.CASE !== 'control') await run(false);
    if (process.env.CASE !== 'fix') await run(true);
  } catch (e) { console.log('FAIL', e.stack); failed++; }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exitCode = failed ? 1 : 0;
})();
