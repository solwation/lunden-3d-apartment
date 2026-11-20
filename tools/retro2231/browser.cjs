const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
const context=await browser.newContext({viewport:{width:960,height:920},deviceScaleFactor:1,hasTouch:true});
const page=await context.newPage(),requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.storageCalls=[];for(const key of ['getItem','setItem','removeItem']){const orig=Storage.prototype[key];Storage.prototype[key]=function(...a){storageCalls.push([key,...a]);return orig.apply(this,a);};}});
await page.goto(process.argv[2]+'/tools/retro2231/');assert(!requests.some(u=>u.endsWith('jsnes.js')||u.endsWith('.nes')),'lazy download');
await page.locator('#start').click();await page.waitForFunction(()=>retroProbe.snapshot().frames>=8);const initial=await page.evaluate(()=>retroProbe.snapshot());
await page.keyboard.down('ArrowRight');await page.waitForFunction(x=>retroProbe.snapshot().ram[0]>=x+8,initial.ram[0]);await page.keyboard.up('ArrowRight');
const beforeTouch=await page.evaluate(()=>retroProbe.snapshot());const b=await page.locator('[data-key="7"]').boundingBox(),cdp=await context.newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await page.waitForFunction(x=>retroProbe.snapshot().ram[0]>=x+8,beforeTouch.ram[0]);
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
// Deterministic proof of the ROM's own collision/score, not a JS increment.
const score=await page.evaluate(()=>{retroProbe.benchmark(20);return retroProbe.snapshot().ram[2];});
await page.locator('#pause').click(); // resume after benchmark's deliberate pause
await page.keyboard.down('ArrowRight');await page.waitForFunction(s=>retroProbe.snapshot().ram[2]>s,score);await page.keyboard.up('ArrowRight');
await page.locator('#pause').click();const paused=await page.evaluate(()=>retroProbe.snapshot());await page.waitForTimeout(150);assert.equal((await page.evaluate(()=>retroProbe.snapshot())).frames,paused.frames);
await page.locator('#pause').click();await page.waitForFunction(n=>retroProbe.snapshot().frames>n,paused.frames);
await page.evaluate(()=>dispatchEvent(new Event('blur')));assert.equal((await page.evaluate(()=>retroProbe.snapshot())).running,false,'blur handler pauses');
const cpu=await page.evaluate(()=>retroProbe.benchmark(240));cpu.sort((a,b)=>a-b);
await page.screenshot({path:process.argv[3]+'/prototype.png',fullPage:true});
await page.keyboard.press('Escape');const left=await page.evaluate(()=>retroProbe.snapshot());assert.equal(left.running,false);assert.equal(left.ram,null);
assert.deepEqual(errors,[]);assert(requests.every(u=>u.startsWith(process.argv[2])));assert.deepEqual(await page.evaluate(()=>storageCalls),[]);
const result={checks:['lazy emulator/ROM','keyboard moves ROM RAM','native CDP touch moves ROM RAM','ROM collision increments score','pause/resume freezes frames','blur lifecycle handler pauses','Esc disposes instance','same-origin only/no storage/no errors'],environment:{browser:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent),viewport:{width:960,height:920},renderer:'Canvas2D; Chromium launched with SwiftShader flags; no production world/Iris640 benchmark'},cpu:{samples:240,includes:'nes.frame + RGBA copy + putImageData; sound disabled; synchronous warm benchmark',mean:cpu.reduce((a,b)=>a+b,0)/cpu.length,p50:cpu[120],p95:cpu[228],max:cpu.at(-1)},initial,paused,left,requests,errors,limits:['Own minimal NROM proof, not an existing third-party title','No audio; no 3D texture upload/world simultaneous cost','Blur lifecycle handler invoked directly; no physical-device or visibility/BFCache claim']};fs.writeFileSync(process.argv[3]+'/browser.json',JSON.stringify(result,null,2));console.log('PASS',result.checks.length,JSON.stringify(result.cpu));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
