// #886: original index UI and complete production input/panel blocks; actual pointer lock, no apartment/WebGL.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const game=process.argv[2]||'http://localhost:8876',out=process.argv[3]||'/tmp/lunden-statspanel',before=process.argv.includes('--before');
const root=path.resolve(__dirname,'..'),read=p=>before?execFileSync('git',['show','b2efbc5:'+p],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,p),'utf8');
const source=read('src/main.js'),html=read('index.html');
function span(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);if(a<0||b<0||source.indexOf(start,a+1)>=0)throw Error('ambiguous source anchor '+start);return source.slice(a,b).trim();}
const parts={active:span('const active =','\n\nfunction look'),start:span('function startMouse() {','// Esc on the start screen'),
 arm:span(before?"armEl.addEventListener('click'":"armEl.addEventListener('keydown'",'// refused (Chrome'),touchStart:span("document.getElementById('start-touch').addEventListener","document.getElementById('start-go').addEventListener"),error:span("document.addEventListener('pointerlockerror'","document.getElementById('start-touch').addEventListener"),
 lock:span("document.addEventListener('pointerlockchange', () => {\n  const wasLocked",'/**\n * A mouse click'),
 click:span('function click(button) {',"document.addEventListener('contextmenu'"),
 wheel:span(before?"document.addEventListener('wheel', (e) => { if (locked && !reading":"document.addEventListener('wheel', (e) => { if (locked && !statsOpen && !reading",'\n\n'),
 keyboard:span("document.addEventListener('keydown', (e) => {\n  if (!locked", "window.addEventListener('blur'"),
 stats:span('let mapPinned = false;','\nrenderStats(statsBody);\nsetInterval')};
let failures=0;const lines=[];const check=(ok,label)=>{lines.push(`${ok?'PASS':'FAIL'} ${label}`);console.log(lines.at(-1));if(!ok)failures++;};
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-gpu']});const errors=[];
try{const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:false});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.route(game+'/',r=>r.fulfill({contentType:'text/html',body:html}));await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// intentionally no apartment bootstrap'}));
await page.goto(game);await page.evaluate(async({parts,before})=>{
 const T=await import('three'),{Player}=await import('/src/player.js'),{setupTouch}=await import('/src/touch.js'),S=await import('/src/stats.js'),{StatsPanel}=await import('/src/statspanel.js');Object.assign(window,{StatsPanel,S,PLAYER:(await import('/src/config.js')).PLAYER});(await import('/src/hudicons.js')).initHudIcons();
 window.player=new Player({size:{x:5.75,z:12.1},levels:[{segments:[],footprints:[]},{segments:[],footprints:[]}],doors:[]},new T.PerspectiveCamera());player.spawn(2,-10,0);
 // This newly-created browser context owns its own statistics; no real visitor data can be read or reset.
 S.stats.target=123;S.stats.cats=37;S.stats.byVariant=Object.fromEntries(Array.from({length:100},(_,i)=>['Isolerad testkatt '+i,1]));
 window.renderStats=S.renderStats;window.resetStats=S.resetStats;window.statsEl=document.getElementById('stats');window.statsBody=document.getElementById('stats-body');window.armEl=document.getElementById('arm');window.overlay=document.getElementById('overlay');window.hud=document.getElementById('hud');
 window.effects={fire:0,focus:0,choice:0,look:0,reset:0};window.canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;background:#3d5762';document.body.prepend(canvas);
 window.locked=false;window.statsOpen=false;window.statsFreed=false;window.statsPinned=false;window.activeMode='mouse';window.lastPointerType='mouse';window.unlockedAt=-Infinity;window.startClickAt=-Infinity;window.lockRetried=false;
 window.initAudio=()=>{};window.isPhoneDevice=()=>false;window.showOverlay=show=>{overlay.hidden=!show;hud.hidden=show;};window.look=()=>effects.look++;
 window.touch=setupTouch({onLook:()=>effects.look++});window.held={clickIsUse:true,firing:false,trigger(on){this.firing=on;if(on)effects.fire++;}};window.heldItem=()=>held;
 window.focused={kind:'fixture'};window.use=()=>effects.focus++;window.weaponKey=()=> 'rifle';window.jetpack={dropTarget:{}};window.suit={dropTarget:{}};
 window.reading=false;window.boardFreed=false;window.drawing={active:false};window.onEditPointerUnlock=()=>{};window.showNote=()=>{};window.book={reading:false};window.rest={active:false};window.power={release(){}};
 window.choices={rows:[1]};window.moveChoice=()=>{effects.choice++;return true;};window.runChoice=()=>{effects.choice++;return true;};window.stripKeys=new Set();window.isCtrl=k=>k==='ControlLeft'||k==='ControlRight';
 window.clockPanel={open:false};window.blindPanel={open:false};window.sonos={open:false};window.calPanel={open:false};window.viewing=false;
 window.tasks={reset(){effects.reset++;}};document.getElementById('loading').hidden=true;document.getElementById('arm').hidden=true;
 const code=Object.values(parts).join('\n');(0,eval)(code+'\nwindow.fns={active,showStats,toggleStats,holdStats};');
 window.tick=()=>{if(fns.active()){player.analog.x=touch.analog.x;player.analog.y=touch.analog.y;player.update(1/30);}};
 S.renderStats(statsBody);
 },{parts,before});
