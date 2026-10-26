// #1411: a supported landscape touch client fires the rotated table through the real action button.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const game=process.argv[2]||'http://localhost:8798',shots=process.env.SHOTS||'/tmp/billiardtouch';
let failed=0;const check=(ok,name,data)=>{console.log(`${ok?'PASS':'FAIL'} ${name} ${JSON.stringify(data)}`);if(!ok)failed++;};
(async()=>{fs.mkdirSync(shots,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('lunden.name','Barn');sessionStorage.setItem('lunden.nameSkipped','1');});
 await page.goto(`${game}/?shot&cloud=&mp=0&quality=3&time=12&month=6&freeze&test=lazy`,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app?.renderer&&window.__ghosts,null,{timeout:600000});
 await page.evaluate(async()=>{const a=window.__app,C=await import('/src/config.js');a.showOverlay(false);a.renderer.setAnimationLoop(null);a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.player.spawn(-28.85,22.7,Math.PI);for(let i=0;i<60;i++)a.player.update(1/60);const d=new a.camera.position.constructor(-28.85,.6,23.6).sub(a.camera.position);a.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');a.touch.enabled=true;document.body.classList.add('touch');a.step(0);a.step(0);a.use(a.focus().focused);});
 await page.waitForTimeout(900);
 const ready=await page.evaluate(()=>{const a=window.__app,b=a.world.playroom.billiards,o=b.object.position;a.player.spawn(o.x,o.z+b.c.length/2+.65,0);for(let i=0;i<30;i++)a.player.update(1/60);const d=new a.camera.position.constructor(o.x,b.c.height,o.z).sub(a.camera.position);a.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');a.step(0);a.step(0);a.testMode.setFull(true);a.testMode.draw();return{inside:a.player.inPlayroom,kind:a.focus().focused?.kind,localDirection:[b.direction.x,b.direction.z],yaw:b.object.rotation.y};});
 check(ready.inside&&ready.kind==='playroomBilliards'&&ready.localDirection[0]>.99,'landscape touch focuses the short end and aims down the table',ready);
 await page.screenshot({path:`${shots}/touch-before.png`});
 const action=page.locator('#action');check(await action.isVisible()&&/stöt/i.test(await action.textContent()),'native touch action offers a billiard stroke',await action.textContent());
 // #1637: tap = start charging (meter, 'Stöt N %' label, no stroke); walking away cancels; tap, wait, tap = a full stroke
 const steps=n=>page.evaluate(n=>{const a=window.__app,render=a.renderer.render;a.renderer.render=()=>{};for(let i=0;i<n;i++)a.step(1/60);a.renderer.render=render;a.testMode.draw();},n);
 await action.tap();await steps(60);
 const charge=await page.evaluate(()=>{const a=window.__app,b=a.world.playroom.billiards,m=document.getElementById('cue-power');return{power:b.chargePower,label:document.getElementById('action').textContent,meter:!m.hidden,keys:getComputedStyle(m.querySelector('.keys')).display,vx:b.physics.balls[0].vx};});
 check(charge.power>.55&&/^Stöt \d+ %$/.test(charge.label)&&charge.meter&&charge.keys==='none'&&charge.vx===0,'touch: first tap charges with a meter (no key hints) and a "Stöt N %" button',charge);
 await page.screenshot({path:`${shots}/touch-charge.png`});
 const away=await page.evaluate(()=>{const a=window.__app,b=a.world.playroom.billiards,o=b.object.position;a.player.spawn(o.x+1.6,o.z+2.4,Math.PI);for(let i=0;i<30;i++){a.player.update(1/60);a.step(1/60);}return{power:b.chargePower,meter:!document.getElementById('cue-power').hidden,vx:b.physics.balls[0].vx,kind:a.focus().focused?.kind};});
 check(away.power===null&&!away.meter&&away.vx===0,'touch: walking away from the table cancels the charge without a stroke',away);
 await page.evaluate(()=>{const a=window.__app,b=a.world.playroom.billiards,o=b.object.position;a.player.spawn(o.x,o.z+b.c.length/2+.65,0);for(let i=0;i<30;i++)a.player.update(1/60);const d=new a.camera.position.constructor(o.x,b.c.height,o.z).sub(a.camera.position);a.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');a.step(0);a.step(0);});
 await action.tap();await steps(150);await action.tap();
 const shot=await page.evaluate(()=>{const a=window.__app,b=a.world.playroom.billiards,started=b.strokeT>0,v=[b.physics.balls[0].vx,b.physics.balls[0].vz],start=b.physics.balls.map(q=>[q.x,q.z]),render=a.renderer.render;a.renderer.render=()=>{};for(let i=0;i<90;i++)a.step(1/60);a.renderer.render=render;a.testMode.draw();return{started,v,moved:b.physics.balls.filter((q,i)=>Math.hypot(q.x-start[i][0],q.z-start[i][1])>.02).length};});
 check(shot.started&&shot.v[0]>2&&Math.abs(shot.v[1])<.01&&shot.moved>5,'native touch sends a local forward break through the rotated rack',shot);
 await page.screenshot({path:`${shots}/touch-after.png`});check(errors.length===0,'no page errors',errors);
}finally{await browser.close();}console.log(failed?`${failed} FAILED`:'ALL PASSED');process.exit(failed?1:0);})();
