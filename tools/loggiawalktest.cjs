// #1430: actual Player.update, unchanged source opening bounds and render identity. No synthetic ground patch.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs');
const out=process.env.SHOTS,initial=!!process.env.INITIAL;let failed=0;
const check=(ok,label,data)=>{console.log(`${ok?'PASS':'FAIL'} ${label}${data?' — '+JSON.stringify(data):''}`);if(!ok)failed++};
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let ids=[];
try{const cdp=await b.newBrowserCDPSession();ids=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(p=>p.id);const page=await b.newPage({viewport:{width:1100,height:750}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
await page.goto(`${process.argv[2]||'http://localhost:8244'}/?shot&cloud=&mp=0&quality=0&month=7&time=12&weather=clear&freeze`,{waitUntil:'commit'});await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:600000});
const result=await page.evaluate(async initial=>{const a=__app,T=await import('three'),S=await import('/src/surroundings.js');a.renderer.setAnimationLoop(null);a.showOverlay(false);a.touch.enabled=true;
const ways=S.groundWaysIn().filter(w=>w.kind==='loggia'),level=a.world.levels[0],open=level.segments,closed=[...open,...ways.map(w=>[w.x0,w.z0,w.x1,w.z1])];
// Adding back just these source intervals reconstructs the original continuous wall's exact collision union.
const rows=[],blocked=[],isolated=[];let knownFloor=0;
const walk=(x,z,n,reverse=false)=>{const yaw=Math.atan2(-n[0],-n[1]);a.player.keys.clear();a.player.spawn(x,z,yaw);const start={...a.player.pos};a.player.keys.add('KeyW');for(let i=0;i<72;i++)a.player.update(1/60);a.player.keys.clear();return{start,end:{...a.player.pos},below:a.player.below}};
for(const [i,w]of ways.entries()){
 const x=(w.x0+w.x1)/2,z=(w.z0+w.z1)/2,n=w.n;level.segments=closed;const old=walk(x+n[0]*.8,z+n[1]*.8,[-n[0],-n[1]]);const oldCross=-(old.end.x-x)*n[0]-(old.end.z-z)*n[1];
 level.segments=open;a.player.spawn(x+n[0]*.8,z+n[1]*.8,0);isolated.push({i,name:w.name,free:a.player.isFree(x,z,0),oldCross});
 for(const direction of [1,-1]){const r=walk(x+n[0]*.8*direction,z+n[1]*.8*direction,[-n[0]*direction,-n[1]*direction]);const cross=-direction*((r.end.x-x)*n[0]+(r.end.z-z)*n[1]);const expectedFloor=S.groundY(x+n[0]*.8,z+n[1]*.8),bad=initial&&/^Hus [AB]$/.test(w.name)&&n[1]===-1;if(bad)knownFloor++;rows.push({i,name:w.name,direction,n,cross,expectedFloor,knownMissingFloor:bad,...r});}
 const tx=w.x1-w.x0,tz=w.z1-w.z0,len=Math.hypot(tx,tz),bx=x+tx/len*.85,bz=z+tz/len*.85,r=walk(bx+n[0]*.8,bz+n[1]*.8,[-n[0],-n[1]]);blocked.push({i,name:w.name,cross:-((r.end.x-bx)*n[0]+(r.end.z-bz)*n[1]),...r});
}
level.segments=open;
const l=[];for(const direction of [1,-1]){const r=walk(.65,direction===1?16.2:18.2,[0,direction]);l.push({direction,...r,distance:Math.abs(r.end.z-r.start.z)})}
// Static surroundings bytes must not depend on collision intervals. Hash each attribute in bounded chunks.
let root;a.scene.traverse(o=>{if(o.userData.windows&&o.userData.segments)root=o});if(!root)throw Error('Surroundings root missing');const buffers=[];root.traverse(o=>{if(o.geometry){for(const[k,v]of Object.entries(o.geometry.attributes))buffers.push([o.name,k,v.array]);if(o.geometry.index)buffers.push([o.name,'index',o.geometry.index.array]);for(const k of ['instanceMatrix','instanceColor'])if(o[k])buffers.push([o.name,k,o[k].array])}});
async function hash(){const hashes=[];let bytes=0;for(const[name,k,v]of buffers){const data=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);bytes+=data.length;hashes.push(name+':'+k+':'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join(''))}return{bytes,attributes:hashes.length,hash:hashes.join('|')}}
level.segments=closed;const before=await hash();level.segments=open;const after=await hash();
window.__loggia1430={open,closed,ways,level,pose:i=>{const w=ways[i],x=(w.x0+w.x1)/2,z=(w.z0+w.z1)/2;a.player.spawn(x+w.n[0]*2,z+w.n[1]*2,Math.atan2(w.n[0],w.n[1]));const d=new T.Vector3(x,.45,z).sub(a.camera.position);a.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');a.step(0)},render:closedMode=>{level.segments=closedMode?closed:open;a.renderer.info.reset();a.renderer.render(a.scene,a.camera);return{calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles}}};
return{rows,blocked,isolated,l,geometryExact:JSON.stringify(before)===JSON.stringify(after),geometry:{bytes:before.bytes,attributes:before.attributes},knownFloor,openings:ways};},initial);
check(result.openings.length===12&&result.isolated.every(r=>r.free&&r.oldCross<0),'all12 actual openings collision-free; reconstructed old wall blocks',result.isolated);
const tested=result.rows.filter(r=>!r.knownMissingFloor);check(tested.every(r=>r.cross>.3&&Math.abs(r.end.y-r.expectedFloor)<.12),'actual Player.update crosses both directions with real floor support',{tested:tested.length,rows:tested});
if(initial)console.log('KNOWN #1428 missing floor, not claimed successful:',JSON.stringify(result.rows.filter(r=>r.knownMissingFloor)));
check(result.blocked.every(r=>r.cross<0),'all12 adjacent solid parapets/walls still block',result.blocked);
check(result.l.every(r=>r.distance>1.3&&Math.abs(r.end.y)<.1),'separate Hus L patio route both directions unchanged',result.l);
check(result.geometryExact,'all surroundings geometry/index/instance bytes unchanged by collision',{...result.geometry});
const counts=[];for(const[i,name]of[[1,'A-NE'],[9,'C-NE']]){await page.evaluate(i=>__loggia1430.pose(i),i);for(const closedMode of [true,false]){counts.push(await page.evaluate(v=>__loggia1430.render(v),closedMode));await page.screenshot({path:`${out}/${name}-${closedMode?'closed':'open'}.png`,timeout:120000});}}
check(counts.every((c,i)=>i%2===0||JSON.stringify(c)===JSON.stringify(counts[i-1])),'matched actual view draw/triangle counts identical',counts);check(errors.length===0,'no browser errors',errors);fs.writeFileSync(`${out}/result.json`,JSON.stringify({...result,counts,errors,failed,initial},null,2));
}finally{console.log('Closing owned browser');const timeout=setTimeout(()=>{console.log('Bounded exact own browser PID teardown');for(const pid of ids)try{process.kill(pid,'SIGKILL')}catch{}},15000);timeout.unref();await b.close();clearTimeout(timeout)}process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
