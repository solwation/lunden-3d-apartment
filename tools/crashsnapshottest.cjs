// #669: real browser DOM/events and production CrashLog, without loading the apartment or creating WebGL.
// Renderer counters and loss/restore events below are synthetic; this is not an iPhone/GPU reproduction.
// python3 tools/devserve.py 8812 .
// PLAYWRIGHT_MODULE=/path/to/playwright [CHROME_PATH=...] node tools/crashsnapshottest.cjs http://localhost:8812
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8812';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    const reports = [];
    await page.route('**/crash', async route => {
      reports.push(JSON.parse(route.request().postData()));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.route('**/crash-snapshot-fixture?*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <style>body{margin:0}canvas{width:100vw;height:100vh}</style><canvas id="game-canvas" width="633" height="292"></canvas>
      <script type="importmap">{"imports":{"three":"/__three/build/three.module.js"}}</script>
      <script type="module">import {crashlog} from '/src/crashlog.js';
      window.__app={warm:{state:'done',done:true}};
      const canvas=document.getElementById('game-canvas');
      window.diag={ms:0,progs:0,shadow:0,warm:'done'};
      crashlog.attach({frameDiag:diag,renderer:{domElement:canvas,info:{render:{frame:12,calls:4,triangles:8},memory:{geometries:2,textures:1},programs:[]},
        getPixelRatio:()=>0.75,getContext:()=>({drawingBufferWidth:canvas.width,drawingBufferHeight:canvas.height}),capabilities:{maxTextureSize:512}}});
      clearInterval(crashlog.timer);crashlog.beat();window.ready=true;</script>` }));
    await page.goto(`${game}/crash-snapshot-fixture?cloud=${encodeURIComponent(game)}`);
    await page.waitForFunction(() => window.ready);
    const initial = await page.evaluate(() => __crashlog.snapshot());
    assert.equal(initial.worst, undefined, 'no slow frame is not a fabricated zero tuple');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => !!__crashlog.surfaceEvent);
    const before = await page.evaluate(() => {
      __crashlog.beat(); // all heartbeat history ends before the synthetic slow completed frame
      Object.assign(diag,{ms:3349.2,progs:1,shadow:0,warm:'done'});
      const a=__crashlog.snapshot();
      document.getElementById('game-canvas').dispatchEvent(new Event('webglcontextlost'));
      return {a,ms:diag.ms,history:__crashlog.history.at(-1)};
    });
    assert.equal(before.ms,3349.2,'event snapshot does not consume pending worst');
    assert.equal(before.history.worst,undefined,'reproduces old gap: latest beat has no worst');
    await page.waitForFunction(() => __crashlog.stats.sent.includes('webglcontextlost'));
    const loss=reports.find(r=>r.kind==='webglcontextlost');
    assert.deepEqual(loss.snap.worst,[3349,1,0,'done']);
    assert.ok(loss.snap.beatAgeMs>=0);
    assert.deepEqual(loss.layout.inner,[390,844]);
    assert.deepEqual(loss.layout.css,[390,844]);
    assert.ok(['window-resize','viewport-resize'].includes(loss.context.surface.kind));
    assert.ok(loss.context.surface.up>=0);
    await page.evaluate(() => {
      __crashlog.beat(); // consumes pending frame before restoration
      document.getElementById('game-canvas').dispatchEvent(new Event('webglcontextrestored'));
    });
    await page.waitForFunction(() => __crashlog.stats.sent.includes('webglcontextrestored'));
    const restore=reports.find(r=>r.kind==='webglcontextrestored');
    assert.equal(restore.snap.worst,undefined);
    assert.equal(loss.snap.worst[0],3349,'sent loss tuple is immutable after heartbeat/reset');
    assert.deepEqual(restore.snap.history.at(-1).worst,[3349,1,0,'done']);
    assert.equal(restore.context.episode,loss.context.episode);
    assert.ok(restore.context.durationMs>=0);
    assert.ok(JSON.stringify(loss).length<16000);
    await page.evaluate(() => {
      const c=document.createElement('canvas');document.body.append(c);c.dispatchEvent(new Event('webglcontextlost'));c.remove();
    });
    assert.equal(await page.evaluate(()=>__crashlog.glLost),false);
    console.log('PASS pending completed-frame gap, immutable loss snapshot, heartbeat consumption, actual resize dimensions/event, paired synthetic restore, unrelated canvas, report size');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
