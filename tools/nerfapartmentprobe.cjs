// Actual apartment collision/render integration probe for #715. No test mode.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/probe node tools/nerfapartmentprobe.cjs http://localhost:8873
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const base=process.argv[2]||'http://localhost:8873';
const pictureOnly=process.argv.includes('--picture-only');
const cacheAcceptance=process.argv.includes('--cache-acceptance');
if(cacheAcceptance&&pictureOnly)throw Error('Select one apartment probe mode');
const output=process.env.SHOTS||'/tmp/lunden-nerf-apartment';
const fs=require('node:fs');fs.mkdirSync(output,{recursive:true});
const {ArtifactCheckpoint}=require('./artifactcheckpoint.cjs');
const {createHash}=require('node:crypto');
const checkpoint=cacheAcceptance?new ArtifactCheckpoint({output,mode:'ordinary-quality0-registration-only-loop-pause',scenario:'post-scheduler-30s-apartment-cache-native-parity',sources:['tools/nerfapartmentprobe.cjs','tools/artifactcheckpoint.cjs','index.html','src/main.js','src/combatworld.js','src/config.js','src/toys.js','src/marks.js','src/detail.js','data/plan.json'],sourceTrees:['src']}):null;
if(checkpoint)process.once('exit',code=>checkpoint.finish(code));
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
let page;const errors=[];
try {
checkpoint?.resourcesAcquired();
page=await browser.newPage({viewport:pictureOnly?{width:960,height:600}:{width:480,height:300},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
await page.exposeFunction('__probeCheckpoint',checkpoint=>{fs.writeFileSync(path.join(output,'checkpoint.json'),JSON.stringify({...checkpoint,errors},null,2));console.log('checkpoint',checkpoint.stage,checkpoint.records?.length||0);});
checkpoint?.snapshot('served-source', {browserVersion:browser.version(),originalMainSha256:createHash('sha256').update(mainSource).digest('hex'),servedMainSha256:createHash('sha256').update(mainSource.replace(loop,'renderer.setAnimationLoop(null);')).digest('hex'),hook:loop,replacement:'renderer.setAnimationLoop(null);'});
await page.route('**/src/main.js', route=>route.fulfill({contentType:'application/javascript',body:mainSource.replace(loop,'renderer.setAnimationLoop(null);')}));
await page.goto(`${base}/index.html?shot&quality=0&mp=0&time=12&weather=clear&mess=0`);await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:180000});
await page.evaluate(()=>window.__app.renderer.setAnimationLoop(null));
console.log('constructed');
if(cacheAcceptance){await runCacheAcceptance(page,checkpoint,errors);return;}
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
}finally{clearTimeout(deadline);await browser.close();checkpoint?.cleanupComplete();}})().catch(e=>{console.error(e);process.exitCode=1});


