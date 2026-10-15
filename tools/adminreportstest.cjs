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
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await kit.launch();const checks=[];
 try{
 const ctx=await browser.newContext({viewport:{width:844,height:390},permissions:['clipboard-read','clipboard-write']});
 const page=await ctx.newPage();await page.route('**/src/bootstrap.js',r=>r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function setup(){
  await page.goto(game+'/?cloud='+encodeURIComponent(worker));
  await page.evaluate(async({binding,submit,captureFixture})=>{
   document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;
   const terminal=document.getElementById('terminal'),terminalInput=document.getElementById('terminal-code');terminal.hidden=false;terminal.classList.add('chat');
   const {AdminReports}=await import('/src/adminreports.js');const {Rearrange}=await import('/src/rearrange.js');const T=await import('three');
   localStorage.setItem('lunden.furniture.unlocked','true');
   const scene=new T.Scene(),root=new T.Group();scene.add(root);
   const rearrange=new Rearrange({scene,camera:new T.PerspectiveCamera(),world:{furniture:{movable:[],object:root,surfaces:[],segments:[[],[]],footprints:[[],[]]},lamps:[],refreshFurniture(){}},player:{},life:{},carryables:()=>[],marks:{invalidate(){}},busy:()=>false},'');clearInterval(rearrange.timer);await rearrange.ready;
   const chat={sent:[],help:'/tysta namn — dölj chatt',command:()=>null,send(text){this.sent.push(text);return '';}};
   const editUI=()=>{document.getElementById('rearrange-toggle').hidden=!rearrange.unlocked;document.getElementById('terminal-title').textContent=rearrange.unlocked?'Adminläge':'Chatt';};
   // This DOM/protocol fixture injects an explicit valid image collaborator; reportcapturetest proves real pixels separately.
   const reportCapture={capture:async()=>captureFixture};
   const reports=new Function('AdminReports','terminal','terminalInput','rearrange','editUI','chat','reportCapture',binding+'\nreturn adminReports;')(AdminReports,terminal,terminalInput,rearrange,editUI,chat,reportCapture);
   const {isCommand,runCheat}=await import('/src/cheats.js');
   new Function('terminal','terminalInput','chat','isCommand','runCheat','cheats','life','showTerminal',submit)(terminal,terminalInput,chat,isCommand,runCheat,{}, {flush(){}},()=>{});
   window.fixture={reports,rearrange,chat};
  },{binding,submit,captureFixture});
 }
 const check=(ok,name)=>{assert.ok(ok,name);checks.push(name);};
 const send=async text=>{await page.locator('#terminal-code').fill(text);await page.locator('#terminal-code').press('Enter');};
 const message=()=>page.locator('#terminal-message').textContent();
 const ready=()=>page.waitForFunction(()=>!fixture.reports.busy);
 await setup();
 check(await page.evaluate(()=>!fixture.rearrange.unlocked&&localStorage.getItem('lunden.furniture.unlocked')===null),'old persistent unlock retired, actual Rearrange starts locked');
 await send('/rapport private request');check((await message()).includes('/admin'),'unauthenticated report refused locally');
 await send('ordinary chat');check(await page.evaluate(()=>fixture.chat.sent.length===1),'ordinary chat reaches original production submit listener');
 await send('help');check((await message()).includes('/admin')&&(await message()).includes('/tysta'),'help discovers admin and preserves chat commands');
 await send('/admin');check(await page.locator('#admin-password').isVisible()&&await page.locator('#admin-password').getAttribute('type')==='password','admin opens optional masked code field');
 await page.screenshot({path:path.join(out,'admin-login-phone.png')});
 await page.setViewportSize({width:390,height:844});
 check(await page.locator('#terminal-form').evaluate(e=>e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().bottom<=innerHeight),'login controls fit portrait phone viewport');
 await page.screenshot({path:path.join(out,'admin-login-portrait.png')});
 await page.setViewportSize({width:844,height:390});
 await page.locator('#admin-password').fill('incorrect');await page.locator('#admin-signin').click();await ready();check((await message()).includes('misslyckades'),'wrong admin code refused by actual API');
 await page.locator('#admin-password').fill(codes[0]);await page.locator('#admin-password').press('Enter');await ready();
 check(await page.evaluate(()=>fixture.reports.active&&fixture.rearrange.unlocked&&fixture.rearrange.enabled),'one code session grants reporting and active rearrange mode together');
 check(await page.locator('#admin-password').inputValue()==='','admin code field cleared');
 check(await page.evaluate(codes=>![...Array(localStorage.length)].map((_,i)=>localStorage.getItem(localStorage.key(i))).some(v=>codes.some(code=>v.includes(code))||v.includes('lunden-reports-v1')),codes),'admin codes and bearer absent from localStorage');
 // Each existing private code enters the same mode directly through the original terminal.
 for(let index=0;index<codes.length;index++){
  await send('/loggaut');
  check(await page.evaluate(()=>!fixture.reports.active&&!fixture.rearrange.unlocked&&!fixture.rearrange.enabled),'logout ends shared report/rearrange mode for variant '+index);
  const normalizedVariant=' / '+codes[index].toUpperCase().replace(/ /g,'   ')+' ';
  await send(normalizedVariant);await ready();
  check(await page.evaluate(()=>fixture.reports.active&&fixture.rearrange.unlocked&&fixture.rearrange.enabled),'direct private code variant '+index+' activates both capabilities');
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
 check(listed.reports.filter(report=>report.id===captured[0].url.split('/').pop()).length===1&&listed.reports.find(report=>report.id===captured[0].url.split('/').pop()).text===captured[0].body.text&&listed.reports.find(report=>report.id===captured[0].url.split('/').pop()).untrusted===true,'actual Worker stores exact injection-shaped text once as untrusted data');
 await page.screenshot({path:path.join(out,'report-saved-phone.png')});
 await page.unroute(worker+'/reports/*');
 await page.locator('#admin-report-open').click();
 check(await page.locator('#admin-report-text').isVisible(),'report button opens separate prose field without slash');
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
 await page.screenshot({path:path.join(out,'admin-menu-landscape.png')});
 await page.setViewportSize({width:1280,height:800});
 await page.screenshot({path:path.join(out,'admin-menu-desktop.png')});
 await page.locator('#admin-report-send').click();await ready();
 check(panelRequests.length===2&&panelRequests[0].url===panelRequests[1].url&&panelRequests[0].body.image===panelRequests[1].body.image,'button retry reuses UUID and image');
 check(await page.locator('#admin-report-text').inputValue()==='','successful button submission clears unchanged report draft');
 await page.unroute(worker+'/reports/*');
 let releasePanel, panelArrived;const atPanel=new Promise(r=>panelArrived=r);
 await page.route(worker+'/reports/*',async route=>{const response=await route.fetch();panelArrived();await new Promise(r=>releasePanel=r);await route.fulfill({response});});
 await page.locator('#admin-report-text').fill('Initial button draft');await page.locator('#admin-report-send').click();await atPanel;
 await page.locator('#admin-report-text').fill('New draft while sending');releasePanel();await ready();
 check(await page.locator('#admin-report-text').inputValue()==='New draft while sending','in-flight edits to report panel survive successful previous request');
 check(await page.evaluate(()=>fixture.chat.sent.length===1),'button report prose never reaches ordinary chat');
 await page.unroute(worker+'/reports/*');
 await page.locator('#admin-logout').click();await page.locator('#admin-report-open').click();
 check(await page.locator('#admin-password').isVisible()&&!await page.locator('#admin-report-text').isVisible(),'report button requires existing masked authentication');
 await page.locator('#admin-password').fill(codes[0]);await page.locator('#admin-signin').click();await ready();
 check(await page.locator('#admin-report-text').isVisible(),'successful report-button login opens report draft');
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
 await page.route(worker+'/report-session',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({response,json:{...data,expires:Date.now()+150}});});
 await send(codes[0]);await ready();
 await page.waitForFunction(()=>!fixture.reports.active&&!fixture.rearrange.unlocked&&!fixture.rearrange.enabled&&document.getElementById('terminal-message').textContent.includes('gått ut'));
 check(true,'expiry ends reporting and rearrange mode together');
 await page.unroute(worker+'/report-session');
 check(await page.evaluate(async()=>{
  const {AdminReports}=await import('/src/adminreports.js');
  const fields=Object.fromEntries(['form','input','message','panel','password','login','cancel'].map(k=>[k,document.createElement(k==='form'?'form':'input')]));
  const unsafe=new AdminReports(fields,'https://attacker.invalid');fields.password.value='fixture';await unsafe.signIn();
  return unsafe.url===''&&!unsafe.active&&fields.password.value==='';
 }),'cloud query override cannot receive the admin code');
 check(errors.length===0,'no browser script errors');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,limitations:'Native terminal/API probe; no apartment/WebGL or production report'},null,2));
 console.log(`${checks.length} PASS`);
 }finally{await browser.close();}
})().catch(e=>{let safe=redact(e.stack||e.message,privateInputs);for(const code of codes){safe=safe.split(code.toUpperCase()).join('[private input]').split(code.toUpperCase().replace(/ /g,'   ')).join('[private input]');}console.error(safe);process.exitCode=1;});
