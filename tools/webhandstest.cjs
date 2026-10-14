// #911: actual Player/SpiderSuit/Hand on controlled simple surfaces; no apartment or physical-phone claim.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8870',out='/tmp/lunden-priority-911/native']=process.argv.slice(2),render=process.argv.includes('--render');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const handAt=source.indexOf('  hand.update(dt, heldItem(), petting);'),suitAt=source.indexOf('  suit.update(dt);');
if(handAt<0||suitAt<0||handAt>=suitAt)throw Error('fixture expects current production hand-before-suit frame order');
fs.mkdirSync(out,{recursive:true});
function processRecord(){
 const all=new Map();for(const id of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const raw=fs.readFileSync('/proc/'+id+'/stat','utf8'),fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);all.set(+id,{pid:+id,ppid:+fields[1],startTicks:fields[19],cwd:fs.readlinkSync('/proc/'+id+'/cwd'),argv:fs.readFileSync('/proc/'+id+'/cmdline').toString().split('\0').filter(Boolean)});}catch{}}
 const own=new Set([process.pid]);for(let n=0;n<8;n++)for(const row of all.values())if(own.has(row.ppid))own.add(row.pid);
 const rows=[];for(const row of all.values())if(own.has(row.pid)||(row.cwd===root&&row.argv[0]==='python3'&&row.argv[1]==='tools/devserve.py'&&row.argv[2]==='8870')){row.sockets={};try{for(const fd of fs.readdirSync('/proc/'+row.pid+'/fd')){try{const v=fs.readlinkSync('/proc/'+row.pid+'/fd/'+fd);if(v.startsWith('socket:'))row.sockets[fd]=v;}catch{}}}catch{}rows.push(row);}
 fs.writeFileSync(`${out}/processes.json`,JSON.stringify({capturedUptime:require('node:os').uptime(),processes:rows,tcp:fs.readFileSync('/proc/net/tcp','utf8'),tcp6:fs.readFileSync('/proc/net/tcp6','utf8')},null,2));
}
const hashes=Object.fromEntries(['src/hand.js','src/spidersuit.js','src/player.js','src/config.js','src/main.js','index.html','tools/webhandstest.cjs'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
fs.writeFileSync(`${out}/source.json`,JSON.stringify({hashes,head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),render,handBeforeSuit:true},null,2));
let checks=0,failures=0;const records=[],errors=[];const check=(ok,label)=>{checks++;console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failures++;};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:640,height:420}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// component fixture only'}));await page.goto(base,{waitUntil:'domcontentloaded'});processRecord();
 await page.evaluate(async render=>{
  const get=HTMLCanvasElement.prototype.getContext;window.glRequests=0;HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){glRequests++;if(!render)throw Error('native forbids WebGL');}return get.call(this,k,...a);};
  window.T=await import('three');const {Player}=await import('/src/player.js'),{SpiderSuit}=await import('/src/spidersuit.js'),{Hand}=await import('/src/hand.js');window.config=await import('/src/config.js');
  window.make=phase=>{
   const scene=new T.Scene();scene.background=new T.Color('#c7d8e3');scene.add(new T.HemisphereLight(0xffffff,0x526373,2.5));const sun=new T.DirectionalLight(0xffffff,2);sun.position.set(-2,5,3);scene.add(sun);
   const camera=new T.PerspectiveCamera(72,640/420,.03,100);camera.rotation.order='YXZ';scene.add(camera);
   const wallZ=phase==='up'?18:12;
   const world={size:{x:10,z:10},levels:[{segments:[[-40,wallZ,0,wallZ]]},{segments:[]}],doors:[],units:[],platforms:[],unitAt:()=>null,
    roofs:{topAt:()=>24,under:()=>null,above:()=>Infinity,walls:()=>[],blocks:()=>false}};
   const player=new Player(world,camera);player.spawn(-20,20,0);
   if(phase==='air'||phase==='right'||phase==='up'){player.pos.y+=4;player.eyeY=player.pos.y+config.PLAYER.eye;camera.position.y=player.eyeY;}
   const ground=player.groundAt(-20,20,0);
   const wall=new T.Mesh(new T.BoxGeometry(40,26,.15),new T.MeshStandardMaterial({color:0xd1c5b0,roughness:1}));wall.position.set(-20,12,wallZ-.075);scene.add(wall);
   const floor=new T.Mesh(new T.PlaneGeometry(80,80),new T.MeshStandardMaterial({color:0x6f876e,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(-20,ground,20);scene.add(floor);
   const drawer=new T.Group();drawer.userData.depth=.4;scene.add(drawer);
   const hand=new Hand(camera,scene),suit=new SpiderSuit({scene,camera,player,drawer,button:null});suit.hand=hand;suit.putOn();
   const frame=dt=>{player.update(dt);hand.update(dt,null);suit.update(dt);scene.updateMatrixWorld(true);};
   const initial=()=>{suit.feedHand(0);hand.update(0,null);scene.updateMatrixWorld(true);};initial();
   let shot=null;
   if(['ground','air','right','up'].includes(phase)){
    const anchor=new T.Vector3(phase==='right'?-12:-20,phase==='ground'?3:phase==='up'?16:12,wallZ);
    camera.lookAt(anchor);camera.updateMatrixWorld(true);const wantedRay=camera.getWorldDirection(new T.Vector3());const hit=suit.shoot();
    shot={from:suit.shot.from.toArray(),to:suit.shot.to.toArray(),hit:!!hit,palm:suit.palm().toArray(),direction:wantedRay.toArray(),rayOrigin:suit.ray.ray.origin.toArray()};
    for(let n=0;n<180&&!player.swing;n++)frame(1/60);
    camera.rotation.set(0,0,0,'YXZ');camera.updateMatrixWorld(true);
    for(let n=0;n<24;n++)frame(1/60);
   }else if(phase==='shoot'){
    camera.rotation.set(0,0,0,'YXZ');camera.updateMatrixWorld(true);suit.shoot();for(let n=0;n<8;n++){hand.update(1/60,null);suit.update(1/60);scene.updateMatrixWorld(true);}
   }else if(phase==='climb'){
    player.pos.z=wallZ+config.PLAYER.radius+.001;player.climb={nx:0,nz:1};player.keys=new Set(['KeyW']);for(let n=0;n<30;n++)frame(1/60);player.keys.clear();
   }else if(phase==='held'){
    player.attach(new T.Vector3(-12,12,wallZ),new T.Vector3(0,0,1));suit.feedHand(0);
    const model=new T.Mesh(new T.BoxGeometry(.08,.18,.08),new T.MeshStandardMaterial({color:0xffdd88}));model.position.set(.17,-.2,-.5);camera.add(model);
    const item={held:true,model,grip:[0,0,0]};model.updateMatrix();const before=model.matrix.toArray();hand.update(.2,item);scene.updateMatrixWorld(true);
    return{scene,camera,player,suit,hand,frame,shot,held:{before,after:model.matrix.toArray(),left:hand.left.hand.visible,right:hand.hand.visible}};
   }else for(let n=0;n<15;n++)frame(1/60);
   return{scene,camera,player,suit,hand,frame,shot};
  };
  window.describe=f=>{
   const {hand:h,player:p,camera,suit}=f;const bounds=mesh=>{mesh.updateWorldMatrix(true,false);camera.updateMatrixWorld(true);const v=new T.Vector3(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld).project(camera);for(let j=0;j<3;j++){const n=v.getComponent(j);min[j]=Math.min(min[j],n);max[j]=Math.max(max[j],n);}}return{x:[min[0],max[0]],y:[min[1],max[1]],z:[min[2],max[2]]};};const side=s=>({bounds:bounds(s.hand),visible:s.hand.visible,wrist:s.hand.position.toArray(),cuff:s.cuff.position.toArray(),armLength:s.arm.scale.z,quat:s.hand.quaternion.toArray(),morph:Array.from(s.hand.morphTargetInfluences),forward:new T.Vector3(0,0,1).applyQuaternion(s.hand.quaternion).toArray(),palmNormal:new T.Vector3(1,0,0).applyQuaternion(s.hand.quaternion).toArray()});
   return{feet:p.pos.toArray(),camera:camera.position.toArray(),swing:!!p.swing,anchor:p.swing?.a.toArray(),climb:!!p.climb,shot:f.shot,saved:suit.saveState(),right:side(h.right),left:side(h.left),suitState:{on:h.suit.on,swing:!!h.suit.swing,climb:h.suit.climb},held:f.held??null};
  };
  if(render){window.renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(640,420);document.body.replaceChildren(renderer.domElement);document.body.style.cssText='margin:0;overflow:hidden';}
 },render);
 for(const phase of ['rest','shoot','ground','air','right','up','climb','held']){
  const value=await page.evaluate(phase=>{window.fixture=make(phase);const before=fixture.hand.hand.position.clone();if(['ground','air','right','up'].includes(phase)&&fixture.player.swing){fixture.suit.feedHand(1/60);fixture.hand.update(0,null);}return {...describe(fixture),sameFrameFeedWristDelta:before.distanceTo(fixture.hand.hand.position)};},phase);records.push({phase,...value});
  check(value.saved?.s==='worn'&&value.right.wrist.every(Number.isFinite)&&value.left.wrist.every(Number.isFinite),phase+': actual Player/Suit/Hand has finite state and unchanged worn save');
  if(value.shot)check(value.shot.hit&&value.shot.from.every(Number.isFinite)&&value.shot.palm.every((x,i)=>x===configPalm(i)),phase+': real center-ray hit and configured palm origin');
  if(['ground','air','right','up'].includes(phase)){check(value.swing&&value.right.visible&&value.left.visible,phase+': actual attach/swing shows both hands');check(value.sameFrameFeedWristDelta<1e-10,phase+': settled reach is unchanged by same-frame feed; order is not inferred as persistent pose cause');}
  if(phase==='rest')check(!value.right.visible&&!value.left.visible,'rest: original empty hands hidden');
  if(phase==='shoot')check(value.right.visible&&value.right.morph[2]>.7,'shoot: original web hand morph');
  if(phase==='climb')check(value.climb&&value.right.visible&&value.left.visible,'actual wall climb keeps both hands');
  if(phase==='held')check(JSON.stringify(value.held.before)===JSON.stringify(value.held.after)&&value.held.right&&!value.held.left&&value.right.visible&&!value.left.visible,'held-item priority and whole model matrix preserved');
  // Flush real numeric results before optional graphics so a capture failure cannot erase measured state.
  fs.writeFileSync(`${out}/checkpoint.json`,JSON.stringify({checks,failures,errors,render,records,scope:'actual Player/Suit/Hand with controlled world collaborators, no apartment/phone/anthropometric claim'},null,2));
  if(render){const info=await page.evaluate(()=>{const f=fixture;f.scene.updateMatrixWorld(true);renderer.render(f.scene,f.camera);renderer.getContext().finish();return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,width:renderer.domElement.width,height:renderer.domElement.height};});fs.writeFileSync(`${out}/${phase}-render.json`,JSON.stringify(info,null,2));await page.screenshot({path:`${out}/${phase}.png`});check(info.calls>0&&info.triangles>0,phase+': actual native component pixels rendered');}
 }
 check(!errors.length,'zero page errors');check(await page.evaluate(render=>render?glRequests===1:glRequests===0,render),render?'exactly one component WebGL renderer':'native phase never requested WebGL');
 if(process.env.WEB_HANDS_BASELINE){const before=JSON.parse(fs.readFileSync(process.env.WEB_HANDS_BASELINE,'utf8'));for(const row of records){const prior=before.records.find(r=>r.phase===row.phase);check(!!prior&&['feet','camera','swing','anchor','climb','shot','saved','held'].every(k=>JSON.stringify(prior[k])===JSON.stringify(row[k])),row.phase+': independent before/after gameplay origin/anchor/physics/save/held parity');if(['rest','shoot','climb','held'].includes(row.phase))check(['right','left'].every(side=>Object.keys(prior[side]).every(k=>JSON.stringify(prior[side][k])===JSON.stringify(row[side][k]))),row.phase+': original control hand transforms/morphs exactly preserved');else{check(row.right.armLength<prior.right.armLength&&row.left.armLength<prior.left.armLength,row.phase+': both actual drawn sleeves shorten relative to baseline');check(['right','left'].every(side=>{const b=row[side].bounds;return b.x[0]>-1&&b.x[1]<1&&b.y[0]>-1&&b.y[1]<1&&b.z[0]>-1&&b.z[1]<1;}),row.phase+': both actual morphed hands stay inside component view');}}}
 }finally{fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,render,records,scope:'Actual Player/Suit/Hand with controlled simple surfaces; no apartment/phone/anthropometric claim'},null,2));await browser.close();const changed=Object.entries(hashes).filter(([p,h])=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')!==h).map(([p])=>p);fs.writeFileSync(`${out}/completion.json`,JSON.stringify({checks,failures,errors,changed},null,2));if(changed.length)failures++;}
 console.log(`${failures?'FAILED':'ALL PASS'} ${checks} checks, ${failures} FAIL`);process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
// The issue explicitly preserves this existing gameplay/strand origin; it is not derived from the new pose.
function configPalm(i){return[.17,-.1,-.44][i];}
