// #1566: Olof's desk corner is a shared computer: sit in the Batman chair, start/choose with native E (desktop)
// and touch (#action), the game frames the actual screen, stand up again; nearby seats keep their own PC.
// #1576: off from the start (both screens black, case RGB/LED unlit), E/touch lights them, the app picker offers YouTube and
// Spel, Stäng av darkens again, draw calls off ≤ on. #2224: the computer lives in the Berdi secretary: closed at start
// (nothing of the computer drawn), E/touch on the flap opens it, then the monitors work as before; E/touch on the lower
// door shows the computer box; a layout saved with the old desk moved and in its corner shape still applies.
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
   // #2224: the secretary is shut, so look at its closed writing flap instead (the monitors are behind it)
   await p.evaluate(()=>{const a=__app,o=a.world.furnitureTargets.find(t=>t.name==='skrivklaffen').object,c=new (a.camera.position.constructor)();
    o.updateWorldMatrix(true,true);o.children[0].getWorldPosition(c);a.camera.lookAt(c);a.camera.updateMatrixWorld(true);});
   await p.waitForFunction(()=>__app.focus().focused?.name==='skrivklaffen',null,{timeout:20000});
   // The sit-down blend can still run on a loaded machine: capture the seated eye once it has settled.
   await p.waitForFunction(()=>{const e=__app.camera.position.toArray(),q=window.__eye;window.__eye=e;return q&&e.every((v,i)=>Math.abs(v-q[i])<1e-4);},null,{polling:500,timeout:20000});
   const seated=await p.evaluate(()=>({eye:__app.camera.position.toArray(),feet:__app.player.pos.toArray()}));
   // #1576 light state of the desk itself: the shared screen/RGB/LED materials as found in the scene + its draw calls.
   const lights=()=>p.evaluate(()=>{const g=__app.computerHub.sessions.get('pc-olof').target.pickable.parent,m=new Set();let calls=0;
    g.traverse(o=>{if(!o.isMesh)return;for(let q=o;q;q=q.parent)if(!q.visible)return;if(o.material.visible!==false)calls++;m.add(o.material);});
    const basic=[...m].filter(x=>x.isMeshBasicMaterial&&x!==__app.computerHub.sessions.get('pc-olof').target.mesh.material);
    const lum=c=>c.r+c.g+c.b,emit=basic.filter(x=>!x.transparent).map(x=>lum(x.color)*(x.map?1:1)),glow=basic.filter(x=>x.transparent).map(x=>x.opacity);
    return {calls,emit:Math.max(...emit),glow:Math.max(...glow),screen:lum(basic.find(x=>x.map&&!x.transparent).color),n:basic.length};});
   // #1576 result images: one fixed view of the desk corner from the room (desk-local, so it follows the desk), drawn without moving the player.
   const view=async(name,from=[.95,1.45,1.75],to=[-.05,.85,-.1])=>{await p.evaluate(async([from,to])=>{const a=__app,T=await import('three'),g=a.computerHub.sessions.get('pc-olof').target.pickable.parent;
     a.__keep=[a.camera.position.clone(),a.camera.quaternion.clone()];g.updateWorldMatrix(true,true);
     a.camera.position.copy(g.localToWorld(new T.Vector3(...from)));a.camera.lookAt(g.localToWorld(new T.Vector3(...to)));a.camera.updateMatrixWorld(true);
     a.testMode.setFull(true);a.testMode.draw();},[from,to]);
    await p.screenshot({path:`${out}/${name}.png`,timeout:240000});
    await p.evaluate(()=>{const a=__app;a.testMode.setFull(false);a.camera.position.copy(a.__keep[0]);a.camera.quaternion.copy(a.__keep[1]);a.camera.updateMatrixWorld(true);});};
   const shape='sekretar',act=async()=>{if(mobile)await p.locator('#action').tap();else await p.keyboard.press('KeyE');};
   // #2224: closed at start: the cavity (monitors, app plane) and the computer compartment are not drawn, the monitors are no E target
   const front=name=>`__app.world.furnitureTargets.find(t=>t.name==='${name}')`;
   const shut=await p.evaluate(new Function(`const f=${front('skrivklaffen')},d=${front('datorluckan')},s=__app.computerHub.sessions.get('pc-olof').target;
    return {flap:f.isOpen,door:d.isOpen,cavity:s.pickable.visible,box:d.contents.visible,calls:(()=>{let n=0;s.pickable.parent.traverse(o=>{if(!o.isMesh)return;for(let q=o;q;q=q.parent)if(!q.visible)return;n++;});return n;})()};`));
   assert(!shut.flap&&!shut.door&&!shut.cavity&&!shut.box,JSON.stringify(shut));log(`${tag}: the secretary starts closed, nothing of the computer drawn`,shut);
   if(!mobile)await view('stangd');
   // E/touch on the closed flap opens it (the ordinary cabinet action), seated in the Batman chair
   const aimAt=async name=>{await p.evaluate(new Function(`const a=__app,o=${front(name)}.object,c=new (a.camera.position.constructor)();
     o.updateWorldMatrix(true,true);o.children[0].getWorldPosition(c);a.camera.lookAt(c);a.camera.updateMatrixWorld(true);`));
    await p.waitForFunction(n=>__app.focus().focused?.name===n,name,{timeout:20000});};
   await aimAt('skrivklaffen');await act();
   await p.waitForFunction(new Function(`const f=${front('skrivklaffen')};return f.isOpen&&f.t>=1;`),null,{timeout:20000});
   const opened=await p.evaluate(new Function(`const s=__app.computerHub.sessions.get('pc-olof').target;return {cavity:s.pickable.visible};`));
   assert(opened.cavity);log(`${tag}: E/touch opens the writing flap; both monitors are inside`,opened);
   const off0=await lights();assert(off0.screen===0&&off0.emit<.2&&off0.glow===0&&off0.n>=4,JSON.stringify(off0));
   log(`${tag} (${shape}): off at start: screens black, RGB/LED unlit, no wall glow`,off0);if(!mobile)await view(`av-${shape}`);
   await aim();   await aim();await act();await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').target.isOpen,null,{timeout:20000});
   log(`${tag}: seated in the Batman chair, E/touch starts Olofs dator`,seated);
   const on1=await lights();assert(on1.screen>2.9&&on1.emit>1&&on1.glow>.3&&on1.calls>=off0.calls,JSON.stringify({off0,on1}));
   log(`${tag} (${shape}): power on lights screens, RGB and LED; draw calls off ≤ on`,{closed:shut.calls,off:off0.calls,on:on1.calls});if(!mobile)await view(`pa-${shape}`);
   await aim();await act();
   await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.open);
   await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.owns,null,{timeout:20000}).catch(async()=>{await p.locator('#computer-pc-olof [data-computer-claim]').click();await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.owns);});
   await p.screenshot({path:`${out}/appval-${tag}.png`,timeout:240000});
   const apps=await p.locator('#computer-pc-olof .computer-apps button').allTextContents();
   assert(apps.includes('YouTube')&&apps.some(t=>t.startsWith('Spel')),JSON.stringify(apps));log(`${tag}: the app picker offers YouTube and Spel`,apps);
   // #1576 the picker's Stäng av datorn darkens the desk again; then start it once more for the game.
   if(mobile)await p.locator('#computer-pc-olof [data-computer-power]').tap();else await p.locator('#computer-pc-olof [data-computer-power]').click();
   await p.waitForFunction(()=>!__app.computerHub.sessions.get('pc-olof').target.isOpen&&!__app.computerHub.open,null,{timeout:20000});
   const off1=await lights();assert(off1.screen===0&&off1.emit<.2&&off1.glow===0&&off1.calls===off0.calls,JSON.stringify(off1));
   log(`${tag} (${shape}): Stäng av datorn darkens screens, RGB and LED again`,off1);
   if(!mobile){await p.evaluate(()=>document.getElementById('game-canvas').requestPointerLock());await p.waitForFunction(()=>!!document.pointerLockElement);}
   await aim();await act();await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').target.isOpen,null,{timeout:20000});
   await aim();await act();await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.open,null,{timeout:20000});
   await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.owns,null,{timeout:20000}).catch(async()=>{await p.locator('#computer-pc-olof [data-computer-claim]').click();await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.owns);});
   await p.locator('#computer-pc-olof [data-app=snake]').click();
   await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').inWorld);
   await p.locator('#computer-pc-olof [data-snake=join]').click();
   await p.waitForFunction(()=>__app.computerHub.arena?.snakes.some(s=>s.id===__ghosts.me&&s.alive&&s.screen==='pc-olof'));
   for(let i=0;i<12;i++){await p.waitForTimeout(100);await p.evaluate(()=>__app.step(1/30));}
   await p.evaluate(()=>{__app.testMode.setFull(true);__app.step(0);__app.testMode.draw();});await p.screenshot({path:`${out}/spel-${tag}.png`,timeout:240000});await p.evaluate(()=>__app.testMode.setFull(false));
   assert(await p.evaluate(()=>__app.rest.active));log(`${tag}: Ormstriden runs on the actual monitor while still seated`);
   if(mobile)await p.locator('#computer-pc-olof [data-cinema=close]').tap();else await p.keyboard.press('Escape');
   await p.waitForFunction(()=>!__app.computerHub.open);
   const back=await p.evaluate(()=>__app.camera.position.toArray());
   assert(back.every((v,i)=>Math.abs(v-seated.eye[i])<1e-3),JSON.stringify({back,seated}));

   await p.evaluate(()=>__app.standUp());await p.waitForFunction(()=>!__app.rest.active);
   const stood=await p.evaluate(()=>__app.player.pos.toArray());log(`${tag}: leaving restores the seated view; standing up works`,stood);
   // #2224: standing, E/touch closes the flap (the open flap is in the way of the low door) and opens the lower door: the computer box
   if(!mobile){await p.evaluate(()=>document.getElementById('game-canvas').requestPointerLock());await p.waitForFunction(()=>!!document.pointerLockElement);}
   await aimAt('skrivklaffen');await act();
   await p.waitForFunction(new Function(`const f=${front('skrivklaffen')},s=__app.computerHub.sessions.get('pc-olof').target;return !f.isOpen&&f.t<=0&&!s.pickable.visible;`),null,{timeout:20000});
   await aimAt('datorluckan');await act();
   await p.waitForFunction(new Function(`const d=${front('datorluckan')};return d.isOpen&&d.t>=1&&d.contents.visible;`),null,{timeout:20000});
   log(`${tag}: E/touch closes the flap again and opens the lower door; the computer box is inside`);
   if(!mobile)await view('oppen-nederdel',[.35,1.0,1.45],[-.33,.36,-.05]);
   if(!mobile){ // #2224: a layout saved before (old desk id moved 5 cm, its stored corner shape) still applies to the secretary
    const legacy=await p.evaluate(async()=>{const a=__app,id='f-tillydesk-1-2.292-9.43-0-0',piece=a.rearrange.pieces.find(q=>q.id===id),o=piece.object,T=await import('three');
     const was=o.getWorldPosition(new T.Vector3()),q=o.getWorldQuaternion(new T.Quaternion()),st=a.rearrange.state;
     a.rearrange.apply({...st,revision:st.revision+1,pieces:{...st.pieces,[id]:{pos:[was.x,was.y,was.z+.05],quat:q.toArray(),revision:st.revision+1}},
      materials:{...(st.materials??{}),[id]:{variant:{choice:'corner',revision:1}}}});
     const now=o.getWorldPosition(new T.Vector3());return {moved:+(now.z-was.z).toFixed(4),variant:!!o.userData.variant,targets:o.userData.targets.map(t=>t.name)};});
    assert(Math.abs(legacy.moved-.05)<1e-3&&!legacy.variant&&legacy.targets.length===3,JSON.stringify(legacy));log(`${tag}: a layout saved with the old desk moved + corner shape applies to the secretary`,legacy);
   }
   await p.close();
  }
  assert.deepEqual(errors,[]);log('no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
