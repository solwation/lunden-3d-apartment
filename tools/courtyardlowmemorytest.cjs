// #1047: bounded real-WebGL/actual Courtyard+Player regression; no full World bootstrap.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const kit=require('./testkit.cjs');
const base=process.argv[2]||'http://localhost:8894',out=process.argv[3]||'/tmp/lunden-reports-1047';
const root=path.resolve(__dirname,'..'),reference='f581417';
const original=cp.execFileSync('git',['show',reference+':src/courtyard.js'],{cwd:root,encoding:'utf8'});
const oldLowMemory=cp.execFileSync('git',['show',reference+':src/lowmemory.js'],{cwd:root,encoding:'utf8'});
assert.equal(oldLowMemory,fs.readFileSync(path.join(root,'src/lowmemory.js'),'utf8'),'global low-memory policy remains source-identical to reported build');
const checks=[],results=[];const check=(condition,name)=>{assert.ok(condition,name);checks.push(name);};
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch();
try{
 for(const variant of [{name:'reported-lowmem',original:true,query:'?lowmem',error:true},{name:'reported-keepgeo',original:true,query:'?lowmem&keepgeo',error:false},{name:'fixed-lowmem',original:false,query:'?lowmem',error:false},{name:'fixed-desktop',original:false,query:'',error:false}]){
  const context=await browser.newContext({viewport:{width:480,height:320},hasTouch:true}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/bootstrap.js',route=>route.abort());
  await page.route('**/src/courtyard-reported1047.js',route=>route.fulfill({contentType:'text/javascript',body:original}));
  await page.goto(base+'/'+variant.query);
  const before=await page.evaluate(async variant=>{
   const T=await import('three'),{buildCourtyard}=await import(variant.original?'/src/courtyard-reported1047.js':'/src/courtyard.js'),{Player}=await import('/src/player.js'),{freeSceneGeometryCopies}=await import('/src/lowmemory.js');
   document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;
   const courtyard=buildCourtyard(),bike=courtyard.bicycles[4],scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1.5,.1,100);
   scene.background=new T.Color(0xb8cbd4);scene.add(...bike.components,new T.HemisphereLight(0xffffff,0x708070,3));
   const staticControl=new T.Mesh(new T.BoxGeometry(.3,.3,.3),new T.MeshStandardMaterial());staticControl.position.set(-13,0,12);scene.add(staticControl);
   const viewCamera=new T.PerspectiveCamera(45,1.5,.1,100);viewCamera.position.set(-18,4,20);viewCamera.lookAt(-12.58,.6,15);
   const world={size:{x:5.75,z:12.1},levels:[{segments:[...courtyard.segments,...courtyard.seats.segments],footprints:courtyard.seats.footprints},{segments:[],footprints:[]}],doors:[],roofs:{above:()=>Infinity,under:()=>null},bicycles:courtyard.bicycles};
   const player=new Player(world,camera);player.spawn(bike.position.x-1.8,bike.position.z,0);
   const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(480,320);document.body.append(renderer.domElement);
   const gl=renderer.getContext(),uploads=[];const upload=gl.bufferData.bind(gl);gl.bufferData=(target,data,...rest)=>{uploads.push(typeof data==='number'?data:data.byteLength);return upload(target,data,...rest);};
   const bytes=()=>bike.components.reduce((sum,mesh)=>sum+Object.values(mesh.geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0),0);
   const authored=[];for(const mesh of bike.components){const attributes={};for(const[name,attribute]of Object.entries(mesh.geometry.attributes)){const digest=await crypto.subtle.digest('SHA-256',attribute.array);attributes[name]={count:attribute.count,itemSize:attribute.itemSize,bytes:attribute.array.byteLength,sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};}authored.push(attributes);}
   const sourceBytes=bytes();freeSceneGeometryCopies(scene,renderer);renderer.render(scene,viewCamera);
   const metrics=()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cpuBytes:bytes(),gpuUploadBytes:uploads.reduce((a,b)=>a+b,0),normal:bike.components.map(mesh=>({itemSize:mesh.geometry.attributes.normal.itemSize,bytes:mesh.geometry.attributes.normal.array.byteLength,freed:!!mesh.geometry.attributes.normal.cpuFreed})),staticFreed:!!staticControl.geometry.attributes.normal.cpuFreed});
   window.probe={T,courtyard,bike,player,scene,renderer,viewCamera,metrics};
   const action=document.createElement('button');action.id='regression-action';action.textContent='Cykla';Object.assign(action.style,{position:'fixed',left:'4px',bottom:'4px',zIndex:10000});document.body.append(action);
   action.onclick=()=>{probe.mounted=player.mountBicycle(bike);try{renderer.render(scene,viewCamera);probe.error=null;}catch(error){probe.error={message:error.message,stack:error.stack};}};
   return{sourceBytes,authored,player:player.pos.toArray(),bike:bike.position.toArray(),...metrics()};
  },variant);
  await page.locator('#regression-action').tap();
  const after=await page.evaluate(()=>({mounted:probe.mounted,error:probe.error,...probe.metrics()}));
  fs.writeFileSync(path.join(out,variant.name+'.json'),JSON.stringify({variant,before,after,errors},null,2));
  check(after.mounted,variant.name+': real Player mounts the actual last courtyard bicycle from report location');
  check(!!after.error===variant.error,variant.name+': expected real renderer result');
  if(variant.error)check(after.error.message.includes('Resizing buffer attributes is not supported'),variant.name+': exact reported WebGLAttributes error');
  if(!variant.error){
   const moved=await page.evaluate(()=>{const{T,courtyard,renderer,scene,viewCamera}=probe;let allNormals=true;for(const bicycle of courtyard.bicycles){bicycle.place(bicycle.position.clone().add(new T.Vector3(-.1,0,0)),.2,.03);for(const component of bicycle.components){const n=component.geometry.attributes.normal;for(let i=0;i<n.count;i++){const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));if(!Number.isFinite(length)||Math.abs(length-1)>.015)allNormals=false;}}renderer.render(scene,viewCamera);}return{allNormals,...probe.metrics()};});
   check(moved.allNormals,variant.name+': all five bikes retain finite unit normals after repeated yaw/pitch updates');
   check(moved.calls===before.calls&&moved.triangles===before.triangles,variant.name+': no added render calls or triangles');
  }
  if(variant.name==='fixed-lowmem')check(after.staticFreed&&after.normal.every(attribute=>!attribute.freed&&attribute.itemSize===3),variant.name+': only moving batches keep float normals; unrelated static geometry still freed');
  check(errors.length===0,variant.name+': no uncaught browser errors');
  if(!variant.error)await page.screenshot({path:path.join(out,variant.name+'.png')});
  results.push({variant,before,after,errors});await context.close();
 }
 check(JSON.stringify(results[0].before.authored)===JSON.stringify(results[2].before.authored),'reported and fixed authored position/normal/UV/color bytes are identical');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({reference,sourceSha256:crypto.createHash('sha256').update(original).digest('hex'),checks,results,limitations:'Actual tiny WebGL component with native Courtyard and Player; no full World or physical Android acceptance.'},null,2));
 console.log(checks.length+' PASS');
}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
