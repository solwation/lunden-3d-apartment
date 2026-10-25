import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPUTER_MEDIA as C,PLAYROOM as R,LEVELS,nearComputer } from '../src/config.js';
import { computerFurniture } from '../src/computerfurniture.js';
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
