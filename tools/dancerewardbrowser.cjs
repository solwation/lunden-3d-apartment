// #1829: actual World, child entry, physical DJ play via native action button and native dance button.
const fs=require('node:fs'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const [base='http://127.0.0.1:8910',out='docs/verification/1829']=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch(['--autoplay-policy=no-user-gesture-required']);try{
const {page}=await kit.open(browser,`${base}/?cloud=&mp=0&freeze&time=20`,{lazy:true,timeout:180000});console.log('World ready');await kit.skipNameDialog(page);await page.evaluate(()=>__app.renderer.setAnimationLoop(null));const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.evaluate(()=>__app.showOverlay(true));await page.click('#start-touch');
await page.evaluate(async()=>{const a=__app,C=await import('/src/config.js');a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.use({kind:'playhouse'});});
await page.waitForFunction(()=>__app.player.inPlayroom);console.log('Entered playroom');await page.waitForTimeout(500);
const focus=await page.evaluate(()=>{const a=__app,r=a.world.playroom,t=r.djControls.controls.find(t=>t.id==='play0');a.player.spawn(t.pickable.position.x,t.pickable.position.z+.65,0);a.player.update(1/60);a.camera.lookAt(t.pickable.position);a.step(0);a.step(0);return a.focus().focused?.id;});console.log('DJ focus',focus);assert.equal(focus,'play0');await page.click('#action');
await page.waitForFunction(()=>{const m=__app.world.playroom.music;return m.state==='playing'&&m.manualDecks?.some(d=>d?.file?.el&&!d.file.el.paused)||m.state==='playing'&&m.file?.el&&!m.file.el.paused;},null,{timeout:30000});
await page.evaluate(async()=>{const a=__app,C=await import('/src/config.js');a.player.spawn(C.PLAYROOM.x+1.8,C.PLAYROOM.z-.6,0);a.player.update(1/60);a.camera.lookAt(C.PLAYROOM.x,1,C.PLAYROOM.z-3);a.step(0);});
const before=await page.evaluate(()=>({score:__app.totalScore(),seconds:__app.stats.danceSeconds}));await page.click('#dance-btn');
assert.equal(await page.evaluate(()=>__app.world.playroom.music.dancing),true);
await page.evaluate(()=>{const a=__app,render=a.renderer.render;a.renderer.render=()=>{};for(let i=0;i<360;i++)a.step(1/60);a.renderer.render=render;});
const after=await page.evaluate(()=>({score:__app.totalScore(),seconds:__app.stats.danceSeconds,ledger:__app.stats.danceRewardDay,dance:__app.world.playroom.music.danceCode}));assert.equal(after.seconds-before.seconds,6);assert.equal(after.score-before.score,6);
await kit.shot(page,`${out}/disco-dancing.png`,{frames:1});
await page.evaluate(()=>__app.medals.open());await kit.shot(page,`${out}/dance-medal-progress.png`,{frames:1});
assert.match(await page.locator('body').innerText(),/Dansdrake/);
await page.evaluate(()=>{const a=__app;a.medals.dialog.hidden=true;a.world.playroom.music.stop();const render=a.renderer.render;a.renderer.render=()=>{};for(let i=0;i<120;i++)a.step(1/60);a.renderer.render=render;});
assert.equal(await page.evaluate(()=>__app.stats.danceSeconds),after.seconds);assert.deepEqual(errors,[]);
const result={before,after,entry:'production playhouse use with child avatar',input:'native touch-action button on focused physical play0; native dance button',time:'360 controlled production steps at 1/60s; test lazy rendering',stopped:'120 steps without music award nothing',errors,limits:'Chromium SwiftShader, local music; no Worker/two-client or physical phone claim'};fs.writeFileSync(`${out}/browser.json`,JSON.stringify(result,null,2));console.log('PASS actual music/dance, six real seconds +6, stopped music no award, visible medal',result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
