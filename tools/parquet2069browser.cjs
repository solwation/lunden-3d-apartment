const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),assert=require('assert/strict'),{launch}=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8181',out=process.argv[3]||'docs/verification/2069';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await launch(),proof={baseline:'8111f1e3',environment:'Chromium/SwiftShader, fixed900x600, DPR1, MSAA, NeutralToneMapping, same production level/plate builders and camera/lights'};
 try{
 for(const phase of ['before','after']){
  const page=await browser.newPage({viewport:{width:900,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.route('**/src/world.js',r=>{
   const src=phase==='before'?execFileSync('git',['show','8111f1e3:src/world.js'],{maxBuffer:10e6}).toString():fs.readFileSync('src/world.js','utf8');
   return r.fulfill({contentType:'text/javascript',body:src+'\nexport { M, SM, buildLevel, plate };\n'});
  });
  await page.goto(`${base}/tools/parquet2069.html?phase=${phase}`);await page.waitForFunction(()=>window.__ready,null,{timeout:180000});
  proof[phase]={views:{},textures:await page.evaluate(()=>window.__textures())};
  for(const[type,id]of [[0,'chalk'],[1,'standard']])for(const view of ['near','room']){
   proof[phase].views[id+'-'+view]=await page.evaluate(({type,view})=>window.__render(type,view),{type,view});
   await page.screenshot({path:path.join(out,phase+'-'+id+'-'+view+'.jpg'),type:'jpeg',quality:92});
  }
  if(phase==='after')proof.textureChecks=await page.evaluate(()=>window.__textureChecks());proof[phase].errors=errors;assert.deepEqual(errors,[]);
  await page.close();
 }
 for(const k of Object.keys(proof.before.views))assert.deepEqual(proof.before.views[k],proof.after.views[k],k+' same draws and geometry');
 for(let i=0;i<2;i++){assert.deepEqual(proof.before.textures[i].maps[0],proof.after.textures[i].maps[0]);assert.equal(proof.after.textures[i].maps.length,2);assert(proof.after.textures[i].sameRoughUV);assert.equal(proof.before.textures[i].roughness,proof.after.textures[i].roughness);}
 console.log('texture checks',JSON.stringify(proof.textureChecks));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(proof,null,2)+'\n');
 for(const c of proof.textureChecks){assert(c.cached&&c.opaque);assert(c.roughMin>=220&&c.roughMax===255);assert(c.roughMin<c.roughMax);}
 const compose=await browser.newPage({viewport:{width:1800,height:1280},deviceScaleFactor:1});
 for(const id of ['chalk','standard']){
  const images=['near','room'].flatMap(view=>['before','after'].map(phase=>`<img src="data:image/jpeg;base64,${fs.readFileSync(path.join(out,phase+'-'+id+'-'+view+'.jpg')).toString('base64')}">`));
  await compose.setContent('<style>body{margin:0;display:grid;grid-template-columns:900px 900px}img{display:block;width:900px;height:640px}</style>'+images.join(''));
  await compose.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));
  await compose.screenshot({path:path.join(out,id+'-comparison.jpg'),type:'jpeg',quality:93});
 }
 await compose.close();
 for(const phase of ['before','after'])for(const id of ['chalk','standard'])for(const view of ['near','room'])fs.unlinkSync(path.join(out,phase+'-'+id+'-'+view+'.jpg'));
 proof.status='passed';
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(proof,null,2)+'\n');console.log('PASS production original/standard close/room, unchanged draws/geometry, texture scale/cache/opaque/matte range, no errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
