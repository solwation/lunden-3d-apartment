// #2120: the neighbours' lit windows at 17/20/23/02 in November, before/after (before = BEFORE_SURROUNDINGS served as /src/surroundings.js).
// tools/browsertest.sh node tools/windowlights2120browser.cjs http://localhost:8320 OUTDIR before|after   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8320',out=process.argv[3]||'/tmp/windowlights2120',phase=process.argv[4]||'after';
const VIEWS=(process.env.VIEWS||'court:0,75,0,8;wide:-25,105,-8,7').split(';').map(s=>{const[name,at]=s.split(':');return{name,at};}),HOURS=(process.env.HOURS||'17,20,23,2').split(',').map(Number);
(async()=>{const browser=await kit.launch();const result={phase,views:[],errors:[]};try{
 for(const v of VIEWS){
  const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')await ctx.route(/\/src\/surroundings\.js(\?.*)?$/,r=>r.fulfill({path:process.env.BEFORE_SURROUNDINGS,contentType:'text/javascript'}));
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|program|WebGL/i.test(m.text()))result.errors.push(m.text());});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&month=11&day=12&time=17&freeze&weather=clear&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000,polling:200});await kit.skipNameDialog(page);
  for(const h of HOURS){
   const info=await page.evaluate(h=>{const A=__app;A.day.paused=true;A.day.hour=h;A.step(0);A.step(0);
    const w=A.world.windowLights,o=w.object,c=o.instanceColor.array;let lit=0,tv=0,sum=0;
    for(let i=0;i<o.count;i++){const r=c[i*3],g=c[i*3+1],b=c[i*3+2],m=Math.max(r,g,b);if(m>.05){lit++;sum+=m;if(b>r&&b>g*1.15)tv++;}}
    const ri=A.renderer.info;return{hour:h,windows:o.count,lit,share:+(lit/o.count).toFixed(3),blue:tv,meanLit:+(sum/Math.max(1,lit)).toFixed(3),calls:ri.render.calls,programs:ri.programs?.length};},h);
   const file=path.join(out,`${phase}-${v.name}-${String(h).padStart(2,'0')}.png`);fs.mkdirSync(out,{recursive:true});await kit.shot(page,file);info.drawCalls=await page.evaluate(()=>__app.renderer.info.render.calls);
   result.views.push({...v,...info,file});console.log(JSON.stringify(result.views.at(-1)));
  }
  if(phase==='after')result.flicker=await page.evaluate(async()=>{const A=__app;A.day.hour=21;A.step(0);const o=A.world.windowLights.object,c=o.instanceColor.array,snap=()=>Array.from(c);const a=snap();await new Promise(r=>setTimeout(r,400));A.step(0);const b=snap();let changed=0;for(let i=0;i<o.count;i++)if(Math.abs(a[i*3+2]-b[i*3+2])>1e-4)changed++;
   const t0=performance.now();for(let k=0;k<200;k++)A.world.windowLights.update(21+k*0.011,1,true);return{changedAfter400ms:changed,fullUpdateMs:+((performance.now()-t0)/200).toFixed(3)};});
  await ctx.close();
 }
}finally{await browser.close();}fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify({errors:result.errors,flicker:result.flicker}));if(result.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
