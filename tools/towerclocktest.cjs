// Actual campus geometry, kitchen clock, day cycle and WebGL. No app/gameplay state is substituted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.argv[2]||'http://localhost:8166',out=process.argv[3]||'/tmp/lunden-towerclock';
fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});const results=[];try{
 for(const low of [false,true]){
  const p=await b.newPage({viewport:{width:1280,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/tower-clock-fixture*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0;background:#cbd9dd}canvas{display:block}</style><div id="panel" hidden><span class="time"></span><span class="info"></span><button data-act="back"></button><button data-act="fwd"></button><button data-act="play"></button></div><script type="importmap">{"imports":{"three":"/__three/build/three.module.js","three/addons/":"/__three/examples/jsm/"}}</script><script type="module">
 import * as T from 'three';import{buildEastBackdrop}from'/src/sitebackdrop.js';import{WallClock,ClockPanel}from'/src/wallclock.js';import{DayCycle}from'/src/daycycle.js';import{TOWER_CLOCK}from'/src/config.js';
 const backdrop=buildEastBackdrop(()=>0,null,new T.MeshStandardMaterial());const clock=backdrop.userData.clocks[0];const wall=new WallClock();
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,900);document.body.prepend(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color(0xcbd9dd);scene.fog=new T.Fog(0xcbd9dd,500,900);const camera=new T.PerspectiveCamera(65,1280/900,.05,700);
 const lights={hemi:new T.HemisphereLight(0xffffff,0x777766,2.2),ambient:new T.AmbientLight(0xffffff,1),fill:new T.DirectionalLight(0xffffff,1),sun:new T.DirectionalLight(0xffffff,2)};
 scene.add(backdrop,...Object.values(lights),lights.sun.target);const day=new DayCycle({scene,camera,lights,clouds:new T.Texture(),startHour:0,month:6,date:15});scene.remove(day.sky);scene.background=new T.Color(0xcbd9dd);
 const panel=new ClockPanel(day,document.getElementById('panel'));
 const update=dt=>{day.update(dt);wall.update(day.hour);backdrop.userData.updateClocks(day.hour);scene.updateMatrixWorld(true);};
 window.fixture={T,backdrop,clock,wall,day,panel,renderer,scene,camera,update,C:TOWER_CLOCK};window.ready=true;
 </script>`}));
  await p.goto(`${base}/tower-clock-fixture${low?'?lowmem':''}`);await p.waitForFunction(()=>window.ready,null,{timeout:30000});
  const checks=await p.evaluate(()=>{
   const{T,backdrop,clock,wall,day,panel,update}=fixture;const failures=[];const check=(v,s)=>{if(!v)failures.push(s)};
   check(backdrop.userData.clocks.length===1,'one real Klockhuset tower');check(clock.hands.count===8&&clock.dials.count===4,'all four faces');
   const matrix=new T.Matrix4(),pos=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();
   function compare(){for(let i=0;i<4;i++)for(let j=0;j<2;j++){clock.hands.getMatrixAt(i*2+j,matrix);matrix.decompose(pos,q,scale);const dir=[[0,1],[0,-1],[1,0],[-1,0]][i];const expected=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.atan2(...dir)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),j?wall.minuteHand.rotation.z:wall.hourHand.rotation.z));check(1-Math.abs(expected.dot(q))<1e-6,'same kitchen time on face '+i+' hand '+j);const ends=[new T.Vector3(-.5,0,0),new T.Vector3(.5,1,0)].map(v=>v.applyMatrix4(matrix));check(ends.every(v=>clock.hands.boundingSphere.containsPoint(v)),'conservative hand bounds');}}
   for(const h of [0,3,3.25,6.5,10+10/60,12,15.75,23.9999,24,-1]){day.hour=h;update(0);compare();}
   day.hour=23.9999;day.paused=false;update(1);compare();check(day.hour<1,'midnight wrap');
   panel.togglePause();const paused=day.hour;update(60);check(day.hour===paused&&clock.hour===paused,'pause');compare();
   panel.hold('forward',1);update(1);panel.hold('forward',0);const forward=day.hour;check(forward!==paused,'forward spool');compare();
   panel.hold('back',-1);update(1);panel.hold('back',0);check(Math.abs(day.hour-paused)<1e-8,'reverse spool');compare();
   const version=clock.hands.instanceMatrix.version;backdrop.userData.updateClocks(day.hour);check(clock.hands.instanceMatrix.version===version,'paused time does not upload again');
   const staticParts=backdrop.children.filter(x=>x.isMesh);let triangles=0;backdrop.traverse(x=>{if(x.isMesh)triangles+=(x.geometry.index?.count??x.geometry.attributes.position.count)/3*(x.isInstancedMesh?x.count:1)});
   return{failures,triangles,staticParts:staticParts.length,clockTriangles:clock.dials.geometry.index.count/3*4+clock.hands.geometry.index.count/3*8,centre:clock.spec};
  });
  assert.deepEqual(checks.failures,[]);
  const captures=[];
  for(const side of ['south','west'])for(const hour of [3,9]){
   await p.evaluate(({side,hour})=>{const{clock,day,update,renderer,scene,camera}=fixture;day.hour=hour;day.paused=true;update(0);const s=clock.spec;if(side==='south')camera.position.set(s.x,s.y,s.z+100);else camera.position.set(s.x-100,s.y,s.z);camera.lookAt(s.x,s.y,s.z);renderer.render(scene,camera);},{side,hour});
   const label=`${low?'phone':'desktop'}-${side}-${hour}`;await p.screenshot({path:`${out}/${label}.png`});
   captures.push(await p.evaluate(()=>{const{renderer}=fixture;return{...renderer.info.render}}));
  }
  // Close view proves numerals/markings and lets reviewers inspect hand direction without pixel magnification.
  await p.evaluate(()=>{const{clock,renderer,scene,camera}=fixture;const s=clock.spec;camera.position.set(s.x,s.y,s.z+7);camera.lookAt(s.x,s.y,s.z);renderer.render(scene,camera)});
  await p.screenshot({path:`${out}/${low?'phone':'desktop'}-close.png`});
  assert.deepEqual(errors,[]);results.push({low,checks,captures});console.log('PASS',JSON.stringify({low,checks,captures}));await p.close();
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
