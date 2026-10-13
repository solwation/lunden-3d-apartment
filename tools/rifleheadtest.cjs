// #897/#916 actual Avatar/Ghosts/Combat + Worker, no apartment/WebGL. game worker artifacts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const [game='http://localhost:8870',worker='http://localhost:8871',out='/tmp/lunden-rifle-head']=process.argv.slice(2);
let checks=0,failures=0,completed=false; const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`);};
(async()=>{
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});const errors=[],pages=[];
try{
for(let i=0;i<2;i++){
const p=await browser.newPage({viewport:{width:850,height:500}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native actual modules only'}));await p.goto(game);
await p.evaluate(async({worker,i})=>{
const context=HTMLCanvasElement.prototype.getContext;window.gl=0;HTMLCanvasElement.prototype.getContext=function(k,...args){if(/webgl/i.test(k)){gl++;throw Error('WebGL forbidden');}return context.call(this,k,...args);};
window.T=await import('three');window.config=await import('/src/config.js');window.Avatar=(await import('/src/avatar.js')).Avatar;
const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);window.position=[0,0,i?0:-4];window.crouched=false;window.weapon='rifle';
camera.position.set(...position);camera.position.y=1.62;camera.lookAt(0,1.62,i?-4:0);camera.updateMatrixWorld();
window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Head Target':'Rifle Shooter',active:()=>true,weapon:()=>weapon,score:()=>0,mirrored:()=>false,state:()=>({p:position,r:0,c:crouched})});
window.acks=[];window.hurts=[];window.markers=[];window.effects=0;window.deaths=0;window.remoteShots=0;
window.combat=new Combat({scene,camera,ghosts,weapon:()=>weapon,feet:()=>new T.Vector3(...position),onHit:()=>effects++,onDie:()=>deaths++,sfx:{}});
const originalShot=ghosts.onShot;ghosts.onShot=(m,g)=>{remoteShots++;originalShot?.(m,g);};
const hit=ghosts.onHit,hurt=ghosts.onHurt;ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onHurt=(m,g)=>{hurts.push(structuredClone(m));hurt(m,g);};
const mark=combat.hitMarker.show.bind(combat.hitMarker);combat.hitMarker.show=m=>{markers.push(m.head===true);mark(m);};
window.tick=setInterval(()=>{ghosts.update();combat.update(0);},35);
window.peer=()=>[...ghosts.others.values()][0];
window.aimAt=(y,x=0)=>{camera.position.set(0,1.62,-4);camera.lookAt(x,y,0);camera.updateMatrixWorld();};
window.proof=async()=>{
 let eligible=0,bad=0,maxResidual=0,shapeError=0,negative=0,falseHeads=0,hiddenProofs=0,falseHiddenHeads=0;const variants=new Set(),details=[],byStyle=[0,0,0,0],coveredByStyle=[0,0,0,0],byVariant={};
 for(let seed=0;seed<3000&&variants.size<60;seed++){
  const id='central-'+seed,lk=config.avatarLook(id);
  const key=lk.style+'/'+lk.build+'/'+lk.tall;if(variants.has(key))continue;variants.add(key);byVariant[key]=0;
  const a=new Avatar(id),root=new T.Group();root.add(a.object);
  // Compare actual production skull triangles to pure profile before animation.
  const array=a.mesh.geometry.attributes.position,flag=a.mesh.geometry.attributes.rifleSkull,actual=[];
  for(let j=0;j<flag.count;j++)if(flag.getX(j))actual.push([array.getX(j),array.getY(j)-1.54,array.getZ(j)]);
  const canonical=config.rifleSkullProfile().flat();if(actual.length!==canonical.length)throw Error('skull profile topology mismatch');
  for(let j=0;j<actual.length;j++)for(let axis=0;axis<3;axis++)shapeError=Math.max(shapeError,Math.abs(actual[j][axis]-canonical[j][axis]));
  for(const time of [0,.4,2,5]){
   if(time)a.update(time,{speed:0});
   for(const yaw of [0,.8,Math.PI,-1.6]){
    root.rotation.y=yaw;root.updateMatrixWorld(true);
    const patch=config.PVP_RIFLE_HEAD.corePatches[lk.style]??config.PVP_RIFLE_HEAD.patch;
    for(const yy of [.3,.5,.7].map(t=>patch.low+(patch.high-patch.low)*t))for(const xx of [-.003,0,.003]){
     const point=new T.Vector3(xx,(config.PVP_RIFLE_HEAD.headY+yy)*a.look.tall,-.1);
     point.applyAxisAngle(new T.Vector3(0,1,0),yaw);
     const outward=new T.Vector3(0,0,3).applyQuaternion(a.bones.head.getWorldQuaternion(new T.Quaternion()));
     const origin=point.clone().add(outward);origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));
     const direction=point.clone().sub(origin).normalize();direction.set(...direction.toArray().map(v=>Math.round(v*1000)/1000));
     const native=new T.Raycaster(origin,direction.clone().normalize(),0,40).intersectObject(a.mesh,false)[0];
     if(!native)continue;
     if(!a.rifleHeadContact(native,{p:[0,0,0],r:yaw},id,origin.toArray(),direction.toArray())){if(!a.mesh.geometry.attributes.rifleSkull.getX(native.face.a))coveredByStyle[lk.style]++;continue;}
     eligible++;byStyle[lk.style]++;byVariant[key]++;const hc=[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)];
     const state={p:[0,0,0],r:yaw},shot={t:'a',w:'rifle',o:origin.toArray(),d:direction.toArray(),hc};
     const front=config.rifleSkullEntry(id,state,shot.o,shot.d),along=origin.distanceTo(new T.Vector3(...hc.slice(1)));
     const error=front===null?100:Math.abs(front-along);maxResidual=Math.max(maxResidual,error);
     if(!config.rifleHeadContact(id,state,shot,origin.toArray(),ghosts.rules.weapons.rifle.range,4)){bad++;if(details.length<10)details.push({id,key,time,yaw,xx,yy,error,point:hc});}
    }
    for(const yy of [.045,.092,.12,.145,.18,.22,.26])for(const xx of [-.05,-.027,0,.027,.05]){
     const point=a.bones.head.localToWorld(new T.Vector3(xx,yy,.1)),outward=new T.Vector3(0,0,3).applyQuaternion(a.bones.head.getWorldQuaternion(new T.Quaternion()));
     const origin=point.clone().add(outward);origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));
     const direction=point.clone().sub(origin).normalize();direction.set(...direction.toArray().map(v=>Math.round(v*1000)/1000));
     const native=new T.Raycaster(origin,direction.clone().normalize(),0,40).intersectObject(a.mesh,false)[0];if(!native)continue;
     if(a.rifleHeadContact(native,{p:[0,0,0],r:yaw},id,origin.toArray(),direction.toArray())){
      if(!a.mesh.geometry.attributes.rifleNose.getX(native.face.a))continue;
      const supported={t:'a',w:'rifle',o:origin.toArray(),d:direction.toArray(),hc:[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)]};
      if(config.rifleHeadContact(id,{p:[0,0,0],r:yaw},supported,origin.toArray(),ghosts.rules.weapons.rifle.range,4))continue;
     }
     negative++;const state={p:[0,0,0],r:yaw},shot={t:'a',w:'rifle',o:origin.toArray(),d:direction.toArray(),hc:[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)]};
     if(config.rifleHeadContact(id,state,shot,origin.toArray(),ghosts.rules.weapons.rifle.range,4)){falseHeads++;if(details.length<10)details.push({negative:true,id,key,time,yaw,xx,yy,skull:a.mesh.geometry.attributes.rifleSkull.getX(native.face.a),point:shot.hc});}
     const first=config.rifleSkullEntry(id,state,shot.o,shot.d);
     if(first!==null&&first>native.distance+.001){hiddenProofs++;const unit=direction.clone().normalize(),hidden={...shot,hc:[1,...origin.clone().addScaledVector(unit,first).toArray().map(v=>Math.round(v*1000)/1000)]};
      if(config.rifleHeadContact(id,state,hidden,origin.toArray(),ghosts.rules.weapons.rifle.range,4)){falseHiddenHeads++;if(details.length<10)details.push({hidden:true,id,key,time,yaw,xx,yy,skull:a.mesh.geometry.attributes.rifleSkull.getX(native.face.a),first,native:native.distance,point:hidden.hc});}}

    }
   }
  }a.dispose();await new Promise(resolve=>setTimeout(resolve,0));
 }return{eligible,bad,negative,falseHeads,hiddenProofs,falseHiddenHeads,maxResidual,shapeError,variants:variants.size,byStyle,coveredByStyle,byVariant,details};
};
}, {worker,i});
}
const [a,b]=pages;await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
for(let attempt=0;attempt<40;attempt++){
 if(await b.evaluate(()=>config.avatarLook(ghosts.me).style===0))break;
 await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await b.waitForFunction(()=>ghosts.connected);
 if(attempt===39)throw Error('No supported server seed after bounded reconnects');
}
await a.waitForFunction(()=>peer()?.avatar.look.style===0&&peer()?.snaps.length&&peer().root.visible);
await a.waitForFunction(()=>peer().speed<.01&&(peer().avatar.gait??0)<.01);
const parity=await a.evaluate(()=>proof());fs.writeFileSync(`${out}/parity.json`,JSON.stringify(parity,null,2));
check(parity.eligible>800&&parity.variants===60&&Object.values(parity.byVariant).every(n=>n>0)&&parity.shapeError<1e-6,'actual native skin raycasts cover all60 style/build/height variants; pure actual vertex parity and standing/bind poses');
check(parity.bad===0,`v1 first-surface tolerance covers sampled ACTUAL nearest head contacts (max ${parity.maxResidual.toFixed(5)}m, bad ${parity.bad})`);
check(parity.negative>500&&parity.falseHeads===0,'actual unsupported nearest face/jaw/hair/outside-patch contacts never get head bonus');
check(parity.hiddenProofs>0&&parity.falseHiddenHeads===0,'forged hidden pure-skull HC behind actual unsupported first contact receives no head bonus');
console.log(JSON.stringify(parity));
// Regression for the measured steep-ray hidden-skull failure: actual mesh, seven standing phases, all15 beanie builds/heights.
const oblique=await a.evaluate(async()=>{const C=config;let tested=0,hidden=0,falseHeads=0;const details=[],byStyle=[0,0,0,0],variantKeys=[];
for(let build=0;build<3;build++)for(const tall of [.95,.975,1,1.025,1.05]){const style=3,id=Array.from({length:3000},(_,i)=>'central-'+i).find(s=>{const l=C.avatarLook(s);return l.style===style&&l.build===build&&l.tall===tall;});if(!id)throw Error('Missing actual beanie build/height seed');variantKeys.push({id,style,build,tall});const a=new Avatar(id),root=new T.Group();root.add(a.object);const patch=C.PVP_RIFLE_HEAD.corePatches[style]??C.PVP_RIFLE_HEAD.patch;let previous=0;
for(const time of [0,.4,2.4,7.4,18.3,35,62.8]){if(time)a.update(time-previous,{speed:0});previous=time;root.updateMatrixWorld(true);
for(const yy of [patch.low+.0012,(patch.low+patch.high)/2,patch.high-.0012]){const start=[0,(1.53+yy)*tall,-3],initial=C.rifleSkullEntry(id,{p:[0,0,0],r:0},start,[0,0,1]),target=new T.Vector3(...start).add(new T.Vector3(0,0,initial));
for(const delta of Array.from({length:17},(_,j)=>[0,(j-8)*.03,-3]).concat([[.3,0,-3],[-.3,0,-3],[.6,0,-3],[-.6,0,-3],[1,0,-3],[-1,0,-3],[0,2,-1],[0,-2,-1],[2,0,-1],[-2,0,-1]])){const origin=target.clone().add(new T.Vector3(...delta));origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));const d=target.clone().sub(origin).normalize();d.set(...d.toArray().map(v=>Math.round(v*1000)/1000));const native=new T.Raycaster(origin,d.clone().normalize(),0,ghosts.rules.weapons.rifle.range).intersectObject(a.mesh,false)[0];tested++;if(!native)continue;
const front=C.rifleSkullEntry(id,{p:[0,0,0],r:0},origin.toArray(),d.toArray());if(front===null||front<=native.distance+.001||a.mesh.geometry.attributes.rifleSkull.getX(native.face.a))continue;hidden++;
const point=origin.clone().addScaledVector(d.clone().normalize(),front).toArray().map(v=>Math.round(v*1000)/1000),shot={t:'a',w:'rifle',o:origin.toArray(),d:d.toArray(),hc:[1,...point]};if(C.rifleHeadContact(id,{p:[0,0,0],r:0},shot,origin.toArray(),ghosts.rules.weapons.rifle.range,4)){falseHeads++;byStyle[style]++;if(details.length<12)details.push({id,style,time,yy,delta,headlocal:a.bones.head.worldToLocal(native.point.clone()).toArray(),native:native.distance,front,point});}
}}}a.dispose();}return{tested,hidden,falseHeads,byStyle,variantKeys,phases:7,details};});
fs.writeFileSync(`${out}/oblique.json`,JSON.stringify(oblique,null,2));
check(oblique.tested===8505&&oblique.variantKeys.length===15&&new Set(oblique.variantKeys.map(v=>v.id)).size===15&&oblique.hidden>0&&oblique.falseHeads===0,"actual oblique hidden-skull forgeries fail closed across every beanie build/height and seven standing phases");
const y=await a.evaluate(()=>(config.PVP_RIFLE_HEAD.headY+.153)*peer().avatar.look.tall);
await a.evaluate(y=>aimAt(y),y);
await a.waitForFunction(()=>ghosts.connected&&peer()?.speed<.01&&(peer().avatar.gait??0)<.01);
const shoot=async count=>{await a.evaluate(()=>combat.fire('rifle'));await a.waitForFunction(n=>acks.length===n,count);};
await shoot(1);
const first=await a.evaluate(()=>({ack:acks[0],wire:combat.lastShot,hits:combat.hits,effects,markers:[...markers]}));
check(first.ack.head===true&&first.ack.l===8&&first.ack.award.points===5&&first.wire.hc[0]===1,'actual standing SkinnedMesh head contact confirms 2 HP plus one normal award');
await b.waitForFunction(()=>combat.lives===8);await a.waitForFunction(()=>peer().lives===8);
check(await b.evaluate(()=>hurts[0].head===true&&deaths===0),'receiver and public ghost health reflect 2 HP without death');
await a.evaluate(()=>combat.hit(acks[0],peer()));
check(await a.evaluate(()=>combat.hits===1&&effects===1&&markers.length===1&&markers[0]===true),'score/marker/onHit replay is idempotent after authoritative head acknowledgment');
await a.evaluate(()=>aimAt(1));await shoot(2);
check(await a.evaluate(()=>acks[1].l===7&&!acks[1].head&&!combat.lastShot.hc),'actual native torso face remains 1 HP/body marker');
const nearest=await a.evaluate(()=>{const g=ghosts.add('closer-proof','Closer');g.push({p:[0,0,-2],r:0,h:'rifle',score:0,l:10});ghosts.update();const id=combat.rifleContact().target?.id;g.dispose();ghosts.others.delete(g.id);return id;});
check(nearest==='closer-proof','nearest ACTUAL native body surface wins before a further valid head target');

await a.evaluate(y=>{aimAt(y);window.wall=new T.Mesh(new T.BoxGeometry(2,2,.025),new T.MeshBasicMaterial());wall.position.set(0,1,-.2);scene.add(wall);scene.updateMatrixWorld(true);},y);
const before=await b.evaluate(()=>remoteShots);await a.evaluate(()=>combat.fire('rifle'));await b.waitForFunction(n=>remoteShots>n,before);
check(await a.evaluate(()=>combat.lastShot.to===null&&!combat.lastShot.hc&&acks.length===2),'real wall within OLD 0.3m target gap rejects head/contact before server scoring');
await a.evaluate(()=>{wall.removeFromParent();wall.geometry.dispose();wall.material.dispose();aimAt(3);});
const missed=await b.evaluate(()=>remoteShots);await a.evaluate(()=>combat.fire('rifle'));await b.waitForFunction(n=>remoteShots>n,missed);
check(await a.evaluate(()=>combat.lastShot.to===null&&acks.length===2),'native above-head miss has no contact, score or damage');
const sendProof=async(hc,count)=>{await a.evaluate(hc=>{ghosts.fire({w:'rifle',o:combatHead.o,d:combatHead.d,to:peer().id,hc});},hc);await a.waitForFunction(n=>acks.length===n,count);};
await a.evaluate(w=>window.combatHead=w,first.wire);
await sendProof([1,0,first.wire.hc[2],0],3);
check(await a.evaluate(()=>!acks[2].head&&acks[2].l===6),'forged interior point cannot turn body-only fallback into 2 HP');
await sendProof([9,...first.wire.hc.slice(1)],4);
check(await a.evaluate(()=>!acks[3].head&&acks[3].l===5),'unknown physical profile version cannot award a head hit');
await b.evaluate(()=>window.crouched=true);await a.waitForFunction(()=>peer().crouch===1);
await sendProof(first.wire.hc,5);
check(await a.evaluate(()=>!acks[4].head&&acks[4].l===4),'server actual crouched target rejects standing head proof');
await b.evaluate(()=>window.crouched=false);await a.waitForFunction(()=>peer().crouch===0);
// Three ACTUAL body hits leave exactly 1 HP, proving an overkill head still creates only one death.
await a.evaluate(()=>aimAt(1));await shoot(6);await shoot(7);await shoot(8);await b.waitForFunction(()=>combat.lives===1);
await a.evaluate(y=>aimAt(y),y);await shoot(9);await b.waitForFunction(()=>deaths===1);
check(await a.evaluate(()=>acks[8].head===true&&acks[8].dead===true&&acks[8].l===-1&&!!acks[8].kill&&acks[8].award.seq===9),'low-HP validated head produces ONE lethal receipt and ONE award');
check(await b.evaluate(()=>deaths===1&&combat.lives===combat.maxLives&&hurts.at(-1).dead===true),'same shared life reducer resets target once after lethal head');
await a.evaluate(()=>combat.hit(acks.at(-1),peer()));
check(await a.evaluate(()=>combat.hits===9&&markers.length===9),'lethal acknowledgment replay cannot create extra marker/hit effects');
// Real server-issued target ids and actual animated Ghosts, not forged client-selected styles or bind-pose proxies.
for(const style of [1,2,3]){
 for(let attempt=0;attempt<40;attempt++){
  if(await b.evaluate(s=>config.avatarLook(ghosts.me).style===s,style))break;
  await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await b.waitForFunction(()=>ghosts.connected);
  if(attempt===39)throw Error('Cannot obtain real bounded target style '+style);
 }
 await a.waitForFunction(s=>peer()?.avatar.look.style===s&&peer()?.snaps.length&&peer().avatar.time>.65&&peer().speed<.01,style);
 await a.waitForFunction(()=>{const g=peer(),p=config.PVP_RIFLE_HEAD.corePatches[g.avatar.look.style]??config.PVP_RIFLE_HEAD.patch,width=[.93,1,1.08][g.avatar.look.build];for(const fraction of [.5,.3,.7])for(const x of [0,-.003,.003]){aimAt((config.PVP_RIFLE_HEAD.headY+p.low+(p.high-p.low)*fraction)*g.avatar.look.tall,x*width);const contact=combat.rifleContact();if(contact.hc&&config.rifleHeadContact(g.id,{p:g.feet.toArray(),r:g.root.rotation.y},{t:'a',w:'rifle',o:contact.o.toArray(),d:contact.d.toArray(),hc:contact.hc.map((v,i)=>i?Math.round(v*1000)/1000:v)},position,ghosts.rules.weapons.rifle.range,4))return true;}return false;},null,{timeout:8000});
 await shoot(9+style);fs.writeFileSync(`${out}/live-style${style}.json`,JSON.stringify(await a.evaluate(()=>({ack:acks.at(-1),wire:combat.lastShot,target:peer().id,look:peer().avatar.look,time:peer().avatar.time})),null,2));await b.waitForFunction(()=>combat.lives===8);
 check(await a.evaluate(s=>acks.at(-1).head===true&&acks.at(-1).l===8&&acks.at(-1).award.points===5&&peer().avatar.look.style===s&&!!combat.lastShot.hc,style),`real animated Ghost / Worker style${style} exposed central surface confirms 2 HP and one award`);
}

await a.evaluate(()=>{const hud=document.getElementById('hud');hud.hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;document.getElementById('native-head-proof')?.remove();const pre=document.createElement('pre');pre.id='native-head-proof';pre.textContent=['Native actual modules (no WebGL)',`Head: ${acks[0].head}, HP ${acks[0].l}, reward ${acks[0].award.points}`,`Body: ${acks[1].head===true}, HP ${acks[1].l}`,`Lethal: HP ${acks[8].l}, dead ${acks[8].dead}`,`Kill receipt: ${!!acks[8].kill}`,`Styles 1/2/3: ${acks.slice(9,12).map(m=>m.head&&m.l===8).join("/")}`,`Effects: ${effects}, marker shows: ${markers.length}`,`Server connection: ${ghosts.connected}`].join('\n');pre.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:16px/1.6 system-ui';document.body.append(pre);});
check(await a.evaluate(()=>{const p=document.getElementById('native-head-proof').getBoundingClientRect();return p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight&&combat.hitMarker.el.textContent==='Huvudträff!'&&!combat.hitMarker.el.hidden;}),'actual authoritative head marker and measured proof rows visibly fit native viewport');
await a.screenshot({path:`${out}/rifle-head-native.png`});
// A new ACTUAL shooter connection resets the unchanged minute cap; no fake timer or mutation of server budget.
await a.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await a.waitForFunction(()=>ghosts.connected&&peer()?.avatar.look.style===3&&peer().avatar.time>.65);
const covered=await a.evaluate(()=>{aimAt((config.PVP_RIFLE_HEAD.headY+.19)*peer().avatar.look.tall);const candidate=combat.rifleContact(),hit=new T.Raycaster(candidate.o,candidate.d.clone().normalize(),0,ghosts.rules.weapons.rifle.range).intersectObject(peer().avatar.mesh,false)[0];return{skull:peer().avatar.mesh.geometry.attributes.rifleSkull.getX(hit.face.a),bone:peer().avatar.mesh.geometry.attributes.skinIndex.getX(hit.face.a),head:peer().avatar.mesh.skeleton.bones.indexOf(peer().avatar.bones.head),hc:candidate.hc};});
await shoot(13);await b.waitForFunction(()=>combat.lives===7);
check(!covered.skull&&covered.bone===covered.head&&!covered.hc&&await a.evaluate(()=>!acks[12].head&&acks[12].l===7&&acks[12].award.points===5),'actual nearer beanie head-bone surface retains BODY1, not a forced skull/head positive');

// Actual fresh Worker receives a forged first pure-skull proof on a steep beanie ray; no trusted client head/damage.
await a.evaluate(()=>{position=[0,0,-1];ghosts.update();});await a.waitForFunction(()=>ghosts.sent?.p[2]===-1);
await a.evaluate(()=>{const g=peer(),state={p:g.feet.toArray(),r:g.root.rotation.y},y=(config.PVP_RIFLE_HEAD.headY+.136)*g.avatar.look.tall,o=[0,+(y+2).toFixed(2),-1],d=[0,-.894,.447],entry=config.rifleSkullEntry(g.id,state,o,d),unit=d.map(v=>v/Math.hypot(...d));ghosts.fire({w:'rifle',to:g.id,o,d,hc:[1,...o.map((v,i)=>+(v+unit[i]*entry).toFixed(3))]});});
await a.waitForFunction(()=>acks.length===14);await b.waitForFunction(()=>combat.lives===6);
check(await a.evaluate(()=>acks[13].l===6&&!acks[13].head&&acks[13].award.points===5),'actual fresh Worker rejects steep beanie hidden-skull forge as BODY1 with one unchanged award');

check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls in actual-module protocol/DOM evidence');completed=true;

}finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.ws?.close();}).catch(()=>{});await browser.close();check(errors.length===0,'zero native page errors');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,completed},null,2));}
console.log(`ALL ${failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
