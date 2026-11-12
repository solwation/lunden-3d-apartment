import * as THREE from 'three';
import { BREEDS } from './cat.js';
import { catEntryId } from './bestiary.js';
import { BESTIARY as C, GULL_SURFACE } from './config.js';
const visible = o => { if(!o)return false;for(let p=o;p;p=p.parent)if(!p.visible||p.userData.seasonHidden)return false;return true; };
export function observable(point,camera,maxDistance=C.seenDistance) {
 if(point.distanceTo(camera.position)>maxDistance)return false;
 const v=point.clone().project(camera);return v.z>-1&&v.z<1&&Math.abs(v.x)<.98&&Math.abs(v.y)<.98;
}
// The candidates are actual drawn world instances, never thumbnails or invisible interaction pick boxes.
export class BestiaryObserver {
 constructor({collection,camera,actors,blocked,enabled=()=>true}){Object.assign(this,{collection,camera,actors,blocked,enabled,elapsed:0,cursor:0,checks:0});}
 candidates(){
  const a=this.actors(),out=[],v=new THREE.Vector3();
  const add=(id,o,lift=0)=>{if(visible(o)){o.getWorldPosition(v);out.push({id,point:v.clone().add(new THREE.Vector3(0,lift,0))});}};
  if(a.cat?.breed&&a.cat.variant)add(catEntryId(a.cat.breed,a.cat.variant,a.cat.kitten),a.cat.object,.25);
  for(const c of a.outdoorCats?.cats??[]){add(catEntryId(c.breed,c.coat,false),c.group,.25);add(`butterfly:${c.spec.zone==='innergården'?'yellow':'orange'}`,c.bfMesh);}
  for(const s of a.squirrels?.animals??[])add(`squirrel:${s.spec.name}`,s.group,.12*s.spec.scale);
  for(const d of a.ducks?.animals??[])add(`duck:${d.brain.female?'female':'male'}`,d.mesh,.4);
  if(visible(a.paddock?.mesh))for(const p of a.paddock.ponies)if(!p.gone)out.push({id:`pony:${p.name}`,point:new THREE.Vector3(p.x,p.y+1,p.z)});
  for(const g of a.ghosts?.others?.values()??[]){const k=g.heldCat?.key?.split(':');if(k?.length===3){const b=BREEDS[Number(k[0])],c=b?.coats[Number(k[1])];if(c)add(catEntryId(b,c,k[2]==='true'),g.heldCat.object);}}
  for(const f of a.fishing?.fish??[])if(!f.broken)add(`fish:${f.species}`,f.model);
  for(const f of a.riverFish?.shown??[])if(visible(a.riverFish.fish))out.push({id:`fish:${f.species}`,point:new THREE.Vector3(f.x,f.drawnY,f.z)});
  const shark=a.riverFish?.shark;add('fish:shark',shark?.fin);add('fish:shark',shark?.body,.3);
  add('figure:pingping',a.pingping?.model,.12);add('figure:santa',a.santa?.object,.6);add('figure:olof',a.olofDriver?.fig?.object,.8);
  const birds=a.birds;
  if((visible(birds?.mesh)||visible(birds?.nearMesh))&&birds.fade>.5){
   // The immutable source seeds cover both exclusive LOD batches; packed far slots may be empty/stale.
   const g=birds.mesh.geometry,u=birds.uniforms,t=u.uTime.value,seed=birds.seeds?.a??g.getAttribute('aSeed').array,flags=birds.seeds?.b??g.getAttribute('aSeed2').array;
   for(let i=0;i<(birds.count??seed.length/4);i++){
    if(flags[i*2+1]>.5&&u.uHigh.value<.05)continue;
    const j=i*4,angle=seed[j]+t*seed[j+3],r=seed[j+1],p=u.uCenter.value.clone().add(new THREE.Vector3(Math.cos(angle)*r,seed[j+2]+Math.sin(t*GULL_SURFACE.bobHz+seed[j]*GULL_SURFACE.seedPhase)*GULL_SURFACE.bobAmplitude,Math.sin(angle)*r));
    out.push({id:'bird:gull',point:p,maxDistance:C.birdSeenDistance});
   }
  }
  const flutter=a.marks?.flutter;if(visible(flutter?.mesh))for(const b of flutter.b)if(b.age<b.life&&b.at)out.push({id:'butterfly:magic',point:b.at.clone()});
  return out;
 }
 update(dt){if(!this.enabled()){this.elapsed=0;return;}this.elapsed+=dt;if(this.elapsed<C.observeEvery)return;this.elapsed=0;this.camera.updateMatrixWorld();const all=this.candidates();if(!all.length)return;
  let checked=0;for(let n=0;n<all.length&&checked<C.occlusionChecks;n++){const c=all[(this.cursor+n)%all.length];if(!observable(c.point,this.camera,c.maxDistance??C.seenDistance))continue;
   const last=this.collection.lastSeen.get(c.id);if(last!==undefined&&this.collection.now()-last<C.seenRepeatMs)continue;
   checked++;this.checks++;if(!this.blocked?.(c.point,c.id))this.collection.record(c.id,'seen');
  }this.cursor=(this.cursor+C.occlusionChecks)%all.length;
 }
}
