// #974: ordinary head/body/wall gameplay through two actual Ghosts/Combat peers and the local Worker.
// Apartment bootstrap is suppressed; one separate 360x360 real Avatar/box debug render is visual evidence only.
// node tools/headboxesbrowsertest.cjs game worker output
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8875', worker = process.argv[3] || 'http://localhost:8876';
const output = process.argv[4] || '/tmp/lunden-head-boxes';
let checks = 0, failures = 0;
const check = (ok, label) => { checks++; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [], errors = [], records = [];
  const page = async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 480 } }); pages.push(p);
    p.setDefaultTimeout(15000); p.on('pageerror', e => errors.push(e.message));
    await p.route('**/src/bootstrap.js*', route => route.fulfill({ contentType: 'text/javascript', body: '// native head-box fixture, no apartment' }));
    await p.goto(game, {waitUntil:'domcontentloaded'}); return p;
  };
  try {
    for (let i = 0; i < 2; i++) {
      const p = await page();
      await p.evaluate(async ({worker, i}) => {
        const nativeContext = HTMLCanvasElement.prototype.getContext; window.webglCalls = 0;
        HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
          if (/webgl/i.test(kind)) { webglCalls++; throw Error('Combat peers must not create WebGL'); }
          return nativeContext.call(this, kind, ...args);
        };
        const T = await import('three'), {Ghosts} = await import('/src/ghosts.js'), {Combat} = await import('/src/combat.js');
        window.config = await import('/src/config.js'); window.S = await import('/src/stats.js'); window.T = T;
        window.scene = new T.Scene(); window.camera = new T.PerspectiveCamera(60, 1, .1, 100);
        window.pose = {p:[i ? 2 : 0,0,0],r:0,c:false}; camera.position.set(0,1.62,0); camera.rotation.y=-Math.PI/2; camera.updateMatrixWorld();
        window.moving = false; window.acks = []; window.remoteShots = 0; window.markerShows = 0; window.deathCalls = 0;
        S.setScoreElement(document.getElementById('score')); S.setBadgeElement(document.getElementById('badges'));
        window.ghosts = new Ghosts({scene,camera,url:worker,name:()=>i?'Box target':'Box shooter',active:()=>true,
          state:()=>({...pose,p:pose.p.slice()}),weapon:()=>'rifle',score:()=>S.totalScore(),mirrored:()=>false});
        window.combat = new Combat({scene,camera,ghosts,weapon:()=>'rifle',feet:()=>new T.Vector3(...pose.p),
          onHit:()=>S.bump('pvpHits'),onDie:()=>{deathCalls++;}});
        const marker = combat.hitMarker.show.bind(combat.hitMarker); combat.hitMarker.show=m=>{markerShows++;marker(m);};
        const hit=ghosts.onHit, shot=ghosts.onShot;
        ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};
        ghosts.onShot=(m,g)=>{remoteShots++;shot?.(m,g);};
        window.tick=setInterval(()=>{if(moving)pose.p[0]+=.02;ghosts.update();combat.update(.04);scene.updateMatrixWorld(true);},40);
        window.aim = (kind, index=1) => {
          const foe=combat.foes()[0], H=config.PVP_HEAD_BOXES, look=config.avatarLook(foe.id), box=H.boxes[index];
          const c=foe.crouch, yaw=foe.root.rotation.y+Math.PI, width=[.93,1,1.08][look.build];
          const center=new T.Vector3(0,(box.low+box.high)/2-H.hipY,(box.back+box.front)/2);
          center.applyAxisAngle(new T.Vector3(1,0,0),-H.crouchLean*c);
          center.y+=H.hipY-H.hipDrop*c;center.z+=H.hipForward*c;
          center.multiply(new T.Vector3(width,look.tall,width)).applyAxisAngle(new T.Vector3(0,1,0),yaw).add(foe.feet);
          if(kind==='body')center.set(foe.feet.x,foe.feet.y+.95,foe.feet.z);
          if(kind==='miss')center.y+=.6;
          camera.position.set(0,center.y,center.z);camera.lookAt(center);camera.updateMatrixWorld(true);
          return {center:center.toArray(),c:foe.crouch,speed:foe.speed,yaw:foe.root.rotation.y,seed:foe.id,
            contact:combat.rifleContact().hc,skin:foe.avatar.mesh.isSkinnedMesh};
        };
        window.wall=on=>{
          if(on){window.block=new T.Mesh(new T.BoxGeometry(.1,3,3),new T.MeshBasicMaterial());block.position.set(1,1.5,0);scene.add(block);}
          else{block.removeFromParent();block.geometry.dispose();block.material.dispose();}
          scene.updateMatrixWorld(true);
        };
        window.snapshot=()=>({hits:combat.hits,lives:combat.lives,markers:markerShows,score:S.totalScore(),kills:S.stats.pvpKills??0,
          counted:S.stats.pvpHits??0,bonus:S.stats.pvpRangePoints??0,deaths:deathCalls,last:acks.at(-1),wire:combat.lastShot});
      }, {worker,i});
    }
    const [a,b]=pages;
    await Promise.all([a,b].map(p=>p.waitForFunction(()=>ghosts.connected&&combat.foes().length===1)));
    const settled=async ({r=0,c=false}={})=>{
      await b.evaluate(({r,c})=>{moving=false;pose.r=r;pose.c=c;},{r,c});
      await a.waitForFunction(({r,c})=>{const f=combat.foes()[0];return f&&Math.abs(f.root.rotation.y-r)<.005&&Math.abs(f.crouch-(c?1:0))<.001;},{r,c});
    };
    const shoot=async (label,kind='head',index=1,head=true)=>{
      await a.waitForTimeout(300); const before=await a.evaluate(()=>snapshot()), health=await b.evaluate(()=>combat.lives);
      const aim=await a.evaluate(({kind,index})=>window.aim(kind,index),{kind,index});
      await a.evaluate(()=>combat.fire('rifle'));
      await a.waitForFunction(n=>combat.hits===n,before.hits+1);
      const after=await a.evaluate(()=>snapshot()); await b.waitForFunction(n=>combat.hurts===n,before.hits+1);
      const target=await b.evaluate(()=>snapshot());records.push({label,aim,before,after,target,health});
      const damage=head?2:1,expected=health-damage;
      check(aim.skin&&!!after.last?.head===head&&after.last.l===expected&&after.last.dead===(expected<=0)
        &&target.lives===(expected<=0?10:expected),`${label}: actual Combat/Worker confirms ${damage} life damage`);
      check(after.score===before.score+5&&after.counted===before.counted+1&&after.markers===before.markers+1
        &&after.last.award.points===5,`${label}: ordinary near points and marker awarded once`);
      if(head)check(after.wire.hc?.[0]===2&&after.wire.hc.length===4,`${label}: native client sends version-2 head contact`);
      return after;
    };
    const miss=async (label,blocked=false)=>{
      const before=await a.evaluate(()=>snapshot()),seen=await b.evaluate(()=>remoteShots);
      await a.evaluate(()=>aim('miss'));if(blocked){await a.evaluate(()=>{aim('head');wall(true);});}
      await a.waitForTimeout(300);await a.evaluate(()=>combat.fire('rifle'));
      await b.waitForFunction(n=>remoteShots>n,seen);await a.waitForTimeout(150);
      const after=await a.evaluate(()=>snapshot());
      check(after.wire.to===null&&after.hits===before.hits&&after.score===before.score&&after.markers===before.markers,
        `${label}: real shot is forwarded without damage, score or marker`);
      if(blocked)await a.evaluate(()=>wall(false));
    };
    await settled();await miss('Above-head miss');await miss('Native wall blocks head',true);
    for(let level=0;level<3;level++)await shoot(`Head box ${level+1}`,'head',level);
    await shoot('Body','body',1,false);
    await settled({r:1.57});await shoot('Turned head');
    await b.evaluate(()=>moving=true);
    await a.waitForFunction(()=>combat.foes()[0].speed>.3);
    const lethal=await shoot('Moving head');await b.evaluate(()=>moving=false);
    check(lethal.last.dead&&lethal.kills===1&&(await b.evaluate(()=>deathCalls))===1,'moving head lethal receipt records exactly one kill and target death');
    await a.evaluate(m=>ghosts.message(JSON.stringify(m)),lethal.last);
    const replay=await a.evaluate(()=>snapshot());
    check(replay.kills===1&&replay.score===lethal.score&&replay.hits===lethal.hits&&replay.markers===lethal.markers,
      'replayed accepted lethal receipt duplicates neither kill, points nor hit marker');
    await settled({r:0,c:true});await shoot('Crouched head');
    check(await a.evaluate(()=>snapshot().hits===7&&snapshot().score===35&&snapshot().counted===7&&snapshot().bonus===0),
      'all seven ordinary accepted shots total 35 points with one kill');
    check((await Promise.all([a,b].map(p=>p.evaluate(()=>webglCalls)))).every(n=>n===0),'both actual gameplay peers use native Three meshes without apartment or WebGL');
    // A single cheap visual render: native solid Avatar alongside wireframe boxes transformed like the logical collider.
    const visual=await page(),seed=await a.evaluate(()=>combat.foes()[0].id);
    const visualInfo=await visual.evaluate(async seed=>{
      const T=await import('three'),{Avatar}=await import('/src/avatar.js'),{PVP_HEAD_BOXES:H}=await import('/src/config.js');
      document.body.replaceChildren();document.body.style.cssText='margin:0;background:#14232d';
      const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(360,360);document.body.append(renderer.domElement);
      const scene=new T.Scene();scene.background=new T.Color('#14232d');scene.add(new T.AmbientLight(0xffffff,2));
      const avatar=new Avatar(seed);avatar.setSolid(true);avatar.update(0);scene.add(avatar.object);
      const boxes=new T.Group();boxes.rotation.y=avatar.object.rotation.y;boxes.scale.copy(avatar.object.scale);scene.add(boxes);
      const colours=[0xffc35a,0x55e2ca,0xb3a3ff];
      H.boxes.forEach((b,i)=>{const geometry=new T.BoxGeometry(b.halfWidth*2,b.high-b.low,b.front-b.back);
        const mesh=new T.LineSegments(new T.EdgesGeometry(geometry),new T.LineBasicMaterial({color:colours[i],depthTest:false}));
        mesh.position.set(0,(b.low+b.high)/2,(b.back+b.front)/2);mesh.renderOrder=2;boxes.add(mesh);geometry.dispose();});
      const camera=new T.PerspectiveCamera(30,1,.01,10);camera.position.set(.52,1.72*avatar.look.tall,-.75);camera.lookAt(0,1.60*avatar.look.tall,0);
      scene.updateMatrixWorld(true);renderer.render(scene,camera);
      return {seed,look:avatar.look,boxCount:boxes.children.length,width:360,height:360,triangles:renderer.info.render.triangles};
    },seed);
    await visual.screenshot({path:`${output}/avatar-head-boxes.png`});
    check(visualInfo.boxCount===3&&visualInfo.triangles>0,'one tiny real WebGL render retains native Avatar and three visible debug wireframes');
    check(errors.length===0,`zero browser errors (${errors.length})`);
    fs.writeFileSync(`${output}/result.json`,JSON.stringify({checks,failures,errors,records,visualInfo,
      scope:'ordinary two-peer Combat/Worker functional checks; one native Avatar debug-box render, no apartment/physical-phone/anatomy proof'},null,2));
  } finally {
    for(const p of pages)await p.evaluate(()=>{clearInterval(window.tick);window.ghosts?.disconnect();}).catch(()=>{});
    await browser.close();
  }
  console.log(`${failures?'FAILED':'ALL PASS'} ${checks} checks, ${failures} FAIL`);process.exitCode=failures?1:0;
})().catch(error=>{console.error('FAIL',error);process.exitCode=1;});
