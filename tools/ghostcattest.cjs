// #1147: real Ghosts, CatSpawner/MieleHeld and two local PlayerRoom clients, bounded WebGL scene.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostcattest.cjs GAME WORKER OUT
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [game = 'http://localhost:8793', worker = 'http://localhost:8794', out = '/tmp/lunden-cat1147-codex'] = process.argv.slice(2);
(async () => {
  fs.mkdirSync(out, {recursive:true});
  const source = fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const state = source.match(/state: \(\) => \(\{ p: \[player.pos.x[^\n]+?\}\)/)?.[0];
  if (!state || !state.includes('heldCatState(miele, cat)')) throw Error('production Ghosts state factory missing');
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH, args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors = [], checks = [];
  const check = (ok,label) => {checks.push({ok,label}); console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok)throw Error(label);};
  try {
    const pages = [];
    for(let i=0;i<2;i++) {
      const p = await browser.newPage({viewport:{width:720,height:720}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));
      await p.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// bounded multiplayer cat fixture'}));
      await p.goto(game,{waitUntil:'domcontentloaded'});
      await p.evaluate(async ({worker,i,state})=>{
        const T = await import('three'), {Ghosts}=await import('/src/ghosts.js');
        const {CatSpawner,BREEDS,applyVariant}=await import('/src/cat.js'), {MieleHeld}=await import('/src/miele.js'), {heldCatState}=await import('/src/ghostcat.js');
        Object.assign(window,{T,BREEDS,applyVariant,H:await import('/src/holdable.js')});
        window.scene=new T.Scene();scene.background=new T.Color('#c5d3db');scene.add(new T.HemisphereLight(0xffffff,0x727b64,2));
        const sun=new T.DirectionalLight(0xfff2de,2);sun.position.set(2,4,3);scene.add(sun);
        window.camera=new T.PerspectiveCamera(45,1,.1,100);camera.position.set(0,1.62,4);camera.lookAt(0,1,0);
        window.cat=new CatSpawner({});cat.object.visible=true;scene.add(cat.object);
        window.miele=new MieleHeld(scene,camera,cat);window.player={pos:new T.Vector3(i?0:3,0,0),crouched:false};window.suit={worn:false};
        const factory = new Function('player','camera','suit','miele','cat','heldCatState','return ({'+state+'}).state')(player,camera,suit,miele,cat,heldCatState);
        window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Carrier':'Observer',state:factory,active:()=>true,mirrored:()=>true,score:()=>0});
        camera.rotation.y=i?Math.PI:0;
        window.tick=setInterval(()=>{ghosts.update();scene.updateMatrixWorld(true);},40);
        window.take=(b,v,k)=>{if(miele.held)miele.putBack();cat.held=false;cat.setCat(BREEDS[b],BREEDS[b].coats[v],k);cat.object.visible=true;miele.take({silent:true});};
        window.release=()=>miele.putBack();
        if(i===0){
          window.renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,720);document.body.replaceChildren(renderer.domElement);
          const floor=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0xb0b3a1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
          cat.object.visible=false;
          window.draw=(side=false)=>{const g=[...ghosts.others.values()][0];g.root.visible=true;g.root.position.set(0,0,0);g.root.rotation.y=Math.PI;g.body=Math.PI;g.have=true;g.animate(performance.now(),0,0,0);camera.position.set(side?3:0,1.35,side?1.5:3.2);camera.lookAt(0,1,0);scene.updateMatrixWorld(true);renderer.render(scene,camera);return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cat:g.heldCat.object?.position.toArray(),avatar:g.avatar.mesh.isSkinnedMesh};};
        }
      },{worker,i,state});
    }
    const [a,b]=pages;
    await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&ghosts.others.size===1)));
    check(await a.evaluate(()=>![...ghosts.others.values()][0].heldCat.object),'legacy/default empty hands');
    for(const [label,bIndex,v,k] of [['ordinary',0,1,false],['kitten',3,2,true],['miele',7,0,false]]) {
      await b.evaluate(([b,v,k])=>take(b,v,k),[bIndex,v,k]);
      await a.waitForFunction(key=>[...ghosts.others.values()][0].heldCat.key===key,`${bIndex}:${v}:${k}`);
      const record=await a.evaluate(()=>draw()); check(record.avatar&&record.cat.every(Number.isFinite),label+' received and attached to real avatar hands');
      check(record.calls<20,label+' material-batched draw budget: '+record.calls);
      await a.screenshot({path:path.join(out,label+'-front.png')});await a.evaluate(()=>draw(true));await a.screenshot({path:path.join(out,label+'-side.png')});
      const stable=await a.evaluate(()=>{const g=[...ghosts.others.values()][0], m=g.heldCat.object.children[0].material, color=m.color.getHex();applyVariant(BREEDS[0].coats[4]);return m.color.getHex()===color;});check(stable,label+' material isolated from local cat');
      if(label==='ordinary'){
        const late=await browser.newPage();await late.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));await late.goto(game);
        const welcome=await late.evaluate(worker=>new Promise((resolve,reject)=>{const ws=new WebSocket(worker.replace('http','ws')+'/players');ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==='w'){ws.close();resolve(m.ps.some(p=>p.cat?.[0]===0&&p.cat?.[1]===1));}};ws.onerror=reject;}),worker);check(welcome,'late join welcome includes held appearance');await late.close();
      }
    }
    await b.evaluate(()=>{player.crouched=true;});
    await a.waitForFunction(()=>[...ghosts.others.values()][0].crouch>.99);
    check(await a.evaluate(()=>{const g=[...ghosts.others.values()][0];g.animate(performance.now(),0,0,0);const hands=g.avatar.hand('L',new T.Vector3()).add(g.avatar.hand('R',new T.Vector3())).multiplyScalar(.5);const at=g.heldCat.object.getWorldPosition(new T.Vector3());return at.distanceTo(hands)<.001;}),'crouched cat follows final skinned hands');
    await b.evaluate(()=>{ghosts.beforeMirror();window.mirrorCat=!!ghosts.myGhost.heldCat.object;ghosts.afterMirror();});
    check(await b.evaluate(()=>mirrorCat&&!ghosts.myGhost.root.visible),'local mirror cat exists only in mirror pass');
    await b.evaluate(()=>H.stowBicycleHand());
    await a.waitForFunction(()=>![...ghosts.others.values()][0].heldCat.object);check(true,'stowed holder clears while underlying cat remains held');
    await b.evaluate(()=>H.restoreBicycleHand());await a.waitForFunction(()=>!![...ghosts.others.values()][0].heldCat.object);check(true,'restored holder shows same cat');
    // The actual holder's drop path clears the production state factory at the same position/yaw.
    await b.evaluate(()=>miele.putBack());
    await a.waitForFunction(()=>![...ghosts.others.values()][0].heldCat.object);check(true,'release clears remote without movement');
    await b.evaluate(()=>take(0,0,false));await a.waitForFunction(()=>!![...ghosts.others.values()][0].heldCat.object);
    await b.evaluate(()=>ghosts.disconnect());await a.waitForFunction(()=>ghosts.others.size===0);check(true,'disconnect removes cat with its ghost');
    check(errors.length===0,'no browser exceptions');
    const files=['src/main.js','src/cat.js','src/ghostcat.js','src/ghosts.js','src/config.js','cloudflare/players.js'];
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,productionState:state,sourceHashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]))},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
