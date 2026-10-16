// #1061: actual cat/holder/hands/audio and original main dispatch, bounded scene (no World).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://localhost:8941',out=process.argv[3]||'/tmp/lunden-cats1061';
fs.mkdirSync(out,{recursive:true});
const files=['src/cat.js','src/miele.js','src/holdable.js','src/hand.js','src/audio.js','src/main.js','src/config.js','tools/catcarrytest.cjs'];
const sources=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]));
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const errors=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:1000,height:760}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js*',r=>r.fulfill({body:'',contentType:'application/javascript'}));await page.goto(base+'/?cloud=');
 await page.evaluate(async()=>{
  const T=await import('three'),{CatSpawner,BREEDS}=await import('/src/cat.js'),{MieleHeld}=await import('/src/miele.js'),H=await import('/src/holdable.js'),{Hand}=await import('/src/hand.js'),A=await import('/src/audio.js');
  const scene=new T.Scene();scene.background=new T.Color(0xd8dedc);const camera=new T.PerspectiveCamera(58,1000/760,.01,20);camera.position.set(3,1.6,1);scene.add(camera);
  scene.add(new T.HemisphereLight(0xffffff,0x6b6350,3));const light=new T.DirectionalLight(0xffffff,2);light.position.set(1,5,4);scene.add(light);
  const floor=new T.Mesh(new T.PlaneGeometry(16,16),new T.MeshStandardMaterial({color:0xc0ac90}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const world={levels:[{segments:[]},{segments:[]}],doors:[]},cat=new CatSpawner(world,()=>.5);scene.add(cat.object);cat.setCat(BREEDS[0],BREEDS[0].coats[0]);
  const miele=new MieleHeld(scene,camera,cat),hand=new Hand(camera,scene),player={pos:camera.position.clone().setY(0)};cat.canHold=()=>!H.handBusy(miele);cat.watchPoint=()=>camera.position;
  miele.dropSpot=()=>new T.Vector3(3,0,0);A.initAudio();A.updateListener(camera);
  // Preserve exact main cat branch; desktop E and touch use the same production use(thing) branch.
  const main=await(await fetch('/src/main.js')).text(),body=main.match(/else if \(thing.kind === 'cat'\) \{ (.*?) \} \/\//)[1];
  const dispatch=new Function('cat','miele','heldItem','player',body),calls=[];
  const fhide=main.match(/  if \(!on && cat.visible && .*? cat.hide\(\);/)[0];
  const afterFurniture=new Function('on','cat',fhide);const originalPurr=A.sfx.purr,originalMeow=A.sfx.meow;
  A.sfx.purr=(...args)=>{const sound=originalPurr(...args);const record={kind:'purr',voice:args[3],position:args[0],stopped:false};calls.push(record);return{stop(){record.stopped=true;sound?.stop();}};};
  A.sfx.meow=(...args)=>{calls.push({kind:'meow',voice:args[2]});return originalMeow(...args);};
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,760);renderer.domElement.style.cssText='position:fixed;inset:0;z-index:1000';document.body.append(renderer.domElement);
  window.carry={T,BREEDS,scene,camera,cat,miele,hand,H,A,player,calls,renderer,afterFurniture,dispatch:()=>dispatch(cat,miele,H.heldItem,player),step(dt){cat.update(dt);miele.update(dt);hand.update(dt,H.heldItem());scene.updateMatrixWorld(true);},draw(){scene.updateMatrixWorld(true);renderer.render(scene,camera);},spawn(breed,kitten){cat.hide();cat.setCat(breed,breed.coats[0],kitten);cat.catName=cat.isMiele?'Miele':kitten?'Lilla Test':'Test';cat.object.visible=true;cat.object.position.set(3,0,0);cat.object.scale.setScalar(cat.shape.size);cat.photoDone=false;cat.petFrom={x:3,z:1};}};
 });
 const check=async(label,fn,arg)=>{const data=await page.evaluate(fn,arg);checks.push({label,ok:!!data.ok,data});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));assert.ok(data.ok,label+' '+JSON.stringify(data));console.log('PASS '+label);};
 for(const kind of ['adult','kitten','large','Miele']){
  await check(kind+' free-hand pickup and preserved real size',kind=>{const C=carry,{cat,miele,H}=C;C.spawn(C.BREEDS.find(b=>kind==='Miele'?b.superRare:kind==='large'?b.name==='maine coon':b.name==='huskatt'),kind==='kitten');const size=cat.object.scale.clone(),label=cat.interact.verb;C.dispatch();C.step(.02);return{ok:label==='ta upp'&&H.heldItem()===miele&&cat.held&&cat.object.parent===miele.model&&cat.object.scale.equals(size),name:miele.name,size:cat.shape.size};},kind);
  await check(kind+' both production hands grip the cat',()=>{const C=carry,{T,miele,hand}=C;C.step(.02);const distances=[hand.hand,hand.left.hand].map((h,i)=>h.getWorldPosition(new T.Vector3()).distanceTo(miele.model.localToWorld(new T.Vector3(...miele.hugGrips[i]))));return{ok:hand.visible&&hand.left.hand.visible&&distances.every(d=>d<.1),distances};});
  await check(kind+' purr renews after walking and keeps voice',()=>{const C=carry,{cat,camera,calls}=C;const n=calls.filter(c=>c.kind==='purr').length;camera.position.x+=.3;for(let i=0;i<220;i++)C.step(1/60);const p=calls.filter(c=>c.kind==='purr');return{ok:p.length>n&&p.at(-1).voice===cat.voice&&p.at(-1).position===null&&cat.held&&C.A.audioParts().ctx.state==='running',purrs:p.length,voice:cat.voice};});
  if(kind==='adult'){await check('native purr produces nonzero audio samples',async()=>{const {ctx,master}=carry.A.audioParts(),a=ctx.createAnalyser();a.fftSize=2048;master.connect(a);await new Promise(r=>setTimeout(r,250));const v=new Float32Array(a.fftSize);a.getFloatTimeDomainData(v);master.disconnect(a);const rms=Math.sqrt(v.reduce((n,x)=>n+x*x,0)/v.length);return{ok:rms>1e-5,rms};});}
  if(kind==='adult'||kind==='kitten'||kind==='large'){await page.evaluate(()=>carry.draw());await page.screenshot({path:path.join(out,kind+'-arms.png')});}
  await check(kind+' floor release cancels purr and meows once',()=>{const C=carry,{cat,miele,H,calls}=C,n=calls.filter(c=>c.kind==='meow').length,sound=calls.filter(c=>c.kind==='purr').at(-1),size=cat.object.scale.clone();miele.placeAt(new C.T.Vector3(3,0,0));for(let i=0;i<45;i++)C.step(1/60);return{ok:!H.heldItem()&&!cat.held&&cat.object.parent===C.scene&&cat.object.scale.equals(size)&&cat.released?.meowed&&sound.stopped&&calls.filter(c=>c.kind==='meow').length===n+1};});
  if(kind==='adult'){await page.evaluate(()=>{carry.camera.lookAt(3,.2,0);carry.draw();});await page.screenshot({path:path.join(out,'adult-released.png')});await page.evaluate(()=>carry.camera.rotation.set(0,0,0));}
  await check(kind+' walks away then disappears',()=>{const C=carry,{cat}=C;const before=cat.object.position.clone();let moved=false;for(let i=0;i<900;i++){C.step(1/60);moved ||= cat.object.position.distanceTo(before)>.2;}return{ok:moved&&!cat.visible,moved,visible:cat.visible};});
 }
 await check('occupied hands retain petting without replacing item',()=>{const C=carry;C.spawn(C.BREEDS[0],true);const item={putBack(){throw Error('replaced occupied item');}};C.H.setHeld(item);const verb=C.cat.interact.verb;C.dispatch();const ok=C.H.heldItem()===item&&!C.cat.held&&C.cat.petting&&verb==='klappa';item.putBack=()=>{};C.H.setHeld(null);return{ok:!!ok,verb};});
 await check('hurt fleeing cat cannot be taken',()=>{const C=carry;C.spawn(C.BREEDS[0],false);C.cat.hurt('dart',C.player.pos);C.dispatch();return{ok:!C.H.heldItem()&&!C.cat.held&&!!C.cat.leaving?.hurt};});
 await check('bicycle stow cancels purr and restores same instance',()=>{const C=carry;C.spawn(C.BREEDS[0],true);C.dispatch();const object=C.cat.object,s=C.calls.filter(c=>c.kind==='purr').at(-1);C.H.stowBicycleHand();C.step(.02);const stopped=s.stopped&&!C.miele.model.parent&&C.cat.interact.verb==='klappa';C.H.restoreBicycleHand();C.step(.02);return{ok:stopped&&C.H.heldItem()===C.miele&&C.cat.object===object&&C.miele.model.parent===C.camera&&C.cat.held&&C.miele.saveStowed(C.miele)===null};});
 await check('hide clears hands and carry sound immediately',()=>{const C=carry,s=C.calls.filter(c=>c.kind==='purr').at(-1);C.cat.hide();return{ok:s.stopped&&!C.H.heldItem()&&!C.cat.held};});
 await check('F keeps a just-released ordinary cat to meow and leave',()=>{const C=carry;C.spawn(C.BREEDS[0],true);C.dispatch();C.miele.putBack();C.afterFurniture(false,C.cat);C.step(.6);return{ok:C.cat.visible&&!!C.cat.released?.meowed};});
 await check('replacement item puts cat at feet with meow',()=>{const C=carry;C.spawn(C.BREEDS[0],true);C.dispatch();const item={putBack(){}};C.H.setHeld(item);C.step(.6);const ok=C.H.heldItem()===item&&C.cat.released?.meowed&&!C.cat.held;C.H.setHeld(null);return{ok:!!ok};});
 await check('ordinary hugs never increment Miele saved hugs',()=>{const C=carry;C.spawn(C.BREEDS[0],true);C.dispatch();const n=C.miele.hugs;C.miele.use();C.step(.02);const ok=C.miele.hugs===n&&C.cat.hugging;C.miele.putBack();return{ok};});
 await check('Miele bicycle save stays Miele-only',()=>{const C=carry;C.spawn(C.BREEDS.find(b=>b.superRare),false);C.dispatch();const s=C.miele.saveStowed(C.miele);C.miele.putBack();return{ok:s?.name==='Miele'};});
 assert.equal(errors.length,0);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,sources,browser:browser.version(),limits:'Bounded production cat/holder/hands/WebAudio; exact main cat dispatch. Empty obstacle map, no full World, E/touch listeners, F listener, production persistence writes, audio recording, physical phone or FPS claim.'},null,2));
}finally{await browser.close();}})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.stack);console.error(e);process.exitCode=1;});
