// #983: real Player, actual terrain/curb geometry and existing two bicycle adapters.
// Native component fixture: collision collaborators are explicitly controlled; no World/phone claim.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8'),worldSource=fs.readFileSync(path.join(root,'src/world.js'),'utf8'),originalFixture=fs.readFileSync(path.join(root,'tools/courtyardbicycletest.cjs'),'utf8');
const sourceParts=originalFixture.slice(originalFixture.indexOf('function span('),originalFixture.indexOf('fs.mkdirSync(out'));
const parts=new Function('main','worldSource',sourceParts+';return parts;')(main,worldSource);
const setupStart=originalFixture.indexOf('async ({parts,index,render})=>{'),setupEnd=originalFixture.indexOf('},{parts,index,render});}',setupStart);
if(setupStart<0||setupEnd<0)throw Error('Original production-input fixture anchors changed');
const originalSetup=new Function('return ('+originalFixture.slice(setupStart,setupEnd+1)+')')();
const base=process.argv[2]||'http://localhost:8878',out=process.argv[3]||'/tmp/lunden-bicycle-terrain';
fs.mkdirSync(out,{recursive:true});let failures=0;const checks=[];
function check(ok,name,data){checks.push({ok,name,data});console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failures++;}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});
try{const context=await browser.newContext({viewport:{width:900,height:600},hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// isolated native fixture'}));await page.goto(base);
const data=await page.evaluate(async()=>{
 const T=await import('three'),{Player}=await import('/src/player.js'),C=await import('/src/config.js'),{groundY}=await import('/src/surroundings.js'),{buildStreet,bicycleCurbY}=await import('/src/street.js'),{buildStreetLife}=await import('/src/streetlife.js'),{buildCourtyard}=await import('/src/courtyard.js');
 window.T=T;window.C=C;window.Player=Player;window.groundY=groundY;window.courtyard=buildCourtyard();window.life=buildStreetLife();window.player=null;
 let gl=0;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/i.test(kind)){gl++;throw Error('native fixture forbids GPU');}return get.call(this,kind,...args);};
 const world=()=>({size:{x:5.75,z:12.1},levels:[{segments:[],footprints:[]},{segments:[],footprints:[]}],doors:[],roofs:{above:()=>Infinity,under:()=>null}});window.worldFactory=world;
 const bike=courtyard.bicycles[0];
 window.start=(x,z,yaw,y)=>{const camera=new T.PerspectiveCamera(),p=new Player(world(),camera);p.spawn(x,z,0);if(y!==undefined)p.pos.y=y;p.riding={bike,yaw,lastStanding:p.pos.clone()};p.riding.pitch=p.bikeSupport(p.pos,yaw)?.pitch??0;camera.rotation.y=yaw-Math.PI/2;window.player=p;return p;};
 window.drive=(p,seconds,fwd=1)=>{const samples=[];p.analog.y=fwd;for(let i=0;i<Math.round(seconds/.025);i++){p.update(.025);samples.push({p:p.pos.toArray(),pitch:p.riding?.pitch,fall:!!p.fall,vy:p.vy});}p.analog.y=0;return samples;};
 const routes=[];
 for(const [name,x,z,yaw,seconds] of [['eastDown',12.55,26.3,-Math.PI/2,1],['eastUp',12.55,31,Math.PI/2,1],['NWDown',-68.1,8,Math.PI,1],['NWUp',-71.4,8,0,1],['southDown',-46.65,51.5,-Math.PI/2,1.5],['southUp',-46.65,59,Math.PI/2,1.5],['rampUp',12.55,12.5,-Math.PI/2,1.5],['rampDown',12.55,23.3,Math.PI/2,1.5]]) {const p=start(x,z,yaw),from=p.pos.toArray(),samples=drive(p,seconds);routes.push({name,from,to:p.pos.toArray(),samples});}
 // Every original rendered curb box: vertical ray parity at its centre, including terrain discontinuities.
 const street=buildStreet(groundY),curbMesh=street.object.children[0],a=curbMesh.geometry.attributes.position;street.object.updateMatrixWorld(true);
 let curbCount=0,curbMismatch=0;const ray=new T.Raycaster(),curbs=[];
 for(let i=0;i<a.count;i+=36){const centre=new T.Vector3();for(let j=0;j<36;j++)centre.add(new T.Vector3().fromBufferAttribute(a,i+j));centre.multiplyScalar(1/36);ray.set(centre.clone().add(new T.Vector3(0,3,0)),new T.Vector3(0,-1,0));const hit=ray.intersectObject(curbMesh)[0],y=bicycleCurbY(centre.x,centre.z,groundY);curbCount++;if(!hit||Math.abs(hit.point.y-y)>1e-4)curbMismatch++;if(Math.abs(centre.x+72.8)<.4&&Math.abs(centre.z)<2)curbs.push({x:centre.x,z:centre.z,y});}
 // The straight Karpvägen edge at z=0: actual curb has x=-72.825, width=.15, top=.1.
 const curbRoute=[];for(const [name,x,yaw]of[['highUp',-74,0],['highDown',-72.325,0]]){const p=start(x,0,yaw);p.pos.y=p.bikeSupport(p.pos,yaw).y;const from=p.pos.toArray(),samples=drive(p,name==='highDown'?.15:.6);curbRoute.push({name,from,to:p.pos.toArray(),samples});}
 const small=start(-60,-17.5,-Math.PI/2),smallFrom=small.pos.toArray(),smallSamples=drive(small,1);
 // Actual raised courtyard edge, no invented high curb in a mock ground function.
 const high=start(-44,51.7,Math.PI/2,-3),highFrom=high.pos.toArray(),highSamples=drive(high,1);
 // A three-metre actual garage-box edge creates an airborne interval and the ordinary onLand request.
 const falling=start(-44,51.6,-Math.PI/2,0),lands=[];falling.onLand=(drop,gap)=>lands.push({drop,gap});const fallSamples=drive(falling,1.5);
 // Reverse on the actual ramp; yaw remains fixed while negative movement climbs.
 const reverse=start(12.55,14,Math.PI/2),reverseFrom=reverse.pos.toArray(),reverseSamples=drive(reverse,1,-1);
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
 return{tiltWall,small:{from:smallFrom,to:small.pos.toArray(),samples:smallSamples},routes,curbCount,curbMismatch,curbs,curbRoute,high:{from:highFrom,to:high.pos.toArray(),samples:highSamples},fall:{to:falling.pos.toArray(),samples:fallSamples,lands},reverse:{from:reverseFrom,to:reverse.pos.toArray(),samples:reverseSamples},wall:{to:wall.pos.toArray(),samples:wallSamples},door:{to:door.pos.toArray(),samples:doorSamples},head:{from:headFrom,to:head.pos.toArray(),samples:headSamples},pause:{before,after},air:{exit:airExit,save:airSave?.toArray()},gl};
});
fs.writeFileSync(out+'/terrain-before-input.json',JSON.stringify(data,null,2));
for(const r of data.routes){const moved=Math.hypot(r.to[0]-r.from[0],r.to[2]-r.from[2]);if(r.name.endsWith('Up')&&!r.name.startsWith('ramp'))check(moved<1.2, r.name+': actual stair riser stops ascent',r);else check(moved>(r.name==='NWDown'?3:5)&&r.samples.every(s=>s.p.every(Number.isFinite)),r.name+': actual terrain route is supported and passable',r);}
check(data.curbCount>1000&&data.curbMismatch===0,'bicycle support matches every actual rendered curb box ray', {count:data.curbCount,mismatches:data.curbMismatch});
for(const r of data.curbRoute)if(r.name==='highUp')check(Math.abs(r.to[0]-r.from[0])<1.2,'actual 10 cm granite curb blocks upward ride',r);else check(Math.abs(r.to[0]-r.from[0])>.7&&r.to[1]<r.from[1]-.01,'actual granite curb permits downward departure',r);
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
// Run the existing component setup verbatim: actual main key/action/stand/active/save handlers and Touch.
await page.evaluate(()=>sessionStorage.clear());await page.goto(base);await page.evaluate(originalSetup,{parts,index:0,render:false});
await page.keyboard.press('e');check(await page.evaluate(()=>!!player.riding),'ordinary original main E mounts actual courtyard bicycle');
await page.evaluate(()=>{const yaw=-Math.PI/2;player.pos.set(12.55,0,26.3);player.riding.yaw=yaw;camera.rotation.y=yaw-Math.PI/2;locked=true;touch.enabled=false;});
await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<30;i++)tick(.025);});await page.keyboard.up('w');
check(await page.evaluate(()=>player.pos.z>30&&player.pos.y<-.9),'original main keyboard drives actual stair descent');
await page.evaluate(()=>{const yaw=-Math.PI/2;player.pos.set(12.55,player.groundAt(12.55,12.5,0),12.5);player.riding.yaw=yaw;player.riding.pitch=0;player.fall=null;player.vy=0;camera.rotation.y=yaw-Math.PI/2;locked=false;touch.enabled=true;document.body.classList.add('touch');});
const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:400}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:344}]});
check(await page.evaluate(()=>touch.analog.y>.99),'actual touch joystick supplies forward input');
await page.evaluate(()=>{for(let i=0;i<40;i++)tick(.025);});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
check(await page.evaluate(()=>player.pos.z>18&&player.pos.y>-.5&&player.riding.pitch>0),'original main touch drives actual ramp with model tilt');
const standing=await page.evaluate(()=>{fns.updateBicycleControls();document.getElementById('stand-btn').hidden=false;const q=player.bikeStanding();return{q:q?.toArray(),before:player.pos.toArray()};});
await page.locator('#stand-btn').dispatchEvent('click');check(await page.evaluate(()=>!player.riding),'ordinary original main stand button safely dismounts on ramp',standing);
const adapters=await page.evaluate(async()=>{
 life.bicycles=(await import('/src/streetlife.js')).buildStreetLife().bicycles;
 const result={};
 for(const [name,b] of [['yard',life.bicycles[0]],['courtyard',courtyard.bicycles[0]]]) {
   if(!b)continue;
   const previous=b.components.map(m=>m.isInstancedMesh?Array.from(m.instanceMatrix.array):{p:Array.from(m.geometry.attributes.position.array),n:Array.from(m.geometry.attributes.normal.array)});
   const p=new T.Vector3(-65,.2,-8),yaw=.7,pitch=.25;b.place(p,yaw,pitch);
   const target=new T.Matrix4().makeRotationFromEuler(new T.Euler(0,yaw,pitch,'YXZ')).setPosition(p);
   const matrix=b.matrix.elements.every((v,i)=>Math.abs(v-target.elements[i])<1e-6);
   let untouched=true,normals=true,bounds=true;
   b.components.forEach((m,k)=>{
     if(m.isInstancedMesh){for(let i=0;i<m.instanceMatrix.array.length;i++)if(Math.floor(i/16)!==b.index&&m.instanceMatrix.array[i]!==previous[k][i])untouched=false;const selected=new T.Matrix4();m.getMatrixAt(b.index,selected);if(!selected.elements.every((v,i)=>Math.abs(v-target.elements[i])<1e-5))normals=false;const v=new T.Vector3(),a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(selected);if(v.distanceTo(m.boundingSphere.center)>m.boundingSphere.radius+1e-5)bounds=false;}}
     else{const r=b.ranges[k],attrs=m.geometry.attributes,N=new T.Matrix3().getNormalMatrix(target.clone().multiply(b.original.clone().invert())),v=new T.Vector3(),n=new T.Vector3();for(let i=0;i<attrs.position.count;i++){if(i<r.start||i>=r.start+r.count)for(let j=0;j<3;j++)if(attrs.position.array[i*3+j]!==previous[k].p[i*3+j]||attrs.normal.array[i*3+j]!==previous[k].n[i*3+j])untouched=false;else{}v.fromBufferAttribute(attrs.position,i);if(!m.geometry.boundingBox.containsPoint(v)||v.distanceTo(m.geometry.boundingSphere.center)>m.geometry.boundingSphere.radius+1e-6)bounds=false;}for(let i=0;i<r.count;i++){v.fromArray(r.normal,i*3).applyMatrix3(N);n.fromBufferAttribute(attrs.normal,r.start+i);if(v.distanceTo(n)>1e-6)normals=false;}}
   });
   result[name]={matrix,untouched,normals,bounds,pitch:b.pitch,components:b.components.length};
 }
 return result;
});
for(const [name,r]of Object.entries(adapters))check(r.matrix&&r.untouched&&r.normals&&r.bounds&&r.pitch===.25,name+': actual canonical tilt matrix, untouched other models, rotated normals and valid bounds',r);
const timings=await page.evaluate(()=>{const yaw=-Math.PI/2;player.pos.set(12.55,player.groundAt(12.55,14,0),14);player.riding={bike,yaw,lastStanding:player.pos.clone()};camera.rotation.y=yaw-Math.PI/2;player.fall=null;player.vy=0;let calls=0;const original=player.bikeGround.bind(player);player.bikeGround=(...a)=>{calls++;return original(...a);};const t=performance.now();for(let i=0;i<100;i++){player.pos.set(12.55,player.groundAt(12.55,14,0),14);player.riding.pitch=0;player.analog.y=1;player.update(.025);}const ms=performance.now()-t;return{frames:100,dt:.025,ms,groundQueries:calls,perFrameMs:ms/100};});
check(Number.isFinite(timings.ms)&&timings.groundQueries>0,'bounded representative native CPU timing recorded (not FPS/device acceptance)',timings);
check(errors.length===0,'no page errors after original main touch/keyboard checks',errors);
fs.writeFileSync(out+'/native.json',JSON.stringify({checks,data,errors,timings,adapters,inputFixtureSha256:crypto.createHash('sha256').update(originalFixture).digest('hex')},null,2));
}finally{await browser.close();}})().then(()=>{console.log(`TOTAL ${checks.length} / failures ${failures}`);process.exitCode=failures?1:0;}).catch(e=>{console.error(e);process.exitCode=1;});
