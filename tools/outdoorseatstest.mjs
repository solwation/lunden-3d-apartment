// #1818: explicit outdoor seat catalogue, source transforms and native Rest/swing motion. THREE_DIR is the pinned three package.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
if (process.env.THREE_DIR) register('data:text/javascript,'+encodeURIComponent(`const r=${JSON.stringify(pathToFileURL(process.env.THREE_DIR+'/').href)};export async function resolve(s,c,n){if(s==='three')return{url:r+'build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return{url:r+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
const T=await import('three'),{OutdoorSeats,schoolSeatRecords,decorSeatSpec}=await import('../src/outdoorseats.js'),{Rest}=await import('../src/rest.js'),C=await import('../src/config.js');
let failures=0;const check=(ok,name)=>{console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failures++;};
const desktop=schoolSeatRecords(false),phone=schoolSeatRecords(true);
check(desktop.filter(r=>r.kind==='swing').length===4&&desktop.filter(r=>r.kind==='bench').length===4,'all four rendered school swing frames and four benches are catalogued');
check(phone.filter(r=>r.kind==='swing').length===1&&phone.every(r=>!r.id.includes('detail')),'phone catalogue matches its actually rendered base geometry (no invisible detail targets)');
const exterior=new T.Group(),gate=new T.Group();gate.shown=true;gate.userData.records=[{id:'test',items:[
  {seat:{k:'chair',x:10,z:20,floor:3,yaw:Math.PI/2,cc:0xff0000}},
  {seat:{k:'sofa',x:12,z:20,floor:3,yaw:Math.PI/2,len:1.9}},
  {seat:{k:'lounger',x:14,z:20,floor:3,yaw:Math.PI/2}},
]}];exterior.userData.patioDecor=gate;
const seats=new OutdoorSeats(new T.Group(),exterior,()=>0);
check(seats.targets.length===2+4+8+3,'two shelter benches, four school benches, eight school swing seats and every authored decor seat have one target each');
check(seats.targets.every(t=>t.kind==='rest'&&t.outdoorSeat&&t.returnToEntry&&t.spots.length>0&&t.spots.every(s=>s.pos.toArray().every(Number.isFinite))),'targets explicitly use ordinary Rest and preserve a safe return-to-entry contract');
const chair=seats.targets.find(t=>t.seatId==='patio-test-0'),sofa=seats.targets.find(t=>t.seatId==='patio-test-1');
check(Math.abs(chair.spots[0].pos.y-(3+C.OUTDOOR_SEATS.chair.seat+C.OUTDOOR_SEATS.chair.cushion+C.REST.sitEye))<1e-9,'chair eye is based on actual cushion top and authored floor');
check(sofa.spots.length===3&&sofa.spots.every(s=>Math.abs(s.pos.x-(12+C.OUTDOOR_SEATS.sofa.offset))<1e-9),'sofa spots retain authored rotation and actual forward seat offset');
gate.shown=false;check(chair.pickable.userData.seasonHidden===true,'hidden patio/roof LOD cannot leave ghost seat targets');gate.shown=true;
check(decorSeatSpec({k:'table'})===null,'ordinary decor and tables do not become seats');
check(seats.swings.length===8&&seats.swingMesh.geometry.attributes.position.usage===T.DynamicDrawUsage&&seats.swingMesh.geometry.userData.keepCpu,'school seats/chains share one dynamic CPU-retained mesh for phone uploads');
const swing=seats.swings[0],start=swing.target.spots[0].pos.clone(),camera=new T.PerspectiveCamera(),rest=new Rest(camera),standing={x:1,y:2,z:3,yaw:.7};
rest.begin(swing.target,swing.target.spots[0],standing);swing.begin();seats.update(C.COURTYARD.swing.period/4,swing.target);rest.update(1);
check(start.distanceTo(swing.target.spots[0].pos)>.3&&camera.position.distanceTo(rest.eyeAt(swing.target.spots[0]))<1e-8,'swing geometry, target and native seated camera follow the same moving anchor');
const frozen=seats.swingMesh.geometry.attributes.position.array.slice();seats.update(0,swing.target);
check(frozen.every((v,i)=>v===seats.swingMesh.geometry.attributes.position.array[i]),'paused swing updates change no vertex');
check(rest.end()===standing&&!rest.active,'native Rest ends with the exact original safe entry position');
for(let i=0;i<180;i++)seats.update(1/30,null);
check(swing.angle===0&&swing.target.spots[0].pos.distanceTo(start)<1e-8,'unused swing gently settles back to the original seat');
const triangles=seats.swingMesh.geometry.attributes.position.count/3;
check(triangles===288,'all eight school seats and chains cost one batch and 288 triangles');
const source=C.SITE.east.access.find(p=>p.source==='145221572').yard.play.find(p=>p.kind==='swing'),yaw=source.yaw;
source.yaw=90;const skew=new OutdoorSeats(new T.Group(),new T.Group(),()=>0);source.yaw=yaw;
const rotated=skew.swings.find(s=>s.target.seatId.startsWith('swing-145221572-'));rotated.begin();skew.update(C.COURTYARD.swing.period/4,rotated.target);
const matrix=rotated.fixed.clone().multiply(new T.Matrix4().makeRotationX(rotated.angle)),quaternion=new T.Quaternion().setFromRotationMatrix(matrix);
const vertex=new T.Vector3().fromBufferAttribute(rotated.source.attributes.position,0).applyMatrix4(matrix),drawn=new T.Vector3().fromBufferAttribute(skew.swingMesh.geometry.attributes.position,rotated.start);
check(Math.abs(rotated.target.pickable.quaternion.dot(quaternion))>1-1e-9&&vertex.distanceTo(drawn)<1e-5,
  '90-degree school frame keeps pick quaternion and emitted seat on the same yaw-then-local-pitch transform');
console.log(failures?`${failures} FAILED`:'ALL PASS');process.exit(failures?1:0);
