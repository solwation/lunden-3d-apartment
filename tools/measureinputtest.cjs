// Full original apartment, actual main input, native pointer lock/CDP touch and WebGL.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const base=process.argv[2]||'http://localhost:8168',out=process.argv[3]||'/tmp/lunden-measure-1069';
fs.mkdirSync(out,{recursive:true});
const results=[];const check=(ok,name)=>{results.push({name,pass:!!ok});fs.writeFileSync(`${out}/checks.json`,JSON.stringify(results,null,2));assert.ok(ok,name);console.log('PASS',name)};
const hashes=Object.fromEntries(cp.execFileSync('git',['ls-files','src','data','index.html','tools/measureinputtest.cjs'],{encoding:'utf8'}).trim().split('\n').concat(['tools/measureinputtest.cjs']).map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
fs.writeFileSync(`${out}/sources.json`,JSON.stringify({base:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hashes},null,2));
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
 for(const mobile of [false,true]){
  const mode=mobile?'mobile':'desktop';const ctx=await b.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});const p=await ctx.newPage();const errors=[],failed=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()}));
  await p.goto(`${base}/?test=lazy&freeze&at=2.8,9,90,0${mobile?'&phone':''}`,{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.__app,null,{timeout:90000,polling:250});
  if(mobile)await p.locator('#start-go').tap();else await p.locator('#start-mouse').click();
  await p.waitForFunction(m=>m?__app.touch.enabled:document.pointerLockElement===__app.renderer.domElement,mobile,{timeout:10000,polling:100});
  check(await p.evaluate(()=>!!__app.renderer.getContext().getParameter(__app.renderer.getContext().VERSION)),`${mode}: real WebGL context`);
  if(mobile)await p.locator('#measure-btn').tap();else await p.keyboard.press('q');
  check(await p.evaluate(()=>__app.measure.active&&__app.measure.points.length===0&&document.getElementById('measure-btn').getAttribute('aria-pressed')==='true'),`${mode}: enabling waits for first pick`);
  const pick=async(x,y)=>{if(mobile)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y)};
  if(!mobile){
   await pick(640,360);await p.evaluate(()=>{__app.camera.rotation.y=-Math.PI/2;__app.step(1/60)});await pick(640,360);
   const distance=await p.evaluate(()=>__app.measure.points[0].distanceTo(__app.measure.points[1]));check(Math.abs(distance-5.35)<.03,`desktop: actual living-room walls ${distance.toFixed(3)} m`);
   // Same wall in the view for a legible two-marker screenshot.
   await p.keyboard.press('q');await p.keyboard.press('q');
   await p.evaluate(()=>{__app.player.spawn(2.8,9,0);__app.camera.rotation.x=-.5;__app.step(1/60)});
   await pick(640,360);await p.evaluate(()=>{__app.camera.rotation.y=.28;__app.step(1/60)});await pick(640,360);
  }else{
   await p.evaluate(()=>{__app.player.spawn(2.8,9,0);__app.camera.rotation.x=-.5;__app.step(1/60)});
   await pick(390,190);await pick(490,220);
  }
  check(await p.evaluate(()=>__app.measure.points.length===2&&__app.measure.line.visible&&__app.measure.markers.every(m=>m.visible)&&!document.getElementById('measure').hidden),`${mode}: two surface points, visible markers/line/read-out`);
  await p.evaluate(()=>{__app.step(1/60);__app.testMode.draw()});await p.screenshot({path:`${out}/${mode}-measurement.png`});
  await pick(mobile?460:640,mobile?200:360);
  check(await p.evaluate(()=>__app.measure.points.length===1&&!__app.measure.line.visible&&!__app.measure.markers[1].visible),`${mode}: third pick begins new pair`);
  if(mobile){
   const cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:600,y:220,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:630,y:220,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:600,y:220,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   check(await p.evaluate(()=>__app.measure.points.length===1),'mobile: out-and-back camera drag is not a pick');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:600,y:220,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});check(await p.evaluate(()=>__app.measure.points.length===1),'mobile: cancelled touch is not a pick');
   await p.locator('#measure-btn').tap();
  }else await p.keyboard.press('q');
  check(await p.evaluate(()=>!__app.measure.active&&__app.measure.points.length===0&&!__app.measure.line.visible&&document.getElementById('measure').hidden&&document.getElementById('measure-help').hidden),`${mode}: switching off clears geometry and HUD`);
  // Real freezer door and a real rifle: measurement must consume their usual action input.
  const prepare=await p.evaluate(()=>{const a=__app,V=a.camera.position.constructor;a.player.spawn(4.3,4.1,0);a.step(1/60);const pos=a.fish.freezer.door.children[0].getWorldPosition(new V()).setY(1);const dx=pos.x-a.camera.position.x,dz=pos.z-a.camera.position.z;a.camera.rotation.set(Math.atan2(pos.y-a.camera.position.y,Math.hypot(dx,dz)),Math.atan2(-dx,-dz),0,'YXZ');a.step(1/60);return {open:a.fish.freezer.isOpen,focus:a.focus().focused?.name};});
  if(mobile)await p.locator('#measure-btn').tap();else await p.keyboard.press('q');
  await pick(mobile?422:640,mobile?195:360);
  check(await p.evaluate(open=>__app.fish.freezer.isOpen===open,prepare.open),`${mode}: measurement click leaves real freezer unchanged (focus: ${prepare.focus})`);
  if(!mobile){await p.keyboard.press('e');check(await p.evaluate(open=>__app.fish.freezer.isOpen===open,prepare.open),'desktop: E cannot use door during measurement');}
  const rifleReady=await p.evaluate(()=>{const rifle=__app.things.find(t=>t.isRifle);rifle.take();return __app.heldItem()===rifle});check(rifleReady,`${mode}: real rifle held`);
  if(!mobile){const count=await p.evaluate(()=>__app.measure.points.length);await p.mouse.click(640,360,{button:'right'});check(await p.evaluate(n=>__app.measure.points.length===n,count),'desktop: right click neither picks nor uses held item');}
  const ammo=await p.evaluate(()=>{const r=__app.heldItem();return{ammo:r.ammo,shots:__app.stats.shots}});
  await pick(mobile?450:640,mobile?195:360);
  check(await p.evaluate(v=>{const r=__app.heldItem();return r.ammo===v.ammo&&__app.stats.shots===v.shots},ammo),`${mode}: measurement does not fire held rifle`);
  if(mobile)await p.locator('#measure-btn').tap();else await p.keyboard.press('q');
  await p.evaluate(()=>{__app.heldItem().putBack();__app.step(1/60)});
  if(!mobile){await pick(640,360);check(await p.evaluate(open=>__app.fish.freezer.isOpen!==open,prepare.open),'desktop: ordinary door click works again after measurement');}
  check(errors.length===0,`${mode}: no browser exceptions`);
  fs.writeFileSync(`${out}/${mode}-network.json`,JSON.stringify({errors,failed},null,2));await ctx.close();
 }
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
