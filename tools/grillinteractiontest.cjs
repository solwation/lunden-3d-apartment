const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const fs=require('fs');
// Run against tools/devserve.py: PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/usr/bin/google-chrome node tools/grillinteractiontest.cjs http://localhost:8717
(async()=>{
const shots=process.env.SHOTS || '/tmp/lunden-717-shots', base=process.argv[2] || 'http://localhost:8717';
fs.mkdirSync(shots,{recursive:true});const logs=[],errors=[];const report=s=>{console.log(s);logs.push(s);fs.writeFileSync(shots+'/progress.txt',logs.join('\n'));};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});globalThis.testBrowser=browser;
const page=await browser.newPage({viewport:{width:960,height:800}});globalThis.testPage=page;
page.on('pageerror',e=>{errors.push(e.stack||String(e));report('PAGE_ERROR '+(e.stack||e));});page.on('console',m=>{if(/GRILL_STAGE|^(PASS|FAIL)/.test(m.text()))report(m.text());if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text())){errors.push(m.text());report('SHADER_ERROR '+m.text());}});
await page.route('**/src/main.js',async route=>{const response=await route.fetch();const body=await response.text();const changed=body.replace('renderer.setAnimationLoop(() => frame(clock.getDelta()));','renderer.setAnimationLoop(null);');if(body===changed)throw Error('main animation loop hook changed; update targeted harness');report('test-only animation loop disabled true');await route.fulfill({response,body:changed});});
await page.exposeFunction('capture717',async name=>{const rect=await page.locator('#game').boundingBox();await page.screenshot({path:shots+'/'+name+'.png',clip:rect});report('captured '+name);});
try{
await page.goto(base+'/tools/grillinteractiontest.html',{waitUntil:'domcontentloaded',timeout:90000});report('parent DOM loaded');
await page.waitForFunction(()=>window.grillStage==='app ready',null,{timeout:150000});report('app initialized');
const frame=page.frames().find(f=>f.url().includes('index.html'));await frame.evaluate(()=>{__app.renderer.setAnimationLoop(null);__app.renderer.setPixelRatio(1);__app.renderer.setSize(640,420,false);__app.frame(0);__app.touch.enabled=false;__app.showOverlay(true);});report('initial actual frame rendered');
await page.frameLocator('#game').locator('#start-mouse').click({force:true});await frame.waitForFunction(()=>document.pointerLockElement===__app.renderer.domElement,null,{timeout:5000});report('pointer lock acquired');
await page.evaluate(()=>window.run717());const result=await page.locator('#out').textContent();fs.writeFileSync(shots+'/result.txt',result+'\nERRORS '+JSON.stringify(errors));report(result);report(JSON.stringify({errors}));
if(!result.startsWith('ALL PASS')||errors.length)throw Error('targeted interaction assertions failed');
}catch(e){report('HARNESS '+e.stack);try{report('LIVE '+JSON.stringify(await page.evaluate(()=>({stage:window.grillStage,text:document.querySelector('#out').textContent,app:!!document.querySelector('#game')?.contentWindow.__app}))));}catch{}process.exitCode=1;if(process.env.GRILL_KEEP_OPEN==='1'){report('Retaining loaded browser for diagnosis; SIGINT closes.');await new Promise(r=>process.once('SIGINT',r));}}finally{await browser.close();}
})();
