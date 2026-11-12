// #1916: same six production variants/cameras as #1907, with actual submitted
// calls, attribute bytes, matched baseline and a meeting-distance art view.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://localhost:8201', out = process.argv[3] || 'docs/verification/1916';
const baseline = '2f03ba02', files = ['src/avatar.js','src/config.js','src/olof.js','models/avatar-rigged.glb'];
const old = Object.fromEntries(files.map(f=>[f,execFileSync('git',['show',`${baseline}:${f}`],{maxBuffer:8e6})]));
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const result={baseline,environment:'Chromium1248 / SwiftShader; production Avatar/IK component, DPR1,1500x1040, same camera and light',errors:[]};
 try{
  for(const phase of ['before','after']){
   const page=await browser.newPage({viewport:{width:1500,height:1040}});
   page.on('pageerror',e=>result.errors.push({phase,error:e.message}));
   const sources=Object.fromEntries(files.map(f=>[f,phase==='before'?old[f]:fs.readFileSync(f)]));
   if(phase==='before')for(const f of files)await page.route(`**/${f}`,r=>r.fulfill({contentType:f.endsWith('.glb')?'model/gltf-binary':'text/javascript',body:sources[f]}));
   await page.goto(`${base}/tools/verify-avatar-rigged.html`);await page.waitForFunction(()=>window.__ready);
   for(const view of ['front','side','quarter']){await page.evaluate(v=>window.avatarView(v),view);await page.screenshot({path:path.join(out,`${phase}-${view}.png`),fullPage:true});}
   result[phase]=await page.evaluate(()=>{
    const {avatars,renderer,scene,camera,measured}=window.__avatar1907;
    const rows=avatars.map(av=>{
     avatars.forEach(v=>v.object.visible=v===av);scene.children.filter(v=>!v.isLight&&!v.isGroup).forEach(v=>v.visible=false);
     renderer.setScissorTest(false);renderer.setViewport(0,0,1500,800);renderer.render(scene,camera);
     return{look:av.look,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,bytes:Object.values(av.mesh.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),bones:av.mesh.skeleton.bones.length,attributes:Object.fromEntries(Object.entries(av.mesh.geometry.attributes).map(([k,a])=>[k,a.array.byteLength]))};
    });
    renderer.setScissorTest(true);document.querySelector('#labels').hidden=true;
    for(let i=0;i<6;i++){
     avatars.forEach((a,j)=>a.object.visible=i===j);
     const direction=camera.position.clone().set(.35,.05,1).normalize(),target=direction.clone().set(0,i===3?1.03:i===4?1.05:1.45,0);
     camera.position.copy(target).addScaledVector(direction,1.25);camera.lookAt(target);
     renderer.setViewport(i%3*500,(1-Math.floor(i/3))*400,500,400);renderer.setScissor(i%3*500,(1-Math.floor(i/3))*400,500,400);renderer.render(scene,camera);
    }
    renderer.setScissorTest(false);return{rows,bounds:measured};
   });
   result[phase].hashes=Object.fromEntries(files.map(f=>[f,hash(sources[f])]));
   const glb=sources['models/avatar-rigged.glb'],doc=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
   result[phase].neutral={bytes:glb.length,triangles:doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION].count/3};
   await page.screenshot({path:path.join(out,`${phase}-meeting.png`),fullPage:true});await page.close();
  }
  for(let i=0;i<6;i++){
   const a=result.before.rows[i],b=result.after.rows[i];
   if(a.calls!==1||b.calls!==1||b.bones!==15||b.triangles>a.triangles*1.1||b.bytes>a.bytes*1.1)throw Error(`runtime budget exceeded for look${i}`);
  }
  if(result.errors.length)throw Error('component page errors');result.pass=true;
 }finally{await browser.close();fs.writeFileSync(path.join(out,'component.json'),JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify({pass:result.pass,rows:result.after.rows.map((r,i)=>({before:result.before.rows[i].triangles,after:r.triangles,calls:r.calls,bytes:r.bytes})),neutral:result.after.neutral}));
})().catch(e=>{console.error(e);process.exitCode=1});
