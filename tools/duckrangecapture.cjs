// #1839 capture-only recovery: fixed source, deterministic production AI snapshot, no functional rerun.
// Optional command JSON {name:'familiar-pair'|'loose-group',rank:1} selects another prevalidated camera.
const fs=require('node:fs'),kit=require('./testkit.cjs');
const[base='http://localhost:8910',out='docs/verification/1839',control='/tmp/1839-capture']=process.argv.slice(2);
(async()=>{const browser=await kit.launch();try{
 const p=await browser.newPage({viewport:kit.SMALL});await p.goto(base+'/?test=lazy&shot&cloud=&month=6&time=13&freeze&weather=clear',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__app?.ducks,null,{timeout:180000});await kit.skipNameDialog(p);await p.evaluate(()=>__app.showOverlay(true));if(await p.locator('#start-go').isVisible())await p.locator('#start-go').click();else await p.locator('#start-touch').click();
 const state=await p.evaluate(async()=>{
  const A=__app,D=A.ducks,T=await import('three'),{DuckFlock}=await import('/src/duckbrain.js'),{riverAt}=await import('/src/riverbridge.js'),S=await import('/src/surroundings.js');A.renderer.setAnimationLoop(null);
  const snap=()=>D.animals.map(a=>Object.fromEntries(Object.entries(a.brain).filter(([k])=>!['habitat','home'].includes(k))));
  const restore=s=>{s.forEach((b,i)=>Object.assign(D.animals[i].brain,b));D.update(0,false);};
  const fresh=new DuckFlock(D.habitat);D.flock.time=0;D.animals.forEach((a,i)=>Object.assign(a.brain,fresh.brains[i]));const initial=snap();let best=null,radius=Infinity;
  for(let i=0;i<4000;i++){D.flock.update(.05);const lead=D.animals[0].brain,r=Math.max(...D.animals.map(a=>Math.hypot(a.brain.x-lead.x,a.brain.z-lead.z)));if(D.flock.grouped&&r<radius){radius=r;best=snap();}}
  const ignore=new Set(D.animals.flatMap(a=>[a.mesh,a.pick])),occluders=[];A.scene.traverse(o=>{if(!o.isMesh||ignore.has(o))return;for(let a=o;a;a=a.parent)if(!a.visible||a===A.camera)return;occluders.push(o);});
  const ray=new T.Raycaster(),dir=new T.Vector3(),feet=S.treeFeet.concat(S.southTreeFeet??[]),poses={};
  for(const[name,indices,snapshot]of[['familiar-pair',[0,1],initial],['loose-group',[0,1,2,3],best]]){
   restore(snapshot);const bs=indices.map(i=>D.animals[i].brain),x=bs.reduce((a,b)=>a+b.x,0)/bs.length,z=bs.reduce((a,b)=>a+b.z,0)/bs.length,y=bs.reduce((a,b)=>a+b.y,0)/bs.length,along=riverAt(x,z).along-D.habitat.origin,candidates=[];
   A.scene.updateMatrixWorld(true);
   for(const delta of[-3,3,-4,4,-2,2,-5,5])for(const shore of[.1,.5,.9])for(const height of[1.05,1.6]){
    const q=D.habitat.point(along+delta,'walk',shore),g=D.ground(q.x,q.z),cam=new T.Vector3(q.x,g+height,q.z);
    if(!D.habitat.contains(q.x,q.z)||D.habitat.surface(q.x,q.z).water||feet.some(t=>Math.hypot(t.x-q.x,t.z-q.z)<1))continue;
    let blocked=false;
    for(const b of bs)for(const h of[.3,.6]){const aim=new T.Vector3(b.x,b.y+h,b.z),distance=aim.distanceTo(cam);dir.copy(aim).sub(cam).normalize();ray.set(cam,dir);ray.near=.03;ray.far=distance-.25;if(ray.intersectObjects(occluders,false).length){blocked=true;break;}}
    if(blocked)continue;
    let separation=Infinity;const angles=bs.map(b=>Math.atan2(b.x-q.x,b.z-q.z));for(let i=0;i<angles.length;i++)for(let j=0;j<i;j++)separation=Math.min(separation,Math.abs(Math.atan2(Math.sin(angles[i]-angles[j]),Math.cos(angles[i]-angles[j]))));
    candidates.push({camera:cam.toArray(),target:[x,y+.32,z],separation,score:separation-.001*Math.hypot(q.x-x,q.z-z),delta,shore,height});
   }
   candidates.sort((a,b)=>b.score-a.score);if(!candidates.length)throw Error('No clear bank camera for '+name);poses[name]={snapshot,candidates};
  }
  window.capture1839={poses,show(name,rank=0){const pose=poses[name],cam=pose.candidates[rank];restore(pose.snapshot);A.player.spawn(cam.camera[0],cam.camera[2],0);A.step(0);A.camera.position.fromArray(cam.camera);A.camera.fov=52;A.camera.updateProjectionMatrix();A.camera.lookAt(...cam.target);D.update(0,false);A.camera.updateMatrixWorld();return cam;}};
  return{initial,best,bestRadius:radius,poses,occluders:occluders.length,scope:'capture-only deterministic source snapshot replay; all selected bank cameras have clear actual mesh rays to each duck body/head, no terrain/model edits'};
 });fs.writeFileSync(out+'/capture-state.json',JSON.stringify(state,null,2));
 const images=[];const capture=async(name,rank=0)=>{const camera=await p.evaluate(({name,rank})=>capture1839.show(name,rank),{name,rank});await kit.shot(p,out+'/'+name+'.png',{frames:1});images.push({name,rank,...camera});fs.writeFileSync(out+'/capture-cameras.json',JSON.stringify(images,null,2));console.log('CAPTURE',name,rank,camera);};
 for(const name of['familiar-pair','loose-group'])await capture(name);
 fs.writeFileSync(control+'.ready','ready');console.log('READY for image inspection; release via '+control+'.release');
 let previous='';const start=Date.now();while(!fs.existsSync(control+'.release')&&Date.now()-start<240000){if(fs.existsSync(control+'.command')){const text=fs.readFileSync(control+'.command','utf8');if(text!==previous){previous=text;const m=JSON.parse(text);await capture(m.name,m.rank);}}await new Promise(r=>setTimeout(r,200));}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
