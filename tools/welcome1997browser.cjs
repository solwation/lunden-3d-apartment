// #1997: ONE held actual startup turn, desktop + phone, native entry/settings and saved result images.
// CHROME_PATH=... tools/browsertest.sh node --inspect=127.0.0.1:9297 tools/welcome1997browser.cjs BASE OUT
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const[base='http://localhost:8797',out='docs/verification/1997']=process.argv.slice(2),checks=[],errors=[];
const check=(name,ok,detail)=>{checks.push({name,pass:!!ok,detail});assert(ok,name);console.log('PASS '+name)};
const scores=[{name:'Elsa',score:12840},{name:'Viktor',score:10925},{name:'Maja',score:8240},{name:'Amir',score:7680},{name:'Linnea',score:6415}];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let phase='launch',failure;
(async()=>{
 fs.mkdirSync(out+'/before',{recursive:true});fs.rmSync(out+'/release',{force:true});
 const browser=globalThis.browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const before=await browser.newPage({viewport:{width:1280,height:860}});
  await before.route(base+'/',r=>r.fulfill({contentType:'text/html',body:execFileSync('git',['show','54515194296242ad46e1982f7fbda0b67df2e9db:index.html']).toString().replaceAll('https://cdn.jsdelivr.net/npm/three@0.170.0/','/__three/')}));
  await before.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// Baseline cover only; no second historical World.'}));
  await before.goto(base+'/');await before.screenshot({path:out+'/before/loading.png'});await before.close();
  for(const mobile of [false,true]){
   phase=mobile?'phone':'desktop';console.log('PHASE '+phase);
   const ctx=globalThis.ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:860},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1,...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{})});
   const page=globalThis.page=await ctx.newPage();page.on('pageerror',e=>errors.push({phase,message:e.message}));
   let releaseMain,mainRequested=false,scoreRequests=0,releaseFirstScore;
   await page.route('**/src/main.js*',async r=>{mainRequested=true;await new Promise(resolve=>{releaseMain=resolve});await r.continue()});
   await page.route('**/__cloud/scores',async r=>{
    if(r.request().method()!=='GET')return r.fulfill({json:scores});
    scoreRequests++;
    if(scoreRequests===1){await new Promise(resolve=>{releaseFirstScore=resolve});return r.fulfill({json:scores})}
    // The existing running leaderboard is allowed to remain pending: it must not block readiness/entry.
    await new Promise(resolve=>ctx.on('close',resolve));try{await r.abort()}catch{}
   });
   await page.route('**/__cloud/**',r=>r.fulfill({status:404,body:'Local test backend: endpoint intentionally absent'}));
   // Route specificity uses the newest matching handler.
   await page.unroute('**/__cloud/**');
   await page.goto(base+'/?cloud='+encodeURIComponent(base+'/__cloud')+'&mp=0&quality=0&time=12&month=7&freeze',{waitUntil:'commit'});
   await page.waitForFunction(()=>window.__lundenLoading&&document.querySelector('#loading-settings'));
   for(let i=0;i<100&&!(mainRequested&&releaseFirstScore);i++)await pause(50);
   check(phase+': program/world import begins without any Start gesture while scores wait',mainRequested&&!!releaseMain&&!!releaseFirstScore);
   check(phase+': welcome and settings are visible before world',await page.locator('#loading h1').isVisible()&&await page.locator('#loading-settings').isVisible()&&!(await page.evaluate(()=>!!window.__app)));
   releaseFirstScore();await page.waitForFunction(()=>document.querySelectorAll('#loading-scores li').length===5);
   check(phase+': optional scores use plain safe readable rows',await page.locator('#loading-scores').innerText().then(t=>t.includes('Elsa')&&t.includes('12840')||t.includes('12 840')));
   await page.screenshot({path:out+'/'+phase+'-loading.png'});
   const act=async locator=>mobile?locator.tap():locator.click();
   await act(page.locator('#loading-settings'));
   check(phase+': early settings own focus and inert both welcome layers',await page.evaluate(()=>!document.querySelector('#settings-dialog').hidden&&document.querySelector('#loading').inert&&document.querySelector('#overlay').inert&&document.activeElement.id==='settings-close'));
   check(phase+': runtime settings remain hidden until ready',await page.locator('#menu-chat-setting').isHidden()&&await page.locator('[data-welcome-pending]').isVisible());
   await act(page.locator('#toggle-instructions'));check(phase+': native instructions work while world is absent',await page.locator('#instructions').isVisible());
   await page.screenshot({path:out+'/'+phase+'-early-settings.png'});
   // Keep the early modal open through real module/plan/world/graphics initialization.
   releaseMain();await page.waitForFunction(()=>window.__app?.renderer&&document.querySelector('#loading').hidden,null,{timeout:300000,polling:100});
   await page.unroute('**/src/main.js*');
   await page.evaluate(()=>__app.renderer.setAnimationLoop(null));
   check(phase+': readiness does not await the optional scoreboard',await page.locator('#loading').isHidden());
   check(phase+': full runtime settings released and remain visible over initial name prompt',await page.locator('#menu-chat-setting').isVisible()&&await page.locator('[data-welcome-pending]').isHidden()&&await page.locator('#settings-dialog').isVisible());
   check(phase+': runtime graphics controls and saved settings available',await page.locator('#quality-level button').count()>1);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#settings-dialog').hidden);
   check(phase+': initial player prompt preserved after early settings',await page.locator('#player-dialog').isVisible());await act(page.locator('#player-skip'));
   if(mobile && await page.locator('#install').isVisible()) await act(page.locator('#install-skip'));
   await page.locator('#overlay').evaluate(e=>e.scrollTop=0);await page.screenshot({path:out+'/'+phase+'-ready.png'});
   check(phase+': ready screen retains mouse/touch or phone Begin without added gate',mobile?await page.locator('#start-go').isVisible():await page.locator('#start-mouse').isVisible()&&await page.locator('#start-touch').isVisible());
   check(phase+': scoreboard remains visible at ready',await page.locator('#lb-start').isVisible());
   await act(page.locator('#menu-settings'));
   // Reuse the affected existing settings regression contracts without a second suite/world.
   await page.keyboard.press('Shift+Tab');check(phase+': reverse Tab wraps to privacy action',await page.evaluate(()=>document.activeElement.id==='menu-privacy'));
   await page.keyboard.press('Tab');check(phase+': forward Tab wraps to close',await page.evaluate(()=>document.activeElement.id==='settings-close'));
   const old=await page.locator('#menu-chat-setting').getAttribute('aria-pressed');await act(page.locator('#menu-chat-setting'));
   check(phase+': chat setting still toggles and persists',await page.locator('#menu-chat-setting').getAttribute('aria-pressed')!==old&&await page.evaluate(async()=>(await import('/src/playerprofiles.js')).playerLocalStorage.getItem('lunden.chat.hidden')==='1'));
   await act(page.locator('#toggle-instructions'));check(phase+': instruction toggle did not gain duplicate handlers',await page.locator('#instructions').isHidden());
   await act(page.locator('#reset-home'));check(phase+': existing reset child opens above settings',await page.locator('#reset-confirm').isVisible());await page.keyboard.press('Escape');
   check(phase+': reset cancellation returns to settings',await page.locator('#reset-confirm').isHidden()&&await page.locator('#settings-dialog').isVisible());
   await act(page.locator('#menu-privacy'));await page.keyboard.press('Escape');check(phase+': privacy returns to settings',await page.locator('#privacy-dialog').isHidden()&&await page.locator('#settings-dialog').isVisible());
   if(mobile){await page.setViewportSize({width:844,height:390});await page.screenshot({path:out+'/phone-landscape-settings.png'});await page.locator('#menu-privacy').scrollIntoViewIfNeeded();check('phone: last setting reachable and close stays visible',await page.locator('#menu-privacy').isVisible()&&await page.locator('#settings-close').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}));}
   await act(page.locator('#settings-close'));check(phase+': close returns focus to ready settings link',await page.evaluate(()=>document.activeElement.id==='menu-settings'));
   if(mobile){await page.setViewportSize({width:844,height:390});await page.locator('#start-go').tap()}
   else await page.locator('#start-mouse').click();
   await page.waitForFunction(()=>document.querySelector('#overlay').hidden,null,{timeout:10000});
   check(phase+': native entry preserves selected input mode',await page.evaluate(mode=>__app.activeMode===mode,mobile?'touch':'mouse'));
   check(phase+': entry starts audio only through user gesture',await page.evaluate(async()=>!!(await import('/src/audio.js')).audioParts()?.ctx));
   if(!mobile)check('desktop: mouse lock or existing arm fallback',await page.evaluate(()=>!!document.pointerLockElement||!document.querySelector('#arm').hidden));
   else check('phone: touch HUD is active',await page.evaluate(()=>document.body.classList.contains('touch')));
   if(await page.evaluate(()=>!!document.fullscreenElement))await page.evaluate(()=>document.exitFullscreen());
   await ctx.close();
  }
  check('zero uncaught browser errors',errors.length===0,errors);phase='complete';
 }catch(e){failure=e;console.error('FAIL phase='+phase,e.stack);}
 const manifest={phase,checks,errors,failure:failure?.stack,sha256:Object.fromEntries(['index.html','icons/welcome-lunden.svg','src/bootstrap.js','src/welcome.js','src/main.js','src/menusettings.js','src/config.js','tools/welcometest.mjs','tools/welcome1997browser.cjs'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))};
 fs.writeFileSync(out+'/browser.json',JSON.stringify(manifest,null,2)+'\n');console.log('HELD '+phase+'; create '+out+'/release to finish');
 // Allow direct inspection and bounded recovery on the SAME Page/browser when a fixture or layout needs correction.
 const until=Date.now()+300000;while(!fs.existsSync(out+'/release')&&Date.now()<until)await pause(500);
 await browser.close();if(failure)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
