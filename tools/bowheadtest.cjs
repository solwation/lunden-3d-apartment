// #979: real Bow.onShot/Arrows, native Ghosts/Combat, two local WS peers; no World/WebGL.
const fs=require('node:fs'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game='http://localhost:8870',worker='http://localhost:8871',out='/tmp/lunden-priority-979/native']=process.argv.slice(2);
const legacy=process.argv.includes('--legacy'),reference=cp.execFileSync('git',['show','7759da7:src/bow.js'],{encoding:'utf8'});
let checks=0,failures=0;const records=[],errors=[];
const check=(ok,label)=>{checks++;console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failures++;};
(async()=>{
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/reference-bow.js`,reference);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});const pages=[];
 try{
 for(let i=0;i<2;i++){
  const page=await browser.newPage({viewport:{width:390,height:480}});pages.push(page);page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// native arrow fixture'}));
  await page.route('**/src/bow-before979.js',r=>r.fulfill({contentType:'text/javascript',body:reference}));
  await page.goto(game,{waitUntil:'domcontentloaded'});
  const setup=await page.evaluate(async({worker,i})=>{
   const context=HTMLCanvasElement.prototype.getContext;window.webglCalls=0;
   HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){webglCalls++;throw Error('no WebGL');}return context.call(this,k,...a);};
   for(const id of ['loading','overlay'])document.getElementById(id).hidden=true;document.documentElement.classList.remove('resuming');
   window.T=await import('three');window.config=await import('/src/config.js');window.flight=await import('/src/bowflight.js');window.S=await import('/src/stats.js');
   const {Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js'),{Bow,Arrows}=await import('/src/bow.js'),{dynbox}=await import('/src/patio.js');
   const old=await import('/src/bow-before979.js');
   const parity=[];
   for(const dt of [1/60,.02]){
    const scene=new T.Scene(),now=new Arrows(scene),before=new old.Arrows(scene);
    const a=now.fire(new T.Vector3(0,2,0),new T.Vector3(28,0,0)),b=before.fire(new T.Vector3(0,2,0),new T.Vector3(28,0,0));
    for(let n=0;n<30;n++){now.update(dt);before.update(dt);}
    parity.push({dt,positionDelta:a.m.position.distanceTo(b.m.position),velocityDelta:a.v.distanceTo(b.v),position:a.m.position.toArray()});
   }
   window.scene=new T.Scene();window.camera=new T.PerspectiveCamera(60,1,.1,100);scene.add(camera);
   window.pose={p:i?[2,0,0]:[0,0,0],r:0,c:false};window.acks=[];window.seen=0;window.markers=0;window.deaths=0;
   window.arrows=new Arrows(scene,{camera,skip:p=>p===camera});
   const box=dynbox({inside:'bow'});box.position.set(20,0,20);box.userData.box.lid.t=1;scene.add(box);box.updateMatrixWorld(true);
   window.bow=new Bow(scene,camera,box,arrows);if(!i)bow.take();
   S.setScoreElement(document.getElementById('score'));S.setBadgeElement(document.getElementById('badges'));
   window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Bågmål':'Bågskytt',active:()=>true,state:()=>({...pose,p:pose.p.slice()}),weapon:()=>i?'rifle':'bow',score:()=>S.totalScore(),mirrored:()=>false});
   window.combat=new Combat({scene,camera,ghosts,weapon:()=>i?'rifle':'bow',feet:()=>new T.Vector3(...pose.p),arrows,onHit:()=>S.bump('pvpHits'),onDie:()=>deaths++});
   bow.onShot=(o,v)=>{window.lastActual={o:o.toArray(),v:v.toArray(),s:v.length()};combat.fire('bow',{o:o.clone(),d:v.clone().normalize(),s:v.length()},true);};
   const hit=ghosts.onHit,shot=ghosts.onShot,marker=combat.hitMarker.show.bind(combat.hitMarker);
   ghosts.onHit=(m,g)=>{acks.push(structuredClone(m));hit(m,g);};ghosts.onShot=(m,g)=>{seen++;shot(m,g);};combat.hitMarker.show=m=>{markers++;marker(m);};
   window.tick=setInterval(()=>{ghosts.update();combat.update(.04);arrows.update(.04);scene.updateMatrixWorld(true);},40);
   window.launch=()=>{const o=camera.getWorldPosition(new T.Vector3()),d=camera.getWorldDirection(new T.Vector3());o.addScaledVector(d,.35).y-=.08;return{o,d,s:28};};
   window.aim=kind=>{
    const foe=combat.foes()[0],tall=config.avatarLook(foe.id).tall,y=foe.feet.y+(kind==='body'?.9:1.64*tall);
    if(kind==='under'){
     const d=new T.Vector3(2,1,0).normalize();camera.position.set(-.35*d.x,.68-.35*d.y,0);camera.lookAt(camera.position.clone().add(d));camera.updateMatrixWorld(true);
    }else{
     let selected=false;
     for(let extra=.08;extra<2&&!selected;extra+=.01){camera.position.set(0,y+extra,0);camera.lookAt(foe.feet.x,camera.position.y,0);camera.updateMatrixWorld(true);const hit=combat.bowContact(launch(),combat.rules.weapons.bow.range);if(hit.target&&!!hit.hc===(kind!=='body'))selected=true;}
     if(!selected)throw Error('no real launch for '+kind);
    }
    if(kind==='miss'){camera.rotation.y+=Math.PI;camera.updateMatrixWorld(true);}
    const shot=launch(),contact=combat.bowContact(shot,combat.rules.weapons.bow.range);
    return{shot:{o:shot.o.toArray(),d:shot.d.toArray(),s:shot.s},contact:{to:contact.target?.id,hc:contact.hc},skin:foe.avatar.mesh.isSkinnedMesh,
     sightHead:config.rifleBoxHeadContact(foe.id,{p:foe.feet.toArray(),r:foe.root.rotation.y,c:foe.crouch},shot.o.toArray(),shot.d.toArray(),60)};
   };
   window.attack=()=>{bow.trigger(true);bow.tick(config.BOW.drawTime*.5);bow.trigger(false);};
   window.wall=kind=>{if(kind){window.block=new T.Mesh(new T.BoxGeometry(...(kind==='floor'?[20,.1,4]:[.1,5,4])),new T.MeshBasicMaterial());block.position.set(...(kind==='floor'?[5,1.85,0]:[1.4,1.5,0]));scene.add(block);}else{block.removeFromParent();block.geometry.dispose();block.material.dispose();}scene.updateMatrixWorld(true);};
   window.snap=()=>({hits:combat.hits,hurts:combat.hurts,lives:combat.lives,score:S.totalScore(),kills:S.stats.pvpKills??0,markers,deaths,last:acks.at(-1),wire:combat.lastShot,actual:window.lastActual});
   return{parity,looseIdentical:Bow.prototype.loose.toString()===old.Bow.prototype.loose.toString(),triggerIdentical:Bow.prototype.trigger.toString()===old.Bow.prototype.trigger.toString(),hitIdentical:Arrows.prototype.hit.toString()===old.Arrows.prototype.hit.toString()};
  },{worker,i});
  records.push({setup,i});check(setup.parity.every(x=>x.positionDelta===0&&x.velocityDelta===0),'native actual Arrows exactly matches independent pre979 physics at16.7/20ms');
  check(setup.looseIdentical&&setup.triggerIdentical&&setup.hitIdentical,'real Bow draw/release/launch and arrow solid-world policy remain source-identical');
 }
 const [a,b]=pages;await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&combat.foes().length===1)));
 const image=async(kind)=>{
  const info=await a.evaluate(kind=>{const value=snap();let proof=document.getElementById('bow-proof');if(!proof){proof=document.createElement('pre');proof.id='bow-proof';proof.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;background:#14232d;color:white;padding:12px;z-index:21;white-space:pre-wrap;font:13px monospace';document.body.append(proof);}proof.textContent=`Båge / ${kind}\nServer: ${value.last.head?'huvud 2':'kropp 1'}\nMålets HP: ${value.last.l}\nTräffar: ${value.hits}, markörer: ${value.markers}\nPoäng: ${value.score}\nRiktig Bow.onShot + två lokala WS\nIngen World/WebGL`;
   const el=combat.hitMarker.el,r=el.getBoundingClientRect();return{text:el.textContent,visible:!el.hidden&&r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,receipt:value.last};},kind);
  check(info.visible&&info.text===(kind==='head'?'Huvudträff!':'Träff!'),'actual '+kind+' receipt HUD visible before screenshot');records.push({image:kind,info});await a.screenshot({path:`${out}/${kind}.png`});
 };
 const shoot=async(label,kind='head',head=true,picture=false)=>{
  await a.waitForTimeout(1100);const before=await a.evaluate(()=>({hits:combat.hits,markers,score:S.totalScore()})),health=await b.evaluate(()=>combat.lives);
  const aim=await a.evaluate(kind=>window.aim(kind),kind);await a.evaluate(()=>attack());await a.waitForFunction(n=>combat.hits===n,before.hits+1);
  if(picture)await image(head?'head':'body');await b.waitForFunction(n=>combat.hurts===n,before.hits+1);
  const after=await a.evaluate(()=>snap()),target=await b.evaluate(()=>snap());records.push({label,aim,before,after,target,health});const left=health-(head?2:1);
  check(!!after.last.head===head&&after.last.l===left&&target.lives===(left<=0?10:left),label+': real Bow.onShot/Worker authoritative damage and target HP');
  check(after.markers===before.markers+1&&after.score===before.score+after.last.award.points,label+': one marker and authoritative points');
  check(Math.abs(after.actual.s-28)<1e-10&&after.wire.s===28&&after.actual.o.every((x,i)=>Math.abs(x-after.wire.o[i])<=.00501),label+': real half-draw launch reaches Combat/wire unchanged apart from normal rounding');
  if(head)check(after.wire.hc?.[0]===2,label+': shared v2 head contact');return after;
 };
 if(legacy){await shoot('new native bow client against old Worker','head',false,true);check(await a.evaluate(()=>combat.lastShot.hc?.[0]===2&&!acks.at(-1).head&&acks.at(-1).l===9),'old Worker retains body1 for new bow head claim');}
 else{
  const miss=async(label,wall=null)=>{await a.waitForTimeout(1100);await a.evaluate(wall=>{aim(wall?'head':'miss');if(wall)window.wall(wall);},wall);const before=await a.evaluate(()=>({hits:combat.hits,markers,score:S.totalScore()})),seen=await b.evaluate(()=>window.seen);await a.evaluate(()=>attack());await b.waitForFunction(n=>seen>n,seen);await a.waitForTimeout(100);const after=await a.evaluate(()=>snap());records.push({label,before,after});check(after.wire.to===null&&after.hits===before.hits&&after.markers===before.markers&&after.score===before.score,label+': actual arrow shot, no target/damage/marker/points');if(wall){const physical=await a.evaluate(()=>{const arrow=arrows.list[(arrows.next-1)%arrows.list.length];for(let n=0;n<100&&arrow.flying;n++)arrows.update(.02);return{stuck:!arrow.flying,hit:arrow.hit?.toArray()};});check(physical.stuck&&physical.hit?.every(Number.isFinite),label+': actual visible-arrow class also sticks at obstacle');records.push({label,physical});await a.evaluate(()=>window.wall(null));}};
  await miss('Miss');await miss('Wall before head','wall');
  await shoot('Earlier body before later head','under',false);await shoot('Body','body',false,true);
  await shoot('Head','head',true,true);await shoot('Head repeated');await shoot('Body repeated','body',false);
  await shoot('Head low HP');const lethal=await shoot('Lethal head');
  check(lethal.last.dead&&typeof lethal.last.kill==='string'&&lethal.kills===1&&(await b.evaluate(()=>deaths))===1,'one lethal UUID, kill and target death/reset');
  const before=await a.evaluate(()=>snap());await a.evaluate(m=>ghosts.message(JSON.stringify(m)),lethal.last);const after=await a.evaluate(()=>snap());check(after.hits===before.hits&&after.score===before.score&&after.kills===before.kills&&after.markers===before.markers,'replayed lethal receipt is idempotent');
  await b.evaluate(()=>pose.p=[10,0,0]);await a.waitForFunction(()=>Math.abs(combat.foes()[0].feet.x-10)<.005);
  const long=await shoot('Falling arc reaches head above sight-line miss');check(!records.findLast(r=>r.label==='Falling arc reaches head above sight-line miss').aim.sightHead&&long.last.head,'falling tip path hits while the straight launch ray misses head');
  await miss('Floor before lower target head','floor');
  check(await a.evaluate(()=>combat.bowContact(launch(),1).target===null),'existing finite range clips before a target beyond it');
 }
 check((await Promise.all(pages.map(p=>p.evaluate(()=>webglCalls)))).every(x=>x===0),'native real models and DOM, zero WebGL');check(!errors.length,'zero page errors');
 }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.disconnect();}).catch(()=>{});await browser.close();fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,failures,errors,legacy,records,scope:'Actual Bow/Arrows, native meshes/DOM and two real local WS; 20ms prediction is not exact for every variable frame time; no World/GPU/phone claim'},null,2));}
 console.log(`${failures?'FAILED':'ALL PASS'} ${checks} checks, ${failures} FAIL`);process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
