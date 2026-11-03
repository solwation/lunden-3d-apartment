// #1839: actual rendered river, seeded pairs/groups, four-mesh budget and real pantry/native-E feeding at second reach.
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const [base='http://localhost:8910',out='docs/verification/1839']=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const result={checks:[],errors:[],scope:'Actual original app; deterministic seeded AI time and controlled bank cameras/spawns, no full walking route or physical-device/FPS claim.'};
const save=()=>fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2));
const check=(ok,label,data)=>{result.checks.push({ok:!!ok,label,data});save();console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)throw Error(label);};
(async()=>{const browser=await kit.launch();try{
 const page=await browser.newPage({viewport:kit.SMALL,hasTouch:true});page.on('pageerror',e=>{result.errors.push(e.message);save()});
 await page.goto(base+'/?life&shot&cloud=&month=6&time=13&freeze&weather=clear&test=lazy',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__app?.ducks,null,{polling:100,timeout:180000});await kit.skipNameDialog(page);
 await page.evaluate(()=>__app.showOverlay(true));if(await page.locator('#start-go').isVisible())await page.locator('#start-go').click();else await page.locator('#start-touch').click();
 const scan=await page.evaluate(async()=>{
  const A=__app,D=A.ducks,T=await import('three'),{DuckFlock,DUCKS}=await import('/src/duckbrain.js'),R=await import('/src/riverbridge.js'),S=await import('/src/surroundings.js');A.renderer.setAnimationLoop(null);A.touch.enabled=true;
  const fresh=new DuckFlock(D.habitat);D.flock.time=0;for(let i=0;i<4;i++)Object.assign(D.animals[i].brain,fresh.brains[i]);
  const snapshot=()=>D.animals.map(a=>Object.fromEntries(Object.entries(a.brain).filter(([k])=>!['habitat','home'].includes(k))));
  const restore=s=>{s.forEach((b,i)=>Object.assign(D.animals[i].brain,b));D.update(0,false);};
  const initial=snapshot(),terrain=A.scene.getObjectByName('site-terrain');if(!terrain)throw Error('missing actual terrain');A.scene.updateMatrixWorld(true);
  const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),samples=[];let invalid=0,best=null,bestRadius=Infinity,maxPair=0;
  for(let i=0;i<4000;i++){
   D.flock.update(.05);
   for(const {brain:b}of D.animals)invalid+=!D.habitat.contains(b.x,b.z);
   const lead=D.animals[0].brain,radius=Math.max(...D.animals.map(({brain:b})=>Math.hypot(b.x-lead.x,b.z-lead.z)));
   if(D.flock.grouped&&radius<bestRadius){bestRadius=radius;best=snapshot();}
   for(let j=0;j<4;j+=2)maxPair=Math.max(maxPair,Math.hypot(D.animals[j].brain.x-D.animals[j+1].brain.x,D.animals[j].brain.z-D.animals[j+1].brain.z));
   if(i%200===0)for(const {brain:b}of D.animals){ray.set(new T.Vector3(b.x,30,b.z),down);const hit=ray.intersectObject(terrain,false)[0];samples.push({x:b.x,z:b.z,y:b.y,water:b.swimming,drawn:hit?.point.y??null,callback:D.ground(b.x,b.z),waterY:R.waterYAt(b.x,b.z),along:R.riverAt(b.x,b.z).along-D.habitat.origin});}
  }
  window.duckRange={A,D,T,R,S,initial,best,snapshot,restore,frames(n){for(let i=0;i<n;i++)A.step(1/60)},aim(index=2){const b=D.animals[index].brain;A.player.spawn(b.x+1.3,b.z-.9,0);A.step(0);const v=D.animals[index].pick.position.clone().sub(A.camera.position);A.camera.rotation.set(Math.atan2(v.y,Math.hypot(v.x,v.z)),Math.atan2(-v.x,-v.z),0,'YXZ');A.step(0);A.step(0);return A.focus().focused?.kind},view(indices){
   const bs=indices.map(i=>D.animals[i].brain),x=bs.reduce((n,b)=>n+b.x,0)/bs.length,z=bs.reduce((n,b)=>n+b.z,0)/bs.length,y=bs.reduce((n,b)=>n+b.y,0)/bs.length,along=R.riverAt(x,z).along-D.habitat.origin,cam=D.habitat.point(along+3,'walk',.95);
   A.player.spawn(cam.x,cam.z,0);A.camera.position.set(cam.x,D.ground(cam.x,cam.z)+1.05,cam.z);A.camera.fov=52;A.camera.updateProjectionMatrix();A.camera.lookAt(x,y+.32,z);D.update(0,false);A.camera.updateMatrixWorld();return{camera:A.camera.position.toArray(),target:[x,y+.32,z],along,bank:D.habitat.contains(cam.x,cam.z)&&!D.habitat.surface(cam.x,cam.z).water};}};
  restore(initial);
  return{invalid,maxPair,bestRadius,hasGroup:!!best,initial:initial.map(b=>({x:b.x,z:b.z,female:b.female,id:b.id,mate:b.mate})),samples};
 });
 check(scan.invalid===0&&scan.hasGroup&&scan.maxPair<3.1,'actual park-ground AI forms a bounded group and stable pairs without leaving habitat',scan);
 check(scan.samples.every(s=>s.drawn!==null&&s.y>=s.drawn-.14&&s.y<=s.waterY+1.65+.001),'actual emitted terrain rays: all sampled bodies remain above drawn ground and below valley-side height');
 const dry=scan.samples.filter(s=>!s.water);check(dry.length>0&&dry.every(s=>s.y-s.drawn<.12),'walking feet stay within12cm of actual drawn terrain',dry.map(s=>s.y-s.drawn));
 result.views=[];
 for(const[name,indices]of [['familiar-pair',[0,1]],['downstream-pair',[2,3]]]){const view=await page.evaluate(indices=>duckRange.view(indices),indices);check(view.bank,'inspection camera stands on valid dry bank: '+name,view);await kit.shot(page,path.join(out,name+'.png'),{frames:1});result.views.push({name,...view});}
 check(Math.abs(result.views[1].along-result.views[0].along)>40,'two actual river reaches more than40m apart');
 await page.evaluate(()=>duckRange.restore(duckRange.best));const groupView=await page.evaluate(()=>duckRange.view([0,1,2,3]));await kit.shot(page,path.join(out,'loose-group.png'),{frames:1});result.views.push({name:'loose-group',...groupView});
 const budget=await page.evaluate(()=>{const{A,D}=duckRange;A.testMode.setFull(true);A.renderer.info.reset();A.renderer.render(A.scene,A.camera);const shown={...A.renderer.info.render};const flags=D.animals.map(a=>a.mesh.visible);D.animals.forEach(a=>a.mesh.visible=false);A.renderer.info.reset();A.renderer.render(A.scene,A.camera);const hidden={...A.renderer.info.render};D.animals.forEach((a,i)=>a.mesh.visible=flags[i]);A.testMode.setFull(false);return{shown,hidden,deltaCalls:shown.calls-hidden.calls,deltaTriangles:shown.triangles-hidden.triangles,meshes:D.animals.length,geometries:new Set(D.animals.map(a=>a.mesh.geometry)).size,materials:new Set(D.animals.map(a=>a.mesh.material)).size};});
 check(budget.deltaCalls===4&&budget.deltaTriangles===2560&&budget.materials===1,'actual group view uses original4 draws/2560tri, one shared material',budget);
 const gates=await page.evaluate(()=>{const{A,D,snapshot}=duckRange;const before=JSON.stringify(snapshot());D.update(.1,true);const hidden=D.animals.every(a=>!a.mesh.visible)&&JSON.stringify(snapshot())===before;A.camera.position.set(1000,100,1000);D.update(.1,false);const far=D.animals.every(a=>!a.mesh.visible)&&JSON.stringify(snapshot())===before;return{hidden,far};});check(gates.hidden&&gates.far,'hidden and far distance gates suspend AI and rendering',gates);
 await page.evaluate(()=>{duckRange.restore(duckRange.initial);duckRange.aim(2);__app.activeMode='mouse';document.getElementById('game-canvas').requestPointerLock()});await page.waitForFunction(()=>!!document.pointerLockElement,null,{timeout:10000});
 const count=await page.evaluate(()=>__app.stats.duckFeeds);await page.keyboard.press('KeyE');check(await page.evaluate(count=>__app.stats.duckFeeds===count,count),'native E at second reach without bread grants no feed');
 const bread=await page.evaluate(()=>{const{A}=duckRange;A.player.spawn(4.35,2.75,-Math.PI/2);A.step(0);const bag=A.life.items.ofType('breadBag').find(i=>i.place.at==='slot'&&i.place.store==='pantry');if(!bag)throw Error('missing pantry bread');const door=A.world.lids.find(l=>l.stock==='pantry');if(!door.isOpen)A.use(door);duckRange.frames(45);const target={instance:bag};A.life.options(target).find(a=>a.id==='open')?.run();const dispense=A.life.options(target).find(a=>a.id==='dispense');if(!dispense||dispense.reason)throw Error(dispense?.reason||'no dispense');dispense.run();duckRange.frames(90);return{held:A.heldItem()?.item?.type,amount:A.heldItem()?.item?.amount,bag:bag.amount};});check(bread.held==='breadSlice'&&bread.amount===1&&bread.bag===11,'real kitchen bag dispenses one finite plain slice',bread);
 const before=await page.evaluate(()=>{duckRange.restore(duckRange.initial);const focused=duckRange.aim(2);return{focused,count:__app.stats.duckFeeds,score:__app.totalScore()};});check(before.focused==='duck','real held bread can focus second-reach female');await page.keyboard.press('KeyE');
 const fed=await page.evaluate(()=>({amount:__app.heldItem()?.item?.amount,count:__app.stats.duckFeeds,score:__app.totalScore(),feeds:__app.ducks.feeds}));check(fed.amount===.75&&fed.count===before.count+1&&fed.score===before.score+6&&fed.feeds===1,'native E at new reach consumes one bite and preserves feed/score callback',fed);
 await page.keyboard.press('KeyE');check(await page.evaluate(n=>__app.stats.duckFeeds===n&&__app.heldItem()?.item?.amount===.75,fed.count),'existing chewing cooldown rejects duplicate E');await kit.shot(page,path.join(out,'downstream-fed.png'),{frames:1});
 check(result.errors.length===0,'zero page errors',result.errors);result.ok=true;save();
}finally{await browser.close();}})().catch(e=>{result.error=e.stack;save();console.error(e);process.exitCode=1;});
