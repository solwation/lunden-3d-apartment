// Actual showerSet + Tap component; no World/bootstrap or gameplay dispatcher.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2],out=process.argv[3],baseline=process.argv.includes('--baseline');
fs.mkdirSync(out,{recursive:true});
const checks=[],images=[],errors=[],sources={};
for(const f of ['src/water.js','src/config.js','src/interior.js','tools/showerspraytest.cjs'])sources[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:{width:900,height:760}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js*',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 if(baseline){const body=fs.readFileSync(process.env.BASELINE_DIR+'/water.js');sources['baseline/water.js']=crypto.createHash('sha256').update(body).digest('hex');await page.route('**/src/water.js',r=>r.fulfill({body,contentType:'application/javascript'}));}
 await page.goto(base+'/?cloud=');
 const result=await page.evaluate(async baseline=>{
  const T=await import('three'),{Tap,animateWater}=await import('/src/water.js'),{Batch,showerSet}=await import('/src/interior.js'),{sfx}=await import('/src/audio.js'),{SHOWER_SPRAY:S}=await import('/src/config.js');
  const checks=[];const check=(ok,label,data)=>checks.push({ok:!!ok,label,data});
  // A spy isolates Web Audio readiness while asserting the actual Tap lifecycle.
  const sounds=[];sfx.water=(p,shower)=>{const sound={p,shower,stops:0,stop(){this.stops++;}};sounds.push(sound);return sound;};
  const scene=new T.Scene();scene.background=new T.Color(0xd2d0cc);
  scene.add(new T.HemisphereLight(0xf0f5ff,0x8a8173,2.5));const light=new T.DirectionalLight(0xffffff,2);light.position.set(2,4,3);scene.add(light);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,760);renderer.toneMapping=T.NeutralToneMapping;renderer.setPixelRatio(1);renderer.domElement.style.cssText='position:fixed;inset:0;z-index:10000';document.body.append(renderer.domElement);
  const camera=new T.PerspectiveCamera(43,900/760,.02,20);
  const entries=[true,false].map(ceiling=>{
   const root=new T.Group(),batch=new Batch(),spec=showerSet(batch,0,0,0,ceiling)[0];root.add(...batch.meshes());const tap=new Tap(spec);root.add(tap.object);
   const wall=new T.Mesh(new T.BoxGeometry(.025,2.4,1.7),new T.MeshStandardMaterial({color:0xe5dfd5,roughness:.7}));wall.position.set(-.02,1.2,0);root.add(wall);
   const floor=new T.Mesh(new T.BoxGeometry(1.6,.03,1.7),new T.MeshStandardMaterial({color:0x7c7d78,roughness:.7}));floor.position.set(.78,-.018,0);root.add(floor);scene.add(root);
   check(!tap.isOpen&&!tap.stream.visible&&!tap.splash.visible,spec.name+' starts shut');tap.toggle();tap.update(.1);root.updateMatrixWorld(true);
   const sound=sounds.at(-1),spot=tap.splash.getWorldPosition(new T.Vector3()),geometry=tap.stream.geometry;
   check(tap.stream.visible&&tap.splash.visible&&sound.shower,spec.name+' toggle starts water, splash and shower sound');
   check(tap.hits(spot.x,0,spot.z)&&!tap.hits(spot.x+1,0,spot.z)&&!tap.hits(spot.x,3.25,spot.z),spec.name+' wetness footprint keeps floor and distance checks');
   if(!baseline){const a=geometry.attributes.position;let bottom=Infinity;for(let i=0;i<a.count;i++)bottom=Math.min(bottom,a.getY(i)+spec.pos[1]);
    check(Math.abs(bottom)<.003,spec.name+' separated jets reach actual basin plane',{bottom});
    check((geometry.index?.count??a.count)/3===S.jets*S.segments*S.sides*2&&tap.stream.isMesh,spec.name+' single merged bounded nozzle mesh',{triangles:(geometry.index?.count??a.count)/3});
    const old=Array.from(a.array),offset=tap.stream.material.map.offset.y;animateWater(.2);check(tap.stream.material.map.offset.y!==offset&&old.every((v,i)=>v===a.array[i]),spec.name+' downward texture animation leaves geometry static');
   }
   tap.isOpen=false;tap.update(.1);check(!tap.stream.visible&&!tap.splash.visible&&!tap.sound&&sound.stops===1&&!tap.hits(spot.x,0,spot.z),spec.name+' external close stops sound, visibility and wetness');
   tap.toggle();tap.update(.3);return{root,tap,ceiling};
  });
  const basin=new Tap({name:'test basin',pos:[0,1,0],basin:.6,dir:[0,-1,0],r:.01});check(basin.stream.geometry.type==='CylinderGeometry'&&basin.stream.material!==entries[0].tap.stream.material===!baseline,'basin stream retains its original column and independent material');
  window.fixture={entries,scene,camera,renderer,animateWater,shoot(i,dt=0){entries.forEach((e,j)=>e.root.visible=i===j);animateWater(dt);const t=entries[i].tap;t.update(dt);camera.position.set(2.5,1.65,2.6);camera.lookAt(.3,1,0);renderer.render(scene,camera);return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,streamTriangles:(t.stream.geometry.index?.count??t.stream.geometry.attributes.position.count)/3};}};
  return checks;
 },baseline);
 for(const c of result){checks.push(c);console.log(`${c.ok?'PASS':'FAIL'} ${c.label}`);assert.ok(c.ok,c.label);}
 for(const [i,name,dt] of [[0,'overhead',0],[1,'handheld',0],[1,'handheld-motion',.08]]){const metrics=await page.evaluate(args=>fixture.shoot(...args),[i,dt]);await page.screenshot({path:path.join(out,name+'.png')});images.push({file:name+'.png',metrics});}
 assert.equal(errors.length,0);checks.push({ok:true,label:'no browser exceptions'});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({baseline,checks,images,sources,limits:'Actual production Tap + showerSet; illustrative wall/floor/light component, real Chromium WebGL. Sound lifecycle spy, no audible audio, World, dispatch, FPS or physical phone evidence.'},null,2));
}finally{await browser.close();}})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.stack);console.error(e);process.exitCode=1;});
