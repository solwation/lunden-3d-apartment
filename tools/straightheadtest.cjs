// #893: actual native Ghosts/Combat/Avatar + two local Worker WebSockets, no apartment/WebGL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const [game='http://localhost:8870', worker='http://localhost:8871', out='/tmp/lunden-priority-893/native'] = process.argv.slice(2);
const baseline=process.argv.includes('--jet-wall-baseline');
let checks=0, failures=0;
const records=[], errors=[];
const check=(ok,label)=>{checks++;console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failures++;};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try {
 for(const weapon of (baseline?['jetpack']:['wand','web','saber','jetpack'])) {
  const context=await browser.newContext({viewport:{width:390,height:480}}), pages=[];
  try {
   for(let i=0;i<2;i++) {
    const page=await context.newPage();pages.push(page);page.setDefaultTimeout(12000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// native straight attack fixture'}));
    if(baseline){if(!process.env.STRAIGHT_COMBAT_BASELINE)throw Error('baseline needs frozen old Combat');await page.route('**/src/combat.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.STRAIGHT_COMBAT_BASELINE,'utf8')}));}
    await page.goto(game,{waitUntil:'domcontentloaded'});
    await page.evaluate(async({worker,i,weapon})=>{
     const getContext=HTMLCanvasElement.prototype.getContext;window.webglCalls=0;
     HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/i.test(kind)){webglCalls++;throw Error('WebGL forbidden');}return getContext.call(this,kind,...args);};
     document.getElementById('overlay').hidden=true;document.getElementById('loading').hidden=true;document.documentElement.classList.remove('resuming');
     window.T=await import('three');window.config=await import('/src/config.js');window.S=await import('/src/stats.js');
     const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js');
     window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);
     window.pose={p:i?[2,0,0]:[0,0,0],r:0,c:false};window.held=i?'rifle':weapon;
     window.jet={thrusting:false};window.acks=[];window.remoteShots=0;window.markers=0;window.deaths=0;
     S.setScoreElement(document.getElementById('score'));S.setBadgeElement(document.getElementById('badges'));
     window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Mål':'Skytt',active:()=>true,state:()=>({...pose,p:pose.p.slice()}),weapon:()=>held,score:()=>S.totalScore(),mirrored:()=>false});
     window.combat=new Combat({scene,camera,ghosts,weapon:()=>held,feet:()=>new T.Vector3(...pose.p),jetpack:jet,onHit:()=>S.bump('pvpHits'),onDie:()=>deaths++});
     const fire=ghosts.fire.bind(ghosts);ghosts.fire=s=>{window.actualWire=structuredClone(s);return fire(s);};
     const hit=ghosts.onHit,shot=ghosts.onShot,show=combat.hitMarker.show.bind(combat.hitMarker);
     ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onShot=(m,g)=>{remoteShots++;shot(m,g);};combat.hitMarker.show=m=>{markers++;show(m);};
     window.timer=setInterval(()=>{ghosts.update();combat.update(.04);scene.updateMatrixWorld(true);},40);
     window.aim=kind=>{
      const foe=combat.foes()[0], y=1.64*config.avatarLook(foe.id).tall;
      const target=new T.Vector3(foe.feet.x,foe.feet.y+(kind==='body'?.95:y),foe.feet.z);
      camera.position.set(0,target.y,0);if(kind==='miss')target.y+=.65;
      camera.lookAt(target);camera.updateMatrixWorld(true);
      let earlierBody=null;
      if(kind==='under') {
       const state={p:foe.feet.toArray(),r:foe.root.rotation.y,c:foe.crouch},neck=config.rifleHeadBaseY(foe.id,state);
       foe.root.updateMatrixWorld(true);
       search:for(const x of [1.2,1.6,1.8,2])for(const z of [0,.1,-.1,.2])for(const h of [.2,.5,.8]){
        camera.position.set(x,h,z);camera.lookAt(target);camera.updateMatrixWorld(true);
        const o=camera.position.toArray().map(v=>Math.round(v*100)/100),d=camera.getWorldDirection(new T.Vector3()).toArray().map(v=>Math.round(v*1000)/1000);
        const head=config.rifleBoxHeadContact(foe.id,state,o,d,combat.rules.weapons[held].range);
        const ray=new T.Raycaster(new T.Vector3(...o),new T.Vector3(...d).normalize(),0,combat.rules.weapons[held].range);
        const body=ray.intersectObject(foe.avatar.mesh,false).find(hit=>hit.point.y<neck);
        if(head&&body&&body.distance<head.distance){earlierBody={body:body.distance,head:head.distance,point:body.point.toArray(),origin:o,direction:d};break search;}
       }
       if(!earlierBody)throw Error('fixture found no actual body before head');
      }
      if(kind==='miss'&&held==='saber'){camera.rotation.y+=Math.PI;camera.updateMatrixWorld(true);}
      return {state:pose,seed:foe.id,skin:foe.avatar.mesh.isSkinnedMesh,earlierBody,contact:held==='jetpack'?null:combat.straightContact(held).hc};
     };
     window.wall=on=>{if(on){window.block=new T.Mesh(new T.BoxGeometry(...(held==='jetpack'?[2,.1,2]:[.1,4,4])),new T.MeshBasicMaterial());block.position.set(...(held==='jetpack'?[2,2.2,0]:[1,1.5,0]));scene.add(block);}else{block.removeFromParent();block.geometry.dispose();block.material.dispose();}scene.updateMatrixWorld(true);};
     window.snap=()=>({hits:combat.hits,hurts:combat.hurts,lives:combat.lives,score:S.totalScore(),kills:S.stats.pvpKills??0,markers,deaths,last:acks.at(-1),wire:combat.lastShot??window.actualWire});
     window.attack=()=>{if(held==='jetpack'){jet.thrusting=true;combat.jetT=0;combat.update(0);jet.thrusting=false;}else combat.fire(held);};
    },{worker,i,weapon});
   }
   const [a,b]=pages;
   await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&combat.foes().length===1)));
   const hit=async(label,kind,head)=>{
    await a.waitForTimeout(1100);
    const before=await a.evaluate(()=>snap()),health=await b.evaluate(()=>combat.lives);
    if(weapon==='jetpack') {
     await a.evaluate(kind=>{pose.p=kind==='body'?[2.6,2,0]:[2,2,0];},kind);
     await b.waitForFunction(x=>Math.abs(combat.foes()[0].feet.x-x)<.005&&Math.abs(combat.foes()[0].feet.y-2)<.005,kind==='body'?2.6:2);
    }else {const aim=await a.evaluate(kind=>window.aim(kind),kind);records.push({weapon,label,aim});if(kind==='under')check(aim.earlierBody?.body<aim.earlierBody?.head,`${weapon}: actual native body surface precedes box`);}
    await a.evaluate(()=>attack());await a.waitForFunction(n=>combat.hits===n,before.hits+1);
    if(label==='body'||label==='head repeated'||baseline)await shotImage(head?'head':'body');
    await b.waitForFunction(n=>combat.hurts===n,before.hits+1);
    const after=await a.evaluate(()=>snap()),target=await b.evaluate(()=>snap()),damage=head?2:1,left=health-damage;
    records.push({weapon,label,before,after,target,health});
    check(!!after.last.head===head&&after.last.l===left&&target.lives===(left<=0?10:left),`${weapon} ${label}: real contact/WS authoritative ${damage} damage`);
    check(after.markers===before.markers+1&&after.score===before.score+5&&after.last.award.points===5,`${weapon} ${label}: one marker and unchanged five points`);
    if(head)check(after.wire.hc?.[0]===2,`${weapon}: sends shared version-2 head contact`);
    return after;
   };
   const shotImage=async kind=>{
    const info=await a.evaluate(({weapon,kind})=>{
     const value=snap();let proof=document.getElementById('straight-proof');
     if(!proof){proof=document.createElement('pre');proof.id='straight-proof';proof.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;color:white;background:#14232d;padding:12px;z-index:21;white-space:pre-wrap;font:13px monospace';document.body.append(proof);}
     proof.textContent=`${weapon} / ${kind}\nServer: ${value.last.head===true?'huvud 2':'kropp 1'}\nMålets HP: ${value.last.l}\nTräffar: ${value.hits}, markörer: ${value.markers}\nPoäng: ${value.score}\nTvå riktiga lokala WS; ingen World/WebGL`;
     const marker=document.getElementById('hit-marker'),rect=marker.getBoundingClientRect();
     return {rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},text:marker.textContent,visible:!marker.hidden&&rect.width>0&&rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,receipt:value.last};
    },{weapon,kind});
    check(info.visible&&info.text===(kind==='head'?'Huvudträff!':'Träff!'),`${weapon} ${kind}: actual authoritative HUD marker visible before image`);
    records.push({weapon,kind,image:info});await a.screenshot({path:`${out}/${weapon}-${kind}.png`});
   };
   if(baseline){await a.evaluate(()=>wall(true));await hit('unchanged old client wall/body bug','head',false);check(await a.evaluate(()=>!combat.lastShot?.hc),'baseline archived Combat sends no head claim');continue;}
   if(weapon!=='jetpack') {
    for(const blocked of [false,true]) {
     await a.waitForTimeout(1100);await a.evaluate(blocked=>{aim(blocked?'head':'miss');if(blocked)wall(true);},blocked);
     const before=await a.evaluate(()=>snap()),seen=await b.evaluate(()=>remoteShots);
     await a.evaluate(()=>attack());await b.waitForFunction(n=>remoteShots>n,seen);await a.waitForTimeout(100);
     const after=await a.evaluate(()=>snap());
     check(after.wire.to===null&&after.hits===before.hits&&after.markers===before.markers,`${weapon} ${blocked?'wall':'miss'}: actual shot without target/damage/marker`);
     if(blocked)await a.evaluate(()=>wall(false));
    }
    await hit('torso before head','under',false);
   }else {
    await a.evaluate(()=>{pose.p=[4,2,0];jet.thrusting=true;combat.jetT=0;combat.update(0);jet.thrusting=false;});
    await a.waitForTimeout(350);
    check(await a.evaluate(()=>combat.hits===0&&!combat.lastShot),'jetpack outside existing flame footprint: no contact');
   }
   await hit('body','body',false);await hit('head','head',true);
   const head=await hit('head repeated','head',true);

   await hit('body repeated','body',false);
   if(weapon==='jetpack') {
    await a.waitForTimeout(1100);await a.evaluate(()=>{pose.p=[2,2,0];wall(true);});
    const before=await a.evaluate(()=>snap()),seen=await b.evaluate(()=>remoteShots);
    await a.evaluate(()=>attack());await a.waitForTimeout(350);
    const after=await a.evaluate(()=>snap());
    check(after.hits===before.hits&&after.score===before.score&&after.markers===before.markers&&(await b.evaluate(()=>remoteShots))===seen,'jetpack wall blocks both head bonus and old body fallback (#978)');
    await a.evaluate(()=>wall(false));
   }
   if(weapon==='wand') {
    let last=await hit('head to low life','head',true);
    while(!last.last.dead)last=await hit('lethal head','head',true);
    const before=await a.evaluate(()=>snap());await a.evaluate(m=>ghosts.message(JSON.stringify(m)),last.last);
    const after=await a.evaluate(()=>snap());
    check(last.last.dead&&typeof last.last.kill==='string'&&after.kills===1&&(await b.evaluate(()=>deaths))===1,'wand lethal head: one UUID, kill and death/reset');
    check(after.score===before.score&&after.hits===before.hits&&after.markers===before.markers&&after.kills===before.kills,'wand replay: no duplicated kill, points or marker');
   }
   if(weapon==='saber') {
    await a.waitForTimeout(1100);await a.evaluate(()=>{aim('head');camera.rotation.y+=Math.PI;camera.updateMatrixWorld(true);});
    const before=await a.evaluate(()=>snap());await a.evaluate(()=>attack());await a.waitForTimeout(350);
    check(await a.evaluate(n=>combat.hits===n&&combat.lastShot.to===null,before.hits),'saber existing front cone: target behind attacker remains miss');
   }
   check((await Promise.all(pages.map(p=>p.evaluate(()=>webglCalls)))).every(n=>n===0),`${weapon}: native skinned meshes, zero WebGL`);
   records.push({weapon,final:await a.evaluate(()=>snap()),head});
  }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(timer);ghosts.disconnect();}).catch(()=>{});await context.close();}
 }
 check(errors.length===0,`zero browser errors (${errors.length})`);
 }finally{await browser.close();fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,records,scope:'native DOM/mesh contacts and two actual local WS peers; no World/GPU/phone claim'},null,2));}
 console.log(`${failures?'FAILED':'ALL PASS'} ${checks} checks, ${failures} FAIL`);process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
