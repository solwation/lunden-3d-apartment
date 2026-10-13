// #669: real app/WebGL, controlled clock/callback count; no &test, no device FPS claim.
// Stops the automatic loop only after a real full view, then drives unchanged frame() on a controlled clock.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.argv[2] || 'http://localhost:8840', out=process.env.PHONE_PANEL_OUTPUT || '/tmp/lunden-phonepanel', baseline=process.env.BASELINE_MAIN; fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const ctx=await browser.newContext({viewport:{width:480,height:300},hasTouch:true,deviceScaleFactor:1});const page=await ctx.newPage();page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
if(baseline)await page.route('**/src/main.js*',r=>r.fulfill({body:fs.readFileSync(baseline,'utf8'),contentType:'application/javascript'}));
console.log('NAVIGATE',!!baseline);await page.goto(base+'/?lowmem&phone&quality=0&at=4.2,3.9,180&time=12&freeze&cloud=',{waitUntil:'commit'});
await page.waitForFunction(()=>window.__app?.renderer && window.__app.loadingEl.hidden,null,{timeout:240000,polling:200});
console.log('APP READY');await page.evaluate(()=>{const a=__app;a.renderer.setAnimationLoop(null);a.showOverlay(false);a.touch.enabled=true;});
await page.clock.install(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
await page.evaluate(()=>{const a=__app,draw=a.renderer.render.bind(a.renderer);window.__panelProbe={renders:0,shadows:0,rows:[]};a.renderer.render=(s,c)=>{const p=__panelProbe,shadow=a.renderer.shadowMap.needsUpdate;p.renders++;p.shadows+=+shadow;const t=performance.now();draw(s,c);p.rows.push({shadow,calls:a.renderer.info.render.calls,tris:a.renderer.info.render.triangles,ms:performance.now()-t});};a.frame(1/60);});
async function sample(n){await page.evaluate(()=>{__panelProbe.renders=0;__panelProbe.shadows=0;__panelProbe.rows=[];});for(let i=0;i<n;i++){await page.clock.runFor(17);await page.evaluate(()=>__app.frame(1/60));}return page.evaluate(()=>structuredClone(__panelProbe));}
const walking=await sample(6);console.log('WALKING',walking.renders);
await page.evaluate(()=>__app.use(__app.note));
const reading=await sample(12);console.log('READING',reading.renders,reading.shadows);
assert.equal(await page.locator('#note').isVisible(),true);await page.screenshot({path:out+'/note.png',timeout:90000});
await page.locator('#note-close').click({force:true});assert.equal(await page.locator('#note').isVisible(),false);
const resumed=await sample(6);
await page.evaluate(()=>__app.showOverlay(true));const paused=await sample(12);console.log('PAUSED',paused.renders);await page.screenshot({path:out+'/pause.png',timeout:90000});
await page.setViewportSize({width:300,height:480});await page.clock.runFor(1000);
const rotateDisplay=await page.evaluate(()=>getComputedStyle(document.getElementById('rotate')).display);assert.equal(rotateDisplay,'grid');const portrait=await sample(4);await page.screenshot({path:out+'/portrait.png',timeout:90000});
await page.setViewportSize({width:480,height:300});await page.clock.runFor(1000);await page.evaluate(()=>__app.showOverlay(false));const landscapeAgain=await sample(3);
const result={baseline:!!baseline,testMode:await page.evaluate(()=>__app.testMode),walking,reading,resumed,paused,portrait,landscapeAgain,rotateDisplay,errors};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));
assert.equal(errors.length,0);assert.equal(walking.renders,6);assert.equal(resumed.renders,6);assert.equal(landscapeAgain.renders,3);
if(!baseline){assert.ok(reading.renders<=3);assert.ok(reading.shadows<=3);assert.ok(paused.renders<=3);assert.equal(portrait.renders,0);}else{assert.equal(reading.renders,12);assert.equal(reading.shadows,12);assert.equal(paused.renders,12);assert.equal(portrait.renders,4);}
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).filter(([k])=>!['testMode'].includes(k)).map(([k,v])=>[k,v?.rows?{renders:v.renders,shadows:v.shadows}:v]))));console.log('ALL PASS');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
