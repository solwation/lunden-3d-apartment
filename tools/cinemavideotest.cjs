// Real official YouTube media, actual app/chair/remote and native desktop/touch controls.
// GAME OUT; external network/media must be reachable. No production game service is used.
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2], out = process.argv[3];
if (!game || !out) throw Error('Usage: cinemavideotest.cjs GAME OUT');
fs.mkdirSync(out, { recursive: true });
const check = (v, label, details) => { if (!v) throw Error(label + ' ' + JSON.stringify(details)); console.log('PASS', label, details ? JSON.stringify(details) : ''); };
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 try {
  const mobile = !!process.env.MOBILE;
  const page = await browser.newPage({ viewport: mobile ? { width:844,height:390 } : { width:1100,height:760 }, isMobile:mobile, hasTouch:mobile });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('lunden.name','Cinema test'); sessionStorage.setItem('lunden.nameSkipped','1'); });
  await page.goto(`${game}/?shot&cloud=&mp=0&test=lazy&freeze&time=12&month=6`, { waitUntil:'commit' });
  await page.waitForFunction(() => window.__app?.renderer, null, { timeout:180000 });
  await page.evaluate(async () => {
   const a=__app,C=await import('/src/config.js'); a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});
   a.showOverlay(false); a.renderer.setAnimationLoop(null); if (a.rest.active) a.standUp(); a.use({kind:'playhouse'});
  });
  await page.waitForFunction(()=>__app.player.inPlayroom); await page.waitForTimeout(600);
  await page.evaluate(async()=>{
   const a=__app,{PLAYROOM:R}=await import('/src/config.js'),c=R.furniture.cinema;
   a.player.spawn(R.x+c.seat.rowX[1]+.78,R.z+c.seat.z[0],0);
   window.aim=(x,y,z)=>{const d=new a.camera.position.constructor(x,y,z).sub(a.camera.position);a.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');a.camera.updateMatrixWorld(true);a.step(0);a.step(0);a.testMode.draw();};
   for(let i=0;i<12;i++)a.player.update(1/60);a.touch.enabled=true;document.body.classList.add('touch');aim(R.x+c.seat.rowX[1],.48,R.z+c.seat.z[0]);
  });
  const nativeUse=async()=>{
   if(mobile) await page.locator('#action').tap();
   else { if(!await page.evaluate(()=>!!document.pointerLockElement)){ await page.evaluate(()=>{__app.touch.enabled=false;document.body.classList.remove('touch')}); await page.evaluate(()=>document.getElementById('game-canvas').requestPointerLock()); await page.waitForFunction(()=>!!document.pointerLockElement); } await page.waitForFunction(()=>!!document.pointerLockElement&&document.getElementById('arm').hidden); await page.keyboard.press('KeyE'); }
  };
  await nativeUse(); check(await page.evaluate(()=>__app.rest.active),'native input sits in rear cinema chair');
  await page.evaluate(async()=>{const a=__app,{PLAYROOM:R}=await import('/src/config.js');for(let i=0;i<12;i++)a.rest.update(.1);const r=R.furniture.cinema.remote;aim(R.x+r.x,r.y+.04,R.z+r.z);});
  const focus=await page.evaluate(()=>({kind:__app.focus().focused?.kind,name:__app.focus().focused?.name}));
  check(focus.name==='film med bions fjärrkontroll','actual seated remote ray',focus);
  await page.screenshot({path:`${out}/remote.png`});
  await nativeUse(); check(await page.locator('#cinema-player').evaluate(el=>el.open),'native remote opens chooser');
  const position=await page.evaluate(()=>({x:__app.player.pos.x,z:__app.player.pos.z}));
  await page.locator('#cinema-url').focus();await page.keyboard.type('wasde');await page.keyboard.press('Enter');
  const typing=await page.evaluate(()=>({value:document.querySelector('#cinema-url').value,x:__app.player.pos.x,z:__app.player.pos.z,keys:[...__app.player.keys],open:__app.cinema.open}));
  check(typing.value==='wasde'&&typing.x===position.x&&typing.z===position.z&&typing.keys.length===0&&typing.open,'typing and Enter stay in video form without game movement',typing);
  await page.keyboard.press('Escape');check(!await page.locator('#cinema-player').evaluate(el=>el.open)&&!await page.evaluate(()=>!!document.pointerLockElement),'Escape closes without grabbing pointer');
  await nativeUse();check(await page.locator('#cinema-player').evaluate(el=>el.open),'native remote reopens after Escape');
  const submit=async value=>{await page.locator('#cinema-url').fill(value);await page.getByRole('button',{name:'Välj film',exact:true}).click();};
  const play=page.locator('[data-cinema=play]'),pause=page.locator('[data-cinema=pause]');
  await submit('https://www.youtube.com.evil.invalid/watch?v=M7lc1UVf-VE');
  check(await page.locator('#cinema-player [role=status]').textContent().then(t=>t.includes('giltig')) && await page.locator('#cinema-player iframe').count()===0,'invalid host rejected before external player');
  let releaseAPI; const gate=new Promise(resolve=>{releaseAPI=resolve;});
  await page.route('https://www.youtube.com/iframe_api',async route=>{await gate;await route.continue();});
  const requestedAPI=page.waitForRequest('https://www.youtube.com/iframe_api');
  await submit('M7lc1UVf-VE');await requestedAPI;
  await page.locator('[data-cinema=close]').click();releaseAPI();
  await page.waitForFunction(()=>window.YT?.Player,null,{timeout:45000});
  check(await page.locator('#cinema-player iframe').count()===0&&!await page.locator('#cinema-player').evaluate(el=>el.open),'closing during actual pending API script cannot resurrect media');
  if(!mobile) { await page.waitForFunction(()=>!!document.pointerLockElement);check(true,'back button restores desktop pointer lock'); }
  await nativeUse();
  await submit('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await play.waitFor({state:'visible'}); await page.waitForFunction(()=>!document.querySelector('[data-cinema=play]').disabled,null,{timeout:45000});
  check(await page.evaluate(()=>__app.cinema.player.getPlayerState()!==1),'video waits for explicit user play');
  await play.click(); await page.waitForFunction(()=>__app.cinema.player?.getPlayerState()===1,null,{timeout:45000});
  const frame=page.frames().find(f=>f.url().includes('youtube-nocookie.com/embed/'));
  await frame.waitForFunction(()=>document.querySelector('video')?.getVideoPlaybackQuality().totalVideoFrames>2,null,{timeout:45000});
  const media=()=>frame.evaluate(()=>{const v=document.querySelector('video');return{time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames,muted:v.muted,paused:v.paused,src:!!v.currentSrc};});
  const before=await media(); await page.waitForTimeout(1300); const after=await media();
  check(after.time>before.time+.5 && after.frames>before.frames && !after.muted && after.src,'real unmuted video time and total frame counter advance',{before,after});
  const layout=await page.locator('#cinema-player iframe').boundingBox();check(layout.width>=200&&layout.height>=200,'official iframe minimum size',layout);
  const bounds=await page.evaluate(()=>[...document.querySelectorAll('#cinema-player button')].map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,h:r.height,bottom:r.bottom};}));
  check(bounds.every(r=>r.h>=44&&r.y>=0&&r.bottom<=page.viewportSize().height),'all cinema controls visible and at least 44px',bounds);
  await page.screenshot({path:`${out}/playing.png`});
  await pause.click();await page.waitForFunction(()=>__app.cinema.player?.getPlayerState()===2);const paused=await media();await page.waitForTimeout(1100);const frozen=await media();
  check(Math.abs(frozen.time-paused.time)<.15,'pause freezes actual media time',{paused,frozen});
  await page.locator('[data-cinema=off]').click();check(await page.locator('#cinema-player iframe').count()===0&&await page.evaluate(()=>!__app.cinema.player),'off destroys player and iframe');
  // A second visitor-chosen URL, rather than a hardcoded application sample.
  await submit('https://youtu.be/aqz-KE-bpKQ');await page.waitForFunction(()=>!document.querySelector('[data-cinema=play]').disabled,null,{timeout:45000});await play.click();await page.waitForFunction(()=>__app.cinema.player?.getPlayerState()===1&&__app.cinema.player?.getCurrentTime()>1,null,{timeout:45000});
  check(await page.evaluate(()=>__app.cinema.player.getVideoData().video_id==='aqz-KE-bpKQ'),'second own URL really plays');
  await page.locator('[data-cinema=close]').click();check(!await page.locator('#cinema-player').evaluate(el=>el.open)&&await page.locator('#cinema-player iframe').count()===0,'back to room unloads media');
  // Close re-locks desktop input. Open again through the same native remote.
  await nativeUse();
  await page.evaluate(()=>{window.cinemaVendorErrors=[];const Original=YT.Player;YT.Player=function(frame,options){const handler=options.events.onError;options.events.onError=e=>{window.cinemaVendorErrors.push(e.data);handler(e);};return new Original(frame,options);};});
  await submit('https://youtu.be/aaaaaaaaaaa');
  try { await page.waitForFunction(()=>/Filmen saknas|Filmen kunde inte spelas|Ägaren tillåter inte/.test(document.querySelector('#cinema-player [role=status]').textContent),null,{timeout:45000}); } catch(e) { console.log('ACTUAL ERROR STATUS',await page.locator('#cinema-player [role=status]').textContent());await page.screenshot({path:`${out}/error-timeout.png`});throw e; }
  check(await page.locator('#cinema-player iframe').count()===0,'real rejected video reports actionable error and unloads',await page.evaluate(()=>({codes:window.cinemaVendorErrors,status:document.querySelector('#cinema-player [role=status]').textContent})));await page.screenshot({path:`${out}/unavailable.png`});
  // Deterministic vendor callback coverage supplements, not replaces, real playback/error evidence.
  await submit('M7lc1UVf-VE');await page.waitForFunction(()=>!document.querySelector('[data-cinema=play]').disabled,null,{timeout:45000});
  const mapped=await page.evaluate(async()=>{const {youtubeError,youtubeId}=await import('/src/cinemaplayer.js');return {a:youtubeError(101),b:youtubeError(150),c:youtubeError(153),bad:youtubeId('javascript:M7lc1UVf-VE')};});
  check(mapped.a.includes('Ägaren')&&mapped.b===mapped.a&&mapped.c.includes('visningsplatsen')&&mapped.bad===null,'blocked embedding and client identity errors have actionable Swedish messages',mapped);
  await page.locator('[data-cinema=off]').click();
  await page.evaluate(async()=>{const Original=YT.Player;let events;YT.Player=function(frame,options){events=options.events;this.destroy=()=>frame.remove();};await __app.cinema.choose('M7lc1UVf-VE');events.onError({data:101});YT.Player=Original;});
  check((await page.locator('#cinema-player [role=status]').textContent()).includes('Ägaren')&&await page.locator('#cinema-player iframe').count()===0,'deterministic official blocked-embed callback shows error and unloads');
  await page.screenshot({path:`${out}/blocked-embed.png`});
  await submit('M7lc1UVf-VE');await page.waitForFunction(()=>!document.querySelector('[data-cinema=play]').disabled,null,{timeout:45000});await play.click();await page.waitForFunction(()=>__app.cinema.player?.getPlayerState()===1,null,{timeout:45000});
  await page.evaluate(()=>__app.world.playroom.setInside(false));check(!await page.locator('#cinema-player').evaluate(el=>el.open)&&await page.locator('#cinema-player iframe').count()===0,'room exit closes and destroys playing media');
  // A queued async selection must not recreate a player after close/pagehide.
  await page.evaluate(async()=>{__app.cinema.show();const pending=__app.cinema.choose('M7lc1UVf-VE');__app.cinema.close('pagehide');await pending;});
  check(await page.locator('#cinema-player iframe').count()===0&&!await page.locator('#cinema-player').evaluate(el=>el.open),'closing while API readiness is pending cannot resurrect media');
  check(errors.length===0,'no app page exceptions',errors);
  fs.writeFileSync(`${out}/result.json`,JSON.stringify({mobile,before,after,paused,frozen,bounds,layout,vendorErrors:await page.evaluate(()=>window.cinemaVendorErrors),errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
