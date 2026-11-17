import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPUTER_MEDIA as C,PLAYROOM as R,LEVELS,nearComputer } from '../src/config.js';
import { computerFurniture, gamingPc, pcPedestalRect } from '../src/computerfurniture.js';
test('four themed desks along the two SPEL walls keep the central approach open',()=>{
 const stations=C.stations.filter(s=>s.clubhouse),D=C.desk;
 assert.equal(stations.length,4);assert.equal(new Set(stations.map(s=>s.color)).size,4);
 assert.equal(stations.filter(s=>s.yaw===Math.PI/2).length,2);assert.equal(stations.filter(s=>s.yaw===-Math.PI/2).length,2);
 for(const s of stations){assert(s.x-D.depth/2>R.x+R.clubhouse.side+R.clubhouse.wall/2);assert(s.x+D.depth/2<R.x+R.w/2);assert(s.z-D.width/2>R.z-R.d/2);assert(s.z+D.width/2<R.z+R.clubhouse.front-R.clubhouse.wall/2);assert(nearComputer(s.id,[s.x+Math.sin(s.yaw)*D.seatOffset,0,s.z]));}
 const parts=computerFurniture();let triangles=0;
 for(const g of parts){g.computeBoundingBox();const b=g.boundingBox;assert(b.min.y>=-.00001);assert(b.max.y<=D.monitorY+D.monitorHeight/2+D.bezel+.00001);assert(b.max.x<R.x+4.5||b.min.x>R.x+7.5,'central walkway must stay empty');for(const n of g.attributes.position.array)assert(Number.isFinite(n));triangles+=g.index?g.index.count/3:g.attributes.position.count/3;g.dispose();}
 console.log({stations:stations.length,parts:parts.length,triangles});
});
test('a movable home computer works anywhere in its own room and nowhere else (#1613)',()=>{
 for(const id of ['pc-olof','pc-home','laptop-home']){
  const s=C.stations.find(q=>q.id===id),[x0,x1,z0,z1]=s.bounds;
  const corners=[[x0+.05,z0+.05],[x1-.05,z0+.05],[x0+.05,z1-.05],[x1-.05,z1-.05]];
  assert(corners.some(([x,z])=>Math.hypot(x-s.x,z-s.z)>C.reach),`${id}: some corner lies beyond the old fixed reach`);
  const floor=(s.level===1?LEVELS[1].floor:0);
  for(const [x,z] of corners)assert(nearComputer(id,[x,floor,z]),`${id}: reachable at (${x}, ${z}) in its room`);
  assert(!nearComputer(id,[x1+.5,floor,(z0+z1)/2]),`${id}: refused outside its room`);
  assert(!nearComputer(id,[(x0+x1)/2,floor+3,(z0+z1)/2]),`${id}: refused on another floor`);
 }
 const club=C.stations.find(s=>s.clubhouse);assert(!club.roomReach&&!nearComputer(club.id,[club.x+C.reach+.3,0,club.z]),'the fixed clubhouse desks keep the 2.8 m reach');
});
test('each station has a glass PC on its own pedestal beside the desk, clear of desks, chairs and the aisle (#2024)',()=>{
 const stations=C.stations.filter(s=>s.clubhouse),D=C.desk,P=C.pc;
 const deskRect=s=>{const c=Math.abs(Math.cos(s.yaw)),n=Math.abs(Math.sin(s.yaw)),hx=(c*D.width+n*D.depth)/2,hz=(n*D.width+c*D.depth)/2;return[s.x-hx,s.x+hx,s.z-hz,s.z+hz];};
 const chairRect=s=>{const cx=s.x+Math.sin(s.yaw)*D.seatOffset;return[cx-D.chair[2]/2,cx+D.chair[2]/2,s.z-D.chair[0]/2,s.z+D.chair[0]/2];};
 const overlap=(a,b)=>a[0]<b[1]&&b[0]<a[1]&&a[2]<b[3]&&b[2]<a[3];
 let triangles=0,leds=0;
 for(const s of stations){
  const [x0,x1,z0,z1]=pcPedestalRect(s),[bx0,bx1,bz0,bz1]=s.bounds;
  assert(Math.abs((x1-x0)*(z1-z0)-P.pedestal[0]*P.pedestal[2])<1e-9);
  assert(x0>bx0&&x1<bx1&&z0>bz0&&z1<bz1,`${s.id}: pedestal inside SPEL`);
  assert(x1<R.x+4.5||x0>R.x+7.5,`${s.id}: pedestal keeps the central aisle open`);
  for(const q of stations){assert(!overlap([x0,x1,z0,z1],deskRect(q)),`${s.id}: clear of desk ${q.id}`);assert(!overlap([x0,x1,z0,z1],chairRect(q)),`${s.id}: clear of chair ${q.id}`);}
  for(const g of gamingPc(s)){
   g.computeBoundingBox();const b=g.boundingBox;
   assert(b.min.x>=x0-.035&&b.max.x<=x1+.035&&b.min.z>=z0-.035&&b.max.z<=z1+.035,`${s.id}: PC part stays over its pedestal`);
   assert(b.min.y>=-1e-5&&b.max.y<=P.pedestal[1]+P.case[1]+1e-5);
   const c=g.attributes.color.array;if(Math.max(c[0],c[1],c[2])>1)leds++;
   triangles+=g.attributes.position.count/3;g.dispose();
  }
 }
 assert(leds/stations.length>=60,'lit fans, RAM, GPU strip and pump rings glow through colours above 1.0');
 console.log({pcTrianglesPerStation:triangles/stations.length,ledPartsPerStation:leds/stations.length});
});
