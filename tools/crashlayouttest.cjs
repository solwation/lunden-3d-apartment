// #930: production CrashLog with real DOM/2D canvas dimensions; renderer ratio is a stand-in.
// No apartment, WebGL or physical-phone reproduction.
// PLAYWRIGHT_MODULE=... CHROME_PATH=... node tools/crashlayouttest.cjs http://localhost:8871 /tmp/layout
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:8871';
const output = process.argv[3] || '/tmp/lunden-crash-layout';
fs.mkdirSync(output, { recursive: true });
const sources = ['src/crashlog.js', 'src/config.js', 'tools/crashlayouttest.cjs'];
const hashes = () => Object.fromEntries(sources.map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
(async () => {
  const frozen = hashes(), browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  const results = [], errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 664 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/layout-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <style>body{margin:0;background:#15212d;color:white;font:16px sans-serif}canvas{display:block;width:100vw;height:100vh}pre{position:fixed;top:20px;left:16px;pointer-events:none}</style>
      <canvas id="game-canvas"></canvas><pre id="result"></pre>
      <script type="importmap">{"imports":{"three":"/__three/build/three.module.js"}}</script>
      <script type="module">import {crashlog} from '/src/crashlog.js';
      const canvas=document.getElementById('game-canvas');window.ratio=1.125;
      crashlog.attach({renderer:{domElement:canvas,getPixelRatio:()=>window.ratio},camera:{aspect:innerWidth/innerHeight}});
      window.crash=crashlog;window.reports=[];crash.layoutSent=0;
      crash.report=(type,kind,data)=>{reports.push({type,kind,...data});return true};window.ready=true;</script>` }));
    await page.goto(`${base}/layout-fixture`);
    await page.waitForFunction(() => window.ready, { timeout: 10000 });
    // Independent expected allocation uses native canvas integer dimensions, as renderer.setSize does.
    for (const [w,h] of [[360,664],[664,360],[390,844],[844,390],[568,320]]) {
      await page.setViewportSize({width:w,height:h});
      for (const ratio of [0.6,0.75,0.9,1,0.9375,1.125,1.25]) {
        const row = await page.evaluate(({w,h,ratio}) => {
          window.ratio=ratio;crash.ctx.camera.aspect=w/h;
          const cv=document.getElementById('game-canvas');cv.style.width='100vw';cv.style.height='100vh';
          cv.width=Math.floor(w*ratio);cv.height=Math.floor(h*ratio);
          const ctx=cv.getContext('2d');ctx.fillStyle='#294e65';ctx.fillRect(0,0,cv.width,cv.height);
          const publicMeasure=crash.layoutMeasure(false), internal=crash.layoutMeasure(false,true);
          const publicBefore=JSON.stringify(publicMeasure);const count=reports.length;
          const accepted=crash.layoutCheck('fixture');
          return {w,h,ratio,public:publicMeasure,internal,accepted,newReports:reports.length-count,
            publicUnchanged:publicBefore===JSON.stringify(publicMeasure)};
        },{w,h,ratio});
        results.push(row);
      }
    }
    await page.setViewportSize({width:360,height:664});
    const faults = await page.evaluate(() => {
      window.ratio=1.125;crash.ctx.camera.aspect=360/664;
      const cv=document.getElementById('game-canvas');cv.width=405;cv.height=747;
      const m=crash.layoutMeasure(false,true), fault=x=>crash.layoutFault(x);
      return {bufferWidth:fault({...m,buf:[415,747]}),bufferHeight:fault({...m,buf:[405,757]}),
        aspect:fault({...m,aspect:1}),window:fault({...m,inner:[360,620]}),
        viewport:fault({...m,vv:{...m.vv,h:620,scale:1}}),pinch:fault({...m,vv:{...m.vv,h:620,scale:2}}),
        withinRounding:fault({...m,buf:[404,746]}),legacyRounded:fault({...m,px:1.13}),
        valid:fault(m)};
    });
    const actualFaults = await page.evaluate(() => {
      const cv=document.getElementById('game-canvas'), out={};
      const fault=()=>crash.layoutFault(crash.layoutMeasure(false,true));
      cv.width=415;out.width=fault();cv.width=405;
      cv.height=757;out.height=fault();cv.height=747;
      crash.ctx.camera.aspect=1;out.aspect=fault();crash.ctx.camera.aspect=360/664;
      cv.style.height='620px';out.viewport=fault();cv.style.height='100vh';
      out.restored=fault();return out;
    });
    // Exercise the actual reporting path: internal exact ratio never escapes through public layout/message.
    const reported = await page.evaluate(() => {
      const cv=document.getElementById('game-canvas');cv.height=757;crash.layoutSent=0;
      crash.layoutCheck('deliberate-buffer');const report=reports.at(-1);cv.height=747;
      const ctx=cv.getContext('2d');ctx.fillStyle='#294e65';ctx.fillRect(0,0,405,747);
      document.getElementById('result').textContent='Canvas 360 × 664\nBuffer 405 × 747\nExact ratio 1.125\nPublic ratio 1.13\n'+(crash.layoutCheck('valid')?'FAULT':'Valid layout');
      return report;
    });
    const data={results,faults,actualFaults,reported,errors,sources:frozen};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(data,null,2));
    await page.screenshot({path:path.join(output,'native-canvas.png'),timeout:10000});
    assert.deepEqual(hashes(),frozen,'tested sources unchanged');
    assert.deepEqual(errors,[]);
    for(const row of results){
      assert.equal(row.internal.px,row.ratio,'internal exact ratio');
      assert.equal(row.public.px,Math.round(row.ratio*100)/100,'public bounded ratio');
      assert.equal(row.accepted,false,`valid ${row.w}x${row.h} ratio ${row.ratio}`);
      assert.equal(row.newReports,0);assert.equal(row.publicUnchanged,true);
    }
    for(const k of ['bufferWidth','bufferHeight','aspect','window','viewport'])assert.ok(faults[k],k);
    for(const k of ['pinch','withinRounding','valid'])assert.equal(faults[k],'',k);
    for(const k of ['width','height','aspect','viewport'])assert.ok(actualFaults[k],k);
    assert.equal(actualFaults.restored,'');
    assert.ok(faults.legacyRounded.startsWith('buffer'),'independent original rounded fault reproduction');
    assert.equal(reported.layout.px,1.13);assert.ok(reported.msg.includes('at 1.13'));
    console.log(`PASS ${results.length} native layout allocations, five genuine faults, public precision, reporting, pinch policy and source freeze`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
