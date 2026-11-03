// #1811: real keyboard/touch entry, equipment-specific exercise and safe exit in the app.
const fs=require('fs'),path=require('path');
const kit=require('./testkit.cjs');
const game=process.argv[2]||'http://127.0.0.1:8935',out=process.argv[3]||'/tmp/gym1811';
fs.mkdirSync(out,{recursive:true});const checks=[];let completed=false,driverError=null;
const check=(ok,message)=>{checks.push({ok:!!ok,message});console.log(`${ok?'PASS':'FAIL'} ${message}`);if(!ok)throw Error(message);};
async function routeThree(ctx){if(process.env.THREE_DIR)await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,new URL(r.request().url()).pathname.split('/three@0.170.0/')[1]),contentType:'text/javascript'}));}
async function place(page,id){return page.evaluate(id=>{const a=__app,s=a.outdoorGym.stations.find(s=>s.spec.id===id);a.player.spawn(...s.entry,s.spot.yaw);a.camera.lookAt(s.target.pickable.position);a.step(.02);return {x:a.player.pos.x,y:a.player.pos.y,z:a.player.pos.z,free:a.player.isFree(a.player.pos.x,a.player.pos.z,0)};},id);}
async function focused(page,id){await page.waitForFunction(id=>__app.focus().focused?.exercise===id,id,{polling:100,timeout:15000});}
async function exercise(page){return page.evaluate(()=>{const a=__app;for(let i=0;i<20;i++)a.step(.05);const s=a.outdoorGym.active,samples=[];for(let i=0;i<180;i++){a.step(.05);samples.push({eye:a.camera.position.toArray(),stock:s.stock?.position.y});}const range=k=>Math.max(...samples.map(k))-Math.min(...samples.map(k));return {id:s.spec.id,reps:a.outdoorGym.repetitions,dy:range(p=>p.eye[1]),dxz:range(p=>p.eye[0])+range(p=>p.eye[2]),log:s.stock?range(p=>p.stock):0};});}
(async()=>{const browser=await kit.launch();try{
  for(const phone of (process.env.GYM_TEST_MODE==='touch'?[true]:[false,true])){
    const ctx=await browser.newContext({viewport:phone?{width:844,height:390}:{width:900,height:560},deviceScaleFactor:1,hasTouch:phone,...phone?{isMobile:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1'}:{}});await routeThree(ctx);const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message);});
    await page.goto(`${game}/?test=lazy&cloud=&at=-110,48,45,-16,17&time=12&month=6&freeze&weather=clear`,{waitUntil:'commit'});await page.waitForFunction(()=>window.__app?.outdoorGym,null,{polling:100,timeout:240000});await kit.skipNameDialog(page);
    const inventory=await page.evaluate(()=>{const g=__app.outdoorGym;return {ids:g.targets.map(t=>t.exercise),meshes:g.group.children.filter(o=>o.isMesh&&o.visible).length,finite:g.group.children.filter(o=>o.isMesh).every(o=>o.geometry.attributes.position.array.every(Number.isFinite)),floor:g.stations.every(s=>s.entryGround<=s.base+.8)};});
    check(inventory.ids.join(',')==='pullup,press,step',`${phone?'touch':'desktop'}: three distinct exercise targets`);check(inventory.meshes===8&&inventory.finite&&inventory.floor,'bounded eight batched meshes and finite supported equipment');
    if(phone){if(await page.locator('#install-skip').isVisible())await page.locator('#install-skip').tap({timeout:5000});await page.locator('#start-go').tap({timeout:5000});}
    else {await page.evaluate(()=>__app.showOverlay(false));await page.evaluate(()=>document.getElementById('arm').hidden=false);await page.locator('#arm').click();await page.waitForFunction(()=>!!document.pointerLockElement,null,{polling:100,timeout:15000});}
    if(!phone)await kit.shot(page,path.join(out,'after-site.png'),{viewport:{width:1100,height:680},frames:2});
    for(const id of ['pullup','press','step']){
      const start=await place(page,id);check(start.free,`${id}: clear entry location`);await focused(page,id);
      if(phone)await page.locator('#action').tap();else await page.keyboard.press('KeyE');
      await page.waitForFunction(id=>__app.rest.active&&__app.rest.target.exercise===id,id,{polling:100,timeout:10000});
      const moved=await exercise(page);check(moved.reps>=2,`${phone?'touch':'keyboard'} ${id}: repeats while using equipment`);
      check(id==='press'?moved.log>.3&&moved.dy<.05:id==='step'?moved.dy>.3&&moved.dxz>.3:moved.dy>.3&&moved.dxz<.05,`${id}: equipment-specific movement`);
      await kit.shot(page,path.join(out,`${phone?'touch':'desktop'}-${id}.png`),{viewport:phone?{width:844,height:390}:{width:1000,height:620},frames:2});
      if(phone)await page.locator('#action').tap();else await page.keyboard.press(id==='press'?'KeyE':'Space');
      await page.waitForFunction(()=>!__app.rest.active,null,{polling:100,timeout:10000});
      const ended=await page.evaluate(()=>({p:__app.player.pos.toArray(),free:__app.player.isFree(__app.player.pos.x,__app.player.pos.z,0),active:!!__app.outdoorGym.active}));
      check(Math.hypot(ended.p[0]-start.x,ended.p[2]-start.z)<.01&&Math.abs(ended.p[1]-start.y)<.01&&ended.free&&!ended.active,`${id}: returns safely to the actual entry without active exercise`);
    }
    await place(page,'pullup');await focused(page,'pullup');if(phone)await page.locator('#action').tap();else await page.keyboard.press('KeyE');
    await page.waitForFunction(()=>__app.rest.active,null,{polling:100,timeout:10000});
    if(phone){await page.locator('#pause').tap();const paused=await page.evaluate(()=>{const a=__app,t=a.outdoorGym.elapsed;for(let i=0;i<20;i++)a.step(.05);return a.outdoorGym.elapsed===t;});check(paused,'touch menu pauses exercise');await page.locator('#to-start').tap();}
    else await page.evaluate(()=>__app.goToStart());
    check(await page.evaluate(()=>!__app.rest.active&&!__app.outdoorGym.active),'menu teleport cancels the gym through ordinary stand-up');
    check(errors.length===0,`${phone?'touch':'desktop'}: no page errors`);await ctx.close();
  }
completed=true;}catch(error){driverError=String(error);throw error;}finally{await browser.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:completed&&!driverError&&checks.every(c=>c.ok),completed,driverError,checks},null,2)+'\n');}})().catch(e=>{console.error(e);process.exitCode=1});
