// Scoped visit controls, actual YouTube loop/volume, dynamic blush and ordinary gift pile placement.
const kit=require('./testkit.cjs'),fs=require('fs'),assert=require('assert');
const base=process.argv[2]||'http://127.0.0.1:8770',out=process.argv[3]||'/tmp/santa-visit1500';fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await kit.launch(),timer=setTimeout(()=>b.close(),180000);try{
 const {page:p}=await kit.open(b,`${base}/?cloud=&month=12&day=24&time=15&freeze&test=lazy&at=3.77,10.495,0,0`,{timeout:70000});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.evaluate(()=>{const a=__app;a.hideLoading();a.showOverlay(false);document.getElementById('arm').hidden=true;a.step(0);});
 await p.waitForFunction(()=>__app.santaTV.video?.getPlayerState?.()===1,null,{polling:250,timeout:25000});
 const control=await p.evaluate(async()=>{
  const a=__app,tv=a.santaTV.tv,s=a.tvMedia.sessions.get('lounge').player,was=tv.isOpen;
  a.showOverlay(true); // keep the simulation camera fixed while the iframe acknowledges volume messages
  a.use(tv);const chooserClosed=!a.tvMedia.open;tv.toggle();const powerHeld=tv.isOpen===was;
  const channelBlocked=tv.channel()===false,seekBlocked=a.tvMedia.seek(tv,10)===false,remotePower=a.remote.onPower(tv)===true;
  const sent=[];s.net={ready:()=>true,id:()=> 'test',send:m=>{sent.push(m);return true;}};
  const commandBlocked=s.command('select',{v:'abcdefghijk'})===false&&sent.length===0;
  const other=a.world.furnitureTargets.find(t=>t.mediaId==='bedroom1'),before=other.isOpen;other.toggle();const otherWorks=other.isOpen!==before;other.toggle();
  const T=await import('three'),point=tv.mesh.getWorldPosition(new T.Vector3());a.camera.position.copy(point).add(new T.Vector3(0,0,1));a.camera.lookAt(point);a.camera.updateMatrixWorld(true);
  a.santaTV.soundActivated=true;a.santaTV.soundVolume.at=-Infinity;a.santaTV.update(0,a.camera,a.renderer);await new Promise(r=>setTimeout(r,500));const near=a.santaTV.video.getVolume();
  a.camera.lookAt(a.camera.position.clone().add(a.camera.position.clone().sub(point)));a.camera.updateMatrixWorld(true);a.santaTV.soundVolume.at=-Infinity;a.santaTV.update(0,a.camera,a.renderer);await new Promise(r=>setTimeout(r,500));const back=a.santaTV.video.getVolume();
  a.camera.position.z+=4;a.camera.lookAt(point);a.camera.updateMatrixWorld(true);a.santaTV.soundVolume.at=-Infinity;a.santaTV.update(0,a.camera,a.renderer);await new Promise(r=>setTimeout(r,500));const far=a.santaTV.video.getVolume();
  a.showOverlay(false);a.santaTV.video.seekTo(a.santaTV.video.getDuration()-.5,true);a.santaTV.video.playVideo();
  return {chooserClosed,powerHeld,channelBlocked,seekBlocked,remotePower,commandBlocked,otherWorks,near,back,far};
 });
 for(const k of ['chooserClosed','powerHeld','channelBlocked','seekBlocked','remotePower','commandBlocked','otherWorks'])assert(control[k],k);
 assert(control.near>control.back&&control.near>control.far,JSON.stringify(control));
 await p.waitForFunction(()=>__app.santaTV.video.getCurrentTime()<3&&__app.santaTV.video.getPlayerState()===1,null,{polling:250,timeout:20000});
 const loop=await p.evaluate(()=>({time:__app.santaTV.video.getCurrentTime(),state:__app.santaTV.video.getPlayerState()}));
 await p.evaluate(async()=>{const a=__app,T=await import('three');a.player.pos.set(3.77,0,10.35);a.camera.position.set(3.77,1.4,10.35);a.camera.lookAt(a.santa.head);a.camera.updateMatrixWorld(true);a.santa.t=5;a.santa.update(0);});
 await kit.shot(p,`${out}/before.png`,{frames:1,viewport:{width:960,height:600}});
 const blush=await p.evaluate(()=>{const a=__app,s=a.santa,range=s.fig.body.userData.cheeks[0],c=s.fig.body.geometry.getAttribute('color');
  const before=[c.getX(range.start),c.getY(range.start),c.getZ(range.start)];s.t=0;s.sipInProgress=false;
  for(let i=0;i<1400;i++)s.update(.1);s.t=5;s.update(0);
  const after=[c.getX(range.start),c.getY(range.start),c.getZ(range.start)],saved=a.keepWorld().santa;
  s.sips=0;s.updateBlush();s.loadState(saved);const restored=s.sips===saved.sips;
  a.day.hour=16;s.update(0);a.step(0);const sleepingLoop=a.santaTV.locked&&a.santaTV.active; a.day.hour=15;s.update(0);
  return {before,after,sips:s.sips,restored,sleepingLoop,dynamic:c.usage===35048};
 });
 assert(blush.sips===10&&blush.restored&&blush.sleepingLoop&&blush.dynamic);assert(blush.after[1]<blush.before[1]&&blush.after[2]<blush.before[2]);
 await kit.shot(p,`${out}/after.png`,{frames:1,viewport:{width:960,height:600}});
 fs.writeFileSync(`${out}/visit.json`,JSON.stringify({control,loop,blush},null,2));
 const pile=await p.evaluate(async()=>{const a=__app,T=await import('three'),g=a.christmasGifts;
  a.touch.enabled=true;a.activeMode='touch';a.showOverlay(false);
  a.player.pos.set(2.1,0,8.8);a.camera.position.set(2.1,1.62,8.8);
  const bottom=g.give();bottom.placeAt(new T.Vector3(2.1,0,9.5),0);
  const placed=[];
  for(let i=0;i<2;i++){
   g.give();const support=g.items.at(-2),box=new T.Box3().setFromObject(support.model),aim=box.getCenter(new T.Vector3());aim.y=box.max.y;
   a.camera.lookAt(aim);a.camera.updateMatrixWorld(true);a.step(0);const target=a.focus().focused;
   if(target?.kind!=='place')throw Error(`Missing actual place target: ${target?.kind}; camera=${a.camera.position.toArray()}, held=${a.heldItem()?.name}, hit=${JSON.stringify(g.stackHit(a.focus().raycaster,a.heldItem())?.point)}`);
   placed.push(target.point.y);a.use(target);
  }
  const bounds=g.items.map(item=>new T.Box3().setFromObject(item.model));
  const noOverlap=bounds[1].min.y>=bounds[0].max.y-.001&&bounds[2].min.y>=bounds[1].max.y-.001;
  return {count:g.items.length,placed,noOverlap,supports:g.saveState().items.map(x=>x.support)};
 });
 assert(pile.count===3&&pile.noOverlap&&pile.supports[1]&&pile.supports[2],JSON.stringify(pile));
 await p.evaluate(()=>{const a=__app;a.camera.position.set(1.8,1.1,8.9);a.camera.lookAt(2.1,.18,9.5);a.camera.updateMatrixWorld(true);});
 await kit.shot(p,`${out}/pile.png`,{frames:1,viewport:{width:960,height:600}});
 const end=await p.evaluate(()=>{const a=__app;a.day.hour=21;a.santa.update(0);a.santaTV.update(0,a.camera,a.renderer);const was=a.santaTV.tv.isOpen;a.santaTV.tv.toggle();return {released:!a.santaTV.locked&&!a.santaTV.active,ordinaryPower:a.santaTV.tv.isOpen!==was};});
 assert(end.released&&end.ordinaryPower);assert.deepEqual(errors,[]);
 fs.writeFileSync(`${out}/result.json`,JSON.stringify({control,loop,blush,pile,end,errors},null,2));console.log('PASS locked real YouTube loop/volume, blush and ordinary 3-package stack placement');
}finally{clearTimeout(timer);await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
