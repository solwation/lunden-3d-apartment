// #2105: fallen autumn leaves in the actual app. Phases: `before` (BEFORE_REV's modules served in place of the changed ones) and
// `after`; each view loads once and switches month in the page (applySeason): July (control), September, October, November, January.
// tools/browsertest.sh node tools/leaflitter2105browser.cjs http://localhost:8305 OUTDIR before|after   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8305',out=process.argv[3]||'/tmp/litter2105',phase=process.argv[4]||'after',rev=process.env.BEFORE_REV||'HEAD~1';
const FILES=(process.env.FILES||'config,main,grass,wetground,street').split(',');
const VIEWS=[{name:'courtyard',at:'-31.2,31.6,25,-24'},{name:'park',at:'-8,52,200,-12'},{name:'street',at:'5,-5,74,-10'}].filter(v=>!process.env.VIEWS||process.env.VIEWS.split(',').includes(v.name));
const MONTHS=(process.env.MONTHS||'7,9,10,11,1').split(',').map(Number),VP={width:960,height:540};
(async()=>{const browser=await kit.launch();const result={phase,rev,shots:[],errors:[]};try{
 for(const v of VIEWS){
  const ctx=await browser.newContext({viewport:VP,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')for(const f of FILES){let body;try{body=execFileSync('git',['show',`${rev}:src/${f}.js`],{maxBuffer:64e6});}catch{continue;}await ctx.route(new RegExp(`/src/${f}\\.js(\\?.*)?$`),r=>r.fulfill({body,contentType:'text/javascript'}));}
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(`${v.name}: ${e.message}`));page.on('console',m=>{if(m.type()==='error'&&/shader|program|WebGL|GLSL/i.test(m.text()))result.errors.push(`${v.name}: ${m.text()}`);});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&year=2026&month=10&day=20&time=13&freeze&weather=clear&nobirds&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000,polling:200});await kit.skipNameDialog(page);
  for(const m of MONTHS){
   for(const detail of(phase==='after'&&m===11?[1,0]:[1])){
   // test=lazy pins quality level 0 (mean tint only); the shots force the leaf shapes on as at level >= LEAF_LITTER.minLevel on desktop, plus one tint-only November shot
   await page.evaluate(async([m,detail])=>{const A=__app;A.day.month=m;A.day.paused=true;(await import('/src/seasons.js')).applySeason(m);try{(await import('/src/leaflitter.js')).litterUniforms.uLitter.value.y=detail;}catch{}A.step(0);A.step(0);},[m,detail]);
   const file=path.join(out,`${phase}-${v.name}-m${m}${detail?'':'-tint'}.png`);fs.mkdirSync(out,{recursive:true});await kit.shot(page,file);
   const info=await page.evaluate(async()=>{const r=__app.renderer.info;let litter=null;try{const L=await import('/src/leaflitter.js');litter=L.litterUniforms.uLitter.value.toArray().map(x=>+x.toFixed(3));}catch{}
    let patched=0;__app.scene.traverse(o=>{if(o.isMesh&&o.material?.userData?.leafLitter)patched++;});
    let near=null;try{const T=(await import('/src/surroundings.js')).aoTrees,c=__app.camera.position;near=T.filter(t=>Math.hypot(t.x-c.x,t.z-c.z)<25).length;}catch{}
    return{near,calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,programs:r.programs?.length,quality:__app.quality.level,litter,patched};});
   result.shots.push({view:v.name,month:m,detail,file,...info});
  }}
  await ctx.close();
 }
}finally{await browser.close();}
 fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result,null,1));if(result.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
