// #980: one combined free-flight CPU/product Basket.onUse/native Combat/actual two-WS driver.
// No apartment or WebGL. node tools/ballheadtest.cjs GAME WORKER OUT
const fs=require('node:fs'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game='http://localhost:8882',worker='http://localhost:8883',out='/tmp/lunden-priority-980/native']=process.argv.slice(2);
let checks=0,failures=0;const records=[],errors=[];
const check=(ok,label)=>{checks++;console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failures++;};
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});const pages=[];
 try{
  for(let i=0;i<2;i++){
   const p=await browser.newPage({viewport:{width:390,height:480}});pages.push(p);p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// native basketball fixture'}));await p.goto(game,{waitUntil:'domcontentloaded'});
   await p.evaluate(async({i,worker})=>{
    const native=HTMLCanvasElement.prototype.getContext;window.webglCalls=0;HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){webglCalls++;throw Error('No WebGL');}return native.call(this,k,...a);};
    document.getElementById('overlay').hidden=true;document.getElementById('loading').style.display='none';document.documentElement.classList.remove('resuming');
    window.T=await import('three');window.C=await import('/src/config.js');window.F=await import('/src/ballflight.js');window.S=await import('/src/stats.js');
    const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js'),{Basketball,Hoop}=await import('/src/basket.js'),{Marks}=await import('/src/marks.js');
    window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);scene.add(camera);window.solids=new T.Group();scene.add(solids);
    window.marks=new Marks(scene,camera,[solids]);window.hoop=new Hoop();scene.add(hoop.object);window.ball=new Basketball(scene,camera,{marks,hoop,world:{}});
    window.pose={p:i?[2,0,0]:[0,0,0],r:0};window.acks=[];window.markers=0;window.deaths=0;window.remoteShots=0;
    window.weapon=()=>i?'rifle':ball.held?'ball':'';
    S.setScoreElement(document.getElementById('score'));S.setBadgeElement(document.getElementById('badges'));
    window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Bollmål':'Bollkastare',active:()=>true,state:()=>({...pose,p:pose.p.slice()}),weapon,score:()=>S.totalScore(),mirrored:()=>false});
    window.combat=new Combat({scene,camera,ghosts,basket:ball,weapon,feet:()=>new T.Vector3(...pose.p),onHit:()=>S.bump('pvpHits'),onDie:()=>deaths++});
    const hit=ghosts.onHit,show=combat.hitMarker.show.bind(combat.hitMarker),shot=ghosts.onShot;
    ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};combat.hitMarker.show=m=>{markers++;show(m);};ghosts.onShot=(m,g)=>{remoteShots++;shot(m,g);};
    window.timer=setInterval(()=>{ghosts.update();combat.update(.04);scene.updateMatrixWorld(true);},40);
    window.snap=()=>({hits:combat.hits,lives:combat.lives,score:S.totalScore(),kills:S.stats.pvpKills??0,markers,deaths,last:acks.at(-1),wire:combat.lastShot});
    window.setWall=(kind)=>{
     for(const m of [...solids.children]){m.removeFromParent();m.geometry.dispose();m.material.dispose();}
     if(kind){const m=new T.Mesh(new T.BoxGeometry(...(kind==='floor'?[20,.1,20]:[.1,5,5])),new T.MeshBasicMaterial({transparent:kind==='glass',opacity:kind==='glass'?.3:1}));m.position.set(...(kind==='floor'?[5,-.05,0]:[1,2,0]));solids.add(m);}
     marks.list=null;scene.updateMatrixWorld(true);
    };
    window.prepare=()=>{camera.position.set(0,1.62,0);camera.lookAt(2,1.62,0);camera.updateMatrixWorld(true);ball.take();};
    window.releaseProduct=kind=>{
     const foe=combat.foes()[0],tall=C.avatarLook(foe.id).tall;
     const heights=kind==='head'?[1.72*tall-.5,1.72*tall-.3,1.72*tall-.1]:kind==='body'?[.65,.85,1.05]:kind==='low'?[.2]:[2.8];
     let result;
     search:for(const y of heights)for(const slope of [-.1,0,.1,.2,.3]){
      camera.position.set(0,y,0);camera.lookAt(6,y+slope*6,0);camera.updateMatrixWorld(true);
      ball.take();ball.onUse();const launch={o:ball.shotFrom.clone(),d:ball.v.clone().normalize(),s:ball.v.length()};
      const rounded={o:launch.o.clone().set(...launch.o.toArray().map(x=>Math.round(x*100)/100)),d:launch.d.clone().set(...launch.d.toArray().map(x=>Math.round(x*1000)/1000)),s:Math.round(launch.s*100)/100};
      const contact=combat.ballCandidate(rounded,10);result={launch,contact};
      if(kind==='head'?!!contact?.hc:kind==='body'?contact&&!contact.hc:!contact)break search;
     }
     // All velocity/origin values above come from actual Basketball.onUse/release.
     combat.fire('ball',result.launch,true);
     return {o:result.launch.o.toArray(),d:result.launch.d.toArray(),s:result.launch.s,predictedHead:!!result.contact?.hc,
       shotFrom:ball.shotFrom.toArray(),actualVelocity:ball.v.toArray(),held:ball.held,flying:ball.flying};
    };
   },{i,worker});
  }
  const [a,b]=pages;await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected)));
  const prepare=async()=>{await a.evaluate(()=>prepare());await b.waitForFunction(()=>combat.foes().length===1&&combat.foes()[0].h==='ball');await a.waitForTimeout(1100);};
  const attempt=async(label,kind,{head=false,miss=false,wall=''}={})=>{
   await prepare();await a.evaluate(w=>setWall(w),wall);const before=await a.evaluate(()=>snap()),health=await b.evaluate(()=>combat.lives),seen=await b.evaluate(()=>remoteShots);
   const launch=await a.evaluate(kind=>releaseProduct(kind),kind);await b.waitForFunction(n=>remoteShots>n,seen);
   if(!miss)await a.waitForFunction(n=>combat.hits===n,before.hits+1);else await a.waitForTimeout(150);
   const after=await a.evaluate(()=>snap()),target=await b.evaluate(()=>snap());records.push({label,launch,before,after,target,health});
   check(launch.flying&&!launch.held&&launch.o.every((v,j)=>v===launch.shotFrom[j]),label+': actual onUse/hand/release/shotFrom velocity');
   if(miss)check(after.hits===before.hits&&after.wire.to===null&&after.score===before.score&&target.lives===health,label+': real miss packet without damage/reward');
   else{
    const left=health-(head?2:1);check(!!after.last.head===head&&after.last.l===left&&target.lives===(left<=0?10:left),label+': authoritative '+(head?2:1)+' life damage');
    check(after.score===before.score+5&&after.markers===before.markers+1,label+': unchanged points/marker once');
   }
   return after;
  };
  await attempt('Product head throw','head',{head:true});
  const markerInfo=await a.evaluate(()=>{const m=document.getElementById('hit-marker'),r=m.getBoundingClientRect();return {text:m.textContent,visible:!m.hidden&&r.width>0&&r.left>=0&&r.right<=innerWidth,receipt:acks.at(-1)};});
  check(markerInfo.visible&&markerInfo.text==='Huvudträff!','actual authoritative head marker visible at receipt before capture');
  records.push({markerInfo});await a.screenshot({path:out+'/ball-head-ack.png'});
  await attempt('Product torso throw','body');
  await attempt('Above-player miss','miss',{miss:true});await attempt('Solid wall','head',{miss:true,wall:'wall'});await attempt('Glass blocks like Basketball.cast','head',{miss:true,wall:'glass'});await attempt('Floor ends first free flight','low',{miss:true,wall:'floor'});
  await a.evaluate(()=>setWall(''));let last;do{last=await attempt('Head until lethal','head',{head:true});}while(!last.last.dead);
  check(typeof last.last.kill==='string'&&last.kills===1&&(await b.evaluate(()=>deaths))===1,'one lethal UUID/death/reset');
  const before=await a.evaluate(()=>snap());await a.evaluate(m=>ghosts.message(JSON.stringify(m)),last.last);const after=await a.evaluate(()=>snap());
  check(after.kills===before.kills&&after.score===before.score&&after.hits===before.hits&&after.markers===before.markers,'lethal replay adds nothing');
  await prepare();
  const torso=records.find(r=>r.label==='Product torso throw').after.wire;
  const claimBefore=await a.evaluate(()=>snap());await a.evaluate(w=>ghosts.fire({...w,hc:[2,2,1.6,0]}),torso);
  await a.waitForFunction(n=>combat.hits===n,claimBefore.hits+1);
  const denied=await a.evaluate(()=>snap());
  check(!denied.last.head&&denied.last.l===9,'actual Worker denies forged head claim on real product body trajectory');
  await prepare();const cached={...records.find(r=>r.label==='Product head throw').after.wire};delete cached.hc;
  const legacyBefore=await a.evaluate(()=>snap());await a.evaluate(w=>ghosts.fire(w),cached);await a.waitForFunction(n=>combat.hits===n,legacyBefore.hits+1);
  const legacyAfter=await a.evaluate(()=>snap());check(!legacyAfter.last.head&&legacyAfter.last.l===8,'cached unversioned real ball launch keeps body1');
  await a.evaluate(w=>ghosts.fire(w),cached);await a.waitForTimeout(350);const rate=await a.evaluate(()=>snap());
  check(rate.hits===legacyAfter.hits&&rate.score===legacyAfter.score&&rate.markers===legacyAfter.markers,'unchanged server cadence rejects immediate repeated ball hit');
  records.push({claims:{torso,denied,cached,legacyBefore,legacyAfter,rate}});
  const cpu=await a.evaluate(()=>{
   setWall('');const foe=combat.foes()[0],state={p:foe.feet.toArray(),r:foe.root.rotation.y};
   // Independent actual Basket.idle comparisons use the same starting launch, without simulated World.
   const shot={t:'a',w:'ball',o:[0,1.8,0],d:[1,.2,0],s:6};shot.d=new T.Vector3(...shot.d).normalize().toArray();
   const predicted=[...F.ballSegments(shot,10)];const find=t=>{
    let elapsed=0;
    for(const seg of predicted){elapsed+=seg.length/Math.hypot(...seg.velocity);if(elapsed>=t)return new T.Vector3(...seg.end);}
   };
   const dtRows=[];
   for(const dt of [1/60,.02]){
    ball.release(new T.Vector3(...shot.d).multiplyScalar(shot.s),false);ball.model.position.fromArray(shot.o);ball.shotFrom.fromArray(shot.o);ball.air=1;
    const launchVelocity=ball.v.clone();for(let n=0;n<30;n++)ball.idle(dt);
    dtRows.push({dt,time:dt*30,actual:ball.model.position.toArray(),prediction:find(dt*30)?.toArray(),velocity:launchVelocity.toArray()});
   }
   const r=C.BASKET.ball.r,side={origin:[0,1.72*C.avatarLook(foe.id).tall,.16],direction:[1,0,0],length:3};
   const arc={t:'a',w:'ball',o:[0,1.72*C.avatarLook(foe.id).tall+C.BASKET.ball.gravity*.4*.4/2,0],d:[1,0,0],s:5};
   return {arcHead:!!F.ballHeadContact(foe.id,state,arc,10),straightHead:!!C.rifleBoxHeadContact(foe.id,state,arc.o,arc.d,10,C.BASKET.ball.r),dtRows,range:[...F.ballSegments(shot,.5)].reduce((s,p)=>s+p.length,0),radiusHit:!!F.ballPlayerContact(foe.id,state,side),zeroRadiusHit:!!C.rifleBoxHeadContact(foe.id,state,side.origin,side.direction,side.length),
    bodyFirst:F.ballHeadContact(foe.id,state,{t:'a',w:'ball',o:[0,.7,0],d:[1,.6,0].map(x=>x/Math.hypot(1,.6)),s:12},10),
    laterHead:[...F.ballSegments({o:[0,.7,0],d:[1,.6,0].map(x=>x/Math.hypot(1,.6)),s:12},10)].some(seg=>!!C.rifleBoxHeadContact(foe.id,state,seg.origin,seg.direction,seg.length,C.BASKET.ball.r))};
  });records.push({cpu});
  check(cpu.arcHead&&!cpu.straightHead,'falling ball arc hits a head while its original straight aim ray misses');
  check(Math.abs(cpu.range-.5)<1e-6,'PvP range clips actual travelled distance');
  check(cpu.radiusHit&&!cpu.zeroRadiusHit,'existing ball radius includes an off-center logical contact');
  check(cpu.dtRows.every(r=>new Float64Array(r.actual).every(Number.isFinite)&&r.prediction&&Math.hypot(...r.actual.map((v,j)=>v-r.prediction[j]))<.06),'actual Basketball.idle at16.7/20ms agrees with20ms prediction within declared6cm fixture tolerance');
  check(cpu.bodyFirst===null&&cpu.laterHead,'first body contact denies a real later head intersection');
  const img=await a.evaluate(()=>{const marker=document.getElementById('hit-marker');const el=document.createElement('pre');el.textContent='Basket: verklig kastbana / två lokala WS\nHuvud2, kropp1; vägg/glass stoppar\nIngen World/WebGL';el.style.cssText='position:fixed;top:100px;left:12px;background:white;color:black;padding:12px';document.body.append(el);return {marker:marker.textContent,visible:!marker.hidden};});
  await a.screenshot({path:out+'/ball-head-hud.png'});records.push({image:img});
  check((await Promise.all(pages.map(p=>p.evaluate(()=>webglCalls)))).every(n=>n===0),'zero WebGL');check(errors.length===0,'zero browser errors');
 }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(timer);ghosts.disconnect();}).catch(()=>{});await browser.close();fs.writeFileSync(out+'/result.json',JSON.stringify({checks,failures,errors,records,scope:'native real product launch/Combat/local WS, no World/phone/FPS; canonical20ms prediction'},null,2));}
 console.log(`${failures?'FAILED':'ALL PASS'} ${checks} checks, ${failures} FAIL`);process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
