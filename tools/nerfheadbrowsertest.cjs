// #894: ordinary head/body/wall gameplay through two actual Ghosts/Combat peers and the local Worker.
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
          state:()=>({...pose,p:pose.p.slice()}),weapon:()=>'nerf',score:()=>S.totalScore(),mirrored:()=>false});
        window.combat = new Combat({scene,camera,ghosts,weapon:()=>'nerf',feet:()=>new T.Vector3(...pose.p),
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
          camera.position.set(0,center.y+.01,center.z);camera.lookAt(new T.Vector3(center.x,camera.position.y,center.z));camera.updateMatrixWorld(true);
          return {center:center.toArray(),c:foe.crouch,speed:foe.speed,yaw:foe.root.rotation.y,seed:foe.id,
            contact:combat.nerfCandidate({o:camera.position.clone(),d:camera.getWorldDirection(new T.Vector3()),s:30},25)?.hc,skin:foe.avatar.mesh.isSkinnedMesh};
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
      await a.waitForTimeout(450); const before=await a.evaluate(()=>snapshot()), health=await b.evaluate(()=>combat.lives);
      const aim=await a.evaluate(({kind,index})=>window.aim(kind,index),{kind,index});
      await a.evaluate(()=>combat.fire('nerf',{o:camera.position.clone(),d:camera.getWorldDirection(new T.Vector3()),s:30}));
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
      await a.waitForTimeout(450);await a.evaluate(()=>combat.fire('nerf',{o:camera.position.clone(),d:camera.getWorldDirection(new T.Vector3()),s:30}));
      await b.waitForFunction(n=>remoteShots>n,seen);await a.waitForTimeout(150);
      const after=await a.evaluate(()=>snapshot());
      check(after.wire.to===null&&after.hits===before.hits&&after.score===before.score&&after.markers===before.markers,
        `${label}: real shot is forwarded without damage, score or marker`);
      if(blocked)await a.evaluate(()=>wall(false));
    };
    const bodyParity=await a.evaluate(async()=>{
      const {nerfContact}=await import('/src/combat.js'),{nerfBodyContact}=await import('/src/nerf.js');
      const f=combat.foes()[0], neck=config.rifleHeadBaseY(f.id,{p:f.feet.toArray(),r:0});
      const rows=[];
      for(const y of [.4,.95,Math.min(1.3,neck-.05)])for(const z of [-.35,0,.35]){
        const o=new T.Vector3(0,y,z),d=new T.Vector3(1,0,0);
        const old=nerfContact(o,d,3,f.feet),next=nerfBodyContact(o.toArray(),d.toArray(),3,f.feet.toArray(),neck);
        const mesh=new T.Raycaster(o,d,0,3).intersectObject(f.avatar.mesh,false);
        rows.push({y,z,old,next,meshHits:mesh.length});
      }
      return rows;
    });
    check(bodyParity.every(r=>r.old!==null&&r.next!==null&&Math.abs(r.old-r.next)<1e-6),'nine actual old capsule body rays retain their entry, including both generous sides');
    check(bodyParity.some(r=>Math.abs(r.z)===.35&&r.meshHits===0),'body parity includes old valid capsule contact outside the actual cosmetic mesh');
    records.push({bodyParity});
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
    await a.evaluate(()=>{document.getElementById('overlay').hidden=true;document.getElementById('loading').style.display='none';
      const label=document.createElement('div');label.textContent='Nerf: huvud 2 / kropp 1 — två riktiga WebSocket-klienter';label.style.cssText='position:fixed;top:100px;background:white;color:black;padding:20px';document.body.append(label);});
    await a.screenshot({path:`${output}/nerf-head-hud.png`});
    check(errors.length===0,`zero browser errors (${errors.length})`);
    fs.writeFileSync(`${output}/result.json`,JSON.stringify({checks,failures,errors,records,
      scope:'actual two-peer Nerf Combat/Worker and DOM HUD; no WebGL/apartment/physical-phone claim'},null,2));
  } finally {
    for(const p of pages)await p.evaluate(()=>{clearInterval(window.tick);window.ghosts?.disconnect();}).catch(()=>{});
    await browser.close();
  }
  console.log(`${failures?'FAILED':'ALL PASS'} ${checks} checks, ${failures} FAIL`);process.exitCode=failures?1:0;
})().catch(error=>{console.error('FAIL',error);process.exitCode=1;});
