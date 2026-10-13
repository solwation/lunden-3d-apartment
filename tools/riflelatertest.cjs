// #932 actual Avatar/Ghosts/Combat + Worker, no apartment/WebGL. game worker artifacts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const crypto=require('node:crypto');
const sourcePaths=['src/config.js','src/avatar.js','src/combat.js','src/ghosts.js','cloudflare/players.js','tools/riflelatertest.cjs'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const frozen=sourceHashes();
const {execFileSync}=require('node:child_process');
// Frozen pre-nose production model; no copied test shape or PRNG.
const beforeAvatar=execFileSync('git',['show','6f35db5:src/avatar.js'],{encoding:'utf8'});
const [game='http://localhost:8875',worker='http://localhost:8876',out='/tmp/lunden-rifle-head']=process.argv.slice(2);
let checks=0,failures=0,completed=false; const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`);};
(async()=>{
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/source-start.json`,JSON.stringify({at:new Date().toISOString(),pid:process.pid,sources:frozen},null,2));const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});const errors=[],pages=[];let interrupted=null;const checkpoint=phase=>fs.writeFileSync(`${out}/progress.json`,JSON.stringify({phase,at:new Date().toISOString(),checks,failures,sourcesMatch:JSON.stringify(sourceHashes())===JSON.stringify(frozen)},null,2));
const terminate=()=>{interrupted='SIGTERM';checkpoint('external SIGTERM');browser.close().catch(()=>{});};process.once('SIGTERM',terminate);
const deadline=setTimeout(()=>{interrupted='480s browser deadline';checkpoint(interrupted);browser.close().catch(()=>{});},480000);
try{
for(let i=0;i<2;i++){
const p=await browser.newPage({viewport:{width:850,height:500}});p.setDefaultTimeout(15000);pages.push(p);p.on('pageerror',e=>errors.push(e.message));
await p.route('**/src/avatar-before.js',r=>r.fulfill({contentType:'text/javascript',body:beforeAvatar}));
await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native actual modules only'}));await p.goto(game);
await p.evaluate(async({worker,i})=>{
const context=HTMLCanvasElement.prototype.getContext;window.gl=0;HTMLCanvasElement.prototype.getContext=function(k,...args){if(/webgl/i.test(k)){gl++;throw Error('WebGL forbidden');}return context.call(this,k,...args);};
window.T=await import('three');window.config=await import('/src/config.js');window.Avatar=(await import('/src/avatar.js')).Avatar;
const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);window.position=i?[0,0,0]:[-4,0,0];window.crouched=false;window.weapon='rifle';
camera.position.set(...position);camera.position.y=1.62;camera.lookAt(0,1.62,i?-4:0);camera.updateMatrixWorld();
window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Head Target':'Rifle Shooter',active:()=>true,weapon:()=>weapon,score:()=>0,mirrored:()=>false,state:()=>({p:position,r:0,c:crouched})});
window.acks=[];window.hurts=[];window.markers=[];window.effects=0;window.deaths=0;window.remoteShots=0;
window.combat=new Combat({scene,camera,ghosts,weapon:()=>weapon,feet:()=>new T.Vector3(...position),onHit:()=>effects++,onDie:()=>deaths++,sfx:{}});
const originalShot=ghosts.onShot;ghosts.onShot=(m,g)=>{remoteShots++;originalShot?.(m,g);};
const hit=ghosts.onHit,hurt=ghosts.onHurt;ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onHurt=(m,g)=>{hurts.push(structuredClone(m));hurt(m,g);};
const mark=combat.hitMarker.show.bind(combat.hitMarker);combat.hitMarker.show=m=>{markers.push(m.head===true);mark(m);};
window.tick=null; // native geometry inventory runs before room connection/idle clock
window.peer=()=>[...ghosts.others.values()][0];
window.aimAt=(y)=>{camera.position.set(position[0],1.62,0);camera.lookAt(0,y,0);camera.updateMatrixWorld();};
window.aimLateral=()=>{for(const yy of [.092,.095,.098,.102])for(const zz of [.05,.06,.07,.08]){const w=[.93,1,1.08][peer().avatar.look.build];camera.position.set(position[0],1.62,0);camera.lookAt(-Math.sign(-position[0])*.09*w,(config.PVP_RIFLE_HEAD.headY+yy)*peer().avatar.look.tall,-zz*w);camera.updateMatrixWorld();const c=combat.rifleContact();if(c.hc&&config.rifleHeadLateralRegion(peer().id,{p:peer().feet.toArray(),r:peer().root.rotation.y},c.hc.slice(1),c.o.toArray(),c.d.toArray()))return;}throw Error('no actual supported settled lateral ray');};
window.proof=async()=>{
 let eligible=0,bad=0,negative=0,falseHeads=0,maxResidual=0,geometryChanges=0,shapeError=0,cellSamples=0,cellWrong=0,forgedSamples=0,forgedWrong=0,missingRay=0,maxCoordinate=0;const variants=new Set(),details=[],support={};
 const OldAvatar=(await import('/src/avatar-before.js')).Avatar;
 for(let n=0;n<3000&&variants.size<60;n++){
  const id='lateral-'+n,lk=config.avatarLook(id),key=[lk.style,lk.build,lk.tall].join('/');if(variants.has(key))continue;variants.add(key);
  const a=new Avatar(id),old=new OldAvatar(id),root=new T.Group();root.add(a.object);
  for(const name of ['position','normal','color','skinIndex','skinWeight','rifleSkull','rifleNose']){const x=a.mesh.geometry.attributes[name].array,y=old.mesh.geometry.attributes[name].array;if(x.length!==y.length)geometryChanges++;else for(let j=0;j<x.length;j++)if(x[j]!==y[j])geometryChanges++;}old.dispose();
  const attr=a.mesh.geometry.attributes.position,flag=a.mesh.geometry.attributes.rifleSkull,actual=[];
  for(let j=0;j<flag.count;j++)if(flag.getX(j))actual.push([attr.getX(j),attr.getY(j)-1.54,attr.getZ(j)]);
  const pure=config.rifleSkullProfile().flat();if(actual.length!==pure.length)throw Error('skull topology mismatch');
  for(let j=0;j<actual.length;j++)for(let k=0;k<3;k++)shapeError=Math.max(shapeError,Math.abs(actual[j][k]-pure[j][k]));
  for(const time of [0,.4,2,5]){if(time)a.update(time,{speed:0});for(const yaw of [0,.8,Math.PI,-1.6]){
   root.rotation.y=yaw;root.updateMatrixWorld(true);const state={p:[0,0,0],r:yaw};
   for(const side of [-1,1])for(const [yy,zz] of [[.09,.055],[.10,.075],[.03,0],[.095,0],[.14,.045],[.2,0],[.08,-.07],[.09,.12]])for(const angle of [-.4,0,.4]){
    const target=a.bones.head.localToWorld(new T.Vector3(side*.1,yy,zz)),away=new T.Vector3(side*3,0,angle).applyQuaternion(a.bones.head.getWorldQuaternion(new T.Quaternion()));
    const origin=target.clone().add(away);origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));
    const d=target.clone().sub(origin).normalize();d.set(...d.toArray().map(v=>Math.round(v*1000)/1000));const unit=d.clone().normalize();
    const native=new T.Raycaster(origin,unit,0,40).intersectObject(a.mesh,false)[0];if(!native)continue;
    const hc=[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)],o=origin.toArray(),da=d.toArray(),shot={t:'a',w:'rifle',o,d:da,hc};
    const region=config.rifleHeadLateralRegion(id,state,hc.slice(1),o,da),nativeSkull=!!flag.getX(native.face.a);
    if(region&&nativeSkull){eligible++;support[key]=(support[key]??0)+1;
     const entry=config.rifleSkullEntry(id,state,o,da),residual=Math.abs(entry-origin.distanceTo(new T.Vector3(...hc.slice(1))));maxResidual=Math.max(maxResidual,residual);
     if(!a.rifleHeadContact(native,state,id,o,da)||!config.rifleHeadContact(id,state,shot,o,40,4)){bad++;if(details.length<10)details.push({id,time,yaw,side,yy,zz,residual,hc});}
     if(a.rifleHeadContact(native,state,id)||config.rifleHeadLateralRegion(id,state,hc.slice(1)))missingRay++;
     if(eligible%32===0)for(const dx of [-.0005,.0005])for(const dy of [-.0005,.0005])for(const dz of [-.0005,.0005]){
      const corner=new T.Vector3(hc[1]+dx,hc[2]+dy,hc[3]+dz),ray=corner.sub(origin).normalize(),h=new T.Raycaster(origin,ray,0,40).intersectObject(a.mesh,false)[0];cellSamples++;if(!h||!flag.getX(h.face.a))cellWrong++;
     }
     if(time===0&&yaw===0){const delta=[4996,4996,4996],s2={p:delta,r:yaw},q={...shot,o:o.map((v,k)=>+(v+delta[k]).toFixed(2)),hc:[1,...hc.slice(1).map((v,k)=>+(v+delta[k]).toFixed(3))]};if(config.rifleHeadContact(id,s2,q,q.o,40,4)&&new TextEncoder().encode(JSON.stringify({...q,to:'1234567890123456'})).length<=256)maxCoordinate++;else bad++;}
    }else{negative++;if(region){falseHeads++;if(details.length<10)details.push({falsePositive:true,id,time,yaw,side,yy,zz,hc});}}
    // Forge the FIRST pure-skull surface BEHIND the actual nearest non-skull mesh, on the same snapped ray.
    const first=config.rifleSkullEntry(id,state,o,da);
    if(!nativeSkull&&first!==null&&native.distance<first){forgedSamples++;const deeper=origin.clone().addScaledVector(unit,first).toArray().map(v=>Math.round(v*1000)/1000);
     if(config.rifleHeadLateralRegion(id,state,deeper,o,da)&&config.rifleHeadContact(id,state,{...shot,hc:[1,...deeper]},o,40,4)){forgedWrong++;if(details.length<10)details.push({forged:true,id,time,yaw,side,yy,zz,deeper});}
    }
   }
  }}a.dispose();await new Promise(resolve=>setTimeout(resolve,0));
 }return{eligible,bad,negative,falseHeads,maxResidual,geometryChanges,shapeError,cellSamples,cellWrong,forgedSamples,forgedWrong,missingRay,maxCoordinate,variants:variants.size,support,details};
};
}, {worker,i});
}
const [a,b]=pages;
if(process.argv.includes('--greetings')){
 const armed=await a.evaluate(async()=>{
  const {armTarget}=await import('/src/avatar.js');const variants=new Set();let checked=0,hidden=0,forged=0;
  for(let n=0;n<3000&&variants.size<60;n++){const id='lateral-'+n,lk=config.avatarLook(id),key=[lk.style,lk.build,lk.tall].join('/');if(variants.has(key))continue;variants.add(key);const avatar=new Avatar(id),root=new T.Group();root.add(avatar.object);
   for(const turn of [-.9,-.3,0,.3,.9])for(const swing of [0,.5,1]){const hand=armTarget.forward(-1,.04);hand.at[0]+=.45*swing;hand.at[1]+=.1*swing;avatar.object.rotation.y=Math.PI-turn;avatar.update(.4,{turn,hands:{R:hand}});root.updateMatrixWorld(true);
    for(const side of [-1,1])for(const z of [.04,.065,.085]){const width=[.93,1,1.08][lk.build],o=[side*3,+((config.PVP_RIFLE_HEAD.headY+.095)*lk.tall).toFixed(2),+(-z*width).toFixed(2)],d=[-side,0,0],state={p:[0,0,0],r:0};const hit=new T.Raycaster(new T.Vector3(...o),new T.Vector3(...d),0,40).intersectObject(avatar.mesh,false)[0],entry=config.rifleSkullEntry(id,state,o,d);if(!hit||entry===null)continue;checked++;
     if(!avatar.mesh.geometry.attributes.rifleSkull.getX(hit.face.a)&&hit.distance<entry){hidden++;const hc=[1,...o.map((v,k)=>+(v+d[k]*entry).toFixed(3))];if(config.rifleHeadLateralRegion(id,state,hc.slice(1),o,d)&&config.rifleHeadContact(id,state,{t:'a',w:'rifle',o,d,hc},o,40,4))forged++;}
    }
   }avatar.dispose();await new Promise(resolve=>setTimeout(resolve,0));
  }return{variants:variants.size,checked,hidden,forged};
 });fs.writeFileSync(`${out}/armed-poses.json`,JSON.stringify(armed,null,2));
 check(armed.variants===60&&armed.checked>5000&&armed.forged===0,'independent actual armed-forward/saber-swing/body-turn poses do not reopen body-first lateral forgeries before greetings');checkpoint('armed pose safety complete');
 await Promise.all(pages.map(p=>p.evaluate(()=>{tick=setInterval(()=>{ghosts.update();combat.update(0);},35);})));
 await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
 await a.waitForFunction(()=>peer().speed<.01&&(peer().avatar.gait??0)<.01);await a.waitForTimeout(650);
 await a.evaluate(()=>aimLateral());await a.evaluate(()=>combat.fire('rifle'));await a.waitForFunction(()=>acks.length===1);await b.waitForFunction(()=>combat.lives===8);
 check(await a.evaluate(()=>acks[0].head===true&&acks[0].l===8),'fresh never-greeted authoritative target gets actual native 2HP');
 await a.evaluate(()=>{position=[4,0,0];});await b.waitForFunction(()=>peer()?.snaps.at(-1)?.p.x===4);
 await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);
 await a.evaluate(()=>{clearInterval(tick);tick=null;ghosts.update();peer().root.updateMatrixWorld(true);});
 const wave=await a.evaluate(()=>{const g=peer(),w=[.93,1,1.08][g.avatar.look.build],o=[4,+((config.PVP_RIFLE_HEAD.headY+.095)*g.avatar.look.tall).toFixed(2),+(-.065*w).toFixed(2)],d=[-1,0,0],state={p:g.feet.toArray(),r:g.root.rotation.y};const entry=config.rifleSkullEntry(g.id,state,o,d),hit=new T.Raycaster(new T.Vector3(...o),new T.Vector3(...d),0,40).intersectObject(g.avatar.mesh,false)[0];window.wavePacket={w:'rifle',to:g.id,o,d,hc:[1,...o.map((v,k)=>+(v+d[k]*entry).toFixed(3))]};return{waveT:g.waveT,skull:!!g.avatar.mesh.geometry.attributes.rifleSkull.getX(hit.face.a),actualFirst:hit.distance,pureFirst:entry,pureAllowed:config.rifleHeadContact(g.id,state,{t:'a',...wavePacket},o,40,4),guarded:config.rifleHeadContact(g.id,state,{t:'a',...wavePacket},o,40,4,false)};});
 fs.writeFileSync(`${out}/wave-first-surface.json`,JSON.stringify(wave,null,2));
 check(!wave.skull&&wave.actualFirst<wave.pureFirst&&wave.pureAllowed&&!wave.guarded,'real Ghosts greeting raises actual nearer arm; forged FIRST deeper skull point is rejected by authoritative lateral context');
 const forged=async count=>{await a.evaluate(()=>ghosts.fire(wavePacket));await a.waitForFunction(n=>{ghosts.sendShot();return acks.length===n;},count,{polling:50});};
 await forged(2);await b.waitForFunction(()=>combat.lives===7);check(await a.evaluate(()=>!acks[1].head&&acks[1].l===7),'actual Worker forged waving-right side takes body1');
 await a.evaluate(()=>{position=[-4,0,0];ghosts.update();const g=peer(),w=[.93,1,1.08][g.avatar.look.build],o=[-4,+((config.PVP_RIFLE_HEAD.headY+.095)*g.avatar.look.tall).toFixed(2),+(-.065*w).toFixed(2)],d=[1,0,0],entry=config.rifleSkullEntry(g.id,{p:g.feet.toArray(),r:g.root.rotation.y},o,d);wavePacket={w:'rifle',to:g.id,o,d,hc:[1,...o.map((v,k)=>+(v+d[k]*entry).toFixed(3))]};});
 await a.waitForFunction(()=>{ghosts.update();return ghosts.sent?.p[0]===-4;},null,{polling:50});await b.waitForFunction(()=>peer()?.snaps.at(-1)?.p.x===-4);await forged(3);await b.waitForFunction(()=>combat.lives===6);
 check(await a.evaluate(()=>!acks[2].head&&acks[2].l===6),'same authoritative greeting excludes opposite lateral side too');
 const frozenWave=await a.evaluate(()=>peer().waveT);await a.waitForTimeout(2700);
 check(await a.evaluate(n=>peer().waveT===n&&n>0,frozenWave),'actual paused replica retains its wave after real2.5s; no elapsed-time inference');
 await forged(4);await b.waitForFunction(()=>combat.lives===5);check(await a.evaluate(()=>!acks[3].head&&acks[3].l===5),'post2.5s frozen-wave forged point stays body1');
 await a.evaluate(({worker})=>{window.observer=new ghosts.constructor({scene,camera,url:worker,name:()=> 'Late Observer',active:()=>true,weapon:()=>'',score:()=>0,mirrored:()=>false,state:()=>({p:[9,0,0],r:0})});window.observerTick=setInterval(()=>observer.update(),35);},{worker});
 await a.waitForFunction(()=>observer.connected&&observer.others.get(peer().id)?.lives===5);
 check(await a.evaluate(()=>observer.others.get(peer().id).lives===5),'late real Ghosts welcome retains authoritative post-greeting HP');
 await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>2.4);await forged(5);await b.waitForFunction(()=>combat.lives===4);
 check(await a.evaluate(()=>!acks[4].head&&acks[4].l===4),'repeat accepted greeting remains body1');
 const oldID=await b.evaluate(()=>ghosts.me);await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await b.waitForFunction(id=>ghosts.connected&&ghosts.me!==id,oldID);
 await a.evaluate(()=>{clearInterval(observerTick);observer.disconnect();tick=setInterval(()=>{ghosts.update();combat.update(0);},35);});
 await a.waitForFunction(id=>peer()?.id!==id&&peer()?.snaps.length&&peer().root.visible,oldID);await a.waitForFunction(()=>peer().speed<.01&&(peer().avatar.gait??0)<.01);await a.waitForTimeout(650);await a.evaluate(()=>aimLateral());await a.evaluate(()=>combat.fire('rifle'));await a.waitForFunction(()=>acks.length===6);await b.waitForFunction(()=>combat.lives===8);
 check(await a.evaluate(()=>acks[5].head===true&&acks[5].l===8),'fresh target attachment/actual canonical avatar restores legitimate lateral2HP');
 await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;const p=document.createElement('pre');p.textContent='Authoritative lateral proof (native DOM)\nNever greeted: 2HP → 8\nGreeted both sides: body1\nFrozen wave after2.5s: body1\nNew target attachment: 2HP → 8';p.style.cssText='position:fixed;top:130px;left:20px;background:#182535;color:white;padding:16px;font:16px/1.5 sans-serif';document.body.append(p);});checkpoint('greeting actions complete');
 await a.screenshot({path:`${out}/greeting-native.png`});check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls in greeting proof');check(JSON.stringify(sourceHashes())===JSON.stringify(frozen),'greeting runtime/Worker/driver source freeze');completed=true;
}else{
const parity=await a.evaluate(()=>proof());fs.writeFileSync(`${out}/parity.json`,JSON.stringify(parity,null,2));
check(parity.eligible>1000&&parity.variants===60&&Object.keys(parity.support).length===60&&parity.shapeError<1e-6&&parity.geometryChanges===0,'all60 canonical variants have actual nearest lateral skull positives and unchanged physical arrays/profile');
check(parity.bad===0,`actual client/Worker support agreement and unchanged15mm entry bound (max ${parity.maxResidual}m)`);
check(parity.negative>1000&&parity.falseHeads===0,'independent nearby hair/beanie/ear/face/body/outside-region nearest contacts never get lateral bonus');
check(parity.cellSamples>400&&parity.cellWrong===0,'whole quantized cells keep eight independent corner rays on actual skull');
check(parity.forgedSamples>100&&parity.forgedWrong===0,'forged FIRST deeper pure-skull contacts behind actual non-skull surfaces fail closed');
check(parity.missingRay===0&&parity.maxCoordinate>100,'missing-ray lateral rejects; supported near-max wire coordinates stay within256bytes');
console.log(JSON.stringify(parity));checkpoint('geometry complete');
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
await a.evaluate(()=>aimLateral());
await a.waitForFunction(()=>ghosts.connected&&peer()?.speed<.01&&(peer().avatar.gait??0)<.01);
await a.evaluate(()=>{window.wirePackets=[];const send=ghosts.ws.send.bind(ghosts.ws);ghosts.ws.send=value=>{try{const m=JSON.parse(value);if(m.t==='a')wirePackets.push({raw:value,message:m});}catch{}return send(value);};});
const shoot=async count=>{await a.evaluate(()=>combat.fire('rifle'));await a.waitForFunction(n=>acks.length===n,count);};
await shoot(1);
const first=await a.evaluate(()=>({ack:acks[0],wire:combat.lastShot,packet:wirePackets[0],hits:combat.hits,effects,markers:[...markers]}));fs.writeFileSync(`${out}/first-shot.json`,JSON.stringify(first,null,2));
check(first.ack.head===true&&first.ack.l===8&&first.ack.award.points===5&&first.wire.hc[0]===1,'actual standing SkinnedMesh head contact confirms 2 HP plus one normal award');
check(Buffer.byteLength(first.packet.raw)<=256&&first.packet.message.o.every(v=>v===Math.round(v*100)/100)&&first.packet.message.d.every(v=>v===Math.round(v*1000)/1000)&&first.packet.message.hc.slice(1).every(v=>v===Math.round(v*1000)/1000),'actual serialized WebSocket shot uses r2/r3/r3 and stays within256bytes');
await b.waitForFunction(()=>combat.lives===8);await a.waitForFunction(()=>peer().lives===8);
check(await b.evaluate(()=>hurts[0].head===true&&deaths===0),'receiver and public ghost health reflect 2 HP without death');
await b.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;});await b.waitForFunction(()=>combat.el.textContent.includes('8/10'));await b.screenshot({path:`${out}/target-eight-lives-native.png`});
await a.evaluate(()=>combat.hit(acks[0],peer()));
check(await a.evaluate(()=>combat.hits===1&&effects===1&&markers.length===1&&markers[0]===true),'score/marker/onHit replay is idempotent after authoritative head acknowledgment');
await a.evaluate(()=>aimAt(1));await shoot(2);
check(await a.evaluate(()=>acks[1].l===7&&!acks[1].head&&!combat.lastShot.hc),'actual native torso face remains 1 HP/body marker');
const nearest=await a.evaluate(()=>{const g=ghosts.add('closer-proof','Closer');g.push({p:[-2,0,0],r:0,h:'rifle',score:0,l:10});ghosts.update();const id=combat.rifleContact().target?.id;g.dispose();ghosts.others.delete(g.id);return id;});
check(nearest==='closer-proof','nearest ACTUAL native body surface wins before a further valid head target');

