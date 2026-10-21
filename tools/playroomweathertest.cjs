// Actual app: reported off-map precipitation, roof guard, all clubhouse rooms and exit.
// GAME OUT. No Worker/YouTube required.
const fs=require('fs'),assert=require('assert/strict');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const[game,out]=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const p=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`${game}/?shot&test=lazy&cloud=&mp=0&weather=rain&freeze&time=12&month=10`,{waitUntil:'commit'});await p.waitForFunction(()=>window.__app?.playroom||window.__app?.world?.playroom,null,{timeout:180000});
 await p.evaluate(async()=>{const a=__app,C=await import('/src/config.js');a.avatarCustomizer.setLook({...C.decodeAvatarLook('241302112','me'),height:140});a.showOverlay(false);a.use({kind:'playhouse'});});await p.waitForFunction(()=>__app.player.inPlayroom);await p.waitForTimeout(600);
 const result=await p.evaluate(async()=>{
  const a=__app,{PLAYROOM:R}=await import('/src/config.js'),w=a.weather,r=a.world.playroom,b=r.bounds,original=w.extraBoxes;const stats=[];
  const count=()=>{if(!(w.kind==='rain'?w.lines.visible:w.flakes.visible))return{inside:0,visible:0};let inside=0,visible=0;const rain=w.kind==='rain',data=rain?w.pos:w.fpos,stride=rain?6:3,n=rain?w.geo.drawRange.count/2:w.fgeo.drawRange.count;for(let i=0;i<n;i++){const o=i*stride;for(const q of rain?[o,o+3]:[o]){const x=data[q],y=data[q+1],z=data[q+2];if(y>0&&y<r.ceiling){visible++;if(x>b.x0&&x<b.x1&&z>b.z0&&z<b.z1)inside++;}}}return{inside,visible};};
  const pose=(x,z)=>{a.player.spawn(R.x+x,R.z+z,0);a.player.update(0);a.camera.lookAt(R.x,R.ceiling/2,R.z+4);};
  pose(0,2.2);w.extraBoxes=()=>a.car.box();w.seeded=null;let before=0;for(let i=0;i<120;i++){w.update(1/30,true);before+=count().inside;}w.extraBoxes=original;
  a.step(0);const entryDry=!w.lines.visible&&!w.flakes.visible;
  for(const kind of ['rain','snow','hail'])for(const [room,x,z] of [['BIO',-7,-2],['BILJARD',0,-2],['SPEL',6,-1],['HALL',0,3]]){pose(x,z);w.force=kind;w.seeded=null;let inside=0;for(let i=0;i<120;i++){w.update(1/30,true,0,null,a.player.inPlayroom);inside+=count().inside;}stats.push({kind,room,inside,active:kind==='rain'?w.lines.visible:w.flakes.visible});}
  w.force='rain';w.seeded=null;pose(0,2.2);a.camera.lookAt(R.x-2,1.4,R.z-2);a.step(0);a.testMode.draw();return{before,entryDry,ceiling:r.ceiling,stats};
 });fs.writeFileSync(`${out}/particle-result.json`,JSON.stringify(result,null,2));console.log('PARTICLE COUNTS',result);assert(result.before>0);assert(result.entryDry);assert(result.stats.every(s=>s.inside===0&&!s.active));console.log('PASS reproduced old leak; no precipitation drawn inside any of the four rooms',result);
 await p.screenshot({path:`${out}/dry-clubhouse.png`});
 await p.evaluate(()=>__app.use({kind:'playroomExit'}));await p.waitForFunction(()=>!__app.player.inPlayroom);await p.waitForTimeout(600);
 const outside=await p.evaluate(()=>{const a=__app,w=a.weather;w.force='rain';w.seeded=null;for(let i=0;i<120;i++)w.update(1/30,false);return{outdoors:a.player.outdoors,visible:w.lines.visible,count:w.geo.drawRange.count,at:a.player.pos.toArray(),roof:w.roofAt(a.player.pos.x,a.player.pos.z),ceiling:a.world.playroom.ceiling};});assert(outside.outdoors&&outside.visible&&outside.count>0);assert(outside.roof!==outside.ceiling);assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({result,outside,errors},null,2));console.log('PASS actual exit retains outdoor rain, no page exceptions',outside);
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
