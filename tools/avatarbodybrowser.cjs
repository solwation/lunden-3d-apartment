// #2001: one owned browser, matched real runtime before/after and actual AvatarPreview.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const base=process.argv[2]||'http://localhost:8801',out='docs/verification/2001',baseline='3f7c3d0b1983bec2cde7fd44855c1c0af19744ba';
const files=['src/avatar.js','src/config.js','src/olof.js','src/avatarpreview.js','tools/verify-avatar-body.html'];
const old=Object.fromEntries(files.filter(f=>!f.startsWith('tools/')).map(f=>[f,execFileSync('git',['show',`${baseline}:${f}`],{maxBuffer:8e6})]));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const correction=process.argv.includes('--art-correction');
const result={baseline,environment:'Chromium/SwiftShader; DPR1, matched production component light and cameras; CPU timings diagnostic only',errors:[]};
const save=()=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
module.exports=(async()=>{
 fs.mkdirSync(`${out}/before`,{recursive:true});
 const browser=global.__bodySharedBrowser || await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 result.chromium=browser.version();
 for(let revision=0;;revision++){
 result.revision=revision;
 for(const phase of ['before','after']){
 const page=await browser.newPage({viewport:{width:1500,height:1040}});
 page.on('pageerror',e=>result.errors.push({phase,error:e.message}));
 page.on('console',m=>{if(m.type()==='error'&&/Shader|GL_INVALID|VALIDATE_STATUS/.test(m.text()))result.errors.push({phase,error:m.text()});});
 if(phase==='before')for(const [f,body] of Object.entries(old))await page.route(`**/${f}`,r=>r.fulfill({contentType:'text/javascript',body}));
 await page.goto(`${base}/tools/verify-avatar-body.html`);await page.waitForFunction(()=>window.__ready,null,{timeout:60000});
 const dest=phase==='before'?`${out}/before`:out;
 for(const view of (correction?['quarter']:['front','side','quarter'])){await page.evaluate(v=>window.avatarView(v),view);await page.screenshot({path:`${dest}/avatar-${view}.png`});}
 result[phase]=await page.evaluate(()=>{
 const {avatars,renderer:r,scene,camera,measured}=window.__avatar1907;
 scene.children.filter(v=>!v.isLight&&!v.isGroup).forEach(v=>v.visible=false);r.setScissorTest(false);r.setViewport(0,0,1500,800);
 const rows=avatars.map(av=>{avatars.forEach(v=>v.object.visible=v===av);r.render(scene,camera);return{look:av.look,calls:r.info.render.calls,triangles:r.info.render.triangles,bytes:Object.values(av.mesh.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),bones:av.mesh.skeleton.bones.length,programs:r.info.programs.length,textures:r.info.memory.textures};});
 document.querySelector('#labels').hidden=true;r.setScissorTest(true);
 for(let i=0;i<6;i++){
  avatars.forEach((a,j)=>a.object.visible=i===j);
  const direction=camera.position.clone().set(.35,.05,1).normalize(),target=direction.clone().set(0,measured[i].max[1]-.24,0);
  camera.position.copy(target).addScaledVector(direction,1.45);camera.lookAt(target);
  r.setViewport(i%3*500,(1-Math.floor(i/3))*400,500,400);r.setScissor(i%3*500,(1-Math.floor(i/3))*400,500,400);r.render(scene,camera);
 }
 r.setScissorTest(false);return{rows,bounds:measured};
 });
 await page.screenshot({path:`${dest}/avatar-meeting.png`});
 result[phase].cost=await page.evaluate(()=>{
 const {avatars,renderer:r,scene,camera}=window.__avatar1907,gl=r.getContext();
 const stats=a=>{a.sort((x,y)=>x-y);return{median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)]};};
 r.setSize(320,256);camera.aspect=320/256;camera.updateProjectionMatrix();
 const render=[],update=[];
 for(let i=0;i<50;i++){let t=performance.now();for(let j=0;j<10;j++)for(const a of avatars)a.update(1/600,{speed:1.2});if(i>=10)update.push((performance.now()-t)/60);t=performance.now();r.render(scene,camera);gl.finish();if(i>=10)render.push(performance.now()-t);}
 return{updatePerAvatarMs:stats(update),renderFinishMs:stats(render),samples:40,drawingBuffer:[320,256],gl:gl.getParameter(gl.RENDERER)};
 });
 result[phase].hashes=Object.fromEntries(files.map(f=>[f,hash(phase==='before'&&old[f]?old[f]:fs.readFileSync(f))]));save();await page.close();
 console.log('component',phase,JSON.stringify(result[phase].cost));
 }
 for(let i=0;i<6;i++){const a=result.before.rows[i],b=result.after.rows[i];if(a.calls!==1||b.calls!==1||b.bones!==15||b.triangles>a.triangles*1.1||b.bytes>a.bytes*1.1||b.textures!==a.textures||b.programs!==a.programs)throw Error(`budget exceeded look${i}`);}
 console.log('ART_REVIEW_READY');
 // Release the component context while the early art pair is reviewed; same browser owner.
 if(process.env.ART_REVIEW_GATE){const end=Date.now()+600000;while(!fs.existsSync(process.env.ART_REVIEW_GATE)){if(Date.now()>end)throw Error('art review gate timed out');await new Promise(r=>setTimeout(r,1000));}}
 if(process.env.ART_REVIEW_GATE&&fs.readFileSync(process.env.ART_REVIEW_GATE,'utf8').trim()==='revise'){fs.unlinkSync(process.env.ART_REVIEW_GATE);continue;}
 break;
 }
 if(correction){
 for(const finalPhase of ['before','after']){
 const page=await browser.newPage({viewport:{width:1500,height:1040}});
 if(finalPhase==='before')for(const [f,body] of Object.entries(old))await page.route(`**/${f}`,r=>r.fulfill({contentType:'text/javascript',body}));
 await page.goto(`${base}/tools/verify-avatar-body.html`);await page.waitForFunction(()=>window.__ready);
 for(const view of ['front','side']){await page.evaluate(v=>window.avatarView(v),view);await page.screenshot({path:`${out}/${finalPhase==='before'?'before/':''}avatar-${view}.png`});}
 if(finalPhase==='after'){
  await page.evaluate(()=>{
   const {avatars,renderer:r,scene,camera}=window.__avatar1907;avatars.forEach((a,i)=>a.object.visible=i===5);scene.children.filter(v=>!v.isLight&&!v.isGroup).forEach(v=>v.visible=false);
   document.querySelector('#labels').hidden=true;r.setScissorTest(false);r.setSize(384,512);r.setViewport(0,0,384,512);camera.aspect=384/512;camera.updateProjectionMatrix();camera.position.set(.4,1,3.2);camera.lookAt(0,.95,0);avatars[5].setSuit(true);r.render(scene,camera);
  });
  await page.locator('canvas').screenshot({path:`${out}/suit-body.png`});
  await page.evaluate(()=>{
   const {avatars,renderer:r,scene,camera}=window.__avatar1907;avatars.forEach((a,i)=>a.object.visible=i===0);
   r.setSize(384,384);r.setViewport(0,0,384,384);camera.aspect=1;camera.updateProjectionMatrix();const target=avatars[0].bones.head.getWorldPosition(camera.position.clone());target.y+=.1*avatars[0].object.scale.y;camera.position.copy(target).add(camera.position.clone().set(.18,.03,.7));camera.lookAt(target);
  });
  result.suit={};
  for(const suit of [false,true])for(const extreme of ['min','max']){
   const data=await page.evaluate(({suit,extreme})=>{
    const {avatars,renderer:r,scene,camera}=window.__avatar1907,a=avatars[0];a.setSuit(suit);a.material.userData.u.uNose.value.set(...(extreme==='min'?[.75*.75,.75,.75]:[1.3*1.35,1.3,1.3]));r.render(scene,camera);const gl=r.getContext(),pixels=new Uint8Array(384*384*4);gl.finish();gl.readPixels(0,0,384,384,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return{pixels:Array.from(pixels),calls:r.info.render.calls,triangles:r.info.render.triangles,glError:gl.getError()};
   },{suit,extreme});
   const {pixels,...counts}=data;result.suit[`${suit?'suit':'bare'}-${extreme}`]={...counts,pixelHash:hash(Buffer.from(pixels)),variedChannels:new Set(pixels).size};
  }
  await page.locator('canvas').screenshot({path:`${out}/suit-mask.png`});
  if(result.suit['bare-min'].pixelHash===result.suit['bare-max'].pixelHash||result.suit['suit-min'].pixelHash!==result.suit['suit-max'].pixelHash||Object.values(result.suit).some(v=>v.calls!==1||v.glError||v.variedChannels<40))throw Error('suit/nose invariant failed');
 }
 await page.close();
 }
 }
 const page=await browser.newPage({viewport:{width:700,height:500}});
 page.on('pageerror',e=>result.errors.push({phase:'preview',error:e.message}));
 await page.goto(`${base}/tools/verify-avatar-body.html`);await page.waitForFunction(()=>window.__ready);
 result.preview=await page.evaluate(async()=>{
 const {AvatarPreview}=await import('/src/avatarpreview.js'),{avatars,renderer}=window.__avatar1907;
 renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();document.querySelector('header').remove();document.querySelector('#labels').remove();
 const host=document.createElement('div');host.style.cssText='display:flex;gap:16px;padding:16px';document.body.append(host);
 const canvas=document.createElement('canvas');canvas.style.cssText='width:220px;height:310px';host.append(canvas);const p=new AvatarPreview(canvas);window.__bodyPreview=p;
 p.draw(avatars[0].look,{yaw:.45});
 const r=p.renderer,data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
 return{width:canvas.width,height:canvas.height,calls:r.info.render.calls,bones:p.avatar.mesh.skeleton.bones.length,material:p.avatar.material.type,nonEmpty:data.some((v,i)=>i%4!==3&&v>80),look:p.avatar.look};
 });
 await page.locator('canvas').screenshot({path:`${out}/actual-preview.png`});
 await page.evaluate(()=>window.__bodyPreview.dispose());await page.close();
 if(!result.preview.nonEmpty||result.preview.calls!==1||result.preview.bones!==15||result.errors.length)throw Error('actual preview failed');
 result.pass=true;save();console.log('PASS',out);
 }finally{if(!global.__bodySharedBrowser)await browser.close();save();}
})().catch(e=>{console.error(e);process.exitCode=1;});
