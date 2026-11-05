// #1875: real producer, pre-upload scene inventory, paired pack timing, normal/lowmem close views.
// LOWMEM_BEFORE points to the unchanged base src/lowmemory.js; serve this checkout and use browsertest.sh.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const harnessSha256=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const base=process.argv[2]||'http://localhost:8975',out=process.argv[3]||'docs/verification/1875',phase=process.argv[4]||'after';
const catOnly=process.argv.includes('--cat-only');
const original=fs.readFileSync(process.env.LOWMEM_BEFORE,'utf8'),current=fs.readFileSync('src/lowmemory.js','utf8'),source=phase==='before'?original:current;
fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await kit.launch();try{
 for(const low of (catOnly?[true]:[true,false])){
  const ctx=await browser.newContext({viewport:{width:960,height:720},deviceScaleFactor:1});
  if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  await ctx.addInitScript(()=>{
   const seed=1234567;let n=seed;Math.random=()=>((n=Math.imul(1664525,n)+1013904223|0)>>>0)/4294967296;
   window.__packAudit={geometries:0,vertices:0,nonUnit:0,zero:0,rows:[],payloadUntouched:true};window.__packInputs=[];const seen=new WeakSet();
   window.__auditNormal=(g,a)=>{if(seen.has(a))return;seen.add(a);__packInputs.push(a.array);const s=__packAudit;let bad=0,zero=0,min=Infinity,max=0;for(let i=0;i<a.count;i++){const j=i*3,l=Math.hypot(a.array[j],a.array[j+1],a.array[j+2]);if(!l)zero++;else if(Math.abs(l-1)>1e-4){bad++;min=Math.min(min,l);max=Math.max(max,l);}}s.geometries++;s.vertices+=a.count;s.nonUnit+=bad;s.zero+=zero;if(bad||zero)s.rows.push({name:g.userData.freeLabel||g.name||g.type,vertices:a.count,nonUnit:bad,zero,min,max});return[g.attributes.position,g.attributes.uv,g.index];};
   window.__auditPayload=(g,old)=>{if(old)__packAudit.payloadUntouched&&=old[0]===g.attributes.position&&old[1]===g.attributes.uv&&old[2]===g.index;};
  });
  const audited=source.replace('  let q = packed.get(a);','  const auditPayload = window.__auditNormal(geo,a);\n  let q = packed.get(a);').replace("  geo.setAttribute('normal', q);","  geo.setAttribute('normal', q);\n  window.__auditPayload(geo,auditPayload);");
  await ctx.route('**/src/lowmemory.js',r=>r.fulfill({body:audited,contentType:'text/javascript'}));
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/?shot&cloud=&at=1.1,10.9,0,0&month=6&day=2&time=13&freeze&weather=clear&quality=3${low?'&lowmem':''}`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:240000,polling:100});await kit.skipNameDialog(page);
  const data=await page.evaluate(async({low,phase,beforeFunction,afterFunction})=>{
   const A=__app,T=await import('three'),C=await import('/src/config.js'),{copperPot}=await import('/src/plantpots.js'),{freeSceneGeometryCopies}=await import('/src/lowmemory.js');
   A.renderer.setAnimationLoop(null);A.camera.position.set(1.05,.62,10.87);A.camera.lookAt(.37,.24,11.4);A.camera.updateMatrixWorld();
   const sceneAudit=JSON.parse(JSON.stringify(__packAudit));
   let component=null,timing=null;
   if(low){
    const item=C.FURNITURE.find(x=>x.type==='zzplant'),root=copperPot(item.pot),pot=root.getObjectByName('brushed-copper-pot'),g=pot.geometry,src=g.attributes.normal.clone(),position=g.attributes.position,uv=g.attributes.uv,index=g.index;
    freeSceneGeometryCopies(root);let maxAngle=0,minLength=Infinity;const v=new T.Vector3(),q=new T.Vector3();for(let i=0;i<src.count;i++){v.fromBufferAttribute(src,i);if(v.length())minLength=Math.min(minLength,v.length());q.set(g.attributes.normal.getX(i),g.attributes.normal.getY(i),g.attributes.normal.getZ(i));if(v.length()&&q.length())maxAngle=Math.max(maxAngle,v.angleTo(q)*180/Math.PI);}
    component={maxAngle,minLength,vertices:src.count,bytes:g.attributes.normal.array.byteLength,payloadUntouched:g.attributes.position===position&&g.attributes.uv===uv&&g.index===index};root.traverse(o=>o.geometry?.dispose());
    if(phase==='after'){
     const sources=__packInputs.slice(0,sceneAudit.geometries);
     const packers=[beforeFunction,afterFunction].map(body=>new Function('THREE','const packed=new WeakMap();'+body+';return packNormals;')(T));
     function run(version){let checksum=0;const start=performance.now();for(const a of sources){const g=new T.BufferGeometry().setAttribute('normal',new T.BufferAttribute(a,3));packers[version](g);checksum+=g.attributes.normal.array[0]||0;}return{ms:performance.now()-start,checksum};}
     run(0);run(1);const pairs=[];for(let i=0;i<9;i++){const first=run(i%2),second=run(1-i%2);pairs.push(i%2?{before:second.ms,after:first.ms}:{before:first.ms,after:second.ms});}timing={pairs,vertices:sceneAudit.vertices,note:'Exact before/after production packNormals functions over actual eligible scene arrays; fresh attributes/byte output each pass; alternate order, 2 warmups; one-time CPU packing stage only, not FPS or physical phone.'};
    }
   }
   window.__packInputs=[];
   A.renderer.shadowMap.needsUpdate=true;A.renderer.render(A.scene,A.camera);
   const render={calls:A.renderer.info.render.calls,triangles:A.renderer.info.render.triangles,camera:A.camera.position.toArray()};
   return{sceneAudit,component,timing,render,quality:A.quality?.level};
  },{low,phase,beforeFunction:original.slice(original.indexOf('function packNormals(')),afterFunction:current.slice(current.indexOf('function packNormals('))});
  if(!catOnly)await page.screenshot({path:path.join(out,`${phase}-${low?'lowmem':'normal'}.png`),timeout:90000});
  data.cat=await page.evaluate(async()=>{
   const A=__app,T=await import('three'),c=A.outdoorCats.cats.find(c=>c.name==='Kanel'),p=c.puppet;
   // Inspection view of the actual built/packed puppet: no cloning of freed CPU attributes.
   Object.assign(p,{stand:1,wantStand:1,gaitAmp:0,walked:false,tailK:-1,hopY:0});p.shoulder.rotation.set(0,0,0);p.leftShoulder.rotation.set(0,0,0);p.head.rotation.set(0,0,0);p.pose(0);
   const scene=new T.Scene();scene.background=new T.Color(0xcbd4df);scene.add(p.object);p.object.visible=true;p.object.position.set(0,0,0);p.object.rotation.set(0,.6,0);for(const m of p.materials)m.opacity=1;
   scene.add(new T.HemisphereLight(0xffffff,0x5c6270,2));const sun=new T.DirectionalLight(0xffffff,2.5);sun.position.set(-2,4,3);scene.add(sun);
   const floor=new T.Mesh(new T.PlaneGeometry(5,5),new T.MeshStandardMaterial({color:0xcbd4df,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.003;scene.add(floor);
   const camera=new T.PerspectiveCamera(40,960/720,.01,20);camera.position.set(.7,.4,.8);camera.lookAt(0,.17,0);A.renderer.render(scene,camera);
   return{name:c.name,view:'Actual production near puppet, after scene packing; fixed inspection lighting and standing pose, reparented without cloning; not natural gameplay camera',calls:A.renderer.info.render.calls,triangles:A.renderer.info.render.triangles};
  });
  await page.screenshot({path:path.join(out,`${phase}-${low?'lowmem':'normal'}-cat.png`),timeout:90000});
  const result={phase,low,harnessSha256,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),browser:browser.version(),errors,...data};fs.writeFileSync(path.join(out,`${phase}-${low?'lowmem':'normal'}${catOnly?'-cat':''}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify({phase,low,errors,component:data.component,audit:{...data.sceneAudit,rows:data.sceneAudit.rows.length},render:data.render,timing:data.timing}));
  assert.equal(errors.length,0);assert(data.sceneAudit.payloadUntouched);if(phase==='after'&&low){assert(data.component.maxAngle<.4);assert(data.component.payloadUntouched);assert.equal(data.component.bytes,data.component.vertices*4);}
  await ctx.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
