// #931 extra-front actual Avatar/Ghosts/Combat + Worker, no apartment/WebGL. game worker artifacts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let ownedWorker,workerLog;
const sourcePaths=()=>[...new Set([...execFileSync('git',['ls-files','src','cloudflare','index.html'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>/\.(js|mjs|html)$/.test(p)&&!p.endsWith('.test.mjs')),'tools/riflefronttest.cjs'])];
const sourceHashes=()=>Object.fromEntries(sourcePaths().map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
function ownsPort(pid,port){if(process.platform!=='linux')throw Error('owned Worker socket provenance currently requires Linux /proc');const sockets=new Set(fs.readdirSync(`/proc/${pid}/fd`).flatMap(fd=>{try{const m=fs.readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/);return m?[m[1]]:[];}catch{return[];}}));return ['tcp','tcp6'].some(n=>fs.readFileSync(`/proc/net/${n}`,'utf8').split('\n').slice(1).some(row=>{const c=row.trim().split(/\s+/);return c[3]==='0A'&&parseInt(c[1]?.split(':')[1],16)===port&&sockets.has(c[9]);}));}
async function startOwnedWorker(url,out){const u=new URL(url);if(!['localhost','127.0.0.1'].includes(u.hostname))throw Error('external/stale Worker forbidden');const hashes=sourceHashes();workerLog=fs.createWriteStream(`${out}/owned-worker.log`);ownedWorker=spawn(process.execPath,['cloudflare/dev.mjs',u.port],{cwd:root,detached:true,stdio:['ignore','pipe','pipe']});ownedWorker.stdout.pipe(workerLog);ownedWorker.stderr.pipe(workerLog,{end:false});for(let i=0;i<100;i++){if(ownedWorker.exitCode!==null)throw Error('fresh Worker exited before socket ownership');try{if(ownsPort(ownedWorker.pid,+u.port)){const current=sourceHashes(),changed=Object.keys(hashes).filter(p=>current[p]!==hashes[p]);if(changed.length)throw Error('server modules changed during fresh boot');fs.writeFileSync(`${out}/worker-provenance.json`,JSON.stringify({pid:ownedWorker.pid,port:+u.port,cwd:root,ownedListeningSocket:true,hashes},null,2));return hashes;}}catch(e){if(!e.message.includes('ENOENT'))throw e;}await new Promise(r=>setTimeout(r,50));}throw Error('fresh owned Worker bind timeout');}
async function stopOwnedWorker(){if(!ownedWorker)return;try{process.kill(-ownedWorker.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await Promise.race([new Promise(r=>ownedWorker.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);workerLog?.end();}

const [game='http://localhost:8878',worker='http://localhost:8879',out='/tmp/lunden-rifle-front',inventory]=process.argv.slice(2);
function replayGrid(proofPath){const p=JSON.parse(fs.readFileSync(proofPath)),s=fs.readFileSync(__filename,'utf8'),a=s.indexOf('\nwindow.proof=async()=>{')+1,b=s.indexOf('\n};',a)+3,current=sourceHashes();delete current['tools/riflefronttest.cjs'];if(p.kind!=='measured-grid-phase-only'||p.completed!==true||p.failures!==0||p.gridFunctionSha256!==crypto.createHash('sha256').update(s.slice(a,b)).digest('hex')||JSON.stringify(Object.keys(current).sort())!==JSON.stringify(Object.keys(p.productionHashes).sort())||Object.keys(current).some(k=>current[k]!==p.productionHashes[k]))throw Error('inventory replay provenance mismatch/incomplete');const r=p.parity;const expected=[];for(let style=0;style<4;style++)for(let build=0;build<3;build++)for(const tall of [.95,.975,1,1.025,1.05])expected.push([style,build,tall].join('/'));if(JSON.stringify(Object.keys(r.support??{}).sort())!==JSON.stringify(expected.sort())||['positive','negative','hidden'].some((k,i)=>Object.values(r.support).reduce((sum,v)=>sum+v[k],0)!==r[['eligible','negative','hidden'][i]])||r.shapeError>=1e-6||r.variants!==60||r.bad||r.falseHeads||r.hiddenHeads||r.details.length||r.eligible<=800||r.negative<=500||r.hidden<=100||r.oblique<=100||!Object.values(r.support).every(x=>x.positive>0))throw Error('inventory replay failed/incomplete');return r;}
let checks=0,failures=0,completed=false; const check=(ok,text)=>{checks++;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${text}`);};
(async()=>{
fs.mkdirSync(out,{recursive:true});const frozen=await startOwnedWorker(worker,out);const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});const errors=[],pages=[];
try{
for(let i=0;i<2;i++){
const p=await browser.newPage({viewport:{width:850,height:500}});pages.push(p);await p.exposeFunction('gridProgress',r=>fs.writeFileSync(`${out}/grid-progress.json`,JSON.stringify(r)));await p.exposeFunction('horizontalProgress',r=>fs.writeFileSync(`${out}/horizontal-progress.json`,JSON.stringify(r)));p.on('pageerror',e=>errors.push(e.message));
await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native actual modules only'}));await p.goto(game);
const setup=async({worker,i})=>{
const context=HTMLCanvasElement.prototype.getContext;window.gl=0;HTMLCanvasElement.prototype.getContext=function(k,...args){if(/webgl/i.test(k)){gl++;throw Error('WebGL forbidden');}return context.call(this,k,...args);};
window.T=await import('three');window.config=await import('/src/config.js');window.Avatar=(await import('/src/avatar.js')).Avatar;
const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);window.position=[0,0,i?0:-4];window.crouched=false;window.weapon='rifle';
camera.position.set(...position);camera.position.y=1.62;camera.lookAt(0,1.62,i?-4:0);camera.updateMatrixWorld();
window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Head Target':'Rifle Shooter',active:()=>true,weapon:()=>weapon,score:()=>0,mirrored:()=>false,state:()=>({p:position,r:0,c:crouched})});
window.sentPackets=[];const originalSend=WebSocket.prototype.send;WebSocket.prototype.send=function(data){sentPackets.push(data);return originalSend.call(this,data);};
window.acks=[];window.hurts=[];window.markers=[];window.effects=0;window.deaths=0;window.remoteShots=0;
window.combat=new Combat({scene,camera,ghosts,weapon:()=>weapon,feet:()=>new T.Vector3(...position),onHit:()=>effects++,onDie:()=>deaths++,sfx:{}});
const originalShot=ghosts.onShot;ghosts.onShot=(m,g)=>{remoteShots++;originalShot?.(m,g);};
const hit=ghosts.onHit,hurt=ghosts.onHurt;ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onHurt=(m,g)=>{hurts.push(structuredClone(m));hurt(m,g);};
const mark=combat.hitMarker.show.bind(combat.hitMarker);combat.hitMarker.show=m=>{markers.push(m.head===true);mark(m);};
window.tick=setInterval(()=>{ghosts.update();combat.update(0);},35);
window.peer=()=>[...ghosts.others.values()][0];
window.aimAt=(y,x)=>{camera.position.set(0,1.62,-4);camera.lookAt(x??(-.068*[.93,1,1.08][peer().avatar.look.build]),y,0);camera.updateMatrixWorld();};
window.proof=async()=>{
 let eligible=0,bad=0,maxResidual=0,shapeError=0,negative=0,falseHeads=0,hidden=0,hiddenHeads=0,oblique=0;const variants=new Set(),details=[],support={};
 for(let seed=0;seed<10000&&variants.size<60;seed++){
  const id='front-'+seed,lk=config.avatarLook(id),key=lk.style+'/'+lk.build+'/'+lk.tall;if(variants.has(key))continue;variants.add(key);
  const a=new Avatar(id),root=new T.Group();root.add(a.object);const width=[.93,1,1.08][lk.build],flag=a.mesh.geometry.attributes.rifleSkull,array=a.mesh.geometry.attributes.position,actual=[];
  for(let j=0;j<flag.count;j++)if(flag.getX(j))actual.push([array.getX(j),array.getY(j)-1.54,array.getZ(j)]);
  const canonical=config.rifleSkullProfile().flat();if(actual.length!==canonical.length)throw Error('actual skull topology mismatch');for(let j=0;j<actual.length;j++)for(let axis=0;axis<3;axis++)shapeError=Math.max(shapeError,Math.abs(actual[j][axis]-canonical[j][axis]));
  support[key]={positive:0,negative:0,hidden:0};
  for(const time of [0,.4,2,5]){if(time)a.update(time,{speed:0});for(const yaw of [0,.8,Math.PI,-1.6]){
   root.rotation.y=yaw;root.updateMatrixWorld(true);const state={p:[0,0,0],r:yaw},targets=[];
   for(const xx of [-.064,-.068,-.072,.064,.068,.072])for(const yy of [.082,.09,.10])targets.push({xx,yy,tilt:0});
   for(const xx of [-.077,-.074,-.068,-.062,-.059,0,.059,.062,.068,.074,.077])for(const yy of [.03,.05,.06,.076,.08,.084,.088,.092,.096,.10,.104,.108,.13,.155,.18])targets.push({xx,yy,tilt:0});
   for(const xx of [-.064,-.068,-.072,.064,.068,.072])for(const yy of [.078,.09,.105])for(const tilt of [-1,-.27,-.23,.23,.27,1])targets.push({xx,yy,tilt});
   for(const {xx,yy,tilt} of targets){
    const point=new T.Vector3(-xx*width,(config.PVP_RIFLE_HEAD.headY+yy)*lk.tall,-.09*width).applyAxisAngle(new T.Vector3(0,1,0),yaw),delta=new T.Vector3(0,tilt,-3).applyAxisAngle(new T.Vector3(0,1,0),yaw);
    const origin=point.clone().add(delta);origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));const direction=point.clone().sub(origin).normalize();direction.set(...direction.toArray().map(v=>Math.round(v*1000)/1000));
    const native=new T.Raycaster(origin,direction.clone().normalize(),0,40).intersectObject(a.mesh,false)[0];if(!native)continue;
    const hc=[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)],shot={t:'a',w:'rifle',o:origin.toArray(),d:direction.toArray(),hc};
    const front=config.rifleHeadFrontRegion(id,state,hc.slice(1),shot.o,shot.d),skull=!!flag.getX(native.face.a),along=new T.Vector3(...hc.slice(1)).sub(origin).dot(direction.clone().normalize()),entry=config.rifleSkullEntry(id,state,shot.o,shot.d);
    if(front&&skull){eligible++;support[key].positive++;const error=Math.abs(entry-along);maxResidual=Math.max(maxResidual,error);if(!config.rifleHeadContact(id,state,shot,shot.o,40,4)){bad++;if(details.length<12)details.push({bad:true,key,time,yaw,xx,yy,tilt,hc,error});}}
    else{negative++;support[key].negative++;if(front&&config.rifleHeadContact(id,state,shot,shot.o,40,4)){falseHeads++;if(details.length<12)details.push({negative:true,key,time,yaw,xx,yy,tilt,hc,skull});}}
    if(tilt)oblique++;
    if(!skull&&entry!==null){const forged=[1,...origin.clone().addScaledVector(direction.clone().normalize(),entry).toArray().map(v=>Math.round(v*1000)/1000)];hidden++;support[key].hidden++;if(config.rifleHeadFrontRegion(id,state,forged.slice(1),shot.o,shot.d)&&config.rifleHeadContact(id,state,{...shot,hc:forged},shot.o,40,4)){hiddenHeads++;if(details.length<12)details.push({hidden:true,key,time,yaw,xx,yy,tilt,forged,native:hc});}}
   }
  }}a.dispose();await window.gridProgress?.({variants:variants.size,eligible,bad,negative,falseHeads,hidden,hiddenHeads});await new Promise(resolve=>setTimeout(resolve,0));
 }return{eligible,bad,negative,falseHeads,hidden,hiddenHeads,oblique,maxResidual,shapeError,variants:variants.size,support,details};
};
window.horizontalProof=async()=>{
 let eligible=0,bad=0,maxResidual=0,shapeError=0,negative=0,falseHeads=0,hidden=0,hiddenHeads=0,oblique=0;const variants=new Set(),details=[],support={};
 for(let seed=0;seed<10000&&variants.size<60;seed++){
  const id='front-'+seed,lk=config.avatarLook(id),key=lk.style+'/'+lk.build+'/'+lk.tall;if(variants.has(key))continue;variants.add(key);
  const a=new Avatar(id),root=new T.Group();root.add(a.object);const width=[.93,1,1.08][lk.build],flag=a.mesh.geometry.attributes.rifleSkull,array=a.mesh.geometry.attributes.position,actual=[];
  for(let j=0;j<flag.count;j++)if(flag.getX(j))actual.push([array.getX(j),array.getY(j)-1.54,array.getZ(j)]);
  const canonical=config.rifleSkullProfile().flat();if(actual.length!==canonical.length)throw Error('actual skull topology mismatch');for(let j=0;j<actual.length;j++)for(let axis=0;axis<3;axis++)shapeError=Math.max(shapeError,Math.abs(actual[j][axis]-canonical[j][axis]));
  support[key]={positive:0,negative:0,hidden:0};
  for(const time of [0,.4,2,5]){if(time)a.update(time,{speed:0});for(const yaw of [0,.8,Math.PI,-1.6]){
   root.rotation.y=yaw;root.updateMatrixWorld(true);const state={p:[0,0,0],r:yaw},targets=[];
   for(const xx of [-.064,-.068,-.072,.064,.068,.072])for(const yy of [.082,.09,.10]){
    for(const side of [-1,-.27,-.23,-.1,.1,.23,.27,1])targets.push({xx,yy,tilt:0,side});
    for(const side of [-.23,.23])for(const tilt of [-.23,.23])targets.push({xx,yy,tilt,side});
   }
   // Independent nearer-face/hair/hat/body negative rays, not only exposed ROI targets.
   for(const xx of [-.077,-.068,0,.068,.077])for(const yy of [.05,.076,.08,.10,.108,.13,.18])for(const side of [-.23,.23])targets.push({xx,yy,tilt:0,side});
   for(const {xx,yy,tilt,side} of targets){
    const point=new T.Vector3(-xx*width,(config.PVP_RIFLE_HEAD.headY+yy)*lk.tall,-.09*width).applyAxisAngle(new T.Vector3(0,1,0),yaw),delta=new T.Vector3(side,tilt,-3).applyAxisAngle(new T.Vector3(0,1,0),yaw);
    const origin=point.clone().add(delta);origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));const direction=point.clone().sub(origin).normalize();direction.set(...direction.toArray().map(v=>Math.round(v*1000)/1000));
    const native=new T.Raycaster(origin,direction.clone().normalize(),0,40).intersectObject(a.mesh,false)[0];if(!native)continue;
    const hc=[1,...native.point.toArray().map(v=>Math.round(v*1000)/1000)],shot={t:'a',w:'rifle',o:origin.toArray(),d:direction.toArray(),hc};
    const front=config.rifleHeadFrontRegion(id,state,hc.slice(1),shot.o,shot.d),skull=!!flag.getX(native.face.a),along=new T.Vector3(...hc.slice(1)).sub(origin).dot(direction.clone().normalize()),entry=config.rifleSkullEntry(id,state,shot.o,shot.d);
    if(front&&skull){eligible++;support[key].positive++;const error=Math.abs(entry-along);maxResidual=Math.max(maxResidual,error);if(!config.rifleHeadContact(id,state,shot,shot.o,40,4)){bad++;if(details.length<12)details.push({bad:true,key,time,yaw,xx,yy,tilt,hc,error});}}
    else{negative++;support[key].negative++;if(front&&config.rifleHeadContact(id,state,shot,shot.o,40,4)){falseHeads++;if(details.length<12)details.push({negative:true,key,time,yaw,xx,yy,tilt,hc,skull});}}
    if(tilt||side)oblique++;
    if(!skull&&entry!==null){const forged=[1,...origin.clone().addScaledVector(direction.clone().normalize(),entry).toArray().map(v=>Math.round(v*1000)/1000)];hidden++;support[key].hidden++;if(config.rifleHeadFrontRegion(id,state,forged.slice(1),shot.o,shot.d)&&config.rifleHeadContact(id,state,{...shot,hc:forged},shot.o,40,4)){hiddenHeads++;if(details.length<12)details.push({hidden:true,key,time,yaw,xx,yy,tilt,forged,native:hc});}}
   }
  }}a.dispose();await window.horizontalProgress?.({variants:variants.size,eligible,bad,negative,falseHeads,hidden,hiddenHeads});await new Promise(resolve=>setTimeout(resolve,0));
 }return{eligible,bad,negative,falseHeads,hidden,hiddenHeads,oblique,maxResidual,shapeError,variants:variants.size,support,details};
};
window.cornerProof=async()=>{
 let cells=0,corners=0,bad=0,maxPositive=0;const keys=new Set(),details=[];
 for(let n=0;n<10000&&keys.size<60;n++){
 const id='front-'+n,look=config.avatarLook(id),key=[look.style,look.build,look.tall].join('/');if(keys.has(key))continue;keys.add(key);const av=new Avatar(id),group=new T.Group();group.add(av.object);const w=[.93,1,1.08][look.build],flag=av.mesh.geometry.attributes.rifleSkull;
 for(const time of [0,.4,2,5]){if(time)av.update(time,{speed:0});for(const yaw of [0,.8,Math.PI,-1.6]){group.rotation.y=yaw;group.updateMatrixWorld(true);for(const shift of (time===0&&yaw===0?[[0,0,0],[4990,4980,4990],[-4990,-4980,-4990]]:[[0,0,0]])){group.position.set(...shift);group.updateMatrixWorld(true);const state={p:shift,r:yaw};
 for(const x of [-.068,.068]){
 const target=new T.Vector3(-x*w,(config.PVP_RIFLE_HEAD.headY+.09)*look.tall,-.09*w).applyAxisAngle(new T.Vector3(0,1,0),yaw).add(new T.Vector3(...shift)),origin=target.clone().add(new T.Vector3(0,0,-3).applyAxisAngle(new T.Vector3(0,1,0),yaw));origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));const d=target.clone().sub(origin).normalize();d.set(...d.toArray().map(v=>Math.round(v*1000)/1000));const hit=new T.Raycaster(origin,d.clone().normalize(),0,40).intersectObject(av.mesh,false)[0];if(!hit)continue;const hc=hit.point.toArray().map(v=>Math.round(v*1000)/1000);if(!flag.getX(hit.face.a)||!config.rifleHeadFrontRegion(id,state,hc,origin.toArray(),d.toArray()))continue;cells++;
 for(const dx of [-.0005,.0005])for(const dy of [-.0005,.0005])for(const dz of [-.0005,.0005]){
 const corner=new T.Vector3(...hc).add(new T.Vector3(dx,dy,dz)),ray=corner.clone().sub(origin).normalize(),nearest=new T.Raycaster(origin,ray,0,40).intersectObject(av.mesh,false)[0];corners++;if(!nearest||!flag.getX(nearest.face.a)){bad++;if(details.length<12)details.push({key,time,yaw,x,hc,corner:corner.toArray(),tag:nearest?.face.a});}
 }
 }}group.position.set(0,0,0); } }av.dispose();await new Promise(r=>setTimeout(r,0));
 }return{variants:keys.size,cells,corners,bad,details};
};

};await p.evaluate(setup,{worker,i});p.setupNative=()=>p.evaluate(setup,{worker,i});
}
const [a,b]=pages;await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
await a.waitForFunction(()=>peer().speed<.01&&(peer().avatar.gait??0)<.01);
const parity=inventory?replayGrid(inventory):await a.evaluate(()=>proof());console.log(inventory?'REPLAY measured grid phase from supplied manifest; no new inventory measurement':'MEASURE full native grid');fs.writeFileSync(`${out}/parity.json`,JSON.stringify(parity,null,2));
check(parity.eligible>800&&parity.variants===60&&parity.shapeError<1e-6,'actual native skin raycasts cover all60 style/build/height variants; pure actual vertex parity and standing/bind poses');
check(parity.bad===0,`v1 first-surface tolerance covers sampled ACTUAL nearest head contacts (max ${parity.maxResidual.toFixed(5)}m, bad ${parity.bad})`);
check(parity.negative>500&&parity.falseHeads===0,'extra-front branch never promotes unsupported nearest face/jaw/hair/outside-patch contacts');
check(parity.hidden>100&&parity.hiddenHeads===0,'forged pureSkull behind nearer real hair/face/body is rejected in front branch');check(parity.oblique>100&&Object.values(parity.support).every(x=>x.positive>0),'all60 supported front variants have actual positive contacts plus oblique rejection coverage');console.log(JSON.stringify(parity));
const horizontal=await a.evaluate(()=>horizontalProof());fs.writeFileSync(`${out}/horizontal.json`,JSON.stringify(horizontal,null,2));check(horizontal.variants===60&&horizontal.eligible>100&&horizontal.bad===0&&horizontal.falseHeads===0&&horizontal.hidden>100&&horizontal.hiddenHeads===0&&Object.values(horizontal.support).every(x=>x.positive>0),'actual horizontal/diagonal cone-domain exposed skull and hidden-forgery inventory passes all60 appearances/poses/headings');
// Fresh production constructors after inventory: ordinary 120s idle is never overridden.
for(const p of pages){await p.reload();await p.setupNative();}
await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
const corners=await a.evaluate(()=>cornerProof());fs.writeFileSync(`${out}/corners.json`,JSON.stringify(corners,null,2));check(corners.variants===60&&corners.cells>500&&corners.corners===corners.cells*8&&corners.bad===0,'actual nearest skull remains supported for eight projected r3-cell corners across60 appearances/poses/headings');
await a.waitForTimeout(600);
const y=await a.evaluate(()=>(config.PVP_RIFLE_HEAD.headY+.09)*peer().avatar.look.tall);
await a.evaluate(y=>aimAt(y),y);
await a.waitForFunction(()=>ghosts.connected&&peer()?.speed<.01&&(peer().avatar.gait??0)<.01);
const shoot=async count=>{await a.evaluate(()=>combat.fire('rifle'));fs.writeFileSync(`${out}/shot-${count}.json`,JSON.stringify(await a.evaluate(()=>({senderId:ghosts.me,serializedShots:sentPackets.filter(s=>{try{return JSON.parse(s).t==='a';}catch{return false;}}),lastShot:combat.lastShot,acks,foes:combat.foes().map(g=>({id:g.id,h:g.h,feet:g.feet.toArray(),look:g.avatar.look,speed:g.speed,latestForwardedState:g.snaps.at(-1)})),connected:ghosts.connected})),null,2));await a.waitForFunction(n=>acks.length===n,count);};
await shoot(1);
const first=await a.evaluate(()=>({ack:acks[0],wire:combat.lastShot,hits:combat.hits,effects,markers:[...markers]}));
check(first.ack.head===true&&first.ack.l===8&&first.ack.award.points===5&&first.wire.hc[0]===1,'actual extra-front SkinnedMesh head contact confirms 2 HP plus one normal award');
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
await a.evaluate(()=>{const hud=document.getElementById('hud');hud.hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;document.getElementById('native-head-proof')?.remove();const pre=document.createElement('pre');pre.id='native-head-proof';pre.textContent=['Native actual modules (no WebGL)',`Head: ${acks[0].head}, HP ${acks[0].l}, reward ${acks[0].award.points}`,`Body: ${acks[1].head===true}, HP ${acks[1].l}`,`Lethal: HP ${acks.at(-1).l}, dead ${acks.at(-1).dead}`,`Kill receipt: ${!!acks.at(-1).kill}`,`Effects: ${effects}, marker shows: ${markers.length}`,`Server connection: ${ghosts.connected}`].join('\n');pre.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:16px/1.6 system-ui';document.body.append(pre);});
check(await a.evaluate(()=>{const p=document.getElementById('native-head-proof').getBoundingClientRect();return p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight&&combat.hitMarker.el.textContent==='Huvudträff!'&&!combat.hitMarker.el.hidden;}),'actual authoritative head marker and measured proof rows visibly fit native viewport');
const current=sourceHashes(),changed=Object.keys(frozen).filter(p=>current[p]!==frozen[p]);check(changed.length===0,'fresh-owned Worker/client source freeze remains unchanged');fs.writeFileSync(`${out}/pre-capture.json`,JSON.stringify({checks,failures,changed,frozen},null,2));await a.screenshot({path:`${out}/rifle-head-native.png`});
check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL calls in actual-module protocol/DOM evidence');completed=true;

}finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.ws?.close();}).catch(()=>{});await browser.close();await stopOwnedWorker();check(errors.length===0,'zero native page errors');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,completed},null,2));}
console.log(`ALL ${failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length?1:0;
})().catch(async e=>{console.error(e);await stopOwnedWorker();process.exitCode=1;});
