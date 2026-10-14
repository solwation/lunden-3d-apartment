// #971 immutable Nose prism; protocol fixture adapted from published #950 (2a0d12e): actual Ghosts/Avatar/Combat, fresh Worker and original DOM; no WebGL.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),crypto=require('node:crypto');
const [game='http://localhost:8870',worker='http://localhost:8871',out='/tmp/lunden-priority-971/native']=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});let checks=0,failures=0,completed=false;
const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`)};
const paths=['src/config.js','src/avatar.js','src/ghosts.js','src/olof.js','src/combat.js','cloudflare/players.js','tools/riflenosesidetest.cjs','tools/riflenosesideproof.py'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
(async()=>{const frozen=hashes();fs.writeFileSync(`${out}/sources.json`,JSON.stringify(frozen,null,2));const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']}),pages=[],errors=[];
const deadline=setTimeout(()=>browser.close().catch(()=>{}),180000);
try{
if(process.argv.includes('--export')){
 const p=await browser.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.route('**/src/bootstrap.js',r=>r.fulfill({body:''}));await p.goto(game);
 const result=await p.evaluate(async()=>{let gl=0;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){gl++;throw Error('No WebGL');}return get.call(this,k,...a)};const T=await import('three'),C=await import('/src/config.js'),{Avatar}=await import('/src/avatar.js');const variants={},models=[],seen=new Set();for(let n=0;n<50000&&seen.size<120;n++){const id='nose-certificate-'+n,l=C.avatarLook(id),key=[l.style,l.sleeves,l.build,l.tall].join('/');if(seen.has(key))continue;seen.add(key);const a=new Avatar(id),g=a.mesh.geometry,v=[];for(let i=0;i<g.attributes.position.count;i++)v.push({p:new T.Vector3().fromBufferAttribute(g.attributes.position,i).toArray(),bone:a.mesh.skeleton.bones[g.attributes.skinIndex.getX(i)].name,nose:g.attributes.rifleNose.getX(i),skull:g.attributes.rifleSkull.getX(i)});const variant=[l.style,l.sleeves].join('/');if(variants[variant]&&JSON.stringify(variants[variant])!==JSON.stringify(v))throw Error('base mesh not invariant '+key);variants[variant]=v;models.push({id,key,look:l,scale:a.object.scale.toArray()});a.dispose();}if(models.length!==120)throw Error('missing variants');return{variants,models,gl,noseProfile:C.rifleNoseProfile(),prism:C.PVP_RIFLE_HEAD.noseSidePrism,noseShape:C.PVP_RIFLE_HEAD.nose};});
 result.sourceHashes=frozen;result.afterHashes=hashes();result.errors=errors;
 fs.writeFileSync(`${out}/native-export.json`,JSON.stringify(result));check(result.models.length===120&&Object.keys(result.variants).length===8&&result.gl===0,'actual120 models /8 native variants / no renderer');completed=true;return;
}
if(process.argv.includes('--guards')){
 const p=await browser.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.route('**/src/bootstrap.js',r=>r.fulfill({body:''}));await p.goto(game);
 const result=await p.evaluate(async()=>{
  let gl=0;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){gl++;throw Error('No GL');}return get.call(this,k,...a)};
  const T=await import('three'),C=await import('/src/config.js'),{Avatar}=await import('/src/avatar.js'),seen=new Set(),models=[];
  for(let n=0;n<50000&&seen.size<4;n++){
   const id='nose-certificate-'+n,l=C.avatarLook(id);if(l.build!==1||l.tall!==.975||seen.has(l.style))continue;seen.add(l.style);
   const a=new Avatar(id);a.update(0);a.object.updateMatrixWorld(true);const state={p:[0,0,0],r:0},o=[-.46,1.58,-3.11],d=[.147,-.001,.989],hc=[-.015,1.577,-.114];
   const entry=C.rifleNoseEntry(id,state,o,d),first=new T.Raycaster(new T.Vector3(...o),new T.Vector3(...d).normalize(),0,40).intersectObject(a.mesh,false)[0];
   const hidden={entry,first:first?.distance,nose:!!a.mesh.geometry.attributes.rifleNose.getX(first.face.a),skull:!!a.mesh.geometry.attributes.rifleSkull.getX(first.face.a),admitted:C.rifleNoseSideRegion(id,state,hc,o,d),server:C.rifleHeadContact(id,state,{t:'a',w:'rifle',o,d,hc:[1,...hc]},o,40,4,false,{allowImmutableNoseSide:true})};
   const po=[-.01,1.58,-3.13],pd=[.001,0,1],ph=[-.007,1.58,-.129],positive=C.rifleNoseSideRegion(id,state,ph,po,pd);
   const cases=[{name:'outer cell',p:[-.014,ph[1],ph[2]],o:po,d:pd},{name:'crosses barrier',p:[ph[0],ph[1],-.119],o:po,d:pd},{name:'origin inside front',p:ph,o:[0,1.58,-.99],d:pd},{name:'independent r3 ray exits prism',p:ph,o:po,d:[.01,0,1]}];
   const rejected=cases.map(q=>({name:q.name,rejected:!C.rifleNoseSideRegion(id,state,q.p,q.o,q.d)}));models.push({id,look:l,positive,hidden,rejected});a.dispose();
  }return{models,gl};
 });fs.writeFileSync(`${out}/guards.json`,JSON.stringify(result,null,2));
 check(result.models.length===4&&result.models.every(m=>m.positive),'all four styles retain known positive prism cell');
 check(result.models.every(m=>m.hidden.first<m.hidden.entry&&!m.hidden.nose&&m.hidden.skull&&!m.hidden.admitted&&!m.hidden.server),'actual nearer Skull hides pure FIRST Nose in all four styles: no new bonus');
 check(result.models.every(m=>m.rejected.every(r=>r.rejected)),'outer/cross-barrier cells, inside origin and independent rounded ray fail closed');
 check(result.gl===0,'native guards never request WebGL');completed=true;return;
}
for(let i=0;i<2;i++){
const p=await browser.newPage({viewport:{width:850,height:500}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));

await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native actual modules only'}));await p.goto(game);
await p.evaluate(async({worker,i})=>{
const context=HTMLCanvasElement.prototype.getContext;window.gl=0;HTMLCanvasElement.prototype.getContext=function(k,...args){if(/webgl/i.test(k)){gl++;throw Error('WebGL forbidden');}return context.call(this,k,...args);};
window.T=await import('three');window.config=await import('/src/config.js');window.Avatar=(await import('/src/avatar.js')).Avatar;
const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
window.sentWires=[];const send=WebSocket.prototype.send;WebSocket.prototype.send=function(value){if(typeof value==='string'){try{const m=JSON.parse(value);if(m.t==='a')sentWires.push({text:value,bytes:new TextEncoder().encode(value).length,shot:m});}catch{}}return send.call(this,value);};
window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);window.position=[0,0,i?0:-2];window.crouched=false;window.weapon='rifle';window.heading=0;window.score=0;
camera.position.set(...position);camera.position.y=1.62;camera.lookAt(0,1.62,i?4:0);camera.updateMatrixWorld();
window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Head Target':'Rifle Shooter',active:()=>true,weapon:()=>weapon,score:()=>score,mirrored:()=>false,state:()=>({p:position,r:heading,c:crouched})});
window.acks=[];window.hurts=[];window.markers=[];window.effects=0;window.deaths=0;window.remoteShots=0;
window.combat=new Combat({scene,camera,ghosts,weapon:()=>weapon,feet:()=>new T.Vector3(...position),onHit:()=>effects++,onDie:()=>deaths++,sfx:{}});
const originalShot=ghosts.onShot;ghosts.onShot=(m,g)=>{remoteShots++;originalShot?.(m,g);};
const hit=ghosts.onHit,hurt=ghosts.onHurt;ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onHurt=(m,g)=>{hurts.push(structuredClone(m));hurt(m,g);};
const mark=combat.hitMarker.show.bind(combat.hitMarker);combat.hitMarker.show=m=>{markers.push(m.head===true);mark(m);};
window.tick=null; // native geometry inventory runs before room connection/idle clock
window.peer=()=>[...ghosts.others.values()][0];
window.aimAt=(y,x=0)=>{camera.position.set(position[0],position[1]+1.62,position[2]);camera.lookAt(position[0]+x,y,peer()?.feet.z??0);camera.updateMatrixWorld();};
window.oldNoseRegion=(id,state,p)=>config.rifleNoseRegion(id,state,p)||config.rifleNoseExtraRegion(id,state,p)||config.rifleNoseBandRegion(id,state,p)||config.rifleNoseDepthRegion(id,state,p);
window.findExtra=()=>{
 const g=peer(),state={p:g.feet.toArray(),r:g.root.rotation.y},m=g.avatar.mesh,flag=m.geometry.attributes.rifleNose;
 g.root.updateMatrixWorld(true);const diag={look:g.avatar.look,head:g.avatar.bones.head.getWorldPosition(new T.Vector3()).toArray(),candidates:0};
 for(let i=0;i<flag.count;i+=3){if(!flag.getX(i))continue;
  const vs=[0,1,2].map(j=>m.getVertexPosition(i+j,new T.Vector3()).applyMatrix4(m.matrixWorld));
  for(const weights of Array.from({length:7},(_,i)=>Array.from({length:7-i},(_,j)=>[i/6,j/6,1-(i+j)/6])).flat()){
   const p=vs.reduce((p,v,j)=>p.addScaledVector(v,weights[j]),new T.Vector3()),rounded=p.toArray().map(v=>+v.toFixed(3));
   if(oldNoseRegion(g.id,state,rounded))continue;
   camera.position.set(0,+p.y.toFixed(2),-3);camera.lookAt(p);camera.updateMatrixWorld();
   const o=camera.position.toArray(),d=camera.getWorldDirection(new T.Vector3()).toArray().map(v=>+v.toFixed(3));
   if(!config.rifleNoseSideRegion(g.id,state,rounded,o,d))continue;
   diag.candidates++;const c=combat.rifleContact();if(!c.hc)continue;
   const hc=c.hc.slice(1).map(v=>Math.round(v*1000)/1000),shot={t:'a',w:'rifle',o,d,hc:[1,...hc]};
   if(oldNoseRegion(g.id,state,hc)||!config.rifleNoseSideRegion(g.id,state,hc,o,d)||!config.rifleHeadContact(g.id,state,shot,position,40,4,false,{allowImmutableNoseSide:true}))continue;
   window.aimDiagnostics=diag;return c;
  }
 }window.aimDiagnostics=diag;return null;
};window.aimExtra=async()=>{const end=performance.now()+12000;while(performance.now()<end){const c=findExtra();if(c)return c;await new Promise(r=>setTimeout(r,50));}throw Error('no admissible actual animated outside-old-core nose triangle within12s: '+JSON.stringify(aimDiagnostics));};

},{worker,i});}
const[a,b]=pages;await Promise.all(pages.map(p=>p.evaluate(()=>{tick=setInterval(()=>{ghosts.update();combat.update(0)},35)})));
await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.root.visible&&peer().snaps.length)));
for(let attempt=0;attempt<80;attempt++){if(await b.evaluate(()=>config.avatarLook(ghosts.me).build===1&&config.avatarLook(ghosts.me).tall===.975))break;await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0});await b.waitForFunction(()=>ghosts.connected);if(attempt===79)throw Error('No genuine style0 target in80 fresh sockets');}
await a.waitForFunction(()=>peer()?.avatar.look.build===1&&peer()?.avatar.look.tall===.975&&peer().root.visible&&peer().snaps.length&&peer().speed<.01);await a.waitForTimeout(650);
const shoot=async(n,head,hp)=>{await a.waitForTimeout(350);await a.evaluate(async()=>{await aimExtra();combat.fire('rifle')});await a.waitForFunction(n=>{ghosts.sendShot();return acks.length===n},n,{polling:50});check(await a.evaluate(({n,head,hp})=>(acks[n-1].head===true)===head&&acks[n-1].l===hp,{n,head,hp}),`ordinary actual nose-side shot ${n}: head=${head}, HP=${hp}`);check(await a.evaluate(()=>{const g=peer(),state={p:g.feet.toArray(),r:g.root.rotation.y},hc=sentWires.at(-1).shot.hc;return hc&&!oldNoseRegion(g.id,state,hc.slice(1));}),`shot ${n} serialized r3 contact is outside all four original Nose families`);fs.writeFileSync(`${out}/progress-receipts.json`,JSON.stringify(await a.evaluate(()=>({acks,wires:sentWires,markers})),null,2));};
if(process.argv.includes('--legacy-only')){await shoot(1,false,9);await b.waitForFunction(()=>combat.lives===9);check(await a.evaluate(()=>combat.lastShot.hc?.[0]===1&&markers.at(-1)===false&&peer().lives===9),'actual new-family client keeps body1 with a fresh original Worker');await a.evaluate(()=>combat.hit(acks[0],peer()));check(await a.evaluate(()=>effects===1&&markers.length===1),'old Worker receipt remains replay-idempotent');await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;const p=document.createElement('pre');p.textContent='Actual new Nose client / original Worker\nNew certified prism contact: body1, HP9';p.style.cssText='position:fixed;left:20px;top:120px;background:#182535;color:white;padding:18px;font:16px/1.6 system-ui';document.body.append(p)});await a.screenshot({path:`${out}/legacy-native.png`});completed=true;return;}
await shoot(1,true,8);await b.waitForFunction(()=>combat.lives===8);await a.waitForFunction(()=>peer().lives===8);check(await b.evaluate(()=>hurts[0].head===true),'public and receiver health agree on pre-greeting nose-side2');
await a.evaluate(()=>window.originalHead=structuredClone(combat.lastShot));await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);await shoot(2,true,6);
check(await a.evaluate(()=>peer().lives===6)&&await b.evaluate(()=>combat.lives===6&&hurts.at(-1).head),'immutable actual accepted greeting remains nose-side2 locally and publicly');
const late=await a.evaluate(async worker=>{const {Ghosts}=await import('/src/ghosts.js'),observer=new Ghosts({scene:new T.Scene(),camera:new T.PerspectiveCamera(),url:worker,active:()=>true,weapon:()=> 'rifle',state:()=>({p:[8,0,8],r:0})});let welcome=null;const message=observer.message.bind(observer);observer.message=text=>{const m=JSON.parse(text);if(m.t==='w')welcome=m;message(text)};const timer=setInterval(()=>observer.update(),35),target=peer().id;try{const until=performance.now()+10000;while(performance.now()<until){const g=observer.others.get(target);if(welcome&&g?.have){const state=welcome.ps.find(s=>s.i===target);return{visible:g.root.visible,body:g.body,gaze:g.gaze,state,privateFlag:Object.hasOwn(state,'headPoseFixed')};}await new Promise(r=>setTimeout(r,35));}throw Error('actual late welcome timeout');}finally{clearInterval(timer);observer.disconnect();}},worker);fs.writeFileSync(`${out}/late-welcome.json`,JSON.stringify(late,null,2));check(late.visible&&late.body===0&&late.state.r===0&&!late.privateFlag,'genuine late observer starts from same immutable public heading without private history');

await a.evaluate(()=>{clearInterval(tick);tick=null});const wave=await a.evaluate(()=>peer().waveT);await a.waitForTimeout(3100);check(await a.evaluate(t=>peer().waveT===t&&t>0,wave),'actual paused Ghost retains unfinished wave; no wall-clock completion assumption');
await shoot(3,true,4);await a.evaluate(()=>{tick=setInterval(()=>{ghosts.update();combat.update(0)},35)});await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);
await b.evaluate(()=>{weapon='saber';score=1});await a.waitForFunction(()=>peer().h==='saber'&&peer().score===1);await shoot(4,true,2);
await a.waitForTimeout(350);await a.evaluate(()=>ghosts.fire({...originalHead,to:peer().id,hc:undefined}));await a.waitForFunction(()=>acks.length===5);check(await a.evaluate(()=>!acks[4].head&&acks[4].l===1),'legacy client without hc keeps body1 and leaves exactly1HP');
await b.evaluate(()=>weapon='rifle');await a.waitForFunction(()=>peer().h==='rifle');await shoot(6,true,-1);await b.waitForFunction(()=>deaths===1&&combat.lives===combat.maxLives);
check(await a.evaluate(()=>acks[5].dead===true&&typeof acks[5].kill==='string'&&acks[5].award.seq===6),'one lethal nose-side2 has one UUID, sequenced award and normal reset');
await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;const p=document.createElement('pre');p.id='lethal-proof';p.textContent=['Actual immutable Nose prism / fresh Worker',`Pre / greeted / paused / saber HP: ${acks.slice(0,4).map(m=>m.l).join(' / ')}`,`One lethal UUID: ${!!acks[5].kill}, HP ${acks[5].l}`,`Receiver reset uses actual shared life reducer`].join('\n');p.style.cssText='position:fixed;left:20px;top:120px;background:#182535;color:white;padding:18px;font:16px/1.6 system-ui';document.body.append(p)});check(await a.evaluate(()=>!combat.hitMarker.el.hidden&&combat.hitMarker.el.textContent==='Huvudträff!'),'actual lethal authoritative head marker is visible');await a.screenshot({path:`${out}/nose-side-greeting-head-native.png`});await a.evaluate(()=>document.getElementById('lethal-proof').remove());
await a.evaluate(()=>{combat.hit(acks[0],peer());combat.hit(acks[5],peer())});check(await a.evaluate(()=>effects===6&&markers.length===6),'normal and lethal receipts remain effect/marker replay-idempotent');
// Genuine ordinary heading publication invalidates the immutable anchor permanently, even after return.
await b.evaluate(()=>{heading=.1});await a.waitForFunction(()=>peer().snaps.at(-1).r===.1);await b.evaluate(()=>{heading=0});await a.waitForFunction(()=>peer().snaps.at(-1).r===0);await a.waitForTimeout(650);await shoot(7,false,9);
check(await a.evaluate(()=>acks[6].head!==true&&markers.at(-1)===false),'real accepted heading change and return keeps nose-side body1 after death reset');
await b.evaluate(()=>{position=[.1,0,0]});await a.waitForFunction(()=>peer().snaps.at(-1).p.x===.1);await b.evaluate(()=>{position=[0,0,0]});await a.waitForFunction(()=>peer().snaps.at(-1).p.x===0);await a.waitForTimeout(650);await shoot(8,false,8);
await b.evaluate(()=>crouched=true);await a.waitForFunction(()=>peer().crouch===1);await b.evaluate(()=>crouched=false);await a.waitForFunction(()=>peer().crouch===0);await a.waitForTimeout(650);await shoot(9,false,7);
await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;const note=document.createElement('pre');note.id='nose-side-greeting-proof';note.textContent=['Actual Ghosts/Avatar/Combat + fresh Worker (no WebGL)',`Pre / greeted / paused / saber HP: ${acks.slice(0,4).map(m=>m.l).join(' / ')}`,`Lethal: HP ${acks[5].l}, UUID ${!!acks[5].kill}`,`Changed heading / move / crouch: body1 HP ${acks.slice(6,9).map(m=>m.l).join(' / ')}`,`Replay effects: ${effects}, actual receipt markers: ${markers.length}`].join('\n');note.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:15px/1.6 system-ui';document.body.append(note)});
check(await a.evaluate(()=>{const r=document.getElementById('nose-side-greeting-proof').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&!combat.hitMarker.el.hidden&&combat.hitMarker.el.textContent==='Träff!'}),'actual final body marker and measured receipt rows are visible');await a.screenshot({path:`${out}/nose-side-greeting-native.png`});
await a.waitForTimeout(350);await a.evaluate(()=>{findExtra();window.wall=new T.Mesh(new T.BoxGeometry(2,2,.025),new T.MeshBasicMaterial());wall.position.set(0,1,-.2);scene.add(wall);scene.updateMatrixWorld(true)});let remote=await b.evaluate(()=>remoteShots);await a.evaluate(()=>combat.fire('rifle'));await b.waitForFunction(n=>remoteShots>n,remote);check(await a.evaluate(()=>combat.lastShot.to===null&&!combat.lastShot.hc&&acks.length===9),'actual wall before target retains full hinder ray and no damage award');await a.evaluate(()=>{wall.removeFromParent();wall.geometry.dispose();wall.material.dispose();aimAt(3)});await a.waitForTimeout(350);remote=await b.evaluate(()=>remoteShots);await a.evaluate(()=>combat.fire('rifle'));await b.waitForFunction(n=>remoteShots>n,remote);check(await a.evaluate(()=>combat.lastShot.to===null&&!combat.lastShot.hc&&acks.length===9),'actual above-head miss has no hit or award');
// A genuinely new target has immutable history again: unsafe geometry must still yield body1.
for(let attempt=0;attempt<80;attempt++){await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0});await b.waitForFunction(()=>ghosts.connected);if(await b.evaluate(()=>config.avatarLook(ghosts.me).build===1&&config.avatarLook(ghosts.me).tall===.975))break;if(attempt===79)throw Error('No new canonical target');}
await a.waitForFunction(()=>peer()?.avatar.look.build===1&&peer()?.avatar.look.tall===.975&&peer().snaps.length&&peer().root.visible);await a.waitForTimeout(650);
await a.evaluate(()=>ghosts.fire({t:'a',w:'rifle',to:peer().id,o:[-.46,1.58,-3.11],d:[.147,-.001,.989],hc:[1,-.015,1.577,-.114]}));await a.waitForFunction(()=>acks.length===10);
check(await a.evaluate(()=>acks[9].head!==true&&acks[9].l===9),'forged pure FIRST Nose behind actual nearer Skull remains body1 with fresh immutable target');
await shoot(11,true,7);check(await b.evaluate(()=>combat.lives===7),'same new target still accepts safe prism2: unsafe case was geometric, not stale history');
const state=await a.evaluate(()=>({acks,markers,wires:sentWires,effects,publicHP:peer().lives}));fs.writeFileSync(`${out}/receipts.json`,JSON.stringify(state,null,2));
check(state.wires.every(w=>w.bytes<=256&&w.shot.o.every(v=>Math.abs(v*100-Math.round(v*100))<1e-6)&&w.shot.d.every(v=>Math.abs(v*1000-Math.round(v*1000))<1e-6)&&(!w.shot.hc||w.shot.hc[0]===1)),'real serialized v1/r2/r3 wire stays within256bytes');
check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls');completed=true;
}finally{clearTimeout(deadline);for(let i=0;i<pages.length;i++){const p=pages[i];const retained=await p.evaluate(()=>({acks:window.acks,hurts:window.hurts,wires:window.sentWires})).catch(()=>null);fs.writeFileSync(`${out}/final-page-${i}.json`,JSON.stringify(retained,null,2));await p.evaluate(()=>{clearInterval(window.tick);window.ghosts?.ws?.close()}).catch(()=>{});}await browser.close();check(errors.length===0,'zero page errors');check(JSON.stringify(frozen)===JSON.stringify(hashes()),'executed runtime and driver stayed frozen');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,completed,errors,sources:frozen},null,2));console.log(`ALL ${!completed?'INCOMPLETE':failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length||!completed?1:0;}
})().catch(e=>{console.error(e);process.exitCode=1});
