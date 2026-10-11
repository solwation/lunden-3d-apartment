// #672: real Ghosts + real local PlayerRoom, one small controlled scene, no apartment bootstrap.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… SHOTS=/tmp/ghosts node tools/ghostbadgetest.cjs http://localhost:8672 http://localhost:8673
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8672', worker = process.argv[3] || 'http://localhost:8673';
const out = process.env.SHOTS || '/tmp/lunden-ghost-badges';
(async () => {
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({viewport:{width:844,height:390}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// Isolated ghost rendering fixture.'}));
    await page.goto(game);
    await page.evaluate(async worker=>{
      const T=await import('three'),{Ghosts}=await import('/src/ghosts.js'),{GHOSTS:G}=await import('/src/config.js');
      document.body.replaceChildren();document.body.style.cssText='margin:0;background:#bfd8ea';
      const scene=new T.Scene();scene.background=new T.Color('#bfd8ea');scene.add(new T.AmbientLight(0xffffff,2));
      const camera=new T.PerspectiveCamera(60,844/390,.1,100);camera.position.set(0,1.5,.1);camera.lookAt(0,1,-2.2);
      const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true,antialias:true});renderer.setPixelRatio(1);renderer.setSize(844,390);document.body.append(renderer.domElement);
      const ground=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshBasicMaterial({color:0x647c68}));ground.rotation.x=-Math.PI/2;scene.add(ground);
      const peers=[],scores=[200,123,18979,1e7],names=['Observer','','Sarah','O'],positions=[[0,0,1],[-.7,0,-2],[0,0,-2.3],[.7,0,-2]];
      for(let i=0;i<names.length;i++)peers.push(new Ghosts({scene:i===0?scene:new T.Scene(),camera,url:worker,name:()=>names[i],state:()=>({p:[...positions[i]],r:Math.PI}),score:()=>scores[i]}));
      window.fixture={T,G,scene,camera,renderer,peers,scores,positions,tick:()=>peers.forEach(g=>g.update()),render:()=>{peers[0].update();renderer.render(scene,camera);},size:(w,h)=>{camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}};
    },worker);
    await page.waitForFunction(()=>{fixture.tick();return fixture.peers.every(g=>g.connected)&&fixture.peers[0].list().length===3;},null,{timeout:15000,polling:100});
    await page.waitForFunction(()=>{fixture.tick();return fixture.peers[0].list().every(g=>g.score>0&&g.tag);},null,{timeout:5000,polling:100});
    const before=await page.evaluate(()=>{const f=fixture;f.render();return {list:f.peers[0].list(),calls:f.renderer.info.render.calls,textures:f.renderer.info.memory.textures};});
    // #705: each rendered avatar is a SkinnedMesh with a small bone texture of its own (3 tags + 3 bone textures)
    if(before.calls!==7||before.textures!==6)throw new Error('Expected ground + three mesh/sprite pairs, three live tags and three bone textures: '+JSON.stringify(before));
    const diagnostics=await page.evaluate(async()=>{
      const f=fixture,g=f.peers[0],anonymous=[...g.others.values()].find(x=>x.name==='Anonym'),third=[...g.others.values()].find(x=>x.name==='O');
      if(anonymous.score!==123||third.score!==1e7)throw new Error('Anonymous / max score missing');
      if(anonymous.tag.scale.x!==f.G.tagWidth||anonymous.tag.scale.y!==f.G.tagHeight||f.G.tagWidth>=.8||f.G.tagHeight>=.2)throw new Error('Tag not smaller/configured');
      const duplicate=g.add('duplicate','Anonym');duplicate.push({p:[20,0,-2],r:0,score:123},performance.now());
      if(duplicate.tag.material!==anonymous.tag.material)throw new Error('Same name/score does not share material');
      duplicate.dispose();g.others.delete('duplicate');
      const previousMove=f.peers[1].lastMove,sent=f.peers[1].messages;f.scores[1]=456;
      await new Promise(r=>setTimeout(r,220));f.tick();
      await new Promise(r=>setTimeout(r,100));f.tick();
      if(anonymous.score!==456||f.peers[1].messages!==sent+1||f.peers[1].lastMove!==previousMove)throw new Error('Score-only state not sent once / changed idle clock');
      const messages=f.peers[1].messages;await new Promise(r=>setTimeout(r,450));f.tick();
      if(f.peers[1].messages!==messages)throw new Error('Unchanged score sends states');
      // Controlled small uploads: scores are immutable shared materials; old history is released.
      f.size(160,90);let peak=0;
      for(let i=0;i<50;i++){anonymous.push({p:[-.7,0,-2],r:Math.PI,score:500+i},performance.now());f.render();peak=Math.max(peak,f.renderer.info.memory.textures);}
      if(peak!==6)throw new Error('Score history grows texture memory: '+peak);
      const noTags=(()=>{for(const ghost of g.others.values())ghost.tag.visible=false;f.renderer.render(f.scene,f.camera);return f.renderer.info.render.calls;})();
      const noShadow=[...g.others.values()].every(x=>!x.mesh.castShadow);
      f.render();return {scoreOnlyMessages:1,idleUnchanged:true,peakTextures:peak,noTagsCalls:noTags,tagCalls:f.renderer.info.render.calls-noTags,noShadow,tagPixels:256*64*4*4/3,scale:[f.G.tagWidth,f.G.tagHeight]};
    });
    for(const [width,height,name]of [[1280,720,'desktop'],[844,390,'iphone14pro']]){
      await page.setViewportSize({width,height});
      const data=await page.evaluate(([w,h])=>{fixture.size(w,h);fixture.render();return fixture.renderer.domElement.toDataURL('image/png').split(',')[1];},[width,height]);
      fs.writeFileSync(`${out}/ghosts-${name}.png`,Buffer.from(data,'base64'));
    }
    const leave=await page.evaluate(async()=>{
      const f=fixture,peer=f.peers[1],id=peer.me;peer.disconnect();
      await new Promise(r=>setTimeout(r,100));f.peers[0].update();
      const removed=!f.peers[0].others.has(id);f.render();const remainingTextures=f.renderer.info.memory.textures;
      f.peers.forEach(g=>g.disconnect());f.renderer.render(f.scene,f.camera);
      return {removed,remainingTextures,finalTextures:f.renderer.info.memory.textures,finalGhosts:f.peers[0].list().length,glError:f.renderer.getContext().getError()};
    });
    if(!leave.removed||leave.remainingTextures!==4||leave.finalTextures!==0||leave.finalGhosts!==0||leave.glError!==0||errors.length)throw new Error(JSON.stringify({leave,errors}));
    fs.writeFileSync(`${out}/badge-results.json`,JSON.stringify({before,diagnostics,leave,errors},null,2));
    console.log('PASS: real room score/welcome, anonymous/max score, smaller shared tags, score-only rate/idle, 50 updates without texture growth, 1 tag draw per ghost, departure/disposal; desktop + iPhone-size rendered images.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
