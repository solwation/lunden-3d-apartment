// #2241: two actual apps against a fresh local Worker. A plays Klossar on the home gaming PC; B stands beside it and sees the same
// board, piece and score on the same monitor (the controller's snapshots, drawn with drawBlocks). Measures the bytes per second B
// receives, checks B's draw calls do not change, that B cannot control, that leaving stops the pictures, and a film on the
// computer and on the lounge TV seen by both. Side-by-side JPEGs in OUT. GAME FRESH_LOCAL_WORKER OUT
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [game,worker,out]=process.argv.slice(2),log=(s,v)=>console.log('PASS',s,v?JSON.stringify(v):'');
const VIDEO='aqz-KE-bpKQ';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});const errors=[],pages=[],result={};
 try{
  const make=async(name)=>{const p=await browser.newPage({viewport:{width:720,height:480}});pages.push(p);const wf=p.waitForFunction.bind(p);p.waitForFunction=(fn,arg,opts={})=>wf(fn,arg,{polling:100,...opts}); // (timer polling: a page not in front gets no animation frames)
   await p.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>{const f=path.join(process.env.HOME,'.cache/three-0.170.0',r.request().url().split('three@0.170.0/')[1]);return fs.existsSync(f)?r.fulfill({path:f,contentType:'application/javascript'}):r.continue();});
   p.on('pageerror',e=>errors.push(`${name}: ${e.message}`));await p.addInitScript(n=>{localStorage.setItem('lunden.name',n);sessionStorage.setItem('lunden.nameSkipped','1');},name);
   await p.goto(`${game}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});await p.waitForFunction(()=>window.__app?.computerHub,null,{timeout:180000});
   // Headless Chromium stalls the animation frames of the page that is not in front; then a timer steps the world (game, sockets' consumers, monitor drawing).
   await p.evaluate(()=>{__app.showOverlay(false);let last=performance.now();const f=()=>{last=performance.now();requestAnimationFrame(f);};requestAnimationFrame(f);window.pump=setInterval(()=>{if(performance.now()-last>200)__app.step(1/20);},50);});return p;};
  // Stand `back` m in front of the computer's monitor and `side` m to its side, looking at it.
  const pose=async(p,id,back,side)=>{await p.evaluate(async([id,back,side])=>{const a=__app,T=await import('three'),C=await import('/src/config.js'),s=a.computerHub.sessions.get(id);a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:175});
    const m=s.target.mesh;m.updateWorldMatrix(true,false);const center=m.getWorldPosition(new T.Vector3()),front=new T.Vector3(0,0,1).transformDirection(m.matrixWorld),right=new T.Vector3(1,0,0).transformDirection(m.matrixWorld),pos=center.clone().addScaledVector(front,back).addScaledVector(right,side);
    a.player.spawn(pos.x,pos.z,0);a.player.pos.y=C.LEVELS[1].floor;a.player.eyeY=a.player.pos.y+1.62;for(let i=0;i<4;i++)a.step(1/60);a.camera.position.set(a.player.pos.x,a.player.eyeY,a.player.pos.z);a.camera.lookAt(center);a.camera.updateMatrixWorld(true);a.scene.updateMatrixWorld(true);a.step(0);a.step(0);},[id,back,side]);
   await p.waitForFunction(id=>__ghosts.connected&&!!__app.computerHub.sessions.get(id).player.state,id,{timeout:30000});};
  const look=(p,target)=>p.evaluate(async t=>{const a=__app,T=await import('three');const m=t==='tv'?a.tvMedia.sessions.get('lounge').target.mesh:a.computerHub.sessions.get(t).target.mesh;m.updateWorldMatrix(true,false);a.camera.lookAt(m.getWorldPosition(new T.Vector3()));a.camera.updateMatrixWorld(true);a.step(0);},target);
  const shot=async p=>{await p.evaluate(()=>{__app.step(0);__app.testMode.draw();});return 'data:image/jpeg;base64,'+(await p.screenshot({type:'jpeg',quality:82,timeout:240000})).toString('base64');};
  const texture=(p,id)=>p.evaluate(id=>__app.computerHub.sessions.get(id).poster.toDataURL('image/png'),id);
  const compose=async(file,urls,labels,scale=1)=>{const data=await pages[0].evaluate(async([urls,labels,scale])=>{const imgs=await Promise.all(urls.map(u=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=u;})));
    const sc=k=>Array.isArray(scale)?scale[k]:scale,w=imgs.map((i,k)=>Math.round(i.width*sc(k))),h=Math.max(...imgs.map((i,k)=>Math.round(i.height*sc(k)))),c=document.createElement('canvas');c.width=w.reduce((a,b)=>a+b,0)+8*(imgs.length-1);c.height=h+30;const g=c.getContext('2d');g.fillStyle='#1d2330';g.fillRect(0,0,c.width,c.height);
    let x=0;imgs.forEach((i,k)=>{g.drawImage(i,x,30,w[k],Math.round(i.height*sc(k)));g.fillStyle='#fff';g.font='bold 17px sans-serif';g.fillText(labels[k],x+8,21);x+=w[k]+8;});return c.toDataURL('image/jpeg',.82);},[urls,labels,scale]);
   const buf=Buffer.from(data.split(',')[1],'base64');fs.writeFileSync(path.join(out,file),buf);assert(buf.length<=600*1024,`${file} ${buf.length} bytes`);console.log('IMAGE',file,Math.round(buf.length/1024),'KB');};
  const calls=p=>p.evaluate(()=>{const r=__app.renderer;r.info.autoReset=false;r.info.reset();__app.testMode.draw();const n=r.info.render.calls;r.info.autoReset=true;return n;});

  const [A,B]=await Promise.all([make('Spelaren'),make('Åskådaren')]);log('both apps loaded');
  await B.evaluate(()=>{window.arrivals=[];const h=__app.computerHub,r=h.receiveScreen.bind(h);h.receiveScreen=m=>{const ok=r(m);if(ok)window.arrivals.push(performance.now());return ok;};});
  await pose(A,'pc-home',.95,0);await pose(B,'pc-home',1.3,1);
  await A.evaluate(()=>{const s=__app.computerHub.sessions.get('pc-home');if(!s.target.isOpen)__app.computerHub.show(s.target);});await A.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').target.isOpen);
  await B.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').target.isOpen);
  await A.evaluate(()=>__app.computerHub.show(__app.computerHub.sessions.get('pc-home').target));await A.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').player.owns);
  await look(B,'pc-home');
  // A opens Klossar and starts with the real keyboard path; B sees the start screen, then the running game.
  await A.locator('#computer-pc-home [data-app=blocks]').click();await A.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').inWorld);
  await B.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').feed.data?.running===false,null,{timeout:15000});log('B sees the start screen as a snapshot');
  await A.keyboard.press('Space');await A.waitForFunction(()=>__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-home'))?.running);
  await A.evaluate(()=>{const h=__app.computerHub,s=h.sessions.get('pc-home'),acts=['left','right','rotate','soft','left','hard','right','rotate','soft','soft'];let i=0;window.mover=setInterval(()=>h.arcadeInput(s,acts[i++%acts.length],true),350);});
  await B.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').feed.data?.running&&__app.computerHub.sessions.get('pc-home').feed.data.board.flat().some(Boolean),null,{timeout:30000});
  // Same picture: hold A's game still (no moves, no gravity), give the last snapshot time to arrive and compare exactly.
  await A.evaluate(()=>{clearInterval(window.mover);const g=__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-home'));g.step=()=>{};});await A.waitForTimeout(1200);
  const same=await Promise.all([A.evaluate(async()=>{const {encodeBlocks}=await import('/src/screenshare.js');return encodeBlocks(__app.computerHub.arcadeGame(__app.computerHub.sessions.get('pc-home')));}),
   B.evaluate(async()=>{const {encodeBlocks,blocksView}=await import('/src/screenshare.js');return encodeBlocks(blocksView(__app.computerHub.sessions.get('pc-home').feed.data));})]);
  assert.equal(same[1],same[0],'B shows exactly A\'s board, piece, next, score');result.picture=same[0];
  await B.waitForTimeout(300);
  // Draw calls at the same moment: B's monitor with A's picture, then (feed cleared) with the old "spelar" card; the same material object.
  const fps=p=>p.evaluate(()=>new Promise(r=>{let n=0;const t=performance.now(),f=()=>{n++;if(performance.now()-t<1000)requestAnimationFrame(f);else r(n);};requestAnimationFrame(f);}));
  const diag=async()=>console.log('DIAG',JSON.stringify({A:await A.evaluate(()=>{const h=__app.computerHub,s=h.sessions.get('pc-home');return{stats:h.screenStats,shared:s.shared&&{at:Math.round(performance.now()-s.shared.at)},watch:h.net.watchers('pc-home'),owns:s.player.owns,app:s.player.state?.app,hidden:document.hidden,outbox:__ghosts.outbox.map(m=>m.t)};}),fpsA:await fps(A),
   B:await B.evaluate(()=>{const s=__app.computerHub.sessions.get('pc-home'),f=s.feed;const h=__app.computerHub,now=performance.now();return{key:s.menuKey,v:f.version,drawn:s.feedDrawn,age:Math.round(now-f.at),from:f.from,owner:s.player.state?.owner,hidden:document.hidden,inside:s.player.inside,inView:h.inView(s.target.mesh,__app.camera,-2),current:!!f.current(now,s.player.state?.owner,s.player.state?.app),lowMemory:h.lowMemory,feedAt:Math.round(now-(s.feedAt??0)),renderAt:Math.round(now-(s.renderAt??0)),open:s.target.isOpen,pos:__app.player.pos.toArray().map(v=>+v.toFixed(2))};}),fpsB:await fps(B)}));
  const drawnFeed=()=>B.waitForFunction(()=>{const s=__app.computerHub.sessions.get('pc-home');return s.menuKey?.startsWith('feed:')&&s.feedDrawn===s.feed.version;},null,{timeout:20000}).catch(async e=>{await diag();throw e;});
  await A.evaluate(()=>{__app.computerHub.sessions.get('pc-home').shared=null;});await drawnFeed();
  const dc=await B.evaluate(async()=>{const h=__app.computerHub,s=h.sessions.get('pc-home'),r=__app.renderer,{drawArcadeCard}=await import('/src/arcadeview.js');
   const count=()=>{r.info.autoReset=false;r.info.reset();__app.testMode.draw();const n=r.info.render.calls;r.info.autoReset=true;return n;};
   const many=()=>[0,1,2,3,4,5].map(count).sort((a,b)=>a-b).join(','); // (several renders: a held shadow map alternates the count)
   const material=s.target.mesh.material===s.material,key=s.menuKey,feed=many();
   drawArcadeCard(s.poster,'Klossar',s.player.state.name,[],s.info.color);s.texture.needsUpdate=true;const card=many();s.feedDrawn=-1; // (the next update draws the feed again)
   return {material,key,feed,card};});
  console.log('DRAWCALLS',JSON.stringify(dc));assert(dc.material&&dc.key.startsWith('feed:'),'the feed is drawn into the monitor\'s own texture');const mode=l=>{const c={};for(const n of l.split(','))c[n]=(c[n]??0)+1;return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];};assert.equal(mode(dc.feed),mode(dc.card),'no extra draw calls for the onlooker (steady-state renders; an occasional periodic pass, e.g. a shadow refresh, adds the same to both)');result.drawCalls={feed:dc.feed,card:dc.card};
  await drawnFeed();
  const ta=await texture(A,'pc-home'),tb=await B.evaluate(()=>new Promise(r=>{const t=setInterval(()=>{const s=__app.computerHub.sessions.get('pc-home');if(s.menuKey?.startsWith('feed:')&&s.feedDrawn===s.feed.version){clearInterval(t);r(s.poster.toDataURL('image/png'));}},20);})); // (the drawn snapshot itself)
  console.log('ARRIVALS',JSON.stringify(await B.evaluate(()=>{const a=window.arrivals,g=a.slice(1).map((t,i)=>Math.round(t-a[i]));return{n:a.length,maxGap:Math.max(...g),gaps:g.slice(-12)};})));
  const diff=await B.evaluate(([a,b])=>Promise.all([a,b].map(u=>new Promise(r=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);r(g.getImageData(0,0,c.width,c.height).data);};i.src=u;}))).then(([x,y])=>{let d=0;for(let k=0;k<x.length;k+=4)if(Math.abs(x[k]-y[k])+Math.abs(x[k+1]-y[k+1])+Math.abs(x[k+2]-y[k+2])>30)d++;return d/(x.length/4);}),[ta,tb]);
  result.textureDiff=diff;console.log('TEXTURE DIFF',diff);
  await compose('klossar-monitor-a-b.jpg',[ta,tb],['A spelar (sin skärm)','B tittar (samma skärm)']);
  assert(diff<.02,`the two monitor textures are (nearly) identical: ${diff}`);
  const [sa,sb]=[await shot(A),await shot(B)];
  const box=await B.evaluate(async()=>{const T=await import('three'),s=__app.computerHub.sessions.get('pc-home'),m=s.target.mesh,g=m.geometry.parameters,r=__app.renderer.domElement.getBoundingClientRect(),xs=[],ys=[];
   for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=new T.Vector3(u*g.width/2,v*g.height/2,0).applyMatrix4(m.matrixWorld).project(__app.camera);xs.push(r.left+(p.x+1)*r.width/2);ys.push(r.top+(1-p.y)*r.height/2);}
   const pad=6,x=Math.max(0,Math.min(...xs)-pad),y=Math.max(0,Math.min(...ys)-pad);return{x,y,width:Math.min(r.width-x,Math.max(...xs)-x+pad),height:Math.min(r.height-y,Math.max(...ys)-y+pad)};});
  const crop='data:image/jpeg;base64,'+(await B.screenshot({type:'jpeg',quality:90,clip:box})).toString('base64');
  await compose('klossar-world-a-b.jpg',[sa,sb,crop],['A spelar Klossar','B står bredvid','B:s vy av skärmen, förstorad'],[.6,.6,Math.min(4,288/box.height)]);
  log('the same Klossar picture on both monitors',{drawCalls:result.drawCalls});
  // B cannot control without "Ta kontroll".
  const control=await B.evaluate(()=>{const h=__app.computerHub,s=h.sessions.get('pc-home');h.arcadeStart(s);h.arcadeInput(s,'left',true);return{owns:s.player.owns,game:!!h.arcadeGame(s)?.running,nav:[...s.nav.children].every(b=>b.disabled),start:s.arcadeStart.disabled,claim:!s.claim.hidden};});
  assert.deepEqual(control,{owns:false,game:false,nav:true,start:true,claim:true});log('B cannot steer A\'s game or the computer',control);
  // Bandwidth per onlooker while A keeps playing for 10 s (gravity back on, a move every 350 ms).
  await A.evaluate(()=>{const h=__app.computerHub,s=h.sessions.get('pc-home'),g=h.arcadeGame(s);delete g.step;h.screenStats.sent=h.screenStats.sentBytes=0;window.sentBefore=__ghosts.messages;const acts=['left','right','rotate','soft'];let i=0;window.mover=setInterval(()=>{if(!g.running){g.start();}h.arcadeInput(s,acts[i++%acts.length],true);},350);});
  await B.evaluate(()=>{const st=__app.computerHub.screenStats;st.got=st.gotBytes=0;});
  await A.waitForTimeout(10_000);
  const [sent,got]=await Promise.all([A.evaluate(()=>({...__app.computerHub.screenStats,all:__ghosts.messages-window.sentBefore})),B.evaluate(()=>({...__app.computerHub.screenStats}))]);
  result.bandwidth={seconds:10,sentFrames:sent.sent,sentBytes:sent.sentBytes,allMessagesFromA:sent.all,receivedFrames:got.got,receivedBytes:got.gotBytes,bytesPerSecond:Math.round(got.gotBytes/10),framesPerSecond:got.got/10};
  assert(got.got>=25&&got.got<=41,`frames received in 10 s: ${got.got}`);assert(sent.all<=51,`A's whole socket budget stays ≤ 5/s: ${sent.all}`);log('bandwidth per onlooker',result.bandwidth);
  // B leaves the room: B draws nothing more, A stops sending.
  await A.evaluate(()=>clearInterval(window.mover));
  await B.evaluate(async()=>{const a=__app,C=await import('/src/config.js');a.player.spawn(4.2,10.4,0);a.player.pos.y=C.LEVELS[0].floor;a.player.eyeY=a.player.pos.y+1.62;for(let i=0;i<4;i++)a.step(1/60);});
  await B.waitForFunction(()=>!__app.computerHub.sessions.get('pc-home').player.inside&&!__app.computerHub.sessions.get('pc-home').feed.data,null,{timeout:15000});
  await A.waitForTimeout(1500);const stop0=await A.evaluate(()=>__app.computerHub.screenStats.sent),gotLeft=await B.evaluate(()=>__app.computerHub.screenStats.got);await A.evaluate(()=>{const h=__app.computerHub,s=h.sessions.get('pc-home'),g=h.arcadeGame(s);if(!g.running)g.start();window.mover=setInterval(()=>h.arcadeInput(s,'rotate',true),300);});await A.waitForTimeout(3000);
  const stop1=await A.evaluate(()=>{clearInterval(window.mover);return __app.computerHub.screenStats.sent;});const gotAfter=await B.evaluate(()=>__app.computerHub.screenStats.got);
  assert.equal(stop1,stop0,'nobody watching: no snapshots');assert.equal(gotAfter,gotLeft,'nothing more drawn after leaving');result.afterLeaving={sentWhileAlone:stop1-stop0};log('leaving stops the pictures',result.afterLeaving);
  // A film on the computer: A picks YouTube, B (back beside it) sees the same video on the same monitor.
  await pose(B,'pc-home',1.3,1);await B.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').player.inside);
  await A.evaluate(()=>__app.computerHub.sessions.get('pc-home').player.command('app',{app:'youtube'}));await A.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').player.state?.app==='youtube');
  await A.evaluate(id=>__app.computerHub.sessions.get('pc-home').player.choose(id),VIDEO);
  await Promise.all([A,B].map(p=>p.waitForFunction(id=>__app.computerHub.sessions.get('pc-home').player.state?.video===id,VIDEO,{timeout:20000})));
  await pose(A,'pc-home',.95,0);await look(A,'pc-home');await look(B,'pc-home');await Promise.all([A,B].map(p=>p.waitForFunction(()=>__app.computerHub.sessions.get('pc-home').player.ready,null,{timeout:30000}).catch(()=>{})));await A.waitForTimeout(4000);
  result.computerFilm=await Promise.all([A,B].map(p=>p.evaluate(()=>{const pl=__app.computerHub.sessions.get('pc-home').player;return{video:pl.state.video,ready:pl.ready,iframe:!!pl.surface.mount.querySelector('iframe'),position:Math.round(pl.position())};})));
  assert(result.computerFilm.every(f=>f.video===VIDEO&&f.iframe));
  await compose('film-dator-a-b.jpg',[await shot(A),await shot(B)],['A valde filmen på datorn','B ser samma film på datorn'],.72);log('the same film on the computer',result.computerFilm);
  await A.evaluate(()=>__app.computerHub.sessions.get('pc-home').player.stop());await A.evaluate(()=>__app.computerHub.close());
  // The lounge TV: A chooses a film, B in the same room sees it on the same TV.
  for(const [p,x] of [[A,2.2],[B,3.4]])await p.evaluate(async x=>{const a=__app,C=await import('/src/config.js');a.player.spawn(x,9.4,0);a.player.pos.y=C.LEVELS[0].floor;a.player.eyeY=a.player.pos.y+1.62;for(let i=0;i<4;i++)a.step(1/60);a.camera.position.set(a.player.pos.x,a.player.eyeY,a.player.pos.z);},x);
  await Promise.all([A,B].map(p=>p.waitForFunction(()=>__app.tvMedia.sessions.get('lounge').player.inside&&!!__app.tvMedia.sessions.get('lounge').player.state,null,{timeout:20000})));
  await A.evaluate(()=>__app.tvMedia.sessions.get('lounge').player.show());await A.waitForFunction(()=>__app.tvMedia.sessions.get('lounge').player.owns,null,{timeout:15000});
  await A.evaluate(id=>__app.tvMedia.sessions.get('lounge').player.choose(id),VIDEO);
  await Promise.all([A,B].map(p=>p.waitForFunction(id=>__app.tvMedia.sessions.get('lounge').player.state?.video===id,VIDEO,{timeout:20000})));
  for(const p of [A,B])await look(p,'tv');await Promise.all([A,B].map(p=>p.waitForFunction(()=>__app.tvMedia.sessions.get('lounge').player.ready,null,{timeout:30000}).catch(()=>{})));await A.waitForTimeout(4000);
  result.tvFilm=await Promise.all([A,B].map(p=>p.evaluate(()=>{const pl=__app.tvMedia.sessions.get('lounge').player;return{video:pl.state.video,ready:pl.ready,iframe:!!pl.surface.mount.querySelector('iframe'),position:Math.round(pl.position())};})));
  assert(result.tvFilm.every(f=>f.video===VIDEO&&f.iframe));
  await compose('film-tv-a-b.jpg',[await shot(A),await shot(B)],['A valde filmen på TV:n','B ser samma film på TV:n'],.72);log('the same film on the lounge TV',result.tvFilm);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log('RESULT',JSON.stringify(result));
 }finally{for(const p of pages)try{await p.evaluate(()=>__ghosts.disconnect());}catch{}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
