// #2096: actual gravel consumers before/after (before = BEFORE_DIR's courtyard.js/riverpark.js served as /src/…): the boule court
// and the courtyard gravel in walk view, a park gravel path in walk view, the courtyard from above (far) and winter.
// tools/browsertest.sh node tools/gravel2096browser.cjs http://localhost:8296 OUTDIR before|after   (THREE_DIR = local three@0.170.0 package if the CDN is unreachable)
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8296',out=process.argv[3]||'/tmp/gravel2096',phase=process.argv[4]||'after';
const ONLY=process.env.VIEWS?.split(','),VIEWS=[
 {name:'walk-boule',at:'-31.2,31.6,25,-24',month:6},
 {name:'close-boule',at:'-33.6,29.6,20,-48',month:6},
 {name:'walk-park',at:'-40.3,99,4,-16',month:6},
 {name:'far-courtyard',at:'-14,46,30,-38,16',month:6},
 {name:'walk-winter',at:'-31.2,31.6,25,-24',month:1},
].filter(v=>!ONLY||ONLY.includes(v.name));
(async()=>{const browser=await kit.launch();const result={phase,views:[],errors:[]};try{
 for(const v of VIEWS){
  const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  if(phase==='before')for(const f of['courtyard','riverpark'])await ctx.route(new RegExp(`/src/${f}\\.js(\\?.*)?$`),r=>r.fulfill({path:path.join(process.env.BEFORE_DIR,f+'.js'),contentType:'text/javascript'}));
  const page=await ctx.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|program|WebGL/i.test(m.text()))result.errors.push(m.text());});
  await page.goto(`${base}/?shot&cloud=&at=${v.at}&month=${v.month}&day=2&time=13&freeze&weather=clear&test=lazy`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000,polling:200});await kit.skipNameDialog(page);
  await page.evaluate(async m=>{const A=__app;A.day.month=m;A.day.paused=true;(await import('/src/seasons.js')).applySeason(m);A.step(0);},v.month);
  const file=path.join(out,`${phase}-${v.name}.png`);fs.mkdirSync(out,{recursive:true});await kit.shot(page,file);
  const info=await page.evaluate(()=>{const r=__app.renderer.info,mats=[];__app.scene.traverse(o=>{if(o.isMesh&&(o.name==='park-paths'||o.material?.userData?.gravelSurface||(o.material?.color?.getHex?.()===0xcfc6b2)))mats.push({name:o.name||o.material.name,tris:(o.geometry.index?.count??o.geometry.attributes.position.count)/3,map:!!o.material.map,vc:!!o.material.vertexColors});});
   return{calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,geometries:r.memory.geometries,gravel:mats};});
  result.views.push({...v,file,...info});await ctx.close();
 }
}finally{await browser.close();}fs.writeFileSync(path.join(out,phase+'.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result,null,1));if(result.errors.length)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
