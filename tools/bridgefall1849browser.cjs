const fs=require('node:fs'),path=require('node:path'),kit=require('./testkit.cjs');
const out=process.argv[3]||'docs/verification/1849', base=process.argv[2]||'http://localhost:8916';
(async()=>{const browser=await kit.launch();try{
 const ctx=await browser.newContext({viewport:kit.SMALL,hasTouch:true});const page=await ctx.newPage();
 await page.goto(base+'/?shot&cloud=&month=6&time=13&freeze&weather=clear&at=-137,195.4,270,0&test=lazy',{waitUntil:'commit'});await page.waitForFunction(()=>window.__app?.player,null,{timeout:240000});await kit.skipNameDialog(page);
 await page.evaluate(async()=>{const A=window.__app;A.showOverlay(false);A.touch.enabled=false;A.player.spawn(-137,195.4,Math.PI*1.5);window.proof={A,results:[]};});
 await kit.shot(page,path.join(out,'before-location.png'));
 const before=await page.evaluate(()=>{const {A}=proof,p=A.player;p.keys.add('KeyW');p.keys.add('ShiftLeft');const trace=[];for(let i=0;i<40;i++){p.update(.05);if(i<5||i%10===0)trace.push({i,pos:p.pos.toArray(),g:p.groundAt(p.pos.x,p.pos.z,p.pos.y)});}p.keys.clear();return trace;});
 fs.writeFileSync(path.join(out,'before.json'),JSON.stringify(before,null,2));console.log('BEFORE',JSON.stringify(before));await kit.shot(page,path.join(out,'before-fall.png'));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
