// Two actual apps, real YouTube players and an isolated local Worker.
// PLAYWRIGHT_MODULE=... CHROME_PATH=... node tools/cinemapeertest.cjs GAME WORKER OUT
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out]=process.argv.slice(2);if(!game||!worker||!out)throw Error('Usage: cinemapeertest.cjs GAME WORKER OUT');
const log=(name,data)=>console.log('PASS',name,data?JSON.stringify(data):'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];
 try{
  const make=async(name,mobile)=>{
   const ctx=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1100,height:760},isMobile:mobile,hasTouch:mobile});
   const p=await ctx.newPage();p.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
   p.on('console',m=>{if(/THREE.WebGLProgram|GL_INVALID_OPERATION/.test(m.text()))errors.push(m.text());});
   await p.route('**/youtube-search?*',r=>r.fulfill({json:{items:[{id:new URL(r.request().url()).searchParams.get('q').includes('andra')?'M7lc1UVf-VE':'aqz-KE-bpKQ',title:'Gemensam testfilm',channel:'Testkanal'}]}}));
   await p.addInitScript(name=>{localStorage.setItem('lunden.name',name);sessionStorage.setItem('lunden.nameSkipped','1');},name);
   await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});
   await p.waitForFunction(()=>window.__app?.renderer,null,{timeout:180000});
   await p.evaluate(async()=>{const a=__app,C=await import('/src/config.js');a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.showOverlay(false);a.use({kind:'playhouse'});});
   await p.waitForFunction(()=>__app.player.inPlayroom&&__ghosts.connected&&!!__app.cinema.state,null,{timeout:30000});
   await p.waitForTimeout(600);
   await p.evaluate(async mobile=>{const a=__app,{PLAYROOM:R}=await import('/src/config.js');a.touch.enabled=true;document.body.classList.add('touch');a.player.spawn(R.x+(mobile?-7.5:-7.4),R.z+(mobile?-.9:-1.65),0);for(let i=0;i<10;i++)a.player.update(1/60);a.camera.lookAt(R.x+R.furniture.tv.x+.08,R.furniture.tv.y+R.furniture.tv.h/2,R.z+R.furniture.cinema.screen.z);a.camera.updateMatrixWorld(true);a.step(0);},mobile);
   return p;
  };
  const [A,B]=await Promise.all([make('Anna',false),make('Bo',true)]);log('two real desktop/touch apps joined the local room');
  const open=async(p,mobile)=>{
   if(mobile){await p.waitForFunction(()=>__app.focus().focused?.name==='bioduken');await p.locator('#action').tap();}
   else{await p.waitForFunction(()=>__app.focus().focused?.name==='bioduken');await p.evaluate(()=>{__app.touch.enabled=false;document.body.classList.remove('touch');});if(!await p.evaluate(()=>!!document.pointerLockElement)){await p.evaluate(()=>document.getElementById('game-canvas').requestPointerLock());await p.waitForFunction(()=>!!document.pointerLockElement);}await p.waitForFunction(()=>!!document.pointerLockElement&&document.getElementById('arm').hidden);await p.keyboard.press('KeyE');}
   await p.waitForFunction(()=>__app.cinema.open);
  };
  const close=async p=>{if(await p.evaluate(()=>__app.cinema.open))await p.locator('#cinema-player [data-cinema=close]').click();};
  const state=p=>p.evaluate(()=>({s:__app.cinema.state,owns:__app.cinema.owns,ready:__app.cinema.ready,id:__ghosts.me,time:__app.cinema.ready?__app.cinema.player.getCurrentTime():null,player:__app.cinema.ready?__app.cinema.player.getPlayerState():null}));
  const playing=async(p,id)=>{await p.waitForFunction(id=>__app.cinema.state?.video===id&&__app.cinema.ready&&__app.cinema.player?.getPlayerState()===1,null===id?null:id,{timeout:60000});};
  const choose=async(p,term)=>{await p.locator('#cinema-url').fill(term);await p.locator('#cinema-url').press('Enter');await p.getByRole('button',{name:'Gemensam testfilm · Testkanal',exact:true}).click();};
  await open(A,false);await A.waitForFunction(()=>__app.cinema.owns);
  await open(B,true);await B.waitForFunction(()=>__app.cinema.state?.owner&&!__app.cinema.owns);
  assert(await B.locator('#cinema-url').isDisabled());assert.equal((await state(A)).s.owner,(await state(B)).s.owner);log('one controller; touch viewer cannot edit another player’s film');
  await choose(A,'första filmen');await Promise.all([playing(A,'aqz-KE-bpKQ'),playing(B,'aqz-KE-bpKQ')]);
  const revision=(await state(A)).s.q;
  await A.locator('#cinema-player [data-cinema=join]').click();await B.locator('#cinema-player [data-cinema=join]').tap();
  assert.equal((await state(B)).s.q,revision);assert.equal((await state(A)).s.owner,(await state(A)).id);log('local audio activation follows the same film without taking control');
  await close(B);await close(A);await A.waitForFunction(()=>!__app.cinema.state?.owner);
  await sleep(2200);
  const first=[await state(A),await state(B)];assert(Math.abs(first[0].time-first[1].time)<2);log('both actual YouTube playback clocks advance together',first.map(s=>({time:s.time,player:s.player})));
  for(const p of [A,B]){
   const frame=p.frames().find(f=>f.url().includes('youtube-nocookie.com/embed/'));
   await frame.waitForFunction(()=>document.querySelector('video')?.getVideoPlaybackQuality().totalVideoFrames>2,null,{timeout:45000});
   assert(await frame.evaluate(()=>!document.querySelector('video').muted));
  }
  const aperture=await A.evaluate(async()=>{
   const a=__app,T=await import('three'),m=a.world.playroom.devices.tv.mesh,point=m.getWorldPosition(new T.Vector3()).project(a.camera),gl=a.renderer.getContext(),px=new Uint8Array(4);
   const x=Math.floor((point.x*.5+.5)*gl.drawingBufferWidth),y=Math.floor((point.y*.5+.5)*gl.drawingBufferHeight);
   a.renderer.render(a.scene,a.camera);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);const open=px[3];
   const block=new T.Mesh(new T.BoxGeometry(.5,.5,.5),new T.MeshBasicMaterial({color:0x00ffff}));block.position.copy(m.getWorldPosition(new T.Vector3())).lerp(a.camera.position,.6);a.scene.add(block);a.renderer.render(a.scene,a.camera);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);const occluded=px[3];block.removeFromParent();block.geometry.dispose();block.material.dispose();a.renderer.render(a.scene,a.camera);return{open,occluded};
  });assert.equal(aperture.open,0);assert.equal(aperture.occluded,255);log('film is on the physical screen with depth-tested foreground occlusion',aperture);
  await Promise.all([A,B].map(p=>p.evaluate(()=>__app.testMode.draw())));await A.screenshot({path:`${out}/desktop-screen.png`});await B.screenshot({path:`${out}/touch-screen.png`});
  await open(B,true);await B.waitForFunction(()=>__app.cinema.owns);
  await B.locator('#cinema-player [data-cinema=pause]').tap();await Promise.all([A,B].map(p=>p.waitForFunction(()=>!__app.cinema.state.playing&&__app.cinema.player.getPlayerState()===2)));
  const paused=[(await state(A)).time,(await state(B)).time];await sleep(1100);const frozen=[(await state(A)).time,(await state(B)).time];assert(frozen.every((t,i)=>Math.abs(t-paused[i])<.2));log('touch pause freezes both media clocks',{paused,frozen});
  await B.locator('#cinema-player [data-cinema=play]').tap();await Promise.all([playing(A,'aqz-KE-bpKQ'),playing(B,'aqz-KE-bpKQ')]);
  await choose(B,'andra filmen');await Promise.all([A,B].map(p=>p.waitForFunction(()=>__app.cinema.state?.video==='M7lc1UVf-VE'&&__app.cinema.ready,null,{timeout:45000})));
  await B.locator('#cinema-player [data-cinema=join]').tap();await Promise.all([playing(A,'M7lc1UVf-VE'),playing(B,'M7lc1UVf-VE')]);log('film change replaces both real players');
  const oldId=(await state(B)).id;await B.evaluate(()=>__ghosts.disconnect());
  await B.waitForFunction(id=>__ghosts.connected&&__ghosts.me!==id&&__app.cinema.ready,oldId,{timeout:30000});
  await A.waitForFunction(()=>!__app.cinema.state?.owner);assert.equal((await state(A)).s.owner,null);assert.equal((await state(B)).s.video,'M7lc1UVf-VE');log('disconnect releases the controller; reconnect follows the existing film');
  await close(B);
  await B.evaluate(()=>__app.use({kind:'playroomExit'}));await B.waitForFunction(()=>!__app.player.inPlayroom);assert.equal(await B.locator('.cinema-world-video iframe').count(),0);assert.equal((await state(A)).s.video,'M7lc1UVf-VE');
  await sleep(600);await B.evaluate(()=>__app.use({kind:'playhouse'}));await B.waitForFunction(()=>__app.player.inPlayroom&&__app.cinema.ready,null,{timeout:45000});
  await playing(B,'M7lc1UVf-VE');await B.waitForFunction(()=>Math.abs(__app.cinema.player.getCurrentTime()-__app.cinema.position())<1.5,null,{timeout:30000});const late=await state(B);assert.equal(late.s.video,'M7lc1UVf-VE');assert(Math.abs(late.time-(await state(A)).time)<2.5);log('late arrival resumes the shared video position',{late:late.time,other:(await state(A)).time});
  await A.evaluate(async()=>{const {GHOSTS}=await import('/src/config.js');__ghosts.lastMove=performance.now()-GHOSTS.idleMs-1000;__ghosts.update(0);});assert((await state(A)).id);log('stationary viewers retain the shared connection');
  await Promise.all([A,B].map(p=>p.evaluate(()=>__app.cinema.show())));await sleep(700);const owners=[(await state(A)).owns,(await state(B)).owns];assert.equal(owners.filter(Boolean).length,1);log('racing screen claims leave exactly one controller',owners);
  await Promise.all([close(A),close(B)]);
  await A.evaluate(()=>__app.use({kind:'playroomExit'}));await A.waitForFunction(()=>!__app.player.inPlayroom);await B.evaluate(()=>__app.use({kind:'playroomExit'}));await B.waitForFunction(()=>!__app.player.inPlayroom);await sleep(700);
  assert.equal(await A.locator('.cinema-world-video iframe').count(),0);assert.equal(await B.locator('.cinema-world-video iframe').count(),0);
  await A.evaluate(()=>__app.use({kind:'playhouse'}));await A.waitForFunction(()=>__app.player.inPlayroom&&!!__app.cinema.state);assert.equal((await state(A)).s.video,'');assert.equal(await A.locator('.cinema-world-video iframe').count(),0);log('last departure stops the film and next visit starts with an empty cinema');
  const opaque=await A.evaluate(()=>{const a=__app,gl=a.renderer.getContext(),p=new Uint8Array(4);a.renderer.render(a.scene,a.camera);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return p[3];});assert.equal(opaque,255);log('ordinary scene stays opaque when no video is active');
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({first,aperture,paused,frozen,late,owners,opaque,errors},null,2));log('no page or shader exceptions');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
