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
 // the lit disco lamp without music is silent (no ticking drum loop)
 await page.waitForTimeout(400);const on=await rms();assert(on<1e-4,`disco without music RMS ${on}`);
 await page.evaluate(()=>__app.world.playroom.setDisco(false));await page.waitForTimeout(300);const off=await rms(),muted=off;
 // the DJ music is heard in BILJARD but not in BIO or SPEL (the passages are open; the room gain gates it)
 await page.evaluate(()=>{const r=__app.world.playroom;r.music.play();});
 await page.waitForFunction(()=>{const el=__app.world.playroom.music.file?.el;return el&&!el.paused&&el.currentTime>.3;},null,{timeout:30000});
 const goto=(x,z)=>page.evaluate(([x,z])=>{const a=__app,C=a.world.playroom,R=C.constructor.R??null;const px=-1500+x,pz=-1500+z;a.player.spawn(px,pz,0);a.camera.position.set(px,1.3,pz);},[x,z]);
 await goto(0,-.5);await page.waitForTimeout(500);const billiardRoom=await rms();
 await goto(-6,-2);await page.waitForTimeout(800);const cinemaRoom=await rms();
 await goto(6,-2);await page.waitForTimeout(800);const gameRoom=await rms();
 await goto(0,3.4);await page.waitForTimeout(800);const hall=await rms();
 assert(billiardRoom>.001,`music in BILJARD ${billiardRoom}`);assert(cinemaRoom<billiardRoom*.01,`BIO ${cinemaRoom}`);assert(gameRoom<billiardRoom*.01,`SPEL ${gameRoom}`);assert(hall>gameRoom&&hall<billiardRoom,`hall ${hall}`);
 console.log('PASS music room gating',{billiardRoom,cinemaRoom,gameRoom,hall});await page.evaluate(()=>__app.world.playroom.music.stop());
 // #1661/#1657: take a cue from the wall rack; the first shoot() only starts charging, the second strikes
 await page.evaluate(()=>__app.billiardCues[0].take());
 assert(await page.evaluate(()=>{const b=__app.world.playroom.billiards;if(!b.shoot(__app.camera))return false;b.charge.t=b.c.chargeSeconds;return b.shoot(__app.camera);}));
 const stroke=await rms();assert(stroke>.0001);await page.waitForFunction(()=>hits.some(e=>e.kind==='ball'&&e.ok));
 await page.evaluate(()=>{const p=__app.world.playroom.billiards.physics;p.balls.forEach(b=>{b.vx=b.vz=0;});const [x,z]=p.pockets[0];Object.assign(p.balls[1],{active:true,x:x+.01,z:z+.01,vx:0,vz:0});});
 const pocket=await rms();assert(pocket>.0001);await page.waitForFunction(()=>hits.some(e=>e.kind==='pocket'&&e.ok));
 const events=await page.evaluate(()=>hits);assert(events.some(e=>e.kind==='cue'&&e.ok));assert(events.every(e=>Math.abs(e.position.x+1500)<3&&Math.abs(e.position.z+1500)<5));
 await page.evaluate(()=>{__app.world.playroom.setDisco(true);__app.use({kind:'playroomExit'});});await page.waitForFunction(()=>!__app.player.inPlayroom);await page.waitForTimeout(400);const outside=await rms();assert.equal(await page.evaluate(()=>__app.world.playroom.sound.active),false);
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({on,off,stroke,pocket,outside,events,errors},null,2));console.log('PASS silent disco lamp, audible cue/balls, positional impacts and silent exit',{on,off,muted,stroke,pocket,outside});
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
