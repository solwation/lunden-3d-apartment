// #2257: two real clients in the lounge share the TV's ordinary channel and on/off. GAME WORKER OUT; use a fresh local Worker (cloudflare/dev.mjs).
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out]=process.argv.slice(2);
const log=(s,v)=>console.log('PASS',s,v?JSON.stringify(v):'');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const errors=[];
 try{
  const make=async name=>{const p=await browser.newPage({viewport:{width:900,height:600}});p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(n=>{localStorage.setItem('lunden.name',n);sessionStorage.setItem('lunden.nameSkipped','1');},name);await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});await p.waitForFunction(()=>window.__app?.tvMedia,null,{timeout:180000});await p.evaluate(()=>__app.showOverlay(false));return p;};
  const [A,B]=[await make('Anna'),await make('Bo')];
  const pose=async(p,dx)=>{await p.evaluate(async dx=>{const a=__app,T=await import('three'),s=a.tvMedia.sessions.get('lounge'),m=s.target.mesh;m.updateWorldMatrix(true,false);const center=m.getWorldPosition(new T.Vector3()),front=new T.Vector3(0,0,1).transformDirection(m.matrixWorld),pos=center.clone().addScaledVector(front,2.2).add(new T.Vector3(dx,0,0));a.player.spawn(pos.x,pos.z,0);a.player.pos.y=0;a.player.eyeY=1.62;a.camera.position.set(pos.x,1.62,pos.z);a.camera.lookAt(center);a.camera.updateMatrixWorld(true);a.scene.updateMatrixWorld(true);a.step(0);a.step(0);a.testMode.draw();},dx);await p.waitForFunction(()=>__ghosts.connected&&!!__app.tvMedia.sessions.get('lounge').player.state,null,{timeout:60000});};
  await pose(A,-.3);await pose(B,.3);
  const tv=p=>p.evaluate(()=>{const t=__app.tvMedia.sessions.get('lounge').target;return{on:!!t.isOpen,ch:t.screen.channel};});
  const same=async()=>{await A.waitForFunction(()=>1);const [a,b]=[await tv(A),await tv(B)];assert.deepEqual(a,b);return a;};
  const wait=(p,f,arg)=>p.waitForFunction(f,arg,{timeout:20000});
  const shot=async name=>{await Promise.all([A,B].map(p=>p.evaluate(()=>__app.testMode.draw())));await A.screenshot({path:`${out}/${name}-A.png`});await B.screenshot({path:`${out}/${name}-B.png`});};
  assert.equal((await tv(A)).on,false);assert.equal((await tv(B)).on,false);
  // 1. Anna switches the TV on through the shared session; nobody controlled it, so she claims, sends and releases.
  assert.equal(await A.evaluate(()=>__app.tvMedia.switchTv(__app.tvMedia.sessions.get('lounge').target,'toggle')),true);
  await Promise.all([A,B].map(p=>wait(p,()=>__app.tvMedia.sessions.get('lounge').target.isOpen)));
  const on=await same();log('both clients see the TV switched on, same channel',on);await shot('1-on');
  // 2. Bo changes the channel (free again) and Anna follows.
  assert.equal(await B.evaluate(()=>__app.tvMedia.switchTv(__app.tvMedia.sessions.get('lounge').target,'channel')),true);
  await Promise.all([A,B].map(p=>wait(p,ch=>__app.tvMedia.sessions.get('lounge').target.screen.channel!==ch,on.ch)));
  const next=await same();assert.notEqual(next.ch,on.ch);log('a channel change by the other client reaches both',next);await shot('2-channel');
  // 3. Anna holds control (chooser open); Bo's switch is refused with a notice and nothing changes.
  await A.evaluate(()=>__app.tvMedia.show(__app.tvMedia.sessions.get('lounge').target));await wait(A,()=>__app.tvMedia.sessions.get('lounge').player.owns);await wait(B,()=>__app.tvMedia.sessions.get('lounge').player.state?.owner);
  assert.equal(await B.evaluate(()=>__app.tvMedia.switchTv(__app.tvMedia.sessions.get('lounge').target,'toggle')),true);await B.waitForTimeout(800);assert.deepEqual(await tv(B),next);
  // 4. Anna presses "Vanliga TV-kanaler" in her chooser: the next channel for both, control released.
  await A.locator('#tv-player-lounge [data-tv-channels]').click();
  await Promise.all([A,B].map(p=>wait(p,ch=>__app.tvMedia.sessions.get('lounge').target.screen.channel!==ch,next.ch)));
  const viaButton=await same();log('while one client controls, the other cannot switch; the chooser button shares a new channel',viaButton);await shot('3-button');
  // 5. Off for both; a late joiner sees the shared off/on state at once.
  await wait(A,()=>!__app.tvMedia.sessions.get('lounge').player.state?.owner);
  assert.equal(await A.evaluate(()=>__app.tvMedia.switchTv(__app.tvMedia.sessions.get('lounge').target,'toggle')),true);
  await Promise.all([A,B].map(p=>wait(p,()=>!__app.tvMedia.sessions.get('lounge').target.isOpen)));log('both clients see the TV switched off',await same());await shot('4-off');
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({on,next,viaButton,errors},null,2));log('no page exceptions');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
