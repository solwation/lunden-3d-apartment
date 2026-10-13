// #928 actual Avatar/Ghosts/Combat + Worker, no apartment/WebGL. game worker artifacts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const [game='http://localhost:8870',worker='http://localhost:8871',out='/tmp/lunden-rifle-head']=process.argv.slice(2);
let checks=0,failures=0,completed=false; const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`);};
(async()=>{
fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});const errors=[],pages=[];
try{
let initialise;
for(let i=0;i<2;i++){
const p=await browser.newPage({viewport:{width:850,height:500}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native actual modules only'}));await p.goto(game);
initialise ??= async(p,i)=>{await p.evaluate(async({worker,i})=>{
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
 const C=config,J=C.PVP_RIFLE_HEAD.jawPatch,H=C.PVP_RIFLE_HEAD,seen=new Set(),variantKeys=[],details=[];
 let positive=0,bad=0,negative=0,falseHeads=0,hidden=0,falseHidden=0,miss=0,falseMiss=0,corners=0,falseCorners=0,shapeError=0,maxResidual=0;const began=performance.now();
 const accept=(id,state,o,d,point)=>{const hc=[1,...point.toArray().map(v=>Math.round(v*1000)/1000)];return C.rifleJawRegion(id,state,hc.slice(1),o.toArray(),d.toArray())&&C.rifleHeadContact(id,state,{t:'a',w:'rifle',o:o.toArray(),d:d.toArray(),hc},o.toArray(),ghosts.rules.weapons.rifle.range,4);};
 for(let seed=0;seed<3000&&seen.size<60;seed++){
  const id='jaw-'+seed,look=C.avatarLook(id),key=look.style+'/'+look.build+'/'+look.tall;if(seen.has(key))continue;seen.add(key);variantKeys.push({id,...look,positive:0});
  const a=new Avatar(id),root=new T.Group();root.add(a.object);const flag=a.mesh.geometry.attributes.rifleJaw,position=a.mesh.geometry.attributes.position,actual=[];
  for(let i=0;i<flag.count;i++)if(flag.getX(i))actual.push([position.getX(i),position.getY(i)-1.54,position.getZ(i)]);
  const triangles=C.rifleJawProfile(),pure=triangles.flat();if(pure.length!==actual.length)throw Error('wrong actual jaw topology');for(let i=0;i<pure.length;i++)for(let k=0;k<3;k++)shapeError=Math.max(shapeError,Math.abs(pure[i][k]-actual[i][k]));
  let prior=0;for(const time of [0,.4,2.4,7.4,18.3,35,62.8]){if(time)a.update(time-prior,{speed:0});prior=time;
   for(const yaw of [0,.8,Math.PI,-1.6]){root.rotation.y=yaw;root.updateMatrixWorld(true);const state={p:[0,0,0],r:yaw};
    const probe=(xx,yy,delta=[0,0,-3])=>{const target=new T.Vector3(xx*[.93,1,1.08][look.build],(H.headY+yy)*look.tall,-.11).applyAxisAngle(new T.Vector3(0,1,0),yaw),o=target.clone().add(new T.Vector3(...delta).applyAxisAngle(new T.Vector3(0,1,0),yaw));o.set(...o.toArray().map(v=>Math.round(v*100)/100));const d=target.clone().sub(o).normalize();d.set(...d.toArray().map(v=>Math.round(v*1000)/1000));const native=new T.Raycaster(o,d.clone().normalize(),0,ghosts.rules.weapons.rifle.range).intersectObject(a.mesh,false)[0],first=C.rifleProfileEntry(triangles,id,state,o.toArray(),d.toArray());
     const point=first===null?null:o.clone().addScaledVector(d.clone().normalize(),first);
     if(!native){miss++;if(point&&accept(id,state,o,d,point)){falseMiss++;if(details.length<10)details.push({kind:'miss',key,time,yaw,xx,yy,delta});}return;}
     const actualJaw=!!flag.getX(native.face.a),core=C.rifleJawRegion(id,state,native.point.toArray().map(v=>Math.round(v*1000)/1000),o.toArray(),d.toArray());
     if(actualJaw&&core){positive++;variantKeys.at(-1).positive++;const residual=first===null?999:Math.abs(first-native.distance);maxResidual=Math.max(maxResidual,residual);if(!accept(id,state,o,d,native.point)){bad++;if(details.length<10)details.push({kind:'positive',key,time,yaw,xx,yy,delta,residual});}
      const snapped=native.point.clone().set(...native.point.toArray().map(v=>Math.round(v*1000)/1000));
      if(xx===0&&yy===.04&&delta[0]===0&&delta[1]===0&&delta[2]===-3)for(const cx of [-.0005,.0005])for(const cy of [-.0005,.0005])for(const cz of [-.0005,.0005]){const corner=snapped.clone().add(new T.Vector3(cx,cy,cz));if(!C.rifleJawRegion(id,state,corner.toArray(),o.toArray(),d.toArray()))continue;const cd=corner.clone().sub(o).normalize();cd.set(...cd.toArray().map(v=>Math.round(v*1000)/1000));const cn=new T.Raycaster(o,cd.clone().normalize(),0,ghosts.rules.weapons.rifle.range).intersectObject(a.mesh,false)[0];corners++;if(!cn||!flag.getX(cn.face.a)){falseCorners++;if(details.length<10)details.push({kind:'cell',key,time,yaw,xx,yy,corner:corner.toArray()});}}
     }else{negative++;if(accept(id,state,o,d,native.point)){falseHeads++;if(details.length<10)details.push({kind:'nearest',key,time,yaw,xx,yy,delta,tag:actualJaw});}}
     if(point&&first>native.distance+.001&&(!actualJaw||!core)){hidden++;if(accept(id,state,o,d,point)){falseHidden++;if(details.length<10)details.push({kind:'hidden',key,time,yaw,xx,yy,delta,tag:actualJaw,native:native.distance,first});}}
    };
    for(const yy of [.035,.040,.045])for(const xx of [-.004,0,.004])probe(xx,yy);
    for(const yy of [-.08,-.05,-.025,0,.025,.032,.048,.065,.08,.1,.14,.18])for(const xx of [-.06,-.015,0,.015,.06])probe(xx,yy);
    for(const delta of [[0,.24,-3],[0,-.24,-3],[.24,0,-3],[-.24,0,-3],[0,.3,-3],[0,-.3,-3],[.3,0,-3],[-.3,0,-3],[0,2,-1],[0,-2,-1],[2,0,-1],[-2,0,-1]])probe(0,.04,delta);
   }
  }a.dispose();if(performance.now()-began>180000)return{timeout:true,variantKeys,positive,bad,negative,falseHeads,hidden,falseHidden,miss,falseMiss,corners,falseCorners,shapeError,maxResidual,details};await new Promise(r=>setTimeout(r,0));
 }
 return{timeout:false,variantKeys,positive,bad,negative,falseHeads,hidden,falseHidden,miss,falseMiss,corners,falseCorners,shapeError,maxResidual,details};
};
}, {worker,i});};await initialise(p,i);
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
check(!parity.timeout&&parity.variantKeys.length===60&&parity.variantKeys.every(v=>v.positive>0)&&parity.shapeError<1e-6,'actual jaw geometry: exact60 canonical looks, seven standing/bind phases, four headings and shared vertex profile');
check(parity.positive>100&&parity.bad===0,'actual nearest eligible jaw contacts pass the uninflated pure-profile guard');
check(parity.negative>100&&parity.falseHeads===0,'unsupported nearest skull/hair/nose/mouth/neck/torso/tangent jaw proofs fail closed');
check(parity.hidden>0&&parity.falseHidden===0,'forged FIRST pure jaw entry behind a nearer actual surface never becomes a jaw head');
check(parity.corners>0&&parity.falseCorners===0&&parity.falseMiss===0,'sampled whole eligible r3 cells across every model/pose/heading stay actual jaw surfaces; native misses get no forged jaw damage');
console.log(JSON.stringify(parity));
// Geometry CPU deliberately runs before the actual gameplay connections. Real page reload creates fresh attachments; no idle/timer override.
for(let i=0;i<pages.length;i++){await pages[i].evaluate(()=>{clearInterval(tick);ghosts.disconnect();});await pages[i].reload();await initialise(pages[i],i);}
await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
for(let attempt=0;attempt<40;attempt++){if(await b.evaluate(()=>config.avatarLook(ghosts.me).style===0))break;await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await b.waitForFunction(()=>ghosts.connected);if(attempt===39)throw Error('No real short-haired target after bounded fresh attachments');}
await a.waitForFunction(()=>peer()?.avatar.look.style===0&&peer()?.snaps.length&&peer().speed<.01&&peer().avatar.time>.65);
const y=await a.evaluate(()=>(config.PVP_RIFLE_HEAD.headY+.04)*peer().avatar.look.tall);
await a.evaluate(y=>aimAt(y),y);
await a.waitForFunction(()=>ghosts.connected&&peer()?.speed<.01&&(peer().avatar.gait??0)<.01);
const shoot=async count=>{await a.evaluate(()=>combat.fire('rifle'));await a.waitForFunction(n=>acks.length===n,count);};
await shoot(1);
const first=await a.evaluate(()=>({ack:acks[0],wire:combat.lastShot,hits:combat.hits,effects,markers:[...markers]}));
check(first.ack.head===true&&first.ack.l===8&&first.ack.award.points===5&&first.wire.hc[0]===1,'actual standing SkinnedMesh front-jaw contact confirms 2 HP plus one normal award');
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
 await a.waitForFunction(()=>{const g=peer(),p=config.PVP_RIFLE_HEAD.jawPatch,width=[.93,1,1.08][g.avatar.look.build];for(const fraction of [.5,.3,.7])for(const x of [0,-.003,.003]){aimAt((config.PVP_RIFLE_HEAD.headY+p.low+(p.high-p.low)*fraction)*g.avatar.look.tall,x*width);const contact=combat.rifleContact();if(contact.hc&&config.rifleHeadContact(g.id,{p:g.feet.toArray(),r:g.root.rotation.y},{t:'a',w:'rifle',o:contact.o.toArray(),d:contact.d.toArray(),hc:contact.hc.map((v,i)=>i?Math.round(v*1000)/1000:v)},position,ghosts.rules.weapons.rifle.range,4))return true;}return false;},null,{timeout:8000});
 await shoot(9+style);fs.writeFileSync(`${out}/live-style${style}.json`,JSON.stringify(await a.evaluate(()=>({ack:acks.at(-1),wire:combat.lastShot,target:peer().id,look:peer().avatar.look,time:peer().avatar.time})),null,2));await b.waitForFunction(()=>combat.lives===8);
 check(await a.evaluate(s=>acks.at(-1).head===true&&acks.at(-1).l===8&&acks.at(-1).award.points===5&&peer().avatar.look.style===s&&!!combat.lastShot.hc,style),`real animated Ghost / Worker style${style} exposed lower-front jaw surface confirms 2 HP and one award`);
}

await a.evaluate(()=>{const hud=document.getElementById('hud');hud.hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;document.getElementById('native-head-proof')?.remove();const pre=document.createElement('pre');pre.id='native-head-proof';pre.textContent=['Native actual modules (no WebGL)',`Head: ${acks[0].head}, HP ${acks[0].l}, reward ${acks[0].award.points}`,`Body: ${acks[1].head===true}, HP ${acks[1].l}`,`Lethal: HP ${acks[8].l}, dead ${acks[8].dead}`,`Kill receipt: ${!!acks[8].kill}`,`Styles 1/2/3: ${acks.slice(9,12).map(m=>m.head&&m.l===8).join("/")}`,`Effects: ${effects}, marker shows: ${markers.length}`,`Server connection: ${ghosts.connected}`].join('\n');pre.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:16px/1.6 system-ui';document.body.append(pre);});
check(await a.evaluate(()=>{const p=document.getElementById('native-head-proof').getBoundingClientRect();return p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight&&combat.hitMarker.el.textContent==='Huvudträff!'&&!combat.hitMarker.el.hidden;}),'actual authoritative head marker and measured proof rows visibly fit native viewport');
await a.screenshot({path:`${out}/rifle-jaw-native.png`});
// New actual shooter connection resets only the existing minute cap; target is still on its actual style3 attachment.
await a.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;});await a.waitForFunction(()=>ghosts.connected&&peer()?.avatar.look.style===3&&peer()?.avatar.time>.65);
await a.evaluate(()=>aimAt(1.0));await shoot(13);await b.waitForFunction(()=>combat.lives===7);
check(await a.evaluate(()=>!acks[12].head&&acks[12].l===7&&!combat.lastShot.hc),'actual torso outside every supported head core retains BODY1');
await a.evaluate(()=>{position=[0,0,-1];ghosts.update();});await a.waitForFunction(()=>ghosts.sent?.p[2]===-1);
await a.evaluate(()=>{const g=peer(),state={p:g.feet.toArray(),r:g.root.rotation.y},y=(config.PVP_RIFLE_HEAD.headY+.04)*g.avatar.look.tall,o=[0,+(y+2).toFixed(2),-1],d=[0,-.894,.447],entry=config.rifleProfileEntry(config.rifleJawProfile(),g.id,state,o,d),unit=d.map(v=>v/Math.hypot(...d));ghosts.fire({w:'rifle',to:g.id,o,d,hc:[1,...o.map((v,i)=>+(v+unit[i]*entry).toFixed(3))]});});
await a.waitForFunction(()=>acks.length===14);await b.waitForFunction(()=>combat.lives===6);
check(await a.evaluate(()=>acks[13].l===6&&!acks[13].head&&acks[13].award.points===5),'actual fresh Worker rejects steep forged jaw proof as BODY1 with one unchanged award');

check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls in actual-module protocol/DOM evidence');completed=true;

}finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.ws?.close();}).catch(()=>{});await browser.close();check(errors.length===0,'zero native page errors');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,completed},null,2));}
console.log(`ALL ${failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
