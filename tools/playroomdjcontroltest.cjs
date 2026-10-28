// #1664: actual Playroom + the production DJInput used by main. Native desktop E/arrows and touch surface taps.
// Deliberately excludes unrelated full-world startup; main's readiness/use/focus wiring is reviewed separately.
const fs=require('node:fs'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const [game='http://localhost:8771',out='docs/verification/1664']=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch(['--autoplay-policy=no-user-gesture-required']);
try {
 const page=await browser.newPage({viewport:{width:1100,height:700},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${game}/tools/djcontroltest.html`);await page.waitForFunction(()=>window.done,null,{timeout:30000});assert.equal(await page.evaluate(()=>window.error),undefined);console.log('fixture ready');
 // #1667: actual geometry/label ink must stay inside the black panel, including the four edge rows.
 const layout=await page.evaluate(async()=>{
   const T=await import('three'),f=fixture,D=f.R.dj,P=D.panel,c=f.room.djControls;f.draw();
   const boxes=c.pickables.map(p=>{const b=new T.Box3().setFromObject(p);return{id:p.userData.door.id,x0:b.min.x-c.origin.x,x1:b.max.x-c.origin.x,z0:b.min.z-c.origin.z,z1:b.max.z-c.origin.z}});
   const outside=[...boxes,...c.labelBounds].filter(b=>b.x0 < -P.w/2+P.margin-1e-4||b.x1>P.w/2-P.margin+1e-4||b.z0< -P.d/2+P.margin-1e-4||b.z1>P.d/2-P.margin+1e-4);
   const m=f.room.turntables[0].children[0].material,pixels=m.map.image.getContext('2d').getImageData(0,0,m.map.image.width,m.map.image.height).data,values=[];for(let i=0;i<pixels.length;i+=4)values.push(pixels[i]);
   const inkOccluded=[];
   for(const b of c.labelBounds) {
     const ray=new T.Raycaster(new T.Vector3(c.origin.x+(b.x0+b.x1)/2,c.origin.y+.1,c.origin.z+(b.z0+b.z1)/2),new T.Vector3(0,-1,0));ray.camera=f.camera;
     const hit=ray.intersectObject(f.room.object,true).find(h=>h.object.isMesh && h.object.material?.visible!==false && h.object.visible);
     if(hit?.object!==c.face)inkOccluded.push(b.text);
   }
   let lights=0;f.scene.traverse(o=>{if(o.isLight)lights++});
   window.buttonSurface=id=>{const b=c.buttons.find(b=>b.id===id),ray=new T.Raycaster(new T.Vector3(c.origin.x+b.x,c.origin.y+1,c.origin.z+b.z),new T.Vector3(0,-1,0));f.scene.updateMatrixWorld(true);const hit=ray.intersectObjects([c.offButtons,c.litButtons]).filter(h=>h.object.visible)[0],label=ray.intersectObject(c.face)[0];return{y:hit.point.y,lit:hit.object===c.litButtons,labelY:label.point.y}};
   return{outside,inkOccluded,picks:boxes.length,ink:c.labelBounds.length,roughness:m.roughness,vinylRange:Math.max(...values)-Math.min(...values),lights,off:buttonSurface('play0')};
 });
 assert.deepEqual(layout.outside,[]);assert.deepEqual(layout.inkOccluded,[]);assert.ok(layout.roughness<.35);assert.ok(layout.vinylRange>40);assert.equal(layout.lights,1,'fixture ambient only, DJ adds no lights');
 console.log('panel/ink/shine layout passed',layout);
 const value=fn=>page.evaluate(fn);
 const aim=async id=>page.evaluate(id=>{const f=fixture,t=f.room.djControls.controls.find(t=>t.id===id);f.camera.lookAt(t.pickable.position);f.draw();return f.focus()?.id},id);
 const tap=async(id,offset=0)=>{await page.evaluate(()=>fixture.view());const p=await page.evaluate(({id,offset})=>{const f=fixture,t=f.room.djControls.controls.find(t=>t.id===id),v=t.pickable.position.clone();v.x+=offset;v.project(f.camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2}},{id,offset});await page.touchscreen.tap(p.x,p.y);};
 assert.equal(await aim('play0'),'play0');await page.keyboard.press('e');assert.equal(await value(()=>fixture.room.music.dj.on[0]),true);
 const pressed=await value(()=>buttonSurface('play0'));assert.equal(pressed.lit,true);assert.ok(Math.abs(layout.off.y-pressed.y-.006)<1e-4);assert.ok(Math.abs(layout.off.labelY-pressed.labelY-.006)<1e-4,'button label follows pressed face');
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
 // The receiver applies the same bounded DJ snapshot/production sync as a room observer; dance uses its existing peer pose.
 const observed=await page.evaluate(async()=>{const f=fixture,o=await f.observe();f.renderer.render(f.scene,f.camera);return{on:o.music.dj.on,shuffle:o.music.dj.shuffle,dancing:o.music.dancing,danceActive:o.music.danceActive,lit:o.djControls.litButtons.geometry.attributes.position.count}});
 assert.deepEqual(observed.on,[false,true]);assert.equal(observed.shuffle,true);assert.equal(observed.dancing,false);assert.equal(observed.danceActive,true);assert.equal(observed.lit,3*24,'play B, shuffle and peer dance pressed/emissive');
 await page.screenshot({path:`${out}/dj-observer.png`});
 await page.evaluate(()=>{const f=fixture;f.observer.object.visible=false;f.room.object.visible=true;f.camera.up.set(0,0,1);f.camera.position.set(f.R.x+f.R.dj.x,f.R.dj.h+f.R.dj.panel.top+1.05,f.R.z+f.R.dj.z);f.camera.lookAt(f.R.x+f.R.dj.x,f.R.dj.h,f.R.z+f.R.dj.z);f.draw();f.renderer.render(f.scene,f.camera)});
 await page.screenshot({path:`${out}/dj-top.png`});
 await page.evaluate(()=>{const f=fixture;f.camera.up.set(0,1,0);f.camera.position.set(f.R.x+f.R.dj.x+.42,1.2,f.R.z+f.R.dj.z-.21);f.camera.lookAt(f.R.x+f.R.dj.x+.42,1.035,f.R.z+f.R.dj.z+.205);f.draw();f.renderer.render(f.scene,f.camera)});
 await page.screenshot({path:`${out}/dj-buttons-close.png`});
 await page.evaluate(()=>{fixture.camera.up.set(0,1,0);fixture.view()});
 await tap('stop');assert.equal(await value(()=>fixture.room.music.state),'off');assert.equal(await value(()=>fixture.room.music.dancing),false);
 await page.evaluate(()=>{fixture.view();fixture.renderer.render(fixture.scene,fixture.camera)});await page.screenshot({path:`${out}/dj-stopped.png`});
 assert.deepEqual(errors,[]);const result={desktop:'native E/play, side-specific arrows, crossfader/channel fader',touch:'native physical play, next, crossfader endpoint, shuffle, master down/up, dance, stop',gates:'ready/menu and walls refuse actions',noMenu:true,layout,pressed,observed,errors,scope:'Production DJInput + actual Playroom, Chromium SwiftShader, emulated touch. Whole-world startup and physical phone not verified.'};fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));console.log(result);
} finally {await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
