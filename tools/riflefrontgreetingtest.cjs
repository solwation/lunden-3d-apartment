// #943 bounded immutable after-greeting Front; actual Ghosts/Combat and fresh owned Worker, native DOM only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let ownedWorker,workerLog;
const sourcePaths=()=>[...new Set([...execFileSync('git',['ls-files','src','cloudflare','index.html'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(p=>/\.(js|mjs|html)$/.test(p)&&!p.endsWith('.test.mjs')),'tools/riflefrontgreetingtest.cjs'])];
const sourceHashes=()=>Object.fromEntries(sourcePaths().map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
function ownsPort(pid,port){if(process.platform!=='linux')throw Error('owned Worker socket provenance currently requires Linux /proc');const sockets=new Set(fs.readdirSync(`/proc/${pid}/fd`).flatMap(fd=>{try{const m=fs.readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/);return m?[m[1]]:[];}catch{return[];}}));return ['tcp','tcp6'].some(n=>fs.readFileSync(`/proc/net/${n}`,'utf8').split('\n').slice(1).some(row=>{const c=row.trim().split(/\s+/);return c[3]==='0A'&&parseInt(c[1]?.split(':')[1],16)===port&&sockets.has(c[9]);}));}
async function startOwnedWorker(url,out){const u=new URL(url);if(!['localhost','127.0.0.1'].includes(u.hostname))throw Error('external/stale Worker forbidden');const hashes=sourceHashes();workerLog=fs.createWriteStream(`${out}/owned-worker.log`);ownedWorker=spawn(process.execPath,['cloudflare/dev.mjs',u.port],{cwd:root,detached:true,stdio:['ignore','pipe','pipe']});ownedWorker.stdout.pipe(workerLog);ownedWorker.stderr.pipe(workerLog,{end:false});for(let i=0;i<100;i++){if(ownedWorker.exitCode!==null)throw Error('fresh Worker exited before socket ownership');try{if(ownsPort(ownedWorker.pid,+u.port)){const current=sourceHashes(),changed=Object.keys(hashes).filter(p=>current[p]!==hashes[p]);if(changed.length)throw Error('server modules changed during fresh boot');fs.writeFileSync(`${out}/worker-provenance.json`,JSON.stringify({pid:ownedWorker.pid,port:+u.port,cwd:root,ownedListeningSocket:true,hashes},null,2));return hashes;}}catch(e){if(!e.message.includes('ENOENT'))throw e;}await new Promise(r=>setTimeout(r,50));}throw Error('fresh owned Worker bind timeout');}
async function stopOwnedWorker(){if(!ownedWorker)return;try{process.kill(-ownedWorker.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}await Promise.race([new Promise(r=>ownedWorker.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);workerLog?.end();}

const [game='http://localhost:8878',worker='http://localhost:8879',out='/tmp/lunden-front-greeting',gridReplay]=process.argv.slice(2);
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
window.heading=0;window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);window.position=[0,0,i?0:-4];window.crouched=false;window.weapon='rifle';
camera.position.set(...position);camera.position.y=1.62;camera.lookAt(0,1.62,i?-4:0);camera.updateMatrixWorld();
window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Head Target':'Rifle Shooter',active:()=>true,weapon:()=>weapon,score:()=>0,mirrored:()=>false,state:()=>({p:position,r:heading,c:crouched})});
window.sentPackets=[];const originalSend=WebSocket.prototype.send;WebSocket.prototype.send=function(data){sentPackets.push(data);return originalSend.call(this,data);};
window.acks=[];window.hurts=[];window.markers=[];window.effects=0;window.deaths=0;window.remoteShots=0;
window.combat=new Combat({scene,camera,ghosts,weapon:()=>weapon,feet:()=>new T.Vector3(...position),onHit:()=>effects++,onDie:()=>deaths++,sfx:{}});
const originalShot=ghosts.onShot;ghosts.onShot=(m,g)=>{remoteShots++;originalShot?.(m,g);};
const hit=ghosts.onHit,hurt=ghosts.onHurt;ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onHurt=(m,g)=>{hurts.push(structuredClone(m));hurt(m,g);};
const mark=combat.hitMarker.show.bind(combat.hitMarker);combat.hitMarker.show=m=>{markers.push(m.head===true);mark(m);};
window.tick=setInterval(()=>{ghosts.update();combat.update(0);},35);
window.peer=()=>[...ghosts.others.values()][0];
window.aimAt=(y,x)=>{camera.position.set(0,1.62,-4);camera.lookAt(x??(-.068*[.93,1,1.08][peer().avatar.look.build]),y,0);camera.updateMatrixWorld();};
window.greetingProof=async()=>{
 const {Ghosts}=await import('/src/ghosts.js'),gs=new Ghosts({scene:new T.Scene(),camera:new T.PerspectiveCamera(),url:'',active:()=>true,weapon:()=> 'rifle',state:()=>({p:[0,0,-3],r:0})}),seen=new Set(),support={},details=[];
 let rays=0,positive=0,unsupported=0,hidden=0,bad=0,corners=0,cornerBad=0,maxResidual=0;
 const scenarios=[['rifle',0,16],['rifle',2,100],['saber',.15,16],['saber',.3,600],['wave',0,16],['wave',.4,100],['wave',1.3,600],['wave',2.6,16],['repeat',1.3,600],['delayed',.4,600]];
 for(let n=0;n<10000&&seen.size<60;n++){
 const id='front-'+n,look=config.avatarLook(id),key=[look.style,look.build,look.tall].join('/');if(seen.has(key))continue;seen.add(key);support[key]={positive:0,unsupported:0,hidden:0};const width=[.93,1,1.08][look.build];
 for(const yaw of [0,.8,3.14,-1.6])for(const [mode,phase,pause] of scenarios){
 const g=gs.add(id,'Standing');const held=mode==='saber'?'saber':'rifle';let t=1000;
 if(g.root.visible||g.snaps.length)throw Error('no-snapshot model must remain hidden');
 g.push({p:[0,0,0],r:yaw,h:held},t);g.setSolid(true);g.draw(t+config.GHOSTS.delay,new T.Vector3(0,1.62,-3));if(['wave','repeat','delayed'].includes(mode))g.wave();if(mode==='saber')g.swing();
 for(let elapsed=0;elapsed<phase-1e-8;elapsed+=.05){t+=50;g.draw(t+config.GHOSTS.delay,new T.Vector3(0,1.62,-3));}
 if(mode==='repeat')g.wave();if(mode==='delayed'){t+=6000;g.wave();}t+=200;g.push({p:[0,0,0],r:yaw,h:held},t);g.draw(t+config.GHOSTS.delay+pause,new T.Vector3(0,1.62,-3));g.root.updateMatrixWorld(true);
 const state={p:[0,0,0],r:yaw},flag=g.avatar.mesh.geometry.attributes.rifleSkull;
 // Useful family + independent wide earlier-surface/oblique negatives. Actual ray, never removal of occluders.
 const targets=[];for(const x of [-.068,.068])for(const y of [.088,.09,.092])targets.push([x,y,0,0]);
 for(const x of [-.095,-.077,-.060,-.03,0,.03,.060,.077,.095])for(const y of [.03,.065,.09,.12,.17])targets.push([x,y,0,0]);
 for(const x of [-.068,.068])for(const y of [.09])for(const slope of [-.15,-.07,-.03,.03,.07,.15])targets.push([x,y,slope,slope]);
 for(const [x,y,side,up] of targets){
 const point=new T.Vector3(-x*width,(config.PVP_RIFLE_HEAD.headY+y)*look.tall,-.09*width).applyAxisAngle(new T.Vector3(0,1,0),yaw),origin=point.clone().add(new T.Vector3(side*3,up*3,-3).applyAxisAngle(new T.Vector3(0,1,0),yaw));origin.set(...origin.toArray().map(v=>Math.round(v*100)/100));const d=point.clone().sub(origin).normalize();d.set(...d.toArray().map(v=>Math.round(v*1000)/1000));const u=d.clone().normalize(),hit=new T.Raycaster(origin,u,0,40).intersectObject(g.avatar.mesh,false)[0];if(!hit)continue;rays++;
 const hc=hit.point.toArray().map(v=>Math.round(v*1000)/1000),accepted=config.rifleHeadGreetingFrontRegion(id,state,hc,origin.toArray(),d.toArray()),isSkull=!!flag.getX(hit.face.a);
 if(accepted&&isSkull){positive++;support[key].positive++;const entry=config.rifleSkullEntry(id,state,origin.toArray(),d.toArray());maxResidual=Math.max(maxResidual,Math.abs(entry-u.dot(new T.Vector3(...hc).sub(origin))));
 if(mode==='wave'&&phase===0){for(const dx of [-.0005,.0005])for(const dy of [-.0005,.0005])for(const dz of [-.0005,.0005]){const corner=new T.Vector3(...hc).add(new T.Vector3(dx,dy,dz)),near=new T.Raycaster(origin,corner.clone().sub(origin).normalize(),0,40).intersectObject(g.avatar.mesh,false)[0];corners++;if(!near||!flag.getX(near.face.a))cornerBad++;}}
 }else if(!isSkull){unsupported++;support[key].unsupported++;if(accepted){bad++;if(details.length<12)details.push({key,mode,phase,pause,yaw,x,y,nearest:hit.point.toArray(),kind:'nearest-nonSkull'});}const entry=config.rifleSkullEntry(id,state,origin.toArray(),d.toArray());if(entry!==null){hidden++;support[key].hidden++;const forged=origin.clone().addScaledVector(u,entry).toArray().map(v=>Math.round(v*1000)/1000);if(config.rifleHeadGreetingFrontRegion(id,state,forged,origin.toArray(),d.toArray())){bad++;if(details.length<12)details.push({key,mode,phase,pause,yaw,x,y,nearest:hit.point.toArray(),forged,kind:'FIRSTpureSkull-hidden'});}}}
 }
 g.dispose();gs.others.delete(id);
 }
 await gridProgress({variants:seen.size,rays,positive,unsupported,hidden,bad,corners,cornerBad});await new Promise(r=>setTimeout(r,0));
 }
 return{variants:seen.size,rays,positive,unsupported,hidden,bad,corners,cornerBad,maxResidual,support,details};
};
};await p.evaluate(setup,{worker,i});p.setupNative=()=>p.evaluate(setup,{worker,i});
}
const [a,b]=pages;const grid=gridReplay?replayGreetingGrid(gridReplay):await a.evaluate(()=>greetingProof());console.log(gridReplay?'REUSE explicitly extracted clean grid phase; original whole run failed':'MEASURE fresh actual greeting grid');fs.writeFileSync(`${out}/grid.json`,JSON.stringify(grid,null,2));
check(grid.variants===60&&Object.values(grid.support).every(v=>v.positive>0),'actual after-greeting Front positives on all60 canonical variants and first-state headings');
check(grid.bad===0&&grid.unsupported>1000&&grid.hidden>100,'actual nearer hair/nose/face/arm/body and FIRST pureSkull forgeries failclosed');
check(grid.corners>1000&&grid.cornerBad===0&&grid.maxResidual<=configSurface(),'whole r3-cell actual8corner Skull contacts and unchanged15mm first-entry guard');
function configSurface(){return .015;}
for(const p of pages){await p.reload();await p.setupNative();}
await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
await a.waitForFunction(()=>peer().speed<.001&&(peer().avatar.gait??0)<.001);await a.waitForTimeout(650);
const aim=async()=>a.evaluate(()=>{
 const g=peer(),look=g.avatar.look,w=[.93,1,1.08][look.build];camera.position.set(0,1.62,-4);
 for(const xx of [-.068,.068,-.067,.067,-.069,.069])for(const yy of [.09,.088,.092]){
 const p=new T.Vector3(-xx*w,(config.PVP_RIFLE_HEAD.headY+yy)*look.tall,-.09*w);camera.lookAt(p);camera.updateMatrixWorld();const c=combat.rifleContact();
 if(c?.hc&&config.rifleHeadGreetingFrontRegion(g.id,{p:[g.feet.x,g.feet.y,g.feet.z],r:g.snaps.at(-1).r},c.hc.slice(1).map(v=>Math.round(v*1000)/1000),c.o.toArray(),c.d.toArray()))return{hc:c.hc,o:c.o.toArray(),d:c.d.toArray(),id:g.id};
 }throw Error('no actual bounded greeting-Front ray in current sampled phase');
});
const fire=async(n,head,l)=>{await a.waitForTimeout(300);await a.evaluate(()=>combat.fire('rifle'));await a.evaluate(()=>ghosts.sendShot());await a.waitForFunction(n=>acks.length===n,n);check(await a.evaluate(({n,head,l})=>acks[n-1].head=== (head?true:undefined)&&acks[n-1].l===l,{n,head,l}),`actual accepted receipt${n}: ${head?'head2':'body1'}, HP${l}`);};
await aim();await fire(1,true,8);
await a.evaluate(()=>clearInterval(tick));await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);await a.waitForTimeout(650);await a.evaluate(()=>{ghosts.update();scene.updateMatrixWorld(true);});const greetingWire=await aim();await fire(2,true,6);
check(await b.evaluate(()=>combat.lives===6)&&await a.evaluate(()=>peer().lives===6),'after-greeting head2 updates real public and self-health');
await a.waitForTimeout(3100);await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT===config.GHOSTS.wave);await a.evaluate(()=>{ghosts.update();scene.updateMatrixWorld(true);});await aim();await fire(3,true,4);
check(await a.evaluate(()=>peer().waveT>2&&peer().snaps.every(s=>s.r===0)),'repeated delayed wave capped first draw stays actual immutable pose, not elapsed settling');
await a.waitForTimeout(300);await a.evaluate(w=>ghosts.fire({...w,w:'rifle',to:w.id,hc:undefined}),greetingWire);await a.evaluate(()=>ghosts.sendShot());await a.waitForFunction(()=>acks.length===4);check(await a.evaluate(()=>!acks[3].head&&acks[3].l===3),'contact-less cached client remains body1 after greeting');
await a.waitForTimeout(300);await a.evaluate(w=>ghosts.fire({...w,w:'rifle',to:w.id,hc:[2,...w.hc.slice(1)]}),greetingWire);await a.evaluate(()=>ghosts.sendShot());await a.waitForFunction(()=>acks.length===5);check(await a.evaluate(()=>!acks[4].head&&acks[4].l===2),'forged unknown contact version remains body1');
await a.waitForTimeout(300);await a.evaluate(w=>ghosts.fire({...w,w:'rifle',to:w.id,hc:undefined}),greetingWire);await a.evaluate(()=>ghosts.sendShot());await a.waitForFunction(()=>acks.length===6);
await aim();await fire(7,true,-1);check(await a.evaluate(()=>acks[6].dead===true&&!!acks[6].kill&&acks[6].award.seq===7)&&await b.evaluate(()=>deaths===1&&combat.lives===combat.maxLives),'one real low-HP kill UUID/award/reset from after-greeting head2');await a.evaluate(()=>combat.hit(acks[6],peer()));check(await a.evaluate(()=>combat.hits===7&&effects===7&&markers.length===7),'lethal receipt replay adds no marker/hit/effect');
await a.evaluate(url=>{window.late=[];window.observer=new WebSocket(url.replace(/^http/,'ws')+'/players');observer.onmessage=e=>{if(e.data!=='q')late.push(JSON.parse(e.data));};},worker);await a.waitForFunction(()=>late.some(m=>m.t==='w'));check(await a.evaluate(()=>late.find(m=>m.t==='w').ps.every(s=>!('gt'in s)&&!('turned'in s)&&!('headPoseFixed'in s))),'late welcome carries public HP and no private history');await a.evaluate(()=>observer.close());
await b.evaluate(()=>{position=[.1,0,0];ghosts.update();});await a.waitForFunction(()=>peer().snaps.at(-1).p.x===.1);await a.waitForTimeout(650);await b.evaluate(()=>{position=[0,0,0];ghosts.update();});await a.waitForFunction(()=>peer().snaps.at(-1).p.x===0);await a.waitForTimeout(650);
await a.waitForTimeout(300);await a.evaluate(w=>ghosts.fire({...w,w:'rifle',to:w.id}),greetingWire);await a.evaluate(()=>ghosts.sendShot());await a.waitForFunction(()=>acks.length===8);check(await a.evaluate(()=>!acks[7].head&&acks[7].l===9),'accepted movement and return permanently block greeting-Front, even after quiet');
// Fresh socket and first real standing snapshot; cached state is synchronized before reconnect.
const old=await b.evaluate(()=>ghosts.me);await b.evaluate(()=>{ghosts.update();ghosts.disconnect();ghosts.connect();});await b.waitForFunction(id=>ghosts.connected&&ghosts.me!==id,old);await a.waitForFunction(id=>peer()?.id!==id&&peer()?.snaps.length,old);await a.evaluate(()=>{ghosts.update();scene.updateMatrixWorld(true);});await a.waitForTimeout(650);await b.evaluate(()=>ghosts.greet(peer()));await a.waitForFunction(()=>peer().waveT>0);await a.evaluate(()=>{ghosts.update();scene.updateMatrixWorld(true);});await aim();await fire(9,true,8);
const receipts=await a.evaluate(()=>({acks,markers,effects,lastShot:combat.lastShot,sent:sentPackets,publicHP:peer().lives}));fs.writeFileSync(`${out}/receipts.json`,JSON.stringify(receipts,null,2));check(receipts.acks.length===9&&receipts.acks.every(m=>m.award&&typeof m.award.seq==='number'),'real accepted award receipts retained for all nine shots');
await a.evaluate(()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;combat.el.hidden=false;const pre=document.createElement('pre');pre.id='greeting-proof';pre.textContent=['Actual immutable greeting-Front / Worker',`First head HP ${acks[0].l}`,`After greeting: head ${acks[1].head}, HP ${acks[1].l}`,`Repeat/delayed: head ${acks[2].head}, HP ${acks[2].l}`,`Legacy/version: body HP ${acks[3].l}/${acks[4].l}`,`One lethal UUID: ${!!acks[6].kill}`,`Moved/returned: body HP ${acks[7].l}`,`Fresh greeted socket: head ${acks[8].head}, HP ${acks[8].l}`].join('\n');pre.style.cssText='position:fixed;left:20px;top:120px;padding:18px;background:#182535;color:white;font:16px/1.5 system-ui';document.body.append(pre);});
check(await a.evaluate(()=>{const r=document.getElementById('greeting-proof').getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight&&!combat.hitMarker.el.hidden&&combat.hitMarker.el.textContent==='Huvudträff!';}),'actual head marker and greeting history rows fit HUD');
check(await a.evaluate(()=>gl===0)&&await b.evaluate(()=>gl===0),'zero WebGL in actual client/Worker native evidence');const current=sourceHashes(),changed=Object.keys(frozen).filter(k=>current[k]!==frozen[k]);check(changed.length===0,'fresh-owned runtime/driver source freeze remains exact');fs.writeFileSync(`${out}/pre-capture.json`,JSON.stringify({checks,failures,changed,frozen},null,2));await a.screenshot({path:`${out}/front-greeting-native.png`});completed=true;
}catch(e){for(let i=0;i<pages.length;i++)fs.writeFileSync(`${out}/failure-page-${i}.json`,JSON.stringify(await pages[i].evaluate(()=>({acks,hurts,lastShot:combat.lastShot,sentPackets,outbox:ghosts.outbox,lastSent:ghosts.lastSent,target:peer()?.id,targetState:peer()?.snaps.at(-1),armed:weapon})).catch(()=>null),null,2));throw e;}finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.ws?.close();}).catch(()=>{});await browser.close();await stopOwnedWorker();check(errors.length===0,'zero native page errors');fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,completed},null,2));}
console.log(`ALL ${failures?'FAIL':'PASS'} ${checks} checks`);process.exitCode=failures||errors.length?1:0;
})().catch(async e=>{console.error(e);await stopOwnedWorker();process.exitCode=1;});

