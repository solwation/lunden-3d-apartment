#!/usr/bin/env node
// Actual index/modal CSS and existing production dismiss routes; no apartment bootstrap.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const kit=require('./testkit.cjs');
const game=process.argv[2]||'http://localhost:8971',out=process.argv[3]||'/tmp/lunden-modal-1059/dialogs';
const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
const between=(a,b)=>{const start=main.indexOf(a);assert.ok(start>=0,a);const end=main.indexOf(b,start);assert.ok(end>start,b);return main.slice(start,end);};
const tap=between('function onTap(el, fn) {','// reload to a fresh URL');
const reset=between('const resetHome = {','// Call close directly');
const resetHandlers=main.split('\n').filter(s=>s.startsWith("onTap(document.getElementById('reset-")).join('\n');
const drawing=between("function endDraw(byKey = 'E') {","drawPanel.querySelector('[data-act=clear]')");
const drawDone=main.split('\n').find(s=>s.startsWith("drawPanel.querySelector('[data-act=done]')"));
const privacy=main.split('\n').filter(s=>s.startsWith("document.getElementById('menu-privacy')")||s.startsWith("document.getElementById('privacy-dialog-close')")).join('\n');
const lbClose=main.split('\n').find(s=>s.startsWith("document.getElementById('leaderboard-dialog-close')"));
const escape=between("document.addEventListener('keydown', (e) => {\n  if (e.code === 'Escape' && !resetEl.hidden)","const resetDone = takeResetDone();");
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await kit.launch(),checks=[];
 try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js',r=>r.abort());await page.route('https://**/*',r=>r.abort());
 await page.goto(game);
 await page.evaluate(async({tap,reset,resetHandlers,drawing,drawDone,privacy,lbClose,escape})=>{
  document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;document.getElementById('rotate').style.display='none';
  const {initHudIcons}=await import('/src/hudicons.js');initHudIcons();
  const {setupInstall}=await import('/src/install.js');setupInstall({force:true,ua:'iPhone'});
  const {Leaderboard}=await import('/src/leaderboard.js');
  const el=id=>document.getElementById(id);
  const leaderboard=new Leaderboard('/local-fixture',()=>0,{dialog:el('player-dialog'),badge:el('player-badge'),display:el('player-display'),nameRow:el('lb-name'),input:el('player-name'),list:el('lb-start'),ok:el('player-ok'),skip:el('player-skip'),newPlayer:el('player-new'),lbDialog:el('leaderboard-dialog'),dialogList:el('lb-dialog-list')});
  clearInterval(leaderboard.timer);
  const source=`
   const resetEl=document.getElementById('reset-confirm'),privacyDialog=document.getElementById('privacy-dialog'),statsEl=document.getElementById('stats');
   let resetCalls=0,reloading=false;
   const clearLocalHome=()=>resetCalls++,isPhoneDevice=()=>false,lastPointerType='',touch={enabled:false},activeMode='mouse';
   const location={href:'fixture'},showOverlay=()=>{},showStats=show=>statsEl.hidden=!show;
   ${tap}\n${reset}\n${resetHandlers}\n${privacy}\n${lbClose}\n${escape}
   const drawPanel=document.getElementById('draw-panel'),overlay=document.getElementById('overlay'),armEl=document.getElementById('arm');
   let drawTouch=true,endCalls=0;
   const drawing={end(){endCalls++;}},canvas={requestPointerLock(){}};
   ${drawing}\n${drawDone}
   return {resetHome,get resetCalls(){return resetCalls;},get endCalls(){return endCalls;},touch};
  `;
  window.closeFixture=new Function('leaderboard',source)(leaderboard);window.leaderboardFixture=leaderboard;
 },{tap,reset,resetHandlers,drawing,drawDone,privacy,lbClose,escape});
 const check=(ok,name)=>{assert.ok(ok,name);checks.push(name);};
 // New corners call actual existing safe paths, not a generic hidden toggle.
 await page.evaluate(()=>document.getElementById('player-dialog').hidden=true);
 await page.locator('#install .dialog-close').click();check(await page.evaluate(()=>document.getElementById('install').hidden&&sessionStorage.getItem('lunden.installSkipped')==='1'),'install X follows browser-play skip and persists session choice');
 await page.evaluate(()=>leaderboardFixture.openDialog('initial'));await page.locator('#player-dialog .dialog-close').click();check(await page.evaluate(()=>document.getElementById('player-dialog').hidden&&sessionStorage.getItem('lunden.nameSkipped')==='1'&&!localStorage.getItem('lunden.name')),'name X follows anonymous skip without confirming draft');
 await page.evaluate(()=>closeFixture.resetHome.ask());await page.locator('#reset-confirm .dialog-close').click();check(await page.evaluate(()=>document.getElementById('reset-confirm').hidden&&closeFixture.resetCalls===0),'reset X cancels without clearing home');
 await page.evaluate(()=>closeFixture.resetHome.ask());await page.keyboard.press('Escape');check(await page.locator('#reset-confirm').isHidden(),'actual document Escape cancels reset');
 await page.evaluate(()=>document.getElementById('draw-panel').hidden=false);await page.locator('#draw-panel .dialog-close').click();check(await page.evaluate(()=>document.getElementById('draw-panel').hidden&&closeFixture.endCalls===1&&closeFixture.touch.enabled),'drawing X ends drawing and restores touch via existing finish');
 await page.evaluate(()=>document.getElementById('privacy-dialog').hidden=false);await page.locator('#privacy-dialog-close').click();check(await page.locator('#privacy-dialog').isHidden(),'privacy X keeps production dismissal');
 await page.evaluate(()=>document.getElementById('privacy-dialog').hidden=false);await page.keyboard.press('Escape');check(await page.locator('#privacy-dialog').isHidden(),'actual document Escape keeps privacy dismissal');
 await page.evaluate(()=>leaderboardFixture.openLeaderboardDialog());await page.locator('#leaderboard-dialog-close').click();check(await page.locator('#leaderboard-dialog').isHidden(),'leaderboard X keeps actual controller dismissal');
 const ids=await page.locator('[role="dialog"],dialog,#stats').evaluateAll(els=>els.map(e=>e.id));
 for(const viewport of [{width:1280,height:800},{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  for(const id of ids){
   const state=await page.evaluate(id=>{
    document.querySelectorAll('[role="dialog"],dialog,#stats').forEach(e=>{if(e instanceof HTMLDialogElement)e.close();else e.hidden=true;});
    const panel=document.getElementById(id);document.getElementById('hud').hidden=id!=='stats';
    if(panel instanceof HTMLDialogElement)panel.showModal();else panel.hidden=false;
    const button=panel.querySelector('.dialog-close');if(!button)return {error:'missing corner'};
    // Ignore full-screen backdrop: containing surface is the card or the compact panel itself.
    const surface=button.closest('.dialog-card')??panel;
    surface.scrollTop=0;
    const b=button.getBoundingClientRect(),s=surface.getBoundingClientRect();
    const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
    const overlaps=[...panel.querySelectorAll('h1,h2,input,textarea,button')].filter(e=>e!==button&&!e.hidden&&e.getClientRects().length).some(e=>{const r=e.getBoundingClientRect();return Math.min(r.right,b.right)>Math.max(r.left,b.left)+1&&Math.min(r.bottom,b.bottom)>Math.max(r.top,b.top)+1;});
    return {overlaps,width:b.width,height:b.height,top:b.top,right:b.right,gapRight:s.right-b.right,gapTop:b.top-s.top,hit:hit===button||button.contains(hit),label:button.getAttribute('aria-label'),svg:!!button.querySelector('.hud-icon'),textClose:[...panel.querySelectorAll('button')].some(e=>e.textContent.trim()==='Stäng')};
   },id);
   check(!state.error&&!state.overlaps&&state.width>=44&&state.height>=44&&state.top>=0&&state.right<=viewport.width+1&&state.gapTop>=-1&&state.gapTop<=18&&state.gapRight>=-1&&state.gapRight<=22&&state.hit&&state.label==='Stäng'&&state.svg&&!state.textClose,`${id} accessible top-right close ${viewport.width}x${viewport.height}: ${JSON.stringify(state)}`);
   if(['privacy-dialog','terminal','book-panel','cal-panel'].includes(id)&&viewport.width!==390)await page.screenshot({path:path.join(out,`${id}-${viewport.width}.png`)});
  }
 }
 // Reach the final privacy paragraph through the actual nested scroll containers.
 await page.evaluate(()=>{document.querySelectorAll('[role="dialog"],dialog,#stats').forEach(e=>{if(e instanceof HTMLDialogElement)e.close();else e.hidden=true;});document.getElementById('privacy-dialog').hidden=false;});
 await page.locator('#privacy-dialog .priv-scroll li').last().scrollIntoViewIfNeeded();
 check(await page.locator('#privacy-dialog .priv-scroll li').last().evaluate(e=>{const r=e.getBoundingClientRect(),c=e.closest('.dialog-card').getBoundingClientRect(),s=e.closest('.priv-scroll').getBoundingClientRect();return r.top>=Math.max(c.top,s.top)-1&&r.bottom<=Math.min(c.bottom,s.bottom,innerHeight)+1;}),'privacy scroll reaches final paragraph on narrow viewport');
 await page.screenshot({path:path.join(out,'privacy-final-paragraph-390.png')});
 await page.evaluate(()=>{document.getElementById('privacy-dialog').hidden=true;closeFixture.resetHome.ask();});
 await page.locator('#reset-confirm .dialog-close').focus();await page.keyboard.press('Enter');
 check(await page.evaluate(()=>document.getElementById('reset-confirm').hidden&&closeFixture.resetCalls===0),'keyboard Enter activates focused reset X without destructive action');
 check(errors.length===0,'no browser exceptions');
 const files=['index.html','src/main.js','src/dialogclose.css','src/hudicons.js','src/install.js','src/leaderboard.js','tools/dialogclosetest.cjs'];
 const hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,hashes,limitations:'Native index DOM/CSS, real icon/install/leaderboard modules and verbatim reset/drawing/privacy/Escape bindings. World/drawing effects bounded; no apartment rendering, production network or physical phone.'},null,2));
 console.log(`${checks.length} PASS`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
