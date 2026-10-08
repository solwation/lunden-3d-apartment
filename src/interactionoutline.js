import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { INTERACTION_OUTLINE as P } from './config.js';

const topologyCache = new Map();let cachedFaces=0;
// Weld positional seams so smooth cups/balls also get a view-dependent outer silhouette.
function topology(geometry) {
  const version=geometry.attributes.position.version,cached=topologyCache.get(geometry);
  if(cached?.version===version){topologyCache.delete(geometry);topologyCache.set(geometry,cached);return cached}
  if(cached){cachedFaces-=cached.faces.length;topologyCache.delete(geometry)}
  const pos=geometry.attributes.position,index=geometry.index,vertices=new Map(),edges=new Map(),faces=[];
  const vertex=i=>{const v=new THREE.Vector3().fromBufferAttribute(pos,i),key=v.toArray().map(n=>Math.round(n*1e6)).join(',');if(!vertices.has(key))vertices.set(key,{id:vertices.size,v});return vertices.get(key)};
  const count=index?index.count:pos.count;
  for(let i=0;i<count;i+=3) {
    const points=[0,1,2].map(j=>vertex(index?index.getX(i+j):i+j)),[a,b,c]=points.map(p=>p.v);
    const normal=b.clone().sub(a).cross(c.clone().sub(a));if(normal.lengthSq()<1e-18)continue;normal.normalize();
    const face={normal,center:a.clone().add(b).add(c).multiplyScalar(1/3)};faces.push(face);
    for(let j=0;j<3;j++){const a=points[j],b=points[(j+1)%3],key=[Math.min(a.id,b.id),Math.max(a.id,b.id)].join(':');if(!edges.has(key))edges.set(key,{a:a.v,b:b.v,faces:[]});edges.get(key).faces.push(face)}
  }
  const cos=Math.cos(THREE.MathUtils.degToRad(P.angle)),list=[...edges.values()];
  for(const e of list)e.sharp=e.faces.length!==2||e.faces[0].normal.dot(e.faces[1].normal)<cos;
  const result={version,faces,edges:list};
  if(faces.length<=P.cacheFaces){while(cachedFaces+faces.length>P.cacheFaces){const key=topologyCache.keys().next().value;cachedFaces-=topologyCache.get(key).faces.length;topologyCache.delete(key)}topologyCache.set(geometry,result);cachedFaces+=faces.length}
  return result;
}
const shown=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true};
// Only the active target is copied. Two screen-width line passes give contrast on white and dark objects.
// Geometry stays in its root's local space; animation updates only changed child/instance transforms.
export class InteractionOutline {
  constructor(scene,camera) {
    this.camera=camera;this.group=new THREE.Group();this.group.visible=false;this.group.userData.ghost=true;scene.add(this.group);
    this.materials=[[P.borderColor,P.borderWidth],[P.color,P.width]].map(([color,linewidth])=>{
      const m=new LineMaterial({color,linewidth,transparent:true,opacity:P.opacity,depthTest:true,depthWrite:false,toneMapped:false});
      m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('vec4 mvPosition = ( position.y < 0.5 ) ? start : end;',`vec4 mvPosition = ( position.y < 0.5 ) ? start : end;
        vec4 biased = projectionMatrix * vec4(0.0,0.0,mvPosition.z + ${P.depthBias},1.0);
        gl_Position.z = biased.z / biased.w * gl_Position.w;`)};
      return m;
    });this.entries=[];this.root=null;this.rebuilds=0;this.eye=new THREE.Vector3(Infinity,Infinity,Infinity);
  }
  clear() {
    this.entries=[];
    this.geometry?.dispose();this.geometry=null;this.group.clear();this.group.visible=false;this.root=null;this.target=null;
  }
  update(target) {
    let root=target?.outlineRoot??target?.piece?.object??target?.pickable??target?.item?.model??target?.object;
    if(root?.isMesh&&!root.visible)root=target?.item?.model;
    if(!target||target.blocked||!root||!shown(root)){if(this.root)this.clear();return}
    root.updateWorldMatrix(true,true);
    const owner=target.outlineOwner??target,strict=!!target.outlineOwner||target.pickable===root;
    const meshes=[];
    const accept=(o,index=null)=>{
      if(!o.isMesh||!shown(o)||!o.geometry?.attributes.position?.count||!o.layers.test(this.camera.layers)||o.userData.surface!==undefined)return;
      if(strict&&o.userData.door&&o.userData.door!==owner&&o.userData.door!==target)return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      if(mats.every(m=>!m.visible||m.opacity===0||m.blending===THREE.AdditiveBlending||m.blending===THREE.CustomBlending))return;
      if(o.isInstancedMesh&&index===null)return; // never outline unrelated instances in a batch
      meshes.push({object:o,index});
    };
    if(target.outlineInstances)for(const p of target.outlineInstances)accept(p.object,p.index);
    else root.traverse(o=>accept(o));
    if(!meshes.length){if(this.root)this.clear();return}
    const rebuild=root!==this.root||meshes.length!==this.entries.length||meshes.some((p,i)=>p.object!==this.entries[i]?.object||p.index!==this.entries[i]?.index||p.object.geometry!==this.entries[i]?.source||p.object.geometry.attributes.position.version!==this.entries[i]?.topology.version);
    if(rebuild) {
      this.clear();this.root=root;this.rebuilds++;
      this.entries=meshes.map(p=>({...p,source:p.object.geometry,topology:topology(p.object.geometry),matrix:new THREE.Matrix4().makeScale(0,0,0)}));
      const count=this.entries.reduce((n,e)=>n+e.topology.edges.length*6,0);
      this.positions=new Float32Array(count);this.geometry=new LineSegmentsGeometry();this.geometry.setPositions(this.positions);
      this.materials.forEach((m,i)=>{const line=new LineSegments2(this.geometry,m);line.renderOrder=P.renderOrder+i;line.raycast=()=>{};line.frustumCulled=false;this.group.add(line)});
    }
    const inv=root.matrixWorld.clone().invert(),temp=new THREE.Matrix4(),instance=new THREE.Matrix4(),eye=this.camera.getWorldPosition(new THREE.Vector3());let dirty=rebuild||!eye.equals(this.eye)||!this.group.matrix.equals(root.matrixWorld);this.eye.copy(eye);
    for(const e of this.entries){temp.multiplyMatrices(inv,e.object.matrixWorld);if(e.index!==null){e.object.getMatrixAt(e.index,instance);temp.multiply(instance)}if(!e.matrix.equals(temp)){e.matrix.copy(temp);dirty=true}}
    if(dirty) {
      const v=new THREE.Vector3(),localEye=new THREE.Vector3(),direction=new THREE.Vector3();let offset=0;
      for(const e of this.entries) {
        localEye.copy(eye).applyMatrix4(temp.multiplyMatrices(root.matrixWorld,e.matrix).invert());
        for(const f of e.topology.faces)f.front=f.normal.dot(direction.subVectors(localEye,f.center))>0;
        for(const edge of e.topology.edges) {
          if(!edge.sharp&&edge.faces[0].front===edge.faces[1].front)continue;
          for(const p of [edge.a,edge.b]){v.copy(p).applyMatrix4(e.matrix);this.positions[offset++]=v.x;this.positions[offset++]=v.y;this.positions[offset++]=v.z}
        }
      }
      this.geometry.attributes.instanceStart.data.array.set(this.positions);this.geometry.attributes.instanceStart.data.needsUpdate=true;
      this.geometry.instanceCount=offset/6;
    }
    this.group.matrixAutoUpdate=false;this.group.matrix.copy(root.matrixWorld);this.group.updateMatrixWorld(true);this.group.visible=true;this.target=target;
  }
}
