// #1330: real World, Web Audio samples, actual billiard stroke and room lifecycle.
const fs=require('node:fs'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const [game='http://localhost:8191',out='/tmp/lekstuga1330']=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch(['--autoplay-policy=no-user-gesture-required']);try{
 const {page}=await kit.open(browser,`${game}/?shot&cloud=&mp=0&freeze&time=12&weather=clear`,{lazy:true,timeout:180000,viewport:{width:844,height:390}});console.log('PASS actual World loaded');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(async()=>{const a=__app,C=await import('/src/config.js'),audio=await import('/src/audio.js');a.showOverlay(false);a.touch.enabled=true;audio.initAudio();window.audio=audio;
 const parts=audio.audioParts(),an=parts.ctx.createAnalyser();an.fftSize=2048;parts.master.connect(an);window.an=an;window.samples=()=>{const d=new Float32Array(an.fftSize);an.getFloatTimeDomainData(d);return Math.sqrt(d.reduce((n,v)=>n+v*v,0)/d.length);};
 a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.use({kind:'playhouse'});
 });await page.waitForFunction(()=>__app.player.inPlayroom);
 await page.evaluate(()=>{const a=__app,r=a.world.playroom,b=r.billiards;a.player.spawn(b.object.position.x,b.object.position.z+1.7,0);a.camera.position.set(a.player.pos.x,1.3,a.player.pos.z);a.camera.lookAt(b.object.position.x,.58,b.object.position.z);r.setDisco(true);window.hits=[];const original=audio.sfx.billiard;audio.sfx.billiard=function(...args){const ok=original.apply(this,args);hits.push({kind:args[1],position:{...args[0]},ok});return ok;};});
 const rms=async()=>{let maximum=0;for(let i=0;i<60;i++){await page.waitForTimeout(10);maximum=Math.max(maximum,await page.evaluate(()=>samples()));}return maximum;};
 const on=await rms();assert(on>.0001,`disco RMS ${on}`);
 await page.evaluate(()=>__app.world.playroom.setDisco(false));await page.waitForTimeout(400);const off=await rms();assert(off<on*.05,`on ${on}, off ${off}`);
 await page.evaluate(()=>__app.world.playroom.setDisco(true));await page.waitForTimeout(200);await page.evaluate(()=>audio.toggleMuted());await page.waitForTimeout(250);const muted=await rms();assert(muted<on*.05);await page.evaluate(()=>{audio.toggleMuted();__app.world.playroom.setDisco(false);});await page.waitForTimeout(300);
 assert(await page.evaluate(()=>__app.world.playroom.billiards.shoot(__app.camera)));
 const stroke=await rms();assert(stroke>.0001);await page.waitForFunction(()=>hits.some(e=>e.kind==='ball'&&e.ok));
 await page.evaluate(()=>{const p=__app.world.playroom.billiards.physics;p.balls.forEach(b=>{b.vx=b.vz=0;});const [x,z]=p.pockets[0];Object.assign(p.balls[1],{active:true,x:x+.01,z:z+.01,vx:.7,vz:0});});
 const pocket=await rms();assert(pocket>.0001);await page.waitForFunction(()=>hits.some(e=>e.kind==='pocket'&&e.ok));
 const events=await page.evaluate(()=>hits);assert(events.some(e=>e.kind==='cue'&&e.ok));assert(events.every(e=>Math.abs(e.position.x+1500)<3&&Math.abs(e.position.z+1500)<5));
 await page.evaluate(()=>{__app.world.playroom.setDisco(true);__app.use({kind:'playroomExit'});});await page.waitForFunction(()=>!__app.player.inPlayroom);await page.waitForTimeout(400);const outside=await rms();assert.equal(await page.evaluate(()=>__app.world.playroom.sound.active),false);
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({on,off,muted,stroke,pocket,outside,events,errors},null,2));console.log('PASS real disco on/off/mute, audible cue/balls, positional impacts and silent exit',{on,off,muted,stroke,pocket,outside});
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
