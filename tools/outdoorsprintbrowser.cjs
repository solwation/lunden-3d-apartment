// #1832: retained real-world sprint contracts, then actual native keyboard and touch input in one app.
const fs=require('fs'),path=require('path'),kit=require('./testkit.cjs');
const game=process.argv[2]||'http://localhost:8911',out=process.argv[3]||'/tmp/sprint1832';fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[];let completed=false,driverError=null;
const check=(ok,message)=>{checks.push({ok:!!ok,message});console.log(`${ok?'PASS':'FAIL'} ${message}`);if(!ok)throw Error(message)};
(async()=>{const browser=await kit.launch();try{
 if(!process.env.SPRINT_APP_ONLY){
 const fixture=await browser.newPage();fixture.on('pageerror',e=>errors.push(e.message));await fixture.goto(`${game}/tools/walktest.html?sprint`);
 await fixture.waitForFunction(()=>/^(ALL PASS|SOME FAILED)/.test(document.querySelector('#out')?.textContent),null,{polling:100,timeout:180000});
 const walk=await fixture.locator('#out').textContent();fs.writeFileSync(path.join(out,'walk-sprint.txt'),walk);check(walk.startsWith('ALL PASS'),'existing real-world sprint/door/barrier contracts pass');await fixture.close();
 }else check(fs.readFileSync(path.join(out,'walk-sprint.txt'),'utf8').startsWith('ALL PASS'),'reuse unchanged green eight-contract World sprint fixture');
 const {page,ctx}=await kit.open(browser,`${game}/?test=lazy&cloud=&at=2.875,-12,90,0&time=12&month=6&freeze&weather=clear`,{viewport:{width:900,height:560}});
 page.on('pageerror',e=>errors.push(e.message));await kit.skipNameDialog(page);await page.evaluate(()=>__app.showOverlay(false));await page.evaluate(()=>document.getElementById('arm').hidden=false);await page.locator('#arm').click();await page.waitForFunction(()=>!!document.pointerLockElement,null,{polling:100,timeout:15000});
 async function sample({inside=false,baseline=false,seconds=1,touch=false,route=null}={}) {return page.evaluate(async opt=>{
  const a=__app,p=a.player,{PLAYER,START}=await import('/src/config.js'),configured=PLAYER.runOutdoor;
  if(opt.baseline)PLAYER.runOutdoor=PLAYER.run;
  if(opt.touch)a.step(.001); // production main copies the real joystick axes to Player
  const start=opt.route?.start||[opt.inside?1.3:START.x,opt.inside ? .8 : START.z],yaw=opt.route?.yaw??(opt.inside?Math.PI:Math.PI/2);
  p.spawn(...start,yaw);const from=p.pos.clone(),input={keys:[...p.keys],analog:{...p.analog}};
  for(let i=0;i<Math.round(opt.seconds*60);i++)p.update(1/60);
  const to=p.pos.clone(),distance=Math.hypot(to.x-from.x,to.z-from.z),state={from:from.toArray(),to:to.toArray(),distance,speed:distance/opt.seconds,input,outdoors:p.outdoors,sprinting:!!p.sprinting};
  p.keys.clear();p.analog.x=p.analog.y=0;if(opt.touch)a.touch.analog.x=a.touch.analog.y=0;PLAYER.runOutdoor=configured;return state;
 },{inside,baseline,seconds,touch,route});}
 async function keyboard(opt,run=true){if(run)await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');const result=await sample(opt);await page.keyboard.up('KeyW');if(run)await page.keyboard.up('ShiftLeft');return result;}
 const walkResult=await keyboard({},false),outside=await keyboard({}),inside=await keyboard({inside:true,seconds:.2});
 check(Math.abs(walkResult.speed-1.6)<.01,'actual keyboard walk remains1.6m/s');
 check(outside.input.keys.includes('ShiftLeft')&&Math.abs(outside.speed-4.8)<.01,'actual Shift key runs outdoors at4.8m/s');
 check(Math.abs(inside.speed-3.2)<.01&&!inside.outdoors,'actual indoor Shift run remains3.2m/s');
 const route=await page.evaluate(async()=>{const {SITE}=await import('/src/config.js'),p=__app.player;
  for(const source of ['44447973','95035891','148276374']){const route=SITE.riverPark.paths.find(r=>r.source===source);if(!route)continue;for(let i=0;i+1<route.path.length;i++){
    const a=route.path[i],b=route.path[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<35)continue;
    const start=[a[0]+dx*.2,a[1]+dz*.2],yaw=Math.atan2(-dx,-dz);p.spawn(...start,yaw);
    if([0,4,8,12,16].every(d=>p.isFree(start[0]+dx/len*d,start[1]+dz/len*d,0)))return{source,start,yaw};
  }}throw Error('No clear candidate park path for the scoped result route');});
 const before=await keyboard({route,seconds:3,baseline:true});await kit.shot(page,path.join(out,'before-outdoor-route.png'),{frames:1});
 const after=await keyboard({route,seconds:3});await kit.shot(page,path.join(out,'after-outdoor-route.png'),{frames:1});
 check(Math.abs(before.distance-9.6)<.05&&Math.abs(after.distance-14.4)<.05,'same real park path:3seconds reaches9.6m before and14.4m after');
 await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>!document.pointerLockElement,null,{polling:100,timeout:10000});await page.locator('#start-touch').click();await page.waitForFunction(()=>__app.touch.enabled,null,{polling:100,timeout:10000});
 const point=await page.evaluate(()=>({x:120,y:innerHeight*.75,travel:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stick-travel'))}));
 const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-point.travel-8}]});
 check(await page.evaluate(()=>__app.touch.analog.y>.99),'actual touch drag reaches the existing full-stick sprint threshold');
 const touch=await sample({touch:true});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 check(Math.abs(touch.speed-4.8)<.01&&touch.input.analog.y>.99,'actual full touch stick uses4.8m/s outdoors');
 check(errors.length===0,'movement route has no page errors');
 fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({walk:walkResult,outside,inside,route,before,after,touch,errors,limits:'Native inputs with controlled ordinary Player updates; baseline comparison changes only runOutdoor to retained indoor3.2. No hardware FPS claim.'},null,2)+'\n');completed=true;await ctx.close();
 }catch(e){driverError=String(e);throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:completed&&!driverError&&checks.every(c=>c.ok),completed,driverError,checks,errors},null,2)+'\n')}})().catch(e=>{console.error(e);process.exitCode=1});
