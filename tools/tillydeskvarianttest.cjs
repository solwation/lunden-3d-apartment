// #1569, #1596: Olof's desk switches between straight and a triangular corner desk in Möblera om. Real app + a fresh local
// Worker: the button (HUD + menu), saved shape across a reload, footprint/collision follow the shape, the #1566
// computer starts and runs Ormstriden on the main monitor while seated in the corner variant, switching back, and
// both resets (one piece, everything) give the straight desk. Draw calls/triangles: corner ≤ straight.
// GAME FRESH_LOCAL_WORKER OUT. No production layout is written.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out]=process.argv.slice(2),log=(s,v)=>console.log('PASS',s,v!==undefined?JSON.stringify(v):'');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[];
 const open=async(mobile=false)=>{
  const p=await browser.newPage({viewport:mobile?{width:844,height:600}:{width:1100,height:800},isMobile:mobile,hasTouch:mobile});
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('lunden.name','Olof');sessionStorage.setItem('lunden.nameSkipped','1');});
  await p.goto(`${game}/?shot&test=lazy&time=12&freeze&lowmem&cloud=${encodeURIComponent(worker)}`);
  await p.waitForFunction(()=>window.__app?.computerHub?.sessions.has('pc-olof')&&window.__ghosts?.connected,null,{timeout:180000});
  await p.evaluate(()=>__app.rearrange.ready);
  if(mobile)await p.evaluate(()=>{__app.activeMode='touch';__app.touch.enabled=true;__app.showOverlay(false);document.body.classList.add('touch');});
  return p;
 };
 // Shape, stored choice, world footprint quads and what the desk draws (visible meshes = draw calls, their triangles).
 const desk=p=>p.evaluate(()=>{const R=__app.rearrange,d=R.pieces.find(x=>x.item.type==='tillydesk'),v=d.object.userData.variant;
  const T=d.object.matrixWorld,pt=(x,z)=>{const e=T.elements;return [e[0]*x+e[8]*z+e[12],e[2]*x+e[10]*z+e[14]];};
  let calls=0,tris=0;d.object.traverse(o=>{if(!o.isMesh)return;for(let q=o;q;q=q.parent)if(!q.visible)return;calls++;const g=o.geometry;tris+=(g.index?g.index.count:g.attributes.position.count)/3;});
  const C=__app.world.furniture,wing=pt(0,.40),inQuad=(q,[x,z])=>{let s=0;for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4];const c=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);if(c!==0){if(s&&Math.sign(c)!==s)return false;s=Math.sign(c);}}return true;};
  return {id:d.id,choice:v.choice,stored:R.state.materials?.[d.id]?.variant?.choice??'original',rects:d.object.userData.footprint.length,
   wingBlocked:C.footprints[1].some(q=>inQuad(q,wing)),calls,tris,label:v.label()};});
 // One fixed view of the desk corner from the room (the same for both shapes): stand at `at`, look at `to`.
 const look=(p,at,to)=>p.evaluate(async([at,to])=>{const a=__app,C=await import('/src/config.js'),f=C.LEVELS[1].floor;
  a.player.spawn(at[0],at[1],0);a.player.pos.y=f;a.player.eyeY=f+1.62;a.step(1/60);a.step(0);
  a.camera.position.set(at[0],f+1.62,at[1]);a.camera.lookAt(to[0],f+to[1],to[2]);a.camera.updateMatrixWorld(true);a.step(0);
  a.camera.position.set(at[0],f+1.62,at[1]);a.camera.lookAt(to[0],f+to[1],to[2]);a.camera.updateMatrixWorld(true);},[at,to]);
 const VIEWS={nv:[[.62,8.55],[2.05,.45,9.75]],sv:[[1.3,11.05],[2.15,.45,9.45]]}; // from the wardrobe corner / from the daybed's foot
 const shot=async(p,name)=>{if(process.env.NO_SCENE_SHOTS)return; // local software-GL runs may skip the slow scene views
  await p.evaluate(()=>{__app.testMode.setFull(true);});
  for(const [view,[at,to]] of Object.entries(VIEWS)){await look(p,at,to);
   await p.evaluate(()=>{document.getElementById('rearrange-help').hidden=true;__app.testMode.draw();});
   await p.screenshot({path:`${out}/${name}-${view}.png`,timeout:240000});}
  await p.evaluate(()=>__app.testMode.setFull(false));};
 const edit=p=>p.evaluate(()=>{const R=__app.rearrange;R.unlocked=true;R.enable(true);document.getElementById('rearrange-help').hidden=false;});
 try{
  let p=await open();
  const straight=await desk(p);
  assert.equal(straight.choice,'original');assert.equal(straight.rects,2);assert(!straight.wingBlocked);
  log('default is the straight desk; the corner-only area is walkable',straight);
  await p.evaluate(()=>document.getElementById('game-canvas').requestPointerLock());await p.waitForFunction(()=>!!document.pointerLockElement);
  await shot(p,'rakt');
  // Keyboard + mouse: in Möblera om aim at the desk, § opens the menu, whose button switches to the corner desk and saves it.
  await edit(p);
  await p.evaluate(()=>document.getElementById('game-canvas').requestPointerLock());await p.waitForFunction(()=>!!document.pointerLockElement);
  await look(p,[.95,8.75],[2.25,.76,8.85]);
  await p.waitForFunction(()=>{__app.step(0);return __app.rearrange.target?.piece?.item.type==='tillydesk';},null,{timeout:20000,polling:500});
  await p.keyboard.press('Backquote');
  await p.waitForFunction(()=>!document.getElementById('terminal-variant').hidden);
  assert.equal(await p.locator('#terminal-variant').textContent(),'Gör till hörnskrivbord');
  await p.screenshot({path:`${out}/menyknapp.png`,timeout:240000});
  await p.locator('#terminal-variant').click();
  await p.waitForFunction(()=>__app.rearrange.state.materials?.[__app.rearrange.pieces.find(x=>x.item.type==='tillydesk').id]?.variant?.choice==='corner'&&!__app.rearrange.saving);
  assert.equal(await p.locator('#terminal-variant').textContent(),'Gör till rakt skrivbord');
  const corner=await desk(p);
  assert.equal(corner.choice,'corner');assert.equal(corner.stored,'corner');assert.equal(corner.rects,4);assert(corner.wingBlocked);
  assert(corner.calls<=straight.calls,JSON.stringify({straight,corner}));
  log('menu button switches to the corner desk: saved, footprint and collision follow; draw calls corner ≤ straight',{straight:[straight.calls,Math.round(straight.tris)],corner:[corner.calls,Math.round(corner.tris)],status:await p.locator('#rearrange-status').textContent()});
  await p.locator('#terminal-close').click();
  // #1582: the V key does the same as the buttons (aimed desk), and every HUD button names its key on keyboard devices.
  await p.waitForFunction(()=>__app.rearrange.target?.piece?.item.type==='tillydesk',null,{timeout:20000});
  const saved=()=>p.evaluate(()=>__app.rearrange.state.materials?.[__app.rearrange.pieces.find(x=>x.item.type==='tillydesk').id]?.variant?.choice??'original');
  await p.keyboard.press('KeyV');await p.waitForFunction(()=>__app.rearrange.pieces.find(x=>x.item.type==='tillydesk').object.userData.variant.choice==='original'&&!__app.rearrange.saving);
  assert.equal(await saved(),'original');
  await p.keyboard.press('KeyV');await p.waitForFunction(()=>__app.rearrange.pieces.find(x=>x.item.type==='tillydesk').object.userData.variant.choice==='corner'&&!__app.rearrange.saving);
  assert.equal(await saved(),'corner');log('V switches the aimed desk straight and back to corner, saved each time');
  await p.evaluate(()=>{const R=__app.rearrange;R.begin(R.pieces.find(x=>x.item.type==='tillydesk'));__app.step(0);});
  await p.waitForFunction(()=>!document.getElementById('rearrange-variant').hidden);
  assert(!(await p.locator('#rearrange-variant-hint').isHidden()));
  await p.keyboard.press('KeyV');await p.waitForFunction(()=>__app.rearrange.pieces.find(x=>x.item.type==='tillydesk').object.userData.variant.choice==='original'&&!__app.rearrange.saving);
  await p.keyboard.press('KeyV');await p.waitForFunction(()=>__app.rearrange.pieces.find(x=>x.item.type==='tillydesk').object.userData.variant.choice==='corner'&&!__app.rearrange.saving);
  await p.evaluate(()=>{const R=__app.rearrange;R.begin(R.pieces.find(x=>x.item.type==='tillydesk'));__app.step(0);}); // (the shape switch ends the move: select again for the view)
  await p.waitForFunction(()=>!document.getElementById('rearrange-variant').hidden&&!document.getElementById('rearrange-variant-hint').hidden);
  const keys=()=>p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#rearrange-help button[data-key]')].map(b=>[b.id,[b.dataset.key,getComputedStyle(b,'::after').display,getComputedStyle(b,'::after').content]])));
  const dk=await keys();
  assert.deepEqual(Object.fromEntries(Object.entries(dk).map(([k,v])=>[k,v[0]])),{'rearrange-rotate':'R','rearrange-raise':'PgUp','rearrange-lower':'PgDn','rearrange-variant':'V','rearrange-material-confirm':'E','rearrange-cancel':'X','rearrange-menu':'§','rearrange-finish':'Esc'});
  assert(Object.values(dk).every(v=>v[1]!=='none'&&v[2]!=='none'&&v[2]!=='normal'),JSON.stringify(dk));
  await p.screenshot({path:`${out}/redigeringsrad-desktop.png`,clip:{x:0,y:90,width:420,height:260},timeout:240000});
  log('desktop: every edit-row button shows its key; V in the keyboard hint',Object.values(dk).map(v=>v[0]));
  await p.evaluate(()=>{__app.rearrange.cancel();__app.rearrange.enable(false);});
  await shot(p,'horn');
  await p.close();
  // Reload: the shared layout brings the corner desk back.
  p=await open();
  const reloaded=await desk(p);assert.equal(reloaded.choice,'corner');assert(reloaded.wingBlocked);log('corner desk survives a reload',reloaded.choice);
  // The #1566 computer in the corner variant: sit in the Batman chair, start, choose Ormstriden on the main monitor.
  await p.evaluate(async()=>{const a=__app,C=await import('/src/config.js');
   const t=a.world.furnitureTargets.find(t=>t.name==='Batman-stolen'),s=t.spots[0].pos;
   a.player.spawn(s.x,s.z+.8,0);a.player.pos.y=C.LEVELS[1].floor;a.player.eyeY=a.player.pos.y+1.62;for(let i=0;i<4;i++)a.step(1/60);
   a.camera.position.set(a.player.pos.x,a.player.eyeY,a.player.pos.z);a.camera.lookAt(s.x,a.player.pos.y+.5,s.z);a.camera.updateMatrixWorld(true);a.step(0);a.step(0);});
  await p.evaluate(()=>{__app.touch.enabled=false;document.body.classList.remove('touch');document.getElementById('game-canvas').requestPointerLock();});await p.waitForFunction(()=>!!document.pointerLockElement);
  await p.waitForFunction(()=>__app.focus().focused?.name==='Batman-stolen',null,{timeout:20000});
  await p.keyboard.press('KeyE');await p.waitForFunction(()=>__app.rest.active&&__app.rest.target?.name==='Batman-stolen');await p.waitForTimeout(1500);
  const aim=async()=>{await p.evaluate(()=>{const a=__app,m=a.computerHub.sessions.get('pc-olof').target.mesh;m.updateWorldMatrix(true,false);
   const c=m.getWorldPosition(new (a.camera.position.constructor)());a.camera.lookAt(c);a.camera.updateMatrixWorld(true);});
   await p.waitForFunction(()=>__app.focus().focused?.mediaId==='pc-olof',null,{timeout:20000});};
  await aim();await p.keyboard.press('KeyE');await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').target.isOpen,null,{timeout:20000});
  log('corner desk: seated in the Batman chair, E starts Olofs dator');
  await aim();await p.keyboard.press('KeyE');
  await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.open);
  await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.owns,null,{timeout:20000}).catch(async()=>{await p.locator('#computer-pc-olof [data-computer-claim]').click();await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').player.owns);});
  await p.locator('#computer-pc-olof [data-app=snake]').click();
  await p.waitForFunction(()=>__app.computerHub.sessions.get('pc-olof').inWorld);
  await p.locator('#computer-pc-olof [data-snake=join]').click();
  await p.waitForFunction(()=>__app.computerHub.arena?.snakes.some(s=>s.id===__ghosts.me&&s.alive&&s.screen==='pc-olof'));
  for(let i=0;i<12;i++){await p.waitForTimeout(100);await p.evaluate(()=>__app.step(1/30));}
  await p.evaluate(()=>{__app.testMode.setFull(true);__app.step(0);__app.testMode.draw();});if(!process.env.NO_SCENE_SHOTS)await p.screenshot({path:`${out}/horn-spel.png`});await p.evaluate(()=>__app.testMode.setFull(false));
  assert(await p.evaluate(()=>__app.rest.active));log('corner desk: Ormstriden runs on the main monitor while seated');
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!__app.computerHub.open);
  await p.evaluate(()=>__app.standUp());await p.waitForFunction(()=>!__app.rest.active);
  await p.evaluate(()=>document.exitPointerLock());
  await p.close();
  // Touch: tap the HUD button to switch back to straight.
  p=await open(true);await edit(p);
  await p.evaluate(()=>{const R=__app.rearrange;R.begin(R.pieces.find(x=>x.item.type==='tillydesk'));__app.step(0);});
  await p.waitForFunction(()=>!document.getElementById('rearrange-variant').hidden);
  assert.equal(await p.locator('#rearrange-variant').textContent(),'Gör till rakt skrivbord');
  const tk=await p.evaluate(()=>[...document.querySelectorAll('#rearrange-help button[data-key]')].filter(b=>!b.hidden).map(b=>getComputedStyle(b,'::after').display));
  assert(tk.length>0&&tk.every(d=>d==='none'),JSON.stringify(tk));
  await p.screenshot({path:`${out}/redigeringsrad-touch.png`,timeout:240000});log('touch: no key names on the edit-row buttons');
  await p.locator('#rearrange-variant').tap();
  await p.waitForFunction(()=>__app.rearrange.pieces.find(x=>x.item.type==='tillydesk').object.userData.variant.choice==='original'&&!__app.rearrange.saving);
  const back=await desk(p);assert.equal(back.stored,'original');assert(!back.wingBlocked);log('touch: tapping the button switches back to straight',back.stored);
  // Reset one piece: corner → reset → straight (same write as its pose).
  assert(await p.evaluate(()=>__app.rearrange.toggleVariant(__app.rearrange.pieces.find(x=>x.item.type==='tillydesk'))));
  assert.equal((await desk(p)).choice,'corner');
  assert(await p.evaluate(()=>__app.rearrange.restoreOriginal(__app.rearrange.pieces.find(x=>x.item.type==='tillydesk'))));
  const reset1=await desk(p);assert.equal(reset1.choice,'original');assert.equal(reset1.stored,'original');log('Återställ vald möbel gives the straight desk',reset1.stored);
  // Reset all through the menu's confirmation: corner → straight.
  assert(await p.evaluate(()=>__app.rearrange.toggleVariant(__app.rearrange.pieces.find(x=>x.item.type==='tillydesk'))));
  await p.locator('#rearrange-menu').tap();
  await p.evaluate(()=>{document.getElementById('terminal-reset-options').open=true;});
  await p.locator('#terminal-restore-all').tap();await p.locator('#terminal-confirm-yes').tap();
  await p.waitForFunction(()=>__app.rearrange.pieces.find(x=>x.item.type==='tillydesk').object.userData.variant.choice==='original'&&!__app.rearrange.saving);
  log('Återställ all möblering gives the straight desk',(await desk(p)).stored);
  await p.close();
  p=await open();const final=await desk(p);assert.equal(final.choice,'original');log('after reset and reload the desk is straight',final.choice);await p.close();
  assert.deepEqual(errors,[]);log('no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
