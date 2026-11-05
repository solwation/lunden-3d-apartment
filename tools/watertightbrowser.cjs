// #1876: real A/B/C/L builder geometry, paired TriGrid CPU timings and rendered component evidence.
// THREE_DIR=... PLAYWRIGHT_MODULE=... tools/browsertest.sh node tools/watertightbrowser.cjs SITE OUT
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),kit=require('./testkit.cjs');
const [base='http://localhost:8976',out='docs/verification/1876']=process.argv.slice(2),root=path.resolve(__dirname,'..');
const raw=fs.readFileSync(path.join(root,'src/trigrid.js'),'utf8'),needle='ray.intersectTriangle(a, b, c,';
if(raw.split(needle).length!==2)throw Error('Expected one production triangle call');
const candidate="import {intersectTriangle} from '/tools/fixtures/watertight-raytriangle.mjs';\n"+raw.replace(needle,'intersectTriangle(ray, a, b, c,');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const files=['src/trigrid.js','src/corehouse.js','src/core.js','src/config.js','src/architectureedges.js','tools/fixtures/watertight-raytriangle.mjs','tools/watertightbrowser.cjs'];
const source=Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await kit.launch(),report={source,cpu:os.cpus()[0].model,platform:os.platform(),browser:browser.version(),errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:820}});
  page.on('pageerror',e=>report.errors.push(e.stack));
  await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// builder-only experiment'}));
  await page.route('**/src/trigrid-candidate.js',r=>r.fulfill({contentType:'text/javascript',body:candidate}));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR||'/home/devcontainers/.cache/three-0.170.0',r.request().url().split('three@0.170.0/')[1]),contentType:'text/javascript'}));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  report.geometry=await page.evaluate(async(captureOnly)=>{
   const T=await import('three'),{TriGrid}=await import('/src/trigrid.js'),{TriGrid:Candidate}=await import('/src/trigrid-candidate.js');
   const {CoreHouse}=await import('/src/corehouse.js'),{Core}=await import('/src/core.js'),{CORE_A,CORE_B,CORE_C}=await import('/src/config.js');
   const houses=[...[[CORE_A,'A'],[CORE_B,'B'],[CORE_C,'C']].map(([c,name])=>({name,core:new CoreHouse(c)})),{name:'L',core:new Core()}];
   if(captureOnly){window.__triangleExperiment={T,houses};return{captureOnly:true,revision:T.REVISION};}
   const summary=a=>{const s=a.slice().sort((a,b)=>a-b);return{median:s[Math.floor(s.length/2)],p95:s[Math.ceil(s.length*.95)-1],samples:a};};
   const rows=[];let comparisons=0;
   for(const {name,core} of houses){
    const all=[];for(const g of [core.object,core.exterior].filter(Boolean)){g.updateMatrixWorld(true);g.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh&&!m.userData.door&&m.geometry.attributes.position)all.push(m);});}
    const picked=all.sort((a,b)=>(b.geometry.index?.count??b.geometry.attributes.position.count)-(a.geometry.index?.count??a.geometry.attributes.position.count)).slice(0,3);
    const models=[];
    for(const [mi,mesh]of picked.entries()){
     const grids=[new TriGrid(mesh),new Candidate(mesh)],n=grids[0].tri.length/9,queries=[];
     for(let k=0;k<128;k++){
      const t=Math.floor((k+.37)*n/128),a=new T.Vector3().fromArray(grids[0].tri,t*9),b=new T.Vector3().fromArray(grids[0].tri,t*9+3),c=new T.Vector3().fromArray(grids[0].tri,t*9+6);
      const norm=b.clone().sub(a).cross(c.clone().sub(a));if(norm.lengthSq()<1e-20)continue;norm.normalize();
      const center=a.clone().multiplyScalar(.23).addScaledVector(b,.31).addScaledVector(c,.46),tangent=b.clone().sub(a).normalize().multiplyScalar(.117);
      const from=center.clone().addScaledVector(norm,.35).add(tangent),to=center.clone().addScaledVector(norm,-.35).sub(tangent);
      const ray=new T.Ray(from,to.clone().sub(from).normalize()),far=from.distanceTo(to),box=new T.Box3().setFromPoints([from,to]).expandByScalar(.00001);
      queries.push({ray,far,box,center});
     }
     function sweep(grid){let count=0;for(const q of queries){const hits=[];grid.hits(q.ray,q.far,q.box,T.DoubleSide,hits);count+=hits.length;}return count;}
     let hits=0;
     for(const q of queries){const all=grids.map(g=>{const h=[];g.hits(q.ray,q.far,q.box,T.DoubleSide,h);return h;});if(all[0].length!==all[1].length)throw Error(name+' hit count changed');
      for(let i=0;i<all[0].length;i++){const a=all[0][i],b=all[1][i];if(a.object!==b.object||a.materialIndex!==b.materialIndex||Math.abs(a.distance-b.distance)>1e-10||a.point.distanceTo(b.point)>1e-10||!a.normal.equals(b.normal))throw Error(name+' hit/order/material changed');hits++;}comparisons++;
     }
     if(!hits)throw Error(name+' empty actual surface probes');
     // Warm both implementations before balanced paired samples. Cold means fine-cell
     // caches cleared; construction is timed separately, without timing instrumentation.
     for(let i=0;i<5;i++){sweep(grids[0]);sweep(grids[1]);}
     const times={build:[[],[]],cold:[[],[]],warm:[[],[]]};
     for(let rep=0;rep<31;rep++)for(const j of rep%2?[1,0]:[0,1]){
      let t=performance.now();const fresh=new [TriGrid,Candidate][j](mesh);times.build[j].push(performance.now()-t);
      if(fresh.tri.length!==grids[j].tri.length)throw Error('constructor drift');
      for(const tile of grids[j].tiles.values())tile.cells=null;
      t=performance.now();sweep(grids[j]);times.cold[j].push(performance.now()-t);
      t=performance.now();for(let z=0;z<32;z++)sweep(grids[j]);times.warm[j].push((performance.now()-t)/32);
     }
     models.push({name:mesh.name||`mesh-${mi}`,triangles:n,queries:queries.length,hits,buildMs:times.build.map(summary),coldBatchMs:times.cold.map(summary),warmBatchMs:times.warm.map(summary)});
    }
    rows.push({house:name,meshCount:all.length,models});
   }
   window.__triangleExperiment={T,houses,rows};
   return{revision:T.REVISION,comparisons,rows,limits:'Actual production CoreHouse A/B/C and Core L meshes, CPU queries on Intel/Chromium in WSL. Component construction only; no full apartment, physical Surface/iPhone, Safari or FPS claim.'};
  },!!process.env.TRIANGLE_IMAGES_ONLY);
  if(!process.env.TRIANGLE_IMAGES_ONLY){
  console.log('PASS geometry queries',report.geometry.comparisons);
  console.log(JSON.stringify(report.geometry.rows.map(r=>({house:r.house,models:r.models.map(m=>({triangles:m.triangles,build:m.buildMs.map(x=>[x.median,x.p95]),cold:m.coldBatchMs.map(x=>[x.median,x.p95]),warm:m.warmBatchMs.map(x=>[x.median,x.p95])}))})),null,2));
  }
  await page.evaluate(()=>{
   const {T,houses}=window.__triangleExperiment;
   document.head.insertAdjacentHTML('beforeend','<style>html{height:auto!important;overflow:visible!important;background:#edf0f2!important}body{margin:0!important;background:#edf0f2!important;color:#182734!important;font:16px system-ui!important;display:block!important;overflow:auto!important}#evidence{padding:22px}h1{font-size:24px;margin:0 0 8px}p{margin:8px 0 18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.card{box-sizing:border-box;padding:0;margin:0;min-width:0;background:white;border:1px solid #c5cdd3;border-radius:7px;overflow:hidden}.card h2{font-size:18px;margin:12px}.card p{font-size:13px;margin:12px}canvas{position:static!important;width:100%!important;height:auto!important;display:block}</style>');
   document.body.innerHTML='<main id="evidence"><h1>TriGrid · verkliga arkitekturytor A/B/C/L</h1><p>Komponentvy från produktionsbyggarna. Identisk geometri för r170 och kandidaten; träffarnas objekt, ordning och avstånd jämförs på tre valda mesh per hus.</p><div class="grid"></div><p>Kontrollerade närbilder: samma vägg-, trapp- och räckesytor som i respektive hus. Ingen förändring av mått, öppningar eller renderbudget.</p></main>';
   for(const {name,core}of houses){
    const card=document.createElement('section');card.className='card';card.innerHTML=`<h2>Hus ${name}</h2>`;document.querySelector('.grid').append(card);
    const scene=new T.Scene();scene.background=new T.Color(0xe5ecf1);
    for(const g of [core.object,core.exterior].filter(Boolean)){g.visible=true;scene.add(g);}
    const bounds=new T.Box3().setFromObject(scene),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
    // Show the lower 4.5 m with a world clipping plane, retaining the actual source
    // geometry. This is an explicitly cut-away component view, not a game camera.
    const floor=bounds.min.y,mid=new T.Vector3(center.x,floor+2.2,center.z);
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(290,520);renderer.setPixelRatio(1);
    renderer.clippingPlanes=[new T.Plane(new T.Vector3(0,-1,0),floor+4.5)];
    const span=Math.max(size.x,size.z,5.5)*1.0,camera=new T.OrthographicCamera(-span*.56,span*.56,span,-span,.01,200);
    camera.position.copy(mid).add(new T.Vector3(size.x*.95,Math.max(size.x,size.z)*1.05,size.z*.95));camera.lookAt(mid);camera.updateMatrixWorld();
    scene.add(new T.AmbientLight(0xffffff,2));const light=new T.DirectionalLight(0xffffff,2);light.position.copy(camera.position);scene.add(light);
    renderer.render(scene,camera);card.append(renderer.domElement);card.insertAdjacentHTML('beforeend','<p>Skuren komponentvy · nedre 4,5 m.<br>128 riktade frågor per vald mesh.</p>');renderer.dispose();
   }
  });
  await page.screenshot({path:path.join(out,'architecture-surfaces.png'),fullPage:true});
  await page.evaluate(async()=>{
   const {T}=window.__triangleExperiment,{intersectTriangle}=await import('/tools/fixtures/watertight-raytriangle.mjs');
   document.body.innerHTML='<main id="evidence"><h1>Delad triangelkant · reproducerbart r170-fel</h1><p>Isolerat geometritest från Three.js #33661. Strålen siktar mot samma punkt på den gemensamma kanten i båda bilderna.</p><div class="grid" style="grid-template-columns:1fr 1fr"></div><p>Gult = strålens väg · grön markör = upptäckt träff. Kandidaten kan ge två sammanfallande träffar, en från vardera triangeln.</p></main>';
   const points=[[-2,-2,2],[-2,-2,-2],[2,-2,2],[-2,-2,-2],[2,-2,-2],[2,-2,2]].map(p=>new T.Vector3(...p)),from=new T.Vector3(-4,-9,.4),target=new T.Vector3(0,-2,0),ray=new T.Ray(from,target.clone().sub(from).normalize());
   for(const candidate of [false,true]){
    let count=0;for(let i=0;i<6;i+=3){const p=new T.Vector3(),hit=candidate?intersectTriangle(ray,...points.slice(i,i+3),false,p):ray.intersectTriangle(...points.slice(i,i+3),false,p);if(hit)count++;}
    const card=document.createElement('section');card.className='card';card.innerHTML=`<h2>${candidate?'Kandidat':'Three r170'}: ${count} träffar</h2>`;document.querySelector('.grid').append(card);
    const scene=new T.Scene();scene.background=new T.Color(0xe5ecf1);
    const geometry=new T.BufferGeometry().setFromPoints(points),mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({color:0x769db3,side:T.DoubleSide}));scene.add(mesh,new T.LineSegments(new T.WireframeGeometry(geometry),new T.LineBasicMaterial({color:0x203e52})));
    const line=new T.Line(new T.BufferGeometry().setFromPoints([from,target.clone().addScaledVector(ray.direction,1)]),new T.LineBasicMaterial({color:0xc48400}));scene.add(line);
    if(count){const dot=new T.Mesh(new T.SphereGeometry(.13,16,8),new T.MeshBasicMaterial({color:0x16a34a}));dot.position.copy(target);scene.add(dot);}
    const camera=new T.PerspectiveCamera(40,600/420,.1,100);camera.position.set(7,-10,10);camera.lookAt(-1,-3,0);
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(600,420);renderer.render(scene,camera);card.append(renderer.domElement);renderer.dispose();
   }
  });
  await page.screenshot({path:path.join(out,'shared-edge-before-after.png'),fullPage:true});
  if(report.errors.length)throw Error('Page errors');
  if(Object.entries(source).some(([f,h])=>hash(fs.readFileSync(path.join(root,f)))!==h))throw Error('Sources changed during test');
  report.pass=true;
 }catch(e){report.failure=e.stack;process.exitCode=1;console.error(e.stack);}
 finally{fs.writeFileSync(path.join(out,process.env.TRIANGLE_IMAGES_ONLY?'captures.json':'browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})();
