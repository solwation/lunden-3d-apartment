import * as T from 'three';

// #1862: actual opaque support, not the home's y=0 plane. Static world meshes are
// collected once; distance boxes cull each local ray before triangle intersection.
// Authored table/stack/container targets retain priority in main.js.
export class GroundPlacement {
 constructor({roots,camera,player,reach,grid,maxSlope,allowed,blocked,dry,tolerance=.15}){
  Object.assign(this,{camera,player,reach,grid,allowed,blocked,dry,tolerance});
  this.minUp=1/Math.sqrt(1+maxSlope*maxSlope);this.raycaster=new T.Raycaster();this.normal=new T.Vector3();this.normalMatrix=new T.Matrix3();this.entries=[];
  const seen=new Set();
  for(const root of roots){root.updateWorldMatrix(true,true);root.traverse(m=>{
   if(!m.isMesh||m.isInstancedMesh||m.isSkinnedMesh||seen.has(m)||!m.geometry) return;
   seen.add(m);if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();
   this.entries.push({mesh:m,box:m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld),matrix:m.matrixWorld.clone()});
  });}
  this.lastCost={candidates:0,triangles:0};
 }
 visible(m){
  // Desktop terrain splits intentionally disable raycast; the identical hidden master owns physical queries.
  const master=m.name==='site-terrain'&&m.parent?.children.some(o=>o.name.startsWith('site-terrain-')&&o.visible);
  for(let o=m;o;o=o.parent)if((!o.visible&&!(o===m&&master))||o.userData.ghost||o.isCamera)return false;const mats=Array.isArray(m.material)?m.material:[m.material];return mats.every(v=>v.visible!==false&&!v.transparent&&v.opacity!==0);}
 hit(ray,far){
  const r=this.raycaster;r.ray.copy(ray);r.near=0;r.far=far;const hits=[];this.lastCost={candidates:0,triangles:0};
  for(const entry of this.entries){
   const {mesh,box,matrix}=entry;
   if(box.distanceToPoint(ray.origin)>far||!ray.intersectsBox(box))continue;
   mesh.updateWorldMatrix(true,false);
   if(!matrix.equals(mesh.matrixWorld)){box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);matrix.copy(mesh.matrixWorld);if(box.distanceToPoint(ray.origin)>far||!ray.intersectsBox(box))continue;}
   if(!this.visible(mesh))continue;
   this.lastCost.candidates++;this.lastCost.triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
   r.intersectObject(mesh,false,hits);
  }
  return hits.sort((a,b)=>a.distance-b.distance)[0]??null;
 }
 valid(h){
  if(!h?.face)return false;
  const p=h.point,pl=this.player;
  this.normal.copy(h.face.normal).applyMatrix3(this.normalMatrix.getNormalMatrix(h.object.matrixWorld)).normalize();
  const roof=pl.world?.roofs?.under(p.x,p.z,p.y,this.tolerance);
  const walkRoof=roof&&Math.abs(roof.y-p.y)<this.tolerance;
  if(this.normal.y<=1e-5||(!walkRoof&&this.normal.y<this.minUp)||p.distanceTo(this.camera.position)>this.reach||!this.allowed(p)||!this.dry(p)||this.blocked(p))return false;
  // Only existing walkable ground/roofs, not a branch, a wall top or an unseen floor.
  const y=pl.groundAt(p.x,p.z,Math.max(pl.pos.y,p.y));
  return Number.isFinite(y)&&Math.abs(y-p.y)<this.tolerance;
 }
 spot(ray){
  const pl=this.player;
  if(pl.unit||pl.inCore||pl.flying||pl.fall||!pl.outdoors||ray.direction.y>=0)return null;
  const c=this.cache;
  c?.hit.object.updateWorldMatrix(true,false);
  if(c&&c.ray.equals(ray)&&c.matrix.equals(c.hit.object.matrixWorld)&&c.geometry===c.hit.object.geometry&&c.version===c.geometry.attributes.position.version&&c.count===c.geometry.drawRange.count&&this.visible(c.hit.object)&&this.valid(c.hit)){
   this.lastCost={candidates:0,triangles:0,cached:true};return{point:c.hit.point.clone(),distance:c.hit.point.distanceTo(this.camera.position),outdoor:true,snapped:true};
  }
  this.cache=null;
  const h=this.hit(ray,this.reach);if(!this.valid(h))return null;
  const p=h.point.clone();p.x=Math.round(p.x/this.grid)*this.grid;p.z=Math.round(p.z/this.grid)*this.grid;
  // Snapping must recheck the real support: no grid drift off an edge or into a wall.
  const down=new T.Ray(p.clone().add(new T.Vector3(0,this.tolerance,0)),new T.Vector3(0,-1,0));
  const snapped=this.hit(down,2*this.tolerance);if(!this.valid(snapped)||Math.abs(snapped.point.y-p.y)>this.tolerance)return null;
  this.cache={ray:ray.clone(),hit:snapped,matrix:snapped.object.matrixWorld.clone(),geometry:snapped.object.geometry,version:snapped.object.geometry.attributes.position.version,count:snapped.object.geometry.drawRange.count};
  return{point:snapped.point.clone(),distance:snapped.point.distanceTo(this.camera.position),outdoor:true,snapped:true};
 }
}
