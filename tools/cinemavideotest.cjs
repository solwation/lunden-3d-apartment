// Real official YouTube media, actual app/chair/screen and native desktop/touch controls.
// GAME OUT; external network/media must be reachable. No production game service is used.
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2], out = process.argv[3];
if (!game || !out) throw Error('Usage: cinemavideotest.cjs GAME OUT');
if (!process.env.INPUT_ONLY) {
 const result=require('node:child_process').spawnSync(process.execPath,[require('node:path').join(__dirname,'cinemapeertest.cjs'),game,process.env.CINEMA_WORKER||'http://localhost:8782',out],{stdio:'inherit',env:process.env});
 process.exit(result.status??1);
}
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
  const searchRequests=[];
  await page.route('**/youtube-search?*',async route=>{const url=new URL(route.request().url());searchRequests.push(url.searchParams.get('q'));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{id:'M7lc1UVf-VE',title:'Lunden biofilm',channel:'Lunden kanal'}]})});});
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
  await page.evaluate(async()=>{const a=__app,{PLAYROOM:R}=await import('/src/config.js');for(let i=0;i<12;i++)a.rest.update(.1);const s=R.furniture.cinema.screen;aim(R.x+s.x+.08,s.bottom+s.h/2,R.z+s.z);});
  const focus=await page.evaluate(()=>({kind:__app.focus().focused?.kind,name:__app.focus().focused?.name}));
  check(focus.name==='bioduken','actual seated screen ray',focus);
  await page.screenshot({path:`${out}/screen.png`});
  await nativeUse(); check(await page.locator('#cinema-player').evaluate(el=>el.open),'native screen opens chooser');
  check(await page.evaluate(()=>!__app.world.playroom.devices.remoteTarget),'cinema remote target removed');
  if (process.env.INPUT_ONLY) {
    await page.screenshot({path:`${out}/chooser.png`});
    if(await page.locator('#cinema-player').evaluate(el=>el.open))await page.locator('#cinema-player [data-cinema=close]').click();
    check(!await page.locator('#cinema-player').evaluate(el=>el.open),'back returns to cinema');
    check(errors.length===0,'no app page exceptions',errors);
    fs.writeFileSync(`${out}/result.json`,JSON.stringify({mobile,focus,errors},null,2));
    return;
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
