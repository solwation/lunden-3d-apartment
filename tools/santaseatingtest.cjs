// #1499: scoped actual-sofa leg clearance, floor contact, appearance and existing gift callback.
const fs=require('fs'),assert=require('assert'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://127.0.0.1:8770',out=process.argv[3]||'/tmp/santa-seating1499';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await kit.launch(),timer=setTimeout(()=>b.close(),120000);try{
 const {page:p}=await kit.open(b,`${base}/?cloud=&month=12&day=24&time=15&freeze&test=lazy&at=2.5,10,180,0`,{timeout:70000});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const results=await p.evaluate(async()=>{const a=__app,T=await import('three'),{LANDSKRONA:L}=await import('/src/config.js');a.hideLoading();a.showOverlay(false);document.getElementById('arm').hidden=true;
  const santa=a.santa,local=santa.sofa.pickable.userData.rest.spots[1],g=santa.fig.legs.geometry.attributes.position;
  let below=0,minClearance=Infinity,minY=Infinity;
  for(let i=0;i<g.count;i++){const y=g.getY(i)+santa.object.position.y,z=g.getZ(i)+santa.object.position.z;minY=Math.min(minY,y);if(y<local.y){below++;minClearance=Math.min(minClearance,z-L.depth/2);}}
  const before=santa.fig.legs.geometry;santa.greet();for(let i=0;i<30;i++)a.step(.1);
  const gift=!!a.heldItem()?.isChristmasGift;a.heldItem()?.putBack();
  santa.sofa.pickable.updateWorldMatrix(true,true);const cam=new T.Vector3(2.1,1.4,10.1);a.player.pos.set(cam.x,0,cam.z);a.camera.position.copy(cam);a.camera.lookAt(santa.head);a.camera.updateMatrixWorld(true);santa.greeting=0;santa.t=5;santa.update(0);
  return {below,minClearance,minY,gift,beforeGeometry:before.id};});
 assert(results.below>0&&results.minClearance>.02,JSON.stringify(results));assert(Math.abs(results.minY)<.001,JSON.stringify(results));assert(results.gift);
 await kit.shot(p,`${out}/sitting.png`,{frames:1,viewport:{width:1103,height:506}});
 const sleep=await p.evaluate(()=>{const a=__app;a.day.hour=16;a.santa.update(1);return {sleeping:a.santa.sleeping,geometrySwapped:a.santa.fig.legs.geometry!==a.santa.legPoses.sitting,glassHidden:!a.santa.fig.glass.visible};});
 assert(sleep.sleeping&&sleep.geometrySwapped&&sleep.glassHidden);
 await kit.shot(p,`${out}/sleeping.png`,{frames:1,viewport:{width:1103,height:506}});
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({results,sleep,errors},null,2));console.log('PASS actual legs clear sofa, soles on floor, gift interaction and sleep pose');
}finally{clearTimeout(timer);await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
