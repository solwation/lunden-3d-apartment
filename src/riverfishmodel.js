import * as THREE from 'three';
import { buildFishSurface } from './fishsurface.js';
import { RIVER_FISH, FISH_SURFACE } from './config.js';

function normalized(name) {
  const g=buildFishSurface(name,true),box=g.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  g.translate(-center.x,-center.y,-center.z);g.scale(1/size.x,1/size.y,1/size.z);g.computeBoundingBox();g.computeBoundingSphere();return g;
}
// Neutral inspection/export geometry: only ordinary position/normal/colour data.
export function riverFishNeutralGeometry(){return normalized(RIVER_FISH.species[0].name)}
const octEncode=n=>{
  const inv=1/(Math.abs(n.x)+Math.abs(n.y)+Math.abs(n.z)||1);let x=n.x*inv,y=n.y*inv;
  if(n.z<0){const old=x;x=(1-Math.abs(y))*Math.sign(old||1);y=(1-Math.abs(old))*Math.sign(y||1)}
  return[x,y];
};
// Five quantized vec4 targets pack position XYZ and two oct-normal bytes in W.
// Base position + base oct normal + five targets + colour + instanceMatrix(4)
// + instanceColor + species/phase = 14 active slots, below WebGL2's minimum16.
export function riverFishGeometry(neutral=null){
  const sources=RIVER_FISH.species.map(s=>normalized(s.name)),g=sources[0],count=g.attributes.position.count;
  const normal0=new Int8Array(count*2),grey=new Uint8Array(count*3),v=new THREE.Vector3();
  for(let i=0;i<count;i++){
    const n=octEncode(v.fromBufferAttribute(g.attributes.normal,i));normal0.set(n.map(x=>Math.round(x*127)),i*2);
    const c=g.attributes.color,tone=Math.min(1,Math.sqrt(c.getX(i)*.2126+c.getY(i)*.7152+c.getZ(i)*.0722));grey.fill(Math.round(tone*255),i*3,i*3+3);
  }
  g.setAttribute('aFishNormal0',new THREE.Int8BufferAttribute(normal0,2,true));g.setAttribute('color',new THREE.Uint8BufferAttribute(grey,3,true));
  for(let species=1;species<sources.length;species++){
    const source=sources[species],data=new Uint16Array(count*4);
    if(source.attributes.position.count!==count)throw Error('Fish species topology mismatch');
    for(let i=0;i<count;i++){
      const p=v.fromBufferAttribute(source.attributes.position,i);data.set(p.toArray().map(x=>Math.round((x+.5)*65535)),i*4);
      const n=octEncode(v.fromBufferAttribute(source.attributes.normal,i)),bytes=n.map(x=>Math.round((x*.5+.5)*255));data[i*4+3]=bytes[0]+bytes[1]*256;
    }
    g.setAttribute('aFishTarget'+species,new THREE.Uint16BufferAttribute(data,4));source.dispose();
  }
  // A matching published neutral supplies immutable base position/index views.
  // Older/missing GLBs use the complete authored recipe without losing species.
  if(neutral?.attributes.position?.count===count&&neutral.index?.count===g.index.count&&
    neutral.attributes.position.array.every((v,i)=>v===g.attributes.position.array[i])&&neutral.index.array.every((v,i)=>v===g.index.array[i])){
    g.setAttribute('position',neutral.attributes.position);g.setIndex(neutral.index);
  }
  g.deleteAttribute('normal');
  return g;
}
export const fishVisualPhase=t=>(t*FISH_SURFACE.flex.frequency)%(Math.PI*2);
export function fishSpeciesMaterial(material){
  const time={value:0};material.userData.fishTime=time;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uFishTime=time;
    shader.vertexShader=`attribute vec2 aFish;attribute vec2 aFishNormal0;
attribute vec4 aFishTarget1,aFishTarget2,aFishTarget3,aFishTarget4,aFishTarget5;
uniform float uFishTime;
vec3 fishNormal(vec2 oct){vec3 n=vec3(oct,1.-abs(oct.x)-abs(oct.y));if(n.z<0.)n.xy=(1.-abs(n.yx))*sign(n.xy+vec2(.000001));return normalize(n);}
vec4 fishTarget(){if(aFish.x<1.5)return aFishTarget1;if(aFish.x<2.5)return aFishTarget2;if(aFish.x<3.5)return aFishTarget3;if(aFish.x<4.5)return aFishTarget4;return aFishTarget5;}
`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`vec4 fishPacked=fishTarget();float fishBits=floor(fishPacked.w+.5);
vec2 fishOct=vec2(mod(fishBits,256.),floor(fishBits/256.))/255.*2.-1.;
vec3 fishLocal=aFish.x<.5?position:fishPacked.xyz/65535.-.5;
float fishTail=clamp(.5-fishLocal.z,0.,1.);
float fishAmplitude=aFish.x>4.5?${FISH_SURFACE.flex.eel.toFixed(8)}:${FISH_SURFACE.flex.amplitude.toFixed(8)};
float fishPhase=uFishTime+aFish.y-fishTail*${FISH_SURFACE.flex.waves.toFixed(8)};
float fishDerivative=fishAmplitude*(-2.*fishTail*sin(fishPhase)+fishTail*fishTail*${FISH_SURFACE.flex.waves.toFixed(8)}*cos(fishPhase));
vec3 objectNormal=fishNormal(aFish.x<.5?aFishNormal0:fishOct);objectNormal.z-=fishDerivative*objectNormal.x;`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=fishLocal;
transformed.x+=fishAmplitude*fishTail*fishTail*sin(fishPhase);`);
  };
  material.customProgramCacheKey=()=> 'fish-species-1922';return material;
}
