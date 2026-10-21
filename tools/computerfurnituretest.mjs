import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPUTER_MEDIA as C,PLAYROOM as R,nearComputer } from '../src/config.js';
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
