// #1844: contact on the one explicitly validated brick climb. Existing paw meshes only; no geometry rebuild/draw.
import * as THREE from 'three';
import {OUTDOOR_CATS} from './config.js';
const point=new THREE.Vector3(),bodyBox=new THREE.Box3();
const corners=(b,visit)=>{for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])visit(x,y,z);};
// Called after the standing bake, before the puppet is attached to the world.
export function prepareClimbContact(puppet){
 const paws=[puppet.shoulder.children.at(-1),puppet.leftShoulder.children.at(-1),...puppet.parts.hips.map(h=>h.foot)],standing=[];
 puppet.object.updateMatrixWorld(true);
 for(const p of paws){p.geometry.computeBoundingBox();corners(p.geometry.boundingBox,(x,y,z)=>{point.set(x,y,z).applyMatrix4(p.matrixWorld);standing.push(point.clone());});}
 return{paws,standing};
}
export function alignClimbContact(c,full){
 const s=c.at,C=OUTDOOR_CATS.exploration;if(c.st!=='route'||!s?.climbing||!Number.isFinite(s.wallZ)||s.contactBlend<=0)return;
 c.group.updateMatrixWorld(true);let leading=-Infinity;
 if(full)for(const p of c.climbContact.paws)corners(p.geometry.boundingBox,(x,y,z)=>{point.set(x,y,z).applyMatrix4(p.matrixWorld);leading=Math.max(leading,point.z);});
 else for(const p of c.climbContact.standing){point.copy(p).applyMatrix4(c.group.matrixWorld);leading=Math.max(leading,point.z);}
 const offset=Math.max(-C.climbMaxOffset,Math.min(C.climbMaxOffset,s.wallZ-C.climbPawInset-leading));
 // A baked LOD has a coarser silhouette; keep its entire hull outside the brick too.
 const visibleBody=full?c.puppet.object:c.lods[c.walking?1:0];
 bodyBox.setFromObject(visibleBody);
 c.group.position.z+=Math.min(offset*s.contactBlend,s.wallZ-C.climbPawInset-bodyBox.max.z);
}
