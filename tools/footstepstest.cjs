// Actual Web Audio comparison + actual World controller route. No production services.
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const kit=require('./testkit.cjs');
const base=process.argv[2]||'http://127.0.0.1:8137',out=process.argv[3]||'/tmp/footsteps';
function wav(samples,rate=48000){const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);samples.forEach((v,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));return b}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await kit.launch(['--autoplay-policy=no-user-gesture-required']),checks=[],errors=[];
 const check=(v,n)=>{assert.ok(v,n);checks.push(n);console.log('PASS',n)};
 try{
 const ctx=await browser.newContext({viewport:{width:640,height:420}}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const baseline=execFileSync('git',['show','7d0a0570:src/audio.js'],{encoding:'utf8'});
 await page.route('**/src/footsteps-before-audio.js*',r=>r.fulfill({contentType:'text/javascript',body:baseline}));
 await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// Web Audio component phase'}));
 await page.goto(base);
 const audio=await page.evaluate(async()=>{
   const rows=[];let n=0;
   for(const version of ['before','after'])for(const surface of ['wood','hard','grass','gravel']){
     const offline=new OfflineAudioContext(2,24000,48000),AC=window.AudioContext,random=Math.random;let seed=147;
     try{
       Math.random=()=>((seed=seed*16807%2147483647)/2147483647);window.AudioContext=function(){return offline};
       const module=await import(`/src/${version==='before'?'footsteps-before-audio':'audio'}.js?sample=${++n}`);module.initAudio();
       const {master}=module.audioParts(),high=offline.createBiquadFilter(),merger=offline.createChannelMerger(2);
       high.type='highpass';high.frequency.value=1800;high.Q.value=.707;
       master.disconnect();master.connect(merger,0,0);master.connect(high).connect(merger,0,1);merger.connect(offline.destination);
       module.sfx.step(version==='before'?(surface==='wood'?'wood':surface==='hard'?'stair':'outside'):surface);
       const rendered=await offline.startRendering(),data=rendered.getChannelData(0),hi=rendered.getChannelData(1);
       const energy=x=>x.reduce((a,v)=>a+v*v,0);let delta=0;for(let i=1;i<data.length;i++)delta=Math.max(delta,Math.abs(data[i]-data[i-1]));
       rows.push({version,surface,samples:[...data],rms:Math.sqrt(energy(data)/data.length),highShare:energy(hi)/energy(data),peak:Math.max(...data.map(Math.abs)),delta});
     }finally{window.AudioContext=AC;Math.random=random}
   }return rows;
 });
 for(const row of audio)fs.writeFileSync(`${out}/${row.version}-${row.surface}.wav`,wav(row.samples));
 const metrics=audio.map(({samples,...row})=>row);console.log('METRICS',JSON.stringify(metrics));
 for(const surface of ['wood','hard','grass','gravel']){
   const old=audio.find(r=>r.version==='before'&&r.surface===surface),now=audio.find(r=>r.version==='after'&&r.surface===surface);
   check(now.rms>.001&&now.peak<1&&now.highShare<old.highShare*.85&&now.delta<old.delta,`${surface}: audible, no clipping, less high-frequency energy and smoother waveform`);
 }
 check(new Set(audio.filter(r=>r.version==='after').map(r=>r.highShare.toFixed(5))).size===4,'four distinct underfoot timbres');
 await page.unroute('**/src/bootstrap.js');
 await ctx.addInitScript(()=>{localStorage.setItem('lunden.name','Stegtest');sessionStorage.setItem('lunden.nameSkipped','1')});
 await page.goto(`${base}/?test=lazy&cloud=&mp=0&at=3,10.8,0&mess=0`);await page.waitForFunction(()=>window.__app?.renderer&&window.__app.loadingEl.hidden,null,{timeout:240000});
 const classification=await page.evaluate(async()=>{
  const {stepSurface}=await import('/src/stepsurface.js'),{SITE}=await import('/src/config.js'),w=__app.world;
  const points=[['wood',{x:3,y:0,z:10.8}],['hard',{x:1,y:0,z:1.8}],['hard',{x:2,y:0,z:-1}],['hard',{x:3,y:0,z:14}],['grass',{x:-9,y:0,z:23}],['gravel',{x:-25,y:0,z:21}]];
  const b=SITE.riverPark.woodBridge;points.push(['wood',{x:(b.ends[0][0]+b.ends[1][0])/2,y:b.deckY,z:(b.ends[0][1]+b.ends[1][1])/2}]);
  return points.map(([expected,p])=>({expected,actual:stepSurface(w,p),p}));
 });check(classification.every(r=>r.expected===r.actual),'actual rooms, paving, grass, gravel and timber bridge select correct profiles');
 await page.evaluate(async()=>{const audio=await import('/src/audio.js');audio.initAudio();window.stepEvents=[];const original=audio.sfx.step;audio.sfx.step=function(surface){stepEvents.push({surface,p:{...__app.player.pos}});return original.call(this,surface)};__app.touch.enabled=true;__app.showOverlay(false)});
 const movement=[];
 for(const [surface,x,z] of [['wood',3.5,4.2],['hard',1,1.8],['grass',-9,23],['gravel',-25,21]]){
  await page.evaluate(({x,z})=>{__app.player.keys.clear();__app.player.spawn(x,z,0);window.stepEvents=[]},{x,z});
  await page.waitForTimeout(150);await page.evaluate(()=>__app.player.keys.add('KeyW'));await page.waitForFunction(()=>window.stepEvents.length>0,null,{timeout:5000,polling:100}).catch(()=>{});await page.evaluate(()=>__app.player.keys.clear());
  const events=await page.evaluate(()=>stepEvents);const pose=await page.evaluate(()=>({p:{...__app.player.pos},active:__app.touch.enabled,rest:__app.rest.active,vy:__app.player.vy}));movement.push({surface,events,pose});console.log('WALK',JSON.stringify(movement.at(-1)));check(events.some(e=>e.surface===surface),`actual controller walking emits ${surface} contacts`);
 }
 const peer=await page.evaluate(async()=>{
  const audio=await import('/src/audio.js');let result;const old=audio.sfx.playAt;audio.sfx.playAt=function(pos,kind,gain,surface){result={kind,surface};return old.call(this,pos,kind,gain,surface)};
  __ghosts.onStep({feet:{x:-25,y:0,z:21}});audio.sfx.playAt=old;return result;
 });check(peer.kind==='step'&&peer.surface==='gravel','nearby-player callback uses same underfoot classifier');
 const guards=await page.evaluate(async()=>{const a=await import('/src/audio.js?voice-guard');a.initAudio();a.toggleMuted();const muted=a.sfx.playAt({x:0,y:0,z:0},'step');a.toggleMuted();const far=a.sfx.playAt({x:500,y:0,z:500},'step');let accepted=0;for(let i=0;i<9;i++)if(a.sfx.playAt({x:0,y:0,z:0},'step',1,'grass'))accepted++;return {muted,far,accepted}});check(!guards.muted&&!guards.far&&guards.accepted===8,'mute, distance and simultaneous voice cap still suppress peer steps');
 check(errors.length===0,'zero browser errors');
 fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks,metrics,classification,movement,peer,guards,errors,baseline:'7d0a0570'},null,2));
 console.log('ALL PASSED');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
