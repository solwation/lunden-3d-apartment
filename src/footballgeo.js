// #1853 fixed football fittings use the existing farWalls buckets; no per-frame obstacle scan or new player bounds.
import {FOOTBALL as C} from './config.js';
import {footballWorld} from './footballphysics.js';
export function footballFootprints(){const out=[],rect=(kind,u,v,w,d)=>{const p=[[u-w/2,v-d/2],[u+w/2,v-d/2],[u+w/2,v+d/2],[u-w/2,v+d/2]].map(q=>footballWorld(C,...q));p.kind=kind;out.push(p);};for(const sign of[-1,1])for(const u of[-C.goalWidth/2,C.goalWidth/2])for(const v of[sign*C.length/2,sign*(C.length/2+C.goalDepth)])rect('goal-post',u,v,C.postR*2,C.postR*2);for(const v of C.bench.offsets)rect('bench',C.bench.side,v,C.bench.depth+.06,C.bench.length);rect('fountain',...C.fountain.at,C.fountain.base,C.fountain.base);return out;}
export const footballSegments=()=>footballFootprints().flatMap(p=>p.map((a,i)=>[...a,...p[(i+1)%p.length]]));
