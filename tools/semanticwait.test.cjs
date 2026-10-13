// #880: actual native Page/Frame state and fullscreen/viewport, never apartment bootstrap/WebGL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),path = require('node:path'),os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { waitForState } = require('./semanticwait.cjs');
const { setFixtureViewport } = require('./fixtureviewport.cjs');
const kit = require('./testkit.cjs');
const out=process.env.SEMANTIC_WAIT_OUTPUT||'/tmp/lunden-semantic-wait';
const baselineSHA='a5b2519';
const lines=[];
const check=(ok,label)=>{assert.ok(ok,label);lines.push('PASS '+label);console.log(lines.at(-1));};
const stall=()=>{
 window.rafRequests=0;window.rafCallbacks=0;window.requestAnimationFrame=()=>{rafRequests++;return 1;};
};

test('bounded semantic Page/Frame waits survive stopped rAF and preserve genuine viewport/frame requirements',{timeout:45000},async()=>{
 fs.mkdirSync(out,{recursive:true});
 const baselineSource=execFileSync('git',['show',`${baselineSHA}:tools/testkit.cjs`],{cwd:path.resolve(__dirname,'..')});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-gpu']});
 const errors=[],baselineDir=fs.mkdtempSync(path.join(os.tmpdir(),'lunden-semantic-before-'));
 fs.writeFileSync(path.join(baselineDir,'testkit.cjs'),baselineSource);
 try{
  for(const bad of [0,-1,Infinity,NaN])await assert.rejects(waitForState(null,()=>true,null,{timeout:bad}),/finite positive timeout/);
  check(true,'zero/negative/infinite/NaN timeout budgets are rejected before browser work');
  for(const bad of [0,-1,Infinity,'raf'])await assert.rejects(waitForState(null,()=>true,null,{polling:bad}),/finite positive polling/);
  check(true,'polling cannot be disabled or silently changed back to rAF');
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<pre id="out">timer pending</pre>');await page.evaluate(stall);
  // The old wait's first predicate is false; a timer then sets state, but no rAF callback executes.
  await page.evaluate(()=>{window.ready=false;setTimeout(()=>{ready=true;out.textContent='timer readiness reached';},80);});
  await assert.rejects(page.waitForFunction(()=>window.ready,null,{timeout:240}),/Timeout/);
  const old=await page.evaluate(()=>({ready,rafRequests,rafCallbacks}));check(old.ready&&old.rafRequests>0&&old.rafCallbacks===0,'before: default rAF wait times out although timer readiness is true');
  await page.evaluate(()=>{ready=false;setTimeout(()=>{ready=true;out.textContent='numeric polling reached readiness';},80);});
  await waitForState(page,()=>window.ready,null,{timeout:240,polling:20});
  check(await page.evaluate(()=>ready&&rafCallbacks===0),'after: same Page state completes by numeric polling without any rAF callback');
  await page.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'innerText');window.textDescriptor=descriptor;Object.defineProperty(HTMLElement.prototype,'innerText',{configurable:true,get(){throw Error('layout text forbidden');}});});
  await waitForState(page,()=>document.querySelector('#out').textContent.includes('readiness'),null,{timeout:240,polling:20});
  check(await page.evaluate(()=>out.textContent)==='numeric polling reached readiness','raw marker textContent does not invoke innerText/layout');
  await page.evaluate(()=>Object.defineProperty(HTMLElement.prototype,'innerText',textDescriptor));
  const falseStart=Date.now();await assert.rejects(waitForState(page,()=>false,null,{timeout:180,polling:20}),/Timeout/);
  check(Date.now()-falseStart>=150&&Date.now()-falseStart<2000,'a false semantic state produces an actual bounded timeout');
  const ctx=await browser.newContext();await ctx.addInitScript(stall);
  const framePage=await ctx.newPage();framePage.on('pageerror',e=>errors.push(e.message));await framePage.setContent('<iframe srcdoc="<script>window.ready=false;setTimeout(()=>window.ready=true,80)</script>"></iframe>');
  const frame=framePage.frames().find(f=>f!==framePage.mainFrame());
  await waitForState(frame,()=>window.ready,null,{timeout:400,polling:20});check(await frame.evaluate(()=>ready&&rafCallbacks===0),'the same helper supports an actual child Frame without rAF');
  await ctx.close();
  // kit.open preserves test/lazy/viewport/context/wait:false and its existing timeout argument.
  const init=()=>{window.requestAnimationFrame=()=>1;window.__app=null;setTimeout(()=>window.__app={renderer:{semanticOnly:true}},80);};
  const newPageRoute=async ctx=>ctx.route(url=>url.hostname==='native-readiness',r=>r.fulfill({contentType:'text/html',body:'<pre>native readiness fixture</pre>'}));
  const oldKit=require(path.join(baselineDir,'testkit.cjs')); // exact frozen historical source, no copied implementation
  const oldBrowser={newContext:async opts=>{const ctx=await browser.newContext(opts);ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));await newPageRoute(ctx);return ctx;}};
  await assert.rejects(oldKit.open(oldBrowser,'http://native-readiness',{init,timeout:240}),/Timeout/);
  check(true,'before: exact original testkit.open cannot observe timer-ready renderer with stopped rAF');
  const {ctx:opened,page:readyPage}=await kit.open(oldBrowser,'http://native-readiness',{init,timeout:240,lazy:true,viewport:{width:667,height:375}});
  check(await readyPage.evaluate(()=>!!__app.renderer)&&readyPage.url().endsWith('?test=lazy')&&readyPage.viewportSize().width===667,'after: testkit.open keeps lazy URL/viewport and observes renderer semantically');
  await opened.close();
  const pending=await kit.open(oldBrowser,'http://native-readiness',{wait:false,test:false,init:()=>{window.__app=null;}});
  check(!await pending.page.evaluate(()=>window.__app)&&!pending.page.url().includes('test'),'wait:false and test:false retain their original behavior');await pending.ctx.close();
  const viewportPage=await browser.newPage({viewport:{width:480,height:300}});viewportPage.on('pageerror',e=>errors.push(e.message));await viewportPage.setContent('<button id="start">Native fullscreen</button><pre>Actual DOM fullscreen + viewport</pre><script>start.onclick=()=>document.documentElement.requestFullscreen()</script>');
  await viewportPage.evaluate(stall);await viewportPage.evaluate(()=>start.click());
  await waitForState(viewportPage,()=>!!document.fullscreenElement,null,{timeout:1000,polling:20});
  const result=await setFixtureViewport(viewportPage,{width:667,height:375});
  check(result.leftFullscreen&&result.viewport.width===667&&result.viewport.height===375&&!await viewportPage.evaluate(()=>!!document.fullscreenElement),'genuine DOM fullscreen exit reaches authored viewport under stopped rAF');
  const fixed=await setFixtureViewport(viewportPage,{width:960,height:600});check(!fixed.leftFullscreen&&fixed.viewport.width===960&&fixed.viewport.height===600,'ordinary native viewport transition remains exact');
  const shotPage=await browser.newPage();shotPage.on('pageerror',e=>errors.push(e.message));await shotPage.setContent('<pre>Native frame-gated screenshot helper</pre>');
  await shotPage.evaluate(()=>{window.nativeRAF=requestAnimationFrame.bind(window);window.pendingFrames=[];window.draws=0;window.realFrames=0;window.requestAnimationFrame=cb=>{pendingFrames.push(cb);return 1;};window.__app={testMode:{setFull(){},draw(){draws++;}}};});
  let shotDone=false;const shot=kit.shot(shotPage,path.join(out,'frame-gated.png'),{frames:2}).then(()=>{shotDone=true;});
  await waitForState(shotPage,()=>pendingFrames.length>0,null,{timeout:1000,polling:20});
  check(!shotDone&&await shotPage.evaluate(()=>draws===0),'actual testkit.shot remains blocked before the required native frame');
  await shotPage.evaluate(()=>{requestAnimationFrame=cb=>nativeRAF(t=>{realFrames++;cb(t);});for(const cb of pendingFrames.splice(0))requestAnimationFrame(cb);});
  await shot;check(await shotPage.evaluate(()=>realFrames===2&&draws===2),'actual screenshot helper requires both genuine rAF callbacks and draw calls');
  check(errors.length===0,'no native fixture page errors');
  await page.evaluate(lines=>{document.body.innerHTML='<pre id="out"></pre>';document.body.style.cssText='background:#f3f6f9;color:#142b3c;font:16px monospace;padding:24px';out.textContent=lines.join('\n')+'\nALL PASS';},lines);
  await page.screenshot({path:path.join(out,'native.png'),fullPage:true});
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({lines,errors,before:old,browser:browser.version(),scope:'native synthetic timer/readiness DOM and genuine fullscreen/viewport; no renderer, apartment, speedup or physical device claim'},null,2));
 }finally{await browser.close();fs.rmSync(baselineDir,{recursive:true,force:true});}
});
