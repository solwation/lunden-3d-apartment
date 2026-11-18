// #2119: rain rings in the puddles and splash glitter on the wet film, in the actual app. Phases: `before` (BEFORE_REV's
// config / main / wetground served in place of the new ones) and `after`, each raining (`&weather=rain`, a short sequence of
// frames FRAME_DT s apart, after RAMP s of real time so the rings have faded in) and after the rain (the seeded shower of
// 2026-09-25 07:47–09:32, seen at 10:30: puddles but no rain, so no rings: compared pixel by pixel before/after).
// tools/browsertest.sh node tools/rainripples2119browser.cjs http://localhost:8319 OUTDIR before|after   (THREE_DIR = local three@0.170.0)
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8319',out=process.argv[3]||'/tmp/rip2119',phase=process.argv[4]||'after',rev=process.env.BEFORE_REV||'HEAD~1';
const FILES=['config','main','wetground'],FRAMES=Number(process.env.FRAMES||4),FRAME_DT=0.12,RAMP=6;
const VIEWS=[{name:'street-near',at:'5,-5,74,-32'},{name:'courtyard-near',at:'-31.2,31.6,25,-38'}];
const WEATHERS=[['rain','&weather=rain'],['afterrain','']];
const ONLY=process.env.ONLY?.split(',');
(async()=>{const browser=await kit.launch();const result={phase,rev,shots:[],errors:[]};try{
 for(const[w,param]of WEATHERS)for(const v of VIEWS){
  if(ONLY&&!ONLY.includes(`${w}-${v.name}`))continue;
  const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')for(const f of FILES){const body=execFileSync('git',['show',`${rev}:src/${f}.js`],{maxBuffer:64e6});await ctx.route(new RegExp(`/src/${f}\\.js(\\?.*)?$`),r=>r.fulfill({body,contentType:'text/javascript'}));}
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|program|WebGL|GLSL/i.test(m.text()))result.errors.push(m.text());});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&year=2026&month=9&day=25&time=10.5&freeze${param}&quality=3&nobirds&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000,polling:200});await kit.skipNameDialog(page);
  await page.setViewportSize(kit.FULL);
  await page.evaluate((ramp)=>{__app.day.paused=true;__app.testMode.setFull(true);for(let t=0;t<ramp;t+=0.05)__app.step(0.05);},RAMP); // quality 3 (puddles on) as kit.shot does, held for the sequence
  const frames=w==='rain'?FRAMES:1;
  for(let i=0;i<frames;i++){
   const info=await page.evaluate(async(dt)=>{if(dt)__app.step(dt);await new Promise(r=>requestAnimationFrame(r));__app.testMode.draw();
    const r=__app.renderer.info,W=__app.weather;let u=null,t=null;try{const m=await import('/src/wetground.js');u=m.wetUniforms.uGroundWet.value.toArray();t=m.wetUniforms.uWetTime?.value??null;}catch{}
    return{calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,programs:r.programs?.length,rain:W.rain,kind:W.kind,quality:__app.quality.level,uGroundWet:u,uWetTime:t};},i?FRAME_DT:0);
   const file=path.join(out,`${phase}-${w}-${v.name}${frames>1?`-${i}`:''}.png`);fs.mkdirSync(out,{recursive:true});await page.screenshot({path:file,timeout:300000});
   result.shots.push({weather:w,...v,frame:i,file,...info});
  }
  await ctx.close();
 }
}finally{await browser.close();}
 fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result.shots.map(s=>[s.file,s.calls,s.programs,s.uGroundWet,s.uWetTime]))+'\nerrors '+JSON.stringify(result.errors));if(result.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
