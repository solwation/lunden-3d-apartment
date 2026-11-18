// #2091: grass detail repetition at 10–20 m, actual consumers before/after (before = BEFORE_GRASS file served as /src/grass.js).
// tools/browsertest.sh node tools/grass2091browser.cjs http://localhost:8291 OUTDIR before|after   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable; VIEWS=a,b to pick)
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8291',out=process.argv[3]||'/tmp/grass2091',phase=process.argv[4]||'after';
const ONLY=process.env.VIEWS?.split(','),VIEWS=[
 {name:'park-mid',at:'-8,52,200,-6',month:6},
 {name:'court-mid',at:'-4,22.6,95,-7',month:6},
 {name:'far-summer',at:'-8,52,200,-16,22',month:6},
 {name:'park-winter',at:'-8,52,200,-6',month:1},
].filter(v=>!ONLY||ONLY.includes(v.name));
(async()=>{const browser=await kit.launch();const result={phase,views:[],errors:[],console:[]};try{
 for(const v of VIEWS){
  const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')await ctx.route(/\/src\/grass\.js(\?.*)?$/,r=>r.fulfill({path:process.env.BEFORE_GRASS,contentType:'text/javascript'}));
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  page.on('console',m=>{const t=m.text();if(/THREE\.WebGLProgram|shader|GL_INVALID/i.test(t))result.console.push(t.slice(0,400));});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&month=${v.month}&day=2&time=13&freeze&weather=clear&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000,polling:200});await kit.skipNameDialog(page);
  await page.evaluate(async m=>{const A=__app;A.day.month=m;A.day.paused=true;(await import('/src/seasons.js')).applySeason(m);A.step(0);},v.month);
  const file=path.join(out,`${phase}-${v.name}.png`);fs.mkdirSync(out,{recursive:true});await kit.shot(page,file);
  const info=await page.evaluate(()=>{const r=__app.renderer.info,progs=(r.programs||[]).filter(p=>/grass/i.test(p.name||'')||/grass/.test(p.cacheKey||''));
   return{calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,geometries:r.memory.geometries,programs:(r.programs||[]).length,
    grassPrograms:progs.map(p=>({key:(p.cacheKey||'').slice(-40),diag:p.diagnostics?{ok:p.diagnostics.runnable,log:p.diagnostics.programLog}:null}))};});
  if(v.name==='park-mid'){const mc=await page.evaluate(async()=>{const c=(await import('/src/grass.js')).grassMeanColor();return[c.r,c.g,c.b].map(x=>+x.toFixed(5));});result.mean=mc;}
  result.views.push({...v,file,...info});await ctx.close();
 }
}finally{await browser.close();}fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result,null,1));if(result.errors.length||result.console.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
