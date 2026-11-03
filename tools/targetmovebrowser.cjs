// #1820: actual Target + Ghosts, real local PlayerRoom sockets, real surroundings/collision. No apartment bootstrap.
const fs=require('node:fs'),kit=require('./testkit.cjs');
const [base='http://localhost:8910',worker='http://localhost:8912',out='docs/verification/1820']=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await kit.launch(),checks=[],errors=[],pages=[];const check=(ok,label)=>{checks.push({ok:!!ok,label});if(!ok)throw Error(label);console.log('PASS '+label)};
try{
 const open=async(draw=false)=>{
  const page=await browser.newPage({viewport:{width:1000,height:650},deviceScaleFactor:1});pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/bootstrap.js*',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(async({worker,draw})=>{
   const T=await import('three'),{Target}=await import('/src/target.js'),{Ghosts}=await import('/src/ghosts.js'),S=await import('/src/surroundings.js'),{TARGET:C}=await import('/src/config.js');
   const scene=new T.Scene(),camera=new T.PerspectiveCamera(52,1000/650,.1,500),target=new Target();scene.add(target.object);target.reset();
   let from=[5,0,25.7];const ghosts=new Ghosts({scene,camera,url:worker,state:()=>({p:from,r:0}),score:()=>0,name:()=>'',mirrored:()=>false});
   target.sync.net={ready:()=>ghosts.connected,send:m=>ghosts.target(m)};ghosts.onTarget=(m,welcome)=>target.sync.receive(m,welcome);
   window.fixture={T,scene,camera,target,ghosts,S,C,setFrom:p=>{from=p;ghosts.ws.send(JSON.stringify({p,r:0}));}};
   if(draw){scene.background=new T.Color(0xc5ddea);scene.add(new T.HemisphereLight(0xffffff,0x697a52,2));const sun=new T.DirectionalLight(0xffffff,2);sun.position.set(-25,60,-30);scene.add(sun);scene.add(S.buildSurroundings({grass:new T.MeshStandardMaterial({color:0x6e9251})}));const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,650);renderer.setPixelRatio(1);document.body.replaceChildren(renderer.domElement);document.body.style.margin=0;Object.assign(fixture,{renderer});}
   ghosts.connect(); fixture.timer = setInterval(()=>ghosts.update(),50);
  },{worker,draw});await page.waitForFunction(()=>fixture.ghosts.connected,null,{polling:100});return page;
 };
 const a=await open(true),b=await open();
 const scan=await a.evaluate(async()=>{const{C,S}=fixture,F=await import('/src/farwalk.js'),P=await import('/src/player.js'),R=await import('/src/roads.js'),K=await import('/src/riverpark.js');let minClear=Infinity,maxRelief=0;for(const[x,z]of C.moveSpots){const y=S.groundY(x,z);if(R.onRoad(x,z,3)||K.onParkPath(x,z,1))throw Error('spot on road/path');for(const s of F.farWalls(x,z,y))minClear=Math.min(minClear,P.segDist(x,z,s));for(const dx of[-1,0,1])for(const dz of[-1,0,1])maxRelief=Math.max(maxRelief,Math.abs(S.groundY(x+dx,z+dz)-y));}return{spots:C.moveSpots.length,minClear,maxRelief,trees:S.treeFeet.length};});
 check(scan.spots===51&&scan.minClear>=2.5&&scan.maxRelief<=.15,'all 51 configured grass spots clear actual farWalls/trees/roads/paths with flat stand/approach');
 const render=async(page,name,close=false)=>{const state=await page.evaluate(close=>{const f=fixture,{T,target,camera,scene,renderer}=f;const p=target.object.position;const front=new T.Vector3(0,0,-1).applyQuaternion(target.object.quaternion);if(close)camera.position.copy(p).addScaledVector(front,5).add(new T.Vector3(0,2.1,0));else camera.position.set(5,2,25.7);camera.lookAt(p.x,p.y+1,p.z);scene.updateMatrixWorld(true);renderer.render(scene,camera);return{state:target.sync.state,actual:target.object.position.toArray(),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,camera:camera.position.toArray()};},close);await page.screenshot({path:`${out}/${name}.png`});return state};
 const before=await render(a,'before-east-landing',true);
 const hit=async(distance)=>a.evaluate(distance=>{const{T,target,setFrom}=fixture;target.object.updateMatrixWorld(true);const p=target.face.getWorldPosition(new T.Vector3()),front=new T.Vector3(0,0,-1).applyQuaternion(target.object.quaternion),from=p.clone().addScaledVector(front,distance);setFrom([from.x,from.y-1.4,from.z]);return target.hit(p,from);},distance);
 check(await hit(8)===40,'first actual bullseye credits 40 unchanged board points');
 await a.waitForFunction(()=>fixture.target.sync.state.points===40,null,{polling:100});
 await a.waitForTimeout(250);check(await hit(1)===10,'second bullseye crosses the 50-point relocation threshold');
 await a.waitForFunction(()=>fixture.target.sync.state.v===1,null,{polling:100});await b.waitForFunction(()=>fixture.target.sync.state.v===1,null,{polling:100});
 const sinking=await a.evaluate(()=>{const{target}=fixture;target.update(.3,true);return{pending:!!target.pending,y:target.object.position.y,k:target.k,x:target.object.position.x,z:target.object.position.z};});
 check(sinking.pending&&sinking.k<1&&sinking.x===before.state.x&&sinking.z===before.state.z,'board sinks at original location before changing position');
 for(const page of[a,b])await page.evaluate(()=>{fixture.target.update(.6,true);fixture.target.update(.6,true)});
 const moved=await a.evaluate(()=>{const f=fixture;return{state:f.target.sync.state,pos:f.target.object.position.toArray(),ground:f.S.groundY(f.target.object.position.x,f.target.object.position.z),score:f.target.score.total};});
 const peer=await b.evaluate(()=>({state:fixture.target.sync.state,pos:fixture.target.object.position.toArray()}));
 check(JSON.stringify(moved.state)===JSON.stringify(peer.state)&&JSON.stringify(moved.pos)===JSON.stringify(peer.pos),'both actual Target/Ghosts clients show identical authoritative position and rotation');
 check(moved.pos[1]===moved.ground&&Math.abs(Math.hypot(moved.pos[0]-before.state.x,moved.pos[2]-before.state.z)-50)<=5&&moved.score===50,'new stand follows groundY, moves 45–55m, local scoreboard retains all 50 points');
 const c=await open();const late=await c.evaluate(()=>({state:fixture.target.sync.state,pos:fixture.target.object.position.toArray(),pending:!!fixture.target.pending}));
 check(JSON.stringify(late.state)===JSON.stringify(moved.state)&&JSON.stringify(late.pos)===JSON.stringify(moved.pos)&&!late.pending,'late join applies current state quietly without flashing original position');
 const close=await render(a,'after-ring-face',true);
 // Offline fallback runs the same rule through actual Target.hit, without a network.
 const offline=await b.evaluate(()=>{const{T,Target}=fixture;const t=fixture.target;t.sync.net=null;t.sync.state.points=40;t.object.updateMatrixWorld(true);const p=t.face.getWorldPosition(new T.Vector3()),front=new T.Vector3(0,0,-1).applyQuaternion(t.object.quaternion);const v=t.sync.state.v;t.hit(p,p.clone().addScaledVector(front,1));return t.sync.state.v===v+1&&!!t.pending;});check(offline,'disconnected target uses the same local relocation rule');
 fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,scan,before,sinking,moved,peer,late,close,errors,mode:'Chromium/SwiftShader component, actual surroundings and Ghosts/local PlayerRoom; apartment bootstrap suppressed'},null,2));check(errors.length===0,'zero page errors');
}catch(e){errors.push(e.stack);console.error(e.stack);process.exitCode=1}finally{fs.writeFileSync(`${out}/summary.json`,JSON.stringify({checks,errors},null,2));for(const p of pages)await p.evaluate(()=>(clearInterval(fixture.timer),fixture?.ghosts.disconnect())).catch(()=>{});await browser.close()}})();
