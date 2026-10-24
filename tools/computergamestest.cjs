// #1577: Klossar, Meteoriter and Ormstriden from the app picker on real computers: each draws on the physical monitor
// texture and a finished round lands in the game's top list (local Worker). GAME FRESH_LOCAL_WORKER OUT
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out]=process.argv.slice(2),log=(s,v)=>console.log('PASS',s,v?JSON.stringify(v):'');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch();const errors=[],pages=[];
 try{
  const make=async(mobile)=>{const p=await browser.newPage({viewport:mobile?{width:844,height:600}:{width:1100,height:800},isMobile:mobile,hasTouch:mobile});pages.push(p);await p.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>{const f=require('node:path').join(process.env.HOME,'.cache/three-0.170.0',r.request().url().split('three@0.170.0/')[1]);return fs.existsSync(f)?r.fulfill({path:f,contentType:'application/javascript'}):r.continue();}); // offline sandboxes: a cached three.js
  p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(n=>{localStorage.setItem('lunden.name',n);sessionStorage.setItem('lunden.nameSkipped','1');},mobile?'Mobilprov':'Spelprov');await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});await p.waitForFunction(()=>window.__app?.computerHub,null,{timeout:180000});await p.evaluate(m=>{__app.showOverlay(false);if(m){__app.touch.enabled=true;document.body.classList.add('touch');}},mobile);return p;};
  const pose=async(p,id)=>{await p.evaluate(async id=>{const a=__app,C=await import('/src/config.js'),s=a.computerHub.sessions.get(id);if(s.info.clubhouse&&!a.player.inPlayroom){a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.use({kind:'playhouse'});}},id);await p.waitForFunction(id=>!!__app.computerHub.sessions.get(id).info.clubhouse===!!__app.player.inPlayroom,id);await p.waitForTimeout(700);
   await p.evaluate(async id=>{const a=__app,T=await import('three'),C=await import('/src/config.js'),s=a.computerHub.sessions.get(id);const m=s.target.mesh;m.updateWorldMatrix(true,false);const center=m.getWorldPosition(new T.Vector3()),front=new T.Vector3(0,0,1).transformDirection(m.matrixWorld),pos=center.clone().addScaledVector(front,.95);a.player.spawn(pos.x,pos.z,0);a.player.pos.y=s.info.clubhouse?0:C.LEVELS[1].floor;a.player.eyeY=a.player.pos.y+(s.info.clubhouse?1.4:1.62);for(let i=0;i<4;i++)a.step(1/60);a.camera.position.set(a.player.pos.x,a.player.eyeY,a.player.pos.z);a.camera.lookAt(center);a.camera.updateMatrixWorld(true);a.step(0);a.step(0);},id);
   await p.waitForFunction(id=>__ghosts.connected&&!!__app.computerHub.sessions.get(id).player.state,id,{timeout:30000});await p.waitForTimeout(600);
   await p.evaluate(id=>{const s=__app.computerHub.sessions.get(id);if(!s.target.isOpen)__app.computerHub.show(s.target);},id);await p.waitForFunction(id=>__app.computerHub.sessions.get(id).target.isOpen,id);
   await p.evaluate(id=>__app.computerHub.show(__app.computerHub.sessions.get(id).target),id);await p.waitForFunction(id=>__app.computerHub.sessions.get(id).player.owns,id);};
  const screen=async(p,id,name)=>{ // the physical monitor shows the game texture; save the canvas and a framed view
   const info=await p.evaluate(id=>{const s=__app.computerHub.sessions.get(id),c=s.poster.getContext('2d').getImageData(0,0,s.poster.width,s.poster.height).data,colors=new Set();for(let i=0;i<c.length;i+=4*97)colors.add(c[i]<<16|c[i+1]<<8|c[i+2]);return{physical:s.target.mesh.material===s.material,colors:colors.size,url:s.poster.toDataURL('image/png')};},id);
   assert(info.physical,`${id}: monitor uses the game texture`);assert(info.colors>8,`${id}: drawn content`);
   fs.writeFileSync(`${out}/${name}-texture.png`,Buffer.from(info.url.split(',')[1],'base64'));
   await p.evaluate(()=>{__app.testMode.setFull(true);__app.step(0);__app.testMode.draw();});await p.screenshot({path:`${out}/${name}.png`,timeout:240000});await p.evaluate(()=>__app.testMode.setFull(false));
  };
  const top=(p,id,sel)=>p.evaluate(([id,sel])=>[...document.querySelectorAll(`#computer-${id} ${sel} .computer-top li`)].map(l=>l.textContent),[id,sel]);
  const A=await make(false);log('desktop app loaded');
  // Klossar on the home gaming PC, keyboard only.
  await pose(A,'pc-home');const initial=await A.evaluate(()=>__app.player.pos.toArray());
  await A.locator('#computer-pc-home [data-app=blocks]').click();await A.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').inWorld);
  assert(!await A.evaluate(()=>document.getElementById('computer-pc-home').matches(':modal')));
  await A.keyboard.press('Space');await A.waitForFunction(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-home'))?.running);
  for(const k of ['ArrowLeft','ArrowLeft','ArrowUp','ArrowDown','ArrowDown'])await A.keyboard.press(k);
  await A.waitForTimeout(2600);await screen(A,'pc-home','klossar');
  for(let i=0;i<60&&await A.evaluate(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-home'))?.running);i++){await A.keyboard.press(i%3?'Space':'ArrowRight');}
  const kl=await A.evaluate(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-home')).result());assert(kl.score>0&&kl.ms>=2000,JSON.stringify(kl));
  assert.deepEqual(await A.evaluate(()=>__app.player.pos.toArray()),initial,'the avatar did not move');
  await A.waitForFunction(()=>[...document.querySelectorAll('#computer-pc-home .computer-arcade .computer-top li')].some(l=>/^Spelprov: \d+/.test(l.textContent)));
  const serverK=await (await fetch(`${worker}/games/klossar`,{headers:{Origin:'http://localhost'}})).json();assert.equal(serverK[0].name,'Spelprov');assert.equal(serverK[0].score,kl.score);
  await A.waitForTimeout(200);await screen(A,'pc-home','klossar-topplista');log('Klossar: keyboard, physical screen, result in the global list',{kl,list:await top(A,'pc-home','.computer-arcade')});
  // Ormstriden on the same computer: the server's score after the snake hits a wall.
  await A.locator('#computer-pc-home [data-app=snake]').click();await A.locator('#computer-pc-home [data-snake=join]').click();
  await A.waitForFunction(()=>__app.computerHub.arena?.snakes.some(s=>s.id===__ghosts.me&&s.alive));
  await A.evaluate(()=>{window.orbit=setInterval(()=>{const h=__app.computerHub,s=h.arena?.snakes.find(s=>s.id===__ghosts.me&&s.alive);if(s?.points[0]){const angle=Math.atan2(10-s.points[0][1],16-s.points[0][0])+1.2;h.angle=Math.atan2(Math.sin(angle),Math.cos(angle));}},100);});
  await A.waitForFunction(()=>__app.computerHub.arena?.snakes.find(s=>s.id===__ghosts.me)?.score>=3,null,{timeout:60000});
  await A.evaluate(()=>{clearInterval(window.orbit);__app.computerHub.angle=0;});
  await A.waitForFunction(()=>__app.computerHub.arena?.snakes.some(s=>s.id===__ghosts.me&&!s.alive),null,{timeout:30000});
  await A.waitForFunction(()=>[...document.querySelectorAll('#computer-pc-home .computer-game:not(.computer-arcade) .computer-top li')].some(l=>/^Spelprov: \d+/.test(l.textContent)),null,{timeout:20000});
  await A.waitForTimeout(300);await screen(A,'pc-home','ormstriden-topplista');log('Ormstriden: server-scored round in the global list',await top(A,'pc-home','.computer-game:not(.computer-arcade)'));
  await A.keyboard.press('Escape');await A.waitForFunction(()=>!__app.computerHub.open);
  // Meteoriter on a playhouse computer with touch buttons; a second (watching) client sees the "spelar" card.
  const B=await make(true);log('touch app loaded');await pose(B,'pc-lime');
  await B.locator('#computer-pc-lime [data-app=meteors]').tap();await B.waitForFunction(()=>__app.computerHub.sessions.get('pc-lime').inWorld);
  await B.locator('#computer-pc-lime [data-arcade=start]').tap();await B.waitForFunction(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-lime'))?.running);
  const fire=B.locator('#computer-pc-lime [data-pad=fire]'),box=await fire.boundingBox();
  await B.locator('#computer-pc-lime [data-pad=thrust]').tap();
  // hold fire with a real touch-pointer press while turning
  await B.evaluate(()=>{const g=__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-lime'));const r=g.rocks[0];g.rocks=[r];r.x=g.ship.x+4;r.y=g.ship.y;r.vx=r.vy=0;g.ship.a=0;});
  await B.dispatchEvent('#computer-pc-lime [data-pad=fire]','pointerdown',{pointerType:'touch'});
  await B.waitForFunction(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-lime')).score>0,null,{timeout:10000});
  await B.waitForTimeout(400);await screen(B,'pc-lime','meteoriter');
  await B.dispatchEvent('#computer-pc-lime [data-pad=fire]','pointerup',{pointerType:'touch'});
  assert.equal(await B.evaluate(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-lime')).input.fire),false);
  await B.waitForTimeout(2200); // a real round length before the end
  await B.evaluate(()=>{const g=__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-lime'));g.lives=1;g.ship.safeUntil=0;g.rocks.push(g.rock(2,g.ship.x,g.ship.y,0,0));});
  await B.waitForFunction(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-lime')).over);
  await B.waitForFunction(()=>[...document.querySelectorAll('#computer-pc-lime .computer-arcade .computer-top li')].some(l=>/^Mobilprov: \d+/.test(l.textContent)),null,{timeout:20000});
  await B.waitForTimeout(300);await screen(B,'pc-lime','meteoriter-topplista');log('Meteoriter: touch buttons, physical screen, result in the global list',await top(B,'pc-lime','.computer-arcade'));
  // Offline/failed Worker: the round still finishes and stays in the local list without hanging.
  await B.route('**/games/**',r=>r.abort());await B.locator('#computer-pc-lime [data-arcade=start]').tap();
  await B.waitForTimeout(2200);await B.evaluate(()=>{const g=__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-lime'));g.score=40;g.lives=1;g.ship.safeUntil=0;g.rocks.push(g.rock(2,g.ship.x,g.ship.y,0,0));});
  await B.waitForFunction(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-lime')).over);
  const local=await B.evaluate(()=>JSON.parse(localStorage.getItem('lunden.gameBest.meteoriter')));assert(local.length>=2,'local best list kept');
  assert(await B.locator('#computer-pc-lime [data-arcade=start]').isEnabled());log('failed Worker: local list kept, Spela igen available',local);
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({klossar:kl,errors},null,2));
 }finally{for(const p of pages)try{await p.evaluate(()=>__ghosts.disconnect());}catch{}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
