// Actual SwingDoor builders from plan.json, bounded component rather than World.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://localhost:8904',out=process.argv[3]||'/tmp/lunden-doors1044-20261015/candidate',baseline=process.argv.includes('--baseline');
fs.mkdirSync(out,{recursive:true});
const checks=[],images=[],errors=[],sources={};
for(const name of ['src/doors.js','src/doorfittings.js','src/world.js','src/config.js','data/plan.json','tools/doorfittingstest.cjs'])sources[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',name))).digest('hex');
const check=(ok,label,data)=>{checks.push({ok,label,data});console.log(`${ok?'PASS':'FAIL'} ${label}`);assert.ok(ok,label);};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:{width:1000,height:760}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js*',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 if(baseline){const body=fs.readFileSync(process.env.BASELINE_DIR+'/doors.js');sources['baseline/doors.js']=crypto.createHash('sha256').update(body).digest('hex');await page.route('**/src/doors.js',r=>r.fulfill({body,contentType:'application/javascript'}));}
 await page.goto(base+'/?cloud=');
 const result=await page.evaluate(async baseline=>{
  const T=await import('three'),{SwingDoor}=await import('/src/doors.js'),{fitPrivacyDoors}=await import('/src/doorfittings.js'),{RoomMap}=await import('/src/rooms.js'),C=await import('/src/config.js'),{mergeStatic}=await import('/src/merge.js');
  const plan=await(await fetch('/data/plan.json')).json();
  const selections=[['bedroom',1,0],['bathroom',0,3],['wc',1,2],['entrance',0,0]];
  const scene=new T.Scene();scene.background=new T.Color(0xe6e4e0);
  scene.add(new T.HemisphereLight(0xe8f1ff,0xc0ad90,2.2));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-3,5,-4);scene.add(light);
  const camera=new T.PerspectiveCamera(42,1000/760,.02,20),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,760);renderer.toneMapping=T.NeutralToneMapping;
  renderer.domElement.style.cssText='position:fixed;inset:0;z-index:10000';document.body.append(renderer.domElement);
  const count=root=>{let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return{meshes,triangles};};
  const doors=selections.map(([name,li,index])=>{
   const floor=plan.floors[li],entrance=name==='entrance',door=new SwingDoor(floor.doors[index],0,new T.MeshStandardMaterial({color:0xf3f0e8,roughness:.7}),false,{entrance});door.exterior=entrance;
   const barriers=floor.walls.map(w=>({x0:Math.min(...w.outer.map(p=>p[0])),x1:Math.max(...w.outer.map(p=>p[0])),z0:Math.min(...w.outer.map(p=>p[1])),z1:Math.max(...w.outer.map(p=>p[1]))}));
   for(const d of floor.doors)barriers.push({x0:Math.min(d.hinge[0],d.wall[0])-.025,x1:Math.max(d.hinge[0],d.wall[0])+.025,z0:Math.min(d.hinge[1],d.wall[1])-.025,z1:Math.max(d.hinge[1],d.wall[1])+.025});
   const rooms=new RoomMap(floor.size,[...barriers,...C.ROOM_DIVIDERS.filter(r=>r.level===li),...C.EXTRA_WALLS.filter(r=>r.level===li)], [...floor.rooms,...C.EXTRA_ROOMS.filter(r=>r.level===li)]);
   if(!baseline)fitPrivacyDoors([door],(x,z)=>rooms.at(x,z));
   const pivot=new T.Group();pivot.position.copy(door.object.position);pivot.rotation.y=door.closedAngle;
   const wall=new T.MeshStandardMaterial({color:0xc9c6bf,roughness:.8});
   for(const z of [-.045,door.len+.045]){const m=new T.Mesh(new T.BoxGeometry(.13,2.15,.08),wall);m.position.set(0,1.075,z);pivot.add(m);}scene.add(pivot,door.object);if(door.strike)scene.add(door.strike);
   const raw=count(door.object);
   mergeStatic(door.object,[],()=>'',{tagged:true});
   return{name,door,pivot,raw};
  });
  const test=doors.map(({name,door,raw})=>{
   const before=door.segment(),opening=door.opening(),strike=door.strike?JSON.stringify([door.strike.position.toArray(),door.strike.rotation.toArray()]):null;door.toggle();for(let i=0;i<40;i++)door.update(1/60);scene.updateMatrixWorld(true);
   const open=door.isOpen&&door.t===1,hinge=door.segment().slice(0,2).every((v,i)=>v===before[i]);const openSegment=door.segment();
   const stationary=!strike||strike===JSON.stringify([door.strike.position.toArray(),door.strike.rotation.toArray()]);
   door.toggle();for(let i=0;i<40;i++)door.update(1/60);scene.updateMatrixWorld(true);
   const rays=[-1,1].map(side=>{const p=new T.Vector3(side*.3,1,door.len-.065).applyMatrix4(door.object.matrixWorld),target=new T.Vector3(0,1,door.len-.065).applyMatrix4(door.object.matrixWorld);return new T.Raycaster(p,target.sub(p).normalize(),0,1).intersectObject(door.pickable,true)[0]?.object.userData.door===door;});
   return{name,raw,open,hinge,stationary,restored:JSON.stringify(before)===JSON.stringify(door.segment()),openingUnchanged:JSON.stringify(opening)===JSON.stringify(door.opening()),moved:JSON.stringify(before)!==JSON.stringify(openSegment),rays,privacy:door.hardware?.name==='privacy-fittings',...count(door.object),strike:door.strike?count(door.strike):null};
  });
  window.fixture={doors,renderer,scene,camera,T,shoot(name,side=1,open=false){for(const entry of doors){entry.door.object.visible=entry.pivot.visible=entry.name===name;if(entry.door.strike)entry.door.strike.visible=entry.name===name;}const entry=doors.find(e=>e.name===name),d=entry.door;d.t=d.target=open?1:0;d.apply();scene.updateMatrixWorld(true);const position=new T.Vector3(side*.85,1.23,d.len-.32).applyMatrix4(d.object.matrixWorld),target=new T.Vector3(0,.98,d.len-.10).applyMatrix4(d.object.matrixWorld);if(open){position.set(side*.75,1.12,d.len-.35).applyMatrix4(entry.pivot.matrixWorld);target.set(0,1,d.len).applyMatrix4(entry.pivot.matrixWorld);}camera.position.copy(position);camera.lookAt(target);renderer.render(scene,camera);return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}};
  return test;
 },baseline);
 for(const r of result){check(r.open&&r.hinge&&r.stationary&&r.restored&&r.openingUnchanged&&r.moved&&r.rays.every(Boolean),r.name+' real swing animation, closed opening, collision segment and both raycast faces',r);if(!baseline&&['bathroom','wc'].includes(r.name))check(r.privacy,r.name+' thumbturn selected by real RoomMap');}
 for(const [name,side,open] of [['bedroom',1,false],['bathroom',-1,false],['wc',1,false],['entrance',1,false],['entrance',1,true],['entrance',-1,false]]){const metrics=await page.evaluate(args=>fixture.shoot(...args),[name,side,open]);const file=`${name}-${side===1?'front':'back'}${open?'-open':''}.png`;await page.screenshot({path:path.join(out,file)});images.push({file,metrics});}
 if(!baseline)check(await page.evaluate(()=>{const a=fixture.doors[0].door.hardware.geometry;return a===(new (fixture.doors[0].door.constructor)({hinge:[0,0],tip:[0,1],wall:[1,0]},0,new fixture.T.MeshStandardMaterial(),false)).hardware.geometry;}),'identical leaves share fitting geometry');
 check(!errors.length,'no browser exceptions',errors);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({baseline,checks,result,images,sources,limits:'Actual production SwingDoor and plan leaves, RoomMap and privacy binding; nominal plan widths with illustrative jambs and component lighting. No full World, E/touch dispatcher, physical phone or FPS evidence.'},null,2));
 await page.evaluate(()=>fixture.renderer.dispose());
}finally{await browser.close();}})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.stack);console.error(e);process.exitCode=1;});
