// #1875: actual copperPot producer before later scene merging normalizes its normals.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),kit=require('./testkit.cjs');
const base=process.argv[2],out=process.argv[3];
(async()=>{const browser=await kit.launch();try{for(const phase of ['before','after']){
 const source=fs.readFileSync(phase==='before'?process.env.LOWMEM_BEFORE:'src/lowmemory.js','utf8');
 const ctx=await browser.newContext({viewport:{width:800,height:600},deviceScaleFactor:1});
 await ctx.route('**/src/bootstrap.js',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await ctx.route('**/src/lowmemory.js',r=>r.fulfill({body:source,contentType:'text/javascript'}));
 if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('three@0.170.0/')[1]),contentType:'text/javascript'}));
 const page=await ctx.newPage();await page.goto(`${base}/?lowmem`,{waitUntil:'domcontentloaded'});
 const data=await page.evaluate(async()=>{
  const T=await import('three'),C=await import('/src/config.js'),{copperPot}=await import('/src/plantpots.js'),{freeSceneGeometryCopies}=await import('/src/lowmemory.js');
  const scene=new T.Scene();scene.background=new T.Color(0xcbd4df);const pot=copperPot(C.FURNITURE.find(x=>x.type==='zzplant').pot);scene.add(pot);
  scene.add(new T.HemisphereLight(0xffffff,0x535a60,3));const sun=new T.DirectionalLight(0xffffff,6);sun.position.set(-1,3,2);scene.add(sun);
  const camera=new T.PerspectiveCamera(35,800/600,.01,10);camera.position.set(.45,.55,.5);camera.lookAt(0,.22,0);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(800,600);renderer.setPixelRatio(1);document.body.replaceChildren(renderer.domElement);document.body.style.margin='0';renderer.domElement.style.cssText='position:fixed;inset:0;width:800px;height:600px';
  freeSceneGeometryCopies(scene,renderer);renderer.render(scene,camera);return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,normalBytes:pot.getObjectByName('brushed-copper-pot').geometry.attributes.normal.count*4};
 });
 await page.screenshot({path:path.join(out,`${phase}-source-pot.png`)});fs.writeFileSync(path.join(out,`${phase}-source-pot.json`),JSON.stringify({phase,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),browser:browser.version(),...data},null,2));console.log(phase,data);await ctx.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
