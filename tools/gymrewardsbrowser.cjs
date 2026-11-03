// #1828/#1836: native-E entry, explicit effort pulses, points/pause/medal card. Native effort input: gymeffortbrowser.cjs.
const fs=require('fs'),path=require('path'),kit=require('./testkit.cjs');
const game=process.argv[2]||'http://localhost:8911',out=process.argv[3]||'/tmp/gymrewards1828';
fs.mkdirSync(out,{recursive:true});const checks=[];let completed=false,driverError=null;
const check=(ok,message)=>{checks.push({ok:!!ok,message});console.log(`${ok?'PASS':'FAIL'} ${message}`);if(!ok)throw Error(message);};
(async()=>{const b=await kit.launch();try{
 const {page,ctx}=await kit.open(b,`${game}/?test=lazy&cloud=&at=-143,33,0,0,5&time=12&month=6&freeze&weather=clear`);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await kit.skipNameDialog(page);
 await page.evaluate(()=>__app.showOverlay(false));await page.evaluate(()=>document.getElementById('arm').hidden=false);await page.locator('#arm').click();
 await page.waitForFunction(()=>!!document.pointerLockElement,null,{polling:100,timeout:15000});
 await page.evaluate(()=>{const a=__app,s=a.outdoorGym.stations.find(s=>s.spec.id==='pullup');a.player.spawn(...s.entry,s.spot.yaw);a.camera.lookAt(s.target.pickable.position);a.step(.02);});
 await page.waitForFunction(()=>__app.focus().focused?.exercise==='pullup',null,{polling:100,timeout:15000});
 const before=await page.evaluate(()=>{const a=__app;for(let i=0;i<20;i++)a.step(.05);return {reps:a.stats.gymReps,points:a.stats.gymScore,sat:a.stats.sat,lay:a.stats.lay};});
 check(before.reps===0&&before.points===0,'standing at the station grants no repetitions or exercise points');
 // Warm the actual view while still standing; subsequent captures reuse its compiled programs.
 if(!process.env.GYM_REWARDS_LOGIC_ONLY)await kit.shot(page,path.join(out,'station-before-exercise.png'),{frames:1});
 await page.keyboard.press('KeyE');await page.waitForFunction(()=>__app.rest.active&&__app.rest.target.exercise==='pullup',null,{polling:100,timeout:10000});
 const first=await page.evaluate(()=>{const a=__app,g=a.outdoorGym;for(let i=0;i<20;i++)a.step(.05);const reps=a.stats.gymReps;for(let i=0;i<20&&!g.effort.peaked;i++){g.exert(a.rest);a.step(.1);}for(let i=0;i<80&&a.stats.gymReps===reps;i++)a.step(.05);
  // Freeze only exercise time for readable static result pictures, after the production callback has awarded a full cycle.
  const update=g.update;g.update=function(dt,rest){return update.call(this,0,rest)};window.restoreGymTime=()=>{g.update=update};
  return {reps:a.stats.gymReps,points:a.stats.gymScore,sat:a.stats.sat,lay:a.stats.lay,station:g.repetitions,total:a.totalScore(),score:document.querySelector('#score').textContent,badges:document.querySelector('#badges')?.textContent};});
 check(first.reps>=1&&first.points===first.reps,'full native-entered repetitions increment both count and daily exercise points once');
 check(first.sat===before.sat&&first.lay===before.lay,'gym entry grants no ordinary sit/lie reward');
 check(/Poäng/.test(first.score),'ordinary HUD score remains visible');
 if(!process.env.GYM_REWARDS_LOGIC_ONLY)await kit.shot(page,path.join(out,'exercise-points.png'),{frames:1});
 await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>!document.pointerLockElement,null,{polling:100,timeout:10000});
 const paused=await page.evaluate(()=>{const a=__app;window.restoreGymTime();const reps=a.stats.gymReps,points=a.stats.gymScore;for(let i=0;i<100;i++)a.step(.05);return reps===a.stats.gymReps&&points===a.stats.gymScore;});
 check(paused,'actual pause menu stops exercise counter and reward');
 await page.locator('#menu-medals').click();
 const progress=await page.evaluate(()=>{const card=[...document.querySelectorAll('.medal-card')].find(el=>el.textContent.includes('Utegymmare'));card?.scrollIntoView({block:'center'});return card?.textContent||'';});check(progress.includes(`${first.reps} / 100 repetitioner`),'Utegymmare shows actual counted progress towards its first level');
 if(!process.env.GYM_REWARDS_LOGIC_ONLY)await kit.shot(page,path.join(out,'gym-medal-progress.png'),{frames:1});
 await page.locator('#medal-dialog-close').click();await page.locator('#start-mouse').click();await page.waitForFunction(()=>!!document.pointerLockElement,null,{polling:100,timeout:15000});
 await page.evaluate(()=>{document.activeElement?.blur();__app.step(.02);});
 fs.writeFileSync(path.join(out,'checkpoint.json'),JSON.stringify({before,first,progress,paused,resume:await page.evaluate(()=>({locked:!!document.pointerLockElement,active:__app.rest.active,focused:document.activeElement?.id,overlayHidden:document.getElementById('overlay')?.hidden,medalsHidden:document.getElementById('medal-dialog').hidden}))},null,2)+'\n');
 await page.keyboard.press('KeyE');await page.waitForFunction(()=>!__app.rest.active,null,{polling:100,timeout:10000});
 const ended=await page.evaluate(()=>{const a=__app,n=a.stats.gymReps;for(let i=0;i<80;i++)a.step(.05);return {reps:a.stats.gymReps,unchanged:n===a.stats.gymReps,active:!!a.outdoorGym.active};});
 check(ended.unchanged&&!ended.active,'standing up cancels training without another repetition');
 check(errors.length===0,'route has no page errors');
 fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({before,first,progress,ended,errors,freeze:'exercise time held only while result pictures were captured; pause check restores actual update'},null,2)+'\n');
 completed=true;await ctx.close();
 }catch(e){driverError=String(e);throw e;}finally{await b.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:completed&&!driverError&&checks.every(c=>c.ok),completed,driverError,checks},null,2)+'\n')}})().catch(e=>{console.error(e);process.exitCode=1});
