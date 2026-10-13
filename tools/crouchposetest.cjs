// #878 actual Player/Ghosts/Avatar/Worker state and bones, no apartment. --render needs exclusive graphics slot.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8871', worker = process.argv[3] || 'http://localhost:8872';
const out = process.argv[4] || '/tmp/lunden-crouch878-surface', render = process.argv.includes('--render');
let checks = 0, failures = 0;
const check = (ok, text) => { checks++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: render ? ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] : ['--no-sandbox','--disable-gpu'] });
  const pages = [], errors = [], samples = [];
  let renderMs = null;
  try {
    for (const [i, name] of ['Crouch Player', 'Pose Observer'].entries()) {
      const page = await browser.newPage({ viewport: { width:640, height:420 } }); pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType:'text/javascript', body:'// actual module fixture, no apartment' }));
      await page.goto(game);
      await page.evaluate(async ({i,name,worker}) => {
        const orig = HTMLCanvasElement.prototype.getContext;
        window.originalContext = orig; window.glCalls = 0;
        HTMLCanvasElement.prototype.getContext = function(k,...a) { if (/webgl/i.test(k)) { glCalls++; throw Error('WebGL forbidden in native phase'); } return orig.call(this,k,...a); };
        const T = await import('three'), { Ghosts } = await import('/src/ghosts.js'), { Player } = await import('/src/player.js');
        window.T = T; window.scene = new T.Scene(); window.camera = new T.PerspectiveCamera(60,640/420,.1,100);
        const world = {size:{x:6,z:13},levels:[0,1].map(() => ({segments:[],fixedSegments:[],footprints:[]})),doors:[]};
        window.player = new Player(world,camera); player.spawn(1+i*2,1,0);
        window.ghosts = new Ghosts({scene,camera,url:worker,name:()=>name,active:()=>true,weapon:()=> 'nerf',score:()=>123+i,mirrored:()=>true,
          state:()=>({p:player.pos.toArray(),r:camera.rotation.y,c:player.crouched})});
        window.tick = setInterval(() => {player.update(.04); ghosts.update();},40);
        window.peer = () => [...ghosts.others.values()].find(g => g.name === (i ? 'Crouch Player' : 'Pose Observer'));
        window.pose = () => {
          const g=peer(); g.root.updateMatrixWorld(true); g.avatar.mesh.skeleton.update();
          const head=g.avatar.bones.head.getWorldPosition(new T.Vector3()), box=new T.Box3();
          const mesh=g.avatar.mesh, si=mesh.geometry.getAttribute('skinIndex'), headIndex=mesh.skeleton.bones.indexOf(g.avatar.bones.head);
          for(let j=0;j<si.count;j++) if(si.getX(j)===headIndex) box.expandByPoint(mesh.localToWorld(mesh.getVertexPosition(j,new T.Vector3())));
          return {c:g.crouch,head:head.toArray(),headBounds:[box.min.toArray(),box.max.toArray()],feet:g.root.position.toArray(),h:g.h,score:g.score,l:g.lives,
            hand:g.avatar.hand('R').toArray(),prop:g.prop?.getWorldPosition(new T.Vector3()).toArray(),scale:g.avatar.object.scale.toArray()};
        };
        document.body.replaceChildren();document.body.style.cssText='margin:0;background:#263744;color:white;font:16px system-ui;padding:15px';
        const title=document.createElement('p');title.textContent='Native Player / Ghosts / Avatar bones (no apartment or WebGL)';document.body.append(title);
        const button=document.createElement('button');button.id='pose-toggle';button.textContent='Toggle actual crouch request';button.onclick=()=>player.crouch=!player.crouch;document.body.append(button);
        const pre=document.createElement('pre');pre.id='result';document.body.append(pre);
      }, {i,name,worker});
    }
    const [a,b]=pages;
    await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
    await b.waitForFunction(()=>peer().crouch===0);
    const standing=await b.evaluate(()=>pose());samples.push({state:'standing',...standing});
    const messages=await a.evaluate(()=>ghosts.messages);
    await a.locator('#pose-toggle').click();
    await a.waitForFunction(()=>player.crouched);
    await b.waitForFunction(()=>peer().crouch===1);
    const crouching=await b.evaluate(()=>pose());samples.push({state:'crouching',...crouching});
    check(crouching.head[1]<standing.head[1]-.15,'actual head bone lowers at unchanged feet after stationary native crouch toggle');
    check(crouching.headBounds[1][1]<standing.headBounds[1][1]-.15,'actual skinned head vertices lower with the bone');
    check(JSON.stringify(crouching.feet)===JSON.stringify(standing.feet),'stationary pose change preserves actual feet');
    check(crouching.h===standing.h&&crouching.score===standing.score&&crouching.l===standing.l,'weapon, score and server-owned health stay unchanged');
    check(await a.evaluate(m=>ghosts.messages===m+1,messages),'stationary crouch uses one normal state update, no extra pose message');
    check(Math.hypot(...crouching.hand.map((n,i)=>n-crouching.prop[i]))<1e-6,'existing held weapon prop still follows actual posed right hand');
    const mirror=await a.evaluate(()=>{ghosts.beforeMirror();const g=ghosts.myGhost;const c=g.crouch,head=g.avatar.bones.head.getWorldPosition(new T.Vector3()).toArray();ghosts.afterMirror();return {c,head,hidden:!g.root.visible};});
    check(mirror.c===1&&mirror.hidden,'own mirror uses the same actual crouch and restores hidden state');
    // Wanted false cannot override the actual Player decision when the controlled headroom is too low.
    await a.evaluate(()=>{window.stairQuery=player.stairUnder;player.stairUnder=()=>player.pos.y+1.2;player.crouch=false;});
    await a.waitForFunction(()=>!player.crouch&&player.crouched);
    check(await b.evaluate(()=>peer().crouch===1),'low headroom keeps actual crouch when request is released');
    await a.evaluate(()=>{player.stairUnder=stairQuery;});
    await a.waitForFunction(()=>!player.crouched); await b.waitForFunction(()=>peer().crouch===0);
    const returned=await b.evaluate(()=>pose());samples.push({state:'returned-standing',...returned});
    check(returned.head[1]>crouching.head[1]+.15,'restored headroom returns actual model to standing');
    await a.locator('#pose-toggle').click(); await b.waitForFunction(()=>peer().crouch===1);
    await a.evaluate(()=>player.keys.add('KeyW'));const start=await a.evaluate(()=>player.pos.toArray());
    await b.waitForFunction(z=>peer().root.position.z<z-.1&&peer().crouch===1,start[2]);
    const walking=await b.evaluate(()=>pose());samples.push({state:'walking-crouched',...walking});
    check(walking.c===1&&walking.head[1]-walking.feet[1]<standing.head[1]-standing.feet[1]-.15,'moving crouched avatar retains its actual lower head pose');
    await a.evaluate(()=>player.keys.clear());
    // New actual socket gets current pose from native welcome, before target sends another state.
    const welcome=await b.evaluate(async()=>await new Promise((resolve,reject)=>{const w=new WebSocket(ghosts.ws.url);w.onmessage=e=>{const m=JSON.parse(e.data);if(m.t==='w'){w.close();resolve(m.ps);}};w.onerror=reject;}));
    check(welcome.some(p=>p.c===true&&p.score===123&&p.l===10),'late native welcome contains current crouch, score and lives');
    // Exact public snapshot interpolation, independent of wall-clock scheduling.
    const interpolation=await b.evaluate(async()=>{const {GHOSTS:G}=await import('/src/config.js');const g=ghosts.add('interpolation-proof','Pose');
      g.push({p:[5,0,5],r:0,c:false},1000);g.push({p:[5,0,5],r:0,c:true},1200);g.draw(1100+G.delay,camera.position);const half=g.crouch;
      g.push({p:[5,0,5],r:0,c:'true'},1400);g.draw(1400+G.delay,camera.position);const invalid=g.crouch;g.dispose();ghosts.others.delete(g.id);return {half,invalid};});
    check(interpolation.half===.5&&interpolation.invalid===0,'pose interpolates using existing state timeline; invalid values are standing');
    check((await Promise.all(pages.map(p=>p.evaluate(()=>glCalls)))).every(n=>n===0),'zero WebGL calls during all native pose checks');
    await b.evaluate(data=>document.querySelector('#result').textContent=data.map(s=>`${s.state}: crouch ${s.c}\nhead Y ${s.head[1].toFixed(3)}, head top ${s.headBounds[1][1].toFixed(3)}, feet Y ${s.feet[1].toFixed(3)}\n`).join('\n'),samples);
    await b.screenshot({path:`${out}/native-pose-evidence.png`});
    if(render){
      const renderStarted=Date.now();
      await b.evaluate(()=>{HTMLCanvasElement.prototype.getContext=originalContext;scene.background=new T.Color('#c1d5e1');scene.add(new T.HemisphereLight(0xffffff,0x465b35,2));
        const light=new T.DirectionalLight(0xffffff,2);light.position.set(4,5,3);scene.add(light);window.renderCamera=new T.PerspectiveCamera(45,640/420,.1,100);
        window.renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(640,420);document.body.replaceChildren(renderer.domElement);document.body.style.padding='0';});
      for(const crouch of [false,true]){await a.evaluate(c=>player.crouch=c,crouch);await b.waitForFunction(c=>peer().crouch===(c?1:0),crouch);
        await b.evaluate(()=>{const g=peer();renderCamera.position.copy(g.root.position).add(new T.Vector3(2.4,1.4,3.2));renderCamera.lookAt(g.root.position.clone().add(new T.Vector3(0,.9,0)));renderer.render(scene,renderCamera);renderer.getContext().finish();});
        await b.screenshot({path:`${out}/${crouch?'crouching':'standing'}-rendered-avatar.png`});}
      await b.evaluate(()=>renderer.dispose());
      renderMs=Date.now()-renderStarted;
      check(renderMs<60000,`bounded actual-avatar render/captures ${renderMs}ms < 60s`);
    }
    check(errors.length===0,`no page errors: ${JSON.stringify(errors)}`);
    fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,samples,mirror,interpolation,errors,rendered:render,renderMs,evidence:'Actual native modules/Worker; optional small actual-avatar render, no apartment or physical phone'},null,2));
    console.log(failures?`SOME FAILED (${failures})`:'ALL PASS');if(failures)process.exitCode=1;
  }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.disconnect();}).catch(()=>{});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
