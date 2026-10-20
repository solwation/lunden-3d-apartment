// #1398: three real Ghosts clients through the local Worker; accepted mutual poses, audio, love and replay/abort.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs');
const [base='http://localhost:8937',worker='http://localhost:8938',out='/tmp/kiss1398-peers']=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:1100,height:750}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// component fixture'}));await page.goto(base);
 const first=await page.evaluate(async worker=>{
  const T=await import('three'),{Ghosts}=await import('/src/ghosts.js'),{KISS}=await import('/src/config.js'),audio=await import('/src/audio.js');
  const stat=await import('/src/stats.js');document.body.replaceChildren();document.body.style.margin='0';
  audio.initAudio();const parts=audio.audioParts(),analyser=parts.ctx.createAnalyser();parts.master.connect(analyser);const wave=new Float32Array(analyser.fftSize);let peak=0;
  const scene=new T.Scene();scene.background=new T.Color(0xbfcbd5);scene.add(new T.HemisphereLight(0xffffff,0x665544,3));
  const light=new T.DirectionalLight(0xfff1da,2);light.position.set(2,4,3);scene.add(light);
  const camera=new T.PerspectiveCamera(44,1100/750,.1,100);camera.position.set(3,1.95,2.5);camera.lookAt(0,1,0);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,750);document.body.append(renderer.domElement);
  const ground=new T.Mesh(new T.PlaneGeometry(12,12),new T.MeshLambertMaterial({color:0x8d9d7c}));ground.rotation.x=-Math.PI/2;scene.add(ground);
  const stateA={p:[0,0,.55],r:0},stateB={p:[0,0,-.55],r:Math.PI},stateC={p:[3,0,0],r:0};
  const make=(name,state,visible)=>new Ghosts({scene:visible?scene:new T.Scene(),camera,url:worker,name:()=>name,state:()=>({...state}),score:()=>0,weapon:()=>'',active:()=>true});
  const A=make('Olof test',stateA,false),B=make('sArAh 2',stateB,false),C=make('Bertil',stateC,true);
  let loveA=0,loveB=0,sounds=0;A.onLove=id=>{if(stat.awardLove(id))loveA++;};B.onLove=()=>loveB++;C.onKiss=(m,at)=>{sounds++;audio.sfx.kiss(at);};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)),until=async f=>{for(let i=0;i<240;i++){if(f())return;await sleep(25);}throw Error('peer timeout');};
  const loop=setInterval(()=>{for(const g of [A,B,C])g.update(.016);analyser.getFloatTimeDomainData(wave);peak=Math.max(peak,...wave.map(Math.abs));},16);
  await until(()=>[A,B,C].every(x=>x.connected&&x.others.size===2&&[...x.others.values()].every(g=>g.have)));
  const sarah=[...A.others.values()].find(g=>g.name==='sArAh 2'),other=[...A.others.values()].find(g=>g.name==='Bertil');
  A.targets();const near=sarah.door.verb,otherVerb=other.door.verb,scoreBefore=stat.totalScore();A.greet(sarah);
  const optimistic=!A.kissHearts&&!loveA;
  await until(()=>loveA===1);renderer.render(scene,camera);const pair=[...C.others.values()],poses=pair.map(g=>({name:g.name,kiss:g.avatar.material.userData.u.uKiss.value,lean:g.avatar.bones.torso.rotation.x,wave:g.waveT,head:g.avatar.bones.head.getWorldPosition(new T.Vector3()).toArray()}));
  A.beforeMirror();const own=A.myGhost.avatar.material.userData.u.uKiss.value;A.afterMirror();
  const mouth=g=>{g.mesh.updateMatrixWorld(true);g.mesh.skeleton.update();const v=new T.Vector3(),sum=new T.Vector3(),geo=g.mesh.geometry,p=geo.attributes.position,flag=geo.attributes.pucker;let n=0;for(let i=0;i<p.count;i++)if(flag.getX(i)===1){v.fromBufferAttribute(p,i);v.x*=1-KISS.narrow;v.z+=KISS.pucker;g.mesh.applyBoneTransform(i,v);sum.add(v.applyMatrix4(g.mesh.matrixWorld));n++;}return sum.divideScalar(n).toArray();};
  const mouths=pair.map(mouth);
  renderer.render(scene,camera);const calls=renderer.info.render.calls;C.kissHearts.points.visible=false;renderer.render(scene,camera);const idleCalls=renderer.info.render.calls;C.kissHearts.points.visible=true;renderer.render(scene,camera);
  const event=A.kisses[0].m;A.message(JSON.stringify(event));A.updateKisses(performance.now());const duplicate=loveA===1,scoreDelta=stat.totalScore()-scoreBefore,statsDuplicate=!stat.awardLove(event.id);
  window.K={T,A,B,C,sarah,other,loop,renderer,scene,camera,stateA,stateB,stateC,sleep,until,event,stat,audio,analyser,wave,get:()=>({loveA,loveB,sounds,peak})};
  return{calls,idleCalls,mouths,near,otherVerb,optimistic,poses,own,duplicate,scoreDelta,statsDuplicate,hearts:C.kissHearts?.points.visible,...window.K.get()};
 },worker);
 await page.screenshot({path:out+'/mutual-kiss.png'});
 const finish=await page.evaluate(async()=>{
  const k=window.K,{A,B,C,sleep,until,event,T}=k;
  // Close-up still uses the real production pose, then return to the live clock.
  const start=performance.now()-1000;for(const g of C.others.values()){if(g.kiss)g.kiss.start=start;g.animate(performance.now(),1,0,0);}
  k.camera.position.set(1.5,1.6,0);k.camera.lookAt(0,1.5,0);k.renderer.render(k.scene,k.camera);
  return true;
 });await page.screenshot({path:out+'/lips.png'});
 const rest=await page.evaluate(async()=>{
  const k=window.K,{A,B,C,sleep,until,T}=k;
  await sleep(2500);const restored=[...C.others.values()].every(g=>!g.kiss&&g.avatar.material.userData.u.uKiss.value===0);
  const olof=[...B.others.values()].find(g=>g.name==='Olof test');B.greet(olof);await until(()=>k.get().loveB===1);const reverse=k.get().loveA===1;
  await sleep(3100);const score=k.get().loveA;A.greet(k.sarah);await sleep(150);B.disconnect();await sleep(1100);const abort=k.get().loveA===score;
  const cancelled=!A.kisses.length&&!A.myGhost.kiss;
  const panel=document.createElement('div');k.stat.renderStats(panel);
  const saved=JSON.parse(localStorage.getItem('lunden.stats')||'{}');
  const persisted=saved.love===1&&saved.loveReceipts.includes(k.event.id),panelText=panel.textContent.includes('Kärlek');
  A.targets();const farBefore=k.other.door.verb;
  await sleep(2100);let ordinary=0;C.onGreet=m=>{if(m.k!==15)ordinary++;};A.greet(k.other);await until(()=>ordinary===1);
  const normalGreeting=ordinary===1&&k.get().loveA===1;
  k.audio.toggleMuted();await sleep(350);k.audio.sfx.kiss(k.camera.position);await sleep(150);
  k.analyser.getFloatTimeDomainData(k.wave);const muted=Math.max(...k.wave.map(Math.abs))<.00001;k.audio.toggleMuted();
  clearInterval(k.loop);A.disconnect();C.disconnect();
  return{normalGreeting,muted,persisted,panelText,restored,reverse,abort,cancelled,farBefore,...k.get()};
 });
 const result={first,rest,errors};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 const ok=first.near==='pussa'&&first.otherVerb==='hälsa på'&&first.optimistic&&first.poses.every(p=>p.kiss>.8&&Math.abs(p.lean)>.3&&p.wave===0)&&Math.hypot(...first.mouths[0].map((v,i)=>v-first.mouths[1][i]))<.035&&first.own>.8&&first.duplicate&&first.statsDuplicate&&first.scoreDelta===100&&first.hearts&&first.calls===first.idleCalls+1&&rest.restored&&rest.reverse&&rest.abort&&rest.cancelled&&rest.persisted&&rest.panelText&&rest.normalGreeting&&rest.muted&&rest.peak>.001&&!errors.length;
 console.log(ok?'ALL PASSED':'FAILED');process.exitCode=ok?0:1;
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
