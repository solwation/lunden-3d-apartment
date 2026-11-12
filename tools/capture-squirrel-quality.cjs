const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const out=process.argv[2]||'docs/verification/1920';
const base=process.env.SQUIRREL_BASELINE;
const origin=process.env.SQUIRREL_ORIGIN||'http://127.0.0.1:8201';
const check=(ok,message)=>{if(!ok)throw Error(message)};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[],result={baseline:base||null,environment:'actual Squirrels and BestiaryImages, controlled terrain; Chromium SwiftShader, DPR1',views:[],errors};
 try{
  async function pageFor(fallback=false){
   const page=await browser.newPage({viewport:{width:1500,height:900}});
   page.on('pageerror',e=>errors.push(e.message));
   if(base)for(const file of ['src/config.js','src/squirrels.js','models/squirrel-rigged.glb']){
    const body=execFileSync('git',['show',`${base}:${file}`]);
    await page.route('**/'+file,r=>r.fulfill({contentType:file.endsWith('.glb')?'model/gltf-binary':'text/javascript',body}));
   }
   if(fallback)await page.route('**/models/squirrel-rigged.glb',r=>r.fulfill({status:404,body:'intentional missing squirrel fixture'}));
   await page.goto(origin+'/tools/squirrelvisualtest.html');
   await page.waitForFunction(()=>window.squirrelVisual?.ready);
   return page;
  }
  async function view(page,name,fallback=false){
   const row=await page.evaluate(async({name,fallback})=>{
    const T=await import('three'),{squirrels:s,scene,camera,renderer,arrange}=squirrelVisual;
    arrange(['run','climb','eat','flick','headleft','headright'].includes(name)?name:'idle',name==='far');
    camera.fov=name==='normal'?70:40;
    camera.position.set(name==='side'?1.4:name==='front'||name==='normal'?0:.7,name==='normal'?1.62:.4,name==='side'?.15:name==='normal'?1.25:1.6);
    camera.lookAt(0,.16,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    renderer.render(scene,camera);const whole={...renderer.info.render};
    const intended=s.animals.slice(0,3),meshes=intended.map(a=>a.isRigged?a.skinnedMesh:a.body),hidden=[];
    scene.traverse(o=>{if(o.isMesh&&!meshes.includes(o)){hidden.push([o,o.visible]);o.visible=false}});
    renderer.render(scene,camera);const figures={...renderer.info.render};
    hidden.forEach(([o,v])=>o.visible=v);renderer.render(scene,camera);
    let finite=true;scene.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))finite=false});
    const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const shown=intended.every((a,i)=>a.isRigged!==fallback&&a.group.visible&&meshes[i].visible&&frustum.intersectsObject(meshes[i]));
    const contacts=intended.map(a=>({name:a.spec.name,mouth:a.mouth.getWorldPosition(new T.Vector3()).toArray(),paws:a.bones?['Joint_Paw_L','Joint_Paw_R'].map(n=>a.bones[n].getWorldPosition(new T.Vector3()).toArray()):null}));
    return{name,fallback,whole,figures,finite,cameraFinite:[...camera.matrixWorld.elements,...camera.projectionMatrix.elements].every(Number.isFinite),intended:shown,contacts};
   },{name,fallback});
   check(row.finite&&row.cameraFinite&&row.intended,`${name}: invalid transform, wrong mode or missing intended squirrel`);
   check(row.figures.calls===3&&row.figures.triangles>0,`${name}: wrong submitted figures`);
   await page.locator('canvas').screenshot({path:`${out}/${fallback?'fallback-':''}${name}.png`});
   return row;
  }
  const page=await pageFor();
  for(const name of (process.env.SQUIRREL_VIEWS?.split(',')||['quarter','front','side','normal','run','climb','eat','flick','far']))result.views.push(await view(page,name));
  if(process.env.SQUIRREL_VIEWS){check(errors.length===0,errors.join('\n'));fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2)+'\n');console.log('PASS selected actual squirrel views');return;}
  result.constructionMs=await page.evaluate(()=>squirrelVisual.constructionMs);
  result.timing=await page.evaluate(async()=>{
   const {squirrels:s,scene,camera,renderer,arrange}=squirrelVisual,gl=renderer.getContext();
   renderer.setSize(640,480);camera.aspect=640/480;camera.updateProjectionMatrix();
   const rows=[];
   for(const far of [false,true]){
    arrange('run',far);camera.position.set(.7,.4,1.6);camera.lookAt(0,.16,0);camera.updateMatrixWorld();
    const update=[],render=[];
    for(let i=-8;i<30;i++){
     const a=performance.now();s.time+=1/60;for(const animal of s.animals.slice(0,3))s.pose(animal,far?25:1,1/60);
     const b=performance.now();renderer.render(scene,camera);gl.finish();const c=performance.now();
     if(i>=0){update.push(b-a);render.push(c-b)}
    }
    const stats=a=>{const sorted=[...a].sort((x,y)=>x-y);return{median:sorted[15],p95:sorted[28],samples:a}};
    rows.push({far,updateMs:stats(update),renderFinishMs:stats(render),submitted:{...renderer.info.render}});
   }
   return{viewport:[640,480],samples:30,warmup:8,dpr:renderer.getPixelRatio(),rows};
  });
  // The actual binder provider, both production sizes, all ten registered recipes.
  result.binder=await page.evaluate(async()=>{
   const{registry}=await import('/src/bestiary.js'),{BestiaryImages}=await import('/src/bestiaryimages.js');
   const entries=registry.list().filter(e=>e.model.kind==='squirrel');
   if(entries.length!==10)throw Error(`Expected ten squirrel entries, got ${entries.length}`);
   const images=new BestiaryImages({registry,renderer:squirrelVisual.renderer}),rows=[];
   const grid=document.createElement('div');grid.id='binder-grid';grid.style='display:grid;grid-template-columns:repeat(5,280px);gap:12px;background:#ecede7;padding:20px';
   for(const entry of entries)for(const size of [96,320]){
    const data=await images.get(entry.id,size),img=new Image();img.src=data;await img.decode();
    const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,size,size).data;let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>10)opaque++;
    if(opaque<20)throw Error('Empty binder render: '+entry.id);
    rows.push({id:entry.id,size,version:entry.modelVersion,opaque});
    if(size===320){const tile=document.createElement('div');tile.style='text-align:center';img.style='width:260px;height:260px';tile.append(img,document.createTextNode(entry.name));grid.append(tile)}
   }
   document.body.append(grid);return{rows,renders:images.renders};
  });
  check(result.binder.renders===20&&result.binder.rows.length===20,'missing binder variants/sizes');
  await page.locator('#binder-grid').screenshot({path:out+'/binder.png'});
  await page.close();
  const missing=await pageFor(true);result.fallback=[];
  for(const name of ['quarter','eat','far'])result.fallback.push(await view(missing,name,true));
  check(errors.length===0,errors.join('\n'));
  fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2)+'\n');
  console.log(`PASS nine actual consumer views, ten binder variants at two sizes, three missing-GLB views, finite transforms/cameras and intended figures; ${base?'baseline '+base:'candidate'}. Images require visual review.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
