// #1664: actual Playroom + the production DJInput used by main. Native desktop E/arrows and touch surface taps.
// Deliberately excludes unrelated full-world startup; main's readiness/use/focus wiring is reviewed separately.
const fs=require('node:fs'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const [game='http://localhost:8771',out='docs/verification/1664']=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch(['--autoplay-policy=no-user-gesture-required']);
try {
 const page=await browser.newPage({viewport:{width:1100,height:700},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${game}/tools/djcontroltest.html`);await page.waitForFunction(()=>window.done,null,{timeout:30000});assert.equal(await page.evaluate(()=>window.error),undefined);console.log('fixture ready');
 const value=fn=>page.evaluate(fn);
 const aim=async id=>page.evaluate(id=>{const f=fixture,t=f.room.djControls.controls.find(t=>t.id===id);f.camera.lookAt(t.pickable.position);f.draw();return f.focus()?.id},id);
 const tap=async(id,offset=0)=>{await page.evaluate(()=>fixture.view());const p=await page.evaluate(({id,offset})=>{const f=fixture,t=f.room.djControls.controls.find(t=>t.id===id),v=t.pickable.position.clone();v.x+=offset;v.project(f.camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2}},{id,offset});await page.touchscreen.tap(p.x,p.y);};
 assert.equal(await aim('play0'),'play0');await page.keyboard.press('e');assert.equal(await value(()=>fixture.room.music.dj.on[0]),true);
 await aim('record1');await page.keyboard.press('ArrowRight');assert.deepEqual(await value(()=>fixture.room.music.dj.ix),[0,2]);
 await aim('play1');await page.keyboard.press('e');assert.deepEqual(await value(()=>fixture.room.music.dj.on),[true,true]);
 await aim('cross');await page.keyboard.press('ArrowRight');assert.equal(await value(()=>fixture.room.music.dj.cross),.1);
 await aim('gain0');await page.keyboard.press('ArrowLeft');assert.equal(await value(()=>fixture.room.music.dj.gain[0]),.9);
 console.log('desktop passed');
 // The host's reading/menu/measurement gate and wall gate suppress both key and pointer actions.
 await page.evaluate(()=>{fixture.state.ready=false});await aim('play1');await page.keyboard.press('e');assert.equal(await value(()=>fixture.room.music.dj.on[1]),true);
 await page.evaluate(()=>{fixture.state.ready=true;fixture.state.touch=true;fixture.state.blocked=true});await tap('play0');assert.equal(await value(()=>fixture.room.music.dj.on[0]),true);
 await page.evaluate(()=>fixture.state.blocked=false);
 await tap('play0');assert.equal(await value(()=>fixture.room.music.dj.on[0]),false);
 await tap('track11');assert.equal(await value(()=>fixture.room.music.dj.ix[1]),3);
 await tap('cross',-.11);assert.equal(await value(()=>fixture.room.music.dj.cross),.9);
 await tap('shuffle');assert.equal(await value(()=>fixture.room.music.dj.shuffle),true);
 await tap('master',-.03);assert.equal(await value(()=>fixture.room.music.dj.volume),6);
 await tap('master',.03);assert.equal(await value(()=>fixture.room.music.dj.volume),5);
 console.log('touch controls passed');
 await tap('dance');assert.equal(await value(()=>fixture.room.music.dancing),true);
 await page.evaluate(()=>{fixture.view();fixture.renderer.render(fixture.scene,fixture.camera)});await page.screenshot({path:`${out}/dj-controls.png`});
 await tap('stop');assert.equal(await value(()=>fixture.room.music.state),'off');assert.equal(await value(()=>fixture.room.music.dancing),false);
 await page.evaluate(()=>{fixture.view();fixture.renderer.render(fixture.scene,fixture.camera)});await page.screenshot({path:`${out}/dj-stopped.png`});
 assert.deepEqual(errors,[]);const result={desktop:'native E/play, side-specific arrows, crossfader/channel fader',touch:'native physical play, next, crossfader endpoint, shuffle, master down/up, dance, stop',gates:'ready/menu and walls refuse actions',noMenu:true,errors,scope:'Production DJInput + actual Playroom, Chromium SwiftShader, emulated touch. Whole-world startup and physical phone not verified.'};fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));console.log(result);
} finally {await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
