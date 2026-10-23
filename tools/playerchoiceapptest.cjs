// #1405: the real World, real input. A raw socket peer stands 1.1 m away through the local Worker; aiming at it shows the
// choice menu: two rows (Hälsa, Krama) for an ordinary pair, three (… Pussa) for Sarah/Olof. E / the first touch button
// greets (never a hug or kiss), the hug row sends a hug the room accepts (pose on the peer's avatar), and for the pair the
// kiss row still kisses with +100 love. Args: GAME WORKER OUT; env ME, PEER (names), TOUCH=1 for 844×390 touch.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs');
const [base='http://localhost:8148',worker='http://localhost:8149',out='/tmp/choice-app']=process.argv.slice(2);
const me=process.env.ME||'Bertil test',peer=process.env.PEER||'Anna test',mobile=process.env.TOUCH==='1',tag=(mobile?'touch':'desktop');
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1000,height:700},hasTouch:mobile}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(n=>{localStorage.setItem('lunden.name',n);sessionStorage.setItem('lunden.nameSkipped','1');},me);
await page.goto(`${base}/?shot&quality=3&time=12&month=7&freeze&cloud=${encodeURIComponent(worker)}`,{waitUntil:'commit'});await page.waitForFunction(()=>window.__app?.renderer&&window.__ghosts,null,{timeout:600000});
await page.evaluate(()=>__app.showOverlay(true));if(mobile)await page.locator('#start-go').tap();else await page.locator('#start-mouse').click();
await page.waitForFunction(m=>m?__app.touch.enabled:document.pointerLockElement===__app.renderer.domElement,mobile);
const setup=await page.evaluate(async([worker,peer])=>{const a=window.__app,G=window.__ghosts;a.showOverlay(false);if(a.rest.active)a.standUp();a.renderer.setAnimationLoop(null);a.player.spawn(-28.85,22.7,0);for(let i=0;i<60;i++)a.player.update(1/60);
 const render=a.renderer.render;a.renderer.render=()=>{};const sleep=ms=>new Promise(r=>setTimeout(r,ms));let loop=setInterval(()=>{a.step(.016);G.update(.016);},40);
 const p=[a.player.pos.x,a.player.pos.y,a.player.pos.z-1.1],ws=new WebSocket(worker.replace(/^http/,'ws')+'/players?n='+encodeURIComponent(peer));let id;const got=[];ws.onmessage=e=>{if(e.data==='q')return;const m=JSON.parse(e.data);got.push(m);if(m.t==='w'){id=m.i;ws.send(JSON.stringify({p,r:Math.PI}));}};
 for(let i=0;i<200;i++){if(G.connected&&id&&G.others.get(id)?.have)break;await sleep(50);}clearInterval(loop);const g=G.others.get(id);if(!g?.have)throw Error('peer did not send a valid state');
 const aim=()=>{a.scene.updateMatrixWorld(true);const d=g.root.position.clone().add(new a.camera.position.constructor(0,1.2,0)).sub(a.camera.position);a.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');const t=a.touch.enabled;a.touch.enabled=true;a.step(0);a.step(0);a.touch.enabled=t;a.choices.target=null;a.step(0);};
 const frame=()=>{a.renderer.render=render;a.renderer.render(a.scene,a.camera);a.renderer.render=()=>{};};
 const run=async n=>{for(let i=0;i<n;i++){await sleep(80);a.step(.05);G.update(.05);}};
 let reaches=0;const reach=a.hand.reach;a.hand.reach=(...args)=>{reaches++;return reach.apply(a.hand,args);};
 window.C={a,G,g,ws,got,aim,frame,run,sleep,get reaches(){return reaches;}};aim();frame();
 const buttons=[...document.querySelectorAll('#choices button')].map(b=>b.textContent);
 return{kind:a.focus().focused?.kind,buttons,menuHidden:document.getElementById('choices').hidden,actionHidden:document.getElementById('action').hidden,sel:a.choices.sel};},[worker,peer]);
await page.screenshot({path:`${out}/menu-${tag}.png`});
const press=async label=>{if(mobile)await page.locator('#choices button',{hasText:label}).first().tap();else if(label==='E')await page.keyboard.press('e');else await page.keyboard.press(String(setup.buttons.findIndex(t=>t.includes(label))+1));};
// E (desktop) / the Hälsa button (touch): an ordinary greeting, never a hug or kiss
await press(mobile?'Hälsa':'E');
const greetPhase=await page.evaluate(async()=>{const {got,run,G}=window.C,{HUG,KISS}=await import('/src/config.js');await run(10);const gs=got.filter(m=>m.t==='g'&&m.i!==undefined&&m.i===G.me);return{greets:gs.filter(m=>m.k<HUG.phrase).length,embraces:gs.filter(m=>m.k===HUG.phrase||m.k===KISS.phrase).length,line:document.querySelector('.say.mine')?.textContent};});
await page.evaluate(async()=>{const {aim,run,sleep}=window.C;await sleep(3200);aim();await run(1);aim();});
await press('Krama');
const hugPhase=await page.evaluate(async()=>{const {got,run,G,g,frame,a}=window.C,{HUG}=await import('/src/config.js');await run(6);const hugs=got.filter(m=>m.t==='g'&&m.k===HUG.phrase&&m.id);const posed=!!g.hug&&!!G.myGhost?.hug;
 // a third-person look at the pair from the side, in the real World, at full hug
 await run(4);const saved={p:a.camera.position.clone(),r:a.camera.rotation.clone()};const mid=g.root.position.clone().lerp(a.player.pos,.5);
 G.beforeMirror();a.camera.position.set(mid.x+2.3,mid.y+1.55,mid.z+.4);a.camera.lookAt(mid.x,mid.y+1.05,mid.z);a.scene.updateMatrixWorld(true);frame();window.C.saved=saved;
 return{hugs:hugs.length,posed,line:document.querySelector('.say.mine')?.textContent,reaches:window.C.reaches};});
await page.screenshot({path:`${out}/hug-${tag}.png`});
const restPhase=await page.evaluate(async()=>{const {G,g,run,a,aim,saved}=window.C,{HUG}=await import('/src/config.js');G.afterMirror();a.camera.position.copy(saved.p);a.camera.rotation.copy(saved.r);await run(Math.ceil(HUG.duration/.08)+4);g.animate(performance.now(),1,0,0);return{restored:!g.hug&&!G.myGhost.hug&&g.avatar.object.position.length()===0};});
let kissPhase=null;
if(setup.buttons.length===3){await page.evaluate(async()=>{const {aim,run,sleep}=window.C;await sleep(800);aim();await run(1);aim();});await press('Pussa');
 kissPhase=await page.evaluate(async()=>{const {got,run,G}=window.C,{KISS}=await import('/src/config.js'),{stats}=await import('/src/stats.js');await run(18);return{kisses:got.filter(m=>m.t==='g'&&m.k===KISS.phrase&&m.id).length,love:stats.love??0,hearts:!!G.kissHearts?.points.visible,reaches:window.C.reaches};});}
await page.evaluate(()=>window.C.ws.close());
const res={me,peer,mobile,setup,greetPhase,hugPhase,restPhase,kissPhase,errors};fs.writeFileSync(`${out}/result-${tag}.json`,JSON.stringify(res,null,2));console.log(JSON.stringify(res));
const pair=/sarah/i.test(me)!==/sarah/i.test(peer)&&/olof/i.test(me+peer)&&!/sarah.*olof|olof.*sarah/i.test(me)&&!/sarah.*olof|olof.*sarah/i.test(peer);
const want=mobile?(pair?['Hälsa','Krama','Pussa']:['Hälsa','Krama']):(pair?['Hälsa','Krama','Pussa']:['Hälsa','Krama']);
const ok=setup.kind==='ghost'&&!setup.menuHidden&&(mobile?setup.actionHidden:true)&&setup.sel===0&&setup.buttons.length===want.length&&setup.buttons.every((t,i)=>t.includes(want[i]))&&greetPhase.greets===1&&greetPhase.embraces===0&&hugPhase.hugs===1&&hugPhase.posed&&/Kram på dig/.test(hugPhase.line??'')&&restPhase.restored&&(!pair||(kissPhase&&kissPhase.kisses===1&&kissPhase.love===1&&kissPhase.hearts))&&!errors.length;
console.log(ok?'ALL PASSED':'FAILED');process.exitCode=ok?0:1;
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
