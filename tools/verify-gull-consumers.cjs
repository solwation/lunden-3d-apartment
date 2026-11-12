// The real Birds batches/collection/observer, with controlled weather and camera. Run under browser lock.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('fs'),crypto=require('crypto');
const base=process.argv[2]||'http://127.0.0.1:8202',out=process.argv[3]||'docs/verification/1924';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[];try{const p=await b.newPage({viewport:{width:800,height:600}});p.on('pageerror',e=>errors.push(e.stack));await p.goto(base+'/tools/gull-quality.html');await p.waitForFunction(()=>window.__ready);
 if(process.argv[4]==='lowmemory'){
  await p.goto(base+'/tools/gull-quality.html?lowmem');await p.waitForFunction(()=>window.__ready);
  const result=await p.evaluate(async()=>{const T=await import('three'),{lowMemory,freeSceneGeometryCopies}=await import('/src/lowmemory.js'),e=gullEvidence;e.set('quarter',1,true);const r=new T.WebGLRenderer({antialias:true});r.setSize(800,600);const arrays=e.birds.meshes.flatMap(m=>Object.values(m.geometry.attributes).map(a=>a.array)),before=arrays.map(a=>a.byteLength);freeSceneGeometryCopies(e.scene,r);r.render(e.scene,e.camera);r.getContext().finish();const retained=e.birds.meshes.flatMap(m=>Object.values(m.geometry.attributes).map(a=>a.array.byteLength));const actual={...r.info.render};e.renderer.render(e.scene,e.camera);const pixels=e.pixels();r.dispose();return{lowMemory,count:e.birds.count,before,retained,unchanged:before.every((v,i)=>v===retained[i]),actual,pixels,targetPixels:e.pixels.target,finite:e.stats().finite};});
  if(!result.lowMemory||result.count!==5||!result.unchanged||!result.finite||result.targetPixels<1||result.actual.calls>2)throw Error(JSON.stringify(result));
  await p.locator('canvas').screenshot({path:out+'/current-lowmemory-near.png'});fs.writeFileSync(out+'/lowmemory.json',JSON.stringify({...result,errors},null,2));console.log('PASS actual low-memory cleanup, retained dynamic buffers, five birds, near redraw '+JSON.stringify(result));return;
 }
 const results=await p.evaluate(async()=>{
 const T=await import('three'),{Birds:BeforeBirds}=await import('/__before/src/birds.js'),{BIRDS,GULL_SURFACE:S}=await import('/src/config.js'),e=gullEvidence,rows=[];
 const check=(ok,name,data={})=>{rows.push({name,pass:!!ok,...data});if(!ok)throw Error(name+' '+JSON.stringify(data))};
 const reset=(low=false,index=0)=>{Object.assign(e.day,{daylight:1,above:0,overcast:0});e.day.uniforms.uWhite.value=0;return e.set('quarter',1,low,index)};
 for(const low of [false,true]){
 reset(low);const old=new BeforeBirds({scene:new T.Scene(),camera:e.camera,day:e.day,center:BIRDS.center,lowMemory:low}),a=old.mesh.geometry.attributes.aSeed.array,c=old.mesh.geometry.attributes.aSeed2.array;
 check(a.every((v,i)=>v===e.birds.seeds.a[i])&&c.every((v,i)=>v===e.birds.seeds.b[i]),'exact baseline instance seeds',{low,count:e.birds.count});old.mesh.geometry.dispose();old.mesh.material.dispose();
 }
 for(const gate of ['night','rain-snow','whiteout','underground','far']){
 reset();if(gate==='night')e.day.daylight=0;if(gate==='whiteout')e.day.uniforms.uWhite.value=1;if(gate==='far')e.camera.position.x+=BIRDS.far*3;
 e.birds.update(1,gate==='rain-snow'?1:0,gate==='underground');e.renderer.render(e.scene,e.camera);const pixels=e.pixels(),stats=e.stats();check(stats.calls===0&&pixels===0&&e.birds.meshes.every(o=>!o.visible),gate+' zero actual draws/pixels',{...stats,pixels});
 }
 reset(false,9);e.day.overcast=1;e.birds.update(0);e.renderer.render(e.scene,e.camera);e.pixels();check(e.birds.uniforms.uHigh.value===0&&e.pixels.target===0,'high gull actually hidden behind cloud deck',{targetPixels:e.pixels.target});e.day.above=1;e.birds.update(0);e.renderer.render(e.scene,e.camera);e.pixels();check(e.birds.uniforms.uHigh.value===1&&e.pixels.target>0,'same high gull visible above deck',{targetPixels:e.pixels.target});
 const boundary=reset(),target=new T.Vector3(...boundary.target),direction=e.camera.position.clone().sub(target).normalize();
 for(const distance of [S.lodNear-.01,S.lodNear+.01,S.lodNear-.01]){
 e.camera.position.copy(target).addScaledVector(direction,distance);e.camera.lookAt(target);e.camera.updateMatrixWorld(true);e.birds.update(0);e.renderer.render(e.scene,e.camera);e.pixels();const ids=['near','far'].flatMap(k=>Array.from(e.birds.lodIDs[k].subarray(0,e.birds.lodCounts[k]))),stats=e.stats();
 check(new Set(ids).size===e.birds.count&&ids.length===e.birds.count&&e.pixels.target>0&&stats.finite&&Array.from(e.birds.lodIDs[distance<S.lodNear?'near':'far'].subarray(0,e.birds.lodCounts[distance<S.lodNear?'near':'far'])).includes(0),'exclusive LOD transition without missing intended bird',{distance,...stats,targetPixels:e.pixels.target});
 }
 reset();const original=S.lodNear;try{S.lodNear=1e6;e.birds.update(0);e.renderer.render(e.scene,e.camera);const stats=e.stats();check(stats.calls===1&&stats.triangles===240*e.birds.count&&!e.birds.mesh.visible&&e.birds.nearMesh.visible,'near-only actual submission',{...stats});}finally{S.lodNear=original}
 const {BestiaryObserver}=await import('/src/bestiaryworld.js');const o=new BestiaryObserver({collection:{},camera:e.camera,actors:()=>({birds:e.birds})});check(o.candidates().filter(c=>c.id==='bird:gull').length===e.birds.count,'near-only real observer uses source seeds once');
 const {createBestiaryModel}=await import('/src/bestiarymodels.js'),{BestiaryImages}=await import('/src/bestiaryimages.js'),{registry}=await import('/src/bestiary.js');const m=await createBestiaryModel({kind:'gull'}),images=new BestiaryImages({registry,renderer:e.renderer,store:null});const binder=images.render(m.object,320);m.dispose();
 reset();const source=e.birds.seeds;let modes={};for(let t=0;t<20;t+=.025){const gate=T.MathUtils.smoothstep(Math.sin(t*S.glideRate+source.b[0]),...S.glideGate),flap=Math.sin(t*BIRDS.flap*Math.PI*2+source.b[0])*gate;if(!modes.glide&&gate===0)modes.glide=t;if(!modes.up&&flap>.95)modes.up=t;if(!modes.down&&flap<-.95)modes.down=t;if(Object.keys(modes).length===3)break;}check(Object.keys(modes).length===3,'finite glide/flap-up/flap-down samples',{modes});
 return{rows,binder,modes,opposite:Array.from({length:e.birds.count},(_,i)=>i).find(i=>Math.sign(source.a[i*4+3])!==Math.sign(source.a[3]))};
 });
 fs.writeFileSync(out+'/current-binder.png',Buffer.from(results.binder.split(',')[1],'base64'));delete results.binder;
 for(const [mode,time]of Object.entries(results.modes)){await p.evaluate(t=>gullEvidence.set('quarter',t),time);await p.locator('canvas').screenshot({path:out+'/current-'+mode+'.png'})}
 await p.evaluate(i=>gullEvidence.set('quarter',1,false,i),results.opposite);await p.locator('canvas').screenshot({path:out+'/current-bank-opposite.png'});
 results.errors=errors;results.source={};for(const f of ['src/birds.js','src/gullmodel.js','src/config.js','src/bestiarymodels.js','src/bestiaryworld.js'])results.source[f]=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(out+'/consumers.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
