// #1152: actual Garage constructor/leaf batches/targets/movement, bounded WebGL scene without World.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8795',out='/tmp/lunden-glass1152-codex/after',baseline]=process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];try{
  const p=await browser.newPage({viewport:{width:800,height:600}});p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/src/bootstrap.js',r=>r.fulfill({body:'// bounded actual module fixture',contentType:'text/javascript'}));
  if(baseline)await p.route('**/src/garage.js',r=>r.fulfill({body:fs.readFileSync(baseline,'utf8'),contentType:'text/javascript'}));
  await p.goto(base);
  await p.evaluate(async()=>{
   window.T=await import('three');const {Garage}=await import('/src/garage.js');window.C=await import('/src/config.js');
   window.garage=new Garage({rideableRows:[]});window.scene=new T.Scene();scene.background=new T.Color('#9fb9c9');scene.add(garage.object,garage.parkObject);
   scene.add(new T.HemisphereLight(0xffffff,0x585747,2));const sun=new T.DirectionalLight(0xffffff,2);sun.position.set(5,8,3);scene.add(sun);
   window.camera=new T.PerspectiveCamera(48,800/600,.05,100);window.renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(800,600);renderer.setPixelRatio(1);document.body.replaceChildren(renderer.domElement);document.body.style.margin='0';
   window.doors=garage.cageDoors.filter(d=>d.rect?.door?.park);
   window.player={pos:new T.Vector3(),below:false,inCore:false};
   window.snapshot=(i,open,inside=false)=>{
    const d=doors[i],t=garage.targets.find(t=>t.door===d),mid=new T.Vector3(d.hx+d.dir[0]*d.w/2,C.GARAGE.floor+1.1,d.hz+d.dir[1]*d.w/2);
    if(t.isOpen!==open)t.toggle();
    player.pos.copy(mid).setY(C.GARAGE.floor).add(new T.Vector3(d.out[0]*1.5,0,d.out[1]*1.5));
    camera.position.copy(mid).add(new T.Vector3(d.out[0]*(inside?-2.5:3.1),.2,d.out[1]*(inside?-2.5:3.1)));camera.lookAt(mid);
    for(let k=0;k<40;k++)garage.update(.05,player,camera);
    for(const a of Object.values(garage.areas))garage.setLevel(a,1);
    scene.updateMatrixWorld(true);renderer.render(scene,camera);renderer.getContext().finish();
    const frame=new T.Matrix4(),glass=new T.Matrix4();d.inst.getMatrixAt(d.index,frame);garage.parkGlass?.getMatrixAt(d.index,glass);
    const origin=mid.clone().add(new T.Vector3(d.out[0]*.3,.2,d.out[1]*.3));const ray=new T.Raycaster(origin,new T.Vector3(-d.out[0],0,-d.out[1]),0,.6);
    const hit=m=>{if(!m)return 0;const old=m.raycast;m.raycast=T.InstancedMesh.prototype.raycast;try{return ray.intersectObject(m).filter(h=>h.instanceId===d.index).length;}finally{m.raycast=old;}};
    return {id:d.rect.id,open,angle:d.angle,frame:frame.toArray(),glass:garage.parkGlass?glass.toArray():null,metalHits:hit(d.inst),glassHits:hit(garage.parkGlass),segment:d.segment.slice(),out:d.out,dir:d.dir,w:d.w,hinge:[d.hx,d.hz],calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
   };
  });
  const samples=[];
  for(let i=0;i<2;i++)for(const open of [false,true,false]){
   const s=await p.evaluate(({i,open})=>snapshot(i,open),{i,open});samples.push(s);
   assert.ok(Math.abs(s.angle-(open?1.55:0))<1e-5,'actual door animation completes');assert.deepEqual(s.segment.slice(0,2),s.hinge,'collision hinge stays fixed');
   const dx=s.dir[0]*Math.cos(s.angle)+s.out[0]*Math.sin(s.angle),dz=s.dir[1]*Math.cos(s.angle)+s.out[1]*Math.sin(s.angle);
   assert.ok(Math.hypot(s.segment[2]-s.hinge[0]-dx*s.w,s.segment[3]-s.hinge[1]-dz*s.w)<1e-8,'collision follows existing rotated full leaf');
   if(!baseline){assert.deepEqual(s.glass,s.frame,'pane follows exact production leaf instance matrix');if(!open){assert.equal(s.metalHits,0,'real opaque geometry has an opening');assert.ok(s.glassHits>0,'real glass covers that opening');}}
   else if(!open)assert.ok(s.metalHits>0,'baseline was an opaque metal leaf');
   await p.screenshot({path:`${out}/${s.id}-${open?'open':'closed'}-outside.png`});
   if(!open){await p.evaluate(i=>snapshot(i,false,true),i);await p.screenshot({path:`${out}/${s.id}-closed-inside.png`});}
  }
  const meta=await p.evaluate(()=>({park:doors.map(d=>({id:d.rect.id,w:d.w,hx:d.hx,hz:d.hz,dir:d.dir,out:d.out})),internalCount:garage.cageDoors.filter(d=>d.steel&&!d.rect?.door?.park).length,internalTriangles:garage.steelLeaves.geometry.attributes.position.count/3,parkTriangles:garage.parkLeaves.geometry.attributes.position.count/3,glassTriangles:garage.parkGlass?(garage.parkGlass.geometry.index?.count??garage.parkGlass.geometry.attributes.position.count)/3:0,glassOpacity:garage.parkGlass?.material.opacity,glassDepthWrite:garage.parkGlass?.material.depthWrite,courtyardCollision:garage.parkDoorSegments(0).length,basementCollision:garage.parkDoorSegments(-3).length}));
  const isolated=await p.evaluate(()=>{const visible=garage.object.visible;garage.object.visible=false;renderer.render(scene,camera);const withGlass={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};if(garage.parkGlass)garage.parkGlass.visible=false;renderer.render(scene,camera);const withoutGlass={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};if(garage.parkGlass)garage.parkGlass.visible=true;garage.object.visible=visible;return {withGlass,withoutGlass};});
  if(!baseline){assert.equal(isolated.withGlass.calls-isolated.withoutGlass.calls,1);assert.equal(isolated.withGlass.triangles-isolated.withoutGlass.triangles,24);}
  assert.equal(meta.park.length,2);assert.equal(meta.courtyardCollision,0);assert.equal(meta.basementCollision,2);if(!baseline){assert.ok(meta.glassOpacity>0&&meta.glassOpacity<1);assert.equal(meta.glassDepthWrite,false);}
  assert.deepEqual(errors,[]);const hashes=Object.fromEntries(['src/config.js','src/garage.js','tools/parkdoorglasstest.cjs'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
  fs.writeFileSync(`${out}/result.json`,JSON.stringify({baseline:!!baseline,baselineHash:baseline?crypto.createHash('sha256').update(fs.readFileSync(baseline)).digest('hex'):null,meta,isolated,samples,errors,hashes,scope:'Actual Garage with its own update/targets/geometry, bounded component scene. No full World/facade/input/physical phone/FPS claim.'},null,2));console.log('PASS actual A/B park door geometry, pane, animation, collision and open/closed renders');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