await page.locator('#start-mouse').click();await page.waitForFunction(()=>document.pointerLockElement===canvas&&locked,null,{timeout:5000,polling:50});check(true,'genuine browser pointer lock acquired on the original mouse-start button');
await page.keyboard.down('w');await page.evaluate(()=>tick());await page.keyboard.up('w');const pos=await page.evaluate(()=>player.pos.toArray());
await page.evaluate(()=>held.trigger(true));const firing=await page.evaluate(()=>effects.fire);
await page.keyboard.down('Tab');await page.waitForFunction(()=>!statsEl.hidden,null,{timeout:1000,polling:50});
if(!before)await page.waitForFunction(()=>!document.pointerLockElement,null,{timeout:1000,polling:50});
check(await page.evaluate(()=>!document.pointerLockElement&&overlay.hidden&&!statsEl.hidden),'Tab opens the original panel with free mouse and no pause-menu cover');
const prior=await page.evaluate(()=>({scroll:statsBody.scrollTop,choice:effects.choice,fire:effects.fire}));await page.mouse.move(350,220);await page.mouse.wheel(0,700);await page.waitForTimeout(150);
check(await page.evaluate(p=>statsBody.scrollTop>p.scroll&&effects.choice===p.choice,prior),'real mouse wheel scrolls long statistics without changing a focus action');
check(await page.evaluate(n=>!held.firing&&effects.fire===n,firing),'opening statistics releases an already-held automatic trigger');
if(before){await page.screenshot({path:out+'/before.png'});}else{
 await page.keyboard.press('End');check(await page.evaluate(()=>statsBody.scrollTop>0),'keyboard End reaches the long panel contents');
 await page.keyboard.press('Home');check(await page.evaluate(()=>statsBody.scrollTop===0),'keyboard Home returns to the top');
 await page.keyboard.press('PageDown');check(await page.evaluate(()=>statsBody.scrollTop>0),'keyboard PageDown scrolls the focused panel');
 const input=await page.evaluate(()=>({...effects,pos:player.pos.toArray()}));await page.keyboard.press('w');await page.keyboard.press('e');await page.keyboard.press('Digit1');await page.evaluate(()=>tick());
 check(await page.evaluate(s=>player.keys.size===0&&effects.fire===s.fire&&effects.focus===s.focus&&effects.choice===s.choice&&JSON.stringify(player.pos.toArray())===JSON.stringify(s.pos),input),'panel keyboard causes no movement, shooting or focus action behind it');
 await page.screenshot({path:out+'/held.png'});
 await page.keyboard.up('Tab');check(await page.evaluate(()=>statsEl.hidden&&!armEl.hidden&&overlay.hidden),'Tab release closes a temporary panel and exposes explicit mouse return');
 await page.locator('#arm').click();await page.waitForFunction(()=>locked,null,{timeout:5000,polling:50});check(await page.evaluate(s=>effects.fire===s.fire,input),'the return click reacquires real lock without shooting');
 await page.keyboard.down('Tab');await page.waitForFunction(()=>!document.pointerLockElement&&!statsEl.hidden,null,{timeout:1000,polling:50});await page.locator('#stats-close').click();await page.keyboard.up('Tab');check(await page.evaluate(()=>statsEl.hidden&&!armEl.hidden),'genuine close-button click works while Tab is still held');await page.keyboard.press('Enter');await page.waitForFunction(()=>locked,null,{timeout:5000,polling:50});
 await page.keyboard.press('t');await page.waitForFunction(()=>!document.pointerLockElement&&!statsEl.hidden,null,{timeout:1000,polling:50});
 await page.keyboard.press('Tab');check(await page.evaluate(()=>document.activeElement.id==='stats-close'&&!statsEl.hidden),'pinned T panel allows Tab focus navigation rather than closing on keyup');
 await page.keyboard.press('Shift+Tab');check(await page.evaluate(()=>document.activeElement===statsBody),'Shift-Tab returns keyboard focus to scrollable contents');
 await page.locator('#stats-close').click();check(await page.evaluate(()=>statsEl.hidden&&!armEl.hidden),'genuine original close-button click closes the pinned panel');
 await page.keyboard.press('Enter');await page.waitForFunction(()=>locked,null,{timeout:5000,polling:50});check(true,'Enter on the focused return affordance reacquires genuine pointer lock');
 await page.keyboard.press('t');await page.waitForFunction(()=>!document.pointerLockElement,null,{timeout:1000,polling:50});await page.keyboard.press('t');check(await page.evaluate(()=>statsEl.hidden&&!armEl.hidden),'T toggles its pinned panel closed with explicit return');
 await page.locator('#arm').click();await page.waitForFunction(()=>locked,null,{timeout:5000,polling:50});await page.keyboard.press('t');await page.waitForFunction(()=>!document.pointerLockElement,null,{timeout:1000,polling:50});await page.keyboard.press('Escape');check(await page.evaluate(()=>statsEl.hidden&&!armEl.hidden),'Escape closes statistics instead of controlling the game');
 // Touch uses the real controller and original UI, with no renderer/fullscreen substitution.
 await page.evaluate(()=>{touch.enabled=true;activeMode='touch';document.body.classList.add('touch');armEl.hidden=true;});const touchSession=await page.context().newCDPSession(page);await touchSession.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 const tap=async selector=>{const b=await page.locator(selector).boundingBox();if(!b)throw Error('native touch target not visible');const point={x:b.x+b.width/2,y:b.y+b.height/2};await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await page.evaluate(()=>{window.touchEvents=[];for(const k of ['pointerdown','pointerup','click'])document.addEventListener(k,e=>touchEvents.push({type:k,target:e.target.id,x:e.clientX,y:e.clientY}),true);});
 await tap('#stats-btn');await page.waitForFunction(()=>!statsEl.hidden,null,{timeout:1500,polling:50}).catch(async e=>{await page.screenshot({path:out+'/touch-debug.png'});console.log(await page.evaluate(()=>({events:touchEvents,hudHidden:hud.hidden,statsHidden:statsEl.hidden,armHidden:armEl.hidden,overlayHidden:overlay.hidden,bodyClass:document.body.className,lock:!!document.pointerLockElement})));throw e;});
 check(await page.evaluate(()=>!statsEl.hidden&&touch.enabled&&!fns.active()),'original touch statistics button opens an input-isolated panel');
 await page.evaluate(()=>statsBody.scrollTop=0);const box=await page.locator('#stats-body').boundingBox(),cdp=await page.context().newCDPSession(page);const x=box.x+box.width*.5,y=box.y+box.height*.8;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*18}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>statsBody.scrollTop>0,null,{timeout:1500,polling:50});check(await page.evaluate(()=>touch.analog.x===0&&touch.analog.y===0),'genuine touch drag scrolls statistics without creating joystick input');
 await page.screenshot({path:out+'/touch.png'});
 // Native touch scrolling has inertia; wait for its measured scroll position to settle before tapping.
 await page.waitForFunction(()=>{const n=statsBody.scrollTop;if(window.lastTouchScroll===n)window.touchSettled=(window.touchSettled||0)+1;else window.touchSettled=0;window.lastTouchScroll=n;return window.touchSettled>=3;},null,{timeout:3000,polling:50});
 await tap('#stats-close');await page.waitForFunction(()=>statsEl.hidden,null,{timeout:1500,polling:50});check(await page.evaluate(()=>statsEl.hidden&&touch.enabled&&fns.active()),'original touch close button resumes the existing touch mode');
 for(const key of ['Enter','Space']) {
  await page.evaluate(()=>{touch.enabled=false;armEl.hidden=false;statsFreed=false;document.getElementById('arm-touch').focus();});
  await page.keyboard.press(key);await page.waitForFunction(()=>touch.enabled&&armEl.hidden,null,{timeout:1500,polling:50});
  check(await page.evaluate(()=>activeMode==='touch'&&!document.pointerLockElement),'native Touch child-button '+key+' activation preserves touch mode without mouse lock');
  await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
 }
 // Existing menu reset dialog is dismissed in this isolated context; no visitor data or reset behavior changes.
 await page.evaluate(()=>{touch.enabled=false;armEl.hidden=true;showOverlay(true);for(const d of document.querySelectorAll('details'))d.open=true;});let dialogs=0;page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});await page.locator('#stats-reset').click();
 check(dialogs===1&&await page.evaluate(()=>S.stats.target===123&&S.stats.cats===37&&effects.reset===0),'existing menu reset confirmation remains usable and cancellation preserves isolated statistics');
}
check(errors.length===0,'no native page errors');fs.writeFileSync(out+'/result.json',JSON.stringify({before,lines,failures,errors,source:{main:crypto.createHash('sha256').update(source).digest('hex'),index:crypto.createHash('sha256').update(html).digest('hex'),parts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')]))},scope:'Original DOM/CSS, genuine pointer lock/touch gestures, complete verbatim main blocks, real StatsPanel/Player/touch/statistics; controlled world/weapon collaborators, no apartment/WebGL/real visitor statistics'},null,2));
}finally{await browser.close();}console.log(failures?'SOME FAILED':'ALL PASS');process.exitCode=failures?1:0;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
