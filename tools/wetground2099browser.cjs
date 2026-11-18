// #2099: wet ground in the actual app. Phases: `before` (BEFORE_REV's ground modules served in place of the new ones) dry and
// raining; `after` dry, raining and after rain (the seeded shower of 2026-09-25 07:47–09:32, seen at 10:30 with a clear sky).
// Dry before/after are compared pixel by pixel. Street (asphalt, kerbs, pavements, zebra) and courtyard (paving, gravel).
// tools/browsertest.sh node tools/wetground2099browser.cjs http://localhost:8299 OUTDIR before|after   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8299',out=process.argv[3]||'/tmp/wet2099',phase=process.argv[4]||'after',rev=process.env.BEFORE_REV||'HEAD~1';
const FILES=['config','main','weather','asphaltsurface','gravelsurface','pavingsurface','surroundings','riverpark','courtyard','street','sitebackdrop'];
const VIEWS=[{name:'street',at:'5,-5,74,-10'},{name:'street-high',at:'5,-9,74,-22,3.5'},{name:'courtyard',at:'-31.2,31.6,25,-24'}];
const WEATHERS=phase==='before'?[['dry','&weather=clear'],['rain','&weather=rain']]:[['dry','&weather=clear'],['rain','&weather=rain'],['afterrain','']];
const ONLY=process.env.ONLY?.split(',');
(async()=>{const browser=await kit.launch();const result={phase,rev,shots:[],errors:[]};try{
 for(const[w,param]of WEATHERS)for(const v of VIEWS){
  if(ONLY&&!ONLY.includes(`${w}-${v.name}`))continue;
  const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')for(const f of FILES){const body=execFileSync('git',['show',`${rev}:src/${f}.js`],{maxBuffer:64e6});await ctx.route(new RegExp(`/src/${f}\\.js(\\?.*)?$`),r=>r.fulfill({body,contentType:'text/javascript'}));}
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|program|WebGL|GLSL/i.test(m.text()))result.errors.push(m.text());});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&year=2026&month=9&day=25&time=10.5&freeze${param}&nobirds&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000,polling:200});await kit.skipNameDialog(page);
  await page.evaluate(()=>{__app.day.paused=true;__app.step(0);});
  const file=path.join(out,`${phase}-${w}-${v.name}.png`);fs.mkdirSync(out,{recursive:true});await kit.shot(page,file);
  const info=await page.evaluate(async()=>{const r=__app.renderer.info,W=__app.weather,wet=[];__app.scene.traverse(o=>{if(o.isMesh&&o.material?.userData?.wetGround)wet.push(o.name||o.material.name||o.material.userData.wetGround);});
   let u=null;try{u=(await import('/src/wetground.js')).wetUniforms.uGroundWet.value.toArray();}catch{}
   return{calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,programs:r.programs?.length,rain:W.rain,kind:W.kind,quality:__app.quality.level,uGroundWet:u,wetMeshes:wet.length};});
  result.shots.push({weather:w,...v,file,...info});await ctx.close();
 }
}finally{await browser.close();}
 fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result,null,1));if(result.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
