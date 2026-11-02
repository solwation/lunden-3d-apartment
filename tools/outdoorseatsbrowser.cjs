// #1818: actual catalogue plus native E/touch mount/dismount, without a browser round per furniture item.
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8934',out=process.argv[3]||'/tmp/outdoor-seats1818',busOnly=process.argv.includes('--south-bus-only');
const results=[];let pass=true;const check=(ok,name,data)=>{results.push({ok:!!ok,name,data});pass&&=!!ok;console.log(`${ok?'PASS':'FAIL'} ${name}${data?' '+JSON.stringify(data):''}`);};
(async()=>{const browser=await kit.launch();try{
 const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1,hasTouch:true});
 if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',route=>route.fulfill({path:path.join(process.env.THREE_DIR,new URL(route.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?shot&cloud=&month=6&time=13&freeze&weather=clear&test=lazy`,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app?.world.outdoorSeats,null,{timeout:180000,polling:100});await kit.skipNameDialog(page);fs.mkdirSync(out,{recursive:true});
 const inventory=await page.evaluate(async()=>{
  const A=__app;A.showOverlay(true);A.renderer.setAnimationLoop(null);A.touch.enabled=true;A.world.object.updateMatrixWorld(true);
  const ext=A.scene.getObjectByName('exterior')??A.world.exterior,records=[];
  A.scene.traverse(o=>{if(o.name==='patio-decor'||o.name==='terrace-decor')records.push(...o.userData.records);});
  const authored=records.flatMap(r=>r.items).filter(i=>i.seat),targets=A.world.outdoorTargets;
  const byType=authored.reduce((a,i)=>(a[i.k]=(a[i.k]??0)+1,a),{});
  const allValid=targets.every(t=>t.spots.length&&t.spots.every(s=>s.pos.toArray().every(Number.isFinite))&&t.returnToEntry);
  const old=[...A.world.furnitureTargets,...A.world.courtyardTargets].filter(t=>t.kind==='rest');
  const {Rest}=await import('/src/rest.js'),camera=A.camera.clone(),r=new Rest(camera);let oldValid=true,oldSpots=0;
  for(const t of old)for(const s of t.spots){const stand={x:0,y:0,z:0,yaw:0};r.begin(t,s,stand);r.update(1);oldValid&&=camera.position.distanceTo(r.eyeAt(s))<1e-8&&r.end()===stand;oldSpots++;}
  const court=A.world.courtyardSwings[0],before=court.target.spots[0].pos.clone();court.begin();A.world.updateSwings(1,court.target);
  const oldSwing=before.distanceTo(court.target.spots[0].pos)>.05;A.world.updateSwings(10,null);
  window.__seatProbe={A,prepare(id){if(A.rest.active)A.standUp();const t=targets.find(t=>t.seatId===id),s=t.spots[0],dx=-Math.sin(s.yaw),dz=-Math.cos(s.yaw);A.player.spawn(s.pos.x+dx*1.1,s.pos.z+dz*1.1,0);A.step(0);const aim=s.aimPos??s.pos,d=aim.clone().sub(A.camera.position);A.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');A.camera.updateMatrixWorld(true);A.step(0);A.step(0);this.stand=A.player.pos.clone();return{focused:A.focus().focused?.seatId,expected:id,stand:this.stand.toArray()};},frames(n){for(let i=0;i<n;i++)A.step(1/60);}};
  return{authored:authored.length,registeredDecor:targets.filter(t=>/^patio-|^terrace-/.test(t.seatId)).length,byType,total:targets.length,schoolSwings:A.world.outdoorSeats.swings.length,allValid,oldValid,oldSpots,oldSwing,ids:targets.map(t=>t.seatId)};
 });
 check(inventory.authored===inventory.registeredDecor&&inventory.byType.chair>0&&inventory.byType.sofa>0&&inventory.byType.lounger>0&&inventory.schoolSwings===8&&inventory.allValid,'every actual patio/terrace seat, shelter bench and school swing is registered',inventory);
 check(inventory.oldValid&&inventory.oldSpots>25&&inventory.oldSwing,'existing indoor/courtyard Rest anchors and courtyard swing still work',{oldSpots:inventory.oldSpots,oldSwing:inventory.oldSwing});
 // Coarse-pointer browsers show the single Starta button, which dispatches the same touch start handler.
 if(await page.locator('#start-go').isVisible())await page.locator('#start-go').click();else await page.locator('#start-touch').click();
 const benchId=busOnly?'south-bus-bench':'school-wall-bench';
 const bench=await page.evaluate(id=>__seatProbe.prepare(id),benchId);check(bench.focused===bench.expected,'native focus reaches shelter bench',bench);
 await page.evaluate(()=>{__app.activeMode='mouse';document.getElementById('game-canvas').requestPointerLock();});await page.waitForFunction(()=>!!document.pointerLockElement,null,{timeout:10000});
 await page.keyboard.press('KeyE');
 const sitting=await page.evaluate(()=>{__seatProbe.frames(40);return{active:__app.rest.active,id:__app.rest.target?.seatId,camera:__app.camera.position.toArray(),eye:__app.rest.spot?.pos.toArray()};});
 check(sitting.active&&sitting.id===benchId,'native E sits on the actual bus bench',sitting);
 await kit.shot(page,path.join(out,busOnly?'south-bus-bench-seated.png':'bus-bench-seated.png'));
 await page.keyboard.press('KeyC');const stood=await page.evaluate(()=>({active:__app.rest.active,gap:__app.player.pos.distanceTo(__seatProbe.stand)}));check(!stood.active&&stood.gap<1e-6,'native C returns safely to the exact approach point',stood);
 if(busOnly){check(errors.length===0,'no browser page errors',errors);fs.writeFileSync(path.join(out,'south-bus-result.json'),JSON.stringify({pass,results},null,2));return;}
 await page.evaluate(()=>{__app.activeMode='touch';__app.touch.enabled=true;document.body.classList.add('touch');document.exitPointerLock();__app.showOverlay(false);});
 const id=inventory.ids.find(id=>id.startsWith('swing-145221572-')),swing=await page.evaluate(id=>__seatProbe.prepare(id),id);check(swing.focused===id,'touch focus reaches a rendered school swing',swing);
 await page.locator('#action').tap();
 const moving=await page.evaluate(()=>{const A=__app,start=A.rest.spot?.pos.clone();__seatProbe.frames(65);return{active:A.rest.active,id:A.rest.target?.seatId,travel:start?.distanceTo(A.rest.spot.pos),cameraGap:A.rest.spot?A.camera.position.distanceTo(A.rest.eyeAt(A.rest.spot)):99};});
 check(moving.active&&moving.id===id&&moving.travel>.05&&moving.cameraGap<.01,'native touch action mounts the school swing and camera follows its real motion',moving);
 await kit.shot(page,path.join(out,'school-swing-seated.png'));
 await page.evaluate(()=>__app.step(0));
 if(await page.locator('#stand-btn').isVisible())await page.locator('#stand-btn').tap();else await page.locator('#action').tap();
 const off=await page.evaluate(()=>({active:__app.rest.active,gap:__app.player.pos.distanceTo(__seatProbe.stand)}));check(!off.active&&off.gap<1e-6,'native touch dismount returns safely to the exact approach point',off);
 // One external result view makes the seat/chains easy to assess, after the native interaction has passed.
 await page.evaluate(()=>{const A=__app;A.player.spawn(54,-85,0);A.step(0);const ground=A.world.outdoorSeats.swings.find(s=>s.target.seatId.startsWith('swing-145221572-')).target.spots[0].pos.y;A.camera.position.set(54,ground+1.3,-85);A.camera.lookAt(50,ground+.2,-90);A.camera.updateMatrixWorld(true);});
 await kit.shot(page,path.join(out,'school-swing-result.png'));
 check(errors.length===0,'no browser page errors',errors);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({pass,results},null,2));
}finally{await browser.close();}if(!pass)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
