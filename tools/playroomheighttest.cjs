// Actual door/exit through native E and touch, for tallest/boundary/short avatars.
// GAME LOCAL_WORKER OUT
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out]=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let p;const errors=[],results=[];
 try{
  p=await browser.newPage({viewport:{width:1000,height:720},hasTouch:true});p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{sessionStorage.setItem('lunden.nameSkipped','1');});
  await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});await p.waitForFunction(()=>window.__app?.computerHub,null,{timeout:180000});await p.evaluate(()=>{__app.showOverlay(false);__app.touch.enabled=true;document.body.classList.add('touch');});
  const heights=await p.evaluate(async()=>{const C=await import('/src/config.js');return[C.AVATAR_HEIGHT.max,160,C.AVATAR_HEIGHT.min];});
  for(const [index,cm]of heights.entries()){
   await p.evaluate(async cm=>{const a=__app,C=await import('/src/config.js');a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:cm});a.player.spawn(-28.85,22.7,Math.PI);for(let i=0;i<10;i++)a.player.update(1/60);a.camera.lookAt(-28.85,.6,23.6);a.camera.updateMatrixWorld(true);a.step(0);},cm);
   await p.waitForFunction(()=>__app.focus().focused?.kind==='playhouse');
   if(index===0){await p.evaluate(()=>{__app.touch.enabled=false;document.body.classList.remove('touch');document.getElementById('game-canvas').requestPointerLock();});await p.waitForFunction(()=>!!document.pointerLockElement&&document.getElementById('arm').hidden);await p.keyboard.press('KeyE');}
   else {await p.evaluate(()=>{__app.activeMode='touch';__app.touch.enabled=true;__app.showOverlay(false);document.body.classList.add('touch');__app.step(0);});await p.locator('#action').tap();}
   await p.waitForFunction(()=>__app.player.inPlayroom&&__app.world.playroom.object.visible);await p.waitForTimeout(700);
   const inside=await p.evaluate(()=>({feet:__app.player.pos.y,eye:__app.camera.position.y,ceiling:__app.world.playroom.ceiling}));assert.equal(inside.feet,0);assert(inside.eye<inside.ceiling);
   await p.evaluate(async()=>{const a=__app,T=await import('three'),center=a.world.playroom.exitTarget.pickable.getWorldPosition(new T.Vector3());a.camera.lookAt(center);a.camera.updateMatrixWorld(true);a.step(0);});await p.waitForFunction(()=>__app.focus().focused?.kind==='playroomExit');
   if(index===0)await p.keyboard.press('KeyE');else {await p.evaluate(()=>{__app.activeMode='touch';__app.touch.enabled=true;__app.showOverlay(false);document.body.classList.add('touch');__app.step(0);});await p.locator('#action').tap();}
   await p.waitForFunction(()=>!__app.player.inPlayroom&&!__app.world.playroom.object.visible);await p.waitForTimeout(700);const outside=await p.evaluate(()=>({x:__app.player.pos.x,z:__app.player.pos.z}));assert(Math.abs(outside.x+28.85)<.05);assert(Math.abs(outside.z-22.85)<.15);results.push({cm,input:index===0?'E':'touch',inside,outside});console.log('PASS height-independent actual entry and exit',results.at(-1));
   if(index===0){await p.evaluate(()=>{document.exitPointerLock();__app.touch.enabled=true;document.body.classList.add('touch');});await p.waitForTimeout(250);await p.evaluate(()=>{__app.activeMode='touch';__app.touch.enabled=true;__app.showOverlay(false);document.body.classList.add('touch');});}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({results,errors},null,2));console.log('PASS no height denial or page exception');
 }catch(e){if(p)try{console.log('DIAGNOSTIC',await p.evaluate(()=>({focus:__app.focus().focused?.kind,pos:__app.player.pos.toArray(),room:__app.player.inPlayroom,badges:document.getElementById('badges').textContent})));}catch{}throw e;}
 finally{if(p)try{await p.evaluate(()=>__ghosts.disconnect());}catch{}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
