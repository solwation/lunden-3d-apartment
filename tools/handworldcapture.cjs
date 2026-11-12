// Actual main/World first-person reach and held Cup, no frame-rate claim.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {startOwnedWorker}=require('./workerfixture.cjs');
const [base='http://localhost:8200',out='docs/verification/1917/world']=process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true});const result={status:'running',errors:[],scope:'Actual main/World, local Worker, fixed FOV72, quality1, res=light, noon/June. Fixture teleports before posing; refreshes matrices/detail before the real game frame. No native GPU/phone/FPS timing.'};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
 const sources=['src/hand.js','src/config.js','src/main.js','src/cups.js'];
 const hashes=()=>Object.fromEntries(sources.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
 const frozenHashes=hashes();
 const worker=await startOwnedWorker(8202,{root:process.cwd(),outDir:path.join(out,'worker')});let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1000,height:700},deviceScaleFactor:1});
  page.on('pageerror',e=>{result.errors.push(e.message);console.error('PAGEERROR',e.message)});
  await page.addInitScript(()=>{localStorage.setItem('lunden.name','Handprov');sessionStorage.setItem('lunden.nameSkipped','1');});
  await page.goto(base+'/?shot&quality=1&res=light&time=12&month=6&freeze&cloud=http://localhost:8202',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:150000,polling:100});
  console.log('READY actual World');
  result.reach=await page.evaluate(async()=>{
   const T=await import('three'),a=window.__app;a.showOverlay(false);a.hideLoading();a.renderer.setAnimationLoop(null);
   // Open living room, away from the narrow hall wall that can cover a camera-held item.
   a.player.spawn(2,10,0);a.player.pos.y=0;a.player.eyeY=1.6;a.step(0);a.frame(0);
   a.camera.position.set(2,1.6,10);a.camera.rotation.set(0,0,0);a.camera.fov=72;a.camera.updateProjectionMatrix();a.camera.updateMatrixWorld(true);
   window.__handDraws=0;a.hand.hand.onBeforeRender=()=>window.__handDraws++;
   a.hand.reach(a.camera.localToWorld(new T.Vector3(.1,-.13,-.5)));a.hand.reachT=.5;
   for(let i=0;i<30;i++){a.hand.update(.016,null);a.hand.reachT=.5;}
   a.scene.updateMatrixWorld(true);a.detail().refresh();a.frame(0);
   return{handVisible:a.hand.visible,handDraws:window.__handDraws,layers:a.hand.hand.layers.mask,quality:a.quality.level,morphs:a.hand.hand.morphTargetInfluences.slice(),buffer:a.renderer.getDrawingBufferSize(new T.Vector2()).toArray(),pixelRatio:a.renderer.getPixelRatio(),fov:a.camera.fov,calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles};
  });
  if(!result.reach.handVisible||!result.reach.handDraws)throw Error('Main Hand reach not rendered');
  await page.screenshot({path:path.join(out,'reach.png')});
  result.cup=await page.evaluate(()=>{
   const a=window.__app,cup=a.cups.cups.find(c=>c.state!=='spare');if(!cup)throw Error('Actual cabinet cup missing');cup.take();
   window.__handDraws=0;window.__cupDraws=0;cup.model.traverse(o=>{if(o.isMesh)o.onBeforeRender=()=>window.__cupDraws++;});
   for(let i=0;i<30;i++){cup.update(.016);a.hand.update(.016,cup);}
   a.scene.updateMatrixWorld(true);a.detail().refresh();a.frame(0);
   return{held:cup.held,handVisible:a.hand.visible,handDraws:window.__handDraws,cupDraws:window.__cupDraws,attached:cup.model.parent===a.camera,morphs:a.hand.hand.morphTargetInfluences.slice(),calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles};
  });
  if(!result.cup.held||!result.cup.handVisible||!result.cup.attached||!result.cup.handDraws||!result.cup.cupDraws)throw Error('Actual main Cup/Hand integration failed');
  await page.screenshot({path:path.join(out,'cup.png')});
  if(result.errors.length)throw Error(result.errors.join('\n'));
  result.sourceHashes=hashes();
  if(JSON.stringify(result.sourceHashes)!==JSON.stringify(frozenHashes))throw Error('World sources changed during capture');
  result.status='passed';console.log('PASS actual main/World reach + held cupboard Cup, zero page errors.');
 }catch(e){result.status='failed';result.error=e.message;throw e;}
 finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();await worker.stop();}
})().catch(e=>{console.error(e);process.exitCode=1});
