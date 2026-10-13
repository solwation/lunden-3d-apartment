import * as THREE from 'three';
import { RESPAWN, OUTDOOR, PLAYER, SITE } from './config.js';
import { inPoly } from './player.js';
import { groundY } from './surroundings.js';
import { riverAt } from './riverbridge.js';
import { husLLayout } from './exterior.js';

// Only destination changes. Current-world collision/terrain decides whether each sampled point is usable.
const geometryBoxes = new WeakMap();
const within = (box, x, z, pad = 0) => x >= box.x0-pad && x <= box.x1+pad && z >= box.z0-pad && z <= box.z1+pad;
function geometryBox(geometry) {
  const position = geometry.attributes.position, buffer = position?.data ?? position;
  if (!position) return null;
  const old = geometryBoxes.get(geometry), signature = [position,buffer.array,buffer.version,position.count];
  if (old && signature.every((value,i)=>value===old.signature[i])) return old.box;
  const box = new THREE.Box3().setFromBufferAttribute(position); // private: never change authored bounding boxes
  geometryBoxes.set(geometry,{signature,box}); return box;
}
/** Conservative live instance bounds supplement collision outlines (notably the parked cars). */
function instanceBoxes(world) {
  const boxes=[], local=new THREE.Matrix4(), matrix=new THREE.Matrix4();
  world.object.updateMatrixWorld(true);
  world.object.traverse(object=>{
    if (!object.isInstancedMesh) return;
    for(let parent=object;parent;parent=parent.parent) if(!parent.visible||parent.userData.moving) return;
    const box=geometryBox(object.geometry);if(!box)return;
    for(let i=0;i<object.count;i++) {
      object.getMatrixAt(i,local);matrix.multiplyMatrices(object.matrixWorld,local);
      const bound=box.clone().applyMatrix4(matrix);
      if(RESPAWN.regions.some(region=>bound.max.x>=region.x0-PLAYER.radius&&bound.min.x<=region.x1+PLAYER.radius&&bound.max.z>=region.z0-PLAYER.radius&&bound.min.z<=region.z1+PLAYER.radius)) boxes.push(bound);
    }
  });
  return boxes;
}
// Collision outlines can be clear at their centre, despite enclosing a car/trunk/solid object.
// The actual OUTDOOR perimeter encloses permitted space and must not be treated as solid.
function closedRings(segments) {
  const rings=[];
  for(let first=0;first<segments.length;first++) {
    const points=[],start=segments[first];let x=start[0],z=start[1];
    for(let i=first;i<Math.min(segments.length,first+RESPAWN.ringEdges);i++) {
      const segment=segments[i];if(segment[0]!==x||segment[1]!==z)break;
      points.push([x,z]);x=segment[2];z=segment[3];
      if(x===start[0]&&z===start[1]) {
        if(points.length>=3&&![[OUTDOOR.x0,OUTDOOR.z0],[OUTDOOR.x1,OUTDOOR.z0],[OUTDOOR.x1,OUTDOOR.z1],[OUTDOOR.x0,OUTDOOR.z1]].every(([x,z])=>inPoly(points,x,z))) rings.push(points);
        first=i;break;
      }
    }
  }
  return rings;
}
function context(player) {
  const probe=Object.create(player);probe.pos=player.pos.clone();
  return {probe,boxes:instanceBoxes(player.world),rings:closedRings(player.world.levels[0].segments)};
}
/** A ground candidate, checked from its own outdoor context, not the visitor's old roof/core/garage. */
export function safeRespawnPoint(player,x,z,prepared=null) {
  if(!Number.isFinite(x)||!Number.isFinite(z)||!within(OUTDOOR,x,z,-PLAYER.radius))return null;
  const river=riverAt(x,z);if(river.distance<=river.width/2+PLAYER.radius)return null;
  const row=husLLayout(player.world.size.x);
  if(within({x0:row.xw,x1:row.xe,z0:0,z1:player.world.size.z},x,z,PLAYER.radius)||SITE.blocks.some(block=>within(block,x,z,PLAYER.radius)))return null;
  const {probe,boxes,rings}=prepared??context(player),y=groundY(x,z);
  if(!Number.isFinite(y))return null;
  probe.pos.set(x,y,z);
  if(probe.inFootprint()||probe.inCore||probe.unit||probe.below||probe.aloft||!probe.roomToStand()||probe.ceilingAt(x,z,y)<y+PLAYER.headroom||Math.abs(probe.groundAt(x,z,y)-y)>1e-6||!probe.isFree(x,z,0))return null;
  if(rings.some(polygon=>inPoly(polygon,x,z)))return null;
  if(boxes.some(box=>box.max.y>y+0.02&&box.min.y<y+PLAYER.headroom&&x>box.min.x-PLAYER.radius&&x<box.max.x+PLAYER.radius&&z>box.min.z-PLAYER.radius&&z<box.max.z+PLAYER.radius))return null;
  return {x,y,z};
}
/** Bounded random region/point search, then checked grid candidates; never teleport to an unchecked fallback. */
export function chooseRespawn(player,random=Math.random) {
  const prepared=context(player),regions=[...RESPAWN.regions];
  for(let i=regions.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[regions[i],regions[j]]=[regions[j],regions[i]];}
  for(const region of regions) for(let i=0;i<RESPAWN.samples;i++) {
    const point=safeRespawnPoint(player,THREE.MathUtils.lerp(region.x0,region.x1,random()),THREE.MathUtils.lerp(region.z0,region.z1,random()),prepared);
    if(point)return {...point,region:region.id};
  }
  const candidates=[];
  for(const region of regions)for(let ix=0;ix<RESPAWN.grid;ix++)for(let iz=0;iz<RESPAWN.grid;iz++) {
    const point=safeRespawnPoint(player,THREE.MathUtils.lerp(region.x0,region.x1,(ix+.5)/RESPAWN.grid),THREE.MathUtils.lerp(region.z0,region.z1,(iz+.5)/RESPAWN.grid),prepared);
    if(point)candidates.push({...point,region:region.id});
  }
  return candidates.length?candidates[Math.floor(random()*candidates.length)]:null;
}
export function respawnOutdoors(player,random=Math.random) {
  const point=chooseRespawn(player,random);if(!point)return null;
  player.spawn(point.x,point.z,Math.PI);
  player.pos.y=point.y;player.eyeY=point.y+PLAYER.eye;player.camera.position.y=player.eyeY;
  return point;
}
