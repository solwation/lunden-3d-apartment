// #1641: the BIO film's volume follows the screen plus the 7.1/height speakers. GAME_URL [OUT]
const assert=require('assert/strict'),fs=require('fs');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const[game,out]=process.argv.slice(2);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const p=await b.newPage({viewport:{width:900,height:600}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('lunden.name','Bio test');sessionStorage.setItem('lunden.nameSkipped','1');});
 await p.goto(`${game}/?shot&test=lazy&freeze&time=12&month=6`,{waitUntil:'commit'});await p.waitForFunction(()=>window.__app?.cinema,null,{timeout:180000});
 const r=await p.evaluate(async()=>{const a=__app,{PLAYROOM:R}=await import('/src/config.js'),{tvVolume,TVVolume}=await import('/src/tvsound.js');
  const sp=a.cinema.soundSpeakers,screen=a.cinema.soundSource.getWorldPosition(new a.camera.position.constructor());
  const c=R.furniture.cinema,seat={x:R.x+c.seat.rowX[1],y:1.1,z:R.z+(c.seat.z[1]+c.seat.z[2])/2},fwd={x:-1,y:0,z:0};
  const vol=(l,f=fwd,list=sp)=>tvVolume(screen,l,f,undefined,list);
  const rear=sp.filter(s=>s.kind==='rear')[0],sur=sp.filter(s=>s.kind==='surround')[0];
  const nearRear={x:rear.x+.5,y:rear.y,z:rear.z},nearSur={x:sur.x,y:sur.y,z:sur.z+(sur.z<R.z?.5:-.5)};
  // the live update loop: a fake player records setVolume
  const got=[],tv=new TVVolume(),cam={position:{...seat,clone(){return{...this};}},getWorldDirection(v){Object.assign(v,fwd);}};
  tv.update({setVolume:v=>got.push(v)},cam,{getWorldPosition:v=>Object.assign(v,screen)},true,sp);
  return{count:sp.length,kinds:sp.map(s=>s.kind),positions:sp.map(s=>[s.kind,+s.x.toFixed(2),+s.y.toFixed(2),+s.z.toFixed(2)]),
   seatScreenOnly:vol(seat,fwd,null),seatAll:vol(seat),nearRearScreenOnly:vol(nearRear,{x:-1,y:0,z:0},null),nearRearAll:vol(nearRear),
   nearSurroundAll:vol(nearSur),nearSurroundScreenOnly:vol(nearSur,fwd,null),farBackAll:vol({x:R.x-3.1,y:1.6,z:R.z-4},fwd),live:got,calls:a.renderer.info.render.calls};});
 console.log(JSON.stringify(r,null,1));
 assert.equal(r.count,11);assert(r.nearRearAll>r.nearRearScreenOnly);assert(r.nearSurroundAll>r.nearSurroundScreenOnly);assert(r.seatAll>=r.seatScreenOnly&&r.seatAll<=100);assert.equal(r.live.length,1);assert.equal(r.live[0],r.seatAll);assert.deepEqual(errors,[]);
 if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/result.json',JSON.stringify(r,null,2));}
 console.log('PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
