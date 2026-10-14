// #978: actual native Ghosts/Combat/Avatar + two local Worker WebSockets, no apartment/WebGL.
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
 for(const weapon of ['jetpack']) {
  const context=await browser.newContext({viewport:{width:390,height:480}}), pages=[];
  try {
   for(let i=0;i<(baseline?2:3);i++) {
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
     window.pose={p:i===2?[3,0,0]:i?[2,0,0]:[0,0,0],r:0,c:false};window.held=i===2?'':i?'rifle':weapon;
     window.jet={thrusting:false};window.acks=[];window.remoteShots=0;window.markers=0;window.deaths=0;
     S.setScoreElement(document.getElementById('score'));S.setBadgeElement(document.getElementById('badges'));
     window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Mål':'Skytt',active:()=>true,state:()=>({...pose,p:pose.p.slice()}),weapon:()=>held,score:()=>S.totalScore(),mirrored:()=>false});
     window.combat=new Combat({scene,camera,ghosts,weapon:()=>held,feet:()=>new T.Vector3(...pose.p),jetpack:jet,onHit:()=>S.bump('pvpHits'),onDie:()=>deaths++});
     const fire=ghosts.fire.bind(ghosts);ghosts.fire=s=>{window.actualWire=structuredClone(s);return fire(s);};
     const hit=ghosts.onHit,shot=ghosts.onShot,show=combat.hitMarker.show.bind(combat.hitMarker);
     ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onShot=(m,g)=>{remoteShots++;shot(m,g);};combat.hitMarker.show=m=>{markers++;show(m);};
     window.timer=setInterval(()=>{ghosts.update();combat.update(.04);scene.updateMatrixWorld(true);},40);
     window.snap=()=>({hits:combat.hits,hurts:combat.hurts,lives:combat.lives,score:S.totalScore(),kills:S.stats.pvpKills??0,markers,deaths,last:acks.at(-1),wire:combat.lastShot??window.actualWire});
     window.attack=()=>{if(held==='jetpack'){jet.thrusting=true;combat.jetT=0;combat.update(0);jet.thrusting=false;}else combat.fire(held);};
    },{worker,i,weapon});
   }
   const [a,b]=pages;
   await Promise.all(pages.slice(0,2).map(p=>p.waitForFunction(()=>ghosts.connected&&combat.foes().length===1)));
   const settle=async p=>{
    await a.evaluate(p=>{pose.p=p;},p);
    await b.waitForFunction(p=>{const g=combat.foes()[0];return g.feet.distanceTo(new T.Vector3(...p))<.005;},p);
    await a.waitForTimeout(1100);
   };
   const blocks=async spec=>a.evaluate(spec=>{
    for(const m of window.obstacles??[]){m.removeFromParent();m.geometry.dispose();m.material.dispose();}
    window.obstacles=[];
    for(const b of spec){
     const m=new T.Mesh(new T.BoxGeometry(...b.size),new T.MeshBasicMaterial({transparent:b.transparent??false,opacity:b.transparent?.3:1}));
     m.position.set(...b.p);if(b.moving)m.userData.moving=true;
     scene.add(m);obstacles.push(m);
    }
    scene.updateMatrixWorld(true);
   },spec);
   const attempt=async(label,{p=[2,2,0],obstacles=[],hit=false,head=false}={})=>{
    await settle(p);await blocks(obstacles);
    const before=await a.evaluate(()=>snap()),target=await b.evaluate(()=>snap());
    const sent=await a.evaluate(()=>{const prev=window.actualWire;attack();return window.actualWire!==prev;});
    if(hit)await a.waitForFunction(n=>combat.hits===n,before.hits+1);
    else await a.waitForTimeout(350);
    const after=await a.evaluate(()=>snap()),other=await b.evaluate(()=>snap());
    if(hit){
     const damage=head?2:1,left=target.lives-damage;
     check(sent&&!!after.last.head===head&&after.last.l===left&&other.lives===(left<=0?10:left),label+': genuine WS confirms '+damage+' damage');
     check(after.score===before.score+5&&after.markers===before.markers+1,label+': unchanged points/marker once');
    }else check(!sent&&after.hits===before.hits&&after.score===before.score&&after.markers===before.markers&&other.lives===target.lives,label+': no target packet, damage, points or marker');
    records.push({label,before,after,other,sent,obstacles,p});return after;
   };
   const plate={size:[2,.1,2],p:[2,2.2,0]};
   await attempt('Original horizontal wall',{obstacles:[plate],hit:baseline});
   if(baseline)continue;
   const blockedCooldown=await a.evaluate(()=>{
    const t=combat.jetT,original=combat.jetBodyClear;let calls=0;
    combat.jetBodyClear=function(...args){calls++;return original.apply(this,args);};
    try{jet.thrusting=true;combat.update(0);}finally{jet.thrusting=false;combat.jetBodyClear=original;}
    return {t,calls};
   });
   check(blockedCooldown.t>0&&blockedCooldown.calls===0,'blocked attempt keeps the existing cooldown without another per-frame obstacle query');
   await attempt('Open vertical flame',{hit:true,head:true});
   await attempt('Offset volume body survives',{p:[2.8,2,0],hit:true});
   await attempt('Thin obstacle immediately before body',{p:[2.8,2,0],obstacles:[{size:[2,.02,2],p:[2,2.15,0]}]});
   await attempt('Diagonal wall stops offset body',{p:[2.8,2,0],obstacles:[{size:[.2,.5,2],p:[2.5,2.45,0]}]});
   await attempt('Corner stops diagonal body',{p:[2.8,2,.8],obstacles:[{size:[.15,.4,.15],p:[2.55,2.5,.55]}]});
   await attempt('Open passage between solids',{obstacles:[{size:[.6,.1,2],p:[1.3,2.2,0]},{size:[.6,.1,2],p:[2.7,2.2,0]}],hit:true,head:true});
   await attempt('Transparent prop keeps existing exclusion',{p:[2.8,2,0],obstacles:[{size:[2,.1,2],p:[2,2.2,0],transparent:true}],hit:true});
   await attempt('Moving prop keeps existing exclusion',{p:[2.8,2,0],obstacles:[{...plate,moving:true}],hit:true});
   await attempt('Outside lateral volume',{p:[3.3,2,0]});
   await attempt('Outside vertical volume',{p:[2,6,0]});
   await settle([2.8,2,0]);await blocks([]);
   const cooldown=await a.evaluate(async()=>{
    const before=snap();attack();const t=combat.jetT,first=window.actualWire;
    jet.thrusting=true;combat.update(0);jet.thrusting=false;
    return {t,same:first===window.actualWire,before};
   });
   check(cooldown.t===(await a.evaluate(()=>combat.rules.weapons.jetpack.every))&&cooldown.same,'natural Combat.update cooldown prevents a second packet');
   await a.waitForFunction(n=>combat.hits===n,cooldown.before.hits+1);
   let lethal;
   do { lethal=await attempt('Lethal body retains one death receipt',{p:[2.8,2,0],hit:true}); } while(!lethal.last.dead);
   // Current damage sum may already have reset; inspect whichever accepted lethal receipt actually exists.
   const kill=await a.evaluate(()=>acks.find(m=>m.dead));
   check(kill?.kill&&typeof kill.kill==='string'&&(await b.evaluate(()=>deaths))===1,'one accepted lethal UUID resets the target once');
   const replayBefore=await a.evaluate(()=>snap());await a.evaluate(m=>ghosts.message(JSON.stringify(m)),kill);
   const replayAfter=await a.evaluate(()=>snap());
   check(replayAfter.kills===replayBefore.kills&&replayAfter.score===replayBefore.score&&replayAfter.hits===replayBefore.hits&&replayAfter.markers===replayBefore.markers,'replayed lethal receipt duplicates no kill/reward/marker');
   const c=pages[2];await c.evaluate(()=>held='rifle');
   await a.waitForFunction(()=>combat.foes().length===2);
   await settle([2,2,0]);await blocks([{size:[.25,.1,.25],p:[2,2.3,0]}]);
   const thirdBefore=await c.evaluate(()=>snap()),beforeSecond=await a.evaluate(()=>snap());
   const ids=await a.evaluate(()=>combat.foes().map(g=>g.id));
   await a.evaluate(()=>attack());await a.waitForFunction(n=>combat.hits===n,beforeSecond.hits+1);
   const afterSecond=await a.evaluate(()=>snap());await c.waitForFunction(n=>combat.lives===n,thirdBefore.lives-1);
   check(afterSecond.last.to===ids[1]&&!afterSecond.last.head,'a blocked first foe does not prevent an open offset second foe in the SAME flame attempt');
   records.push({secondFoe:{ids,before:beforeSecond,after:afterSecond,target:await c.evaluate(()=>snap())}});
   await a.evaluate(()=>{document.getElementById('loading').style.display='none';let el=document.createElement('pre');el.textContent='Jetpack: vägg och hörn stoppar lågan\nÖppning och sidoträff fungerar\nTvå riktiga lokala WS / ingen World';el.style.cssText='position:fixed;left:12px;top:100px;background:white;color:black;padding:12px;z-index:30';document.body.append(el);});
   await a.screenshot({path:out+'/jet-obstacles-hud.png'});
   check((await Promise.all(pages.map(p=>p.evaluate(()=>webglCalls)))).every(n=>n===0),'native clients create zero WebGL contexts');
  }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(timer);ghosts.disconnect();}).catch(()=>{});await context.close();}
 }
 check(errors.length===0,'zero page errors');
 }finally{await browser.close();fs.writeFileSync(out+'/result.json',JSON.stringify({checks,failures,records,errors,scope:'actual Combat.update + two native local WS clients; no World/WebGL/phone'},null,2));}
 console.log(`${failures?'FAILED':'ALL PASS'} ${checks} checks, ${failures} FAIL`);process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
