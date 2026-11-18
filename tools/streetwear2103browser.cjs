// #2103: street wear in the actual app. Phases: `before` (BEFORE_REV's street modules served in place of the new ones) and
// `after`: a Sankt Lars väg street view, the corner/zebra intersection, a look down at the zebra and a near road view by day,
// and the street in rain (the #2099 wet patch over the wear). Draw/triangle/texture/program counts per shot, shader errors.
// tools/browsertest.sh node tools/streetwear2103browser.cjs http://localhost:8303 OUTDIR before|after   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8303',out=process.argv[3]||'/tmp/wear2103',phase=process.argv[4]||'after',rev=process.env.BEFORE_REV||'HEAD~1';
const FILES=['config','asphaltsurface','surroundings','street'];
const VIEWS=[{name:'street',at:'-6,-28.6,90,-11'},{name:'intersection',at:'4,-26.2,-75,-13'},{name:'zebra',at:'11,-22.3,0,-40'},{name:'near',at:'-17,-27.2,95,-38'},{name:'rain-street',at:'-6,-28.6,90,-11',weather:'rain'}];
const ONLY=process.env.ONLY?.split(',');
(async()=>{const browser=await kit.launch();const result={phase,rev,shots:[],errors:[]};try{
 for(const v of VIEWS){
  if(ONLY&&!ONLY.includes(v.name))continue;
  const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')for(const f of FILES){const body=execFileSync('git',['show',`${rev}:src/${f}.js`],{maxBuffer:64e6});await ctx.route(new RegExp(`/src/${f}\\.js(\\?.*)?$`),r=>r.fulfill({body,contentType:'text/javascript'}));}
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|program|WebGL|GLSL/i.test(m.text()))result.errors.push(m.text().slice(0,600));});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&year=2026&month=6&day=10&time=13&freeze&weather=${v.weather||'clear'}&nobirds&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:900000,polling:300});await kit.skipNameDialog(page);
  await page.evaluate(()=>{__app.day.paused=true;__app.step(0);});
  const file=path.join(out,`${phase}-${v.name}.png`);fs.mkdirSync(out,{recursive:true});await kit.shot(page,file);
  const info=await page.evaluate(async()=>{const r=__app.renderer.info,worn=[];let asphalt=null;__app.scene.traverse(o=>{if(o.isMesh&&o.material?.userData?.streetWear)worn.push(o.name||o.material.name);if(o.name==='site-asphalt')asphalt={vertices:o.geometry.attributes.position.count,attributes:Object.keys(o.geometry.attributes)};});
   let u=null;try{u=(await import('/src/wetground.js')).wetUniforms.uGroundWet.value.toArray();}catch{}
   return{calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,geometries:r.memory.geometries,programs:r.programs?.length,wearPrograms:r.programs?.filter(p=>/wear2103/.test(p.cacheKey)).length,uGroundWet:u,worn,asphalt,quality:__app.quality?.level};});
  result.shots.push({...v,file,...info});await ctx.close();
 }
}finally{await browser.close();}
 fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result,null,1));if(result.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
