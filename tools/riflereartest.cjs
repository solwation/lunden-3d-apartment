// #933 actual Avatar/Ghosts/Combat + Worker, no apartment/WebGL. game worker artifacts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
// Frozen pre-rear production model; no copied test shape or PRNG.
const beforeAvatar=execFileSync('git',['show','6f35db5:src/avatar.js'],{encoding:'utf8'});
const [game='http://localhost:8875',worker='http://localhost:8876',out='/tmp/lunden-rifle-head']=process.argv.slice(2);
let checks=0,failures=0,completed=false; const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`);};
(async()=>{
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});const errors=[],pages=[];
try{
for(let i=0;i<2;i++){
const p=await browser.newPage({viewport:{width:850,height:500}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
await p.route('**/src/avatar-before.js',r=>r.fulfill({contentType:'text/javascript',body:beforeAvatar}));
await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native actual modules only'}));await p.goto(game);
await p.evaluate(async({worker,i})=>{
const context=HTMLCanvasElement.prototype.getContext;window.gl=0;HTMLCanvasElement.prototype.getContext=function(k,...args){if(/webgl/i.test(k)){gl++;throw Error('WebGL forbidden');}return context.call(this,k,...args);};
window.T=await import('three');window.config=await import('/src/config.js');window.Avatar=(await import('/src/avatar.js')).Avatar;
const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
window.sentWires=[];const send=WebSocket.prototype.send;WebSocket.prototype.send=function(value){if(typeof value==='string'){try{const m=JSON.parse(value);if(m.t==='a')sentWires.push({text:value,bytes:new TextEncoder().encode(value).length,shot:m});}catch{}}return send.call(this,value);};
window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);window.position=[0,0,i?0:4];window.crouched=false;window.weapon='rifle';
camera.position.set(...position);camera.position.y=1.62;camera.lookAt(0,1.62,i?4:0);camera.updateMatrixWorld();
window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Head Target':'Rifle Shooter',active:()=>true,weapon:()=>weapon,score:()=>0,mirrored:()=>false,state:()=>({p:position,r:0,c:crouched})});
window.acks=[];window.hurts=[];window.markers=[];window.effects=0;window.deaths=0;window.remoteShots=0;
window.combat=new Combat({scene,camera,ghosts,weapon:()=>weapon,feet:()=>new T.Vector3(...position),onHit:()=>effects++,onDie:()=>deaths++,sfx:{}});
const originalShot=ghosts.onShot;ghosts.onShot=(m,g)=>{remoteShots++;originalShot?.(m,g);};
const hit=ghosts.onHit,hurt=ghosts.onHurt;ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onHurt=(m,g)=>{hurts.push(structuredClone(m));hurt(m,g);};
const mark=combat.hitMarker.show.bind(combat.hitMarker);combat.hitMarker.show=m=>{markers.push(m.head===true);mark(m);};
window.tick=null; // native geometry inventory runs before room connection/idle clock
window.peer=()=>[...ghosts.others.values()][0];
window.aimAt=(y,x=0)=>{camera.position.set(position[0],position[1]+1.62,position[2]);camera.lookAt(position[0]+x,y,peer()?.feet.z??0);camera.updateMatrixWorld();};
window.aimRear=()=>{
 const g=peer(),P=g.avatar.look.style===3?config.PVP_RIFLE_HEAD.rear.beanie:config.PVP_RIFLE_HEAD.rear.lower;
 // A narrow whole-cell core can fall between r3 rays at one fixed distance; use real shooter positions, not wider guards.
 for(const distance of [4,3.8,4.2,3.6,4.4,3.5,4.5,5,3.75,4.25,3.9,4.1])for(const y of [(P.low+P.high)/2,P.low+.0015,P.high-.0015]){
  window.position=[g.feet.x,g.feet.y,g.feet.z+distance];aimAt(g.feet.y+(config.PVP_RIFLE_HEAD.headY+y)*g.avatar.look.tall);
  if(combat.rifleContact().hc)return true;
 }
 if(g.avatar.look.style===1)return false;throw Error('no actual supported rear ray across bounded legal shooter positions');
};
window.proof=async()=>{
 let eligible=0,bad=0,maxResidual=0,shapeError=0,negative=0,falseHeads=0,geometryChanges=0,maxCoordinate=0,cellSamples=0,cellWrong=0,forgedSamples=0,forgedWrong=0,longHair=0,missingRay=0;
 const variants=new Set(),positiveVariants=new Set(),details=[],OldAvatar=(await import('/src/avatar-before.js')).Avatar;
 for(let seed=0;seed<1500&&variants.size<60;seed++){
  const id='rear-'+seed,lk=config.avatarLook(id),key=[lk.style,lk.build,lk.tall].join('/');if(variants.has(key))continue;variants.add(key);
  const a=new Avatar(id),old=new OldAvatar(id),root=new T.Group();root.add(a.object);
  for(const name of ['position','normal','color','skinIndex','skinWeight','rifleSkull','rifleNose']){const x=a.mesh.geometry.attributes[name].array,y=old.mesh.geometry.attributes[name].array;if(x.length!==y.length)geometryChanges++;else for(let j=0;j<x.length;j++)if(x[j]!==y[j])geometryChanges++;}old.dispose();
  const array=a.mesh.geometry.attributes.position,flag=a.mesh.geometry.attributes.rifleSkull,actual=[];
  for(let j=0;j<flag.count;j++)if(flag.getX(j))actual.push([array.getX(j),array.getY(j)-1.54,array.getZ(j)]);
  const canonical=config.rifleSkullProfile().flat();if(actual.length!==canonical.length)throw Error('skull topology mismatch');
  for(let j=0;j<actual.length;j++)for(let axis=0;axis<3;axis++)shapeError=Math.max(shapeError,Math.abs(actual[j][axis]-canonical[j][axis]));
  const P=lk.style===3?config.PVP_RIFLE_HEAD.rear.beanie:config.PVP_RIFLE_HEAD.rear.lower,w=[.93,1,1.08][lk.build];
  for(const time of [0,.4,2,5]){
   if(time)a.update(time,{speed:0});
   for(const yaw of [0,.8,Math.PI,-1.6]){
    root.rotation.y=yaw;root.updateMatrixWorld(true);
    for(const yy of [P.low-.003,P.low+.001,(P.low+P.high)/2,P.high-.001,P.high+.003])for(const xx of [-.01,0,.01])for(const offset of [[0,0,3],[.12,.12,3],[-.12,-.12,3]]){
     const point=new T.Vector3(-xx*w,(config.PVP_RIFLE_HEAD.headY+yy)*lk.tall,.08*w).applyAxisAngle(new T.Vector3(0,1,0),yaw);
     const origin=point.clone().add(new T.Vector3(...offset).applyAxisAngle(new T.Vector3(0,1,0),yaw));origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));
     const direction=point.clone().sub(origin).normalize();direction.set(...direction.toArray().map(v=>Math.round(v*1000)/1000));
     const native=new T.Raycaster(origin,direction.clone().normalize(),0,40).intersectObject(a.mesh,false)[0];if(!native)continue;
     const hc=[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)],state={p:[0,0,0],r:yaw},shot={t:'a',w:'rifle',o:origin.toArray(),d:direction.toArray(),hc};
     const entry=config.rifleSkullEntry(id,state,shot.o,shot.d),rear=!!flag.getX(native.face.a)&&config.rifleHeadRearRegion(id,state,hc.slice(1),shot.o,shot.d),accepted=config.rifleHeadContact(id,state,shot,shot.o,40,4);
     if(rear){eligible++;positiveVariants.add(key);const error=entry===null?100:Math.abs(entry-origin.distanceTo(new T.Vector3(...hc.slice(1))));maxResidual=Math.max(maxResidual,error);if(!accepted){bad++;if(details.length<12)details.push({id,key,time,yaw,yy,xx,offset,error,hc});}
      if(a.rifleHeadContact(native,state,id))missingRay++;
      if(eligible%24===0){for(const dx of [-.0005,.0005])for(const dy of [-.0005,.0005])for(const dz of [-.0005,.0005]){const q=new T.Vector3(hc[1]+dx,hc[2]+dy,hc[3]+dz).sub(origin).normalize(),h=new T.Raycaster(origin,q,0,40).intersectObject(a.mesh,false)[0];cellSamples++;if(!h||!flag.getX(h.face.a))cellWrong++;}}
      if(time===0&&yaw===0&&xx===0){const delta=[4998,4998,4995],s2={p:delta,r:yaw},q2={...shot,o:shot.o.map((v,i)=>+(v+delta[i]).toFixed(2)),hc:[1,...hc.slice(1).map((v,i)=>+(v+delta[i]).toFixed(3))]};if(config.rifleHeadContact(id,s2,q2,q2.o,40,4))maxCoordinate++;else bad++;}
     }else if(!a.rifleHeadContact(native,state,id,shot.o,shot.d)){negative++;if(lk.style===1)longHair++;if(accepted){falseHeads++;if(details.length<12)details.push({negative:true,id,time,yaw,yy,xx,offset,hc});}}
     // Independently forge the FIRST pure skull surface BEHIND the actual non-skull contact.
     if(!flag.getX(native.face.a)&&entry!==null&&entry>native.distance+.001){forgedSamples++;const q=origin.clone().addScaledVector(direction.clone().normalize(),entry).toArray().map(v=>Math.round(v*1000)/1000),forged={...shot,hc:[1,...q]};if(config.rifleHeadContact(id,state,forged,shot.o,40,4)){forgedWrong++;if(details.length<12)details.push({forged:true,id,time,yaw,offset,first:hc,forged:forged.hc});}}
    }
    // Front/side/steep approaches at the region centre are independent fail-closed negatives.
    for(const offset of [[0,0,-3],[3,0,0],[-3,0,0],[0,3,3],[0,-3,3]]){
     const point=new T.Vector3(0,(config.PVP_RIFLE_HEAD.headY+(P.low+P.high)/2)*lk.tall,.08*w).applyAxisAngle(new T.Vector3(0,1,0),yaw),origin=point.clone().add(new T.Vector3(...offset).applyAxisAngle(new T.Vector3(0,1,0),yaw));origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));
     const d=point.clone().sub(origin).normalize();d.set(...d.toArray().map(v=>Math.round(v*1000)/1000));const entry=config.rifleSkullEntry(id,{p:[0,0,0],r:yaw},origin.toArray(),d.toArray());if(entry!==null){const q=origin.clone().addScaledVector(d.clone().normalize(),entry).toArray().map(v=>Math.round(v*1000)/1000);negative++;if(config.rifleHeadRearRegion(id,{p:[0,0,0],r:yaw},q,origin.toArray(),d.toArray()))falseHeads++;}
    }
   }
  }a.dispose();await new Promise(resolve=>setTimeout(resolve,0));
 }return{eligible,bad,negative,falseHeads,maxResidual,shapeError,geometryChanges,maxCoordinate,cellSamples,cellWrong,forgedSamples,forgedWrong,longHair,missingRay,variants:variants.size,positiveVariants:positiveVariants.size,details};
};
}, {worker,i});
}
const [a,b]=pages;
if(!process.argv.includes('--protocol-only')){
const parity=await a.evaluate(()=>proof());fs.writeFileSync(`${out}/parity.json`,JSON.stringify(parity,null,2));
check(parity.eligible>100&&parity.variants===60&&parity.shapeError<1e-6&&parity.geometryChanges===0&&parity.maxCoordinate>10&&parity.positiveVariants===45,'actual native skin raycasts cover all60 canonical style/build/height variants; exact unchanged mesh arrays, pure skull vertex parity, standing/bind poses and near-max coordinates');
check(parity.bad===0,`v1 first-surface tolerance covers sampled ACTUAL nearest head contacts (max ${parity.maxResidual.toFixed(5)}m, bad ${parity.bad})`);
check(parity.negative>1000&&parity.falseHeads===0,'actual unsupported nearest skull/face/jaw/hair/back/outside-core contacts never get head bonus');
check(parity.cellSamples>100&&parity.cellWrong===0,'independent eight-corner actual native first-contact rays keep accepted quantized cells on exposed skull');
check(parity.forgedSamples>100&&parity.forgedWrong===0,'forged FIRST pureSkullEntry behind actual hair/neck/face contact never gets rear bonus');
check(parity.longHair>1000&&parity.missingRay===0,'long hair has no rear bonus and new rear classifier fails closed without snapped ray');
console.log(JSON.stringify(parity));
}
await Promise.all(pages.map(p=>p.evaluate(()=>{tick=setInterval(()=>{ghosts.update();combat.update(0);},35);})));
await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
for(let attempt=0;attempt<40;attempt++){
 if(await b.evaluate(()=>config.avatarLook(ghosts.me).style===0))break;
 await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await b.waitForFunction(()=>ghosts.connected);
 if(attempt===39)throw Error('No supported server seed after bounded reconnects');
}
await a.waitForFunction(()=>peer()?.avatar.look.style===0&&peer()?.snaps.length&&peer().root.visible);
await a.waitForFunction(()=>peer().speed<.01&&(peer().avatar.gait??0)<.01);
await a.waitForTimeout(650); // real initial server stationary gate, even in short diagnostics
const y=await a.evaluate(()=>(config.PVP_RIFLE_HEAD.headY+.022)*peer().avatar.look.tall);
await a.evaluate(()=>aimRear());await a.waitForFunction(()=>ghosts.sent?.p[2]===position[2]);
await a.waitForFunction(()=>ghosts.connected&&peer()?.speed<.01&&(peer().avatar.gait??0)<.01);
const shoot=async count=>{await a.evaluate(()=>combat.fire('rifle'));await a.waitForFunction(n=>acks.length===n,count);};
await shoot(1);
const first=await a.evaluate(()=>({ack:acks[0],wire:combat.lastShot,hits:combat.hits,effects,markers:[...markers]}));fs.writeFileSync(`${out}/first-shot.json`,JSON.stringify(first,null,2));
check(first.ack.head===true&&first.ack.l===8&&first.ack.award.points===5&&first.wire.hc[0]===1,'actual standing SkinnedMesh head contact confirms 2 HP plus one normal award');
await b.waitForFunction(()=>combat.lives===8);await a.waitForFunction(()=>peer().lives===8);
check(await b.evaluate(()=>hurts[0].head===true&&deaths===0),'receiver and public ghost health reflect 2 HP without death');
await a.evaluate(()=>combat.hit(acks[0],peer()));
check(await a.evaluate(()=>combat.hits===1&&effects===1&&markers.length===1&&markers[0]===true),'score/marker/onHit replay is idempotent after authoritative head acknowledgment');
await a.evaluate(()=>aimAt(1));await shoot(2);
check(await a.evaluate(()=>acks[1].l===7&&!acks[1].head&&!combat.lastShot.hc),'actual native torso face remains 1 HP/body marker');
const nearest=await a.evaluate(()=>{const g=ghosts.add('closer-proof','Closer');g.push({p:[0,0,2],r:0,h:'rifle',score:0,l:10});ghosts.update();const id=combat.rifleContact().target?.id;g.dispose();ghosts.others.delete(g.id);return id;});
check(nearest==='closer-proof','nearest ACTUAL native body surface wins before a further valid head target');

await a.evaluate(y=>{aimAt(y);window.wall=new T.Mesh(new T.BoxGeometry(2,2,.025),new T.MeshBasicMaterial());wall.position.set(0,1,.2);scene.add(wall);scene.updateMatrixWorld(true);},y);
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
await a.evaluate(()=>aimRear());await a.waitForFunction(()=>ghosts.sent?.p[2]===position[2]);await shoot(9);await b.waitForFunction(()=>deaths===1);
check(await a.evaluate(()=>acks[8].head===true&&acks[8].dead===true&&acks[8].l===-1&&!!acks[8].kill&&acks[8].award.seq===9),'low-HP validated head produces ONE lethal receipt and ONE award');
check(await b.evaluate(()=>deaths===1&&combat.lives===combat.maxLives&&hurts.at(-1).dead===true),'same shared life reducer resets target once after lethal head');
await a.evaluate(()=>combat.hit(acks.at(-1),peer()));
check(await a.evaluate(()=>combat.hits===9&&markers.length===9),'lethal acknowledgment replay cannot create extra marker/hit effects');
const styles=[0];let count=9;
for(const style of [1,2,3]){
 for(let attempt=0;attempt<40;attempt++){
  await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await b.waitForFunction(()=>ghosts.connected);
  if(await b.evaluate(style=>config.avatarLook(ghosts.me).style===style,style))break;
  if(attempt===39)throw Error('canonical target style unavailable within bounded reconnect attempts');
 }
 await a.waitForFunction(style=>peer()?.avatar.look.style===style&&peer()?.snaps.length&&peer().root.visible,style);
 if(style===3){
  await b.evaluate(()=>window.position=[4998,4998,4995]);await a.evaluate(()=>{window.position=[4998,4998,4999];camera.position.set(4998,4999.62,4999);camera.updateMatrixWorld();});
  await a.waitForFunction(()=>peer()?.feet.distanceTo(new T.Vector3(4998,4998,4995))<.001&&peer().root.visible);
 }
 await a.waitForFunction(()=>peer()?.speed<.01&&(peer()?.avatar.gait??0)<.01);await a.waitForTimeout(650);
 await a.evaluate(()=>aimRear());await a.waitForFunction(()=>ghosts.sent?.p[2]===position[2]);
 await shoot(++count);const hp=style===1?9:8;await b.waitForFunction(hp=>combat.lives===hp,hp);await a.waitForFunction(hp=>peer().lives===hp,hp);
 check(await a.evaluate(({n,style})=>style===1?!acks[n].head&&acks[n].l===9:acks[n].head===true&&acks[n].l===8,{n:count-1,style}),style===1?'actual long hair FIRST surface keeps1HP/body receipt':`actual canonical hairstyle ${style} client→Worker exposed rear2HP and shared health`);styles.push(style);
}
fs.writeFileSync(`${out}/styles.json`,JSON.stringify(styles));
const wires=await a.evaluate(()=>sentWires);fs.writeFileSync(`${out}/serialized-wires.json`,JSON.stringify(wires,null,2));
// Version9 is the intentional rejection control; its body-only receipt is asserted above.
check(wires.every(({bytes,shot:m})=>bytes<=256&&m.o.every(v=>Math.abs(v)<=5000&&Math.abs(v*100-Math.round(v*100))<1e-6)&&m.d.every(v=>Math.abs(v*1000-Math.round(v*1000))<1e-6)&&(!m.hc||(m.hc[0]===1||m.hc[0]===9)&&m.hc.slice(1).every(v=>Math.abs(v)<=5002&&Math.abs(v*1000-Math.round(v*1000))<1e-6)))&&wires.at(-1).shot.hc[0]===1&&wires.at(-1).shot.o[1]>4999,'actual serialized v1/r2/r3/256byte wire including near-max-coordinate Worker2HP');
await a.evaluate(()=>{const hud=document.getElementById('hud');hud.hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;document.getElementById('native-head-proof')?.remove();const pre=document.createElement('pre');pre.id='native-head-proof';pre.textContent=['Native actual modules (no WebGL)',`Head: ${acks[0].head}, HP ${acks[0].l}, reward ${acks[0].award.points}`,`Body: ${acks[1].head===true}, HP ${acks[1].l}`,`Lethal: HP ${acks[8].l}, dead ${acks[8].dead}`,`Kill receipt: ${!!acks[8].kill}`,`Effects: ${effects}, marker shows: ${markers.length}`,`Server connection: ${ghosts.connected}`].join('\n');pre.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:16px/1.6 system-ui';document.body.append(pre);});
check(await a.evaluate(()=>{const p=document.getElementById('native-head-proof').getBoundingClientRect();return p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight&&combat.hitMarker.el.textContent==='Huvudträff!'&&!combat.hitMarker.el.hidden;}),'actual authoritative head marker and measured proof rows visibly fit native viewport');
await a.screenshot({path:`${out}/rifle-rear-native.png`});
check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls in actual-module protocol/DOM evidence');completed=true;

}finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.ws?.close();}).catch(()=>{});await browser.close();check(errors.length===0,'zero native page errors');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,completed},null,2));}
console.log(`ALL ${failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
