import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYROOM as R } from '../src/config.js';
import { clubhouseWallBoxes, clubhouseSkirting } from '../src/clubhousefinish.js';

// Independent plan fixture: full-height partitions and three open passage headers.
const C=R.clubhouse,t=C.wall,h=R.ceiling,x0=-R.w/2,x1=R.w/2,z0=-R.d/2;
const boxes=[...[-C.side,C.side].map(x=>[x-t/2,x+t/2,0,h,z0,C.front-t/2])];
let start=x0;
for(const x of [-2*C.side,0,2*C.side]) {
  boxes.push([start,x-C.passage/2,0,h,C.front-t/2,C.front+t/2]);
  boxes.push([x-C.passage/2,x+C.passage/2,C.passageH,h,C.front-t/2,C.front+t/2]);
  start=x+C.passage/2;
}
boxes.push([start,x1,0,h,C.front-t/2,C.front+t/2]);
const walls=clubhouseWallBoxes({boxes}),trim=clubhouseSkirting(walls),d=R.finish.skirting.depth;
const covers=(x,z)=>trim.some(([a,b,,height,e,f])=>x>=a&&x<=b&&z>=e&&z<=f&&height===R.finish.skirting.height);

test('outer walls and both sides of every partition have floor trim',()=>{
  for(const [x,z]of [[0,z0+d/2],[2,R.d/2-d/2],[x0+d/2,0],[x1-d/2,0]]) assert(covers(x,z),`${x},${z}`);
  for(const x of [-C.side,C.side])for(const side of [-1,1])assert(covers(x+side*(t+d)/2,-2));
  for(const x of [-8,-4,-2,2,4,8])for(const side of [-1,1])assert(covers(x,C.front+side*(t+d)/2));
});

test('all three passages and the exit threshold stay completely clear',()=>{
  for(const x of [-2*C.side,0,2*C.side])for(let z=C.front-t;z<=C.front+t;z+=.01) assert(!covers(x,z));
  for(let x=-R.door.w/2+.01;x<R.door.w/2;x+=.05)assert(!covers(x,R.d/2-d/2));
  assert(covers(-2*C.side-C.passage/2+d/2,C.front),'passage jamb gets a return');
});

test('trim stays finite, within the room and outside the union of wall solids',()=>{
  for(const [a,b,c,height,e,f]of trim) {
    assert([a,b,c,height,e,f].every(Number.isFinite));assert(a<b&&e<f&&height>c);
    assert(a>=x0&&b<=x1&&e>=z0&&f<=R.d/2);
    const x=(a+b)/2,z=(e+f)/2;
    assert(!walls.some(([u,v,y,,w,q])=>y===0&&x>u&&x<v&&z>w&&z<q));
  }
});
