// #1173: exact Ghosts/Avatar/Combat modules, two actual local PlayerRoom clients; no full World.
// Optional BASELINE_GHOSTS points to the exact committed pre-change ghosts.js for the before control.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game='http://localhost:8793',worker='http://localhost:8794',out='/tmp/lunden-avatar1173-codex'] = process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true}); const baseline=process.env.BASELINE_GHOSTS, baselineBuild=process.env.BASELINE_BUILD_CONFIG;
 const checks=[],errors=[],records=[];
 const check=(ok,label)=>{checks.push({ok,label});console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)throw Error(label);};
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const pages=[];
  const open=async(i,saved=null)=>{
   const context=await browser.newContext({viewport:{width:800,height:620}}),p=await context.newPage();pages.push(p);
   p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
   if(saved)await p.addInitScript(saved=>localStorage.setItem('lunden.avatar',saved),saved);
   await p.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// native avatar fixture'}));
   if(baseline)await p.route('**/src/ghosts.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(baseline,'utf8')}));
   if(baselineBuild)await p.route('**/src/config.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(baselineBuild,'utf8')}));
   await p.goto(game,{waitUntil:'domcontentloaded'});
   await p.evaluate(async({worker,i})=>{
    const T=await import('three'),C=await import('/src/config.js'),{Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
    Object.assign(window,{T,C});window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(45,800/620,.1,100);camera.position.set(0,1.62,4);
    window.nameSeed=i?'height-default':'height-observer';window.state={p:[i?2:0,0,0],r:0};
    window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>nameSeed,state:()=>({...state,p:state.p.slice()}),active:()=>true,weapon:()=>'rifle',score:()=>0});
    window.combat=new Combat({scene,camera,ghosts,weapon:()=>'rifle',feet:()=>new T.Vector3(...state.p)});
    window.tick=setInterval(()=>{ghosts.update();scene.updateMatrixWorld(true);},40);
    window.sample=()=>{
     ghosts.beforeMirror();const g=ghosts.myGhost,av=g.avatar;av.time=0;av.update(0,{});av.object.updateMatrixWorld(true);
     const ys=[],xs=[],v=new T.Vector3(),pos=av.mesh.geometry.attributes.position;
     for(let j=0;j<pos.count;j++){av.mesh.getVertexPosition(j,v);v.applyMatrix4(av.mesh.matrixWorld);ys.push(v.y-g.feet.y);xs.push(v.x-g.feet.x);}
     const result={build:av.look.build,scaleX:av.object.scale.x,width:Math.max(...xs)-Math.min(...xs),tall:ghosts.myLook.tall,height:ghosts.myLook.height,scaleY:av.object.scale.y,headScale:av.bones.head.scale.y,top:Math.max(...ys),code:ghosts.avatarCode,eye:C.avatarEyeHeight(ghosts.myLook),saved:localStorage.getItem('lunden.avatar')};ghosts.afterMirror();return result;
    };
   },{worker,i});return p;
  };
  const a=await open(0),b=await open(1);
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>ghosts.connected&&ghosts.others.size===1)));
  const initial=await b.evaluate(()=>sample());records.push({initial});
  check(initial.saved===null,'constructor preserves empty avatar storage');
  if(!baseline)check(/s[0-4]$/.test(initial.code),'constructor sends actual default scale');
  if(!baseline&&!baselineBuild)check(/d[0-2]/.test(initial.code),'constructor sends actual default build');
  const forced=await b.evaluate(()=>{
   const fallback=C.avatarLook(ghosts.me).tall;
   for(let i=0;i<100;i++){const seed='height-name-'+i,look=C.avatarLook(seed);if(look.tall!==fallback&&look.build!==C.avatarLook(ghosts.me).build){nameSeed=seed;ghosts.setMyLook(look);return {seed,build:look.build,tall:look.tall,fallback};}}
   throw Error('no deterministic differing seed');
  });
  await a.waitForFunction(code=>[...ghosts.others.values()][0].avatarCode===code,await b.evaluate(()=>ghosts.avatarCode));
  const remote=await a.evaluate(()=>{const g=[...ghosts.others.values()][0];return {build:g.avatar.look.build,scaleX:g.avatar.object.scale.x,tall:g.avatar.look.tall,scale:g.avatar.object.scale.y};});
  records.push({forced,remote});
  if(baselineBuild){check(remote.build!==forced.build&&remote.scaleX!==[.93,1,1.08][forced.build],'BEFORE: actual own/peer build differs despite synchronized height');}
  else if(baseline){check(remote.tall!==forced.tall&&remote.tall===forced.fallback,'BEFORE: real wire reproduces name/id height mismatch');}
  else {
   check(remote.tall===forced.tall&&remote.scale===forced.tall,'AFTER: exact own seeded height reaches peer');
   check((await b.evaluate(()=>sample())).eye===1.62,'legacy own camera height unchanged');
   const match=async(label)=>{
    const own=await b.evaluate(()=>sample());await a.waitForFunction(code=>[...ghosts.others.values()][0]?.avatarCode===code,own.code);
    const peer=await a.evaluate(()=>{const g=[...ghosts.others.values()][0];g.avatar.time=0;g.avatar.update(0,{});g.root.updateMatrixWorld(true);const v=new T.Vector3(),p=g.avatar.mesh.geometry.attributes.position;let top=-Infinity,minX=Infinity,maxX=-Infinity;for(let j=0;j<p.count;j++){g.avatar.mesh.getVertexPosition(j,v);v.applyMatrix4(g.avatar.mesh.matrixWorld);top=Math.max(top,v.y-g.feet.y);minX=Math.min(minX,v.x-g.feet.x);maxX=Math.max(maxX,v.x-g.feet.x);}return {build:g.avatar.look.build,scaleX:g.avatar.object.scale.x,width:maxX-minX,scaleY:g.avatar.object.scale.y,headScale:g.avatar.bones.head.scale.y,top,tall:g.avatar.look.tall};});
    records.push({label,own,peer});console.log(JSON.stringify({label,own,peer}));check(peer.scaleY===own.scaleY&&peer.headScale===own.headScale&&Math.abs(peer.top-own.top)<1e-6,label+' own/peer head and body vertical alignment');check(peer.build===own.build&&peer.scaleX===own.scaleX&&Math.abs(peer.width-own.width)<1e-6,label+' own/peer actual skinned body width matches');return own;
   };
   await match('seeded default');
   const c=await open(0,'241302113');check((await c.evaluate(()=>sample())).saved==='241302113','existing saved code is not migrated or overwritten');await c.waitForFunction(code=>[...ghosts.others.values()].some(g=>g.avatarCode===code),await b.evaluate(()=>ghosts.avatarCode));const expected=await b.evaluate(()=>sample());check(await c.evaluate(expected=>{const g=[...ghosts.others.values()].find(g=>g.avatarCode===expected.code);return g.avatar.look.build===expected.build&&g.avatar.object.scale.x===expected.scaleX&&g.avatar.object.scale.y===expected.scaleY;},expected),'late newcomer receives actual physical build and height in welcome');await c.close();
   for(const cm of [120,165,195]){await b.evaluate(cm=>ghosts.setMyLook({...C.avatarLook('explicit-height'),height:cm}),cm);await match(cm+'cm');}
   await b.evaluate(()=>{nameSeed='renamed-height';ghosts.setMyLook(C.avatarLook(nameSeed));});await match('name change');
   await b.evaluate(()=>ghosts.disconnect());await b.waitForFunction(()=>ghosts.connected);await a.waitForFunction(id=>ghosts.others.has(id),await b.evaluate(()=>ghosts.me));await match('reconnect');
   for(const pose of [1,2]){
    const expected=await b.evaluate(async pose=>{const {restState}=await import('/src/remote-pose.js');const rest={active:true,kind:pose===1?'sit':'lie',spot:{pos:new T.Vector3(2,1.22,0),yaw:0}};const next=restState(rest,ghosts.avatarCode,ghosts.me);Object.assign(state,next,{cat:[0,0,false]});return next;},pose);
    await a.waitForFunction(({pose,y})=>{const g=[...ghosts.others.values()][0];return g?.pose===pose&&Math.abs(g.feet.y-y)<.006;},{pose,y:expected.p[1]});
    check(await a.evaluate(()=>{const g=[...ghosts.others.values()][0],at=g.root.worldToLocal(g.avatar.hand('L').add(g.avatar.hand('R')).multiplyScalar(.5));return !!g.heldCat.object&&g.heldCat.object.position.distanceTo(at)<1e-6;}),'rest '+pose+' carried cat follows final posed hands');
    check(await a.evaluate(tall=>{const g=[...ghosts.others.values()][0];return g.avatar.object.scale.y===tall;},await b.evaluate(()=>ghosts.myLook.tall)),'rest '+pose+' keeps transmitted vertical scale and real rest placement');
   }
   await b.evaluate(()=>{Object.assign(state,{p:[2,0,0],r:0,pose:0,c:true});});await a.waitForFunction(()=>[...ghosts.others.values()][0]?.crouch>.99);
   check(await a.evaluate(()=>{const g=[...ghosts.others.values()][0],s={p:g.feet.toArray(),r:g.root.rotation.y,c:g.crouch,...C.splitAvatarCode(g.avatarCode)};return C.rifleHeadBaseY(g.id,s)<g.avatar.look.tall*C.PVP_HEAD_BOXES.boxes[0].low;}),'crouched default keeps lowered shared head/body boundary');
   await b.evaluate(()=>{state.c=false;state.cat=null;});await a.waitForFunction(()=>[...ghosts.others.values()][0]?.crouch<.001);
   // Ordinary head/body contacts use corrected seeded tall on the client and in the actual Worker.
   await a.waitForFunction(()=>combat.foes().length===1);
   for(const kind of ['head','body']){
    const contact=await a.evaluate(kind=>{const g=combat.foes()[0];const tall=g.avatar.look.tall,y=g.feet.y+tall*(kind==='head'?1.64:.9);camera.position.set(0,y,0);camera.lookAt(g.feet.x,y,g.feet.z);camera.updateMatrixWorld(true);const hit=combat.rifleContact();return {has:!!hit.target,head:!!hit.hc};},kind);
    check(contact.has&&contact.head===(kind==='head'),kind+' ordinary actual Combat contact aligned');
    const before=await b.evaluate(()=>combat.lives);await a.evaluate(()=>combat.fire('rifle'));
    await b.waitForFunction(want=>combat.lives===want,before-(kind==='head'?2:1));check(true,kind+' Worker authoritative damage aligned');
    await new Promise(r=>setTimeout(r,250));
   }
   const old=await b.evaluate(()=>['2413021','241302113'].every(code=>{const look=C.decodeAvatarLook(code,'legacy-seed');return look.height===undefined&&look.tall===C.avatarLook('legacy-seed').tall&&C.encodeAvatarLook(look)===(code.length===7?code+'00':code);}));check(old,'old saved codes decode and re-encode unchanged');
   for(const [page,self,label] of [[b,true,'self-current'],[a,false,'peer-current']]){
    const render=await page.evaluate(self=>{
     clearInterval(tick);if(self)ghosts.beforeMirror();const target=self?ghosts.myGhost:combat.foes()[0];
     for(const g of [...ghosts.others.values(),ghosts.myGhost])if(g)g.root.visible=false;
     target.root.visible=true;if(target.tag)target.tag.visible=false;
     target.root.position.set(0,0,0);target.root.rotation.y=Math.PI;target.body=Math.PI;target.have=true;target.avatar.time=0;target.animate(performance.now(),0,0,0);
     scene.background=new T.Color('#d3dbe1');scene.add(new T.HemisphereLight(0xffffff,0x6d7682,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(3,4,4);scene.add(light);
     const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(800,620);document.body.replaceChildren(renderer.domElement);camera.position.set(0,1.1,3.5);camera.lookAt(0,.95,0);scene.updateMatrixWorld(true);renderer.render(scene,camera);
     return {calls:renderer.info.render.calls,code:self?ghosts.avatarCode:target.avatarCode,scaleY:target.avatar.object.scale.y};
    },self);records.push({render:label,...render});await page.screenshot({path:path.join(out,label+'.png')});
   }
  }
  check(errors.length===0,'no native browser exceptions');
  const files=['src/config.js','src/ghosts.js','src/combat.js','tools/avatardefaultheighttest.cjs'];
  fs.writeFileSync(path.join(out,baseline?'baseline-result.json':'result.json'),JSON.stringify({baseline:!!baseline,baselineBuild:!!baselineBuild,checks,records,errors,sourceHashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]))},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
