// #2237: the NES adapter on a real computer. MODE desktop: the picker on Speldatorn, nothing NES-related fetched before Starta and
// only same-origin files after it, keyboard input moving the ROM's sprite, the monitor texture showing the NES picture, the
// in-game frame cost, a hidden-tab pause and Esc freeing the instance. MODE phone: the NES touch pad on a phone-sized touch page.
// node tools/nestest.cjs GAME LOCAL_WORKER OUT desktop|phone   (through tools/browsertest.sh, with node cloudflare/dev.mjs PORT)
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out,mode='desktop']=process.argv.slice(2),log=(s,v)=>console.log('PASS',s,v?JSON.stringify(v):'');
const ID=mode==='phone'?'pc-lime':'pc-home';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch();const errors=[],requests=[];let page;
 try{
  const phone=mode==='phone';
  const p=page=await browser.newPage({viewport:phone?{width:844,height:390}:{width:1100,height:800},isMobile:phone,hasTouch:phone,deviceScaleFactor:phone?2:1});
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push({url:r.url(),at:Date.now()}));
  await p.addInitScript(n=>{localStorage.setItem('lunden.name',n);sessionStorage.setItem('lunden.nameSkipped','1');},phone?'Mobilprov':'Spelprov');
  const t0=Date.now();await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});
  await p.waitForFunction(()=>window.__app?.computerHub,null,{timeout:240000});log('app loaded',{s:Math.round((Date.now()-t0)/1000)});
  await p.evaluate(m=>{__app.showOverlay(false);if(m){__app.touch.enabled=true;document.body.classList.add('touch');}},phone);
  // stand in front of the monitor (as tools/computergamestest.cjs), power it on and take control
  await p.evaluate(async id=>{const a=__app,C=await import('/src/config.js'),s=a.computerHub.sessions.get(id);if(s.info.clubhouse&&!a.player.inPlayroom){a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.use({kind:'playhouse'});}},ID);
  await p.waitForFunction(id=>!!__app.computerHub.sessions.get(id).info.clubhouse===!!__app.player.inPlayroom,ID);await p.waitForTimeout(700);
  await p.evaluate(async id=>{const a=__app,T=await import('three'),C=await import('/src/config.js'),s=a.computerHub.sessions.get(id);const m=s.target.mesh;m.updateWorldMatrix(true,false);const center=m.getWorldPosition(new T.Vector3()),front=new T.Vector3(0,0,1).transformDirection(m.matrixWorld),pos=center.clone().addScaledVector(front,.95);a.player.spawn(pos.x,pos.z,0);a.player.pos.y=s.info.clubhouse?0:C.LEVELS[1].floor;a.player.eyeY=a.player.pos.y+(s.info.clubhouse?1.4:1.62);for(let i=0;i<4;i++)a.step(1/60);a.camera.position.set(a.player.pos.x,a.player.eyeY,a.player.pos.z);a.camera.lookAt(center);a.camera.updateMatrixWorld(true);a.step(0);a.step(0);},ID);
  await p.waitForFunction(id=>__ghosts.connected&&!!__app.computerHub.sessions.get(id).player.state,ID,{timeout:30000});await p.waitForTimeout(600);
  await p.evaluate(id=>{const s=__app.computerHub.sessions.get(id);if(!s.target.isOpen)__app.computerHub.show(s.target);},ID);await p.waitForFunction(id=>__app.computerHub.sessions.get(id).target.isOpen,ID);
  await p.evaluate(id=>__app.computerHub.show(__app.computerHub.sessions.get(id).target),ID);await p.waitForFunction(id=>__app.computerHub.sessions.get(id).player.owns,ID);
  const g=()=>p.evaluate(id=>{const h=__app.computerHub,s=h.sessions.get(id),x=s.run?.app==='nes'?s.run.game:null;return x?{phase:x.phase,frames:x.frames,nes:!!x.nes,ram:x.nes?Array.from(x.nes.cpu.mem.slice(0,4)):null,inWorld:!!s.inWorld,open:h.open}:null;},ID);
  const shot=async name=>{await p.evaluate(()=>{__app.testMode.setFull(true);__app.step(0);__app.testMode.draw();});await p.screenshot({path:`${out}/${name}.png`,timeout:240000});await p.evaluate(()=>__app.testMode.setFull(false));};
  const nesReq=()=>requests.filter(r=>/jsnes\.js|\.nes(\?|$)/.test(r.url));
  assert.deepEqual(nesReq(),[],'no emulator or ROM request before an NES game starts');
  const tap=sel=>phone?p.locator(sel).tap():p.locator(sel).click();
  if(!phone){await p.screenshot({path:`${out}/meny.png`});log('menu with the NES choice');}
  await tap(`#computer-${ID} [data-app=nes]`);await p.waitForFunction(id=>__app.computerHub.sessions.get(id).inWorld,ID);
  assert.deepEqual(nesReq(),[],'choosing NES alone loads nothing');
  assert(await p.locator(`#computer-${ID} .computer-license`).isVisible(),'licence notice in the computer');
  assert.equal(await p.locator(`#computer-${ID} .computer-arcade .computer-top`).isVisible(),false,'no top list for NES');
  const started=Date.now();
  if(phone)await tap(`#computer-${ID} [data-arcade=start]`);else await p.keyboard.press('Space');
  await p.waitForFunction(id=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get(id))?.phase==='running',ID,{timeout:30000});
  const origin=new URL(game).origin,after=requests.filter(r=>r.at>=started-50),foreign=after.filter(r=>!r.url.startsWith(origin)&&!r.url.startsWith(worker)&&!r.url.startsWith('data:')&&!r.url.startsWith('blob:'));
  const loaded=nesReq().map(r=>r.url);assert.equal(loaded.length,2,JSON.stringify(loaded));assert(loaded.every(u=>u.startsWith(origin+'/src/')),JSON.stringify(loaded));
  assert.deepEqual(foreign.map(r=>r.url),[],'only same-origin (and the local Worker) after Starta');
  log('lazy same-origin load',{loaded,ms:Date.now()-started});
  await p.waitForTimeout(300);const before=(await g()).ram[0];
  if(phone){
   for(const [pad,ms] of [['right',700],['a',150]]){const sel=`#computer-${ID} [data-pad=${pad}]`;assert(await p.locator(sel).isVisible(),pad);await p.dispatchEvent(sel,'pointerdown',{pointerType:'touch'});await p.waitForTimeout(ms);if(pad==='right')await shot('pekknappar');await p.dispatchEvent(sel,'pointerup',{pointerType:'touch'});}
   const pads=await p.evaluate(id=>[...document.querySelectorAll(`#computer-${id} [data-pad-app=nes]`)].map(b=>[b.dataset.pad,b.getBoundingClientRect().width|0,b.getBoundingClientRect().height|0,!b.hidden]),ID);
   const after=(await g()).ram[0];assert.notEqual(after,before,'the touch D-pad moved the sprite');assert(pads.every(([, w,h,v])=>v&&w>=44&&h>=44),JSON.stringify(pads));
   assert.equal(await p.evaluate(id=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get(id)).held.size,ID),0,'released on pointerup');
   log('NES touch pad',{x:[before,after],pads});
  }else{
   await p.keyboard.down('ArrowRight');await p.waitForTimeout(700);await p.keyboard.up('ArrowRight');
   const moved=(await g()).ram[0];assert.notEqual(moved,before,'the keyboard D-pad moved the sprite');
   await p.keyboard.down('ArrowDown');await p.waitForTimeout(500);await p.keyboard.up('ArrowDown');
   log('keyboard',{x:[before,moved],ram:(await g()).ram});
   await p.waitForTimeout(2500);
   const stats=await p.evaluate(id=>{const h=__app.computerHub,x=h.arcadeGame(h.sessions.get(id));return {...x.stats(),gpu:__app.renderer.info.render.calls};},ID);
   assert(stats.samples>60&&stats.draws>10,JSON.stringify(stats));log('in-game frame cost (ms)',stats);
   const tex=await p.evaluate(id=>{const s=__app.computerHub.sessions.get(id),d=s.poster.getContext('2d').getImageData(0,0,s.poster.width,s.poster.height).data;let red=0,yellow=0;for(let i=0;i<d.length;i+=4){if(d[i]>180&&d[i+1]<90&&d[i+2]<90)red++;if(d[i]>180&&d[i+1]>150&&d[i+2]<90)yellow++;}return{physical:s.target.mesh.material===s.material,red,yellow,url:s.poster.toDataURL('image/png')};},ID);
   assert(tex.physical&&tex.red>0&&tex.yellow>0,`monitor shows the NES sprites ${tex.red}/${tex.yellow}`);fs.writeFileSync(`${out}/spel-textur.png`,Buffer.from(tex.url.split(',')[1],'base64'));
   await shot('spel');
   // a lost window focus pauses (and holds nothing); Space resumes; P pauses/resumes; Esc leaves and frees the instance
   await p.keyboard.down('ArrowLeft');await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.keyboard.up('ArrowLeft');
   const paused=await g();await p.waitForTimeout(500);const still=await g();assert.equal(paused.phase,'paused');assert.equal(still.frames,paused.frames,'no frames while paused');
   assert.equal(await p.evaluate(id=>__app.computerHub.sessions.get(id).run.game.held.size,ID),0,'pause let go of the held button');
   await p.keyboard.press('Space');await p.waitForFunction(id=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get(id)).phase==='running',ID);
   await p.keyboard.press('KeyP');assert.equal((await g()).phase,'paused');await p.keyboard.press('KeyP');assert.equal((await g()).phase,'running');
   log('blur and P pause, resume by the player',{frames:still.frames});
   await p.keyboard.press('Escape');await p.waitForFunction(()=>!__app.computerHub.open);
   const left=await g();assert.equal(left.nes,false,'Esc freed the emulator instance');assert.equal(left.phase,'over');
   const f=left.frames;await p.waitForTimeout(400);assert.equal((await g()).frames,f,'nothing emulated after leaving');
   log('Esc frees the instance',left);
   // back to the computer (still on NES), start again, then hide the tab: the computer is left (CinemaPlayer) and the instance freed
   await p.evaluate(id=>__app.computerHub.show(__app.computerHub.sessions.get(id).target),ID);await p.waitForFunction(id=>__app.computerHub.sessions.get(id).inWorld,ID);
   await p.keyboard.press('Space');await p.waitForFunction(id=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get(id))?.phase==='running',ID);
   assert.equal(nesReq().filter(r=>/jsnes\.js/.test(r.url)).length,1,'the engine script is not fetched again');
   await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
   const hid=await g();await p.waitForTimeout(400);assert.equal(hid.nes,false,'hidden tab freed the instance');assert.equal((await g()).frames,hid.frames);
   log('hidden tab leaves the computer and frees the instance',hid);
   fs.writeFileSync(`${out}/result-desktop.json`,JSON.stringify({stats,loaded,errors},null,2));
  }
  assert.deepEqual(errors,[]);
 }finally{try{await page?.evaluate(()=>__ghosts.disconnect());}catch{}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
