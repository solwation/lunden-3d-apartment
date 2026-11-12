// Source-bound actual Paddock evidence; run under tools/browsertest.sh.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),{execFileSync}=require('child_process');
const url=process.argv[2]||'http://127.0.0.1:8201/tools/ponyvisualtest.html';
const out=process.argv[3]||'docs/verification/1919',baseline=process.argv[4]||'9254ea2e3026015d0e71454e70433db22737b679';
async function captureFallback(browser,out){
  const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/models/pony-rigged.glb',r=>r.fulfill({status:404,body:'missing asset fixture'}));
  await page.goto(url);await page.waitForFunction(()=>window.ponyVisual?.ready);
  const result=await page.evaluate(()=>{
    const{p,renderer,scene,camera,arrange}=ponyVisual;arrange('idle');
    for(const q of p.ponies){q.neck=0;q.amp=0;q.headYaw=0;q.tail=0}p.write(0);
    const cx=(p.ponies[0].x+p.ponies[1].x)/2,cz=p.ponies[0].z;camera.fov=70;camera.position.set(cx,1.62,cz+4);camera.lookAt(cx,.9,cz);camera.updateProjectionMatrix();renderer.render(scene,camera);
    const whole={...renderer.info.render},hidden=[];scene.traverse(o=>{if(o.isMesh&&o!==p.mesh){hidden.push([o,o.visible]);o.visible=false}});renderer.render(scene,camera);const fallback={...renderer.info.render};hidden.forEach(([o,v])=>o.visible=v);renderer.render(scene,camera);
    const arrays=new Set();for(const a of Object.values(p.mesh.geometry.attributes))arrays.add(a.array);
    return{missingKeepsFallback:p.riggedPonies===null&&p.mesh.visible&&p.mesh.material.visible,instances:p.mesh.count,whole,fallback,attributeBytes:[...arrays].reduce((s,a)=>s+a.byteLength,0),finite:[...p.mesh.instanceMatrix.array,...p.anim.array,...p.anim2.array,...camera.matrixWorld.elements,...camera.projectionMatrix.elements].every(Number.isFinite)};
  });
  if(errors.length||!result.missingKeepsFallback||!result.finite||result.instances!==2||result.fallback.calls!==1)throw Error(JSON.stringify({result,errors}));
  await page.locator('canvas').screenshot({path:out+'/current-fallback.png'});await page.close();const checked={...result,errors};fs.writeFileSync(out+'/fallback.json',JSON.stringify(checked,null,2)+'\n');return checked;
}
module.exports={captureFallback};
async function main(){

  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  let grassBaseline;
  const report={baseline,environment:'Actual Paddock on controlled flat terrain; seeded grass; Chromium1248 SwiftShader; not full World or hardware-phone FPS',phases:[]};
  try{for(const phase of ['baseline','current']){
    const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{let seed=1919;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
    if(phase==='baseline')for(const name of ['src/paddock.js','src/config.js','models/pony-rigged.glb'])await page.route('**/'+name,r=>r.fulfill({contentType:name.endsWith('.js')?'text/javascript':'model/gltf-binary',body:execFileSync('git',['show',baseline+':'+name])}));
    await page.goto(url);await page.waitForFunction(()=>window.ponyVisual?.ready);
    if(phase==='baseline')grassBaseline=await page.evaluate(()=>({matrix:Array.from(ponyVisual.p.grass.instanceMatrix.array),count:ponyVisual.p.grass.count,mask:Array.from(ponyVisual.p.maskTex.image.data),length:Array.from(ponyVisual.p.gm.v)}));
    else await page.evaluate(async data=>{const T=await import('/node_modules/three/build/three.module.js'),p=ponyVisual.p;p.grass.instanceMatrix=new T.InstancedBufferAttribute(new Float32Array(data.matrix),16);p.grass.count=data.count;p.maskTex.image.data.set(data.mask);p.maskTex.needsUpdate=true;p.gm.v.set(data.length)},grassBaseline);
    const result={phase,views:[],errors,grassCount:grassBaseline.count};
    for(const view of ['quarter','front','side','normal','pet-close','graze','walk','pet','winter']){
      const data=await page.evaluate(async view=>{
        const T=await import('/node_modules/three/build/three.module.js');const{p,scene,camera,renderer,arrange}=ponyVisual;
        arrange(['graze','walk','pet'].includes(view)?view:view==='pet-close'?'pet':'idle',view==='winter');
        const q=p.ponies[1],cx=(p.ponies[0].x+q.x)/2,cz=q.z;
        camera.fov=['normal','pet-close'].includes(view)?70:44;
        camera.position.set(view==='pet-close'?q.x+.8:cx+(view==='side'?6:view==='front'||view==='normal'?0:5),['normal','pet-close'].includes(view)?1.62:2,cz+(view==='side'?0:view==='front'?6:view==='normal'?4:view==='pet-close'?2.8:6));
        camera.lookAt(view==='pet-close'?q.x:cx,.9,cz);camera.updateProjectionMatrix();camera.updateMatrixWorld();renderer.render(scene,camera);
        const whole={...renderer.info.render},hidden=[];
        scene.traverse(o=>{if(o.isMesh&&!p.riggedPonies.some(r=>r.skinnedMesh===o)){hidden.push([o,o.visible]);o.visible=false}});
        renderer.render(scene,camera);const ponies={...renderer.info.render};hidden.forEach(([o,v])=>o.visible=v);renderer.render(scene,camera);
        const arrays=new Set();for(const r of p.riggedPonies)for(const a of [...Object.values(r.skinnedMesh.geometry.attributes),r.skinnedMesh.geometry.index].filter(Boolean))arrays.add(a.array);
        const riggedBytes=[...arrays].reduce((n,a)=>n+a.byteLength,0);let finite=true;
        scene.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))finite=false});
        const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        const intended=p.riggedPonies.every(r=>r.object.visible&&r.skinnedMesh.visible&&frustum.intersectsObject(r.skinnedMesh));
        return{view,whole,ponies,riggedBytes,shared:p.riggedPonies[0].skinnedMesh.geometry===p.riggedPonies[1].skinnedMesh.geometry,finite,cameraFinite:[...camera.matrixWorld.elements,...camera.projectionMatrix.elements].every(Number.isFinite),intended,loaded:p.riggedPonies.length===2};
      },view);
      if(!data.finite||!data.cameraFinite||!data.loaded||data.ponies.calls!==2||!data.intended)throw Error(JSON.stringify(data));
      await page.locator('canvas').screenshot({path:`${out}/${phase}-${view}.png`});result.views.push(data);
    }
    result.timing=await page.evaluate(()=>{
      const{p,scene,camera,renderer,arrange}=ponyVisual;arrange('walk');renderer.setSize(640,480);camera.aspect=640/480;camera.fov=70;camera.position.set((p.ponies[0].x+p.ponies[1].x)/2,1.62,p.ponies[0].z+4);camera.lookAt((p.ponies[0].x+p.ponies[1].x)/2,.9,p.ponies[0].z);camera.updateProjectionMatrix();
      const gl=renderer.getContext(),update=[],frame=[];
      for(let i=0;i<40;i++){const a=performance.now();p.write(1/60);const b=performance.now();renderer.render(scene,camera);gl.finish();if(i>=10){update.push(b-a);frame.push(performance.now()-a)}}
      const summary=values=>{const a=values.slice().sort((x,y)=>x-y);return{samples:values,median:a[15],p95:a[28]}};
      return{scope:'10warm+30measured Paddock.write(1/60)+actual field render+gl.finish,640x480/DPR1,70deg; update CPU also recorded',update:summary(update),frame:summary(frame)};
    });
    result.binder=await page.evaluate(async()=>{
      const{registry}=await import('/src/bestiary.js'),{BestiaryImages}=await import('/src/bestiaryimages.js');const{renderer}=ponyVisual;renderer.domElement.style.display='none';document.querySelector('header').style.display='none';
      const root=document.createElement('div');root.style='display:flex;gap:24px;padding:24px;background:#eee';document.body.append(root);const provider=new BestiaryImages({registry,renderer});
      for(const entry of registry.list().filter(e=>e.model?.kind==='pony')){const card=document.createElement('figure');card.style='margin:0;background:white;padding:20px';card.innerHTML=`<figcaption>${entry.name} · model ${entry.modelVersion}</figcaption>`;for(const size of [96,320]){const image=new Image();image.src=await provider.get(entry.id,size);await image.decode();image.style='display:block';card.append(image)}root.append(card)}return{renders:provider.renders};
    });
    if(result.binder.renders!==4||errors.length)throw Error(JSON.stringify(result));
    await page.screenshot({path:`${out}/${phase}-binder.png`});report.phases.push(result);await page.close();
  }report.fallback=await captureFallback(browser,out);fs.writeFileSync(out+'/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}finally{await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
