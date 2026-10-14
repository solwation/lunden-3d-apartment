// #669: real index CSS/Three/viewport + verbatim main cover policy; tiny scene, never the apartment.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/coveredviewporttest.cjs GAME_BASE OUT
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8871', out = process.argv[3] || '/tmp/lunden-covered-viewport';
fs.mkdirSync(out, { recursive: true });
const files = ['index.html', 'src/main.js', 'src/viewport.js', 'src/config.js', 'src/lowmemory.js', 'src/quality.js', 'src/warmup.js', 'src/crashlog.js', 'src/reflections.js', 'src/cloud.js', 'src/version.js', 'tools/coveredviewporttest.cjs'];
const hashes = () => Object.fromEntries(files.map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', p))).digest('hex')]));
const frozen = hashes(); fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify(frozen, null, 2));
const checks = [], rows = [], errors = [], reports = [];
function check(ok, label) { checks.push({ ok: !!ok, label }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); assert.ok(ok, label); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let completed = false;
  try {
    const page = await browser.newPage({ viewport: { width: 393, height: 793 }, hasTouch: true, deviceScaleFactor: 3 });
    page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/bootstrap.js*', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/crash', async r => { reports.push(JSON.parse(r.request().postData())); await r.fulfill({ body: '{}', contentType: 'application/json' }); });
    await page.goto(`${base}/?lowmem&cloud=${encodeURIComponent(base)}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const THREE = await import('three'), { bindGameViewport, gameView } = await import('/src/viewport.js'), { reloadOnContextRestore } = await import('/src/lowmemory.js'), { crashlog } = await import('/src/crashlog.js');
      const main = await (await fetch('/src/main.js')).text();
      const policy = main.slice(main.indexOf('  const coveredPhone ='), main.indexOf('  shadowElapsed += dt;'));
      const defer = main.match(/deferViewportResize = \(\) => ([\s\S]*?);/g)?.at(-1)?.replace('deferViewportResize = () => ', '').slice(0, -1);
      if (!defer || !policy.includes('startupSceneReady') || !/hitch\.begin\(\);\s*viewportBinding\.flush\(\)/.test(main)) throw Error('main source contract changed');
      const policyFn = new Function('lowMemory', 'shotMode', 'warm', 'startupSceneReady', 'document', 'portraitCover', 'reading', 'overlay', 'f0', 'lastViewDraw', 'LOW_MEMORY', policy + 'return {coveredPhone,viewHidden,viewDue};');
      const deferFn = new Function('lowMemory', 'shotMode', 'warm', 'startupSceneReady', 'document', 'portraitCover', `return ${defer};`);
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(.75); const canvas = renderer.domElement; canvas.id = 'game-canvas'; document.body.prepend(canvas);
      const camera = new THREE.PerspectiveCamera(72, 1, .05, 10), scene = new THREE.Scene(); scene.background = new THREE.Color('#163a5f');
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.8, .8, .1), new THREE.MeshBasicMaterial({ color: '#ffcf47' })); mesh.position.z = -2; scene.add(mesh);
      const calls = [], writes = [], set = renderer.setSize.bind(renderer);
      renderer.setSize = (...a) => { const before = [canvas.width, canvas.height]; set(...a); calls.push({ a, before, after: [canvas.width, canvas.height] }); };
      for (const name of ['width', 'height']) { const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name); Object.defineProperty(canvas, name, { configurable: true, get() { return d.get.call(this); }, set(v) { writes.push({ name, before: d.get.call(this), value: v }); d.set.call(this, v); } }); }
      const flags = { lowMemory: true, shotMode: false, warm: { done: false }, startupSceneReady: false, hiddenControl: null };
      const portraitCover = matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 1100px)');
      const visibility = () => flags.hiddenControl === null ? document : { hidden: flags.hiddenControl }; // explicit synthetic visibility control; not a phone/background claim
      const shouldDefer = () => deferFn(flags.lowMemory, flags.shotMode, flags.warm, flags.startupSceneReady, visibility(), portraitCover);
      let binding = bindGameViewport(renderer, camera, { deferResize: shouldDefer }), reloads = 0;
      reloadOnContextRestore(canvas, () => reloads++); crashlog.attach({ renderer, camera, scene, quality: { level: 0, max: 3 } });
      for (const id of ['loading', 'overlay', 'install-sheet']) { const e = document.getElementById(id); if (e) e.hidden = true; } document.getElementById('note').hidden = true;
      window.probe = { renderer, camera, scene, calls, writes, flags, gameView, policy, defer, shouldDefer,
        get reloads() { return reloads; }, clear() { calls.length = writes.length = 0; }, flush() { binding.flush(); },
        defaultBinding() { binding(); binding = bindGameViewport(renderer, camera); }, dispose() { binding(); },
        sample() { const gl = renderer.getContext(); return { css: [canvas.clientWidth, canvas.clientHeight], canvas: [canvas.width, canvas.height], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], gameView: [gameView.w, gameView.h], aspect: camera.aspect, ratio: renderer.getPixelRatio(), cover: getComputedStyle(document.getElementById('rotate')).display,
          decision: policyFn(flags.lowMemory, flags.shotMode, flags.warm, flags.startupSceneReady, visibility(), portraitCover, false, { hidden: true }, performance.now(), -Infinity, { coveredFrameMs: 100 }), calls: structuredClone(calls), writes: structuredClone(writes) }; },
        draw() { binding.flush(); const s = this.sample(); if (s.decision.viewDue) { renderer.render(scene, camera); renderer.getContext().finish(); } return s; }
      };
    });
    async function sample(name, size) {
      if (size) await page.setViewportSize(size);
      await page.waitForFunction(() => { const p = probe, c = p.renderer.domElement; return c.clientWidth === p.gameView.w && c.clientHeight === p.gameView.h; }, null, { polling: 50 });
      const row = await page.evaluate(() => probe.draw()); rows.push({ name, ...row }); console.log(name, JSON.stringify(row)); return row;
    }
    let s = await sample('initial-report-portrait');
    check(s.css.join() === '393,793' && s.buffer.join() === '294,594', 'original report CSS and quality ratio synchronize during startup');
    check(s.decision.viewDue && s.cover === 'grid', 'startup retains rendering even in portrait before warm completion');
    await page.evaluate(() => { probe.flags.warm.done = true; probe.flags.startupSceneReady = true; });
    await sample('landscape', { width: 852, height: 393 }); await page.evaluate(() => probe.clear());
    s = await sample('covered-portrait', { width: 393, height: 793 });
    check(!s.decision.viewDue && s.cover === 'grid', 'same actual main policy hides the portrait view');
    check(s.calls.length === 0 && s.writes.length === 0 && s.buffer.join() === '639,294', 'portrait cover causes no setSize or canvas dimension writes');
    check(s.gameView.join() === '393,793' && s.aspect === 852 / 393, 'CSS gameView updates while projection stays paired with old buffer');
    s = await sample('covered-portrait-latest', { width: 393, height: 852 });
    check(s.calls.length === 0 && s.gameView.join() === '393,852', 'second covered size keeps latest CSS without reallocating');
    await page.screenshot({ path: path.join(out, 'portrait.png'), animations: 'disabled', timeout: 10000 });
    s = await sample('landscape-return', { width: 852, height: 393 });
    check(s.decision.viewDue && s.buffer.join() === '639,294' && s.calls.length === 0, 'return to original landscape renders immediately without any transition allocation');
    s = await sample('uncovered-resize', { width: 844, height: 390 });
    check(s.buffer.join() === '633,292' && s.calls.length === 1 && s.writes.length === 2 && s.aspect === 844 / 390, 'uncovered resize retains real ratio and exactly one resize/two dimension writes');
    await sample('portrait-again', { width: 390, height: 844 }); await page.evaluate(() => probe.clear());
    // Change the last hidden landscape layout synchronously, then draw BEFORE its queued resize-rAF.
    await page.evaluate(() => probe.flags.hiddenControl = true);
    await sample('hidden-landscape-pending', { width: 800, height: 360 });
    s = await page.evaluate(() => { const p = probe, c = p.renderer.domElement; c.style.width = '760px'; c.style.height = '340px'; p.flags.hiddenControl = false; window.dispatchEvent(new Event('resize')); return p.draw(); }); rows.push({ name: 'before-resize-raf', ...s });
    check(s.decision.viewDue && s.buffer.join() === '570,255' && s.aspect === 760 / 340 && s.calls.length === 1, 'flush reads latest layout before actual render even before resize-rAF');
    await page.evaluate(() => { probe.renderer.domElement.removeAttribute('style'); probe.flags.shotMode = false; window.dispatchEvent(new Event('resize')); });
    await sample('portrait-restored-css', { width: 393, height: 793 });
    for (const [name, mutate] of [['screenshot', f => f.shotMode = true], ['warming', f => f.warm.done = false], ['first-view', f => f.startupSceneReady = false], ['desktop', f => f.lowMemory = false]]) {
      await page.evaluate(fn => { const f = probe.flags; Object.assign(f, { shotMode: false, lowMemory: true, startupSceneReady: true }); f.warm.done = true; new Function('f', `(${fn})(f)`)(f); probe.clear(); window.dispatchEvent(new Event('resize')); }, mutate.toString());
      s = await sample(name); check(!await page.evaluate(() => probe.shouldDefer()), `${name} never enables the optional deferral`);
    }
    await page.evaluate(() => { Object.assign(probe.flags, { lowMemory: true, shotMode: false, startupSceneReady: true }); probe.flags.warm.done = true; });
    await sample('visible-before-hidden', { width: 852, height: 393 }); await page.evaluate(() => { probe.clear(); probe.flags.hiddenControl = true; document.dispatchEvent(new Event('visibilitychange')); });
    s = await sample('synthetic-hidden-resize', { width: 800, height: 360 });
    check(!s.decision.viewDue && s.calls.length === 0 && s.gameView.join() === '800,360', 'explicit hidden policy control defers while retaining latest CSS');
    s = await page.evaluate(() => { probe.flags.hiddenControl = null; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); return probe.draw(); }); rows.push({ name: 'resume-before-raf', ...s });
    check(s.decision.viewDue && s.buffer.join() === '600,270' && s.aspect === 800 / 360, 'visibility/pageshow resume flushes latest dimensions before visible render');
    await page.evaluate(() => probe.defaultBinding()); s = await sample('default-caller-portrait', { width: 393, height: 793 });
    check(s.buffer.join() === '294,594' && s.aspect === 393 / 793, 'legacy caller without optional callback still resizes immediately in covered portrait');
    await page.evaluate(() => { sessionStorage.removeItem('lunden.glReloadAt'); probe.renderer.forceContextLoss(); });
    await page.waitForFunction(() => probe.renderer.getContext().isContextLost(), null, { polling: 50 });
    await page.evaluate(() => probe.renderer.forceContextRestore()); await page.waitForFunction(() => !probe.renderer.getContext().isContextLost() && probe.reloads === 1, null, { polling: 50 });
    check(reports.some(r => r.kind === 'webglcontextlost') && reports.some(r => r.kind === 'webglcontextrestored'), 'forced real WebGL loss/restore retains both actual CrashLog POSTs');
    check(await page.evaluate(() => probe.reloads === 1), 'original phone restore handler still requests one guarded reload');
    await sample('final-landscape', { width: 844, height: 390 });
    check(errors.length === 0, 'no page errors'); check(JSON.stringify(hashes()) === JSON.stringify(frozen), 'all executed source bytes remain frozen');
    await page.evaluate(() => { probe.dispose(); probe.clear(); const c = probe.renderer.domElement; c.style.width = '710px'; window.dispatchEvent(new Event('orientationchange')); probe.flush(); c.removeAttribute('style'); });
    check(await page.evaluate(() => probe.calls.length === 0), 'disposed binding ignores flush and later orientation events'); completed = true;
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ completed, checks, errors, rows, reports, frozen, limitations: 'Real tiny Three WebGL component/native index/viewport and exact main policy. Synthetic hidden control is explicit. Forced loss is a lifecycle control, not iPhone loss reproduction, GPU timing, apartment rendering or proof of a prevented phone crash.' }, null, 2));
    await page.screenshot({ path: path.join(out, 'landscape.png'), animations: 'disabled', timeout: 10000 }); console.log(`ALL PASS ${checks.length}`);
  } finally {
    if (!completed) fs.writeFileSync(path.join(out, 'incomplete.json'), JSON.stringify({ completed, checks, errors, rows, reports, frozen }, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
