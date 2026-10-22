// #1504: actual main state callback, two Rest/Ghosts/Avatar clients through local PlayerRoom.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { installMainGlobals, installMainImports } = require('./mainfixture.cjs');
const fs = require('node:fs'), assert = require('node:assert/strict');
const [base='http://localhost:8795', worker='http://localhost:8796', out='/tmp/lunden-seated-look', mode=''] = process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true}); const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const pages=[],errors=[],samples=[];
 try {
  for(let i=0;i<2;i++){
   const p=await browser.newPage({viewport:{width:720,height:520}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/src/bootstrap.js',r=>r.fulfill({body:'// native module fixture',contentType:'text/javascript'})); await installMainGlobals(p); await p.goto(base); await installMainImports(p);
   await p.evaluate(async({i,worker})=>{
    window.T=await import('three');const {Ghosts}=await import('/src/ghosts.js'),{Rest,restTarget}=await import('/src/rest.js'),{restState}=await import('/src/remote-pose.js'),{heldCatState}=await import('/src/ghostcat.js'),{BREEDS}=await import('/src/cat.js');
    window.jetpack={worn:false,k:0};window.heldItem=()=>null;window.heldCategory=(await import('/src/heldcategory.js')).heldCategory; /* (the evaluated production state callback reads these: jp #1286, hi #1297) */ window.miele={held:false};window.cat={held:false,visible:true,breed:BREEDS[0],variant:BREEDS[0].coats[0],kitten:false};
    window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(45,720/520,.1,100);window.player={pos:new T.Vector3(i*3,0,0),crouched:false};window.suit={worn:false};window.rest=new Rest(camera);
    const main=await(await fetch('/src/main.js')).text();const callback=main.match(/state: \(\) => \(\{ p: \[player.pos.x[^\n]+/)[0].replace(/^state: /,'').replace(/ \}\);$/,'');
    window.sourceCallback=callback;
    window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Observer':'Resting',state:eval(callback),active:()=>true});
    window.setRest=kind=>{
     if(!kind){rest.end();return;}
     const long=kind==='long';const obj=new T.Group();obj.userData.rest={kind:long?'sit':kind,name:'Bänk/säng',verb:'vila',spots:[{x:0,y:kind==='lie'?.6:.45,z:0,...(long?{legsUp:true}:{})}]};
     const target=restTarget(obj,{x:0,z:0,level:0},0);rest.begin(target,target.spots[0],{pos:player.pos.clone(),yaw:0});
    };
    window.tick=setInterval(()=>{rest.update(.04);ghosts.update();},40);
    window.peer=()=>[...ghosts.others.values()].find(g=>g.name===(i?'Resting':'Observer'));

    window.measure=()=>{const g=peer();g.root.updateMatrixWorld(true);return {
      pose:g.pose,look:g.look,body:g.root.rotation.y+g.avatar.object.rotation.y,
      torso:g.avatar.bones.torso.getWorldQuaternion(new T.Quaternion()).toArray(),
      head:g.avatar.bones.head.getWorldQuaternion(new T.Quaternion()).toArray(),
      hips:g.avatar.bones.hips.getWorldPosition(new T.Vector3()).toArray(),
      feet:g.avatar.bones.footL.getWorldPosition(new T.Vector3()).toArray()
    };};
    window.capture=()=>{
      if(!window.renderer){scene.background=new T.Color('#c1d5e1');scene.add(new T.HemisphereLight(0xffffff,0x465b35,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(-4,5,-3);scene.add(light);window.renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(720,520);document.body.replaceChildren(renderer.domElement);window.renderCamera=new T.PerspectiveCamera(45,720/520,.1,100);
        const bench=new T.Mesh(new T.BoxGeometry(2,.12,.65),new T.MeshStandardMaterial({color:0x8b6951}));bench.position.set(0,.39,0);scene.add(bench);
      }
      renderCamera.position.set(2,1.6,2.6);renderCamera.lookAt(0,1.05,0);renderer.render(scene,renderCamera);renderer.getContext().finish();
    };
   },{i,worker});
  }
  const [a,b]=pages;
  await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length)));
  for(const kind of ['sit','long']){
    await a.evaluate(k=>setRest(k),kind);
    await a.waitForFunction(()=>rest.t>=1);
    await b.waitForFunction(n=>peer().pose===n,kind==='sit'?1:3);
    await b.waitForTimeout(350);
    const neutral=await b.evaluate(()=>measure());
    if(kind==='sit'){await b.evaluate(()=>capture());await b.screenshot({path:`${out}/forward.png`});}
    for(const [yaw,pitch] of [[1.57,0],[-1.57,0],[0,.7],[0,-.9],[0,0]]){
      await a.evaluate(([yaw,pitch])=>{camera.rotation.y=rest.spot.yaw+yaw;camera.rotation.x=pitch;},[yaw,pitch]);
      await b.waitForFunction(([yaw,pitch])=>Math.abs(peer().look[0]-yaw)<.02&&Math.abs(peer().look[1]-pitch)<.02,[yaw,pitch]);
      const sample=await b.evaluate(()=>measure());
      assert.ok(Math.abs(sample.body-neutral.body)<.001,'body stays aligned with seat');
      for(const key of ['torso','hips','feet'])for(let i=0;i<sample[key].length;i++)assert.ok(Math.abs(sample[key][i]-neutral[key][i])<.001,`${key} stays still`);
      const diff=Math.hypot(...sample.head.map((v,i)=>v-neutral.head[i]));
      assert.ok((yaw||pitch)?diff>.2:diff<.02,'head follows look and returns');
      const mirror=await a.evaluate(()=>{ghosts.mirrored=()=>true;ghosts.beforeMirror();return ghosts.myGhost.avatar.bones.head.quaternion.toArray();});
      const remote=await b.evaluate(()=>peer().avatar.bones.head.quaternion.toArray());
      assert.ok(Math.hypot(...mirror.map((v,i)=>v-remote[i]))<.02,'mirror agrees with peer');
      samples.push({kind,yaw,pitch,...sample});
      if(kind==='sit'&&yaw===1.57){await b.evaluate(()=>capture());await b.screenshot({path:`${out}/toward-neighbour.png`});}
    }
  }
  await a.evaluate(()=>setRest(null));await b.waitForFunction(()=>peer().pose===0);await b.waitForTimeout(350);
  assert.deepEqual(await b.evaluate(()=>peer().look),[0,0]);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/result.json`,JSON.stringify({samples,errors,standingRestored:true},null,2));
  console.log('PASS two-client seated/long-sit yaw/pitch, fixed body, mirror and standing reset');
 }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.disconnect();}).catch(()=>{});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
