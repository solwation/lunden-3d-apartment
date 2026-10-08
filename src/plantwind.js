import * as THREE from 'three';
import { PLANT_WIND as P } from './config.js';

// Shared uniforms: two values per frame, never geometry uploads or new draw calls.
const uniforms={uPlantWindTime:{value:0},uPlantWindPower:{value:0}};
const materials=new WeakMap();let nextPlant=0;
const head=/* glsl */`
attribute vec4 plantWind;
uniform float uPlantWindTime;
uniform float uPlantWindPower;
vec2 plantSway() {
  if(uPlantWindPower==0.0)return vec2(0.0);
  float t=uPlantWindTime*plantWind.w;
  float phase=plantWind.y+dot(modelMatrix[3].xz,vec2(.37,.61));
  float gust=.75+.25*sin(uPlantWindTime*.43+phase);
  return clamp(vec2(sin(t+phase)+.25*sin(t*2.13+phase*1.7),.6*sin(t*.83+phase+1.2))
    *plantWind.x*plantWind.z*uPlantWindPower*gust,vec2(-${P.maxDisplacement}),vec2(${P.maxDisplacement}));
}`;
function patch(material) {
  const before=material.onBeforeCompile,key=material.customProgramCacheKey;
  const base=key===THREE.Material.prototype.customProgramCacheKey?()=>before.toString():()=>key.call(material);
  material.onBeforeCompile=function(shader,renderer){
    before.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${head}`)
      .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.xz += plantSway();');
  };
  material.customProgramCacheKey=()=>`${base()}|plant-wind-v1`;material.userData.plantWind=true;
  return material;
}
export function windMaterial(source) {
  if(source.userData.plantWind)return source;
  if(!materials.has(source)){
    const material=source.clone();material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;
    materials.set(source,patch(material));
  }
  return materials.get(source);
}
const depth=patch(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}));
export function windShadow(mesh){
  const geo=mesh.geometry;if(!geo?.attributes.plantWind)return;
  mesh.customDepthMaterial=depth;
  if(!geo.userData.windBounds){geo.computeBoundingSphere();geo.boundingSphere.radius+=Math.SQRT2*P.maxDisplacement;geo.userData.windBounds=true;}
}

/** Bake height, phase and stiffness before merging; these attributes survive ordinary mesh transforms. */
export function windGeometry(geo,soilY,seed=nextPlant++,matrix=null,trail=false) {
  const p=geo.attributes.position,data=new Float32Array(p.count*4),v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);if(matrix)v.applyMatrix4(matrix);
    const height=v.y-soilY;
    data[i*4]=Math.min(P.heightCap,trail?Math.abs(height):Math.max(0,height));
    data[i*4+1]=seed*2.39996+v.x*.7+v.z*.5;
    data[i*4+2]=P.variationMin+(seed*7%11)/10*P.variationRange;
    data[i*4+3]=P.speedMin+(seed*3%7)/6*P.speedRange;
  }
  geo.setAttribute('plantWind',new THREE.BufferAttribute(data,4));
  return geo;
}
/** Only selected foliage materials change: pottery/soil/decor retain their original shaders and arrays. */
export function windPlant(root,soilY,foliageMaterials,{trail=false}={}) {
  const foliage=new Set(foliageMaterials),seed=nextPlant++;root.updateWorldMatrix(true,true);
  const inv=root.matrixWorld.clone().invert();
  root.traverse(m=>{
    if(!m.isMesh||!foliage.has(m.material))return;
    m.geometry=windGeometry(m.geometry.clone(),soilY,seed,new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld),trail);
    m.material=windMaterial(m.material);windShadow(m);
  });
  root.userData.windPlant=true;return root;
}
export class PlantWind {
  constructor(world,weather){
    this.openings=[...world.lids.filter(o=>o.name==='fönstret'),...world.doors.filter(o=>o.exterior)];
    this.weather=weather;this.power=0;this.time=0;this.aperture=0;
  }
  update(dt){
    if(!(dt>=0&&Number.isFinite(dt)))return;
    this.time+=dt;this.aperture=this.openings.reduce((v,o)=>Math.max(v,Math.max(0,Math.min(1,o.t??0))),0);
    const wet=['rain','snow','hail'].includes(this.weather.kind)?this.weather.rain:0;
    const target=this.aperture*P.calm*(1+wet*P.wetBoost+(this.weather.storm?P.stormBoost:0));
    this.power=THREE.MathUtils.lerp(this.power,target,1-Math.exp(-dt/P.easeSeconds));
    if(target===0&&this.power<P.sleepThreshold)this.power=0;
    uniforms.uPlantWindTime.value=this.time;uniforms.uPlantWindPower.value=this.power;
  }
}
