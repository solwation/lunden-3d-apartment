// Actual apartment collision/render integration probe for #715. No test mode.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/probe node tools/nerfapartmentprobe.cjs http://localhost:8873
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const base=process.argv[2]||'http://localhost:8873';
const pictureOnly=process.argv.includes('--picture-only');
const output=process.env.SHOTS||'/tmp/lunden-nerf-apartment';
const fs=require('node:fs');fs.mkdirSync(output,{recursive:true});
const root=path.resolve(__dirname,'..');
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
const hashes=()=>Object.fromEntries(tracked.filter(p=>fs.existsSync(path.join(root,p))).map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
const frozen=hashes(),started=Date.now();
const provenance={base:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),started:new Date(started).toISOString(),driverPid:process.pid,pictureOnly,viewport:pictureOnly?[960,600]:[480,300],url:`${base}/index.html?shot&quality=0&mp=0&time=12&weather=clear&mess=0`,frozen};
fs.writeFileSync(path.join(output,'provenance.json'),JSON.stringify(provenance,null,2));
const mainSource=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'), loop='renderer.setAnimationLoop(() => frame(clock.getDelta()));';
if(mainSource.split(loop).length!==2) throw new Error('Native loop hook changed; review probe before running');
provenance.mainLoopHook={originalSha256:crypto.createHash('sha256').update(mainSource).digest('hex'),servedSha256:crypto.createHash('sha256').update(mainSource.replace(loop,'renderer.setAnimationLoop(null);')).digest('hex'),change:'only native animation-loop registration paused'};fs.writeFileSync(path.join(output,'provenance.json'),JSON.stringify(provenance,null,2));
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const exitRecord=()=>fs.writeFileSync(path.join(output,'completion.json'),JSON.stringify({code:process.exitCode||0,elapsedMs:Date.now()-started,ended:new Date().toISOString()},null,2));
process.on('exit',exitRecord);
const deadline=setTimeout(()=>{console.error('bounded driver timeout');process.exitCode=1;browser.close().finally(()=>process.exit(1));},Math.max(1,240000-(Date.now()-started)));
const page=await browser.newPage({viewport:pictureOnly?{width:960,height:600}:{width:480,height:300}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
await page.exposeFunction('__probeCheckpoint',checkpoint=>{fs.writeFileSync(path.join(output,'checkpoint.json'),JSON.stringify({...checkpoint,errors},null,2));console.log('checkpoint',checkpoint.stage,checkpoint.records?.length||0);});
await page.route('**/src/main.js', route=>route.fulfill({contentType:'application/javascript',body:mainSource.replace(loop,'renderer.setAnimationLoop(null);')}));
await page.goto(`${base}/index.html?shot&quality=0&mp=0&time=12&weather=clear&mess=0`);await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:180000});
await page.evaluate(()=>window.__app.renderer.setAnimationLoop(null));
console.log('constructed');
const result=await page.evaluate(async(pictureOnly)=>{
const T=await import('three');const W=await import('/src/combatworld.js');const {QUALITY}=await import('/src/config.js');const a=window.__app,d=a.toys.darts,c=window.__combat;
a.player.spawn(4.4,9,90);a.player.pos.y=3.25;a.player.eyeY=4.87;for(let i=0;i<3;i++)a.step(1/60);a.toys.blasters[1].take();a.toys.blasters[1].tick(1);a.camera.rotation.set(0,Math.PI/2,0,'YXZ');a.scene.updateMatrixWorld(true);
const incomingY=a.toys.blasters[1].where().y;
// This is cache-cold collision within one already constructed actual apartment.
a.marks.invalidate(a.scene); const records=[],cacheWindow={start:W.combatWorldMetrics(),requestedMs:30000};
await window.__probeCheckpoint({stage:'constructed',records,cacheWindow,testMode:!!a.testMode,pose:a.player.pos.toArray()});
// Transparent timing only for native shadow submission; no renderer/shadow/mirror policy is replaced.
const nativeShadow=a.renderer.shadowMap.render;let shadowCalls=[];
a.renderer.shadowMap.render=function(...args){const before={enabled:this.enabled,autoUpdate:this.autoUpdate,needsUpdate:this.needsUpdate,lights:args[0]?.length??null};const start=performance.now();try{return nativeShadow.apply(this,args);}finally{shadowCalls.push({...before,elapsedMs:performance.now()-start});}};
const render=()=>{a.detail()?.update(a.camera);const selected=a.updateReflections(a.camera,a.player.aloft?-1:Math.max(0,a.player.level),QUALITY.mirror[a.quality.level]>0,false);shadowCalls=[];const start=performance.now();a.renderer.render(a.scene,a.camera);const elapsedMs=performance.now()-start;return {elapsedMs,shadowCalls:shadowCalls.map(x=>({...x})),nonShadowCallWallMs:elapsedMs-shadowCalls.reduce((s,x)=>s+x.elapsedMs,0),mirrorSelected:selected,mirrors:a.reflectors().filter(m=>m.r.visible).map(m=>({name:m.name,held:!!m.r.hold})),quality:a.quality.level};};
for(const phase of pictureOnly?[]:['idle','one-cold','two-cold','one-local-retained','two-local-retained']){
 d.hide();a.marks.update(100);if(phase.endsWith('cold'))a.marks.invalidate(a.scene);
 if(phase==='one-local-retained'){const start=performance.now();cacheWindow.before= W.combatWorldMetrics();await new Promise(resolve=>setTimeout(resolve,30000));cacheWindow.elapsedMs=performance.now()-start;cacheWindow.after=W.combatWorldMetrics();await window.__probeCheckpoint({stage:'cache-window',records,cacheWindow});}
 const updates=[],renders=[],renderDetails=[],active=[],counts=[],metricsBefore=W.combatWorldMetrics(),updateWallStart=performance.now();
 for(let i=0;i<60;i++){
 if(i%12===0&&phase!=='idle'){
 a.toys.blasters[1].cool=0;a.toys.blasters[1].use();
 if(phase.startsWith('two')){c.remote({w:'nerf',o:[3.0,incomingY,9.12],d:[1,0.03,0],s:25},{h:'nerf',id:'diagnostic-peer',root:new T.Group()});d.list[(d.next-1)%d.list.length].remote.life=600;}
 }
 const start=performance.now();d.update(1/60);a.marks.update(1/60);updates.push(performance.now()-start);a.scene.updateMatrixWorld(true);
 // Fixed production quality 0. Render-call elapsed wall intervals are not thread CPU, GPU, frame or FPS measurements.
 // Two manual draws per phase; remote TTL is held at 600 s to prevent host-speed expiry.
 if(i===0||i===36){const detail=render();renders.push(detail.elapsedMs);renderDetails.push({step:i,...detail});}
 active.push(d.list.filter(x=>x.flying).length);counts.push({calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles});
 }
 records.push({phase,updates,renders,renderDetails,active,counts,phaseElapsedWallMs:performance.now()-updateWallStart,marksInvalidated:phase.endsWith('cold'),metricsBefore,pendingEffects:c.nerfPending.length,splashes:d.splashes,final:d.list.filter(x=>x.g.visible).map(x=>({remote:!!x.remote,pos:x.g.position.toArray(),flying:x.flying,spent:x.spent})),metrics:W.combatWorldMetrics()});await window.__probeCheckpoint({stage:phase,records,cacheWindow});
}
const obstacleStarted=performance.now();const obstacleResult=pictureOnly?null:await W.combatWorldPathBlocked(a.scene,window.__ghosts.group,a.camera,[new T.Vector3(3,incomingY,9.12),new T.Vector3(4,incomingY,9.12)],a.camera.layers,{deadline:obstacleStarted+2000});const obstacle={result:obstacleResult,elapsedMs:performance.now()-obstacleStarted,metrics:W.combatWorldMetrics()};
await window.__probeCheckpoint({stage:'obstacle-complete',records,cacheWindow,obstacle});
// Keep local and incoming in-flight effects for a separately reviewed quality0 picture.
d.hide();a.toys.blasters[1].cool=0;a.toys.blasters[1].use();c.remote({w:'nerf',o:[3,incomingY,9.12],d:[1,0.03,0],s:25},{h:'nerf',id:'diagnostic-peer',root:new T.Group()});d.update(1/60);a.scene.updateMatrixWorld(true);const captureRender=render();a.renderer.getContext().finish();a.renderer.shadowMap.render=nativeShadow;
return {records,cacheWindow,obstacle,captureRender,testMode:!!a.testMode,covers:{loadingVisible:!document.getElementById('loading').hidden&&getComputedStyle(document.getElementById('loading')).display!=='none',overlayVisible:!document.getElementById('overlay').hidden},camera:a.camera.position.toArray(),incomingY,renderer:a.renderer.getContext().getParameter(a.renderer.getContext().RENDERER),quality:a.quality.level,viewport:[innerWidth,innerHeight],visibleDarts:d.list.filter(x=>x.g.visible).map(x=>({layers:x.g.children.map(mesh=>mesh.layers.test(a.camera.layers)),pos:x.g.position.toArray(),ndc:x.g.position.clone().project(a.camera).toArray(),remote:!!x.remote})),errors:[]};
},pictureOnly);
console.log('evaluated');result.errors=errors;result.elapsedMs=Date.now()-started;const after=hashes();result.sourceMismatchPaths=Object.keys(frozen).filter(p=>after[p]!==frozen[p]);result.measuredBase=provenance.base;result.url=provenance.url;fs.writeFileSync(path.join(output,pictureOnly?'picture-result.json':'result.json'),JSON.stringify(result,null,2));
if(result.testMode||result.covers.loadingVisible||result.covers.overlayVisible||result.sourceMismatchPaths.length||errors.length||result.visibleDarts.length!==2||!result.visibleDarts.every(d=>d.layers.every(Boolean)&&Math.abs(d.ndc[0])<1&&Math.abs(d.ndc[1])<1&&Math.abs(d.ndc[2])<1)) throw new Error('Native in-view dart/layer preflight failed; see result.json');
await page.screenshot({path:path.join(output,'apartment-two-darts.png'),timeout:60000});console.log('DONE',result.records.map(r=>({phase:r.phase,maxUpdate:Math.max(...r.updates),total:r.updates.reduce((x,y)=>x+y),maxRender:Math.max(...r.renders)})),errors);
}finally{clearTimeout(deadline);await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
