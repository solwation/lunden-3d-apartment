// Phone startup / loader regression (#697). BASELINE_DIR may contain main.js/warmup.js snapshots for an A/B count.
// PLAYWRIGHT_MODULE=/tmp/lunden-testdeps/node_modules/playwright node tools/firstframetest.cjs http://localhost:8697
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.argv[2] || 'http://localhost:8697',baseline=process.env.BASELINE_DIR;
const output=process.env.STARTUP_OUTPUT || '/tmp/lunden-697-shots';
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:3,hasTouch:true,isMobile:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
 const errors=[],shaderErrors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text()))shaderErrors.push(m.text());});
 // Control real game frames from the probe so frame zero and every slice can be measured separately.
 await page.route('**/src/main.js*',async route=>{
  let src=fs.readFileSync(baseline?path.join(baseline,'baseline-main.js'):path.join(__dirname,'../src/main.js'),'utf8');
  const hook='renderer.setAnimationLoop(() => frame(clock.getDelta()));';
  if(!src.includes(hook))throw Error('startup loop hook changed');
  src=src.replace(hook,'renderer.setAnimationLoop(null);');
  await route.fulfill({contentType:'text/javascript',body:src});
 });
 if(baseline)await page.route('**/src/warmup.js*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(baseline,'baseline-warmup.js'),'utf8')}));
 await page.goto(`${base}/?lowmem&perf&warm&time=12&month=7&freeze&cloud=&shot&at=2.875,-12,180,8`,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app,null,{timeout:180000});
 console.log('scene constructed; measuring controlled frames');
 await page.evaluate(()=>{
  const a=window.__app;a.hitch.quiet=true;
  const covered=()=>document.documentElement.classList.contains('resuming') || (!!a.loadingEl&&!a.loadingEl.hidden&&!a.loadingEl.classList.contains('done'));
  window.__firstProbe={frames:[],renders:[],covered,errors:[]};
  const render=a.renderer.render;
  a.renderer.render=function(...args){
   const before=a.hitch.snapshot(),state=a.warm.detail,regular=a.warm.done,target=this.getRenderTarget();
   const result=render.apply(this,args),after=a.hitch.snapshot();
   __firstProbe.renders.push({state,regular,target:!!target,covered:covered(),programs:after.programs-before.programs,
    buffers:after.bufferUploads-before.bufferUploads,textures:after.textures-before.textures,texUploads:after.texUploads-before.texUploads,texPixels:after.texPixels-before.texPixels});return result;
  };
  __firstProbe.tick=()=>{const before=a.hitch.snapshot(),state=a.warm.detail;a.frame(1/60);const after=a.hitch.snapshot();
   const rec={state,next:a.warm.detail,covered:covered(),programs:after.programs-before.programs,
    buffers:after.bufferUploads-before.bufferUploads,textures:after.textures-before.textures,texUploads:after.texUploads-before.texUploads,texPixels:after.texPixels-before.texPixels};__firstProbe.frames.push(rec);return rec};
 });
 const first=await page.evaluate(()=>__firstProbe.tick());console.log('frame zero',JSON.stringify(first));
 if(baseline){fs.writeFileSync(path.join(output,'before-counts.json'),JSON.stringify(await page.evaluate(()=>({frames:__firstProbe.frames,renders:__firstProbe.renders})),null,2));return;}
 const gate=await page.evaluate(()=>{const a=window.__app;if(!a.warm.blocksView)throw Error('Phone startup is not gated');
  a.hideLoading();a.showOverlay(false);const keep=__firstProbe.covered();a.showOverlay(true);
  return{keep}});
 if(!gate.keep)throw Error('Loading/resume cover released before a real view');
 await page.screenshot({path:path.join(output,'during-phone-startup.png')});
 const resume=await page.evaluate(()=>{document.documentElement.classList.add('resuming');window.__app.hideLoading();return __firstProbe.covered()});
 if(!resume)throw Error('Resume cover vanished before first complete view');
 await page.screenshot({path:path.join(output,'during-phone-resume.png')});
 const deadline=Date.now()+600000;
 while(Date.now()<deadline){
  const result=await page.evaluate(async()=>{const a=window.__app;for(let i=0;i<12&&!a.warm.done;i++){
   __firstProbe.tick();if(a.warm.blocksView&&!__firstProbe.covered())throw Error('Loader vanished during warm-up');
   await new Promise(r=>setTimeout(r,12));
  }return {state:a.warm.detail,done:a.warm.done,frames:__firstProbe.frames.length}});
  console.log('warm progress',JSON.stringify(result));if(result.done)break;
 }
 const counts=await page.evaluate(()=>{const a=window.__app;if(!a.warm.done)throw Error('Warm-up timed out');
  if(!__firstProbe.renders.some(r=>r.regular))__firstProbe.tick();
  return{frames:__firstProbe.frames,renders:__firstProbe.renders,done:a.warm.done,
   resumeRemoved:!document.documentElement.classList.contains('resuming'),released:!__firstProbe.covered()};});
 if(!counts.resumeRemoved||!counts.released)throw Error('Completed phone startup still covered');
 if(counts.renders.some(r=>!r.regular&&!r.covered))throw Error('Partial warm-up render exposed');
 await page.waitForFunction(()=>window.__app.loadingEl.hidden);
 await page.evaluate(()=>window.__app.showOverlay(false));
 await page.screenshot({path:path.join(output,'after-phone-startup.png')});
 // A small turning check at the start view after warming; no new shader programs should be needed.
 const turns=await page.evaluate(()=>{const a=window.__app,rows=[];for(const yaw of [0,90,180,270,0]){
  a.player.spawn(2.875,-12,yaw*Math.PI/180);rows.push(__firstProbe.tick());}return rows;});
 fs.writeFileSync(path.join(output,'after-counts.json'),JSON.stringify({...counts,turns,errors,shaderErrors},null,2));
 const firstRender=counts.renders[0],full=counts.renders.find(r=>r.regular&&!r.target);
 console.log('first warm render',JSON.stringify(firstRender));console.log('first full view',JSON.stringify(full));
 const maxPrograms=Math.max(...counts.frames.map(r=>r.programs));
 const programLimit=await page.evaluate(async()=>{const {WARM}=await import('/src/config.js');return WARM.programs+WARM.batch});
 console.log('max programs per gated frame',maxPrograms,'limit',programLimit);
 // A slice may finish one object batch after reaching its target; the measured phone burst is 7, limit 12.
 if(maxPrograms>programLimit)throw Error('Preparatory shader burst exceeded one slice plus one batch');
 if(!full || full.programs!==0)throw Error('First complete view compiled new shaders: '+JSON.stringify(full));
 console.log('turn new programs',turns.map(r=>r.programs));
 if(turns.some(r=>r.programs)||errors.length||shaderErrors.length)throw Error('Turning/page errors: '+JSON.stringify({errors,shaderErrors}));
 const failedLinks=await page.evaluate(()=>{const r=window.__app.renderer,gl=r.getContext();return {total:r.info.programs.length,failed:r.info.programs.filter(p=>!gl.getProgramParameter(p.program,gl.LINK_STATUS)).map(p=>p.id)}});
 console.log('program link status',JSON.stringify(failedLinks));
 if(failedLinks.failed.length)throw Error('Shader programs failed to link: '+failedLinks.failed.join(','));
 const fallbacks=await page.evaluate(async()=>{const {WarmUp}=await import('/src/warmup.js');return{desktop:!new WarmUp({sliced:false}).blocksView,skipped:!new WarmUp({sliced:true,skip:true}).blocksView}});
 if(!fallbacks.desktop||!fallbacks.skipped)throw Error('Desktop/skipped warm-up blocked');
 console.log('ALL PASS phone startup, loading/resume ordering, start-view turns and desktop/skipped state gates');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
