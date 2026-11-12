const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),{execFileSync}=require('child_process');
const phase=process.argv[2]||'current',out=process.argv[3]||'docs/verification/1921';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  if(phase==='baseline') for(const name of ['src/duckmodel.js','src/config.js','src/ducks.js','models/duck-rigged.glb']) await page.route('**/'+name,r=>r.fulfill({contentType:name.endsWith('.js')?'text/javascript':'model/gltf-binary',body:execFileSync('git',['show','8354644a54a99b10584469bd2b27eea94f07e25d:'+name])}));
  await page.route('**/tools/duckvisualtest.html',r=>{
   const source=fs.readFileSync('tools/duckvisualtest.html','utf8').replace('const ducks=new Ducks','const constructStart=performance.now();const ducks=new Ducks').replace('const anchor=ducks.animals[0].brain','window.duckConstructionMs=performance.now()-constructStart;const anchor=ducks.animals[0].brain');
   return r.fulfill({contentType:'text/html',body:source});
  });
  await page.goto('http://127.0.0.1:8200/tools/duckvisualtest.html');await page.waitForFunction(()=>window.duckVisual?.ready);
  const report={phase,constructionMs:await page.evaluate(()=>window.duckConstructionMs),environment:'actual Ducks on controlled terrain, SwiftShader; not full World/hardware FPS',views:[],errors};
  for(const view of (phase==='first'?['quarter','side','normal']:['quarter','front','side','normal','near','swim','waddle','flap','eat'])) {
   const result=await page.evaluate(async view=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {ducks,scene,camera,renderer,arrange}=duckVisual;
    const state=['swim','waddle','flap','eat'].includes(view)?view:'idle';arrange(state,view==='swim');
    const b=ducks.animals[0].brain,cx=b.x+.65,cz=b.z;
    ducks.animals.forEach((a,i)=>{a.brain.x=cx+(i%2?.65:-.65);a.brain.z=cz+Math.floor(i/2)*-1.1;});
    ducks.update(0,false);
    ducks.animals.forEach((a,i)=>{a.mixer.stopAllAction();a.activeAction=a.actions[state];a.activeAction.reset().play();a.mixer.setTime(.2);a.mesh.visible=['normal','swim'].includes(view)||i<2});
    camera.fov=['normal','near'].includes(view)?70:40;
    camera.position.set(cx+(view==='side'?3:view==='quarter'?1.5:0),view==='normal'?1.62:view==='near'?1.05:.85,cz+(view==='side'?0:view==='near'?1.5:view==='normal'?3.5:3));
    camera.lookAt(cx,.34,cz-.25);camera.updateProjectionMatrix();scene.updateMatrixWorld(true);renderer.render(scene,camera);const whole={...renderer.info.render};
    const hidden=[];scene.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh){hidden.push([o,o.material.visible]);o.material.visible=false}});renderer.render(scene,camera);const birds={...renderer.info.render};hidden.forEach(([o,v])=>o.material.visible=v);renderer.render(scene,camera);
    const intended=ducks.animals.filter(a=>a.mesh.visible).every(a=>new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)).intersectsObject(a.skinnedMesh));
    let finite=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements].every(Number.isFinite);scene.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))finite=false});
    const arrays=new Set(),geos=new Set();const template=await(await import('/src/ducks.js')).loadRiggedDuckModel();template.scene.traverse(o=>{if(o.geometry)geos.add(o.geometry)});for(const a of ducks.animals)for(const g of [a.mesh.geometry,a.skinnedMesh.geometry])geos.add(g);
    for(const g of geos)for(const a of [...Object.values(g.attributes),g.index].filter(Boolean))arrays.add(a.array);
    return{view,whole,birds,intended,finite,visible:ducks.animals.filter(a=>a.mesh.visible).length,allRetainedGeometryBytesIncludingDecodedTemplate:[...arrays].reduce((s,a)=>s+a.byteLength,0),geometryCount:geos.size};
   },view);
   if(!result.finite||!result.intended||result.birds.calls!==result.visible)throw Error(JSON.stringify(result));
   await page.locator('canvas').screenshot({path:`${out}/${phase}-${view}.png`});report.views.push(result);
  }
  if(phase!=='first') {
   report.timing=await page.evaluate(()=>{
    const{ducks,renderer,scene,camera,arrange}=duckVisual;arrange('waddle');const b=ducks.animals[0].brain,cx=b.x+.65,cz=b.z;
    ducks.animals.forEach((a,i)=>Object.assign(a.brain,{x:cx+(i%2?.65:-.65),z:cz-Math.floor(i/2)*1.1}));
    renderer.setSize(640,480);camera.aspect=640/480;camera.fov=70;camera.position.set(cx,1.62,cz+3.5);camera.lookAt(cx,.34,cz-.25);camera.updateProjectionMatrix();
    const update=[],frame=[],gl=renderer.getContext();
    for(let i=0;i<40;i++){const start=performance.now();ducks.update(1/60,false);const end=performance.now();renderer.render(scene,camera);gl.finish();if(i>=10){update.push(end-start);frame.push(performance.now()-start)}}
    const summary=a=>{const x=a.slice().sort((a,b)=>a-b);return{samples:a,median:x[15],p95:x[28]}};
    return{scope:'10 warm +30 measured actual four-duck Ducks.update plus controlled field rendering/gl.finish,640x480/DPR1',update:summary(update),frame:summary(frame),submitted:{...renderer.info.render}};
   });
   report.binder=await page.evaluate(async()=>{
    const{registry}=await import('/src/bestiary.js'),{BestiaryImages}=await import('/src/bestiaryimages.js'),{renderer}=duckVisual;
    renderer.domElement.style.display='none';document.querySelector('header').style.display='none';const root=document.createElement('div');root.style='display:flex;gap:24px;padding:24px;background:#eee';document.body.append(root);const provider=new BestiaryImages({registry,renderer});
    for(const entry of registry.list().filter(e=>e.model?.kind==='duck')){const card=document.createElement('figure');card.style='margin:0;background:white;padding:20px';card.innerHTML=`<figcaption>${entry.name} · model ${entry.modelVersion}</figcaption>`;for(const size of[96,320]){const image=new Image();image.src=await provider.get(entry.id,size);await image.decode();image.style='display:block';card.append(image)}root.append(card)}return{renders:provider.renders};
   });
   if(report.binder.renders!==4)throw Error('Expected four actual binder renders');
   await page.screenshot({path:`${out}/${phase}-binder.png`});
  }
  if(errors.length)throw Error(JSON.stringify(errors));fs.writeFileSync(`${out}/${phase}-browser.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