function gridFunction(source){const a=source.indexOf('\nwindow.greetingProof=async()=>{')+1,b=source.indexOf('\n};',a)+3;if(a<1||b<3)throw Error('grid function locator failed');return source.slice(a,b);}
function replayGreetingGrid(file){
 const p=JSON.parse(fs.readFileSync(file)),current=sourceHashes();delete current['tools/riflefrontgreetingtest.cjs'];
 const functionHash=crypto.createHash('sha256').update(gridFunction(fs.readFileSync(__filename,'utf8'))).digest('hex');
 if(p.kind!=='clean-measured-greeting-grid-phase'||p.completed!==true||p.failures!==0||p.gridFunctionHash!==functionHash||JSON.stringify(Object.keys(current).sort())!==JSON.stringify(Object.keys(p.productionHashes).sort())||Object.keys(current).some(k=>current[k]!==p.productionHashes[k]))throw Error('greeting grid replay source/producer/incomplete mismatch');
 const g=p.grid,expected=[];for(let st=0;st<4;st++)for(let b=0;b<3;b++)for(const t of [.95,.975,1,1.025,1.05])expected.push([st,b,t].join('/'));
 if(g.variants!==60||JSON.stringify(Object.keys(g.support).sort())!==JSON.stringify(expected.sort())||!Object.values(g.support).every(v=>v.positive>0)||g.bad||g.cornerBad||g.details.length||g.maxResidual>.015||g.unsupported<1000||g.hidden<100||g.corners<1000||['positive','unsupported','hidden'].some(k=>Object.values(g.support).reduce((a,v)=>a+v[k],0)!==g[k]))throw Error('greeting grid replay incomplete/failed matrix');
 return g;
}
