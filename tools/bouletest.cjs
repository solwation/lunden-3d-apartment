// #1370: real-app pétanque on the courtyard's boule court: focus/E throws (jack + boules), rolling to rest on the court,
// the rules' turns and scoring, the lectern's scoreboard buttons, culling far away, no page/shader errors.
// MOBILE=1: an 844×390 touch client throws the jack through the real action button.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');const base=process.argv[2]||'http://localhost:8141',shots=process.env.SHOTS||'/tmp/bouletest',mobile=!!process.env.MOBILE;
let failed=0;const check=(ok,name,data='')=>{console.log(`${ok?'PASS':'FAIL'} ${name} ${JSON.stringify(data)}`);if(!ok)failed++;};
(async()=>{fs.mkdirSync(shots,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage(mobile?{viewport:{width:844,height:390},isMobile:true,hasTouch:true}:{viewport:{width:1100,height:750}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('lunden.name','Boule');sessionStorage.setItem('lunden.nameSkipped','1');});
 await page.goto(base+'/?shot&cloud=&mp=0&quality=3&time=12&month=6&freeze&mess=0',{waitUntil:'commit'});await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000});
 const C=await page.evaluate(async()=>{const a=window.__app,C=await import('/src/config.js');a.showOverlay(false);if(a.rest.active)a.standUp();a.renderer.setAnimationLoop(null);
  const quiet=(n)=>{const r=a.renderer.render;a.renderer.render=()=>{};for(let i=0;i<n;i++)a.step(1/60);a.renderer.render=r;};
  window.__bt={quiet,aim:(x,y,z)=>{const d=new a.camera.position.constructor(x,y,z).sub(a.camera.position);a.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');},render:()=>{a.step(0);a.renderer.render(a.scene,a.camera);},
   focus:()=>{const t=a.touch.enabled;a.touch.enabled=true;a.step(0);a.step(0);a.touch.enabled=t;return a.focus().focused?.kind;},
   circle:()=>{const b=a.world.boule;a.player.spawn(b.circle.x,b.circle.z,Math.PI);for(let i=0;i<30;i++)a.player.update(1/60);}};
  return {court:C.COURTYARD.boule,B:C.BOULE};});
 const S=C.B.surface,cx=(C.court.x0+C.court.x1)/2;
 if(mobile){
  const ready=await page.evaluate(([x,z,S])=>{const a=window.__app;window.__bt.circle();window.__bt.aim(x,S,z);a.touch.enabled=true;document.body.classList.add('touch');a.step(0);a.step(0);a.testMode?.setFull?.(true);window.__bt.render();return{kind:a.focus().focused?.kind};},[cx,C.court.z0+C.B.circle.dz+5.5,S]);
  const action=page.locator('#action'),label=await action.textContent();check(ready.kind==='boule'&&await action.isVisible()&&/lillen/i.test(label),'landscape touch focuses the court and offers the jack throw',{ready,label});
  await page.screenshot({path:shots+'/mobile-aim.png'});await action.tap();
  const thrown=await page.evaluate(()=>{const a=window.__app,b=a.world.boule,flying=!!b.flight;window.__bt.quiet(240);window.__bt.render();return{flying,jack:b.physics.jack.active,next:b.rules.next,msg:b.rules.message};});
  check(thrown.flying&&thrown.jack&&thrown.next==='ball','native tap throws the jack and the rules move on to boules',thrown);
  await page.screenshot({path:shots+'/mobile-after.png'});
 }else{
  // 1. stand in the circle, aim 5.5 m down the court, native E throws the jack
  const aimJack=await page.evaluate(([x,z,S])=>{const a=window.__app;window.__bt.circle();window.__bt.aim(x,S,z);return{kind:window.__bt.focus(),verb:a.focus().focused?.verb,inCircle:a.world.boule.inCircle(a.camera.position),visible:a.world.boule.object.visible};},[cx,C.court.z0+C.B.circle.dz+5.5,S]);
  check(aimJack.kind==='boule'&&/lillen/.test(aimJack.verb)&&aimJack.inCircle&&aimJack.visible,'from the circle the far gravel is focusable for the jack',aimJack);
  await page.evaluate(()=>document.getElementById('game-canvas').requestPointerLock());await page.keyboard.press('KeyE');
  const jack=await page.evaluate(()=>{const a=window.__app,b=a.world.boule,flying=!!b.flight;window.__bt.quiet(240);const j=b.physics.jack;return{flying,active:j.active,x:j.x,z:j.z,d:Math.hypot(j.x-b.circle.x,j.z-b.circle.z),moving:b.physics.moving,next:b.rules.next,turn:b.rules.turn,msg:b.rules.message};});
  check(jack.flying&&jack.active&&!jack.moving&&jack.d>C.B.jackMin&&jack.d<C.B.jackMax&&jack.next==='ball'&&jack.turn===0,'native E throws the jack; it lands, rolls, rests on the court and is valid',jack);
  // 2. boules: aim at the jack each time with the real focus/use path until the mène is scored
  const throws=[];
  for(let i=0;i<6;i++){throws.push(await page.evaluate(([S,i])=>{const a=window.__app,b=a.world.boule,j=b.physics.jack;window.__bt.circle();window.__bt.aim(j.x+(i%2?.25:-.2),S,j.z-(i<2?.3:0));const kind=window.__bt.focus(),team=b.rules.turn;a.use(a.focus().focused);const start=b.physics.objects.map(o=>[o.x,o.z]);window.__bt.quiet(300);
   const inside=b.physics.objects.every(o=>{if(!o.active)return true;const k=b.physics.bounds(o.r);return o.x>=k.x0-1e-9&&o.x<=k.x1+1e-9&&o.z>=k.z0-1e-9&&o.z<=k.z1+1e-9;});
   return{kind,team,on:b.physics.objects.filter(o=>o.id&&o.active).length,moving:b.physics.moving,inside,left:[...b.rules.left],next:b.rules.next,scores:[...b.rules.scores],msg:b.rules.message,jackMoved:Math.hypot(j.x-start[0][0],j.z-start[0][1])};},[S,i]));
   if(i===1){await page.evaluate(([x,S,z])=>{window.__bt.circle();window.__bt.aim(x,S+.1,z);window.__bt.render();},[cx,S,C.court.z0+C.B.circle.dz+4.5]);await page.screenshot({path:shots+'/1-court.png'});}}
  check(throws.every((t,i)=>t.kind==='boule'&&t.on===i+1&&!t.moving&&t.inside),'six boules thrown through focus/use, each rests inside the court',throws);
  check(throws[0].team===0&&throws[1].team===1&&throws.slice(0,5).every(t=>t.next==='ball'),'turn order: Lag 1 first boule, then Lag 2, the rules pick the next side',throws.map(t=>[t.team,t.left,t.msg]));
  const last=throws[5];check(last.next==='collect'&&last.scores[0]+last.scores[1]>0||/lika/.test(last.msg),'after all six the mène is scored on the board',last);
  await page.evaluate(([x,S,z])=>{window.__bt.circle();window.__bt.aim(x,S,z);window.__bt.render();},[cx,S,C.court.z0+C.B.circle.dz+5.5]);await page.screenshot({path:shots+'/2-scored.png'});
  await page.evaluate(([S])=>{const a=window.__app,j=a.world.boule.physics.jack;a.player.spawn(j.x-.9,j.z-1.1,Math.PI);for(let i=0;i<20;i++)a.player.update(1/60);window.__bt.aim(j.x,S,j.z);window.__bt.render();},[S]);await page.screenshot({path:shots+'/2b-closeup.png'});
  // 3. E again collects and starts the next mène (the winner throws the jack)
  const collect=await page.evaluate(([x,S,z])=>{const a=window.__app,b=a.world.boule;window.__bt.circle();window.__bt.aim(x,S,z);const kind=window.__bt.focus(),verb=a.focus().focused?.verb;a.use(a.focus().focused);return{kind,verb,next:b.rules.next,mene:b.rules.mene,on:b.physics.objects.filter(o=>o.active).length,turn:b.rules.turn,winner:b.rules.last?.team};},[cx,S,C.court.z0+C.B.circle.dz+5.5]);
  check(collect.kind==='boule'&&/samla/.test(collect.verb)&&collect.next==='jack'&&collect.mene===2&&collect.on===0&&(collect.winner===null||collect.turn===collect.winner),'E collects the boules and the next mène starts',collect);
  // 4. the lectern: board buttons through the real focus path
  const stand=()=>page.evaluate(()=>{const a=window.__app,b=a.world.boule,p=b.board.getWorldPosition(a.camera.position.clone());a.player.spawn(p.x-.75,p.z,-Math.PI/2);for(let i=0;i<30;i++)a.player.update(1/60);});
  const press=(which)=>page.evaluate((which)=>{const a=window.__app,b=a.world.boule,p=b.controlPickables.find(q=>q.userData.door.kind===which),w=p.getWorldPosition(p.position.clone());window.__bt.aim(w.x,w.y,w.z);const kind=window.__bt.focus(),verb=a.focus().focused?.verb;if(kind===which)a.use(a.focus().focused);return{kind,verb,next:b.rules.next,mene:b.rules.mene,scores:[...b.rules.scores],msg:b.rules.message};},which);
  await page.evaluate(()=>{const b=window.__app.world.boule;b.rules.scores=[7,5];b.rules.mene=6;b.dirty=true;});
  await stand();await page.evaluate(()=>{const a=window.__app,b=a.world.boule,p=b.board.getWorldPosition(a.camera.position.clone());window.__bt.aim(p.x,p.y,p.z);window.__bt.render();});await page.screenshot({path:shots+'/3-scoreboard.png'});
  const mene=await press('bouleMene');check(mene.kind==='bouleMene'&&mene.next==='jack'&&mene.scores.join()==='7,5'&&mene.mene===6,'"Ny omgång" on the board restarts the mène and keeps the score',mene);
  const blockedWalk=await page.evaluate(()=>{const a=window.__app,b=a.world.boule,D=b.segments.flat();const x0=Math.min(D[0],D[2],D[4],D[6]),z=(Math.min(D[1],D[5])+Math.max(D[1],D[5]))/2;a.player.spawn(x0-.8,z,-Math.PI/2);a.camera.rotation.set(0,-Math.PI/2,0);a.player.keys=new Set(['KeyW']);for(let i=0;i<120;i++)a.player.update(1/60);a.player.keys=new Set();return{x:a.player.pos.x,edge:x0};});
  check(blockedWalk.x<blockedWalk.edge,'the lectern blocks walking through it',blockedWalk);
  await stand();const game=await press('bouleGame');check(game.kind==='bouleGame'&&game.scores.join()==='0,0'&&game.mene===1&&game.next==='jack','"Nytt parti" resets the game to 0–0',game);
  // 5. game over blocks throws until a new game
  const over=await page.evaluate(([x,S,z])=>{const a=window.__app,b=a.world.boule;b.rules.scores=[13,9];b.rules.over=true;b.rules.winner=0;b.rules.phase='over';b.dirty=true;window.__bt.circle();window.__bt.aim(x,S,z);window.__bt.focus();a.use(a.focus().focused);return{flight:!!b.flight,next:b.rules.next};},[cx,S,C.court.z0+C.B.circle.dz+5]);
  check(!over.flight&&over.next===null,'a finished game blocks throws',over);
  await stand();await page.evaluate(()=>{const a=window.__app,b=a.world.boule,p=b.board.getWorldPosition(a.camera.position.clone());window.__bt.aim(p.x,p.y,p.z);window.__bt.render();});await page.screenshot({path:shots+'/4-scoreboard-over.png'});
  await press('bouleGame');
  // 6. outside the circle: refused; far away: hidden and frozen; draw calls of the group
  const away=await page.evaluate(([x,S,z])=>{const a=window.__app,b=a.world.boule;a.player.spawn(b.circle.x,b.circle.z+3,Math.PI);for(let i=0;i<20;i++)a.player.update(1/60);window.__bt.aim(x,S,z);window.__bt.focus();a.use(a.focus().focused);const refused=!b.flight;
   const draws=b.object.children.filter(o=>o.isMesh&&o.material.visible!==false).length+b.face.children.filter(o=>o.isMesh&&o.material.visible!==false).length;
   b.physics.land(b.physics.jack,b.circle.x,b.circle.z+3,0,1);a.player.spawn(5,30,0);for(let i=0;i<5;i++)a.player.update(1/60);const z0=b.physics.jack.z;window.__bt.quiet(30);return{refused,draws,visible:b.object.visible,frozen:b.physics.jack.z===z0,lights:b.object.getObjectsByProperty('isLight',true).length};},[cx,S,C.court.z0+C.B.circle.dz+5]);
  check(away.refused&&away.draws===3&&!away.visible&&away.frozen&&away.lights===0,'outside the circle refused; three draws, no lights; hidden and frozen far away',away);
 }
 check(errors.length===0,'no page or shader errors',errors);
}finally{await browser.close();}console.log(failed?`${failed} FAILED`:'ALL PASSED');process.exit(failed?1:0);})();
