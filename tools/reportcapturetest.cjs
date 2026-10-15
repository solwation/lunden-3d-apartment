// Actual Three screen render + report capture + native terminal binding + fresh owned Worker.
// A tiny component scene, not apartment/phone performance acceptance. No production writes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launch } = require('./testkit.cjs');
const { startOwnedWorker } = require('./workerfixture.cjs');
const { loadSecretTestInputs, redact } = require('./secret-test-inputs.cjs');
const secrets = loadSecretTestInputs(), game = process.argv[2] || 'http://localhost:8896';
const worker = 'http://localhost:8897', out = process.argv[3] || '/tmp/lunden-reportcapture';
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const binding = main.slice(main.indexOf('const adminReports = new AdminReports('), main.indexOf("const editHelp = document.getElementById('rearrange-help')"));
const renderHook = main.match(/renderer\.render\(scene, camera\);\s*reportCapture\.afterRender\(\);/)?.[0];
assert.ok(renderHook, 'capture hook follows the original screen render');
const checks = [], check = (ok, name) => { assert.ok(ok, name); checks.push(name); };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const owned = await startOwnedWorker(8897, { outDir: out, extraSources: ['src/reportcapture.js', 'cloudflare/reportimage.js', 'tools/reportcapturetest.cjs'] });
  let browser, completed = false;
  try {
    browser = await launch();
    const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/bootstrap.js', route => route.abort());
    await page.goto(game + '/?cloud=' + encodeURIComponent(worker));
    await page.evaluate(async ({ binding, renderHook }) => {
      const T = await import('three'), { ReportCapture } = await import('/src/reportcapture.js');
      const { AdminReports } = await import('/src/adminreports.js');
      const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 10);
      camera.position.z = 2;
      const material = new T.MeshBasicMaterial({ color: 0x00ff00 });
      scene.add(new T.Mesh(new T.PlaneGeometry(1, 1), material));
      const renderer = new T.WebGLRenderer({ antialias: false }); renderer.setSize(64, 48); renderer.setClearColor(0xff0000);
      document.body.append(renderer.domElement);
      const reportCapture = new ReportCapture(renderer);
      const draw = new Function('renderer', 'scene', 'camera', 'reportCapture', renderHook);
      const frame = () => draw(renderer, scene, camera, reportCapture);
      const capture = reportCapture.capture.bind(reportCapture);
      window.captureCount = 0; window.captureFails = false; window.holdCapture = false;
      reportCapture.capture = () => {
        captureCount++;
        if (captureFails) return Promise.reject(Error('fixture capture failure'));
        const promise = capture();
        if (holdCapture) window.releaseCapture = frame; else requestAnimationFrame(frame);
        return promise;
      };
      const terminal = document.getElementById('terminal'), terminalInput = document.getElementById('terminal-code');
      terminal.hidden = false;
      const rearrange = { unlocked: false, enable() {} }, editUI = () => {}, chat = { help: '' };
      const reports = new Function('AdminReports', 'terminal', 'terminalInput', 'rearrange', 'editUI', 'chat', 'reportCapture', binding + '\nreturn adminReports;')(
        AdminReports, terminal, terminalInput, rearrange, editUI, chat, reportCapture);
      window.fixture = { renderer, scene, camera, material, reportCapture, reports, frame };
      window.inspectImage = async image => {
        const blob = await (await fetch(image)).blob(), bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
        const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
        return { width: canvas.width, height: canvas.height, bytes: blob.size, center: pixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)), corner: pixel(1, 1) };
      };
    }, { binding, renderHook });
    const first = await page.evaluate(async () => {
      const image = await fixture.reportCapture.capture(); return { image, decoded: await inspectImage(image), preserved: fixture.renderer.getContext().getContextAttributes().preserveDrawingBuffer };
    });
    fs.writeFileSync(path.join(out, 'actual-game-view.jpg'), Buffer.from(first.image.split(',')[1], 'base64'));
    const green = p => p[1] > 220 && p[0] < 35 && p[2] < 35;
    const blue = p => p[2] > 220 && p[0] < 35 && p[1] < 35;
    check(green(first.decoded.center) && first.decoded.corner[0] > 220, 'JPEG contains actual rendered green object and red background');
    check(first.decoded.width === 64 && first.decoded.height === 48 && !first.preserved, 'original canvas dimensions preserved without preserveDrawingBuffer');
    const resized = await page.evaluate(async () => {
      fixture.renderer.setSize(1400, 4); const image = await fixture.reportCapture.capture();
      fixture.renderer.setSize(64, 48); return inspectImage(image);
    });
    check(resized.width === 1280 && resized.height > 0 && resized.bytes <= 204800, 'actual large-edge game canvas is resized within JPEG dimensions and byte budget');
    // Use the real server session and production terminal binding. Credentials never enter artifacts.
    await page.evaluate(code => fixture.reports.signIn(code), secrets.codes[0]);
    check(await page.evaluate(() => fixture.reports.active), 'existing private code opens report session through actual Worker');
    const captured = []; let loseReply = true;
    await page.route(worker + '/reports/*', async route => {
      captured.push({ url: route.request().url(), body: route.request().postDataJSON() });
      const response = await route.fetch();
      if (loseReply) { loseReply = false; await route.abort('failed'); } else await route.fulfill({ response });
    });
    const send = async text => page.evaluate(text => { const input = document.getElementById('terminal-code'); input.value = '/rapport ' + text; input.form.requestSubmit(); }, text);
    const idle = () => page.waitForFunction(() => !fixture.reports.busy);
    const count = await page.evaluate(() => captureCount);
    await send('First current view'); await idle();
    check(await page.evaluate(() => document.getElementById('terminal-code').value === '/rapport First current view'), 'lost reply preserves draft');
    await page.evaluate(() => fixture.material.color.setHex(0x0000ff));
    await send('First current view'); await idle();
    check(captured.length === 2 && captured[0].url === captured[1].url && captured[0].body.image === captured[1].body.image
      && await page.evaluate(() => captureCount) === count + 1, 'retry preserves exact original JPEG and UUID despite changed current view');
    await send('Second current view'); await idle();
    const second = await page.evaluate(image => inspectImage(image), captured[2].body.image);
    check(captured[2].url !== captured[1].url && blue(second.center), 'changed report text gets a new UUID and actual current blue view');
    check(await page.evaluate(() => document.getElementById('terminal-message').textContent.includes('med bild')), 'saved message explains that the image is included');
    const stored = await fetch(worker + '/reports', { headers: { Authorization: 'Bearer testtoken' } }).then(r => r.json());
    check(stored.reports.length === 2 && stored.reports.every(r => r.image && r.untrusted), 'actual private KV queue retains one original image per report');
    await page.evaluate(() => { captureFails = true; }); await send('Keep failed capture draft'); await idle();
    check(captured.length === 3 && await page.evaluate(() => document.getElementById('terminal-code').value.includes('Keep failed capture draft')
      && document.getElementById('terminal-message').textContent.includes('Kunde inte ta bilden')), 'capture failure sends no text-only report and preserves useful draft/error');
    await page.evaluate(() => { captureFails = false; holdCapture = true; }); await send('Auth race draft');
    await page.waitForFunction(() => !!window.releaseCapture);
    await page.evaluate(() => { fixture.reports.logout(); releaseCapture(); }); await idle();
    check(captured.length === 3 && await page.evaluate(() => !fixture.reports.active), 'logout during actual capture wins before any report upload');
    check(await page.evaluate(() => ![...Array(localStorage.length)].map((_, i) => localStorage.getItem(localStorage.key(i))).some(v => v.includes('data:image/jpeg') || v.includes('lunden-reports-v1'))), 'JPEG and session are absent from persistent browser storage');
    const failed = await page.evaluate(async () => {
      holdCapture = false; fixture.renderer.setSize(0, 0);
      try { await fixture.reportCapture.capture(); return false; } catch { return true; }
    });
    check(failed, 'unavailable drawing buffer fails capture instead of submitting a blank image');
    owned.verifyFreshness(); check(errors.length === 0, 'no component browser script errors and frozen sources remain exact');
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, first: first.decoded, second, resized,
      limitations: 'Tiny actual Three component/terminal/owned Worker; no apartment or physical phone performance claim.' }, null, 2));
    console.log(`${checks.length} PASS`);
    completed = true;
  } finally {
    if (browser) await browser.close();
    if (completed && process.env.KEEP_REPORT_WORKER === '1') {
      console.log('LOCAL WORKER READY 8897; browser closed; fixture process retains ownership until SIGTERM.');
      await new Promise(() => {}); // orchestrator requests this explicit temporary handoff; exit handler owns teardown
    } else await owned.stop();
  }
})().catch(error => { console.error(redact(error.stack || error.message, secrets)); process.exitCode = 1; });
