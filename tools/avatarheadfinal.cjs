// #2002: remaining scoped controls/consumer/cost checks after the art gate, one owner, no World.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const out='docs/verification/2002',base=process.argv[2]||'http://localhost:8802',baseline='a05683d477d8705c912cd88b323ee21c555dcce6';
const files=['src/avatar.js','src/config.js','src/olof.js','src/avatarpreview.js','tools/verify-avatar-head.html'];
const old=Object.fromEntries(files.filter(f=>f.startsWith('src/')).map(f=>[f,execFileSync('git',['show',`${baseline}:${f}`],{maxBuffer:8e6})]));const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const result={baseline,environment:'One sequential owner after the art gate; Chromium/SwiftShader, DPR1; component only, no World. Warm timings are software diagnostics, not hardware FPS.',hashes:Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(f))])),errors:[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});result.chromium=browser.version();
try{
 for(const phase of ['before','after']){
  const page=await browser.newPage({viewport:{width:1200,height:600}});page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|GL_INVALID|VALIDATE_STATUS/.test(m.text()))result.errors.push(m.text());});
  if(phase==='before')for(const[f,body]of Object.entries(old))await page.route(`**/${f}`,r=>r.fulfill({contentType:'text/javascript',body}));
  await page.goto(`${base}/tools/verify-avatar-head.html`);await page.waitForFunction(()=>window.__ready);
  const dest=phase==='before'?`${out}/before`:out;
  for(const[mode,meeting]of [['quarter',false],['profile',false],['back',false],['front',true]]){
   await page.evaluate(({mode,meeting})=>{const H=window.H;H.setLooks(H.looks.filter((_,i)=>meeting||[0,1,4].includes(i)));H.draw(mode,meeting);},{mode,meeting});await page.screenshot({path:`${dest}/${meeting?'meeting':mode}.png`});
  }
  result[phase]=await page.evaluate(()=>{
   const H=window.H,r=H.renderer,gl=r.getContext(),rows=H.looks.map(look=>{H.setLooks([look]);H.draw();const a=H.avatars[0];return{look,calls:r.info.render.calls,triangles:r.info.render.triangles,bytes:Object.values(a.mesh.geometry.attributes).reduce((n,v)=>n+v.array.byteLength,0),bones:a.mesh.skeleton.bones.length,programs:r.info.programs.length,textures:r.info.memory.textures};});
   H.setLooks([H.looks[0]]);r.setSize(320,256);const times=[];for(let i=0;i<26;i++){const t=performance.now();H.draw('quarter',true);gl.finish();if(i>=6)times.push(performance.now()-t);}times.sort((a,b)=>a-b);
   return{rows,cost:{samples:20,warmup:6,drawingBuffer:[320,256],renderFinishMedianMs:times[10],renderFinishP95Ms:times[19],renderer:gl.getParameter(gl.RENDERER)},glError:gl.getError()};
  });
  if(phase==='after'){
   // Relevant combinations: controls in both directions, all hairstyles, beard, hats, specs, earrings, phones.
   for(const group of ['extremes','accessories']){
    result[group]=await page.evaluate(group=>{
     const H=window.H;H.renderer.setSize(1200,600);
     const controls=['eyeSize','eyeShape','headWidth','headLength','jaw','noseSize','noseWidth','ears','browThick','browY','hairLength','neck'];
     const looks=group==='extremes'?[{...H.looks[0],...Object.fromEntries(controls.map(k=>[k,0])),hat:1,glasses:1,earrings:3,facial:3},{...H.looks[1],...Object.fromEntries(controls.map(k=>[k,8])),hat:4,glasses:2,earrings:2,facial:1},{...H.looks[4],hairLength:8,headWidth:8,jaw:8,hat:3,glasses:3,phones:1}]:[{...H.looks[1],hairLength:0,hat:0,glasses:1,facial:0},{...H.looks[2],hat:2,phones:1,glasses:2,earrings:1,facial:2},{...H.looks[3],hat:0,phones:2,glasses:3,earrings:4,facial:3}];
     H.setLooks(looks);H.draw('quarter');return looks;
    },group);await page.screenshot({path:`${out}/${group}.png`});
   }
   // Same four facial hair looks, with closed/talking/kissing uniforms held after production update.
   result.mouth={};
   for(const state of ['closed','open','kiss']){
    const data=await page.evaluate(async state=>{
     const H=window.H;H.setLooks(Array.from({length:4},(_,facial)=>({...H.looks[0],facial})));for(const a of H.avatars){a.material.userData.u.uMouth.value=state==='open'?1:0;a.material.userData.u.uKiss.value=state==='kiss'?1:0;}H.draw('front');const gl=H.renderer.getContext(),pixels=new Uint8Array(1200*600*4);gl.finish();gl.readPixels(0,0,1200,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const digest=await crypto.subtle.digest('SHA-256',pixels);return{pixelHash:Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join(''),calls:H.renderer.info.render.calls};
    },state);result.mouth[state]={pixelHash:data.pixelHash,callsPerCell:data.calls};await page.screenshot({path:`${out}/mouth-${state==='kiss'?'kiss-final':state}.png`});
   }
   // Speech rhythm is sampled deterministically, without a second animation loop/world bootstrap.
   result.speech=await page.evaluate(()=>{const a=window.H.avatars[0];a.talk('Hej! Hur mår du idag?',6);const target=a.mouthTarget.bind(a),start=a.speech.start;let now=start;a.mouthTarget=()=>target(now);const v=[];for(let i=0;i<480;i++){now=start+i/60;a.update(1/60,{});v.push(a.mouth);}let swings=0;for(let i=1;i<v.length;i++)if((v[i]>.3)!==(v[i-1]>.3))swings++;return{peak:Math.max(...v),swings,end:v.at(-1),talking:a.talking};});
   result.suit={};await page.setViewportSize({width:384,height:384});
   for(const suit of [false,true])for(const extreme of ['min','max']){
    const data=await page.evaluate(({suit,extreme})=>{const H=window.H;H.setLooks([H.looks[0]]);H.renderer.setSize(384,384);const a=H.avatars[0];a.setSuit(suit);a.material.userData.u.uNose.value.set(...(extreme==='min'?[.75*.75,.75,.75]:[1.3*1.35,1.3,1.3]));H.draw('quarter');const gl=H.renderer.getContext(),pixels=new Uint8Array(384*384*4);gl.finish();gl.readPixels(0,0,384,384,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return{pixels:Array.from(pixels),calls:H.renderer.info.render.calls,glError:gl.getError()};},{suit,extreme});
    const{pixels,...counts}=data;result.suit[`${suit?'suit':'bare'}-${extreme}`]={...counts,pixelHash:hash(Buffer.from(pixels)),variedChannels:new Set(pixels).size};
   }await page.screenshot({path:`${out}/suit-mask.png`});
   // Actual production preview. No mocked head rendering or GLB-only substitute.
   await page.setViewportSize({width:440,height:310});
   result.preview=await page.evaluate(async()=>{const H=window.H;H.renderer.dispose();H.renderer.forceContextLoss();H.renderer.domElement.remove();const{AvatarPreview}=await import('/src/avatarpreview.js'),rows=[];document.body.style.display='flex';for(const look of[H.looks[1],{...H.looks[4],hat:1,glasses:2,facial:3}]){const c=document.createElement('canvas');c.style.cssText='width:220px;height:310px';document.body.append(c);const p=new AvatarPreview(c);p.draw(look,{closeup:true,yaw:.45});rows.push({look,calls:p.renderer.info.render.calls,bones:p.avatar.mesh.skeleton.bones.length,glError:p.renderer.getContext().getError()});p.dispose();}return rows;});await page.screenshot({path:`${out}/actual-preview.png`});
  }
  await page.close();console.log(phase,JSON.stringify(result[phase].cost));
 }
 for(let i=0;i<5;i++){const a=result.before.rows[i],b=result.after.rows[i];if(a.calls!==1||b.calls!==1||b.bones!==15||b.triangles>a.triangles*1.1||b.bytes>a.bytes*1.1||b.textures!==a.textures)throw Error('geometry/material budget');}
 if(new Set(Object.values(result.mouth).map(v=>v.pixelHash)).size!==3||result.speech.peak<.6||result.speech.swings<6||result.speech.end!==0||result.speech.talking)throw Error('mouth/speech positive control');
 if(result.suit['bare-min'].pixelHash===result.suit['bare-max'].pixelHash||result.suit['suit-min'].pixelHash!==result.suit['suit-max'].pixelHash||Object.values(result.suit).some(v=>v.calls!==1||v.glError||v.variedChannels<40))throw Error('mask/nose invariant');
 if(result.preview.some(v=>v.calls!==1||v.bones!==15||v.glError)||result.errors.length)throw Error(JSON.stringify(result.errors));result.pass=true;console.log('PASS head/controls/consumer/budget');
}finally{await browser.close();fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');}})().catch(e=>{console.error(e);process.exitCode=1});
