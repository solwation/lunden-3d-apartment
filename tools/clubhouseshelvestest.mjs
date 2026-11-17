import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPUTER_MEDIA as C, PLAYROOM as R } from '../src/config.js';
import { computerFurniture, pcPedestalRect } from '../src/computerfurniture.js';
import { clubhouseShelves, SHELF } from '../src/clubhouseshelves.js';
test('shelves, figures and poster stay inside SPEL, off the aisle, above the desks and PCs; the rug is flat (#2028)',()=>{
 const st=C.stations.filter(s=>s.clubhouse),[b]=[st[0].bounds],parts=clubhouseShelves();
 assert.equal(parts.length,1);const g=parts[0];g.computeBoundingBox();const bb=g.boundingBox;
 assert(bb.min.x>=b[0]-.001&&bb.max.x<=b[1]+.001&&bb.min.z>=b[2]&&bb.max.z<=b[3],'inside SPEL');
 const pos=g.attributes.position.array,col=g.attributes.color.array;let tris=pos.length/9,rugTris=0,glow=0,low=0;
 const deskTop=C.desk.height,pcTop=C.pc.pedestal[1]+C.pc.case[1];
 for(let i=0;i<pos.length;i+=3){assert(Number.isFinite(pos[i])&&Number.isFinite(pos[i+1])&&Number.isFinite(pos[i+2]));
  const x=pos[i]-R.x,y=pos[i+1];
  if(y<.02){assert(y<=.0121,'rug stays flat');rugTris+=1/3;continue;}       // flat rug vertices
  assert(y>=SHELF.y-SHELF.thick-.006-1e-6||(y>=SHELF.posterY-SHELF.poster[1]/2-.03),'wall decor sits above the desks and PCs');
  assert(x<4.5||x>7.5,'wall decor keeps the central aisle clear');
  assert(Math.max(col[i],col[i+1],col[i+2])>0);if(Math.max(col[i],col[i+1],col[i+2])>1)glow++;}
 // the poster stays clear of the PC pedestals, the shelves of the desks' monitors (which top out under the shelf)
 assert(C.desk.monitorY+C.desk.monitorHeight/2+C.desk.bezel<SHELF.y-SHELF.thick,'shelf clears the monitors');
 assert(pcTop<SHELF.y-SHELF.thick,'shelf clears the PCs');
 assert(SHELF.posterY+SHELF.poster[1]/2<SHELF.y-SHELF.thick,'poster hangs under the shelf');
 for(const s of st){const [x0,x1,z0,z1]=pcPedestalRect(s);let hit=false;
  for(let i=0;i<pos.length;i+=3){const y=pos[i+1];if(y<.02||y>pcTop)continue;if(pos[i]>x0&&pos[i]<x1&&pos[i+2]>z0&&pos[i+2]<z1)hit=true;}
  assert(!hit,`${s.id}: decor clear of the PC pedestal`);}
 assert(glow>100,'LED parts glow');assert(rugTris>100);
 let base=0;for(const p of computerFurniture()){base+=p.index?p.index.count/3:p.attributes.position.count/3;p.dispose();}
 console.log({shelfTrianglesTotal:tris,rugTriangles:Math.round(rugTris),furnitureTrianglesBefore:base});g.dispose();
});