await a.evaluate(y=>{aimLateral();window.wall=new T.Mesh(new T.BoxGeometry(.025,2,2),new T.MeshBasicMaterial());wall.position.set(-.2,1,0);scene.add(wall);scene.updateMatrixWorld(true);},y);
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
checkpoint('before opposite-side state');await a.evaluate(()=>{position=[4,0,0];});await b.waitForFunction(()=>peer()?.snaps.at(-1)?.p.x===4);
// Three ACTUAL body hits leave exactly 1 HP, proving an overkill head still creates only one death.
await a.evaluate(()=>aimAt(1));await shoot(6);await shoot(7);await shoot(8);await b.waitForFunction(()=>combat.lives===1);
await a.evaluate(()=>aimLateral());await shoot(9);await b.waitForFunction(()=>deaths===1);
check(await a.evaluate(()=>combat.lastShot.o[0]===4&&acks[8].head===true&&acks[8].dead===true&&acks[8].l===-1&&!!acks[8].kill&&acks[8].award.seq===9),'actual opposite-side low-HP head produces ONE lethal receipt and ONE award');
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
 await a.evaluate(()=>aimLateral());
 await shoot(9+style);await b.waitForFunction(()=>combat.lives===8);await a.waitForFunction(()=>peer().lives===8);
 check(await a.evaluate(n=>acks[n].head===true&&acks[n].l===8,8+style),`actual canonical hairstyle ${style} client→Worker lateral2HP and shared health`);styles.push(style);
}
fs.writeFileSync(`${out}/styles.json`,JSON.stringify(styles));
await a.evaluate(()=>{const hud=document.getElementById('hud');hud.hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;document.getElementById('native-head-proof')?.remove();const pre=document.createElement('pre');pre.id='native-head-proof';pre.textContent=['Native actual modules (no WebGL)',`Head: ${acks[0].head}, HP ${acks[0].l}, reward ${acks[0].award.points}`,`Body: ${acks[1].head===true}, HP ${acks[1].l}`,`Lethal: HP ${acks[8].l}, dead ${acks[8].dead}`,`Kill receipt: ${!!acks[8].kill}`,`Effects: ${effects}, marker shows: ${markers.length}`,`Server connection: ${ghosts.connected}`].join('\n');pre.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:16px/1.6 system-ui';document.body.append(pre);});
check(await a.evaluate(()=>{const p=document.getElementById('native-head-proof').getBoundingClientRect();return p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight&&combat.hitMarker.el.textContent==='Huvudträff!'&&!combat.hitMarker.el.hidden;}),'actual authoritative head marker and measured proof rows visibly fit native viewport');
checkpoint('all actions complete before final capture');await a.screenshot({path:`${out}/rifle-lateral-native.png`});
check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls in actual-module protocol/DOM evidence');check(JSON.stringify(sourceHashes())===JSON.stringify(frozen),'runtime/Worker/driver hashes unchanged during proof');completed=true;

}
}finally{clearTimeout(deadline);process.removeListener('SIGTERM',terminate);check(completed,'all requested mode phases completed');check(!interrupted,interrupted??'no external interruption/deadline');for(const p of pages)await p.evaluate(()=>{clearInterval(tick);clearInterval(window.observerTick);window.observer?.disconnect();ghosts.ws?.close();}).catch(()=>{});await browser.close();check(errors.length===0,'zero native page errors');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,completed,interrupted,mode:process.argv.includes('--greetings')?'greetings':'geometry+room',sources:frozen},null,2));}
console.log(`ALL ${failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
