// #1405: three real Ghosts clients through the local Worker: an ordinary pair hugs (menu rows, no optimistic pose, both
// avatars seen by an observer, own mirror), the pose returns after the hug and when a partner disconnects mid-hug, and
// the ordinary greeting is unchanged. Args: GAME WORKER OUT.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs');
const [base='http://localhost:8148',worker='http://localhost:8149',out='/tmp/hug1405-peers']=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:{width:1100,height:750}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// component fixture'}));await page.goto(base);
 const first=await page.evaluate(async worker=>{
  const T=await import('three'),{Ghosts}=await import('/src/ghosts.js'),{HUG}=await import('/src/config.js');
  document.body.replaceChildren();document.body.style.margin='0';
  const scene=new T.Scene();scene.background=new T.Color(0xbfcbd5);scene.add(new T.HemisphereLight(0xffffff,0x665544,3));
  const light=new T.DirectionalLight(0xfff1da,2);light.position.set(2,4,3);scene.add(light);
  const camera=new T.PerspectiveCamera(44,1100/750,.1,100);camera.position.set(3,1.8,1.2);camera.lookAt(0,1.05,0);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,750);document.body.append(renderer.domElement);
  const ground=new T.Mesh(new T.PlaneGeometry(12,12),new T.MeshLambertMaterial({color:0x8d9d7c}));ground.rotation.x=-Math.PI/2;scene.add(ground);
  const stateA={p:[0,0,.6],r:0},stateB={p:[0,0,-.6],r:Math.PI},stateC={p:[3,0,1.2],r:0};
  const make=(name,state,visible)=>new Ghosts({scene:visible?scene:new T.Scene(),camera,url:worker,name:()=>name,state:()=>({...state}),score:()=>0,weapon:()=>'',active:()=>true});
  const A=make('Bertil',stateA,false),B=make('Anna',stateB,false),C=make('Observer',stateC,true);
  let hugsC=0,greetsC=0;C.onHug=()=>hugsC++;C.onGreet=()=>greetsC++;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)),until=async f=>{for(let i=0;i<240;i++){if(f())return;await sleep(25);}throw Error('peer timeout');};
  const loop=setInterval(()=>{for(const g of [A,B,C])g.update(.016);},16);
  await until(()=>[A,B,C].every(x=>x.connected&&x.others.size===2&&[...x.others.values()].every(g=>g.have)));
  const anna=[...A.others.values()].find(g=>g.name==='Anna');A.targets();
  const rows=anna.door.options().map(r=>({id:r.id,label:r.label,reason:r.reason??''}));
  const kissRefused=A.greet(anna,'kiss')===null;
  renderer.render(scene,camera);const idleCalls=renderer.info.render.calls;
  const line=A.greet(anna,'hug');const optimistic=!A.hugs?.length&&!anna.hug;
  await until(()=>[...C.others.values()].every(g=>g.hug));
  await sleep(HUG.contact*1000+150);renderer.render(scene,camera);const calls=renderer.info.render.calls;
  const pair=[...C.others.values()];for(const g of pair)g.avatar.object.updateMatrixWorld(true);
  const centre=g=>g.avatar.object.getWorldPosition(new T.Vector3());
  const bodyGap=centre(pair[0]).distanceTo(centre(pair[1]));
  const reach=pair.map(g=>{const other=pair.find(x=>x!==g),c=centre(other);return ['L','R'].map(s=>{const h=g.avatar.hand(s);return Math.hypot(h.x-c.x,h.z-c.z);});});
  A.beforeMirror?.();const own=!!A.myGhost.hug;A.afterMirror?.();
  window.K={T,A,B,C,anna,loop,renderer,scene,camera,sleep,until,HUG,get:()=>({hugsC,greetsC})};
  return{rows,kissRefused,line,optimistic,idleCalls,calls,bodyGap,reach,own,hugsC};
 },worker);
 await page.screenshot({path:out+'/hug.png'});
 const rest=await page.evaluate(async()=>{
  const k=window.K,{A,B,C,anna,sleep,until,HUG,T}=k;
  await sleep(HUG.duration*1000);
  const restored=[...C.others.values()].every(g=>!g.hug&&g.avatar.object.position.length()===0)&&!anna.hug&&!A.hugs.length;
  // a second hug, then the partner leaves mid-embrace: everybody lets go at once
  await sleep(600);A.greet(anna,'hug');await until(()=>[...C.others.values()].every(g=>g.hug));await sleep(300);
  const bertilC=[...C.others.values()].find(g=>g.name==='Bertil');B.update=()=>{};B.disconnect();await until(()=>C.others.size===1&&A.others.size===1);
  await sleep(100);const cancelled=!bertilC.hug&&bertilC.avatar.object.position.length()===0&&!A.myGhost.hug&&!A.hugs.length&&!C.hugs.length;
  return{restored,cancelled,...k.get()};
 });
 await page.screenshot({path:out+'/after.png'});
 const greet=await page.evaluate(async worker=>{
  const k=window.K,{A,C,sleep,until,T}=k,{Ghosts}=await import('/src/ghosts.js');
  const B=new Ghosts({scene:new T.Scene(),camera:k.camera,url:worker,name:()=>'Anna',state:()=>({p:[0,0,-.6],r:Math.PI}),score:()=>0,weapon:()=>'',active:()=>true});
  const loop=setInterval(()=>B.update(.016),16);await until(()=>A.others.size===2&&[...A.others.values()].every(g=>g.have));
  const anna=[...A.others.values()].find(g=>g.name==='Anna');await sleep(3100);const before=k.get().greetsC;const line=A.greet(anna,'greet');
  await until(()=>k.get().greetsC===before+1);const waved=[...C.others.values()].find(g=>g.name==='Bertil').waveT>0;
  const noHug=![...C.others.values()].some(g=>g.hug);clearInterval(loop);clearInterval(k.loop);A.disconnect();B.disconnect();C.disconnect();
  return{line,waved,noHug};
 },worker);
 const result={first,rest,greet,errors};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 const ok=JSON.stringify(first.rows.map(r=>r.id))==='["greet","hug"]'&&first.rows.every(r=>!r.reason)&&first.kissRefused&&first.line==='Kram på dig, Anna!'&&first.optimistic&&first.calls===first.idleCalls&&Math.abs(first.bodyGap-.34)<.08&&first.reach.flat().every(d=>d<.3)&&first.own&&first.hugsC===1&&rest.restored&&rest.cancelled&&greet.waved&&greet.noHug&&/Anna|Hej|Tjena/.test(greet.line)&&!errors.length;
 console.log(ok?'ALL PASSED':'FAILED');process.exitCode=ok?0:1;
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
