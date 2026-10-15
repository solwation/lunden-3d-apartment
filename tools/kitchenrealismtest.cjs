// #1043: production kitchen builders + Lights/DayCycle, bounded component, never buildWorld.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://localhost:8895',out=process.argv[3]||'/tmp/lunden-reports-1043/candidate';
const baseline=process.argv.includes('--baseline'),render=!process.argv.includes('--no-render');
const baselineDir=process.env.BASELINE_DIR||'/tmp/lunden-reports-1043/baseline';
fs.mkdirSync(out,{recursive:true});
const files=['src/hob.js','src/hood.js','src/interior.js','src/config.js','src/pan.js','src/lights.js','src/daycycle.js','tools/kitchenrealismtest.cjs'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sources=Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(__dirname,'..',f)))]));
const checks=[],errors=[],pictures=[];const check=(ok,label,data)=>{checks.push({ok:!!ok,label,data});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));assert.ok(ok,label);console.log('PASS '+label);};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:760},deviceScaleFactor:1});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js*',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 if(baseline)for(const name of ['hob.js','hood.js','interior.js','config.js']){const body=fs.readFileSync(path.join(baselineDir,name));sources['baseline/'+name]=hash(body);await page.route('**/src/'+name,r=>r.fulfill({body,contentType:'application/javascript'}));}
 await page.goto(base+'/?cloud=');
 const info=await page.evaluate(async render=>{
  const T=await import('three'),I=await import('/src/interior.js'),{KITCHEN:K,LEVELS}=await import('/src/config.js'),{Lights}=await import('/src/lights.js'),{DayCycle}=await import('/src/daycycle.js'),{Pan}=await import('/src/pan.js'),{initAudio,audioParts}=await import('/src/audio.js');
  const plan=await(await fetch('/data/plan.json')).json(),floor=structuredClone(plan.floors[0]);
  // Real plan cabinetry, limited to the kitchen. Plain framing walls supply the component's room context.
  const inside=r=>r.x0>=K.area.x0&&r.x1<=K.area.x1&&r.z0>=K.area.z0&&r.z1<=K.area.z1;
  floor.cabinets=floor.cabinets.filter(inside);floor.fixtures=floor.fixtures.filter(inside);floor.windows=[];
  const scene=new T.Scene();scene.background=new T.Color(0xe8e7e2);scene.fog=new T.Fog(0xe8e7e2,30,100);
  const group=new T.Group(),appliances=[];scene.add(group);
  I.buildInterior(group,floor,0,LEVELS[0].floor,LEVELS[0].ceiling,[],new Set(),[],appliances);
  const hob=appliances.find(a=>a.kind==='hob'),hood=appliances.find(a=>a.kind==='hood'),drawer=appliances.find(a=>a.panHome);
  if(!hob||!hood||!drawer)throw Error('Production kitchen builders missing');
  const camera=new T.PerspectiveCamera(46,1100/760,.03,40);scene.add(camera);
  const pan=new Pan(scene,camera,drawer,hob);
  const wallMat=new T.MeshStandardMaterial({color:0xf1eeea,roughness:.85});
  const east=Math.max(...floor.cabinets.map(c=>c.x1)),south=Math.max(...floor.cabinets.map(c=>c.z1));
  const box=(x,y,z,w,h,d,m)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);scene.add(o);};
  box(east+.06,1.25,2.95,.12,2.5,5.1,wallMat);box(4.5,1.25,south+.06,2.2,2.5,.12,wallMat);
  box(4.2,-.035,3,3,.06,5.2,new T.MeshStandardMaterial({color:0xb7a083,roughness:.75}));
  const hemi=new T.HemisphereLight(0xeaf3ff,0xd6d2ca,2),ambient=new T.AmbientLight(0xffffff,.6),fill=new T.DirectionalLight(0xf4f6ff,.9),sun=new T.DirectionalLight(0xfff1dc,2.2);
  fill.position.set(8,6,-5);scene.add(hemi,ambient,fill,sun);
  const day=new DayCycle({scene,camera,lights:{sun,hemi,ambient,fill},clouds:null,startHour:12,month:6,date:15,year:2026});
  // Component maps only; actual production lighting, materials, power and lamp controllers.
  const map={regions:()=>[{name:K.room,area:10,x:4,z:2.5}],at:()=>K.room,exact:()=>K.room};
  const world={size:floor.size,roomMaps:[map,{regions:()=>[],at:()=>null,exact:()=>null}],doors:[],levels:[{wallSegments:[]},{wallSegments:[]}],lamps:I.mirrorLamps.filter(l=>l.level===0&&/bänkbelysningen|köksfläkten/.test(l.name))};
  const lights=new Lights(scene,world);lights.setAll(true);lights.forced=true;
  let renderer=null;if(render){renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,760);renderer.setPixelRatio(1);renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1;renderer.domElement.style.cssText='position:fixed;inset:0;z-index:1000';document.body.append(renderer.domElement);}
  initAudio();
  window.kitchen={T,scene,group,camera,hob,hood,drawer,pan,lights,day,renderer,audioParts,
   shoot(pos,target){camera.position.fromArray(pos);camera.lookAt(...target);scene.updateMatrixWorld(true);lights.updateAuto(day.daylight,1);lights.update(0,camera.position,1,camera.getWorldDirection(new T.Vector3()));renderer?.render(scene,camera);return renderer?{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,programs:renderer.info.programs.length}:null;},
   ray(origin,target){scene.updateMatrixWorld(true);const a=new T.Vector3(...origin),b=new T.Vector3(...target);return new T.Raycaster(a,b.sub(a).normalize(),0,3).intersectObject(group,true)[0]?.object.userData.door;}};
  const meshCount=root=>{let n=0,tri=0;root.traverse(o=>{if(o.isMesh){n++;tri+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return{meshes:n,triangles:tri};};
  return{zone:hob.zone.toArray(),intake:hood.intake.toArray(),hob:meshCount(hob.object),hood:meshCount(hood.object),kitchen:meshCount(group),audioRunning:audioParts()?.ctx.state};
 },render);
 check(info.zone[1]>.93&&info.zone[1]<.94,'unchanged cooking anchor on six millimetre glass',info);
 const interaction=await page.evaluate(()=>{
  const {T,hob,hood,pan,drawer,scene,lights}=kitchen,zone=hob.zone.clone(),intake=hood.intake.clone();
  hob.toggle();for(let i=0;i<90;i++)hob.update(1/60);const hot=hob.on&&hob.glowMat.opacity>.8&&hob.digitMat.opacity===1&&!!hob.hum;
  const hum=hob.hum;hob.set(false);for(let i=0;i<90;i++)hob.update(1/60);const cold=!hob.on&&hob.glowMat.opacity<.001&&!hob.hum;
  pan.take();pan.placeAt(zone);scene.updateMatrixWorld(true);const placed=pan.onHob&&!pan.held&&pan.model.getWorldPosition(new T.Vector3()).distanceTo(zone)<.03;
  pan.take();const lifted=pan.held&&!pan.onHob;pan.putBack();const home=pan.model.parent===drawer.object;
  const lamp=lights.floorLamps.find(l=>l.spec.object===hood.lampButton),shade=lamp.spec.shade;lamp.set(false);const off=shade.emissiveIntensity;hood.toggle();const fanOn=hood.on&&!!hood.sound&&hood.ledMat.color.getHex()===0x30ff50&&shade.emissiveIntensity===off;
  const under=intake.clone().add(new T.Vector3(0,-.4,0)),draws=hood.draws(under)&&!hood.draws(intake.clone().add(new T.Vector3(2,-.4,0)));
  lamp.toggle();const lampOn=shade.emissiveIntensity>.8&&hood.on;hood.set(false);const fanOff=!hood.sound&&!hood.draws(under)&&shade.emissiveIntensity>.8;
  const lightHit=kitchen.ray([hood.lampButton.position.x-.5,hood.lampButton.position.y,hood.lampButton.position.z],hood.lampButton.position.toArray())===lamp;
  const hobHit=kitchen.ray([zone.x-.2,zone.y+.5,zone.z],zone.toArray())===hob;
  return{hot,cold,placed,lifted,home,fanOn,draws,lampOn,fanOff,lightHit,hobHit,zoneSame:zone.equals(hob.zone),intakeSame:intake.equals(hood.intake)};
 });
 for(const [label,ok] of Object.entries(interaction))check(ok,'production interaction '+label,interaction);
 check(info.audioRunning==='running','actual Web Audio context runs; hum/fan handles start and stop');
 if(!baseline){check(info.hood.meshes<=9,'hood remains a bounded set of shared-material meshes',info.hood);check(info.hob.triangles<200,'glass bevel adds a small geometry budget',info.hob);}
 if(render){
  const views=[['kitchen',[3.5,1.62,2.9],[5.2,1.27,3.75]],['hob',[4.18,1.57,3.78],[5.22,.936,3.78]],['hood',[4.48,1.2,3.78],[5.3,1.64,3.78]]];
  for(const [name,pos,target] of views){const metrics=await page.evaluate(({pos,target})=>kitchen.shoot(pos,target),{pos,target});await page.screenshot({path:path.join(out,name+'.png')});pictures.push({name,metrics});}
  const metrics=await page.evaluate(()=>{kitchen.hob.set(true);kitchen.hob.update(1);return kitchen.shoot([4.18,1.57,3.78],[5.22,.936,3.78]);});
  await page.screenshot({path:path.join(out,'hob-on.png')});pictures.push({name:'hob-on',metrics});
 }
 check(!errors.length,'no browser exceptions',errors);
 await page.evaluate(()=>{kitchen.hob.set(false);kitchen.hood.set(false);kitchen.audioParts()?.ctx.close();kitchen.renderer?.dispose();});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({baseline,render,checks,info,errors,pictures,sources,limits:'Actual plan kitchen builders and production Lights/DayCycle/Pan/audio; bounded component maps and framing walls, no World, physical phone, audio recording or FPS claim.'},null,2));
}finally{await browser.close();}})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.stack);console.error(e);process.exitCode=1;});
