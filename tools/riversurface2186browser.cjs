// #2186: Höje å mirrors the sky and its ripples drift downstream, in the actual app (before = BEFORE_REV's config / riversurface / riverbridge).
// tools/browsertest.sh node tools/riversurface2186browser.cjs http://localhost:8350 OUTDIR before|after
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8350',out=process.argv[3]||'/tmp/river2186',phase=process.argv[4]||'after',rev=process.env.BEFORE_REV||'43249c46';
const FILES=['config','riversurface','riverbridge'];
const VIEWS=process.env.VIEWS?JSON.parse(process.env.VIEWS):[{name:'gc-bridge-west',at:'18,123,90,-22,-3',time:13},{name:'gc-bridge-west-dusk',at:'18,123,90,-22,-3',time:18.6},{name:'road-bridge-east-dusk',at:'24,123,-90,-20,-3',time:18.6}];
(async()=>{const browser=await kit.launch();const result={phase,rev,shots:[],errors:[]};try{
 for(const v of VIEWS){
  const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')for(const f of FILES){const body=execFileSync('git',['show',`${rev}:src/${f}.js`],{maxBuffer:64e6});await ctx.route(new RegExp(`/src/${f}\\.js(\\?.*)?$`),r=>r.fulfill({body,contentType:'text/javascript'}));}
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|program|WebGL|GLSL/i.test(m.text()))result.errors.push(m.text());});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&year=2026&month=9&day=25&time=${v.time}&freeze&quality=3&nobirds&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000,polling:200});await kit.skipNameDialog(page);
  await page.setViewportSize(kit.FULL);
  await page.evaluate(()=>{__app.day.paused=true;__app.testMode.setFull(true);for(let t=0;t<2;t+=0.05)__app.step(0.05);});
  for(const [i,dt] of [[0,0],[1,1.5]]){
   const info=await page.evaluate(async(dt)=>{if(dt)__app.step(dt);await new Promise(r=>requestAnimationFrame(r));__app.testMode.draw();const r=__app.renderer.info;let t=null;try{t=(await import('/src/wetground.js')).wetUniforms.uWetTime.value;}catch{}
    return{calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,programs:r.programs?.length,uWetTime:t};},dt);
   if(phase==='before'&&i)continue;
   const file=path.join(out,`${phase}-${v.name}${i?'-later':''}.png`);fs.mkdirSync(out,{recursive:true});await page.screenshot({path:file,timeout:300000});result.shots.push({...v,frame:i,file,...info});
  }
  await ctx.close();
 }
}finally{await browser.close();}
 fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result.shots.map(s=>[s.file,s.calls,s.triangles,s.programs,s.uWetTime]))+'\nerrors '+JSON.stringify(result.errors));if(result.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
