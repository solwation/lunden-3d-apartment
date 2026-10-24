// #1566: Olof's desk corner is a shared computer: sit in the Batman chair, start/choose with native E (desktop)
// and touch (#action), the game frames the actual screen, stand up again; nearby seats keep their own PC.
// GAME FRESH_LOCAL_WORKER OUT. No production players are used.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out]=process.argv.slice(2),log=(s,v)=>console.log('PASS',s,v?JSON.stringify(v):'');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[];
 try{
  for(const mobile of [false,true]){
   const tag=mobile?'touch':'desktop';
   const p=await browser.newPage({viewport:mobile?{width:844,height:600}:{width:1100,height:800},isMobile:mobile,hasTouch:mobile});
   p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(()=>{localStorage.setItem('lunden.name','Olof');sessionStorage.setItem('lunden.nameSkipped','1');});
   await p.goto(`${game}/?shot&test=lazy&time=12&freeze&cloud=${encodeURIComponent(worker)}`);
   await p.waitForFunction(()=>window.__app?.computerHub?.sessions.has('pc-olof')&&window.__ghosts?.connected,null,{timeout:120000});
   if(mobile)await p.evaluate(()=>{__app.activeMode='touch';__app.touch.enabled=true;__app.showOverlay(false);document.body.classList.add('touch');});
   // Nearby seats still pick their own (nearest) PC.
   const seats=await p.evaluate(async()=>{const a=__app,T=await import('three'),out=[];
    for(const t of a.world.furnitureTargets)for(const s of t.spots??[])if(s.pc){let best=null,d0=3;for(const pc of a.world.furnitureTargets)if(pc.kind==='pc'){const d=pc.pickable.getWorldPosition(new T.Vector3()).distanceTo(s.pos);if(d<d0){d0=d;best=pc;}}out.push({seat:t.name,pc:best?.mediaId});}
    return out;});
   assert(seats.length&&seats.every(s=>s.pc==='pc-home'),JSON.stringify(seats));log(`${tag}: gaming chair/bunk seats still reach Speldatorn`,seats);
   // Walk up and sit down in the Batman chair with the ordinary E/touch action.
   const chair=await p.evaluate(async()=>{const a=__app,T=await import('three'),C=await import('/src/config.js');
    const t=a.world.furnitureTargets.find(t=>t.name==='Batman-stolen'),s=t.spots[0].pos;
    a.player.spawn(s.x,s.z+.8,0);a.player.pos.y=C.LEVELS[1].floor;a.player.eyeY=a.player.pos.y+1.62;for(let i=0;i<4;i++)a.step(1/60);
    a.camera.position.set(a.player.pos.x,a.player.eyeY,a.player.pos.z);a.camera.lookAt(s.x,a.player.pos.y+.5,s.z);a.camera.updateMatrixWorld(true);a.step(0);a.step(0);
  });
   if(!mobile){await p.evaluate(()=>{__app.touch.enabled=false;document.body.classList.remove('touch');document.getElementById('game-canvas').requestPointerLock();});await p.waitForFunction(()=>!!document.pointerLockElement);}
   await p.waitForFunction(()=>__app.focus().focused?.name==='Batman-stolen',null,{timeout:20000});
   if(mobile)await p.locator('#action').tap();else await p.keyboard.press('KeyE');
   await p.waitForFunction(()=>__app.rest.active&&__app.rest.target?.name==='Batman-stolen');
   await p.waitForTimeout(1500);
   // Seated, look at the main monitor: focus is Olof's computer within reach.
   const aim=async()=>{await p.evaluate(()=>{const a=__app,m=a.computerHub.sessions.get('pc-olof').target.mesh;m.updateWorldMatrix(true,false);
    const c=m.getWorldPosition(new (a.camera.position.constructor)());a.camera.lookAt(c);a.camera.updateMatrixWorld(true);});
    await p.waitForFunction(()=>__app.focus().focused?.mediaId==='pc-olof',null,{timeout:20000});return 'pc-olof';};
   await aim();
   const seated=await p.evaluate(()=>({eye:__app.camera.position.toArray(),feet:__app.player.pos.toArray()}));
   const act=async()=>{if(mobile)await p.locator('#action').tap();else await p.keyboard.press('KeyE');};
   await act();await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').target.isOpen,null,{timeout:20000});
   log(`${tag}: seated in the Batman chair, E/touch starts Olofs dator`,seated);
   if(!mobile){await p.evaluate(()=>{__app.testMode.setFull(true);__app.step(0);__app.testMode.draw();});await p.screenshot({path:`${out}/sitter-startad-${tag}.png`});await p.evaluate(()=>__app.testMode.setFull(false));}
   await aim();await act();
   await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.open);
   await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.owns,null,{timeout:20000}).catch(async()=>{await p.locator('#computer-pc-olof [data-computer-claim]').click();await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.owns);});
   await p.screenshot({path:`${out}/appval-${tag}.png`});
   await p.locator('#computer-pc-olof [data-app=snake]').click();
   await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').inWorld);
   await p.locator('#computer-pc-olof [data-snake=join]').click();
   await p.waitForFunction(()=>__app.computerHub.arena?.snakes.some(s=>s.id===__ghosts.me&&s.alive&&s.screen==='pc-olof'));
   for(let i=0;i<12;i++){await p.waitForTimeout(100);await p.evaluate(()=>__app.step(1/30));}
   await p.evaluate(()=>{__app.testMode.setFull(true);__app.step(0);__app.testMode.draw();});await p.screenshot({path:`${out}/spel-${tag}.png`});await p.evaluate(()=>__app.testMode.setFull(false));
   assert(await p.evaluate(()=>__app.rest.active));log(`${tag}: Ormstriden runs on the actual monitor while still seated`);
   if(mobile)await p.locator('#computer-pc-olof [data-cinema=close]').tap();else await p.keyboard.press('Escape');
   await p.waitForFunction(()=>!__app.computerHub.open);
   const back=await p.evaluate(()=>__app.camera.position.toArray());
   assert(back.every((v,i)=>Math.abs(v-seated.eye[i])<1e-3),JSON.stringify({back,seated}));
   await p.evaluate(()=>__app.standUp());await p.waitForFunction(()=>!__app.rest.active);
   const stood=await p.evaluate(()=>__app.player.pos.toArray());log(`${tag}: leaving restores the seated view; standing up works`,stood);
   await p.close();
  }
  assert.deepEqual(errors,[]);log('no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
