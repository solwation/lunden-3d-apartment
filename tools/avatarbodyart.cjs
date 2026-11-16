// #2001 corrective art gate: one standing production avatar before any final gallery.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const base=process.argv[2]||'http://localhost:8801',out='docs/verification/2001',gate=process.env.ART_REVIEW_GATE;
const files=['src/avatar.js','src/config.js','src/olof.js','src/avatarpreview.js'];
const old=Object.fromEntries(files.map(f=>[f,execFileSync('git',['show',`3f7c3d0b:${f}`],{maxBuffer:8e6})]));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  for(let revision=0;;revision++){
   const proof={revision,hashes:{}};
   for(const phase of ['before','after']){
    const page=await browser.newPage({viewport:{width:640,height:640}});
    if(phase==='before')for(const[f,body]of Object.entries(old))await page.route(`**/${f}`,r=>r.fulfill({contentType:'text/javascript',body}));
    await page.goto(`${base}/tools/verify-avatar-body.html`);await page.waitForFunction(()=>window.__ready);
    await page.evaluate(()=>{
     const{avatars,renderer:r,scene,camera}=window.__avatar1907;avatars.forEach((a,i)=>a.object.visible=i===0);scene.children.filter(v=>!v.isLight&&!v.isGroup).forEach(v=>v.visible=false);
     document.querySelector('header').remove();document.querySelector('#labels').remove();r.setScissorTest(false);r.setSize(640,640);r.setViewport(0,0,640,640);r.domElement.style.width='640px';r.domElement.style.height='640px';camera.aspect=1;camera.updateProjectionMatrix();const target=camera.position.clone().set(0,1.3,0);camera.position.copy(target).add(camera.position.clone().set(.75,.05,1).normalize().multiplyScalar(2));camera.lookAt(target);r.render(scene,camera);
    });
    await page.screenshot({path:`${out}/${phase==='before'?'before/':''}art-${phase}.png`});
    if(phase==='after')for(const [name,index]of [['cloth',0],['skin',1]]){
     await page.evaluate(async index=>{
      const{armTarget}=await import('/src/avatar.js'),{avatars,renderer:r,scene,camera}=window.__avatar1907;
      const a=avatars[index];avatars.forEach((v,i)=>v.object.visible=i===index);a.gait=0;a.update(0,{hands:{R:armTarget.up(-1,.6)}});a.object.updateMatrixWorld(true);
      const target=a.bones.shoulderR.getWorldPosition(camera.position.clone());target.y-=.08*a.object.scale.y;
      camera.position.copy(target).add(camera.position.clone().set(-.85,-.32,1).normalize().multiplyScalar(.95));camera.lookAt(target);r.render(scene,camera);
     },index);
     await page.screenshot({path:`${out}/art-axilla-${name}.png`});
    }
    await page.close();proof.hashes[phase]=Object.fromEntries(files.map(f=>[f,hash(phase==='before'?old[f]:fs.readFileSync(f))]));
   }
   fs.writeFileSync(`${out}/art.json`,JSON.stringify(proof,null,2)+'\n');console.log('STANDING_ART_READY',revision);
   const end=Date.now()+600000;while(!fs.existsSync(gate)){if(Date.now()>end)throw Error('standing art gate timed out');await new Promise(r=>setTimeout(r,1000));}
   const decision=fs.readFileSync(gate,'utf8').trim();fs.unlinkSync(gate);if(decision==='revise')continue;
   global.__bodySharedBrowser=browser;delete process.env.ART_REVIEW_GATE;
   await require('./avatarbodybrowser.cjs');break;
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
