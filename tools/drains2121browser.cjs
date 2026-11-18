// #2121: manhole covers, gully grates and courtyard drains in the actual app. Phases: `before` (BEFORE_REV's config/street modules
// served in place of the new ones: no covers) and `after`: Sankt Lars väg by day (a manhole, gullies at both kerbs), a look down at
// a manhole and a gully, Karpvägen, a courtyard walk's grate, and the street in rain (#2099 wet). LOWMEM=1 adds &lowmem (phone
// profile: plain material). Draw/triangle/texture/program counts per shot, shader errors.
// tools/browsertest.sh node tools/drains2121browser.cjs http://localhost:8321 OUTDIR before|after   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8321',out=process.argv[3]||'/tmp/drains2121',phase=process.argv[4]||'after',rev=process.env.BEFORE_REV||'HEAD~1';
const FILES=['config','street'];
const VIEWS=[{name:'street',at:'-15,-25.6,90,-14'},{name:'manhole',at:'-21.6,-27,90,-50'},{name:'gully',at:'-11.8,-29.2,90,-45'},{name:'karpvagen',at:'-75,-14,180,-16'},
 {name:'courtyard',at:'-27.5,20.4,0,-48'},{name:'rain-street',at:'-15,-25.6,90,-14',weather:'rain'}];
const ONLY=process.env.ONLY?.split(','),VIEW={width:800,height:500},low=process.env.LOWMEM?'&lowmem':'';
(async()=>{const browser=await kit.launch();const result={phase,rev,lowmem:!!low,shots:[],errors:[]};try{
 for(const v of VIEWS){
  if(ONLY&&!ONLY.includes(v.name))continue;
  const ctx=await browser.newContext({viewport:VIEW,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')for(const f of FILES){const body=execFileSync('git',['show',`${rev}:src/${f}.js`],{maxBuffer:64e6});await ctx.route(new RegExp(`/src/${f}\\.js(\\?.*)?$`),r=>r.fulfill({body,contentType:'text/javascript'}));}
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|program|WebGL|GLSL/i.test(m.text()))result.errors.push(m.text().slice(0,600));});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&year=2026&month=6&day=10&time=13&freeze&weather=${v.weather||'clear'}&nobirds&test=lazy${low}`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:900000,polling:300});await kit.skipNameDialog(page);
  await page.evaluate(()=>{__app.day.paused=true;__app.step(0);});
  const file=path.join(out,`${phase}${low?'-lowmem':''}-${v.name}.png`);fs.mkdirSync(out,{recursive:true});await kit.shot(page,file);
  const info=await page.evaluate(()=>{const r=__app.renderer.info;let drains=null;__app.scene.traverse(o=>{if(o.name==='street-drains')drains={triangles:o.geometry.attributes.position.count/3,visible:o.visible,key:o.material.customProgramCacheKey()};});
   return{calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,geometries:r.memory.geometries,programs:r.programs?.length,drains,quality:__app.quality?.level};});
  result.shots.push({...v,file,...info});await ctx.close();
 }
}finally{await browser.close();}
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,phase+(low?'-lowmem':'')+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result.shots.map(s=>({n:s.name,calls:s.calls,tri:s.triangles,tex:s.textures,prog:s.programs,d:s.drains})),null,0));if(result.errors.length){console.log(result.errors);process.exitCode=1;}})().catch(e=>{console.error(e);process.exitCode=1});
