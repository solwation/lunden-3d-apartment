import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYROOM as R } from '../src/config.js';
import { cinemaCurtain } from '../src/clubhousefurnishings.js';
const close=(a,b,epsilon=1e-9)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
test('screen fills the BIO wall with user-requested 40 cm floor/ceiling clearances',()=>{
 const s=R.furniture.cinema.screen,north=-R.d/2,south=R.clubhouse.front-R.clubhouse.wall/2;
 close(s.bottom,.4);close(R.ceiling-s.bottom-s.h,.4);close(s.z-s.w/2-north,s.sideGap);close(south-s.z-s.w/2,s.sideGap);
 close(s.w,6.34);close(s.h,1.9);assert(s.w/(south-north)>.9);
 assert.deepEqual(R.furniture.tv,{x:s.x,w:s.w,h:s.h,y:s.bottom});
});
test('velvet curtains touch both side walls, overlap only 6 cm, and face the room',()=>{
 const s=R.furniture.cinema.screen,c=R.furniture.cinema.curtain;
 for(const side of [-1,1]){
  const g=cinemaCurtain(side),p=g.attributes.position,n=g.attributes.normal;
  g.computeBoundingBox();const b=g.boundingBox,wall=side<0?-R.d/2:R.clubhouse.front-R.clubhouse.wall/2;
  close((side<0?b.min.z:b.max.z)-R.z,wall,.0002);close((side<0?b.max.z:b.min.z)-R.z,s.z+side*(s.w/2-c.overlap),.0002);
  close(b.min.y,c.bottom,1e-6);close(b.max.y,R.ceiling,1e-6);assert(b.min.x>R.x+s.x+.08);
  for(let i=0;i<p.count;i++){assert(Number.isFinite(p.getX(i)));assert(n.getX(i)>0);close(Math.hypot(n.getX(i),n.getY(i),n.getZ(i)),1,1e-5);}
  g.dispose();
 }
});
