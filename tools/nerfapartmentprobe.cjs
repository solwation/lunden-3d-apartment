// Actual apartment collision/render integration probe for #715. No test mode.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/probe node tools/nerfapartmentprobe.cjs http://localhost:8873
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');
const base=process.argv[2]||'http://localhost:8873';
const pictureOnly=process.argv.includes('--picture-only');
const output=process.env.SHOTS||'/tmp/lunden-nerf-apartment';
const fs=require('node:fs');fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const deadline=setTimeout(()=>{console.error('bounded driver timeout');browser.close().finally(()=>process.exit(1));},240000);
const page=await browser.newPage({viewport:pictureOnly?{width:960,height:600}:{width:480,height:300}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
const mainSource=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'), loop='renderer.setAnimationLoop(() => frame(clock.getDelta()));';
if(mainSource.split(loop).length!==2) throw new Error('Native loop hook changed; review probe before running');
await page.route('**/src/main.js', route=>route.fulfill({contentType:'application/javascript',body:mainSource.replace(loop,'renderer.setAnimationLoop(null);')}));
await page.goto(`${base}/index.html?shot&quality=0&mp=0&time=12&weather=clear&mess=0`);await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:180000});
await page.evaluate(()=>window.__app.renderer.setAnimationLoop(null));
console.log('constructed');
const result=await page.evaluate(async(pictureOnly)=>{
const T=await import('three');const W=await import('/src/combatworld.js');const a=window.__app,d=a.toys.darts,c=window.__combat;
a.player.spawn(4.4,9,90);a.player.pos.y=3.25;a.player.eyeY=4.87;for(let i=0;i<3;i++)a.step(1/60);a.toys.blasters[1].take();a.toys.blasters[1].tick(1);a.camera.rotation.set(0,Math.PI/2,0,'YXZ');a.scene.updateMatrixWorld(true);
const incomingY=a.toys.blasters[1].where().y;
// This is cache-cold collision within one already constructed actual apartment.
a.marks.invalidate(a.scene); const records=[];
for(const phase of pictureOnly?[]:['one-cold','two-cold','one-local-warm','two-local-warm']){
 d.hide();a.marks.update(100);if(phase.endsWith('cold'))a.marks.invalidate(a.scene);
 if(phase==='one-local-warm'){await new Promise(resolve=>setTimeout(resolve,1500));}
 const updates=[],renders=[],active=[],counts=[];
 for(let i=0;i<60;i++){
 if(i%12===0&&phase!=='idle'){
 a.toys.blasters[1].cool=0;a.toys.blasters[1].use();
 if(phase.startsWith('two')){c.remote({w:'nerf',o:[3.0,incomingY,9.12],d:[1,0.03,0],s:25},{h:'nerf',id:'diagnostic-peer',root:new T.Group()});d.list[(d.next-1)%d.list.length].remote.life=600;}
 }
 const start=performance.now();d.update(1/60);a.marks.update(1/60);updates.push(performance.now()-start);a.scene.updateMatrixWorld(true);
 // Fixed production quality 0. Render intervals are CPU submission walltime, not GPU/frame/FPS.
 // Two manual draws per phase; remote TTL is held at600s to prevent host-speed expiry.
 if(i===0||i===36){a.detail()?.update(a.camera);const rs=performance.now();a.renderer.render(a.scene,a.camera);renders.push(performance.now()-rs);}
 active.push(d.list.filter(x=>x.flying).length);counts.push({calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles});
 }
 records.push({phase,updates,renders,active,counts,pendingEffects:c.nerfPending.length,splashes:d.splashes,final:d.list.filter(x=>x.g.visible).map(x=>({remote:!!x.remote,pos:x.g.position.toArray(),flying:x.flying,spent:x.spent})),metrics:W.combatWorldMetrics()});
}
const obstacleStarted=performance.now();const obstacleResult=pictureOnly?null:await W.combatWorldPathBlocked(a.scene,window.__ghosts.group,a.camera,[new T.Vector3(3,incomingY,9.12),new T.Vector3(4,incomingY,9.12)],a.camera.layers,{deadline:obstacleStarted+2000});const obstacle={result:obstacleResult,elapsedMs:performance.now()-obstacleStarted,metrics:W.combatWorldMetrics()};
// Keep local and incoming in-flight effects for a separately reviewed quality0 picture.
d.hide();a.toys.blasters[1].cool=0;a.toys.blasters[1].use();c.remote({w:'nerf',o:[3,incomingY,9.12],d:[1,0.03,0],s:25},{h:'nerf',id:'diagnostic-peer',root:new T.Group()});d.update(1/60);a.scene.updateMatrixWorld(true);a.detail()?.update(a.camera);a.renderer.render(a.scene,a.camera);a.renderer.getContext().finish();
return {records,obstacle,camera:a.camera.position.toArray(),incomingY,renderer:a.renderer.getContext().getParameter(a.renderer.getContext().RENDERER),quality:a.quality.level,viewport:[innerWidth,innerHeight],visibleDarts:d.list.filter(x=>x.g.visible).map(x=>({layers:x.g.children.map(mesh=>mesh.layers.test(a.camera.layers)),pos:x.g.position.toArray(),ndc:x.g.position.clone().project(a.camera).toArray(),remote:!!x.remote})),errors:[]};
},pictureOnly);
console.log('evaluated');result.errors=errors;fs.writeFileSync(path.join(output,pictureOnly?'picture-result.json':'result.json'),JSON.stringify(result,null,2));
if(errors.length||result.visibleDarts.length!==2||!result.visibleDarts.every(d=>d.layers.every(Boolean)&&Math.abs(d.ndc[0])<1&&Math.abs(d.ndc[1])<1&&Math.abs(d.ndc[2])<1)) throw new Error('Native in-view dart/layer preflight failed; see result.json');
await page.screenshot({path:path.join(output,'apartment-two-darts.png'),timeout:60000});console.log('DONE',result.records.map(r=>({phase:r.phase,maxUpdate:Math.max(...r.updates),total:r.updates.reduce((x,y)=>x+y),maxRender:Math.max(...r.renders)})),errors);
}finally{clearTimeout(deadline);await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
