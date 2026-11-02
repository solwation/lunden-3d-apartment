// #1815: actual river surfaces/model, finite kitchen bread and native keyboard/touch feeding.
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8938',out=process.argv[3]||'/tmp/ducks1815';
const results=[];let pass=true;const check=(ok,name,data)=>{results.push({ok:!!ok,name,data});pass&&=!!ok;console.log(`${ok?'PASS':'FAIL'} ${name} ${JSON.stringify(data??'')}`);};
(async()=>{const browser=await kit.launch();try{
 const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1,hasTouch:true});
 if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',route=>route.fulfill({path:path.join(process.env.THREE_DIR,new URL(route.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?shot&cloud=&month=11&time=13&freeze&weather=clear&test=lazy`,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app?.ducks,null,{timeout:180000});await kit.skipNameDialog(page);fs.mkdirSync(out,{recursive:true});
 await page.evaluate(()=>__app.showOverlay(true));if(await page.locator('#start-go').isVisible())await page.locator('#start-go').click();else await page.locator('#start-touch').click();
 const setup=await page.evaluate(async()=>{
  const A=__app;A.renderer.setAnimationLoop(null);A.touch.enabled=true;
  const {waterYAt}=await import('/src/riverbridge.js');
  const {audioParts}=await import('/src/audio.js'),audio=audioParts();window.__duckAudio={osc:0,state:audio?.ctx.state};if(audio){const create=audio.ctx.createOscillator.bind(audio.ctx);audio.ctx.createOscillator=(...a)=>{__duckAudio.osc++;return create(...a);};}
  const d=A.ducks,hab=d.habitat,states=new Set();let maxStep=0,sound=0,prev=null;
  const b=d.animals[0].brain;
  for(let i=0;i<7000;i++){const old={x:b.x,y:b.y,z:b.z};sound+=b.update(.05);states.add(b.swimming?'water':'land');maxStep=Math.max(maxStep,Math.hypot(b.x-old.x,b.y-old.y,b.z-old.z));}
  const land=hab.goal('walk',.5,.5),water=hab.goal('swim',.5,.5);
  b.x=land.x;b.z=land.z;b.y=hab.surface(b.x,b.z).y;b.cooldown=0;b.eating=0;b.goal=null;
  window.__duck={A,b,land,water,frames(n){for(let i=0;i<n;i++)A.step(1/60);},aim(){A.player.spawn(b.x,b.z-1.45,0);A.step(0);const v=d.animals[0].pick.position.clone().sub(A.camera.position);A.camera.rotation.set(Math.atan2(v.y,Math.hypot(v.x,v.z)),Math.atan2(-v.x,-v.z),0,'YXZ');A.step(0);A.step(0);return A.focus().focused?.kind;}};
  __duck.aim();
  const model=d.animals[0].mesh,vertices=model.geometry.attributes.position.count,triangles=model.geometry.index.count/3;
  return{states:[...states],maxStep,sound,land:{...land,...hab.surface(land.x,land.z)},water:{...water,...hab.surface(water.x,water.z),waterY:waterYAt(water.x,water.z)},count:d.animals.length,shared:d.animals.every(a=>a.mesh.geometry===model.geometry&&a.mesh.material===model.material),vertices,triangles,lights:model.children.length};
 });
 check(setup.states.length===2&&setup.maxStep<.08&&setup.land.water===false&&setup.water.water===true,'actual river habitat swims/walks with a continuous waterline',setup);
 check(setup.count===4&&setup.shared&&setup.triangles*4<8000,'four bounded shared low-poly models without lights/shadows',setup.triangles);
 const bread=await page.evaluate(()=>{const {A}=__duck;const old=A.life.items.held();if(old)A.life.items.move(old,{at:'world',pos:[0,0,0]});const bag=A.life.create('breadBag',{at:'world',pos:[__duck.land.x,__duck.b.y,__duck.land.z-1]});const t={instance:bag};const open=A.life.options(t).find(a=>a.id==='open');open.run();const dispense=A.life.options(t).find(a=>a.id==='dispense');dispense.run();__duck.frames(90);__duck.bag=bag;return{bag:bag.amount,type:A.heldItem()?.item?.type,amount:A.heldItem()?.item?.amount,focused:__duck.aim()};});
 check(bread.bag===11&&bread.type==='breadSlice'&&bread.amount===1&&bread.focused==='duck','normal open/dispense action yields one finite held slice and native duck focus',bread);
 await page.evaluate(()=>{__app.activeMode='mouse';document.getElementById('game-canvas').requestPointerLock();});await page.waitForFunction(()=>!!document.pointerLockElement,null,{timeout:10000});
 await page.keyboard.press('KeyE');const first=await page.evaluate(()=>({amount:__app.heldItem()?.item?.amount,feeds:__app.ducks.feeds,eating:__duck.b.eating,quacks:__app.ducks.quacks,audio:__duckAudio}));
 check(first.amount===.75&&first.feeds===1&&first.eating>0&&first.quacks>0&&first.audio.osc>0&&first.audio.state==='running','native E feeds one bite, eating animation and positional quack',first);
 await kit.shot(page,path.join(out,'bread-feeding-shore.png'));
 if(process.argv.includes('--feeding-image-only'))return;
 await page.keyboard.press('KeyE');check(await page.evaluate(()=>__app.heldItem()?.item?.amount===.75),'repeated E cannot consume during chewing cooldown');
 await page.evaluate(()=>{__app.activeMode='touch';__app.touch.enabled=true;document.body.classList.add('touch');document.exitPointerLock();__app.showOverlay(false);});
 for(let i=0;i<3;i++){await page.evaluate(()=>{__duck.frames(150);__duck.aim();});await page.locator('#action').tap();}
 const fed=await page.evaluate(()=>({held:!!__app.heldItem(),feeds:__app.ducks.feeds,bag:__duck.bag.amount,quacks:__app.ducks.quacks}));
 check(!fed.held&&fed.feeds===4&&fed.bag===11,'native touch consumes remaining three bites, removes slice and leaves the bag finite',fed);
 const motion=await page.evaluate(()=>{const {A,b,land,water}=__duck;A.life.interrupt('test');b.eating=0;b.x=land.x;b.z=land.z;b.goal={x:land.x+3,z:land.z};b.y=A.ducks.habitat.surface(b.x,b.z).y;A.ducks.update(.1,false);const roll=A.ducks.animals[0].mesh.rotation.z;A.ducks.update(.1,false);const change=Math.abs(A.ducks.animals[0].mesh.rotation.z-roll);for(let i=0;i<A.ducks.animals.length;i++){const a=A.ducks.animals[i],p=A.ducks.habitat.goal('swim',.2+i*.2,.5);a.brain.x=p.x;a.brain.z=p.z;a.brain.y=A.ducks.habitat.surface(p.x,p.z).y;a.brain.goal={x:p.x+4,z:p.z};}A.ducks.update(.1,false);A.player.spawn(water.x,water.z-13,0);A.step(0);A.camera.position.set(water.x+3,A.ducks.habitat.surface(water.x,water.z).y+4.5,water.z-7);const v=A.ducks.animals[1].mesh.position.clone().add({x:0,y:.3,z:0}).sub(A.camera.position);A.camera.rotation.set(Math.atan2(v.y,Math.hypot(v.x,v.z)),Math.atan2(-v.x,-v.z),0,'YXZ');A.camera.updateMatrixWorld(true);return{change,swimming:A.ducks.animals.every(a=>a.brain.swimming),quacks:A.ducks.quacks};});
 check(motion.change>.01&&motion.swimming,'actual body/bottom waddle changes in walking; all four float on water',motion);
 await kit.shot(page,path.join(out,'ducks-swimming-river.png'));
 await page.evaluate(()=>__app.ducks.animals.forEach(a=>a.mesh.visible=false));await kit.shot(page,path.join(out,'river-without-ducks-control.png'));
 const mute=await page.evaluate(async()=>{const {sfx,toggleMuted}=await import('/src/audio.js');toggleMuted();const before=__duckAudio.osc;sfx.quack(__app.camera.position);const unchanged=__duckAudio.osc===before;toggleMuted();return unchanged;});check(mute,'global mute prevents quack synthesis');
 const bounded=await page.evaluate(()=>{const {A}=__duck;const poses=A.ducks.animals.map(a=>a.brain.x);A.camera.position.set(999,50,999);A.ducks.update(1,false);const sleep=A.ducks.animals.every((a,i)=>!a.mesh.visible&&a.brain.x===poses[i]);return{sleep,quacks:A.ducks.quacks};});
 check(bounded.sleep&&bounded.quacks<8,'far flock is invisible and not simulated; quacks stay rate limited',bounded);check(!errors.length,'no browser page errors',errors);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({pass,results},null,2));
}finally{await browser.close();}if(!pass)process.exitCode=1;})().catch(e=>{console.error(e);process.exit(1);});
