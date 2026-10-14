// #967 first accepted negative standing RIGHT turn after greeting: actual Ghosts/Avatar/Combat, fresh Worker and original DOM; no WebGL.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),crypto=require('node:crypto');
const [game='http://localhost:8878',worker='http://localhost:8879',out='/tmp/lunden-priority-967/native']=process.argv.slice(2);
const targetStyle=process.argv.includes('--style2')?2:0;
fs.mkdirSync(out,{recursive:true});let checks=0,failures=0,completed=false;
const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`)};
const paths=['src/config.js','src/avatar.js','src/ghosts.js','src/combat.js','cloudflare/players.js','tools/riflerightcelltest.cjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
(async()=>{const frozen=hashes();fs.writeFileSync(`${out}/sources.json`,JSON.stringify(frozen,null,2));const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']}),pages=[],errors=[];
const deadline=setTimeout(()=>browser.close().catch(()=>{}),180000);
try{
for(let i=0;i<2;i++){
const p=await browser.newPage({viewport:{width:850,height:500}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));

await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native actual modules only'}));await p.goto(game);
await p.evaluate(async({worker,i})=>{
const context=HTMLCanvasElement.prototype.getContext;window.gl=0;HTMLCanvasElement.prototype.getContext=function(k,...args){if(/webgl/i.test(k)){gl++;throw Error('WebGL forbidden');}return context.call(this,k,...args);};
window.T=await import('three');window.config=await import('/src/config.js');window.Avatar=(await import('/src/avatar.js')).Avatar;
const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
window.sentWires=[];const send=WebSocket.prototype.send;WebSocket.prototype.send=function(value){if(typeof value==='string'){try{const m=JSON.parse(value);if(m.t==='a')sentWires.push({text:value,bytes:new TextEncoder().encode(value).length,shot:m});}catch{}}return send.call(this,value);};
window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);window.position=[0,0,i?0:4];window.crouched=false;window.weapon='rifle';window.heading=.8;window.score=0;
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
window.aimRight=(desired,unsafe=false)=>{
 const g=peer(),state={p:g.feet.toArray(),r:desired??g.snaps.at(-1).r},w=[.93,1,1.08][g.avatar.look.build],up=new T.Vector3(0,1,0);
 for(const distance of [1.6,2.1,2.6,3.6,4.1])for(const z of [.04,.039,.041])for(const y of [.1,.099,.101])for(const dz of [0,-.001,.001,-.002,.002])for(const dy of [0,-.001,.001,-.002,.002]){
  const o=new T.Vector3(distance,(config.PVP_RIFLE_HEAD.headY+y)*g.avatar.look.tall-dy*distance,-z*w-dz*distance).applyAxisAngle(up,state.r).add(g.feet);
  o.set(...o.toArray().map(v=>Math.round(v*100)/100));window.position=[o.x,g.feet.y,o.z];camera.position.copy(o);
  const direction=new T.Vector3(-1,dy,dz).normalize().applyAxisAngle(up,state.r);camera.lookAt(o.clone().add(direction));camera.updateMatrixWorld();
  const c=combat.rifleContact(),q=c.hc?.slice(1).map(v=>Math.round(v*1000)/1000);
  if(!q||!config.rifleHeadGreetingRightRegion(g.id,state,q,c.o.toArray(),c.d.toArray()))continue;
  const admitted=config.rifleHeadGreetingRightCellRegion(g.id,state,q,c.o.toArray(),c.d.toArray());
  if(unsafe?!admitted:admitted)return true;
 }
 throw Error('no actual supported RIGHT cell in bounded ordinary shooter positions');
};

},{worker,i});}
const[a,b]=pages;await Promise.all(pages.map(p=>p.evaluate(()=>{tick=setInterval(()=>{ghosts.update();combat.update(0)},35)})));
await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.root.visible&&peer().snaps.length)));
const selection=[];
for(let attempt=0;attempt<120;attempt++){
 const id=await b.evaluate(()=>ghosts.me);await a.waitForFunction(id=>peer()?.id===id&&peer().have&&peer().root.visible&&peer().snaps.length&&peer().speed<.01,id);await a.waitForTimeout(100);
 const row=await a.evaluate(()=>{let supported=false;try{supported=aimRight()}catch{}return{id:peer().id,look:peer().avatar.look,supported}});selection.push(row);
 fs.writeFileSync(`${out}/actual-target-selection.json`,JSON.stringify(selection,null,2));
 if(row.look.style===targetStyle&&row.supported)break;
 await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0});await b.waitForFunction(()=>ghosts.connected);if(attempt===119)throw Error('No actual supported style'+targetStyle+' target in120 fresh sockets');
}
await a.waitForTimeout(650);
const shoot=async(n,head,hp)=>{await a.waitForTimeout(350);await a.waitForFunction(()=>{if(tick===null)return true;try{return aimRight(undefined,window.unsafeMode===true)}catch{return false}},null,{polling:100,timeout:12000});await a.waitForFunction(()=>ghosts.sent&&Math.hypot(...position.map((v,i)=>v-ghosts.sent.p[i]))<=config.GHOSTS.move);await a.evaluate(()=>combat.fire('rifle'));await a.waitForFunction(n=>{ghosts.sendShot();return acks.length===n},n,{polling:50});check(await a.evaluate(({n,head,hp})=>(acks[n-1].head===true)===head&&acks[n-1].l===hp,{n,head,hp}),`ordinary actual first-turn RIGHT shot ${n}: head=${head}, HP=${hp}`);fs.writeFileSync(`${out}/progress-receipts.json`,JSON.stringify(await a.evaluate(()=>({acks,wires:sentWires,markers})),null,2));};
await shoot(1,true,8);await b.waitForFunction(()=>combat.lives===8);await a.waitForFunction(()=>peer().lives===8);check(await b.evaluate(()=>hurts[0].head===true),'public and receiver health agree on pre-greeting RIGHT2');
if(process.argv.includes('--legacy-only')){await a.evaluate(()=>window.originalHead=structuredClone(combat.lastShot));await b.waitForFunction(()=>performance.now()-ghosts.greetAt>=config.GHOSTS.greetEvery*1000);await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);await b.evaluate(()=>{heading=.7});await a.waitForFunction(()=>peer().snaps.at(-1).r===.7);await a.waitForTimeout(650);await shoot(2,false,7);check(await a.evaluate(()=>combat.lastShot.hc?.[0]===1&&markers.at(-1)===false),'actual new-client RIGHT hc receives ordinary body1 from the frozen older Worker');fs.writeFileSync(`${out}/receipts.json`,JSON.stringify(await a.evaluate(()=>({acks,wires:sentWires,markers})),null,2));await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;const p=document.createElement('pre');p.textContent='Actual new client / original Worker\nPre-greet head2: HP8\nFirst-turn after greeting: body1, HP7';p.style.cssText='position:fixed;left:20px;top:120px;background:#182535;color:white;padding:18px;font:16px/1.6 system-ui';document.body.append(p)});await a.screenshot({path:`${out}/legacy-native.png`});completed=true;return;}
await a.evaluate(()=>window.originalHead=structuredClone(combat.lastShot));await b.waitForFunction(()=>performance.now()-ghosts.greetAt>=config.GHOSTS.greetEvery*1000);await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);await b.evaluate(()=>{heading=.7});await a.waitForFunction(()=>peer().snaps.at(-1).r===.7);await a.waitForTimeout(650);await shoot(2,true,6);
check(await a.evaluate(()=>peer().lives===6)&&await b.evaluate(()=>combat.lives===6&&hurts.at(-1).head),'first-turn actual accepted greeting remains RIGHT2 locally and publicly');
const late=await a.evaluate(async worker=>{const {Ghosts}=await import('/src/ghosts.js'),observer=new Ghosts({scene:new T.Scene(),camera:new T.PerspectiveCamera(),url:worker,active:()=>true,weapon:()=> 'rifle',state:()=>({p:[8,0,8],r:0})});let welcome=null;const message=observer.message.bind(observer);observer.message=text=>{const m=JSON.parse(text);if(m.t==='w')welcome=m;message(text)};const timer=setInterval(()=>observer.update(),35),target=peer().id;try{const until=performance.now()+10000;while(performance.now()<until){const g=observer.others.get(target);if(welcome&&g?.have){const state=welcome.ps.find(s=>s.i===target);return{visible:g.root.visible,body:g.body,gaze:g.gaze,state,privateFlag:Object.hasOwn(state,'headPoseFixed')||Object.hasOwn(state,'rightFirstTurn')};}await new Promise(r=>setTimeout(r,35));}throw Error('actual late welcome timeout');}finally{clearInterval(timer);observer.disconnect();}},worker);fs.writeFileSync(`${out}/late-welcome.json`,JSON.stringify(late,null,2));check(late.visible&&Math.abs(late.body-.7)<1e-12&&late.state.r===.7&&!late.privateFlag,'genuine late observer starts from same first-turn public heading without private history');

await a.waitForFunction(()=>{try{return aimRight()}catch{return false}},null,{polling:100,timeout:12000});await a.waitForFunction(()=>ghosts.sent&&Math.hypot(...position.map((v,i)=>v-ghosts.sent.p[i]))<=config.GHOSTS.move);await a.evaluate(()=>{clearInterval(tick);tick=null;const g=peer(),c=combat.rifleContact();if(!c.hc||!config.rifleHeadGreetingRightCellRegion(g.id,{p:g.feet.toArray(),r:g.snaps.at(-1).r},c.hc.slice(1).map(v=>Math.round(v*1000)/1000),c.o.toArray(),c.d.toArray()))throw Error('published camera is not a valid contact at pause boundary')});const wave=await a.evaluate(()=>peer().waveT);await a.waitForTimeout(3100);check(await a.evaluate(t=>peer().waveT===t&&t>0,wave),'actual paused Ghost retains unfinished wave; no wall-clock completion assumption');
await shoot(3,true,4);await a.evaluate(()=>{tick=setInterval(()=>{ghosts.update();combat.update(0)},35)});await b.waitForFunction(()=>performance.now()-ghosts.greetAt>=config.GHOSTS.greetEvery*1000);await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);
await b.evaluate(()=>{weapon='saber';score=1});await a.waitForFunction(()=>peer().h==='saber'&&peer().score===1);await shoot(4,true,2);
await a.waitForTimeout(350);await a.evaluate(()=>ghosts.fire({...originalHead,to:peer().id,hc:undefined}));await a.waitForFunction(()=>acks.length===5);check(await a.evaluate(()=>!acks[4].head&&acks[4].l===1),'legacy client without hc keeps body1 and leaves exactly1HP');
await b.evaluate(()=>weapon='rifle');await a.waitForFunction(()=>peer().h==='rifle');await shoot(6,true,-1);await b.waitForFunction(()=>deaths===1&&combat.lives===combat.maxLives);
check(await a.evaluate(()=>acks[5].dead===true&&typeof acks[5].kill==='string'&&acks[5].award.seq===6),'one lethal RIGHT2 has one UUID, sequenced award and normal reset');
await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;const p=document.createElement('pre');p.id='lethal-proof';p.textContent=['Actual first-turn RIGHT / fresh Worker',`Pre / greeted / paused / saber HP: ${acks.slice(0,4).map(m=>m.l).join(' / ')}`,`One lethal UUID: ${!!acks[5].kill}, HP ${acks[5].l}`,`Receiver reset uses actual shared life reducer`].join('\n');p.style.cssText='position:fixed;left:20px;top:120px;background:#182535;color:white;padding:18px;font:16px/1.6 system-ui';document.body.append(p)});check(await a.evaluate(()=>!combat.hitMarker.el.hidden&&combat.hitMarker.el.textContent==='Huvudträff!'),'actual lethal authoritative head marker is visible');await a.screenshot({path:`${out}/first-right-head-native.png`});await a.evaluate(()=>document.getElementById('lethal-proof').remove());
await a.evaluate(()=>{combat.hit(acks[0],peer());combat.hit(acks[5],peer())});check(await a.evaluate(()=>effects===6&&markers.length===6),'normal and lethal receipts remain effect/marker replay-idempotent');
// Genuine ordinary heading publication invalidates the first-turn anchor permanently, even after return.
await b.evaluate(()=>{heading=.8});await a.waitForFunction(()=>peer().snaps.at(-1).r===.8);await b.evaluate(()=>{heading=.7});await a.waitForFunction(()=>peer().snaps.at(-1).r===.7);await a.waitForTimeout(650);await shoot(7,false,9);
check(await a.evaluate(()=>acks[6].head!==true&&markers.at(-1)===false),'real accepted heading change and return keeps RIGHT body1 after death reset');
await b.evaluate(()=>{position=[.1,0,0]});await a.waitForFunction(()=>peer().snaps.at(-1).p.x===.1);await b.evaluate(()=>{position=[0,0,0]});await a.waitForFunction(()=>peer().snaps.at(-1).p.x===0);await a.waitForTimeout(650);await shoot(8,false,8);
await b.evaluate(()=>crouched=true);await a.waitForFunction(()=>peer().crouch===1);await b.evaluate(()=>crouched=false);await a.waitForFunction(()=>peer().crouch===0);await a.waitForTimeout(650);await shoot(9,false,7);
await a.waitForTimeout(350);await a.evaluate(()=>{aimRight();window.wall=new T.Mesh(new T.BoxGeometry(1,2,1),new T.MeshBasicMaterial());wall.position.copy(camera.position).lerp(peer().feet.clone().setY(camera.position.y),.5);scene.add(wall);scene.updateMatrixWorld(true)});let remote=await b.evaluate(()=>remoteShots);await a.evaluate(()=>combat.fire('rifle'));await b.waitForFunction(n=>remoteShots>n,remote);check(await a.evaluate(()=>combat.lastShot.to===null&&!combat.lastShot.hc&&acks.length===9),'actual wall before target retains full hinder ray and no damage award');await a.evaluate(()=>{wall.removeFromParent();wall.geometry.dispose();wall.material.dispose();aimAt(3)});await a.waitForTimeout(350);remote=await b.evaluate(()=>remoteShots);await a.evaluate(()=>combat.fire('rifle'));await b.waitForFunction(n=>remoteShots>n,remote);check(await a.evaluate(()=>combat.lastShot.to===null&&!combat.lastShot.hc&&acks.length===9),'actual above-head miss has no hit or award');await a.waitForTimeout(350);await a.evaluate(()=>ghosts.fire({...originalHead,to:peer().id,hc:[9,...originalHead.hc.slice(1)]}));await a.waitForFunction(()=>acks.length===10);check(await a.evaluate(()=>!acks[9].head&&acks[9].l===6),'invalid hc version remains body1 on actual Worker');
// Genuine fresh targets: style filtering and a style0 geometric rejection with valid first-turn history.
const denied=[],negativeSelection=[];
for(const style of[1,targetStyle]) {
 await b.evaluate(()=>{heading=.8;position=[0,0,0];crouched=false;weapon='rifle';ghosts.disconnect();ghosts.retryAt=0});
 for(let attempt=0;attempt<120;attempt++) {
  await b.waitForFunction(()=>ghosts.connected);const id=await b.evaluate(()=>ghosts.me);await a.waitForFunction(id=>peer()?.id===id&&peer().have&&peer().root.visible&&peer().snaps.length&&peer().speed<.01,id);await a.waitForTimeout(100);
  const ok=await a.evaluate(style=>{if(peer().avatar.look.style!==style)return false;try{return aimRight(undefined,true)}catch{return false}},style);
  negativeSelection.push(await a.evaluate(({style,attempt,ok})=>({style,attempt,ok,id:peer().id,look:peer().avatar.look,have:peer().have,body:peer().body,gaze:peer().gaze,time:peer().avatar.time}),{style,attempt,ok}));fs.writeFileSync(`${out}/actual-negative-selection.json`,JSON.stringify(negativeSelection,null,2));
  if(ok)break;
  if(attempt===119)throw Error('No actual negative target for style '+style+' in120 fresh sockets');await b.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0});
 }
 await b.waitForFunction(()=>performance.now()-ghosts.greetAt>=config.GHOSTS.greetEvery*1000);await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);await b.evaluate(()=>heading=.7);await a.waitForFunction(()=>peer().snaps.at(-1).r===.7);await a.waitForTimeout(650);await a.evaluate(()=>window.unsafeMode=true);await shoot(style===1?11:12,false,9);
 const row=await a.evaluate(()=>{const g=peer(),state={p:g.feet.toArray(),r:g.snaps.at(-1).r},shot=sentWires.at(-1).shot;return{id:g.id,look:g.avatar.look,state,shot,oldLeaf:config.rifleHeadGreetingRightRegion(g.id,state,shot.hc.slice(1),shot.o,shot.d),cell:config.rifleHeadGreetingRightCellRegion(g.id,state,shot.hc.slice(1),shot.o,shot.d),ack:acks.at(-1)}});denied.push(row);
 check(row.look.style===style&&row.oldLeaf&&!row.cell&&!row.ack.head&&await b.evaluate(()=>combat.lives===9),'ordinary style'+style+' nearest-Skull cell stays body1 with fresh valid first-turn history');
}
fs.writeFileSync(`${out}/native-denied-cells.json`,JSON.stringify(denied,null,2));
const state=await a.evaluate(()=>({acks,markers,wires:sentWires,effects,publicHP:peer().lives}));fs.writeFileSync(`${out}/receipts.json`,JSON.stringify(state,null,2));
check(state.wires.every(w=>w.bytes<=256&&w.shot.o.every(v=>Math.abs(v*100-Math.round(v*100))<1e-6)&&w.shot.d.every(v=>Math.abs(v*1000-Math.round(v*1000))<1e-6)&&(!w.shot.hc||[1,9].includes(w.shot.hc[0]))),'real serialized v1/r2/r3 wire stays within256bytes');
await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;const note=document.createElement('pre');note.id='first-right-proof';note.textContent=['Actual Ghosts/Avatar/Combat + fresh Worker (no WebGL)',`Pre / greeted / paused / saber HP: ${acks.slice(0,4).map(m=>m.l).join(' / ')}`,`Lethal: HP ${acks[5].l}, UUID ${!!acks[5].kill}`,`Changed heading / move / crouch: body1 HP ${acks.slice(6,9).map(m=>m.l).join(' / ')}`,`Replay effects: ${effects}, actual receipt markers: ${markers.length}`].join('\n');note.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:15px/1.6 system-ui';document.body.append(note)});
check(await a.evaluate(()=>{const r=document.getElementById('first-right-proof').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&!combat.hitMarker.el.hidden&&combat.hitMarker.el.textContent==='Träff!'}),'actual final body marker and measured receipt rows are visible');await a.screenshot({path:`${out}/first-right-native.png`});
check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls');completed=true;
}finally{clearTimeout(deadline);for(let i=0;i<pages.length;i++){const p=pages[i];const retained=await p.evaluate(()=>({acks:window.acks,hurts:window.hurts,wires:window.sentWires})).catch(()=>null);fs.writeFileSync(`${out}/final-page-${i}.json`,JSON.stringify(retained,null,2));await p.evaluate(()=>{clearInterval(window.tick);window.ghosts?.ws?.close()}).catch(()=>{});}await browser.close();check(errors.length===0,'zero page errors');check(JSON.stringify(frozen)===JSON.stringify(hashes()),'executed runtime and driver stayed frozen');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,completed,errors,sources:frozen},null,2));console.log(`ALL ${!completed?'INCOMPLETE':failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length||!completed?1:0;}
})().catch(e=>{console.error(e);process.exitCode=1});
