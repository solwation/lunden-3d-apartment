// #1150: real Rest/Ghosts/Avatar + local PlayerRoom, actual production state callback; bounded scene, no World.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), assert = require('node:assert/strict');
const [base='http://localhost:8795', worker='http://localhost:8796', out='/tmp/lunden-pose1150-codex', mode=''] = process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true}); const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const pages=[],errors=[],samples=[];
 try {
  for(let i=0;i<2;i++){
   const p=await browser.newPage({viewport:{width:720,height:520}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/src/bootstrap.js',r=>r.fulfill({body:'// native module fixture',contentType:'text/javascript'})); await p.goto(base);
   await p.evaluate(async({i,worker})=>{
    window.T=await import('three');const {Ghosts}=await import('/src/ghosts.js'),{Rest,restTarget}=await import('/src/rest.js'),{restState}=await import('/src/remote-pose.js'),{heldCatState}=await import('/src/ghostcat.js'),{BREEDS}=await import('/src/cat.js');
    window.jetpack={worn:false,k:0};window.heldItem=()=>null;window.heldCategory=(await import('/src/heldcategory.js')).heldCategory; /* (the evaluated production state callback reads these: jp #1286, hi #1297) */ window.miele={held:true};window.cat={held:true,visible:true,breed:BREEDS[0],variant:BREEDS[0].coats[0],kitten:false};
    window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(45,720/520,.1,100);window.player={pos:new T.Vector3(i*3,0,0),crouched:false};window.suit={worn:false};window.rest=new Rest(camera);
    const main=await(await fetch('/src/main.js')).text();const callback=main.match(/state: \(\) => \(\{ p: \[player.pos.x[^\n]+/)[0].replace(/^state: /,'').replace(/ \}\);$/,'');
    window.sourceCallback=callback;
    window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Observer':'Resting',state:eval(callback),active:()=>true});
    window.setRest=kind=>{
     if(!kind){rest.end();return;}
     const long=kind==='long';const obj=new T.Group();obj.userData.rest={kind:long?'sit':kind,name:'Bänk/säng',verb:'vila',spots:[{x:0,y:kind==='lie'?.6:.45,z:0,...(long?{legsUp:true}:{})}]};
     const target=restTarget(obj,{x:0,z:0,level:0},0);rest.begin(target,target.spots[0],{pos:player.pos.clone(),yaw:0});
    };
    const {Combat}=await import('/src/combat.js');window.combat=new Combat({ghosts,camera,scene,weapon:()=> 'rifle',feet:()=>player.pos});
    window.tick=setInterval(()=>{rest.update(.04);ghosts.update();},40);
    window.peer=()=>[...ghosts.others.values()].find(g=>g.name===(i?'Resting':'Observer'));
    const C=await import('/src/config.js');
    window.sample=()=>{const g=peer();g.root.updateMatrixWorld(true);const head=g.avatar.bones.head.getWorldPosition(new T.Vector3());const center=head.clone().add(new T.Vector3(0,.1,0).applyQuaternion(g.avatar.bones.torso.getWorldQuaternion(new T.Quaternion())));
      // #1267: like Combat, the state carries the peer's wire avatar code; without it the boxes use the id-seeded default look and the ray missed for some ids
      const state={p:g.feet.toArray(),r:g.root.rotation.y,pose:g.pose,...C.splitAvatarCode(g.avatarCode)};const origin=center.clone().add(new T.Vector3(2,0,0));const hit=C.rifleBoxHeadContact(g.id,state,origin.toArray(),[-1,0,0],4);
      const chest=g.avatar.bones.torso.localToWorld(new T.Vector3(0,.3,0));
      const oldH=g.h;g.h='rifle';camera.position.copy(origin);camera.lookAt(center);camera.updateMatrixWorld(true);
      const nativeHead=combat.rifleContact().hc?.[0]===2;
      const wall=new T.Mesh(new T.BoxGeometry(.1,1,1),new T.MeshBasicMaterial());wall.position.copy(center).add(new T.Vector3(1,0,0));scene.add(wall);scene.updateMatrixWorld(true);
      const blocked=combat.rifleContact().target===null;scene.remove(wall);wall.geometry.dispose();wall.material.dispose();g.h=oldH;

      return {pose:g.pose,tall:g.avatar.look.tall,root:g.root.position.toArray(),hip:g.avatar.bones.hips.getWorldPosition(new T.Vector3()).toArray(),head:head.toArray(),knee:g.avatar.bones.kneeL.getWorldPosition(new T.Vector3()).toArray(),foot:g.avatar.bones.footL.getWorldPosition(new T.Vector3()).toArray(),catVisible:!!g.heldCat.object?.visible,catAt:g.heldCat.object?.position.toArray(),nativeHead,blocked,headHit:!!hit,chestBody:C.playerBodyContact(g.id,state,chest.toArray())};};
   },{i,worker});
  }
  const [a,b]=pages;await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length)));
  for(const [kind,pose] of [[null,0],['sit',1],['lie',2],['long',3],[null,0]]){
   await a.evaluate(k=>setRest(k),kind);await b.waitForFunction(n=>peer().pose===n,pose);const sample=await b.evaluate(()=>sample());samples.push({kind,...sample});fs.writeFileSync(`${out}/samples.json`,JSON.stringify(samples,null,2));assert.ok(sample.catVisible,'held cat remains visible in final pose');assert.ok(sample.nativeHead,'actual Combat rifle ray classifies posed head');assert.ok(sample.blocked,'ordinary wall stops actual Combat rifle ray');assert.ok(sample.headHit,'ordinary head ray matches posed bone');assert.ok(sample.chestBody,'posed chest stays body');
   if(kind==='sit'){assert.ok(Math.abs(sample.hip[1]-(.45+.075*sample.tall))<.025,'hips on bench');assert.ok(Math.abs(sample.knee[2]-sample.hip[2])>.2,'seated thighs extend forwards');}
   if(kind==='lie'){assert.ok(sample.head[1]-sample.hip[1]>0&&sample.head[1]-sample.hip[1]<.35*sample.tall,'lying: head a little above the hips, resting on the pillows (#1234)');assert.ok(Math.abs(sample.head[2]-sample.foot[2])>1,'lying extends along mattress');assert.ok(Math.hypot(sample.head[0],sample.head[2])<.1,'lying: the head rests at the spot (the pillow), the hips lie towards the feet (#1275)');}
   if(kind==='long'){assert.ok(Math.abs(sample.hip[1]-(.45+.075*sample.tall))<.025,'long sit: hips on the seat');assert.ok(Math.abs(sample.foot[2]-sample.hip[2])>.6*sample.tall,'long sit: feet far in front of the hips (#1237)');assert.ok(Math.abs(sample.foot[1]-(.45+.08*sample.tall))<.06*sample.tall+.02,'long sit: feet resting on the surface, not on the floor');assert.ok(Math.abs(sample.knee[1]-sample.foot[1])<.12*sample.tall,'long sit: legs stretched out, not hanging');}
   if(mode==='--render'){
    await b.evaluate(()=>{
     if(!window.renderer){scene.background=new T.Color('#c1d5e1');scene.add(new T.HemisphereLight(0xffffff,0x465b35,2));const l=new T.DirectionalLight(0xffffff,2);l.position.set(4,5,3);scene.add(l);window.renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(720,520);document.body.replaceChildren(renderer.domElement);window.renderCamera=new T.PerspectiveCamera(45,720/520,.1,100);}
     const g=peer();if(window.support)scene.remove(support);if(g.pose){window.support=new T.Mesh(new T.BoxGeometry(g.pose===2?1.2:1.6,.1,g.pose===2?2.1:g.pose===3?1.6:.6),new T.MeshStandardMaterial({color:0x8b6951}));support.position.set(0,g.pose===2?.55:.4,g.pose===3?.6:0);scene.add(support);}renderCamera.position.set(2.6,1.8,3.5);renderCamera.lookAt(0,.8,0);renderer.render(scene,renderCamera);renderer.getContext().finish();
    });await b.screenshot({path:`${out}/${samples.length}-${kind||'standing'}.png`});
   }
  }
  assert.deepEqual(samples[4].root,samples[0].root,'stand restores original feet');assert.ok(Math.abs(samples[4].head[1]-samples[0].head[1])<.02,'standing skeleton restored');assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/result.json`,JSON.stringify({samples,errors,sourceCallback:await a.evaluate(()=>sourceCallback),rendered:mode==='--render'},null,2));console.log('PASS real two-client sit/lie/standing + production main state callback');
 }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.disconnect();}).catch(()=>{});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
