// Run from repository root with PLAYWRIGHT_MODULE and CHROME_PATH.
// Before parent served on8360; reviewed source served on8359.
const fs=require('fs'),path=require('path');
const kit=require(path.resolve('tools/testkit.cjs'));
(async()=>{const b=await kit.launch();try{for(const [kind,base] of [['before','http://localhost:8360'],['after','http://localhost:8359']]){
 const url=base+'/?test=lazy&shot&cloud=&month=7&day=15&time=12&weather=clear&freeze&at=27,389,0,-90,110';
 const {ctx,page}=await kit.open(b,url,{timeout:240000,wait:false});
 const errors=[],httpErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)httpErrors.push({url:r.url(),status:r.status()});});
 await require(process.cwd()+'/tools/semanticwait.cjs').waitForState(page,()=>window.__app?.renderer,null,{timeout:240000,polling:500});
 if(await page.locator('#player-dialog').isVisible())await page.locator('#player-skip').click();
 await require(process.cwd()+'/tools/semanticwait.cjs').waitForState(page,()=>document.querySelector('#player-dialog').hidden,null,{timeout:10000,polling:100});
 for(const [view,pose] of [['overhead',[27,389,0,-Math.PI/2,110]],['ground',[-3,402,-Math.PI/2,-.045,4.2]]]){
  await page.evaluate(([x,z,yaw,pitch,y])=>{const a=__app;a.player.pos.set(x,y,z);a.player.eyeY=y+1.62;a.camera.position.set(x,y+1.62,z);a.camera.rotation.set(pitch,yaw,0,'YXZ');},pose);
  await kit.shot(page,path.resolve('docs/verification/1446',`${view}-${kind}.png`),{frames:3,timeout:240000});
  const state=await page.evaluate(()=>({camera:__app.camera.position.toArray(),rotation:__app.camera.rotation.toArray(),month:__app.day.month,hour:__app.day.hour,scenario:location.search,profileDialogHidden:document.querySelector('#player-dialog').hidden,start:document.querySelector('#start')?.hidden,errors:document.querySelector('#error')?.textContent}));
  fs.writeFileSync(path.resolve('docs/verification/1446',`${view}-${kind}.json`),JSON.stringify({source:kind==='before'?'f9ef2cc0f527af9423b1e5f366af868ae013e9ba':'b361f59ab3253d8d0b4155945c15b31bf124f8eb',url,state,errors,httpErrors},null,2)+'\n');console.log(kind,view,JSON.stringify(state));
 }
 await ctx.close();
}}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
