// #2202: one real-app before/after run; baseline routes source files from BEFORE_DIR, same world/camera/quality.
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8422',out=process.argv[3]||'docs/verification/2202';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await kit.launch(['--autoplay-policy=no-user-gesture-required']),result={source:'6965828e baseline; working tree #2202',environment:'Chromium SwiftShader, 1280x800 DPR1 captures, quality3',phases:[],errors:[]};
try{for(const phase of (process.argv[4]?[process.argv[4]]:['before','after'])){
 const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
 await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR||path.join(__dirname,'..','node_modules','three'),new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
 if(phase==='before')for(const f of ['ducks.js','duckbrain.js','duckmotion.js','duckhabitat.js','duckkiss.js','audio.js','main.js'])await ctx.route(new RegExp(`/src/${f.replace('.','\\.')}(\\?.*)?$`),r=>r.fulfill({path:path.join(process.env.BEFORE_DIR,f),contentType:'text/javascript'}));
 const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push({phase,error:e.message}));
 await page.goto(`${base}/?life&cloud=&month=9&day=20&time=19&freeze&weather=clear&test=lazy`,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app?.ducks?.animals?.every(a=>a.riggedScene),null,{timeout:360000,polling:250});await kit.skipNameDialog(page);
 const record={phase};result.phases.push(record);
 record.setup=await page.evaluate(async()=>{
  const A=__app,D=A.ducks;A.renderer.setAnimationLoop(null);A.showOverlay(false);D.kiss.next=1e9;
  const {DuckFlock}=await import('/src/duckbrain.js');const f=new DuckFlock(D.habitat);
  for(let i=0;i<4;i++){Object.assign(D.animals[i].brain,f.brains[i]);D.animals[i].sleepWeight=0;D.animals[i].activity.stop();D.animals[i].activity.next=1e9;}
  window.duck2202={A,D,step(n,dt=.05){for(let i=0;i<n;i++){D.lastPlayer?.copy(A.camera.position);D.update(dt,false);}},camera(){const b=D.animals[0].brain,m=D.animals[1].brain,p={x:(b.x+m.x)/2,y:(b.y+m.y)/2,z:(b.z+m.z)/2};A.camera.position.set(p.x+1.5,p.y+1.15,p.z+1.4);A.camera.lookAt(p.x,p.y+.35,p.z);A.camera.updateMatrixWorld(true);}};
  duck2202.camera();D.lastPlayer?.copy(A.camera.position);A.day.hour=19;A.day.update(0);duck2202.step(5,0);return{url:location.href,home:D.habitat.home(0),camera:A.camera.position.toArray(),hour:A.day.hour};
 });
 record.dusk=await page.evaluate(()=>{duck2202.step(300);return duck2202.D.animals.map(a=>({id:a.brain.id,x:a.brain.x,y:a.brain.y,z:a.brain.z,roosting:!!a.brain.roosting,sleeping:!!a.brain.sleeping,weight:a.sleepWeight??0}));});
 await page.evaluate(()=>duck2202.camera());await kit.shot(page,path.join(out,phase==='before'?'before/dusk.png':'dusk.png'));
 record.night=await page.evaluate(()=>{const{A,D}=duck2202;A.day.hour=23;A.day.update(0);let steps=0;for(;steps<6000;steps++){duck2202.step(1);if(D.animals.every(a=>a.brain.sleeping&&a.sleepWeight>.999))break;}return{steps,hour:A.day.hour,birds:D.animals.map(a=>({id:a.brain.id,female:a.brain.female,x:a.brain.x,y:a.brain.y,z:a.brain.z,water:D.habitat.surface(a.brain.x,a.brain.z).water,moving:a.brain.moving,sleeping:!!a.brain.sleeping,weight:a.sleepWeight??0,pose:a.pose,neck:a.bones.Joint_Neck.quaternion.toArray()}))};});
 if(phase==='after'){await page.evaluate(()=>duck2202.camera());await kit.shot(page,path.join(out,'night-real.png'));}
 // Lift only the scene lighting for a legible identical night-pose comparison; the actual production clock remains23.
 await page.evaluate(()=>{const{A}=duck2202;A.day.hour=12;A.day.update(0);A.day.hour=23;duck2202.camera();});
 await kit.shot(page,path.join(out,phase==='before'?'before/night-pair.png':'night-pair.png'));
 if(phase==='after'){
  await page.evaluate(()=>{const{D}=duck2202;window.duckPoseSave=D.animals.map(a=>({y:a.mesh.position.y,rest:a.rest.map(([bone])=>[bone,bone.position.clone(),bone.quaternion.clone()])}));for(const a of D.animals){for(const[bone,q,p]of a.rest){bone.quaternion.copy(q);bone.position.copy(p);}a.mixer.update(0);a.mesh.position.y-=a.pose.ty;}});
  await kit.shot(page,path.join(out,'before/night-pose-control.png'));
  await page.evaluate(()=>{duck2202.D.animals.forEach((a,i)=>{a.mesh.position.y=duckPoseSave[i].y;for(const[bone,p,q]of duckPoseSave[i].rest){bone.position.copy(p);bone.quaternion.copy(q);}});});
 }
 record.render=await page.evaluate(()=>{const i=__app.renderer.info;return{calls:i.render.calls,triangles:i.render.triangles,programs:i.programs.length,duckMeshes:__app.ducks.animals.map(a=>a.skinnedMesh.geometry.index.count/3),wake:__app.ducks.wake.mesh.visible};});
 if(phase==='after'){
  record.dawn=await page.evaluate(()=>{const{A,D}=duck2202;A.day.hour=8;A.day.update(0);duck2202.step(100);return D.animals.map(a=>({roosting:a.brain.roosting,sleeping:a.brain.sleeping,moving:a.brain.moving,weight:a.sleepWeight}));});
  await kit.shot(page,path.join(out,'morning-awake.png'));
  record.food=await page.evaluate(()=>{const{A,D}=duck2202;A.day.hour=23;duck2202.step(5000);const b=D.animals[0].brain;const slept=b.sleeping;D.flock.update(.1,{x:b.x+.7,y:b.y,z:b.z},()=>true,1);return{slept,nowSleeping:b.sleeping,lured:b.lured,moving:b.moving};});
  record.audio=await page.evaluate(async()=>{
   const native=window.AudioContext;const contexts=[];class Capture extends native{constructor(){super();contexts.push(this)}}window.AudioContext=Capture;
   const audio=await import('/src/audio.js?duck2202probe');audio.initAudio();await contexts[0]?.resume();const s=audio.sfx,p={x:0,y:1,z:0};
   const first=s.quack(p,true),second=s.duckWings(p,true),capped=s.quack(p,false);audio.toggleMuted();const muted=s.quack(p,true);audio.toggleMuted();
   return{context:contexts[0]?.state,first,second,capped,muted};
  });
  if(!record.night.birds.every(b=>b.sleeping&&!b.water&&!b.moving&&b.weight>.99))throw Error('night sleep/shore contract');
  if(!record.dawn.every(b=>!b.sleeping&&!b.roosting&&b.weight<.01))throw Error('morning wake contract');
  if(!record.food.slept||record.food.nowSleeping||!record.food.lured)throw Error('food wake contract');
  if(!record.audio.first||!record.audio.second||record.audio.capped||record.audio.muted)throw Error('audio budget/mute contract');
 }
 await ctx.close();console.log(phase+' complete');
}}finally{await browser.close();fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));}
if(result.errors.length)throw Error(JSON.stringify(result.errors));
})().catch(e=>{console.error(e);process.exitCode=1});
