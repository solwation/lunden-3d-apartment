const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const[base='http://localhost:8216',out='docs/verification/2084']=process.argv.slice(2),baseline='a366067a79ab90a67abc5a66b3db205f67788506',sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const save=(name,data)=>fs.writeFileSync(path.join(out,name),Buffer.from(data.split(',')[1],'base64'));
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const proof={baseline,results:{}},pictures={};
try{for(const phase of['before','after']){
 const page=await browser.newPage({viewport:{width:1100,height:720}}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/THREE.WebGLProgram/.test(m.text()))errors.push(m.text())});page.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)external.push(r.url())});
 if(phase==='before')for(const f of['src/avatar.js','src/config.js']){const body=execFileSync('git',['show',`${baseline}:${f}`],{maxBuffer:16e6});await page.route('**/'+f,r=>r.fulfill({contentType:'text/javascript',body}));}
 await page.goto(base+'/tools/avatartrainers2084.html');await page.waitForFunction(()=>window.__ready,null,{timeout:120000});pictures[phase]={};const views={};
 for(const name of['chaise-near','chaise','short-chaise']){const v=await page.evaluate(n=>window.__view(n),name);pictures[phase][name]=v.image;delete v.image;views[name]=v;if(phase==='after')save(name+'.png',pictures[phase][name]);}
 const budget=await page.evaluate(()=>window.__budget()),controls=await page.evaluate(()=>window.__controls());pictures[phase].mirror=controls.mirrorImage;delete controls.mirrorImage;delete controls.heldImage;
 for(const[k,v]of Object.entries(controls.checks))assert.equal(v,true,k);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);proof.results[phase]={views,budget,controls,errors,external};
 if(phase==='after')for(const[file,names]of[['feet-paired.png',['chaise-near','chaise']],['short-mirror-paired.png',['short-chaise','mirror']]]){const data=await page.evaluate(async({pictures,names})=>{const c=document.createElement('canvas');c.width=2200;c.height=36+720*names.length;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#111';g.font='22px sans-serif';g.fillText('BEFORE',16,26);g.fillText('AFTER',1116,26);for(const[col,phase]of['before','after'].entries())for(const[row,name]of names.entries()){const img=new Image();img.src=pictures[phase][name];await img.decode();g.drawImage(img,col*1100,row*720+36)}return c.toDataURL('image/png')},{pictures,names});save(file,data)}
 await page.close();
 }
 const a=proof.results.before,b=proof.results.after;
 for(const[name,v]of Object.entries(b.views)){
  const old=a.views[name];for(const k of['camera','feet','root','yaw','objectYaw','spot','pose','look','material','hiddenAfterFrame','maskAfterFrame','boneTexture'])assert.deepEqual(v[k],old[k],name+':'+k);
  assert.equal(v.avatarTriangles,old.avatarTriangles+392);assert.equal(v.rendered.calls,old.rendered.calls);assert.equal(v.rendered.triangles,old.rendered.triangles+392);assert.equal(v.rendered.textures,old.rendered.textures);assert.equal(v.rendered.programs,old.rendered.programs);assert.equal(v.hiddenAfterFrame,true);assert.deepEqual(v.maskAfterFrame,[0,0]);
 }
 for(const k of['material','programs','restConfig','stateCallback','renderHook'])assert.deepEqual(b.budget[k],a.budget[k],k);assert.equal(b.budget.triangles,a.budget.triangles+392);
 proof.sourceSha256=Object.fromEntries(['src/avatartrainers.js','src/avatar.js','src/config.js','src/avatarselfview.js','src/ghosts.js','src/main.js','src/rest.js','src/remote-pose.js','src/olof.js','tools/avatartrainers2084.html','tools/avatartrainers2084browser.cjs'].map(f=>[f,sha(fs.readFileSync(f))]));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({pass:true,views:b.views,budget:b.budget.geometryAttributes,controls:b.controls,errors:b.errors,external:b.external}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