// Finite current-app acceptance: native cache callbacks continue while only the app loop is paused.
function finalSourceProof(evidence) {
 const root=path.resolve(__dirname,'..'),provenance=evidence.state.provenance,files={},treeHashes={},mismatches=[];
 for(const [name,hash] of Object.entries(provenance.files)){files[name]=createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');if(files[name]!==hash)mismatches.push(name);}
 for(const [tree,expected] of Object.entries(provenance.treeHashes)){const hash=createHash('sha256');let count=0;const walk=folder=>{for(const entry of fs.readdirSync(path.join(root,folder),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.name.startsWith('.'))continue;const name=path.posix.join(folder,entry.name);if(entry.isDirectory())walk(name);else if(entry.isFile()&&/\.(?:js|mjs)$/.test(name)){hash.update(name+'\0').update(fs.readFileSync(path.join(root,name))).update('\0');count++;}}};walk(tree);treeHashes[tree]={sha256:hash.digest('hex'),files:count};if(JSON.stringify(treeHashes[tree])!==JSON.stringify(expected))mismatches.push(tree+'/**');}
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();if(revision!==provenance.revision)mismatches.push('source revision');
 const fullTrackedHashes=hashes(),sourceMismatchPaths=Object.keys(frozen).filter(name=>fullTrackedHashes[name]!==frozen[name]);mismatches.push(...sourceMismatchPaths);
 return {revision,files,treeHashes,mismatches:[...new Set(mismatches)],fullTrackedHashes,sourceMismatchPaths};
}
async function runCacheAcceptance(page, evidence, pageErrors) {
 const records=[],checks=[];const check=(ok,label)=>{checks.push({ok,label});};
 await page.evaluate(async()=>{
  const a=window.__app;a.player.spawn(4.4,9,90);a.player.pos.y=3.25;a.player.eyeY=4.87;
  for(let i=0;i<3;i++)a.step(1/60);a.toys.blasters[1].take();a.toys.blasters[1].tick(1);
  a.camera.rotation.set(0,Math.PI/2,0,'YXZ');a.scene.updateMatrixWorld(true);
  window.__cacheAcceptanceStarted=performance.now();
 });
 const snapshot=()=>page.evaluate(async()=>{
  const W=await import('/src/combatworld.js'),a=window.__app,geometries=new Set();let meshes=0;
  a.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.geometry)geometries.add(o.geometry);}});
  const states={uniqueGeometries:geometries.size,meshes,pending:0,spatialReady:0,bitmapReady:0,valid:0,positionsPending:0,trianglesPending:0};
  for(const g of geometries){const s=W.combatWorldState(g);states.pending+=s.pending;states.spatialReady+=s.spatialReady;states.bitmapReady+=s.ready;states.valid+=s.valid;if(s.pending){states.positionsPending+=g.attributes.position?.count??0;states.trianglesPending+=Math.floor((g.index?.count??g.attributes.position?.count??0)/3);}}
  return {elapsedMs:performance.now()-window.__cacheAcceptanceStarted,metrics:W.combatWorldMetrics(),states,quality:a.quality.level,testMode:!!a.testMode,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,covers:{loading:!document.getElementById('loading').hidden&&getComputedStyle(document.getElementById('loading')).display!=='none',menu:!document.getElementById('overlay').hidden}};
 });
 const rays=()=>page.evaluate(async()=>{
  const T=await import('three'),W=await import('/src/combatworld.js'),a=window.__app,y=a.toys.blasters[1].where().y;const rows=[];
  const accepts=o=>{if(!o?.isMesh||o.material?.transparent||o.material?.visible===false)return false;for(let p=o;p;p=p.parent)if(!p.visible||p===window.__ghosts.group||p===a.camera||p.userData.moving)return false;return true;};
  const vector=(u,v)=>u==null||v==null?u==null&&v==null:u.distanceTo(v)<1e-7;
  for(const [origin,direction,length] of [[[3,y,9.12],[1,0,0],3],[[4.4,4.87,9],[-1,0,0],4],[[4.4,4.87,9],[0,-1,0],3]]){
   const ray=new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction),0,length);ray.camera=a.camera;ray.layers.mask=a.camera.layers.mask;
   const native=ray.intersectObjects(a.scene.children,true).filter(h=>accepts(h.object)),actual=W.combatWorldHits(a.scene,window.__ghosts.group,a.camera,ray);
   const equal=native.length===actual.length&&native.every((h,i)=>{const v=actual[i];return h.object===v.object&&h.instanceId===v.instanceId&&h.faceIndex===v.faceIndex&&h.face?.a===v.face?.a&&h.face?.b===v.face?.b&&h.face?.c===v.face?.c&&h.face?.materialIndex===v.face?.materialIndex&&Math.abs(h.distance-v.distance)<1e-7&&vector(h.point,v.point)&&vector(h.normal,v.normal)&&vector(h.uv,v.uv)&&vector(h.uv1,v.uv1);});
   rows.push({origin,direction,length,nativeHits:native.length,actualHits:actual.length,equal,nearest:native[0]&&{distance:native[0].distance,point:native[0].point.toArray(),faceIndex:native[0].faceIndex}});
  }
  return rows;
 });
 const initial=await snapshot();evidence.snapshot('initial-cache',initial);records.push({phase:'initial',...initial});
 const before=await rays();evidence.snapshot('native-rays-before',before);check(before.every(r=>r.equal),'three initial solid rays match independent native object/face/material/point/normal/UV/distance');
 const schedulerWindow=await page.evaluate(async()=>{const start=performance.now();await new Promise(resolve=>setTimeout(resolve,30000));return {elapsedMs:performance.now()-start};});
 const after=await snapshot();evidence.snapshot('after-native-30s', {schedulerWindow,...after});records.push({phase:'after-native-30s',...after});
 const afterRays=await rays();evidence.snapshot('native-rays-after',afterRays);check(afterRays.every(r=>r.equal),'three post-window solid rays retain independent native metadata');
 check([...before,...afterRays].some(r=>r.nativeHits>0),'native ray parity includes actual solid hits');
 check(initial.metrics.spatialEntries>0,'actual constructed scene has admitted spatial cache entries');
 check(after.metrics.spatialReady>=initial.metrics.spatialReady&&after.metrics.buildCpuMs>=initial.metrics.buildCpuMs,'native scheduler progress is monotonic in unchanged scene');
 check(after.states.pending===after.metrics.pending&&after.states.spatialReady===after.metrics.spatialReady&&after.states.bitmapReady===after.metrics.ready,'scene cache state counts agree with aggregate metrics');
 check(schedulerWindow.elapsedMs>=30000,'native scheduler receives actual bounded 30-second window');
 const effects=await page.evaluate(async()=>{
  const T=await import('three'),W=await import('/src/combatworld.js'),a=window.__app,d=a.toys.darts,c=window.__combat,y=a.toys.blasters[1].where().y;
  d.hide();a.marks.update(100);a.marks.invalidate(a.scene);a.toys.blasters[1].cool=0;a.toys.blasters[1].use();c.remote({w:'nerf',o:[3,y,9.12],d:[1,.03,0],s:25},{h:'nerf',id:'diagnostic-peer',root:new T.Group()});d.list[(d.next-1)%d.list.length].remote.life=600;
  const updates=[],active=[];for(let i=0;i<60;i++){const start=performance.now();d.update(1/60);a.marks.update(1/60);updates.push(performance.now()-start);active.push(d.list.filter(v=>v.flying).length);}
  const start=performance.now(),blocked=await W.combatWorldPathBlocked(a.scene,window.__ghosts.group,a.camera,[new T.Vector3(3,y,9.12),new T.Vector3(4,y,9.12)],a.camera.layers,{deadline:start+2000});
  return {updates,active,pendingEffects:c.nerfPending.length,splashes:d.splashes,obstacle:{result:blocked,elapsedMs:performance.now()-start,metrics:W.combatWorldMetrics()}};
 });evidence.snapshot('actual-two-source-effects-and-obstacle',effects);
 check(effects.active.some(n=>n>=2),'actual local and incoming Darts fly together');check(effects.pendingEffects===0,'same-browser injected remote effect has no pending player approval');
 const picture=await page.evaluate(async()=>{
  const T=await import('three'),{QUALITY}=await import('/src/config.js'),a=window.__app,d=a.toys.darts,c=window.__combat,y=a.toys.blasters[1].where().y;
  d.hide();a.toys.blasters[1].cool=0;a.toys.blasters[1].use();c.remote({w:'nerf',o:[3,y,9.12],d:[1,.03,0],s:25},{h:'nerf',id:'diagnostic-peer',root:new T.Group()});d.update(1/60);a.scene.updateMatrixWorld(true);
  const draws=[];for(let i=0;i<2;i++){a.detail().update(a.camera);const mirror=a.updateReflections(a.camera,a.player.aloft?-1:Math.max(0,a.player.level),QUALITY.mirror[a.quality.level]>0&&!a.warm.blocksView,true),start=performance.now();a.renderer.render(a.scene,a.camera);draws.push({elapsedMs:performance.now()-start,calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles,mirror:!!mirror});}
  a.renderer.getContext().finish();return {draws,quality:a.quality.level,testMode:!!a.testMode,viewport:[innerWidth,innerHeight],covers:{loading:!document.getElementById('loading').hidden&&getComputedStyle(document.getElementById('loading')).display!=='none',menu:!document.getElementById('overlay').hidden},visibleDarts:d.list.filter(v=>v.g.visible).map(v=>({children:v.g.children.length,childMeshes:v.g.children.map(m=>!!m.isMesh),layers:v.g.children.map(m=>m.layers.test(a.camera.layers)),pos:v.g.position.toArray(),ndc:v.g.position.clone().project(a.camera).toArray(),remote:!!v.remote}))};
 });evidence.snapshot('final-render-and-inview',picture);
 check(picture.quality===0&&!picture.testMode,'ordinary production quality zero without test mode');check(picture.viewport[0]===480&&picture.viewport[1]===300,'authored 480x300 viewport retained');check(!picture.covers.loading&&!picture.covers.menu,'loading/menu covers remain hidden');
 check(picture.visibleDarts.length===2&&picture.visibleDarts.some(v=>v.remote)&&picture.visibleDarts.some(v=>!v.remote)&&picture.visibleDarts.reduce((count,v)=>count+v.children,0)===4&&picture.visibleDarts.every(v=>v.children===2&&v.childMeshes.length===2&&v.childMeshes.every(Boolean)&&v.layers.length===2&&v.layers.every(Boolean)&&v.ndc.every(n=>Math.abs(n)<1)),'two actual darts each have body/tip meshes (four total), render layers and in-frustum positions');
 check(picture.draws.every(v=>!v.mirror),'production quality-zero mirror policy remains disabled');
 check(pageErrors.length===0,'no real browser page errors');
 check(initial.dpr===1&&after.dpr===1,'native DPR stays one');
 const sourceProof=finalSourceProof(evidence);evidence.snapshot('final-source-and-browser-errors',{sourceProof,errors:pageErrors.slice()});
 check(sourceProof.mismatches.length===0,'executed source revision and whitelisted files/src tree stay frozen');
 const result={checks,records,before,afterRays,schedulerWindow,effects,picture,errors:pageErrors.slice(),sourceProof};
 evidence.logicComplete(result,checks.every(v=>v.ok));if(checks.some(v=>!v.ok))throw Error('Actual apartment cache acceptance failed; inspect checkpoint');
 const cdp=await page.context().newCDPSession(page);
 try{await evidence.capture('actual-apartment-two-darts','apartment-two-darts.png',async()=>{
  let timer;try{const result=await Promise.race([cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native CDP PNG capture timed out')),15000);})]);
   const bytes=Buffer.from(result.data,'base64');if(bytes.readUInt32BE(16)!==480||bytes.readUInt32BE(20)!==300)throw Error('Native PNG dimensions differ from authored viewport');fs.writeFileSync(path.join(output,'apartment-two-darts.png'),bytes);
  }finally{clearTimeout(timer);}
 });evidence.imagesComplete();if(pageErrors.length)throw Error('Browser page errors after native capture');}finally{await cdp.detach();}
 console.log('CACHE ACCEPTANCE DONE',checks.length,checks.every(v=>v.ok),records.map(v=>({phase:v.phase,pending:v.metrics.pending,spatialReady:v.metrics.spatialReady,bitmapReady:v.metrics.ready})));
}
