// #1491: actual six-screen game, native keyboard/mouse/touch, camera and input isolation.
// GAME FRESH_LOCAL_WORKER OUT. No production players are used.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out]=process.argv.slice(2),log=(s,v)=>console.log('PASS',s,v?JSON.stringify(v):'');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[],pages=[];
 try{
  const make=async(mobile)=>{const p=await browser.newPage({viewport:mobile?{width:844,height:600}:{width:1100,height:800},isMobile:mobile,hasTouch:mobile});pages.push(p);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/THREE.WebGLProgram/.test(m.text()))errors.push(m.text());});await p.addInitScript(()=>{localStorage.setItem('lunden.name','Ormtest');sessionStorage.setItem('lunden.nameSkipped','1');});await p.route('**/youtube-search?*',r=>r.fulfill({json:{items:[{id:'aqz-KE-bpKQ',title:'Datorfilm',channel:'Testkanal'}]}}));await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});await p.waitForFunction(()=>window.__app?.computerHub,null,{timeout:180000});await p.evaluate(()=>{__app.showOverlay(false);__app.touch.enabled=true;document.body.classList.add('touch');});return p;};
  const [A,B]=await Promise.all([make(false),make(true)]);log('both actual apps loaded');
  const pose=async(p,id)=>{console.log('POSE',id);await p.evaluate(async id=>{const a=__app,C=await import('/src/config.js');if(a.computerHub.sessions.get(id).info.clubhouse&&!a.player.inPlayroom){a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.use({kind:'playhouse'});}else if(!a.computerHub.sessions.get(id).info.clubhouse&&a.player.inPlayroom)a.use({kind:'playroomExit'});},id);await p.waitForFunction(id=>!!__app.computerHub.sessions.get(id).info.clubhouse===!!__app.player.inPlayroom,id);await p.waitForTimeout(700);await p.evaluate(async id=>{const a=__app,T=await import('three'),C=await import('/src/config.js'),s=a.computerHub.sessions.get(id);if(s.info.clubhouse&&!a.player.inPlayroom){a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.use({kind:'playhouse'});}else if(!s.info.clubhouse&&a.player.inPlayroom)a.use({kind:'playroomExit'});if(!s.info.clubhouse)a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:175});const m=s.target.mesh;m.updateWorldMatrix(true,false);const center=m.getWorldPosition(new T.Vector3()),front=new T.Vector3(0,0,1).transformDirection(m.matrixWorld),pos=center.clone().addScaledVector(front,.95);if(id==='laptop-home'){pos.x=center.x-.75;pos.z=center.z-.1;}a.player.spawn(pos.x,pos.z,0);a.player.pos.y=s.info.clubhouse?0:C.LEVELS[1].floor;a.player.eyeY=a.player.pos.y+(s.info.clubhouse?1.4:1.62);for(let i=0;i<4;i++)a.step(1/60);a.camera.position.set(a.player.pos.x,a.player.eyeY,a.player.pos.z);a.camera.lookAt(center);a.camera.updateMatrixWorld(true);a.scene.updateMatrixWorld(true);a.step(0);a.step(0);},id);await p.waitForFunction(id=>__ghosts.connected&&!!__app.computerHub.sessions.get(id).player.state,id,{timeout:30000});await p.waitForTimeout(600);await p.evaluate(id=>{const s=__app.computerHub.sessions.get(id);if(!s.target.isOpen)__app.computerHub.show(s.target);},id);await p.waitForFunction(id=>__app.computerHub.sessions.get(id).target.isOpen,id);};
  for(const id of (process.env.PHASE==='peer'?[]:['pc-home','pc-lime','pc-cyan','pc-rose','pc-amber','laptop-home'])){
   const p=id==='pc-home'?A:B;
   await pose(p,id);await p.evaluate(id=>__app.computerHub.show(__app.computerHub.sessions.get(id).target),id);
   await p.waitForFunction(id=>__app.computerHub.sessions.get(id).player.owns,id);
   const initial=await p.evaluate(()=>({pos:__app.player.pos.toArray(),camera:__app.camera.position.toArray()}));
   await p.locator(`#computer-${id} [data-app=snake]`).click();
   await p.waitForFunction(id=>__app.computerHub.sessions.get(id).inWorld,id);
   assert.equal(await p.locator(`#computer-${id} canvas`).count(),0);
   assert(!await p.evaluate(id=>document.getElementById(`computer-${id}`).matches(':modal'),id));
   await p.locator(`#computer-${id} [data-snake=join]`).click();
   await p.waitForFunction(()=>__app.computerHub.arena?.snakes.some(s=>s.id===__ghosts.me&&s.alive));
   await p.keyboard.press('KeyW');assert.equal(await p.evaluate(()=>__app.computerHub.angle),-Math.PI/2);
   assert.deepEqual(await p.evaluate(()=>__app.player.pos.toArray()),initial.pos);
   const screen=await p.evaluate(async id=>{const a=__app,s=a.computerHub.sessions.get(id),T=await import('three'),g=s.target.mesh.geometry.parameters;
    const point=new T.Vector3(g.width*.3,0,0).applyMatrix4(s.target.mesh.matrixWorld).project(a.camera),r=a.renderer.domElement.getBoundingClientRect();
    const mine=a.computerHub.arena.snakes.find(s=>s.id===__ghosts.me),before=a.computerHub.angle;
    return{x:r.left+(point.x+1)*r.width/2,y:r.top+(1-point.y)*r.height/2,before,head:mine.points[0],physical:s.target.mesh.material===s.material};},id);
   assert(screen.physical);
   if(id==='pc-home')await p.mouse.move(screen.x,screen.y);else await p.touchscreen.tap(screen.x,screen.y);
   assert.notEqual(await p.evaluate(()=>__app.computerHub.angle),screen.before);
   await p.evaluate(()=>{__app.testMode.setFull(true);__app.step(0);__app.testMode.draw();});
   await p.screenshot({path:`${out}/${id}.png`});await p.evaluate(()=>__app.testMode.setFull(false));
   if(id==='pc-home')await p.keyboard.press('Escape');else await p.locator(`#computer-${id} [data-cinema=close]`).tap();await p.waitForFunction(()=>!__app.computerHub.open);
   assert((await p.evaluate(()=>__app.camera.position.toArray())).every((v,i)=>Math.abs(v-initial.camera[i])<1e-5));
   log(`physical game, native steering, frozen avatar and Escape restore: ${id}`);
  }
  // Simultaneous physical screens retain the shared arena and exclusive controller.
  const join=async(p,id)=>{
   await pose(p,id);await p.evaluate(id=>__app.computerHub.show(__app.computerHub.sessions.get(id).target),id);
   await p.waitForFunction(id=>__app.computerHub.sessions.get(id).player.owns,id);
   if(!await p.evaluate(id=>__app.computerHub.sessions.get(id).inWorld,id))await p.locator(`#computer-${id} [data-app=snake]`).click();
   await p.locator(`#computer-${id} [data-snake=join]`).click();
   await p.waitForFunction(()=>__app.computerHub.arena?.snakes.some(s=>s.id===__ghosts.me&&s.alive));
   await p.evaluate(()=>{window.orbit=setInterval(()=>{const h=__app.computerHub,s=h.arena?.snakes.find(s=>s.id===__ghosts.me&&s.alive);if(s?.points[0]){const angle=Math.atan2(10-s.points[0][1],16-s.points[0][0])+.9;h.angle=Math.atan2(Math.sin(angle),Math.cos(angle));}},100);});
  };
  await join(A,'pc-home');await join(B,'pc-lime');
  await Promise.all([A,B].map(p=>p.waitForFunction(()=>__app.computerHub.arena?.snakes.filter(s=>s.alive).length===2)));
  await A.locator('#computer-pc-home [data-app=menu]').click();
  await A.waitForFunction(()=>!__app.computerHub.worldSession&&document.getElementById('computer-pc-home').matches(':modal'));
  await B.waitForFunction(()=>__app.computerHub.arena.snakes.length===1);
  await A.locator('#computer-pc-home [data-app=snake]').click();
  await B.evaluate(()=>__app.computerHub.close());await pose(B,'pc-home');
  await B.evaluate(()=>__app.computerHub.show(__app.computerHub.sessions.get('pc-home').target));
  await B.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').player.open);
  assert(await B.locator('#computer-pc-home [data-app=snake]').isDisabled());
  assert(!await B.evaluate(()=>__app.computerHub.sessions.get('pc-home').inWorld));
  log('two physical screens share arena; switching apps leaves one snake; another visitor cannot take control');
  await Promise.all([A,B].map(p=>p.evaluate(()=>{clearInterval(window.orbit);__app.computerHub.close();})));
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({screens:process.env.PHASE==='peer'?0:6,errors},null,2));
 }finally{for(const p of pages)try{await p.evaluate(()=>__ghosts.disconnect());}catch{}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
