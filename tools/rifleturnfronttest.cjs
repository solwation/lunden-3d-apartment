// #944 actual native Ghosts corridor geometry and fresh Worker; no World/WebGL.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {startOwnedWorker,stopOwnedWorker,sourceHashes:baseSourceHashes,ownsPort}=require('./workerfixture.cjs');
const {createNativeManifest,saveNativeManifest,loadVerifiedNativeManifest}=require('./nativemanifest.cjs');
const sourceHashes=(opts={})=>baseSourceHashes({extraSources:['tools/rifleturnfronttest.cjs'],...opts});

const [game='http://localhost:8870',worker='http://localhost:8871',out='/tmp/lunden-priority-944/native',gridProofPath]=process.argv.slice(2);
let checks=0,failures=0,completed=false;const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`)};
(async()=>{fs.mkdirSync(out,{recursive:true});const frozen=sourceHashes();fs.writeFileSync(`${out}/source-freeze.json`,JSON.stringify(frozen,null,2));const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']}),pages=[],errors=[];
try{
for(let i=0;i<2;i++){const p=await browser.newPage({viewport:{width:850,height:550}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native CPU/DOM only'}));await p.goto(game);
if(i===0)await p.exposeFunction('saveCheckpoint',r=>fs.writeFileSync(`${out}/grid-checkpoint.json`,JSON.stringify(r,null,2)));
await p.evaluate(async({i,worker})=>{const original=HTMLCanvasElement.prototype.getContext;window.gl=0;HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){gl++;throw Error('WebGL forbidden')}return original.call(this,k,...a)};
window.T=await import('three');window.C=await import('/src/config.js');const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');Object.assign(window,{position:[0,0,i?0:-4],heading:0,weapon:'rifle',enabled:false,acks:[],hurts:[],markers:[],effects:0,deaths:0,wires:[],qcount:0,tick:null});
window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);camera.position.set(...position);camera.position.y=1.62;camera.lookAt(0,1.62,i?-4:0);camera.updateMatrixWorld();
window.ghosts=new Ghosts({scene,camera,url:worker,active:()=>enabled,weapon:()=>weapon,name:()=>i?'Small-turn target':'Small-turn shooter',state:()=>({p:position,r:heading})});
window.combat=new Combat({scene,camera,ghosts,weapon:()=>weapon,feet:()=>new T.Vector3(...position),onHit:()=>effects++,onDie:()=>deaths++,sfx:{}});window.peer=()=>[...ghosts.others.values()][0];const message=ghosts.message.bind(ghosts);ghosts.message=data=>{if(data==='q')qcount++;message(data)};const hit=ghosts.onHit,hurt=ghosts.onHurt;ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g)};ghosts.onHurt=(m,g)=>{hurts.push(structuredClone(m));hurt(m,g)};
const mark=combat.hitMarker.show.bind(combat.hitMarker);combat.hitMarker.show=m=>{markers.push(m.head===true);mark(m)};const send=WebSocket.prototype.send;WebSocket.prototype.send=function(v){if(typeof v==='string'){try{const m=JSON.parse(v);if(m.t==='a')wires.push({text:v,bytes:new TextEncoder().encode(v).length,shot:m})}catch{}}return send.call(this,v)};
window.aimFront=()=>{const g=peer(),l=g.avatar.look,w=[.93,1,1.08][l.build],state={p:g.feet.toArray(),r:g.root.rotation.y};for(const x of [-.067,.067,-.068,.068])for(const y of [.089,.09,.091]){const target=new T.Vector3(-x*w,(C.PVP_RIFLE_HEAD.headY+y)*l.tall,-.08*w).applyAxisAngle(new T.Vector3(0,1,0),state.r).add(g.feet);camera.position.set(position[0],position[1]+1.62,position[2]);camera.lookAt(target);camera.updateMatrixWorld();const q=combat.rifleContact();const hc=q.hc?[1,...q.hc.slice(1).map(v=>Math.round(v*1000)/1000)]:null,serverState={p:g.feet.toArray(),r:g.snaps.at(-1).r};if(hc&&C.rifleHeadAfterTurnFrontRegion(g.id,serverState,hc.slice(1),q.o.toArray(),q.d.toArray())&&C.rifleHeadContact(g.id,serverState,{t:'a',w:'rifle',o:q.o.toArray(),d:q.d.toArray(),hc},position,ghosts.rules.weapons.rifle.range,4,false,{allowFront:false,allowRear:false,allowAfterTurnFront:true}))return true;}return false;};
window.aimBody=()=>{const g=peer();for(const y of [1.3,1.2,1.1,1,.9])for(const x of [0,-.04,.04]){camera.position.set(position[0],position[1]+1.62,position[2]);camera.lookAt(g.feet.x+x,g.feet.y+y*g.avatar.look.tall,g.feet.z);camera.updateMatrixWorld();const q=combat.rifleContact();if(q.target?.id===g.id&&!q.hc){const h=new T.Raycaster(q.o,q.d.clone().normalize(),0,ghosts.rules.weapons.rifle.range).intersectObject(g.avatar.mesh,false)[0];if(h){const bone=g.avatar.mesh.skeleton.bones[g.avatar.mesh.geometry.attributes.skinIndex.getX(h.face.a)].name;if(bone==='torso'||bone==='hips')return{y,bone,point:h.point.toArray()};}}}return null;};

window.grid=async()=>{
const seen=new Set(),models=[],details=[],counts={positive:0,bad:0,negative:0,falseHeads:0,hidden:0,falseHidden:0,corners:0,cornerBad:0,rays:0};const deadline=performance.now()+180000;
poses_loop: for(let n=0;n<3000&&seen.size<60;n++){const id='front-'+n,l=C.avatarLook(id),key=[l.style,l.build,l.tall].join('/');if(seen.has(key))continue;seen.add(key);models.push(key);const w=[.93,1,1.08][l.build];
poses: for(const base of [0,.8,3.14,-1.6])for(const mode of ['rifle','saber'])for(const at of [-100,0,600]){
const g=ghosts.add(id,'Actual survey'),eye=new T.Vector3(0,1.62,-3);let t=1000;g.push({p:[0,0,0],r:base,h:mode},t);g.draw(t+C.GHOSTS.delay,eye);if(mode==='saber')g.swing();g.push({p:[0,0,0],r:+(base+.02).toFixed(2),h:mode},t+=200);g.draw(t+C.GHOSTS.delay,eye);g.push({p:[0,0,0],r:+(base-.02).toFixed(2),h:mode},t+=200);g.draw(t+C.GHOSTS.delay+at,eye);scene.updateMatrixWorld(true);const state={p:[0,0,0],r:+(base-.02).toFixed(2)},flag=g.avatar.mesh.geometry.attributes.rifleSkull,options={allowFront:false,allowRear:false,allowAfterTurnFront:true};
for(const x of [-.10,-.073,-.070,-.067,-.063,0,.063,.067,.070,.073,.10])for(const y of [.06,.085,.088,.09,.092,.096,.12,.18]){
const target=new T.Vector3(-x*w,(C.PVP_RIFLE_HEAD.headY+y)*l.tall,-.08*w).applyAxisAngle(new T.Vector3(0,1,0),state.r),o=target.clone().add(new T.Vector3(0,0,-3).applyAxisAngle(new T.Vector3(0,1,0),state.r));o.set(...o.toArray().map(v=>Math.round(v*100)/100));const raw=target.clone().sub(o).normalize();raw.set(...raw.toArray().map(v=>Math.round(v*1000)/1000));const d=raw.clone().normalize(),native=new T.Raycaster(o,d,0,40).intersectObject(g.avatar.mesh,false)[0];counts.rays++;if(!native)continue;
const hc=[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)],shot={t:'a',w:'rifle',o:o.toArray(),d:raw.toArray(),hc},region=C.rifleHeadAfterTurnFrontRegion(id,state,hc.slice(1),shot.o,shot.d),accepted=C.rifleHeadContact(id,state,shot,shot.o,40,4,false,options);
if(flag.getX(native.face.a)&&region){counts.positive++;if(!accepted)counts.bad++;
if(counts.positive%12===0)for(const dx of [-.0005,.0005])for(const dy of [-.0005,.0005])for(const dz of [-.0005,.0005]){counts.corners++;const q=new T.Vector3(hc[1]+dx,hc[2]+dy,hc[3]+dz),corner=new T.Raycaster(o,q.sub(o).normalize(),0,40).intersectObject(g.avatar.mesh,false)[0];if(!corner||!flag.getX(corner.face.a))counts.cornerBad++;}
}else if(!flag.getX(native.face.a)){counts.negative++;if(region)counts.falseHeads++;const first=C.rifleSkullEntry(id,state,shot.o,shot.d);if(first!==null&&first>native.distance+.001){counts.hidden++;const q=o.clone().addScaledVector(d,first).toArray().map(v=>Math.round(v*1000)/1000),forged={...shot,hc:[1,...q]};if(C.rifleHeadAfterTurnFrontRegion(id,state,q,shot.o,shot.d)&&C.rifleHeadContact(id,state,forged,shot.o,40,4,false,options)){counts.falseHidden++;if(details.length<10)details.push({id,key,mode,at,base,native:native.point.toArray(),hc:forged.hc})}}}
}g.dispose();ghosts.others.delete(id);if(performance.now()>deadline)break poses;}
await saveCheckpoint({models,counts,details});if(performance.now()>deadline)return{models,counts,details,timeout:true};}
return{models,counts,details,timeout:false};};
},{i,worker});}
const [a,b]=pages;let grid;
if(gridProofPath==="--protocol-only"){console.log("SCOPED protocol-only integration: no geometry-grid execution or replay acceptance");grid=null;}
else if(gridProofPath){
  const rawData=JSON.parse(fs.readFileSync(gridProofPath,'utf8'));
  if(rawData.kind==='lunden-native-manifest'){
    const verified=loadVerifiedNativeManifest(gridProofPath,{
      expectedPhase:'rifle-turn-front-grid',
      expectedDriver:'tools/rifleturnfronttest.cjs',
      artifactsDir:path.dirname(gridProofPath)
    });
    grid=verified.rawResult;
    fs.writeFileSync(`${out}/grid-reuse.json`,JSON.stringify(verified.reuseRecord,null,2));
  }else{
    const proof=rawData,s=fs.readFileSync(__filename,'utf8'),pa=s.indexOf('window.grid=async()=>{'),pb=s.indexOf('\n},{i,worker});}',pa),now=sourceHashes();delete now['tools/rifleturnfronttest.cjs'];
    if(proof.kind!=='measured-grid-phase-only'||proof.completed!==true||proof.gridFunctionSha256!==crypto.createHash('sha256').update(s.slice(pa,pb)).digest('hex')||JSON.stringify(Object.keys(now).sort())!==JSON.stringify(Object.keys(proof.productionHashes).sort())||Object.keys(now).some(f=>now[f]!==proof.productionHashes[f]))throw Error('Stale/incomplete/mismatched grid-phase proof');
    grid=proof.parity;
    fs.writeFileSync(`${out}/grid-reuse.json`,JSON.stringify({path:gridProofPath,kind:proof.kind,producerWholeCLI:proof.producerWholeCLI,producerWholeCompleted:proof.producerWholeCompleted,gridFunctionSha256:proof.gridFunctionSha256,productionPaths:Object.keys(now).length},null,2));
  }
}else{
  grid=await a.evaluate(()=>grid());
  fs.writeFileSync(`${out}/parity.json`,JSON.stringify(grid,null,2));
  const manifest=createNativeManifest({
    phase:'rifle-turn-front-grid',
    driver:'tools/rifleturnfronttest.cjs',
    canonicalMatrix:{
      variants:60,styles:4,builds:3,heights:[.95,.975,1,1.025,1.05],
      poses:[0,.8,3.14,-1.6],modes:['rifle','saber'],delays:[-100,0,600]
    },
    rawResult:grid,
    exitCode:0,
    completed:true,
    timeout:grid.timeout===true,
    artifacts:{'parity.json':`${out}/parity.json`},
    skippedDescription:'native CPU raycast grid measurement (3000 iterations across 60 appearances)'
  });
  saveNativeManifest(`${out}/native-manifest.json`,manifest);
}
if(grid!==null){fs.writeFileSync(`${out}/parity.json`,JSON.stringify(grid,null,2));console.log(JSON.stringify(grid));const expected=[];for(let style=0;style<4;style++)for(let build=0;build<3;build++)for(const tall of [.95,.975,1,1.025,1.05])expected.push([style,build,tall].join('/'));check(grid.models.length===60&&!grid.timeout&&expected.every(k=>grid.models.includes(k)),'finite actual Ghost matrix includes all exact 60 canonical appearances');check(grid.counts.positive>1000&&grid.counts.bad===0,'accepted tiny-turn/intermediate/paused actual nearest Skull points retain pure server entry');check(grid.counts.negative>1000&&grid.counts.falseHeads===0&&grid.counts.hidden>1000&&grid.counts.falseHidden===0,'actual earlier-other surfaces and independently forged FIRST pureSkull remain unsupported');check(grid.counts.corners>1000&&grid.counts.cornerBad===0,'independent eight rounded-cell corner rays stay on actual nearest Skull');}
await startOwnedWorker(worker,out);await Promise.all(pages.map(p=>p.evaluate(()=>{enabled=true;tick=setInterval(()=>{ghosts.update();combat.update(0)},35)})));await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().have)));
// A yaw-only .01 change is below the original .03 send threshold. A REAL ordinary weapon change carries it.
await b.evaluate(()=>{heading=.01;weapon="saber"});await a.waitForFunction(()=>peer().snaps.at(-1).r===.01);await b.evaluate(()=>weapon="rifle");await a.waitForFunction(()=>peer().h==="rifle");await a.waitForFunction(()=>peer().speed<.01);await a.waitForTimeout(650);check(await a.evaluate(()=>aimFront()),'actual Combat obtains supported original nearest-skinned contact after accepted turn');
const shotRecords=[];const shoot=async (n,kind="body")=>{
await a.waitForFunction(()=>performance.now()-ghosts.lastSent>=ghosts.rules.weapons.rifle.every*1000+30);
const before=await a.evaluate(kind=>{const aim=kind==="head"?aimFront():aimBody();if(!aim)throw Error("No bounded native "+kind+" aim in current actual frame");const q=combat.rifleContact();const g=peer(),state={p:g.feet.toArray(),r:g.snaps.at(-1).r},hc=q.hc?[1,...q.hc.slice(1).map(v=>Math.round(v*1000)/1000)]:null;const snapshot={chosenAim:aim,look:g.avatar.look,state,regionRaw:q.hc?C.rifleHeadAfterTurnFrontRegion(g.id,state,q.hc.slice(1),q.o.toArray(),q.d.toArray()):false,regionRounded:hc?C.rifleHeadAfterTurnFrontRegion(g.id,state,hc.slice(1),q.o.toArray(),q.d.toArray()):false,pureRounded:hc?C.rifleHeadContact(g.id,state,{t:'a',w:'rifle',o:q.o.toArray(),d:q.d.toArray(),hc},position,ghosts.rules.weapons.rifle.range,4,false,{allowFront:false,allowRear:false,allowAfterTurnFront:true}):false,contact:q.target?.id??null,hc:q.hc,camera:camera.position.toArray(),direction:camera.getWorldDirection(new T.Vector3()).toArray(),sent:structuredClone(ghosts.sent),weapon,peer:ghosts.list(),outbox:structuredClone(ghosts.outbox),qcount,wireCount:wires.length};if(!q.target)throw Error("Current native aim is a miss");combat.fire("rifle");return snapshot},kind);
if(!before.contact)throw Error('Actual native miss has no receipt target: '+JSON.stringify(before));await a.waitForFunction(n=>wires.length>=n,n);const q=await a.evaluate(()=>qcount);await a.evaluate(()=>ghosts.ws.send('p'));await a.waitForFunction(q=>qcount>q,q);
const after=await a.evaluate(()=>({acks:structuredClone(acks),wires:structuredClone(wires),outbox:structuredClone(ghosts.outbox),sent:structuredClone(ghosts.sent),peer:ghosts.list()})),receiver=await b.evaluate(()=>({sent:structuredClone(ghosts.sent),weapon,hurts:structuredClone(hurts),lives:combat.lives}));shotRecords.push({n,before,after,receiver});fs.writeFileSync(`${out}/shot-records.json`,JSON.stringify(shotRecords,null,2));
if(process.argv.includes('--diagnose-body')&&n===2)throw Error('Intentional diagnostic stop AFTER ordered second-shot processing barrier');
await a.waitForFunction(n=>acks.length===n,n);
};await shoot(1,"head");const initialHp=process.argv.includes("--diagnose-body")?await a.evaluate(()=>acks[0].l):8;await b.waitForFunction(hp=>combat.lives===hp,initialHp);await a.waitForFunction(hp=>peer().lives===hp,initialHp);const first=await a.evaluate(()=>({ack:acks[0],wire:combat.lastShot}));fs.writeFileSync(`${out}/first-shot.json`,JSON.stringify(first,null,2));check(first.ack.head===true&&first.ack.l===8&&first.ack.award.points===5,'fresh real Worker confirms new after-turn 2HP and one normal award');
await a.evaluate(()=>combat.hit(acks[0],peer()));check(await a.evaluate(()=>effects===1&&markers.length===1),'actual head acknowledgment replay is idempotent');
const bodyAim=await a.evaluate(()=>aimBody());check(!!bodyAim,'bounded actual torso native contact has target and no head metadata');if(!bodyAim)throw Error('No actual supported torso aim; not waiting for a miss receipt');await shoot(2);check(await a.evaluate(()=>acks[1].l===7&&!acks[1].head),'native torso contact remains body1');
// Existing real body hit path leaves exactly1HP; then verified corridor head yields one overkill/reset/kill.
for(let n=3;n<=8;n++)await shoot(n);await b.waitForFunction(()=>combat.lives===1);check(await a.evaluate(()=>aimFront()),'supported after-turn head remains available before actual lethal hit');await shoot(9,"head");await b.waitForFunction(()=>deaths===1);check(await a.evaluate(()=>acks[8].head&&acks[8].dead&&acks[8].l===-1&&!!acks[8].kill&&acks[8].award.seq===9),'one low-life death/kill UUID/award follows true corridor head');check(await b.evaluate(()=>hurts.filter(m=>m.dead).length===1&&combat.lives===combat.maxLives),'actual shared life reducer resets once');await a.evaluate(()=>combat.hit(acks[8],peer()));check(await a.evaluate(()=>effects===9&&markers.length===9),'lethal replay adds no marker or hit effects');
await a.evaluate(()=>clearInterval(tick));await b.evaluate(()=>heading=3.14);await a.waitForFunction(()=>peer().snaps.at(-1).r===3.14);await a.waitForTimeout(650); // existing server quiet slot only, NEVER completed-draw evidence
const largeTurn=await a.evaluate(()=>{const g=peer(),l=g.avatar.look,w=[.93,1,1.08][l.build],state={p:g.feet.toArray(),r:3.14};g.draw(performance.now(),camera.position);g.root.updateMatrixWorld(true);
for(const x of [-.066,-.067,-.068,.066,.067,.068])for(const y of [.088,.09,.092])for(const distance of [3,4]){
 const target=new T.Vector3(-x*w,(C.PVP_RIFLE_HEAD.headY+y)*l.tall,-.08*w).applyAxisAngle(new T.Vector3(0,1,0),3.14).add(g.feet),o=target.clone().add(new T.Vector3(0,0,-distance).applyAxisAngle(new T.Vector3(0,1,0),3.14));o.set(...o.toArray().map(v=>Math.round(v*100)/100));const raw=target.clone().sub(o).normalize();raw.set(...raw.toArray().map(v=>Math.round(v*1000)/1000));const d=raw.clone().normalize(),hit=new T.Raycaster(o,d,0,40).intersectObject(g.avatar.mesh,false)[0],entry=C.rifleSkullEntry(g.id,state,o.toArray(),raw.toArray());
 if(!hit||entry===null||!g.avatar.mesh.geometry.attributes.rifleNose.getX(hit.face.a)||entry<=hit.distance+.001)continue;
 const hc=[1,...o.clone().addScaledVector(d,entry).toArray().map(v=>Math.round(v*1000)/1000)],shot={w:'rifle',to:g.id,o:o.toArray(),d:raw.toArray(),hc};
 if(!C.rifleHeadAfterTurnFrontRegion(g.id,state,hc.slice(1),shot.o,shot.d))continue;
 window.largeShot=shot;window.position=[o.x,g.feet.y,o.z];return{shot,actualHeading:g.root.rotation.y,body:g.body,native:hit.point.toArray(),nativeDistance:hit.distance,firstSkull:entry,nativeNose:true};
}return null;});check(!!largeTurn,'actual paused first draw at r2=3.14 reproduces nearer Nose before deeper canonical Skull');
if(!largeTurn)throw Error('No actual large-turn Nose-first proof in bounded native search');await a.evaluate(()=>{tick=setInterval(()=>{ghosts.update();combat.update(0)},35)});await a.waitForFunction(()=>ghosts.sent?.p[2]===position[2]);await a.evaluate(()=>ghosts.fire(largeShot));await a.waitForFunction(()=>acks.length===10);fs.writeFileSync(`${out}/large-turn-proof.json`,JSON.stringify({...largeTurn,ack:await a.evaluate(()=>acks[9])},null,2));check(await a.evaluate(()=>!acks[9].head&&acks[9].l===9),'fresh Worker blocks genuine Nose-first deeper Skull forgery after larger accepted turn');
await b.evaluate(()=>heading=.01);await a.waitForFunction(()=>peer().snaps.at(-1).r===.01);await a.evaluate(()=>position=[0,0,-4]);await a.waitForFunction(()=>ghosts.sent?.p[2]===-4);await a.waitForTimeout(650);await a.evaluate(()=>aimFront());await shoot(11,"head");check(await a.evaluate(()=>!acks[10].head&&acks[10].l===8),'escaping yaw corridor and returning stays body1, not timed restoration');

await a.waitForFunction(()=>performance.now()-ghosts.lastSent>=ghosts.rules.weapons.rifle.every*1000+30);await a.evaluate(w=>ghosts.fire({...w,hc:undefined}),first.wire);await a.waitForFunction(()=>acks.length===12);check(await a.evaluate(()=>!acks[11].head&&acks[11].l===7),'legacy contactless packet remains body1 after corridor escape');
// Same-WebSocket heartbeat is an ordered server-processing barrier, not a sleep or invented acknowledgment.
await a.waitForFunction(()=>performance.now()-ghosts.lastSent>=ghosts.rules.weapons.rifle.every*1000+30);const beforeQ=await a.evaluate(()=>qcount);await a.evaluate(w=>{ghosts.fire({...w,hc:undefined});ghosts.ws.send('p')},first.wire);await a.waitForFunction(n=>qcount>n,beforeQ);check(await a.evaluate(()=>acks.length===12&&effects===12),'exact60/min normal award cap rejects the next hit without a new effect');

const wires=await a.evaluate(()=>wires);fs.writeFileSync(`${out}/wires.json`,JSON.stringify(wires,null,2));check(wires.every(w=>w.bytes<=256&&w.shot.o.every(v=>Math.abs(v*100-Math.round(v*100))<1e-6)&&w.shot.d.every(v=>Math.abs(v*1000-Math.round(v*1000))<1e-6)),'actual serialized packet retains r2 origin/r3 direction and256-byte cap');
await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;const p=document.createElement('pre');p.id='turn-proof';p.textContent=['Actual native Ghosts/Combat + fresh Worker','Accepted tiny turn: head2, HP '+acks[0].l,'Torso: body1, HP '+acks[1].l,'Lethal: HP '+acks[8].l+', ONE kill receipt','Escaped then returned: body1, HP '+acks[10].l,'Only bounded first-yaw corridor; no timer restoration'].join('\n');p.style.cssText='position:fixed;left:20px;top:290px;padding:18px;background:#182535;color:white;font:16px/1.5 system-ui';document.body.append(p)});check(await a.evaluate(()=>{const r=document.getElementById('turn-proof').getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight&&!combat.hitMarker.el.hidden}),'actual marker and proof rows visibly fit original native HUD');await a.screenshot({path:`${out}/after-turn-front-native.png`});
const current=sourceHashes(),changed=Object.keys(frozen).filter(p=>current[p]!==frozen[p]);check(changed.length===0,'executed runtime and driver source freeze stays exact');check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls');completed=true;
}finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.ws?.close()}).catch(()=>{});await browser.close();await stopOwnedWorker();check(errors.length===0,'zero actual page errors');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,completed},null,2));}console.log(`ALL ${failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
