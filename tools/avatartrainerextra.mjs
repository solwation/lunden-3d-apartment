// #2116: the triangles #2084's trainer details (lacing, tongue, panels; src/avatartrainers.js) add to the whole figure, both feet.
// Older whole-figure triangle budgets (#2002/#2012/#2063) predate them and leave them out here, like the other later head budgets.
import * as T from 'three';
import { trainerDetails } from '../src/avatartrainers.js';
const upper=new T.SphereGeometry(.5,10,4,0,Math.PI*2,0,Math.PI/2).scale(.105,.18,.27),p=upper.attributes.position;
for(let i=0;i<p.count;i++){const z=p.getZ(i),t=Math.min(1,Math.max(0,(z+.02)/.14));p.setY(i,p.getY(i)*(1-.58*t*t*(3-2*t))-.442);p.setZ(i,z+.055);}
upper.computeVertexNormals();
export const trainerTriangles=2*trainerDetails(upper).reduce((n,d)=>n+(d.geometry.index?d.geometry.index.count:d.geometry.attributes.position.count)/3,0);
