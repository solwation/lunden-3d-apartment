const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const out=process.argv[2]||'docs/verification/1922',base=process.env.FISH_BASELINE,origin=process.env.FISH_ORIGIN||'http://127.0.0.1:8201';
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[],result={baseline:base||null,environment:'actual RiverFish/CaughtFish/BestiaryImages; controlled lighting; production opaque river water; Chromium SwiftShader DPR1',views:[],errors};
 try{
  async function pageFor(missing=false){
   const page=await browser.newPage({viewport:{width:1500,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGL|VALIDATE|GL_INVALID/.test(m.text()))errors.push(m.text())});
   if(base)for(const file of ['src/config.js','src/riverfish.js','src/riverfishmodel.js','src/caughtfish.js','models/fish-generic.glb'])await page.route('**/'+file,r=>r.fulfill({contentType:file.endsWith('.glb')?'model/gltf-binary':'text/javascript',body:execFileSync('git',['show',`${base}:${file}`])}));
   if(missing)await page.route('**/models/fish-generic.glb',r=>r.fulfill({status:404,body:'intentional missing model fixture'}));
   await page.goto(origin+'/tools/fishqualitytest.html');await page.waitForFunction(()=>window.fishQuality?.ready);return page;
  }
  async function state(page){return page.evaluate(()=>{
   const q=fishQuality,gl=q.renderer.getContext();let finite=true;q.scene.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))finite=false});
   const m=q.river.fish;const cameraFinite=[...q.camera.matrixWorld.elements,...q.camera.projectionMatrix.elements].every(Number.isFinite);
   return{finite,cameraFinite,instanceFinite:m.instanceMatrix.array.every(Number.isFinite)&&(!m.geometry.attributes.aFish||m.geometry.attributes.aFish.array.every(Number.isFinite)),render:{...q.renderer.info.render},fishCount:m.count,material:{opacity:m.material.opacity,transparent:m.material.transparent,depthWrite:m.material.depthWrite,side:m.material.side,forceSinglePass:m.material.forceSinglePass},waterOpaque:!q.actualWater.material.transparent&&q.actualWater.material.opacity===1,
    programs:q.renderer.info.programs.map(p=>{const attributes=Array.from({length:gl.getProgramParameter(p.program,gl.ACTIVE_ATTRIBUTES)},(_,i)=>{const a=gl.getActiveAttrib(p.program,i);return{name:a.name,type:a.type,size:a.size,location:gl.getAttribLocation(p.program,a.name)}});return{maxSlots:gl.getParameter(gl.MAX_VERTEX_ATTRIBS),activeSlots:attributes.reduce((n,a)=>n+(a.type===gl.FLOAT_MAT4?4:1)*a.size,0),attributes}})};
  })}
  async function snapshot(page,name){const row=await state(page);check(row.finite&&row.cameraFinite&&row.instanceFinite&&row.waterOpaque,name+': invalid transforms/opaque water');await page.locator('canvas').screenshot({path:out+'/'+name+'.png'});return{name,...row}}
  const page=await pageFor();result.constructionMs=await page.evaluate(()=>fishQuality.constructionMs);
  for(const mode of ['caught','cooked','live','live-down','live-normal']){await page.evaluate(mode=>fishQuality.show(mode),mode);result.views.push(await snapshot(page,mode));}
  // Same actual held pose and size for every species, with free complete silhouettes.
  result.held=[];
  for(let i=0;i<6;i++){
   const row=await page.evaluate(i=>{const q=fishQuality,f=q.held(i);return{species:f.species,cm:f.cm,parentIsCamera:f.model.parent===q.camera,held:f.held,position:f.model.position.toArray(),quaternion:f.model.quaternion.toArray(),lengthScale:f.mesh.scale.z}},i);
   check(row.parentIsCamera&&row.held,'not the actual held fish');result.held.push(row);result.views.push(await snapshot(page,'held-'+i));
  }
  await page.evaluate(()=>fishQuality.surface());result.surface=await page.evaluate(async()=>{const T=await import('three');return fishQuality.catches.map(f=>({species:f.species,minY:new T.Box3().setFromObject(f.model).min.y,placed:f.placed,lengthScale:f.mesh.scale.z,info:f.info}))});
  check(result.surface.length===6&&result.surface.every(f=>f.placed&&Math.abs(f.minY-.001)<1e-5&&f.lengthScale===.4),'surface/contact anchor failed');result.views.push(await snapshot(page,'surface'));
  // Every species from a legitimate id/born and pure rise clock, rendered through
  // the actual opaque river ribbon. Isolate that filled instance to prove pixels.
  result.natural=[];
  for(const name of ['mört','abborre','braxen','gädda','öring','ål'])for(const rising of [true,false]){
   const row=await page.evaluate(async({name,rising})=>{
    const T=await import('three'),q=fishQuality,chosen=q.natural(name,rising),m=q.river.fish,slot=q.river.shown.findIndex(f=>f.id===chosen.id),shown=q.river.shown.map(f=>({...f}));
    if(slot<0||shown[slot].species!==name)throw Error('Intended natural species not filled');
    const arrays=[m.instanceMatrix,m.instanceColor,...(m.geometry.attributes.aFish?[m.geometry.attributes.aFish]:[])],saved=arrays.map(a=>a.array.slice()),count=m.count,gl=q.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,water=new Uint8Array(width*height*4),fish=new Uint8Array(water.length);
    m.visible=false;q.renderer.render(q.scene,q.camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,water);
    m.visible=true;m.count=1;arrays.forEach((a,i)=>{const size=a.itemSize;a.array.set(saved[i].subarray(slot*size,(slot+1)*size),0);a.needsUpdate=true});q.renderer.render(q.scene,q.camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,fish);
    let changedPixels=0;for(let i=0;i<fish.length;i+=4)if(Math.abs(fish[i]-water[i])+Math.abs(fish[i+1]-water[i+1])+Math.abs(fish[i+2]-water[i+2])>3)changedPixels++;
    const p=new T.Vector3().setFromMatrixPosition(new T.Matrix4().fromArray(saved[0],slot*16)),frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(q.camera.projectionMatrix,q.camera.matrixWorldInverse)),inView=frustum.intersectsSphere(new T.Sphere(p,.5));
    arrays.forEach((a,i)=>{a.array.set(saved[i]);a.needsUpdate=true});m.count=count;q.renderer.render(q.scene,q.camera);
    return{...chosen,rising,slot,shown,changedPixels,inView,water:{name:q.actualWater.name,opaque:!q.actualWater.material.transparent,depthWrite:q.actualWater.material.depthWrite}};
   },{name,rising});
   check(row.changedPixels>=12&&row.inView&&row.water.opaque&&row.water.depthWrite,name+': no intended fish pixels through opaque production water');
   result.natural.push(row);result.views.push(await snapshot(page,`natural-${name}-${rising?'up':'down'}`));
  }
  // Unchanged culling and caught-life exclusion, driven by the production update.
  result.gating=await page.evaluate(()=>{const q=fishQuality,c=q.natural('gädda',true);q.river.sync.gone.set(c.id,{b:c.born,u:q.river.sync.roomMs+10000});q.river.update(0);const gone=!q.river.shown.some(f=>f.id===c.id);q.river.update(0,true);const hidden=!q.river.fish.visible&&q.river.fish.count===0;q.camera.position.set(10000,2,10000);q.river.update(0);return{gone,hidden,far:!q.river.fish.visible&&q.river.fish.count===0}});
  check(Object.values(result.gating).every(Boolean),'gating regression');
  result.timing=await page.evaluate(()=>{
   const q=fishQuality,selected=q.natural('gädda',true),gl=q.renderer.getContext();q.renderer.setSize(640,480);q.camera.aspect=640/480;q.camera.updateProjectionMatrix();let clock=selected.time;
   const update=[],render=[],counts=[];
   q.river.sync.now=()=>1000*(1793491200+clock);
   for(let i=-8;i<30;i++){clock+=1/60;const a=performance.now();q.river.update(1/60,false,1);const b=performance.now();q.renderer.render(q.scene,q.camera);gl.finish();const c=performance.now();if(i>=0){update.push(b-a);render.push(c-b);counts.push(q.river.fish.count)}}
   const stats=a=>{const s=[...a].sort((x,y)=>x-y);return{median:s[15],p95:s[28],samples:a}};
   const natural={updateMs:stats(update),renderFinishMs:stats(render),filledCounts:counts,submitted:{...q.renderer.info.render}};
   q.show('live-capacity');q.camera.aspect=640/480;q.camera.updateProjectionMatrix();const capacity=[];
   for(let i=-8;i<30;i++){const a=performance.now();q.renderer.render(q.scene,q.camera);gl.finish();const b=performance.now();if(i>=0)capacity.push(b-a)}
   return{viewport:[640,480],dpr:q.renderer.getPixelRatio(),warmup:8,samples:30,natural,capacity:{configured:18,filled:q.river.fish.count,renderFinishMs:stats(capacity),submitted:{...q.renderer.info.render}}};
  });
  result.binder=await page.evaluate(async()=>{
   const{registry}=await import('/src/bestiary.js'),{BestiaryImages}=await import('/src/bestiaryimages.js'),entries=registry.list().filter(e=>e.model.kind==='fish');
   if(entries.length!==6)throw Error('Expected six fish binder models');const images=new BestiaryImages({registry,renderer:fishQuality.renderer}),rows=[],grid=document.createElement('div');grid.id='binder-grid';grid.style='display:grid;grid-template-columns:repeat(3,400px);gap:10px;padding:20px;background:#eeeee9';
   for(const e of entries)for(const size of [96,320]){const data=await images.get(e.id,size),img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,size,size).data;let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>10)opaque++;if(opaque<20)throw Error('Empty fish card '+e.id);rows.push({id:e.id,size,version:e.modelVersion,opaque});if(size===320){const tile=document.createElement('div');tile.style='text-align:center';tile.append(img,document.createTextNode(e.name));grid.append(tile)}}
   document.body.append(grid);return{rows,renders:images.renders};
  });check(result.binder.renders===12&&result.binder.rows.length===12,'incomplete binder rendering');await page.locator('#binder-grid').screenshot({path:out+'/binder.png'});
  await page.close();const missing=await pageFor(true);await missing.evaluate(()=>fishQuality.show('live'));result.fallback=await snapshot(missing,'fallback-live');check(result.fallback.fishCount===6,'missing model lost fish');
  check(errors.length===0,errors.join('\n'));fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2)+'\n');console.log('PASS six species art/held/binder, twelve production-water natural pixel checks, surface/gating/fallback and warm timing; visual review required.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
