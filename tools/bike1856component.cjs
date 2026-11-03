// #1856: legacy terrain/curb/hull cases at established speed + actual Player momentum/crest cases.
// Native renderer-free component; no World/device/render claim. Source geometry cases retained from bicycleterraintest.
// Native component fixture: collision collaborators are explicitly controlled; no World/phone claim.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const{installMainGlobals,installMainImports}=require('./mainfixture.cjs');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8'),worldSource=fs.readFileSync(path.join(root,'src/world.js'),'utf8'),originalFixture=fs.readFileSync(path.join(root,'tools/courtyardbicycletest.cjs'),'utf8');
const sourceParts=originalFixture.slice(originalFixture.indexOf('function span('),originalFixture.indexOf('fs.mkdirSync(out'));
const parts=new Function('main','worldSource',sourceParts+';return parts;')(main,worldSource);
const setupStart=originalFixture.indexOf('async ({parts,index,render})=>{'),setupEnd=originalFixture.indexOf('},{parts,index,render});}',setupStart);
if(setupStart<0||setupEnd<0)throw Error('Original production-input fixture anchors changed');
const originalSetup=new Function('return ('+originalFixture.slice(setupStart,setupEnd+1)+')')();
const base=process.argv[2]||'http://localhost:8878',out=process.argv[3]||'/tmp/lunden-bicycle-terrain';
fs.mkdirSync(out,{recursive:true});let failures=0;const checks=[];
function check(ok,name,data){checks.push({ok,name,data});console.log((ok?'PASS ':'FAIL ')+name+(!ok&&data&&data.first?' '+JSON.stringify(data):''));if(!ok)failures++;}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});
try{const context=await browser.newContext({viewport:{width:900,height:600},hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// isolated native fixture'}));await installMainGlobals(page);await page.goto(base);await installMainImports(page);
const data=await page.evaluate(async()=>{
 const T=await import('three'),{Player}=await import('/src/player.js'),C=await import('/src/config.js'),{groundY}=await import('/src/surroundings.js'),{buildStreet,bicycleCurbY,curbBoxCount}=await import('/src/street.js'),{buildStreetLife}=await import('/src/streetlife.js'),{buildCourtyard}=await import('/src/courtyard.js');
 window.T=T;window.C=C;window.Player=Player;window.groundY=groundY;window.courtyard=buildCourtyard();window.life=buildStreetLife();window.player=null;
 let gl=0;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/i.test(kind)){gl++;throw Error('native fixture forbids GPU');}return get.call(this,kind,...args);};
 const world=()=>({size:{x:5.75,z:12.1},levels:[{segments:[],footprints:[]},{segments:[],footprints:[]}],doors:[],roofs:{above:()=>Infinity,under:()=>null}});window.worldFactory=world;
 const bike=courtyard.bicycles[0];
 window.start=(x,z,yaw,y)=>{const camera=new T.PerspectiveCamera(),p=new Player(world(),camera);p.spawn(x,z,0);if(y!==undefined)p.pos.y=y;p.riding={bike,yaw,speed:C.BICYCLE.speed,groundVy:0,lastStanding:p.pos.clone()};p.riding.pitch=p.bikeSupport(p.pos,yaw)?.pitch??0;camera.rotation.y=yaw-Math.PI/2;window.player=p;return p;};
 window.drive=(p,seconds,fwd=1)=>{const samples=[];p.analog.y=fwd;for(let i=0;i<Math.round(seconds/.025);i++){p.update(.025);samples.push({p:p.pos.toArray(),pitch:p.riding?.pitch,fall:!!p.fall,vy:p.vy});}p.analog.y=0;return samples;};
 const routes=[];
 for(const [name,x,z,yaw,seconds] of [['eastDown',12.55,26.3,-Math.PI/2,1],['eastUp',12.55,31,Math.PI/2,1],['NWDown',-68.1,8,Math.PI,1],['NWUp',-71.4,8,0,1],['southDown',-46.65,51.5,-Math.PI/2,1.5],['southUp',-46.65,59,Math.PI/2,1.5],['rampUp',12.55,12.5,-Math.PI/2,1.5],['rampDown',12.55,23.3,Math.PI/2,1.5]]) {const p=start(x,z,yaw),from=p.pos.toArray(),samples=drive(p,seconds*1.5);routes.push({name,from,to:p.pos.toArray(),samples});}
 // Every original rendered curb box: vertical ray parity at its centre, including terrain discontinuities.
 const street=buildStreet(groundY),curbMesh=street.object.children[0],a=curbMesh.geometry.attributes.position;street.object.updateMatrixWorld(true);
 let curbCount=0,curbMismatch=0;const mismatches=[];const ray=new T.Raycaster(),curbs=[];
 // #1729: the batch also holds the shelter paving (#1534) and island kerb (#1554), which are not curbs: only the leading curb boxes count.
 for(let i=0,end=curbBoxCount(groundY)*36;i<end;i+=36){const centre=new T.Vector3();for(let j=0;j<36;j++)centre.add(new T.Vector3().fromBufferAttribute(a,i+j));centre.multiplyScalar(1/36);ray.set(centre.clone().add(new T.Vector3(0,3,0)),new T.Vector3(0,-1,0));const hit=ray.intersectObject(curbMesh)[0],y=bicycleCurbY(centre.x,centre.z,groundY);curbCount++;if(!hit||Math.abs(hit.point.y-y)>1e-4){curbMismatch++;if(mismatches.length<10)mismatches.push({x:+centre.x.toFixed(3),y:+centre.y.toFixed(3),z:+centre.z.toFixed(3),hit:hit?+hit.point.y.toFixed(4):null,support:+y.toFixed(4)});}if(Math.abs(centre.x+72.8)<.4&&Math.abs(centre.z)<2)curbs.push({x:centre.x,z:centre.z,y});}
 // The straight Karpvägen edge at z=0: actual curb has x=-72.825, width=.15, top=.1.
 const curbRoute=[];for(const [name,x,yaw]of[['highUp',-74,0],['highDown',-72.325,0]]){const p=start(x,0,yaw);p.pos.y=p.bikeSupport(p.pos,yaw).y;const from=p.pos.toArray(),samples=drive(p,name==='highDown'?.2:.9);curbRoute.push({name,from,to:p.pos.toArray(),samples});}
 const small=start(-60,-17.5,-Math.PI/2),smallFrom=small.pos.toArray(),smallSamples=drive(small,1.5);
 // Actual raised courtyard edge, no invented high curb in a mock ground function.
 const high=start(-44,51.7,Math.PI/2,-3),highFrom=high.pos.toArray(),highSamples=drive(high,1);
 // A three-metre actual garage-box edge creates an airborne interval and the ordinary onLand request.
 const falling=start(-44,51.6,-Math.PI/2,0),lands=[];falling.onLand=(drop,gap)=>lands.push({drop,gap});const fallSamples=drive(falling,2.5);
 // Reverse on the actual ramp; yaw remains fixed while negative movement climbs.
 const reverse=start(12.55,14,Math.PI/2);reverse.riding.speed=-C.BICYCLE.reverse;const reverseFrom=reverse.pos.toArray(),reverseSamples=drive(reverse,1,-1);
 const tilted=start(-60,-8,0,.4),tilt=-.55,wallX=tilted.pos.x+.85;
 tilted.riding.bike.place(tilted.pos,0,tilt);tilted.world.levels[0].segments.push([wallX,-10,wallX,-6]);
 const range=tilted.riding.bike.ranges[0],attr=tilted.riding.bike.components[0].geometry.attributes.position;let maxX=-Infinity;
 for(let i=range.start;i<range.start+range.count;i++)maxX=Math.max(maxX,attr.getX(i));
 const tiltWall={actualModelMaxX:maxX,wallX,oldCapsuleMaxX:tilted.pos.x+C.BICYCLE.front*Math.cos(tilt)+C.BICYCLE.radius,rejected:!tilted.bikeHull(tilted.pos,0,[],{pitch:tilt})};
 // Full capsule stops before a closed leaf/wall, including during descent. No ignored collision list.
 const wall=start(12.55,26.3,-Math.PI/2);wall.world.levels[0].segments.push([11.6,28.4,13.5,28.4]);const wallSamples=drive(wall,1);
 const door=start(-44,51.6,-Math.PI/2);door.world.doors.push({object:{position:{y:0}},segment:()=>[-46,52.9,-42,52.9]});const doorSamples=drive(door,1);
 const head=start(12.55,14,-Math.PI/2);head.world.roofs.above=()=>head.pos.z>14.6?head.pos.y+1:Infinity;const headFrom=head.pos.toArray(),headSamples=drive(head,1);
 const paused=start(12.55,15,-Math.PI/2);const before=paused.pos.toArray();paused.analog.y=1;paused.update(0);const after=paused.pos.toArray();
 const air=start(-44,53,-Math.PI/2,0);air.fall={top:0,gap:3};air.riding.airborne=true;const airExit=air.dismountBicycle(),airSave=air.bicycleSavePlace();
 return{tiltWall,small:{from:smallFrom,to:small.pos.toArray(),samples:smallSamples},routes,curbCount,curbMismatch,mismatches,curbs,curbRoute,high:{from:highFrom,to:high.pos.toArray(),samples:highSamples},fall:{to:falling.pos.toArray(),samples:fallSamples,lands},reverse:{from:reverseFrom,to:reverse.pos.toArray(),samples:reverseSamples},wall:{to:wall.pos.toArray(),samples:wallSamples},door:{to:door.pos.toArray(),samples:doorSamples},head:{from:headFrom,to:head.pos.toArray(),samples:headSamples},pause:{before,after},air:{exit:airExit,save:airSave?.toArray()},gl};
});
fs.writeFileSync(out+'/terrain-before-input.json',JSON.stringify(data,null,2));
for(const r of data.routes){const moved=Math.hypot(r.to[0]-r.from[0],r.to[2]-r.from[2]);if(r.name.endsWith('Up')&&!r.name.startsWith('ramp'))check(moved<1.2, r.name+': actual stair riser stops ascent',r);else check(moved>(r.name==='NWDown'?3:5)&&r.samples.every(s=>s.p.every(Number.isFinite)),r.name+': actual terrain route is supported and passable',r);}
check(data.curbCount>1000&&data.curbMismatch===0,'bicycle support matches every actual rendered curb box ray', {count:data.curbCount,mismatches:data.curbMismatch,first:data.mismatches});
for(const r of data.curbRoute)if(r.name==='highUp')check(r.to[0]-r.from[0]>3&&r.samples.some(s=>s.p[1]>r.from[1]+.02),'actual 10 cm granite curb is ridden up over (#1300)',r);else check(Math.abs(r.to[0]-r.from[0])>.7&&r.to[1]<r.from[1]-.01,'actual granite curb permits downward departure',r);
check(data.small.to[2]>data.small.from[2]+5&&data.small.samples.some(s=>s.p[1]>.02),'actual 5 cm StreetLife concrete edge permits small upward step',data.small);
check(data.tiltWall.rejected&&data.tiltWall.actualModelMaxX>data.tiltWall.wallX&&data.tiltWall.oldCapsuleMaxX<data.tiltWall.wallX,'full tilted model overhang is stopped by wall beyond old ground capsule',data.tiltWall);
check(data.high.to[2]>51,'actual high courtyard edge blocks upward passage',data.high);
check(data.fall.samples.some(s=>s.fall&&s.p[1]>-2.9)&&data.fall.lands.length===1&&data.fall.lands[0].drop>2&&data.fall.lands[0].gap>2,'actual three metre edge uses gravity and one ordinary fall-damage landing request',data.fall);
check(data.reverse.to[2]>data.reverse.from[2]+1.9&&data.reverse.to[1]>data.reverse.from[1],'reverse climb follows actual ramp support',data.reverse);
check(data.wall.to[2]<28.4-.7,'full forward bicycle capsule stops before wall on descent',data.wall);
check(data.door.to[2]<52.9-.7,'full bicycle capsule cannot tunnel through closed door on descent',data.door);
check(data.head.to[2]<data.head.from[2]+.7,'headroom preserved on tilted ramp',data.head);
check(JSON.stringify(data.pause.before)===JSON.stringify(data.pause.after),'zero-dt pause preserves position');check(data.air.exit===false,'airborne dismount refused');check(data.gl===0,'native probe creates no WebGL context');
check(errors.length===0,'no browser page errors',errors);
// The real Player wheel contacts and hull run against explicit analytic height/collision collaborators.
const motion=await page.evaluate(()=>{
 const bump=x=>-.16*x+.9*Math.exp(-(((x-30)/1.3)**2)/2), results=[];
 function ride(dt,{slow=false,flat=false,wall=false}={}){
  const p=start(slow?28:0,0,0,0),height=flat?()=>0:bump;p.pos.y=height(p.pos.x);p.bikeGround=(x,z)=>height(x);p.bikeClear=q=>!wall||q.x<37-.31;p.bikeSteepUp=()=>false;p.riding.speed=slow?3:0;p.riding.pitch=p.bikeSupport(p.pos,0).pitch;p.camera.rotation.y=-Math.PI/2;p.analog.y=1;p.vy=0;p.fall=null;const lands=[],trace=[];p.onLand=(drop,gap)=>lands.push({drop,gap});let air=0,maxGap=0;
  for(let t=0;t<10;t+=dt){p.update(dt);const g=p.bikeSupport(p.pos,p.riding.yaw);maxGap=Math.max(maxGap,p.pos.y-g.y);air+=p.riding.airborne?1:0;if(trace.length<1000)trace.push({t,x:p.pos.x,y:p.pos.y,speed:p.riding.speed,vy:p.vy,groundVy:p.riding.groundVy,pitch:p.riding.pitch,air:!!p.riding.airborne,gap:p.pos.y-g.y});}
  return{dt,slow,flat,wall,air,maxGap,lands,to:p.pos.toArray(),speed:p.riding.speed,trace};
 }
 for(const dt of[1/120,1/60,.05,.1])results.push(ride(dt));results.push(ride(.05,{slow:true}),ride(.05,{flat:true}),ride(.05,{wall:true}));return results;
});
for(const m of motion){if(m.slow||m.flat)check(m.air===0&&m.lands.length===0,'negative low-speed/flat control stays on actual wheel support',m);else check(m.air>0&&m.maxGap>.03&&m.lands.length===1&&m.to.every(Number.isFinite),'actual Player rises from crest momentum and lands once dt '+m.dt,m);if(m.wall)check(m.to[0]<37&&m.speed<.5,'airborne/full moving hull stops at controlled wall',m);}
check(errors.length===0,'no component page errors',errors);fs.writeFileSync(out+'/final.json',JSON.stringify({checks,data,motion,errors,legacyAdaptation:'Established6m/s for inherited geometry cases; longer route duration accommodates new acceleration/friction; old main input injection omitted (#1859), native input in real app'},null,2));
}finally{await browser.close();}})().then(()=>{console.log(`TOTAL ${checks.length} / failures ${failures}`);process.exitCode=failures?1:0;}).catch(e=>{console.error(e);process.exitCode=1;});
