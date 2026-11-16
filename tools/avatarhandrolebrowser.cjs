// #2001 concrete semantic hand-tone correction; geometry/costs are separately byte-equivalent.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),crypto=require('node:crypto');
const base=process.argv[2]||'http://localhost:8801',out='docs/verification/2001',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const prior=fs.readFileSync('/tmp/2001-prior-avatar.js'),result={beforeAvatarSHA256:hash(prior),afterAvatarSHA256:hash(fs.readFileSync('src/avatar.js')),errors:[]};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 for(const phase of ['before','after']){
  const page=await browser.newPage({viewport:{width:1500,height:1040}});
  page.on('pageerror',e=>result.errors.push({phase,error:e.message}));page.on('console',m=>{if(m.type()==='error'&&/Shader|GL_INVALID|VALIDATE_STATUS/.test(m.text()))result.errors.push({phase,error:m.text()});});
  if(phase==='before')await page.route('**/src/avatar.js',r=>r.fulfill({contentType:'text/javascript',body:prior}));
  await page.goto(`${base}/tools/verify-avatar-body.html`);await page.waitForFunction(()=>window.__ready);
  await page.evaluate(()=>{
   const{avatars,renderer:r,scene,camera}=window.__avatar1907;avatars.forEach((a,i)=>a.object.visible=i===1);scene.children.filter(v=>!v.isLight&&!v.isGroup).forEach(v=>v.visible=false);document.querySelector('#labels').hidden=true;
   const a=avatars[1];a.gait=0;a.update(0,{});a.object.updateMatrixWorld(true);r.setScissorTest(false);r.setSize(384,384);r.setViewport(0,0,384,384);r.domElement.style.width='384px';r.domElement.style.height='384px';camera.aspect=1;camera.updateProjectionMatrix();const target=a.bones.shoulderR.getWorldPosition(camera.position.clone());target.y-=.06;camera.position.copy(target).add(camera.position.clone().set(-.65,.08,1).normalize().multiplyScalar(.65));camera.lookAt(target);
  });
  result[phase]={};
  for(const suit of [false,true]){
   const data=await page.evaluate(suit=>{const{avatars,renderer:r,scene,camera}=window.__avatar1907;avatars[1].setSuit(suit);r.render(scene,camera);const gl=r.getContext(),pixels=new Uint8Array(384*384*4);gl.finish();gl.readPixels(0,0,384,384,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return{pixels:Array.from(pixels),calls:r.info.render.calls,glError:gl.getError()};},suit);
   const{pixels,...counts}=data;result[phase][suit?'suit':'bare']={...counts,pixelHash:hash(Buffer.from(pixels))};
   if(!suit)await page.locator('canvas').screenshot({path:`${out}/${phase==='before'?'before/':''}hand-role-shoulder.png`});
  }
  if(phase==='after'){
   const pixels=await page.evaluate(()=>{
    const{avatars,renderer:r,scene,camera}=window.__avatar1907,a=avatars[1],original=a.mesh.geometry,g=original.clone();a.mesh.geometry=g;const p=g.attributes.position,role=g.attributes.suitRole;
    for(let i=0;i<p.count;i+=3)if(p.getX(i)<-.13&&p.getY(i)>1.27&&p.getY(i)<1.5&&g.attributes.bare.getX(i)>.5)for(let j=0;j<3;j++)role.setX(i+j,4);
    role.needsUpdate=true;a.setSuit(false);r.render(scene,camera);const gl=r.getContext(),data=new Uint8Array(384*384*4);gl.finish();gl.readPixels(0,0,384,384,gl.RGBA,gl.UNSIGNED_BYTE,data);a.mesh.geometry=original;g.dispose();return Array.from(data);
   });result.positiveControlHash=hash(Buffer.from(pixels));
   await page.reload();await page.waitForFunction(()=>window.__ready);
   for(const view of ['front','side','quarter']){await page.evaluate(v=>window.avatarView(v),view);await page.screenshot({path:`${out}/avatar-${view}.png`});}
   await page.evaluate(()=>{
    const{avatars,renderer:r,scene,camera,measured}=window.__avatar1907;scene.children.filter(v=>!v.isLight&&!v.isGroup).forEach(v=>v.visible=false);document.querySelector('#labels').hidden=true;r.setScissorTest(true);
    for(let i=0;i<6;i++){avatars.forEach((a,j)=>a.object.visible=i===j);const direction=camera.position.clone().set(.35,.05,1).normalize(),target=direction.clone().set(0,measured[i].max[1]-.24,0);camera.position.copy(target).addScaledVector(direction,1.45);camera.lookAt(target);r.setViewport(i%3*500,(1-Math.floor(i/3))*400,500,400);r.setScissor(i%3*500,(1-Math.floor(i/3))*400,500,400);r.render(scene,camera);}r.setScissorTest(false);
   });await page.screenshot({path:`${out}/avatar-meeting.png`});
   await page.setViewportSize({width:640,height:640});await page.evaluate(()=>{
    const{avatars,renderer:r,scene,camera}=window.__avatar1907;avatars.forEach((a,i)=>a.object.visible=i===0);document.querySelector('header').remove();document.querySelector('#labels').remove();r.setSize(640,640);r.setViewport(0,0,640,640);r.domElement.style.width='640px';r.domElement.style.height='640px';camera.aspect=1;camera.updateProjectionMatrix();const target=camera.position.clone().set(0,1.3,0);camera.position.copy(target).add(camera.position.clone().set(.75,.05,1).normalize().multiplyScalar(2));camera.lookAt(target);r.render(scene,camera);
   });await page.screenshot({path:`${out}/art-after.png`});
   for(const[name,index]of[['cloth',0],['skin',1]]){
    await page.evaluate(async index=>{const{armTarget}=await import('/src/avatar.js'),{avatars,renderer:r,scene,camera}=window.__avatar1907,a=avatars[index];avatars.forEach((v,i)=>v.object.visible=i===index);a.gait=0;a.update(0,{hands:{R:armTarget.up(-1,.6)}});a.object.updateMatrixWorld(true);const target=a.bones.shoulderR.getWorldPosition(camera.position.clone());target.y-=.08*a.object.scale.y;camera.position.copy(target).add(camera.position.clone().set(-.85,-.32,1).normalize().multiplyScalar(.95));camera.lookAt(target);r.render(scene,camera);},index);
    await page.screenshot({path:`${out}/art-axilla-${name}.png`});
   }
   await page.evaluate(async()=>{const{AvatarPreview}=await import('/src/avatarpreview.js'),{avatars,renderer}=window.__avatar1907;renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();const c=document.createElement('canvas');c.style.cssText='width:220px;height:310px';document.body.append(c);window.__handPreview=new AvatarPreview(c);window.__handPreview.draw(avatars[0].look,{yaw:.45});});
   await page.locator('canvas').screenshot({path:`${out}/actual-preview.png`});await page.evaluate(()=>window.__handPreview.dispose());
  }
  await page.close();
 }
 if(result.before.bare.pixelHash===result.after.bare.pixelHash||result.positiveControlHash===result.after.bare.pixelHash)throw Error('hand-tone positive control failed');
 if(result.before.suit.pixelHash!==result.after.suit.pixelHash)throw Error('suit mapping changed');
 if(result.errors.length)throw Error(JSON.stringify(result.errors));result.pass=true;console.log('PASS semantic hand tone; ordinary pixels differ, forced hand-tone control differs, suit pixels identical');
 }finally{await browser.close();fs.writeFileSync(`${out}/hand-role.json`,JSON.stringify(result,null,2)+'\n');}
})().catch(e=>{console.error(e);process.exitCode=1;});
