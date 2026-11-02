// #1813: same actual overview in summer/autumn, unchanged source geometry and shared seasonal grass/snow contract.
// tools/browsertest.sh node tools/schoolgrasstest.cjs GAME OUT before|after
const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8937',out=process.argv[3]||'/tmp/schoolgrass1813',phase=process.argv[4]||'after',contractOnly=process.argv.includes('--contract-only');
let pass=true;const results=[];const check=(ok,name,data)=>{results.push({ok:!!ok,name,data});pass&&=!!ok;console.log(`${ok?'PASS':'FAIL'} ${name}${data?' '+JSON.stringify(data):''}`);};
(async()=>{const browser=await kit.launch();try{
 const ctx=await browser.newContext({viewport:kit.SMALL,deviceScaleFactor:1});
 if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',route=>route.fulfill({path:path.join(process.env.THREE_DIR,new URL(route.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/?shot&cloud=&at=195,15,40,-38,125&month=6&day=2&time=13&freeze&weather=clear&test=lazy`,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:180000,polling:100});await kit.skipNameDialog(page);fs.mkdirSync(out,{recursive:true});
 const data=await page.evaluate(async()=>{
   const A=__app,C=await import('/src/config.js'),Y=await import('/src/schoolyard.js'),T=await import('three'),S=await import('/src/seasons.js');
   const hash=async rows=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rows.sort().join('\n'))))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const access=A.scene.getObjectByName('east-access'),lawn=A.scene.getObjectByName('east-lawn'),parts=[access,...(lawn?[lawn]:[])],vertices=[];
   for(const m of parts){const p=m.geometry.attributes.position,n=m.geometry.attributes.normal;for(let i=0;i<p.count;i++)vertices.push([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].join(','));}
   const source=[],nonlawns=[];
   for(const area of['west','north','east','south'])for(const p of[...C.SITE[area].access,...C.SITE[area].paths])if(p.yard){
     const captures=[],g=Y.schoolyardParts(p.yard,(x,z)=>x*.01+z*.02,(poly,lift)=>{captures.push({poly,lift});return null;});
     source.push({id:p.source,captures});for(const geo of g){nonlawns.push(p.source+':'+geo.userData.tint+':'+Array.from(geo.attributes.position.array).join(','));geo.dispose();}
   }
   const terrain=[];A.scene.traverse(o=>{if(o.isMesh&&o.material?.name==='seasonal-grass'&&o!==lawn)terrain.push(o.material);});
   // Streetlife deliberately uses a darker lawn variant; compare to the terrain's standard GRASS.summer material.
   const material=terrain.find(m=>m.color.getHex()===C.GRASS.summer),season=[];
   if(!material)throw Error('Standard terrain grass reference missing');
   if(lawn)for(const month of[6,11,12,6]){S.applySeason(month);season.push({month,color:lawn.material.color.getHex(),sameColor:lawn.material.color.equals(material.color),sameMap:lawn.material.map===material.map,snowMap:lawn.material.map===null});}
   S.applySeason(6);A.day.month=6;
   const uv=lawn?.geometry.attributes.uv,p=lawn?.geometry.attributes.position;
   return{geometry:await hash(vertices),vertices:vertices.length,source,nonlawns:await hash(nonlawns),lawn:!!lawn,lawnVertices:p?.count??0,
     uv:!!uv&&Array.from({length:p.count},(_,i)=>uv.getX(i)===p.getX(i)&&uv.getY(i)===p.getZ(i)).every(Boolean),
     material:lawn?.material.name,program:lawn?.material.customProgramCacheKey(),sharedProgram:!!lawn&&lawn.material.customProgramCacheKey()===material.customProgramCacheKey(),season};
 });
 if(phase==='after'){
   const before=JSON.parse(fs.readFileSync(path.join(out,'before.json'),'utf8')).data;
   check(data.geometry===before.geometry&&data.vertices===before.vertices,'all actual school access/lawn positions and normals are unchanged',{vertices:data.vertices});
   check(JSON.stringify(data.source)===JSON.stringify(before.source)&&data.nonlawns===before.nonlawns,'all source lawn/sand/play polygons, lifts and other school parts are unchanged');
   check(data.lawn&&data.lawnVertices>100&&data.uv&&data.material==='seasonal-grass'&&data.sharedProgram,'lawns reuse existing grass shader with world-metre UVs',{vertices:data.lawnVertices,material:data.material});
   check(data.season.every(s=>s.sameColor&&s.sameMap)&&data.season[2].snowMap&&!data.season[3].snowMap,'summer, autumn, snow and return to summer exactly match surrounding grass',data.season);
 }
 const shots=[];
 for(const month of contractOnly?[]:[6,11]){
   await page.evaluate(async month=>{const A=__app;A.day.month=month;A.day.paused=true;const S=await import('/src/seasons.js');S.applySeason(month);A.step(0);},month);
   await kit.shot(page,path.join(out,`${phase}-${month===6?'summer':'autumn'}.png`));
   shots.push(await page.evaluate(()=>({month:__app.day.month,camera:__app.camera.position.toArray(),calls:__app.renderer.info.render.calls,triangles:__app.renderer.info.render.triangles})));
 }
 check(errors.length===0,'no browser page errors',errors);
 fs.writeFileSync(path.join(out,phase+(contractOnly?'-contract':'')+'.json'),JSON.stringify({pass,data,shots,results},null,2));console.log(JSON.stringify(shots));
}finally{await browser.close();}if(!pass)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1});
