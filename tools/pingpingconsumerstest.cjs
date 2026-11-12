// #1927 actual loaded/missing/late bed/hold/hug consumers and the persisted thumbnail boundary.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8203',out=process.argv[3]||'docs/verification/1927';
const files=['src/pingping.js','src/pingpingsurface.js','src/config.js','src/bestiarymodels.js','models/pingping.glb'];
const result={environment:'Actual component consumers, Chromium/SwiftShader. Loaded/404/delayed GLB, production Hand, BestiaryImages, IndexedDB and collection metadata. No full World/device performance claim.',hashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),rows:[]};
(async()=>{const b=await kit.launch();try{for(const mode of ['loaded','missing','late']){
 const ctx=await b.newContext({viewport:{width:1200,height:760},deviceScaleFactor:1});let release;const gate=new Promise(r=>release=r),errors=[];
 if(mode==='missing')await ctx.route('**/models/pingping.glb*',r=>r.fulfill({status:404,body:'expected missing asset'}));
 if(mode==='late')await ctx.route('**/models/pingping.glb*',async r=>{await gate;return r.fulfill({contentType:'model/gltf-binary',body:fs.readFileSync('models/pingping.glb')})});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/tools/pingpingrealism.html'+(mode==='loaded'?'':'?early'));await p.waitForFunction(()=>window.pingping1927);
 const before=await p.evaluate(()=>{const a=pingping1927;return a.pp.model.children.map(m=>({name:m.name,position:Array.from(m.geometry.attributes.position.array)}))});
 if(mode==='late')release();
 const row=await p.evaluate(async mode=>{
  const a=pingping1927,{T,pp,hand,scene,camera,renderer:r}=a,{pingpingModel}=await import('/src/pingping.js');
  const gltf=await a.loadPingpingModel();if(mode==='missing'&&gltf)throw Error('missing asset unexpectedly loaded');if(mode!=='missing'&&!gltf)throw Error('asset not loaded');
  const next=pingpingModel(),roots=[pp.model,a.collection.object,next,...(gltf?[gltf.scene]:[])],arrays=new Set(),textures=new Set(),images=new Set(),geometries=new Set(),finite=[];
  const fingerprint=root=>{let out='';root.traverse(o=>{if(o.geometry)out+=Array.from(o.geometry.attributes.position.array).join(',')});return out};const original=fingerprint(pp.model);
  for(const root of roots)root.traverse(o=>{if(o.geometry){geometries.add(o.geometry);for(const at of [...Object.values(o.geometry.attributes),o.geometry.index].filter(Boolean))arrays.add(at.array);}for(const m of o.material?[o.material].flat():[])for(const t of Object.values(m))if(t?.isTexture){textures.add(t);images.add(t.image)}});
  const rawGeometry=[...arrays].reduce((n,v)=>n+v.byteLength,0),rawTexture=[...images].reduce((n,i)=>n+(i.width||0)*(i.height||0)*4,0);
  let disposedShared=0;for(const t of textures)t.addEventListener('dispose',()=>disposedShared++);
  const poses=[];for(const mode of ['normal','held','hug','held-contact','hug-contact']){a.view(mode);const c=a.renderCamera;
   for(const root of [pp.model,hand.arm,hand.hand,hand.left.arm,hand.left.hand])root.traverse(o=>{for(const m of [o.matrix,o.matrixWorld])if(!m.elements.every(Number.isFinite))finite.push(o.name||o.type)});
   for(const c0 of [c,camera])for(const m of [c0.matrixWorld,c0.matrixWorldInverse,c0.projectionMatrix,c0.projectionMatrixInverse])if(!m.elements.every(Number.isFinite))finite.push('camera');
   r.render(scene,c);const full={...r.info.render},gl=r.getContext(),shown=new Uint8Array(1200*760*4),hidden=new Uint8Array(shown.length);gl.readPixels(0,0,1200,760,gl.RGBA,gl.UNSIGNED_BYTE,shown);pp.model.visible=false;r.render(scene,c);const without={...r.info.render};gl.readPixels(0,0,1200,760,gl.RGBA,gl.UNSIGNED_BYTE,hidden);pp.model.visible=true;
   let intended=0;for(let i=0;i<shown.length;i+=4)if(Math.abs(shown[i]-hidden[i])+Math.abs(shown[i+1]-hidden[i+1])+Math.abs(shown[i+2]-hidden[i+2])>15)intended++;
   poses.push({mode,intended,calls:full.calls-without.calls,triangles:full.triangles-without.triangles,matrix:pp.model.matrixWorld.toArray(),scale:pp.model.scale.toArray(),grips:pp.hugGrips,hearts:pp.hearts.points.visible});
  }
  for(let i=0;i<120;i++)pp.update(1/60);const stableGeometry=original===fingerprint(pp.model);
  pp.take();pp.placeAt(a.home.clone(),0);const placed=pp.placed&&!pp.held;pp.take();pp.putBack();const homeRestored=pp.model.position.distanceTo(a.home)<1e-10&&pp.model.scale.distanceTo(new T.Vector3(1,1,1))<1e-10;
  // A genuinely stored obsolete thumbnail must miss the new modelVersion, while discovery/photos survive.
  const {registry}=await import('/src/bestiary.js'),{BestiaryImages}=await import('/src/bestiaryimages.js'),{BestiaryCollection}=await import('/src/bestiarystore.js'),{withStore:store}=await import('/src/idb.js');
  const id='figure:pingping',entry=registry.get(id),oldKey=id+':1:320',newKey=id+':'+entry.modelVersion+':320';
  const collection=new BestiaryCollection({registry,storage:localStorage,store,now:()=>123456});collection.record(id,'hug',{token:'retained'});const saved=localStorage.getItem('lunden.bestiary');await store('bestiaryPhotos','readwrite',s=>s.put({id:'retained-photo',entry:id,time:12,data:'retained personal photo'}));await store('bestiaryThumbs','readwrite',s=>s.put({id:oldKey,data:'obsolete old render'}));
  const provider=new BestiaryImages({registry,renderer:r,store});const data=await provider.get(id,320);const again=new BestiaryImages({registry,renderer:r,store});const cached=await again.get(id,320);
  const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const g=canvas.getContext('2d');g.drawImage(image,0,0);const rgba=g.getImageData(0,0,320,320).data;let opaque=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>10)opaque++;
  const cache={version:entry.modelVersion,newKey,old:(await store('bestiaryThumbs','readonly',s=>s.get(oldKey))).data,stored:(await store('bestiaryThumbs','readonly',s=>s.get(newKey))).data===data,rendered:provider.renders,hits:again.hits,reused:cached===data,opaque,discoveryUnchanged:localStorage.getItem('lunden.bestiary')===saved,photo:(await store('bestiaryPhotos','readonly',s=>s.get('retained-photo'))).data};
  const sameGeometry=fingerprint(next)===fingerprint(pp.model),sameMaps=next.children[0].material.normalMap===pp.model.children[0].material.normalMap;
  a.view('normal');r.render(scene,camera);camera.lookAt(0,20,4);camera.updateMatrixWorld(true);r.render(scene,camera);const awayFull={...r.info.render};pp.model.visible=false;r.render(scene,camera);const awayCalls=awayFull.calls-r.info.render.calls;pp.model.visible=true;
  a.collection.dispose();return{mode,rawGeometry,rawTexture,geometryCount:geometries.size,textureObjects:textures.size,images:images.size,finite,poses,stableGeometry,placed,homeRestored,sameGeometry,sameMaps,disposedShared,cache,awayCalls,thumbnail:data,initialPositions:pp.model.children.map(m=>({name:m.name,position:Array.from(m.geometry.attributes.position.array)}))};
 },mode);
 assert.deepEqual(errors,[]);assert.deepEqual(row.finite,[]);assert(row.poses.every(p=>p.intended>50&&p.calls>0&&p.calls<=4));assert(row.stableGeometry&&row.placed&&row.homeRestored&&row.sameGeometry&&row.sameMaps);assert.equal(row.rawTexture,1310720);assert.equal(row.images,2);assert.equal(row.disposedShared,0);assert.equal(row.awayCalls,0);assert.equal(row.cache.version,2);assert(row.cache.stored&&row.cache.reused&&row.cache.discoveryUnchanged&&row.cache.rendered===1&&row.cache.hits===1&&row.cache.opaque>1000);assert.equal(row.cache.photo,'retained personal photo');assert.equal(row.cache.old,'obsolete old render');
 if(mode==='late')assert.deepEqual(before,row.initialPositions,'late load keeps original live fallback geometry');
 fs.writeFileSync(path.join(out,'thumbnail-'+mode+'.png'),Buffer.from(row.thumbnail.split(',')[1],'base64'));delete row.thumbnail;delete row.initialPositions;result.rows.push(row);await ctx.close();console.log('PASS',mode,row.rawGeometry,row.rawTexture,'cache',row.cache.newKey);
}result.pass=true;}finally{await b.close();fs.writeFileSync(path.join(out,'consumers.json'),JSON.stringify(result,null,2)+'\n')}})().catch(e=>{console.error(e);process.exit(1)});
