#!/usr/bin/env node
// Native index DOM + actual production binding/submit listener + local Worker; apartment/WebGL suppressed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const kit=require('./testkit.cjs');
const game=process.argv[2]||'http://localhost:8874',worker=process.argv[3]||'http://localhost:8875',out=process.argv[4]||'/tmp/lunden-reports1041/browser';
const {loadSecretTestInputs,redact}=require('./secret-test-inputs.cjs');
const privateInputs=loadSecretTestInputs(),codes=privateInputs.codes;
if(![game,worker].every(value=>['localhost','127.0.0.1'].includes(new URL(value).hostname)))throw Error('This probe only runs on local fixture endpoints.');
const main=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
const captureFixture='data:image/jpeg;base64,'+fs.readFileSync(path.join(__dirname,'../textures/linjeteckning-sovrum1.jpg')).toString('base64');
const binding=main.slice(main.indexOf('const adminReports = new AdminReports('),main.indexOf("const editHelp = document.getElementById('rearrange-help')"));
const submitStart=main.indexOf("document.getElementById('terminal-form').addEventListener('submit', e => {");
const submit=main.slice(submitStart,main.indexOf('\n});',submitStart)+4);
// Execute the actual production callbacks, presentation and keyboard routing together.
const between=(start,end)=>{const a=main.indexOf(start);assert.ok(a>=0,start);const b=main.indexOf(end,a);assert.ok(b>a,end);return main.slice(a,b);};
const ui=between('function renderRearrangeHUD() {','// #1022: direct material selection');
const terminalFns=between('function exitRearranging() {',"terminal.addEventListener('click'");
const toggle=main.split('\n').find(line=>line.startsWith("editToggle.addEventListener('click'"));
const keyboardStart=main.indexOf("document.addEventListener('keydown', (e) => {\n  if (adminReports.reportPanel?.open)");
assert.ok(keyboardStart>=0,'actual modal-aware keyboard handler');
const keyboard=main.slice(keyboardStart,main.indexOf('\n}, true);',keyboardStart)+11);
const sourceHashes=Object.fromEntries(['index.html','src/adminreports.js','src/main.js','tools/adminreportstest.cjs'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')]));
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await kit.launch();const checks=[];
 try{
 const ctx=await browser.newContext({viewport:{width:844,height:390},permissions:['clipboard-read','clipboard-write']});
 const page=await ctx.newPage();await page.route('**/src/bootstrap.js',r=>r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function setup(){
  await page.goto(game+'/?cloud='+encodeURIComponent(worker));
  await page.evaluate(async({binding,submit,captureFixture,ui,terminalFns,toggle,keyboard})=>{
   document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;
   const terminal=document.getElementById('terminal'),terminalInput=document.getElementById('terminal-code');terminal.hidden=false;terminal.classList.add('chat');
   const {AdminReports}=await import('/src/adminreports.js');const {Rearrange}=await import('/src/rearrange.js');const T=await import('three');
   localStorage.setItem('lunden.furniture.unlocked','true');
   const scene=new T.Scene(),root=new T.Group();scene.add(root);
   const rearrange=new Rearrange({scene,camera:new T.PerspectiveCamera(),world:{furniture:{movable:[],object:root,surfaces:[],segments:[[],[]],footprints:[[],[]]},lamps:[],refreshFurniture(){}},player:{},life:{},carryables:()=>[],marks:{invalidate(){}},busy:()=>false},'');clearInterval(rearrange.timer);await rearrange.ready;
   const chat={sent:[],help:'/tysta namn — dölj chatt',command:()=>null,send(text){this.sent.push(text);return '';}};
   chat.available=true;chat.opened=on=>{chat.isOpen=on;};
   const {CHAT}=await import('/src/config.js');
   const reportCapture={capture:async()=>captureFixture};
   const {isCommand,runCheat}=await import('/src/cheats.js');
   const lifecycle=`
    const leaderboard={name:'Rapporttest'};
    const editHelp=document.getElementById('rearrange-help'),editToggle=document.getElementById('rearrange-toggle');
    let editMenuPiece=null,editMenuSurfaceId=null,resetFurnitureRequest=null,editHUDKey='';
    let reading=true,locked=false,binderFreed=false;
    const player={keys:new Set()},touch={analog:{x:0,y:0}},drawing={active:false};
    const canvas=document.createElement('canvas'),overlay=document.getElementById('overlay'),armEl=document.createElement('div');
    const active=()=>true,materialChoice=()=>null,renderMaterialLibrary=()=>{},requestFurnitureReset=()=>{};
    const life={flush(){}},cheats={};
    ${binding}
    ${ui}
    ${terminalFns}
    ${toggle}
    document.getElementById('terminal-close').addEventListener('click',()=>showTerminal(false));
    document.getElementById('rearrange-finish').addEventListener('click',exitRearranging);
    ${keyboard}
    ${submit}
    editUI();chatMode(true);
    return {reports:adminReports,rearrange,chat,showTerminal,exitRearranging,player,touch,get reading(){return reading;}};
   `;
   window.fixture=new Function('AdminReports','terminal','terminalInput','rearrange','chat','reportCapture','CHAT','isCommand','runCheat',lifecycle)(AdminReports,terminal,terminalInput,rearrange,chat,reportCapture,CHAT,isCommand,runCheat);
  },{binding,submit,captureFixture,ui,terminalFns,toggle,keyboard});
 }
 const check=(ok,name)=>{assert.ok(ok,name);checks.push(name);};
 const send=async text=>{await page.evaluate(()=>{if(document.getElementById('terminal').hidden)fixture.showTerminal(true);});await page.locator('#terminal-code').fill(text);await page.locator('#terminal-code').press('Enter');};
 const message=()=>page.locator('#terminal-message').textContent();
 const ready=()=>page.waitForFunction(()=>!fixture.reports.busy);
 await setup();
 check(await page.evaluate(()=>!fixture.rearrange.unlocked&&localStorage.getItem('lunden.furniture.unlocked')===null),'old persistent unlock retired, actual Rearrange starts locked');
 check(!await page.locator('#terminal-admin-menu').isVisible(),'no admin menu before successful code');
 check(await page.locator('#admin-open, #admin-logout').count()===0,'no public login/logout action rows');
 await send('/rapport private request');check((await message()).includes('adminkod'),'unauthenticated report refused locally');
 await send('ordinary chat');check(await page.evaluate(()=>fixture.chat.sent.length===1),'ordinary chat reaches original production submit listener');
 await send('help');check(!(await message()).includes('/admin')&&(await message()).includes('/tysta'),'public help preserves chat without advertising admin commands');
 await send('/admin');check(await page.locator('#admin-password').isVisible()&&await page.locator('#admin-password').getAttribute('type')==='password','admin opens optional masked code field');
 await page.screenshot({path:path.join(out,'admin-login-phone.png')});
 await page.setViewportSize({width:390,height:844});
 check(await page.locator('#terminal-form').evaluate(e=>e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().bottom<=innerHeight),'login controls fit portrait phone viewport');
 await page.screenshot({path:path.join(out,'admin-login-portrait.png')});
 await page.setViewportSize({width:844,height:390});
 let loginRequests=0;
 page.on('request',request=>{if(request.url()===worker+'/report-session')loginRequests++;});
 await page.evaluate(()=>{window.passwordConsoleSubmits=0;document.getElementById('terminal-form').addEventListener('submit',()=>window.passwordConsoleSubmits++);});
 await page.locator('#admin-password').fill('incorrect');await page.locator('#admin-password').press('Enter');await ready();
 check(loginRequests===1&&(await message()).includes('misslyckades')&&!await page.evaluate(()=>fixture.reports.active),'masked wrong-code Enter reaches actual API exactly once and stays unauthenticated');
 check(await page.locator('#admin-password').inputValue()===''&&await page.locator('#admin-password').isVisible(),'failed Enter clears secret but keeps masked login available');
 for(const key of ['Enter','NumpadEnter']){
  const before=loginRequests;
  await page.locator('#admin-password').fill(codes[0]);await page.locator('#admin-password').press(key);await ready();
  check(loginRequests===before+1&&await page.evaluate(()=>fixture.reports.active&&fixture.rearrange.unlocked&&!fixture.rearrange.enabled),'masked '+key+' authenticates exactly once without starting furniture mode');
  check(await page.locator('#admin-password').inputValue()===''&&!await page.locator('#admin-password').isVisible(),'masked '+key+' clears and closes login');
  check(await page.evaluate(()=>window.passwordConsoleSubmits===0&&fixture.chat.sent.length===1),'masked '+key+' never submits ordinary console or multiplayer chat');
  await page.screenshot({path:path.join(out,'masked-'+key+'-success.png')});
  await send('/loggaut');await send('/admin');
  await page.evaluate(()=>window.passwordConsoleSubmits=0);
 }
 await page.locator('#admin-password').fill('cancelled draft');await page.locator('#admin-password').press('Escape');
 check(await page.locator('#terminal').isHidden()&&await page.locator('#admin-password').inputValue()===''&&!await page.evaluate(()=>fixture.reports.active),'masked Escape still closes terminal and clears draft without login');
 await send('/admin');
 await page.locator('#admin-password').fill(codes[0]);await page.locator('#admin-signin').click();await ready();
 check(await page.evaluate(()=>fixture.reports.active&&fixture.rearrange.unlocked&&!fixture.rearrange.enabled),'actual changed callback grants access without activating rearrange');
 check(await page.locator('#admin-password').inputValue()==='','admin code field cleared');
 check(await page.locator('#terminal-admin-menu button:visible').allTextContents().then(labels=>JSON.stringify(labels)===JSON.stringify(['Rapportera','Möblera'])),'authenticated menu contains exact requested choices');
 check(await page.locator('#terminal-admin-menu').evaluate(e=>e.getBoundingClientRect().top>document.getElementById('terminal-code').getBoundingClientRect().bottom),'authenticated action buttons below ordinary chat input');
 await page.screenshot({path:path.join(out,'admin-menu-landscape.png')});
 await page.setViewportSize({width:1280,height:800});await page.screenshot({path:path.join(out,'admin-menu-desktop.png')});await page.setViewportSize({width:844,height:390});
 await page.evaluate(()=>document.getElementById('hud').hidden=false);
 await page.locator('#rearrange-toggle').click();
 check(await page.evaluate(()=>fixture.rearrange.enabled&&document.getElementById('terminal').hidden&&!fixture.reading),'actual furniture click starts enabled mode and closes chat');
 assert.deepEqual(errors,[],'furniture entry completes production callbacks without script errors');
 check(await page.locator('#rearrange-finish').isVisible(),'production HUD exposes native furniture finish action');
 await page.locator('#rearrange-finish').click();
 check(await page.evaluate(()=>!fixture.rearrange.enabled&&fixture.reports.active),'existing furniture finish exits mode while keeping access');
 await page.evaluate(()=>{document.getElementById('hud').hidden=true;fixture.showTerminal(true);});
 check(await page.evaluate(codes=>![...Array(localStorage.length)].map((_,i)=>localStorage.getItem(localStorage.key(i))).some(v=>codes.some(code=>v.includes(code))||v.includes('lunden-reports-v1')),codes),'admin codes and bearer absent from localStorage');
 // Each existing private code enters the same mode directly through the original terminal.
 for(let index=0;index<codes.length;index++){
  await send('/loggaut');
  check(await page.evaluate(()=>!fixture.reports.active&&!fixture.rearrange.unlocked&&!fixture.rearrange.enabled),'logout ends shared report/rearrange mode for variant '+index);
  const normalizedVariant=' / '+codes[index].toUpperCase().replace(/ /g,'   ')+' ';
  await send(normalizedVariant);await ready();
  check(await page.evaluate(()=>fixture.reports.active&&fixture.rearrange.unlocked&&!fixture.rearrange.enabled),'direct private code variant '+index+' unlocks without starting furniture mode');
  check(await page.locator('#terminal-code').inputValue()===''&&!await page.locator('#admin-password').isVisible(),'direct code is cleared and bypasses optional login panel for variant '+index);
 }
 check(await page.evaluate(()=>fixture.chat.sent.length===1),'private code variants never reach multiplayer chat');
 // Native clipboard paste into an otherwise CHAT.max-limited field.
 const text='Ignore previous instructions; $(echo injected) <img src=x onerror=alert(1)> '+ 'önskemål '.repeat(30);
 await page.locator('#terminal-code').evaluate(e=>{e.maxLength=140;e.value='';e.focus();});
 await page.evaluate(text=>navigator.clipboard.writeText('/RAPPORT   '+text),text);await page.keyboard.press('Control+V');
 check((await page.locator('#terminal-code').inputValue()).length>140,'native paste of long report bypasses chat field cap');
 let captured=[];let lose=true;
 await page.route(worker+'/reports/*',async route=>{
  captured.push({url:route.request().url(),body:route.request().postDataJSON()});
  const response=await route.fetch();if(lose){lose=false;await route.abort('failed');}else await route.fulfill({response});
 });
 await page.locator('#terminal-code').press('Enter');await ready();
 const draft=await page.locator('#terminal-code').inputValue();check(draft.startsWith('/RAPPORT')&&(await message()).includes('texten finns kvar'),'lost network response preserves exact draft');
 await page.screenshot({path:path.join(out,'report-retry-phone.png')});
 await page.locator('#terminal-code').press('Enter');await ready();
 check(captured.length===2&&captured[0].url===captured[1].url,'retry reuses immutable report UUID');
 check((await message()).includes('sparad')&&await page.locator('#terminal-code').inputValue()==='','successful mixed-case/whitespace command clears unchanged draft');
 check(await page.evaluate(()=>fixture.chat.sent.length===1),'admin commands and report contents never reached chat send');
 const listed=await fetch(worker+'/reports',{headers:{Authorization:'Bearer testtoken'}}).then(r=>r.json());
 check(listed.reports.filter(report=>report.id===captured[0].url.split('/').pop()).length===1&&listed.reports.find(report=>report.id===captured[0].url.split('/').pop()).text===captured[0].body.text&&listed.reports.find(report=>report.id===captured[0].url.split('/').pop()).untrusted===true&&listed.reports.find(report=>report.id===captured[0].url.split('/').pop()).playerName==='Rapporttest','actual Worker stores exact injection-shaped text and player name once as untrusted data');
 await page.screenshot({path:path.join(out,'report-saved-phone.png')});
 await page.unroute(worker+'/reports/*');
 await page.locator('#terminal-code').fill('Unsent ordinary chat');
 await page.locator('#admin-report-open').click();
 check(await page.locator('#admin-report').evaluate(e=>e.open&&e.matches(':modal')&&!document.getElementById('terminal-form').contains(e)),'report button opens genuine native modal outside chat form');
 check(await page.locator('#admin-report-text').evaluate(e=>document.activeElement===e),'report popup focuses its textarea');
 await page.locator('#admin-report-text').press('Escape');
 check(!await page.locator('#admin-report').isVisible()&&await page.locator('#terminal').isVisible()&&await page.locator('#terminal-code').inputValue()==='Unsent ordinary chat','actual production Escape handler closes popup only and preserves unsent chat');
 check(await page.locator('#admin-report-open').evaluate(e=>document.activeElement===e),'closing popup returns focus to report action');
 await page.locator('#admin-report-open').click();
 await page.locator('#admin-report-text').press('KeyW');
 check(await page.evaluate(()=>fixture.reading&&fixture.player.keys.size===0&&fixture.touch.analog.x===0),'popup typing keeps movement suspended');
 for(let i=0;i<5;i++)await page.keyboard.press('Tab');
 check(await page.locator('#admin-report').evaluate(e=>e.contains(document.activeElement)),'native modal keeps keyboard focus inside popup');
 check(await page.locator('#terminal-admin-menu').evaluate(e=>e.getBoundingClientRect().top>document.getElementById('terminal-code').getBoundingClientRect().bottom),'admin menu is below ordinary console input');
 await page.locator('#admin-report-text').fill('Report panel retry');
 await page.evaluate(()=>{fixture.reports.capture=async()=>{throw Error('fixture capture failed');};});
 await page.locator('#admin-report-send').click();await ready();
 check(await page.locator('#admin-report-text').inputValue()==='Report panel retry'&&(await message()).includes('bilden'),'capture failure preserves separate report draft');
 await page.evaluate(image=>{fixture.reports.capture=async()=>image;},captureFixture);
 const panelRequests=[];let panelLose=true;
 await page.route(worker+'/reports/*',async route=>{
  panelRequests.push({url:route.request().url(),body:route.request().postDataJSON()});
  const response=await route.fetch();if(panelLose){panelLose=false;await route.abort('failed');}else await route.fulfill({response});
 });
 await page.locator('#admin-report-send').click();await ready();
 check(await page.locator('#admin-report-text').inputValue()==='Report panel retry','network failure preserves separate report draft');
 await page.screenshot({path:path.join(out,'report-popup-landscape.png')});
 await page.setViewportSize({width:1280,height:800});
 await page.screenshot({path:path.join(out,'report-popup-desktop.png')});
 await page.locator('#admin-report-send').click();await ready();
 check(panelRequests.length===2&&panelRequests[0].url===panelRequests[1].url&&panelRequests[0].body.image===panelRequests[1].body.image,'button retry reuses UUID and image');
 check(await page.locator('#admin-report-text').inputValue()===''&&(await page.locator('#admin-report-status').textContent()).includes('sparad'),'successful button submission clears unchanged report draft and shows status inside popup');
 await page.unroute(worker+'/reports/*');
 let releasePanel, panelArrived;const atPanel=new Promise(r=>panelArrived=r);
 await page.route(worker+'/reports/*',async route=>{const response=await route.fetch();panelArrived();await new Promise(r=>releasePanel=r);await route.fulfill({response});});
 await page.locator('#admin-report-text').fill('Initial button draft');await page.locator('#admin-report-send').click();await atPanel;
 await page.locator('#admin-report-text').fill('New draft while sending');releasePanel();await ready();
 check(await page.locator('#admin-report-text').inputValue()==='New draft while sending','in-flight edits to report panel survive successful previous request');
 check(await page.evaluate(()=>fixture.chat.sent.length===1),'button report prose never reaches ordinary chat');
 await page.unroute(worker+'/reports/*');
 await page.locator('#admin-report-cancel').click();
 check(await page.locator('#terminal-code').inputValue()==='Unsent ordinary chat','closing popup preserves normal chat input across failed and successful reports');
 await send('/loggaut');
 check(!await page.locator('#terminal-admin-menu').isVisible(),'logout hides both authenticated actions');
 await page.setViewportSize({width:844,height:390});
 await page.reload();await setup();check(await page.evaluate(()=>!fixture.reports.active&&!fixture.rearrange.unlocked),'actual browser reload loses report session and furniture permission');
 // Delay a real login response. Logout must win, including a response already received by the network.
 let release,arrived;const atNetwork=new Promise(r=>arrived=r);
 await page.route(worker+'/report-session',async route=>{const response=await route.fetch();arrived();await new Promise(r=>release=r);await route.fulfill({response}).catch(()=>{});});
 await send(codes[1]);await atNetwork;
 check(await page.locator('#terminal-code').inputValue()===''&&!await page.locator('#admin-password').isVisible(),'direct code clears immediately before delayed login response');
 await send('/loggaut');release();await page.waitForTimeout(100);
 check(await page.evaluate(()=>!fixture.reports.active&&!fixture.rearrange.unlocked),'logout wins over delayed successful login response');
 await page.unroute(worker+'/report-session');
 let releaseHide,arrivedHide;const atHide=new Promise(r=>arrivedHide=r);
 await page.route(worker+'/report-session',async route=>{const response=await route.fetch();arrivedHide();await new Promise(r=>releaseHide=r);await route.fulfill({response}).catch(()=>{});});
 await send('/admin');await page.locator('#admin-password').fill(codes[0]);await page.locator('#admin-signin').click();await atHide;
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));releaseHide();await page.waitForTimeout(100);
 check(await page.evaluate(()=>!fixture.reports.active&&!fixture.rearrange.unlocked),'pagehide wins over delayed successful login response');
 await page.unroute(worker+'/report-session');
 // A short, otherwise real server session exercises the shared expiry callback.
 await page.route(worker+'/report-session',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({response,json:{...data,expires:Date.now()+1500}});});
 await send(codes[0]);await ready();
 await page.locator('#admin-report-open').click();await page.locator('#admin-report-text').fill('Draft survives session expiry');
 await page.waitForFunction(()=>!fixture.reports.active&&!fixture.rearrange.unlocked&&!fixture.rearrange.enabled&&document.getElementById('terminal-message').textContent.includes('gått ut'));
 check(!await page.locator('#terminal-admin-menu').isVisible()&&!await page.locator('#admin-report').isVisible()&&await page.locator('#admin-report-text').inputValue()==='Draft survives session expiry','expiry closes popup, hides both choices and preserves report draft');
 await page.unroute(worker+'/report-session');
 check(await page.evaluate(async()=>{
  const {AdminReports}=await import('/src/adminreports.js');
  const fields=Object.fromEntries(['form','input','message','panel','password','login','cancel'].map(k=>[k,document.createElement(k==='form'?'form':'input')]));
  const unsafe=new AdminReports(fields,'https://attacker.invalid');fields.password.value='fixture';await unsafe.signIn();
  return unsafe.url===''&&!unsafe.active&&fields.password.value==='';
 }),'cloud query override cannot receive the admin code');
 check(errors.length===0,'no browser script errors');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,sourceHashes,limitations:'Native terminal/API, actual source-bound changed callback, editUI/showTerminal/chatMode/furniture-click/Escape handler and real Rearrange; image capture and world collaborators bounded; no apartment/WebGL/physical phone or production report'},null,2));
 console.log(`${checks.length} PASS`);
 }finally{await browser.close();}
})().catch(e=>{let safe=redact(e.stack||e.message,privateInputs);for(const code of codes){safe=safe.split(code.toUpperCase()).join('[private input]').split(code.toUpperCase().replace(/ /g,'   ')).join('[private input]');}console.error(safe);process.exitCode=1;});
