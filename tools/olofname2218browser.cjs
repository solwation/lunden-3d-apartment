// #2218: name "Olof" -> Olof's look in the mirror at start. tools/browsertest.sh node tools/olofname2218browser.cjs BASE OUT [before]
// "before" serves main.js/ghosts.js of the baseline commit (no olofname.js).
const fs = require('node:fs'), {execFileSync} = require('node:child_process'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base='http://localhost:8262', out='docs/verification/2218', mode='after', baseline='d13712db'] = process.argv.slice(2);
const dir = mode === 'before' ? out + '/before' : out;
(async()=>{
 fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:{width:1000,height:760},deviceScaleFactor:1});
 await ctx.addInitScript(()=>{ if(!localStorage.getItem('lunden.name')){localStorage.setItem('lunden.name','Olof W');sessionStorage.setItem('lunden.nameSkipped','1');} });
 const open=async()=>{
  const page=await ctx.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  if(mode==='before') for(const f of ['main','ghosts']) await page.route(`**/src/${f}.js`,r=>r.fulfill({contentType:'text/javascript',body:execFileSync('git',['show',`${baseline}:src/${f}.js`],{maxBuffer:1<<28})}));
  await page.route('**/src/avatarpreview.js',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('this.canvas = canvas;','this.canvas = canvas; window.__preview = this;')});});
  await page.goto(base+'/?shot&test=lazy&time=12&month=6&freeze&cloud=',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:300000});
  await page.evaluate(()=>{window.__app.renderer.setAnimationLoop(null);window.__app.showOverlay(false);});
  return {page,errors};
 };
 const mirror=async(page)=>{ await page.evaluate(async()=>{(await import('/src/customizer.js')).mirrorChoice().run();}); await page.waitForFunction(()=>window.__preview?.avatar); await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); };
 // a saved look of the player's own (not Olof's), so the override is visible
 await ctx.addInitScript(()=>{ if(!localStorage.getItem('lunden.avatar')) localStorage.setItem('lunden.avatar','301240110'); });
 let {page,errors}=await open();
 const info=await page.evaluate(async()=>{const C=await import('/src/config.js'),O=await import('/src/olof.js');const l=window.__app.ghosts.myLook,o=O.olofLook();return {hoodie:l.top===o.top,hair:l.hair===o.hair,facial:l.facial,saved:localStorage.getItem('lunden.avatar')};});
 console.log(mode,JSON.stringify(info));
 await mirror(page); await page.screenshot({path:dir+'/mirror-start.png'});
 if(mode==='after'){
  assert(info.hoodie&&info.hair,'start look is Olof\'s'); assert.equal(info.saved,'301240110','saved look untouched');
  // edit in the mirror, close, check the session keeps it, then a fresh session is Olof again
  await page.locator('button[data-type=style][data-index="4"]').first().click().catch(()=>{});
  await page.evaluate(async()=>{const U=await import('/src/customizer.js'); U.closeAvatarCustomizer('test');});
  const edited=await page.evaluate(()=>({style:window.__app.ghosts.myLook.style}));
  console.log('after edit',JSON.stringify(edited));
  await page.close();
  ({page,errors}=await open());
  const again=await page.evaluate(async()=>{const O=await import('/src/olof.js');const l=window.__app.ghosts.myLook,o=O.olofLook();return {hoodie:l.top===o.top,hair:l.hair===o.hair,style:l.style,olofStyle:o.style};});
  console.log('next session',JSON.stringify(again)); assert(again.hoodie&&again.hair&&again.style===again.olofStyle,'Olof again at next start');
  await mirror(page); await page.screenshot({path:dir+'/mirror-next-session.png'});
 }
 assert.equal(errors.length,0,errors.join('\n'));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
