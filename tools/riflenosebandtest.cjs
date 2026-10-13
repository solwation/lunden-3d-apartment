// #937 lower central standing nose band: actual Avatar/Ghosts/Combat + Worker, no apartment/WebGL. game worker artifacts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
// Frozen pre-nose production model; no copied test shape or PRNG.
const beforeAvatar=execFileSync('git',['show','023f4ca:src/avatar.js'],{encoding:'utf8'});
// Test-only access to ORIGINAL parts metadata. No geometry/seed/shader formulas copied or changed.
const partInspection=`\nexport function fixturePartRanges(style,sleeves){let first=0;return parts(style,sleeves).map(p=>{const g=p[0],n=g.index?g.index.count:g.attributes.position.count,r={first,last:first+n,region:Object.entries(REGION).find(([,v])=>v===p[1])[0],shade:p[2],bone:p.bone,type:g.type};first+=n;g.dispose();return r;});}`;
const highworldOnly=process.argv.includes('--highworld'),forgeryOnly=process.argv.includes('--forgery'),protocolOnly=process.argv.includes('--protocol'),geometryOnly=process.argv.includes('--geometry'),legacy=process.argv.includes('--legacy');
const [game='http://localhost:8876',worker='http://localhost:8877',out='/tmp/lunden-rifle-head']=process.argv.slice(2);
const frozenPaths=['src/config.js','src/avatar.js','src/ghosts.js','src/combat.js','cloudflare/players.js','cloudflare/worker.js','tools/riflenosebandtest.cjs'];const source=()=>Object.fromEntries(frozenPaths.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));const beforeSource=source();
let checks=0,failures=0,completed=false; const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`);};
(async()=>{
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/source-freeze.json',JSON.stringify(beforeSource,null,2));const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});const errors=[],pages=[];const bound=setTimeout(()=>browser.close(),420000);
try{
for(let i=0;i<2;i++){
const p=await browser.newPage({viewport:{width:850,height:500}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.text().startsWith('NOSE_PROGRESS ')){const data=JSON.parse(m.text().slice(14));console.log(m.text());fs.writeFileSync(out+'/partial.json',JSON.stringify(data,null,2));}});
await p.route('**/src/avatar-before.js',r=>r.fulfill({contentType:'text/javascript',body:beforeAvatar+partInspection}));
await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native actual modules only'}));await p.goto(game);
await p.evaluate(async({worker,i})=>{
const context=HTMLCanvasElement.prototype.getContext;window.gl=0;HTMLCanvasElement.prototype.getContext=function(k,...args){if(/webgl/i.test(k)){gl++;throw Error('WebGL forbidden');}return context.call(this,k,...args);};
window.T=await import('three');window.config=await import('/src/config.js');window.oldNoseRegion=(id,state,p)=>config.rifleNoseRegion(id,state,p)||config.rifleNoseExtraRegion(id,state,p);window.avatarModule=await import('/src/avatar.js');window.Avatar=avatarModule.Avatar;
const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);window.position=[0,0,i?0:-2];window.crouched=false;window.weapon='rifle';
camera.position.set(...position);camera.position.y=1.62;camera.lookAt(0,1.62,i?-4:0);camera.updateMatrixWorld();
window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Head Target':'Rifle Shooter',active:()=>true,weapon:()=>weapon,score:()=>0,mirrored:()=>false,state:()=>({p:position,r:0,c:crouched})});
window.wires=[];const wsSend=WebSocket.prototype.send;WebSocket.prototype.send=function(data){try{const m=JSON.parse(data);if(m.t==='a')wires.push({data,m});}catch{}return wsSend.call(this,data);};window.acks=[];window.hurts=[];window.markers=[];window.effects=0;window.deaths=0;window.remoteShots=0;
window.combat=new Combat({scene,camera,ghosts,weapon:()=>weapon,feet:()=>new T.Vector3(...position),onHit:()=>effects++,onDie:()=>deaths++,sfx:{}});
const originalShot=ghosts.onShot;ghosts.onShot=(m,g)=>{remoteShots++;originalShot?.(m,g);};
const hit=ghosts.onHit,hurt=ghosts.onHurt;ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onHurt=(m,g)=>{hurts.push(structuredClone(m));hurt(m,g);};
const mark=combat.hitMarker.show.bind(combat.hitMarker);combat.hitMarker.show=m=>{markers.push(m.head===true);mark(m);};
window.tick=null; // native geometry inventory runs before room connection/idle clock
window.peer=()=>[...ghosts.others.values()][0];
window.aimAt=(y,x=0)=>{camera.position.set(0,1.62,-2);camera.lookAt(x,y,0);camera.updateMatrixWorld();};
window.findExtra=()=>{const g=peer(),state={p:g.feet.toArray(),r:g.root.rotation.y},m=g.avatar.mesh,flag=m.geometry.attributes.rifleNose;g.root.updateMatrixWorld(true);const diag={feet:g.feet.toArray(),look:g.avatar.look,head:g.avatar.bones.head.getWorldPosition(new T.Vector3()).toArray(),triangles:0,regionPoints:0,contacts:0,samples:[],bounds:{x:[Infinity,-Infinity],y:[Infinity,-Infinity],z:[Infinity,-Infinity]}};for(let i=0;i<flag.count;i+=3){if(!flag.getX(i))continue;diag.triangles++;const v=[0,1,2].map(j=>m.getVertexPosition(i+j,new T.Vector3()).applyMatrix4(m.matrixWorld));for(const weights of Array.from({length:11},(_,i)=>Array.from({length:11-i},(_,j)=>[i/10,j/10,1-(i+j)/10])).flat()){const p=new T.Vector3();weights.forEach((w,j)=>p.addScaledVector(v[j],w));const rounded=p.toArray().map(v=>+(v).toFixed(3));for(const [axis,k]of ['x','y','z'].entries()){diag.bounds[k][0]=Math.min(diag.bounds[k][0],rounded[axis]);diag.bounds[k][1]=Math.max(diag.bounds[k][1],rounded[axis]);}if(oldNoseRegion(g.id,state,rounded)||!config.rifleNoseBandRegion(g.id,state,rounded))continue;diag.regionPoints++;camera.position.set(0,1.62,-2);camera.lookAt(p);camera.updateMatrixWorld();const c=combat.rifleContact();if(c.hc){diag.contacts++;const o=camera.position.toArray().map(v=>+(v).toFixed(2)),d=camera.getWorldDirection(new T.Vector3()).toArray().map(v=>+(v).toFixed(3)),hc=[1,...c.hc.slice(1).map(v=>+(v).toFixed(3))];if(diag.samples.length<5)diag.samples.push({hc,old:oldNoseRegion(g.id,state,hc.slice(1)),extra:config.rifleNoseBandRegion(g.id,state,hc.slice(1)),server:config.rifleHeadContact(g.id,state,{t:'a',w:'rifle',o,d,hc},position,40,4)});if(!oldNoseRegion(g.id,state,hc.slice(1))&&config.rifleNoseBandRegion(g.id,state,hc.slice(1))&&config.rifleHeadContact(g.id,state,{t:'a',w:'rifle',o,d,hc},position,40,4)){window.aimDiagnostics=diag;return c;}}}}window.aimDiagnostics=diag;return null;};window.aimExtra=async()=>{const end=performance.now()+12000;while(performance.now()<end){const c=findExtra();if(c)return c;await new Promise(r=>setTimeout(r,50));}throw Error('no admissible actual animated outside-old-core nose triangle within12s: '+JSON.stringify(aimDiagnostics));};


window.proof=async(forgeryOnly=false,highworldOnly=false)=>{
 const forgedByPart={};let unsupportedNose=0;let outsideCore=0,eligible=0,bad=0,maxResidual=0,shapeError=0,negative=0,falseHeads=0,geometryChanges=0,maxCoordinate=0,maxCoordinateFallback=0,cellSamples=0,cellWrong=0,forgedSamples=0,forgedWrong=0;const variants=new Set(),details=[];
 const oldModule=await import('/src/avatar-before.js'),OldAvatar=oldModule.Avatar;
 for(let seed=0;seed<1500&&variants.size<60;seed++){
  const id='nose-'+seed,lk=config.avatarLook(id),key=[lk.style,lk.build,lk.tall].join('/');if(variants.has(key))continue;variants.add(key);
  const a=new Avatar(id),old=new OldAvatar(id),root=new T.Group();root.add(a.object);
  for(const name of ['position','normal','color','skinIndex','skinWeight','rifleSkull']){let x=a.mesh.geometry.attributes[name].array,y=old.mesh.geometry.attributes[name].array;if(x.length!==y.length)geometryChanges++;else for(let j=0;j<x.length;j++)if(x[j]!==y[j])geometryChanges++;}old.dispose();
  const array=a.mesh.geometry.attributes.position,flag=a.mesh.geometry.attributes.rifleNose,actual=[],partRanges=oldModule.fixturePartRanges(lk.style,lk.sleeves);
  for(let j=0;j<flag.count;j++)if(flag.getX(j))actual.push([array.getX(j),array.getY(j)-1.54,array.getZ(j)]);
  const canonical=config.rifleNoseProfile().flat();if(actual.length!==canonical.length)throw Error('nose profile topology mismatch');
  for(let j=0;j<actual.length;j++)for(let axis=0;axis<3;axis++)shapeError=Math.max(shapeError,Math.abs(actual[j][axis]-canonical[j][axis]));
  for(const time of (highworldOnly?[.4]:[0,.4,2,5])){
   if(time)a.update(time,{speed:0});
   for(const yaw of (highworldOnly?[0]:[0,.8,Math.PI,-1.6])){
    root.rotation.y=yaw;root.updateMatrixWorld(true);
    if(!forgeryOnly)for(const side of (highworldOnly?[1]:[1,-1]))for(const yy of (highworldOnly?[.09,.092,.095]:[.073,.081,.087,.090,.092,.095,.101,.109]))for(const xx of (highworldOnly?[-.004,0,.004]:[-.015,-.004,0,.004,.015])){
     const point=a.bones.head.localToWorld(new T.Vector3(xx,yy,.13)),outward=new T.Vector3(0,0,side*3).applyQuaternion(a.bones.head.getWorldQuaternion(new T.Quaternion()));
     const origin=point.clone().add(outward);origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));
     const direction=point.clone().sub(origin).normalize();direction.set(...direction.toArray().map(v=>Math.round(v*1000)/1000));
     const native=new T.Raycaster(origin,direction.clone().normalize(),0,40).intersectObject(a.mesh,false)[0];if(!native)continue;
     const hc=[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)],state={p:[0,0,0],r:yaw},shot={t:'a',w:'rifle',o:origin.toArray(),d:direction.toArray(),hc};
     const nose=!!flag.getX(native.face.a)&&config.rifleNoseBandRegion(id,state,hc.slice(1))&&config.rifleNoseEntry(id,state,shot.o,shot.d)!==null;
     const accepted=config.rifleHeadContact(id,state,shot,origin.toArray(),40,4);if(flag.getX(native.face.a)&&!nose)unsupportedNose++;
     if(nose){eligible++;if(!oldNoseRegion(id,state,hc.slice(1)))outsideCore++;
      {for(const dx of [-.0005,.0005])for(const dy of [-.0005,.0005])for(const dz of [-.0005,.0005]){
       const corner=new T.Vector3(hc[1]+dx,hc[2]+dy,hc[3]+dz),r=corner.sub(origin).normalize(),h=new T.Raycaster(origin,r,0,40).intersectObject(a.mesh,false)[0];cellSamples++;if(!h||!flag.getX(h.face.a))cellWrong++;
      }}
      const front=config.rifleNoseEntry(id,state,shot.o,shot.d),along=origin.distanceTo(new T.Vector3(...hc.slice(1))),error=Math.abs(front-along);maxResidual=Math.max(maxResidual,error);if(!accepted){bad++;if(details.length<12)details.push({id,key,time,yaw,side,xx,yy,error,point:hc});}}
     else if(!a.rifleHeadContact(native,state,id,shot.o,shot.d)){negative++;if(accepted){falseHeads++;if(details.length<12)details.push({negative:true,id,key,time,yaw,side,xx,yy,point:hc});}}
     // Same actual first contact and serialized ray translated to near the max world bounds.
     if(nose&&time===.4&&yaw===0){const delta=[4998,4998,4998],s2={p:delta,r:yaw},q2={...shot,o:shot.o.map((v,i)=>+(v+delta[i]).toFixed(2))};root.position.set(...delta);root.updateMatrixWorld(true);const high=new T.Raycaster(new T.Vector3(...q2.o),new T.Vector3(...q2.d).normalize(),0,40).intersectObject(a.mesh,false)[0];root.position.set(0,0,0);root.updateMatrixWorld(true);if(high){q2.hc=[1,...high.point.toArray().map(v=>+(v).toFixed(3))];}if(high&&flag.getX(high.face.a)&&config.rifleHeadContact(id,s2,q2,q2.o,40,4))maxCoordinate++;else if(high&&!config.rifleNoseBandRegion(id,s2,q2.hc.slice(1)))maxCoordinateFallback++;else bad++;}
    }
    if(yaw===0&&!highworldOnly)for(const negativeY of [.076,.082,.095,.107]){
     const point=new T.Vector3(0,(config.PVP_RIFLE_HEAD.headY+negativeY)*lk.tall,-.134*[.93,1,1.08][lk.build]);
     for(const offset of [[0,.1,-.5],[.036,.118,.09],[-.036,.118,.09],[0,-.14,.2],[.45,.092,0],[0,.45,.03],[.08,.14,.06],[-.08,.14,.06],[.1,.13,.08],[-.1,.13,.08],[0,-.55,-.3],[0,-.8,.02],[0,-.07,-.15],[0,-.1,.02],[.10,0,0],[-.10,0,0],[.10,-.015,0],[-.10,-.015,0],[.095,-.02,.02],[-.095,-.02,.02]]){
      const origin=a.bones.head.localToWorld(new T.Vector3(...offset));origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));
      const d=point.clone().sub(origin).normalize();d.set(...d.toArray().map(v=>Math.round(v*1000)/1000));
      const h=new T.Raycaster(origin,d.clone().normalize(),0,40).intersectObject(a.mesh,false)[0];
      const state={p:[0,0,0],r:0},first=config.rifleProfileEntry(config.rifleNoseProfile(),id,state,origin.toArray(),d.toArray());
      if(h&&first!==null&&!flag.getX(h.face.a)&&h.distance<first-.001){
       forgedSamples++;const at=h.face.a,partData=partRanges.find(p=>p.first<=at&&p.last>at);if(!partData)throw Error('actual original part interval missing');const{region,shade,bone,type}=partData;const part=a.mesh.geometry.attributes.rifleSkull.getX(at)?'skull':region==='hair'||region==='top'&&bone==='head'?'hair':region==='top'?'torso':region==='fixed'&&bone==='head'&&type==='SphereGeometry'?'eye':region==='skin'&&Math.abs(shade-.97)<1e-6?'jaw':region==='skin'&&bone==='head'&&type==='CylinderGeometry'?'neck':'other';forgedByPart[part]=(forgedByPart[part]||0)+1;const frontPoint=origin.clone().addScaledVector(d.clone().normalize(),first),hc=[1,...frontPoint.toArray().map(v=>Math.round(v*1000)/1000)],shot={t:'a',w:'rifle',o:origin.toArray(),d:d.toArray(),hc};
       if(config.rifleHeadContact(id,state,shot,origin.toArray(),40,4)){forgedWrong++;if(details.length<12)details.push({forged:true,id,time,offset,first:h.point.toArray(),hc});}
      }
     }
    }
   }
  }a.dispose();console.log('NOSE_PROGRESS '+JSON.stringify({variants:variants.size,eligible,outsideCore,bad,falseHeads,cellSamples,cellWrong,forgedSamples,forgedWrong}));await new Promise(resolve=>setTimeout(resolve,0));
 }return{forgedByPart,unsupportedNose,outsideCore,eligible,bad,negative,falseHeads,maxResidual,shapeError,geometryChanges,maxCoordinate,maxCoordinateFallback,cellSamples,cellWrong,forgedSamples,forgedWrong,variants:variants.size,details};
};
}, {worker,i});
}
const [a,b]=pages;const configMaxBytes=Number(fs.readFileSync('cloudflare/players.js','utf8').match(/maxBytes:\s*(\d+)/)[1]);
if(!protocolOnly&&!legacy){
const parity=await a.evaluate(f=>proof(f.forgeryOnly,f.highworldOnly),{forgeryOnly,highworldOnly});fs.writeFileSync(`${out}/parity.json`,JSON.stringify(parity,null,2));
if(highworldOnly){check(parity.variants===60&&parity.maxCoordinate>10&&parity.bad===0&&parity.cellWrong===0&&parity.geometryChanges===0,'actual standing native cell/ray translation to near-max world coordinates across canonical variants');}else if(!forgeryOnly){
check(parity.outsideCore>100&&parity.eligible>100&&parity.variants===60&&parity.shapeError<1e-6&&parity.geometryChanges===0&&parity.maxCoordinate>10,'actual native skin raycasts cover all60 canonical style/build/height variants; exact unchanged mesh arrays, pure nose vertex parity, standing/bind poses and near-max coordinates');
check(parity.bad===0,`v1 first-surface tolerance covers sampled ACTUAL nearest head contacts (max ${parity.maxResidual.toFixed(5)}m, bad ${parity.bad})`);
check(parity.negative>1000&&parity.falseHeads===0,'actual unsupported nearest skull/face/jaw/hair/back/outside-core contacts never get head bonus');
check(parity.cellSamples>400&&parity.cellWrong===0,'independent eight-corner actual native first-contact rays keep accepted quantized cells on nose');
}
if(!highworldOnly)check(['hair','skull','eye','jaw','neck','torso'].every(p=>parity.forgedByPart[p]>0)&&parity.forgedSamples>100&&parity.forgedWrong===0,'forged deeper nose point cannot win before actual nearer hair/skull/eye/neck/face contacts');
console.log(JSON.stringify(parity));
}
if(geometryOnly||forgeryOnly||highworldOnly){completed=true;}else{
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
const y=await a.evaluate(()=>(config.PVP_RIFLE_HEAD.headY+.092)*peer().avatar.look.tall);
await a.evaluate(()=>aimExtra());
await a.waitForFunction(()=>ghosts.connected&&peer()?.speed<.01&&(peer().avatar.gait??0)<.01);
const shoot=async(count,head=false)=>{await a.evaluate(async head=>{if(head)await aimExtra();combat.fire('rifle');},head);await a.waitForFunction(n=>acks.length===n,count);};
await shoot(1,true);
if(legacy){
 const result=await a.evaluate(()=>({ack:acks[0],wire:combat.lastShot,effects,markers:[...markers]}));
 check(result.wire.hc?.[0]===1&&!result.ack.head&&result.ack.l===9,'actual new client outside-old-core proof against fresh old Worker validator stays body1');
 await b.waitForFunction(()=>combat.lives===9);await a.waitForFunction(()=>peer().lives===9);
 check(await a.evaluate(()=>markers.length===1&&markers[0]===false&&combat.hits===1),'legacy validator receipt gives ordinary actual marker/one hit, no predicted head');
 await a.evaluate(()=>combat.hit(acks[0],peer()));check(await a.evaluate(()=>combat.hits===1&&markers.length===1&&effects===1),'legacy ordinary receipt replay is idempotent');
 await a.evaluate(()=>{document.documentElement.classList.remove('resuming');document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;});
 await a.screenshot({path:out+'/legacy-worker-native.png'});check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL in fresh old-validator compatibility');fs.writeFileSync(out+'/legacy-shot.json',JSON.stringify(result,null,2));completed=true;
}else{
const first=await a.evaluate(()=>({ack:acks[0],wire:combat.lastShot,hits:combat.hits,effects,markers:[...markers]}));fs.writeFileSync(`${out}/first-shot.json`,JSON.stringify(first,null,2));
const serialized=await a.evaluate(()=>wires.find(w=>w.m.to===peer().id&&w.m.hc));check(serialized&&Buffer.byteLength(serialized.data)<=configMaxBytes&&serialized.m.o.every(v=>Math.round(v*100)/100===v)&&[...serialized.m.d,...serialized.m.hc.slice(1)].every(v=>Math.round(v*1000)/1000===v),'actual serialized o:r2/d:r3/contact:r3 packet stays within existing256bytes');
check(first.ack.head===true&&first.ack.l===8&&first.ack.award.points===5&&first.wire.hc[0]===1,'actual outside-published-support lower nose band surface confirms2HP plus one normal award');
await b.waitForFunction(()=>combat.lives===8);await a.waitForFunction(()=>peer().lives===8);
check(await b.evaluate(()=>hurts[0].head===true&&deaths===0),'receiver and public ghost health reflect 2 HP without death');
await a.evaluate(()=>combat.hit(acks[0],peer()));
check(await a.evaluate(()=>combat.hits===1&&effects===1&&markers.length===1&&markers[0]===true),'score/marker/onHit replay is idempotent after authoritative head acknowledgment');
await a.evaluate(()=>aimAt(1));await shoot(2);
check(await a.evaluate(()=>acks[1].l===7&&!acks[1].head&&!combat.lastShot.hc),'actual native torso face remains 1 HP/body marker');
const nearest=await a.evaluate(()=>{const g=ghosts.add('closer-proof','Closer');g.push({p:[0,0,-1],r:0,h:'rifle',score:0,l:10});ghosts.update();const id=combat.rifleContact().target?.id;g.dispose();ghosts.others.delete(g.id);return id;});
check(nearest==='closer-proof','nearest ACTUAL native body surface wins before a further valid head target');

await a.evaluate(y=>{aimAt(y);window.wall=new T.Mesh(new T.BoxGeometry(2,2,.025),new T.MeshBasicMaterial());wall.position.set(0,1,-.2);scene.add(wall);scene.updateMatrixWorld(true);},y);
const before=await b.evaluate(()=>remoteShots);await a.evaluate(()=>combat.fire('rifle'));await b.waitForFunction(n=>remoteShots>n,before);
check(await a.evaluate(()=>combat.lastShot.to===null&&!combat.lastShot.hc&&acks.length===2),'real wall within OLD 0.3m target gap rejects head/contact before server scoring');
await a.evaluate(()=>{wall.removeFromParent();wall.geometry.dispose();wall.material.dispose();aimAt(3);});
const missed=await b.evaluate(()=>remoteShots);await a.evaluate(()=>combat.fire('rifle'));await b.waitForFunction(n=>remoteShots>n,missed);
check(await a.evaluate(()=>combat.lastShot.to===null&&acks.length===2),'native above-head miss has no contact, score or damage');
const sendProof=async(hc,count)=>{await a.evaluate(hc=>{ghosts.fire({w:'rifle',o:combatHead.o,d:combatHead.d,to:peer().id,hc});},hc);await a.waitForFunction(n=>acks.length===n,count);};
await a.evaluate(w=>window.combatHead=w,first.wire);
await sendProof(undefined,3);
check(await a.evaluate(()=>!acks[2].head&&acks[2].l===6),'contact-less old client keeps authoritative1HP fallback');
await sendProof([1,0,first.wire.hc[2],0],4);
check(await a.evaluate(()=>!acks[3].head&&acks[3].l===5),'forged interior point cannot turn body-only fallback into2HP');
await sendProof([9,...first.wire.hc.slice(1)],5);
check(await a.evaluate(()=>!acks[4].head&&acks[4].l===4),'unknown physical profile version cannot award extra nose hit');
await b.evaluate(()=>window.crouched=true);await a.waitForFunction(()=>peer().crouch===1);
await sendProof(first.wire.hc,6);
check(await a.evaluate(()=>!acks[5].head&&acks[5].l===3),'server actual crouched target rejects standing extra nose proof');
await b.evaluate(()=>window.crouched=false);await a.waitForFunction(()=>peer().crouch===0);
// Two ACTUAL body hits leave exactly 1 HP, proving an overkill head still creates only one death.
await a.evaluate(()=>aimAt(1));await shoot(7);await shoot(8);await b.waitForFunction(()=>combat.lives===1);
await a.evaluate(()=>aimExtra());await shoot(9,true);await b.waitForFunction(()=>deaths===1);
check(await a.evaluate(()=>acks[8].head===true&&acks[8].dead===true&&acks[8].l===-1&&/^[0-9a-f-]{36}$/.test(acks[8].kill)&&acks[8].award.seq===9),'low-HP validated head produces ONE lethal receipt and ONE award');
check(await b.evaluate(()=>deaths===1&&combat.lives===combat.maxLives&&hurts.at(-1).dead===true),'same shared life reducer resets target once after lethal head');
await a.evaluate(()=>combat.hit(acks.at(-1),peer()));
check(await a.evaluate(()=>combat.hits===9&&markers.length===9),'lethal acknowledgment replay cannot create extra marker/hit effects');
const styles=[0];
for(const style of [1,2,3]){
 for(let attempt=0;attempt<40;attempt++){
  await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await b.waitForFunction(()=>ghosts.connected);
  if(await b.evaluate(style=>config.avatarLook(ghosts.me).style===style,style))break;
  if(attempt===39)throw Error('canonical target style unavailable within bounded reconnect attempts');
 }
 await a.waitForFunction(style=>peer()?.avatar.look.style===style&&peer()?.snaps.length&&peer().root.visible,style);
 await a.waitForFunction(()=>peer()?.speed<.01&&(peer()?.avatar.gait??0)<.01);await a.waitForTimeout(650);
 await a.evaluate(()=>aimExtra());
 await shoot(9+style,true);await b.waitForFunction(()=>combat.lives===8);await a.waitForFunction(()=>peer().lives===8);
 check(await a.evaluate(n=>acks[n].head===true&&acks[n].l===8,8+style),`actual canonical hairstyle ${style} client→Worker nose2HP and shared health`);styles.push(style);
}
fs.writeFileSync(`${out}/styles.json`,JSON.stringify(styles));
await a.evaluate(()=>{const hud=document.getElementById('hud');hud.hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;document.getElementById('native-head-proof')?.remove();const pre=document.createElement('pre');pre.id='native-head-proof';pre.textContent=['Native actual modules (no WebGL)',`Head: ${acks[0].head}, HP ${acks[0].l}, reward ${acks[0].award.points}`,`Body: ${acks[1].head===true}, HP ${acks[1].l}`,`Lethal: HP ${acks[8].l}, dead ${acks[8].dead}`,`Kill receipt: ${!!acks[8].kill}`,`Effects: ${effects}, marker shows: ${markers.length}`,`Server connection: ${ghosts.connected}`].join('\n');pre.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:16px/1.6 system-ui';document.body.append(pre);});
check(await a.evaluate(()=>{const p=document.getElementById('native-head-proof').getBoundingClientRect();return p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight&&combat.hitMarker.el.textContent==='Huvudträff!'&&!combat.hitMarker.el.hidden;}),'actual authoritative head marker and measured proof rows visibly fit native viewport');
await a.screenshot({path:`${out}/rifle-nose-band-native.png`});
await b.waitForFunction(()=>combat.el.textContent.includes('8/10'));await b.evaluate(()=>{document.documentElement.classList.remove('resuming');document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;});check(await b.evaluate(()=>combat.lives===8&&combat.el.textContent.includes('8/10')),'actual receiver native life HUD shows the authoritative8/10');await b.screenshot({path:out+'/target-eight-lives-native.png'});check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls in actual-module protocol/DOM evidence');completed=true;
}
}
}finally{clearTimeout(bound);for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.ws?.close();}).catch(()=>{});await browser.close();check(completed,'selected native stage completed all required actions');check(errors.length===0,'zero native page errors');check(JSON.stringify(beforeSource)===JSON.stringify(source()),'executed selected runtime/driver source paths stayed frozen');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,completed,mode:highworldOnly?'highworld':forgeryOnly?'forgery':geometryOnly?'geometry':legacy?'legacy-worker':protocolOnly?'protocol':'full'},null,2));}
console.log(`ALL ${failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
