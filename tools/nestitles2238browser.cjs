// #2238: each manifest title starts on a real computer and reacts to input. node tools/nestitles2238browser.cjs GAME LOCAL_WORKER OUT
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
  const {NES_TITLES}=await p.evaluate(()=>import('/src/nestitles.js').then(m=>({NES_TITLES:m.NES_TITLES.map(t=>({id:t.id,title:t.title}))})));
  await p.locator(`#computer-${ID} [data-app=nes]`).click();await p.waitForFunction(id=>__app.computerHub.sessions.get(id).inWorld,ID);
  assert(await p.locator(`#computer-${ID} .computer-nes-titles`).isVisible(),'title picker shown with several titles');
  const tex=()=>p.evaluate(id=>{const s=__app.computerHub.sessions.get(id),c=s.poster,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=0,lit=0;for(let i=0;i<d.length;i+=4){h=(Math.imul(h,31)+d[i]+d[i+1]*7+d[i+2]*13)>>>0;if(d[i]+d[i+1]+d[i+2]>90)lit++;}return{h,lit,url:c.toDataURL('image/png')};},ID);
  const hold=async(k,ms=150)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);};
  const result=[],START={lightcatch:0,thwaite:3,'lan-master':1,'lawn-mower':1};
  for(const t of NES_TITLES){
   await p.locator(`#computer-${ID} [data-nes-title=${t.id}]`).click();
   await p.waitForFunction(([id,tid])=>__app.computerHub.sessions.get(id).run?.game.title===tid,[ID,t.id]);
   await p.keyboard.press('Space');
   await p.waitForFunction(id=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get(id))?.phase==='running',ID,{timeout:60000});
   await p.waitForTimeout(2500);const title=await tex();
   // into actual play: Start presses per title found by stepping the ROM in jsnes (Thwaite: legal, title, intro; Shiru's: title only;
   // a further Start pauses), then the D-pad and A must change the picture
   for(let i=0;i<START[t.id];i++){await hold('Enter');await p.waitForTimeout(2500);}
   const before=await tex();
   await p.keyboard.down('ArrowRight');await p.waitForTimeout(800);await p.keyboard.up('ArrowRight');
   await p.keyboard.down('ArrowUp');await p.waitForTimeout(600);await p.keyboard.up('ArrowUp');
   await hold('KeyX');await p.waitForTimeout(1200);
   const after=await tex(),st=await g();
   assert(st.nes&&st.frames>120,`${t.id} runs ${JSON.stringify(st)}`);assert(title.lit>0||after.lit>0,`${t.id} draws a picture`);
   assert.notEqual(before.h,after.h,`${t.id} picture changes after input`);
   fs.writeFileSync(`${out}/${t.id}-title.png`,Buffer.from(title.url.split(',')[1],'base64'));fs.writeFileSync(`${out}/${t.id}.png`,Buffer.from(after.url.split(',')[1],'base64'));
   if(t.id==='thwaite')await shot('dator-thwaite');
   result.push({id:t.id,frames:st.frames,lit:after.lit});log(`${t.title} starts, draws and reacts to input`,{frames:st.frames});
  }
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!__app.computerHub.open);
  fs.writeFileSync(`${out}/result.json`,JSON.stringify({result,errors},null,2));
  assert.deepEqual(errors,[]);
 }finally{try{await page?.evaluate(()=>__ghosts.disconnect());}catch{}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
