// #1396: actual World/ponies, natural walks and meals, native touch pet, seasons/rain/culling.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs');
const [base='http://localhost:8137',out='/tmp/paddock-feed']=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const mobileOnly=process.argv.includes('--mobile-only');
let failed=0;const check=(ok,name,data)=>{console.log(`${ok?'PASS':'FAIL'} ${name} ${JSON.stringify(data)}`);if(!ok)failed++;};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:mobileOnly?{width:844,height:390}:{width:1100,height:750},isMobile:mobileOnly,hasTouch:mobileOnly}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|THREE|WebGL/.test(m.text()))errors.push(m.text());});
 await page.goto(base+'/?shot&quality=3&time=12&month=7&weather=clear&freeze&cloud=',{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app?.paddock,null,{timeout:420000});
 await page.evaluate(()=>{
  const a=__app,P=a.paddock,s=P.spots.shelter;a.renderer.setAnimationLoop(null);a.showOverlay(false);
  const sn=Math.sin(s.yaw),cs=Math.cos(s.yaw),point=(x,z)=>[s.x+x*cs+z*sn,s.z-x*sn+z*cs];
  window.feedTest={a,P,point,draw(){a.renderer.render(a.scene,a.camera);},view(x=2,z=5,y=1.6){const [wx,wz]=point(x,z);a.player.spawn(wx,wz,0);a.step(0);a.camera.position.set(wx,P.ground(wx,wz)+y,wz);a.camera.lookAt(s.x,P.ground(s.x,s.z)+.7,s.z);a.camera.updateMatrixWorld(true);},run(n,rain=0){for(let i=0;i<n;i++)P.update(.1,false,rain);},state(){return{amount:[...P.feed.amount],eaten:[...P.feed.eaten],ponies:P.ponies.map(p=>({name:p.name,state:p.state,x:p.x,z:p.z,neck:p.neck,scale:p.scale,goal:p.feedGoal,spot:p.spot?.kind}))};}};
  feedTest.view();P.update(0);feedTest.draw();
 });
 if(mobileOnly){
  const mobile=await page.evaluate(()=>{const {P}=feedTest;for(let i=0;i<1200;i++){P.update(.1);if(P.ponies[0].state==='feed'&&P.ponies[0].neck>1.4&&P.feed.amount[0]<.8)break;}feedTest.draw();return{...feedTest.state(),width:innerWidth,height:innerHeight};});
  check(mobile.width===844&&mobile.height===390&&mobile.ponies[0].state==='feed','native landscape phone meal',mobile);await page.screenshot({path:out+'/5-mobile.png'});process.exitCode=failed?1:0;return;
 }
 const start=await page.evaluate(()=>feedTest.state());check(start.amount.every(x=>x===1),'two full hay portions at the actual shelter frame',start);await page.screenshot({path:out+'/1-portions-before.png'});
 await page.evaluate(async()=>{feedTest.contact=async()=>{
  const {P}=feedTest,T=await import('three'),{PADDOCK:C}=await import('/src/config.js'),g=P.mesh.geometry,rows=[];
  P.ponies.forEach((p,i)=>{const neck=new T.Vector3(...C.pony.neck),tip=neck.clone().add(new T.Vector3(0,Math.cos(.66),Math.sin(.66)).multiplyScalar(.72)),points=[];const about=(v,o,axis,angle)=>v.sub(o).applyAxisAngle(axis,angle).add(o),X=new T.Vector3(1,0,0),Y=new T.Vector3(0,1,0),m=new T.Matrix4();P.mesh.getMatrixAt(i,m);
   for(let k=0;k<g.attributes.position.count;k++)if(g.attributes.aPart.getX(k)===2&&Math.abs(g.attributes.color.getX(k)-.45)<.01){const v=new T.Vector3().fromBufferAttribute(g.attributes.position,k);about(v,tip,X,-p.neck*.55);about(v,tip,Y,p.headYaw*.6);about(v,neck,X,p.neck);about(v,neck,Y,p.headYaw*.4);points.push(v.applyMatrix4(m));}
   const mouth=new T.Box3().setFromPoints(points),s=P.feed.slots[i],b=new T.Box3(new T.Vector3(s.x-C.feed.w/2,s.y+C.feed.base,s.z-C.feed.w/2),new T.Vector3(s.x+C.feed.w/2,s.y+C.feed.base+(C.feed.h+C.feed.mound)*P.feed.amount[i],s.z+C.feed.w/2));const center=mouth.getCenter(new T.Vector3());rows.push({mouth:mouth.min.toArray().concat(mouth.max.toArray()),portion:[s.x,s.y,s.z],distance:b.distanceToPoint(center),scale:p.scale});});return rows;

 };feedTest.contacts=[null,null];});
 const meal={walking:[false,false],feeding:[false,false],outside:0};
 for(let tick=0;tick<1600;tick++){
  const snap=await page.evaluate(async()=>{const {P}=feedTest,{insideFence}=await import('/src/paddockgeo.js');P.update(.1);return{...feedTest.state(),outside:P.ponies.some(p=>!insideFence(p.x,p.z,1))};});
  meal.outside+=snap.outside?1:0;
  for(let j=0;j<2;j++){
   meal.walking[j] ||= snap.ponies[j].state==='walk'&&snap.ponies[j].goal===j;
   if(!meal.feeding[j]&&snap.ponies[j].state==='feed'&&snap.ponies[j].neck>1.4&&snap.amount[j]<.8&&snap.amount[j]>.2){
    meal.feeding[j]=true;await page.evaluate(async j=>{feedTest.contacts[j]=(await feedTest.contact())[j];if(j===1){const {a,P,point}=feedTest,[x,z]=point(3,2.8),p=P.ponies[j];a.camera.position.set(x,P.ground(x,z)+1.4,z);a.camera.lookAt(p.x,p.y+.7,p.z);a.camera.updateMatrixWorld(true);}feedTest.draw();},j);
    await page.screenshot({path:out+`/2-${j===0?'zoey':'princess'}-eating.png`});
   }
  }
  if(meal.feeding.every(Boolean))break;
 }
 Object.assign(meal,await page.evaluate(()=>feedTest.state()));
 check(meal.walking.every(Boolean)&&meal.feeding.every(Boolean)&&meal.outside===0,'both real ponies walk to their own portions and consume hay',meal);
 const contact=await page.evaluate(()=>feedTest.contacts);
 check(contact.every(c=>c.distance<.2&&c.scale===1),'actual animated muzzle vertices reach the hay at original pony scale',contact);
 // Native main focus/use on one eating pony: stop, pause consumption, then return.
 const focus=await page.evaluate(()=>{const {a,P}=feedTest,p=P.ponies[1],s=P.spots.shelter;a.player.spawn(p.x+Math.sin(s.yaw)*1.1,p.z+Math.cos(s.yaw)*1.1,0);a.touch.enabled=true;a.showOverlay(false);a.step(0);a.camera.lookAt(p.x,p.y+.85,p.z);a.camera.updateMatrixWorld(true);a.step(0);return a.focus().focused?.kind;});
 check(focus==='pony','the eating pony retains its actual pet target',focus);await page.locator('#action').click();
 const pat=await page.evaluate(()=>{const {P}=feedTest,before=P.feed.amount[1],pet=P.ponies[1].state;feedTest.run(10);const paused=P.feed.amount[1]===before;let resumed=false;for(let i=0;i<300;i++){P.update(.1);resumed ||= P.feed.amount[1]<before-.01;}return{pet,paused,resumed,...feedTest.state()};});
 check(pat.pet==='pet'&&pat.paused&&pat.resumed,'native pet pauses food consumption and the pony returns to its meal',pat);
 await page.evaluate(()=>{feedTest.run(250);feedTest.view();feedTest.draw();});const ended=await page.evaluate(()=>feedTest.state());
 check(ended.eaten.every(x=>x>.8)&&ended.amount.every(x=>x<.08)&&ended.ponies.every(p=>p.state!=='feed'&&p.goal==null),'consumed portions visibly shrink and finished meals release their goals',ended);await page.screenshot({path:out+'/3-portions-after.png'});
 const culling=await page.evaluate(()=>{const {P,a}=feedTest,before=JSON.stringify([P.feed.time,[...P.feed.amount],[...P.feed.eaten]]),x=a.camera.position.x;a.camera.position.x+=2000;P.update(.1);const far=!P.feed.mesh.visible&&before===JSON.stringify([P.feed.time,[...P.feed.amount],[...P.feed.eaten]]);a.camera.position.x=x;P.update(.1,true);const underground=!P.feed.mesh.visible;P.update(.1,false);return{far,underground,returned:P.feed.mesh.visible};});check(Object.values(culling).every(Boolean),'distance and underground culling freeze food and restore its mesh',culling);
 const winter=await page.evaluate(()=>{const {a,P}=feedTest;a.day.month=1;a.step(0);feedTest.run(3000);const sheltered=P.ponies.every((p,i)=>!p.gone&&p.scale===1&&p.spot===P.stable(i)&&Math.hypot(p.x-P.stable(i).x,p.z-P.stable(i).z)<.2);const before=[...P.feed.eaten];feedTest.run(1500);const ate=P.feed.eaten.map((n,i)=>n>before[i]);feedTest.view();feedTest.draw();return{sheltered,ate,...feedTest.state()};});
 check(winter.sheltered&&winter.ate.every(Boolean),'winter occupants stay full-size in their roof stalls and eat again after refill',winter);await page.screenshot({path:out+'/4-winter.png'});
 const rain=await page.evaluate(()=>{const {a,P}=feedTest;a.day.month=7;a.step(0);feedTest.run(1800,.8);const shelter=P.ponies.every(p=>!p.seek||p.spot&&Math.hypot(p.x-p.spot.x,p.z-p.spot.z)<1.2);const positions=P.ponies.map(p=>[p.x,p.z]);feedTest.run(500,.8);const stay=P.ponies.every((p,i)=>!p.seek||Math.hypot(p.x-positions[i][0],p.z-positions[i][1])<1.5);feedTest.run(3000,0);let grass=false;const s=P.spots.shelter;a.camera.position.set(s.x+80,P.ground(s.x,s.z)+2,s.z);for(let i=0;i<1500;i++){P.update(.1);grass ||= P.ponies.some(p=>p.state==='graze');}return{shelter,stay,grass,dry:P.ponies.every(p=>!p.spot),...feedTest.state()};});
 check(rain.shelter&&rain.stay&&rain.dry&&rain.grass,'rain shelter/dry release and ordinary grass grazing remain available',rain);
 const cost=await page.evaluate(()=>{const {P,a}=feedTest;feedTest.view();P.update(0);const count=()=>{a.renderer.info.reset();a.renderer.render(a.scene,a.camera);return{calls:a.renderer.info.render.calls,tris:a.renderer.info.render.triangles};},on=count();P.feed.mesh.visible=false;const off=count();P.feed.mesh.visible=true;feedTest.draw();return{calls:on.calls-off.calls,tris:on.tris-off.tris,geometry:P.feed.mesh.geometry.attributes.position.count/3,instances:P.feed.mesh.count};});
 check(cost.calls===1&&cost.tris<=700&&cost.instances===2,'both feeders share one bounded instanced draw with no textures/lights',cost);
 await page.setViewportSize({width:844,height:390});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.evaluate(()=>{feedTest.view(2,5);feedTest.draw();});await page.screenshot({path:out+'/5-mobile.png'});
 check(errors.length===0,'no page or shader errors',errors);
 fs.writeFileSync(out+'/result.json',JSON.stringify({start,meal,contact,pat,ended,culling,winter,rain,cost,errors},null,2));
}finally{await browser.close();}console.log(failed?`${failed} FAILED`:'ALL PASSED');process.exitCode=failed?1:0;})();
