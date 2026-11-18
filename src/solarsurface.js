// #2083: small, shared solar-glass atlases; all cell/busbar dimensions are artistic guesses.
import * as THREE from 'three';
import {SOLAR_SURFACE as C,COLORS} from './config.js';
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const hash=(x,y)=>{let h=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^C.seed;h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296;};
/** Colour is a multiplier on the unchanged blue base; linear green stores roughness/baseRoughness. */
export function solarSurfaceData(size,scalar=false){
 const data=new Uint8Array(size*size*4),[lo,hi]=C.topV,span=hi-lo;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size,v=(y+.5)/size,i=4*(y*size+x);let colour=1,roughness=C.sideRoughness;
  if(v>=lo&&v<=hi){
   const z=(v-lo)/span,fx=u*C.columns,fy=z*C.rows,cx=Math.floor(fx),cy=Math.floor(fy),dx=(fx-cx)*C.moduleWidth/C.columns,dz=(fy-cy)/C.rows;
   const edge=Math.min(dx,C.moduleWidth/C.columns-dx,dz,1/C.rows-dz),pixel=Math.max(C.moduleWidth/size,1/(size*span));
   const gap=1-smooth((edge-C.gap/2+pixel/2)/pixel);
   let bar=0;for(let k=1;k<=C.busbars;k++){const distance=Math.abs(dx-k*C.moduleWidth/C.columns/(C.busbars+1));bar=Math.max(bar,1-smooth((distance-C.busbar/2+pixel/2)/pixel));}
   const frame=1-smooth((Math.min(u*C.moduleWidth,(1-u)*C.moduleWidth,z,1-z)-C.frame+pixel/2)/pixel);
   const cell=.92+.035*(hash(cx,cy)-.5);
   colour=(cell+(1-cell)*bar*.8)*(1-gap*.67);colour=colour*(1-frame)+frame;
   roughness=.33+.008*Math.sin(u*Math.PI*2)*Math.sin(z*Math.PI*2)+.006*(hash(cx,cy)-.5);
   roughness=roughness*(1-gap)+.36*gap;roughness=roughness*(1-frame)+C.sideRoughness*frame;
  }
  if(scalar){data[i]=0;data[i+1]=Math.round(255*roughness/C.baseRoughness);data[i+2]=0;}
  else data[i]=data[i+1]=data[i+2]=Math.round(255*colour);
  data[i+3]=255;
 }
 return data;
}
/** Assign only existing UVs, before the box is tilted. Every non-top face samples the flat swatch. */
export function solarPanelUV(g,width,depth){
 const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,repeats=Math.max(1,Math.round(width/C.moduleWidth));
 for(let i=0;i<p.count;i++){
  if(n.getY(i)>.5)uv.setXY(i,(p.getX(i)/width+.5)*repeats,C.topV[0]+(p.getZ(i)/depth+.5)*(C.topV[1]-C.topV[0]));
  else uv.setXY(i,.5,C.flatV);
 }
 return g;
}
let textures;
export function solarSurfaceTextures(){
 if(textures)return textures;
 const make=(size,scalar)=>{const t=new THREE.DataTexture(solarSurfaceData(size,scalar),size,size,THREE.RGBAFormat);t.colorSpace=scalar?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=8;t.name=scalar?'solar-glass-roughness':'solar-cell-colour';t.needsUpdate=true;return t;};
 textures={colour:make(C.colourSize,false),roughness:make(C.roughnessSize,true)};return textures;
}
export function solarPanelMaterial(){const t=solarSurfaceTextures();return new THREE.MeshStandardMaterial({color:COLORS.solar,map:t.colour,roughnessMap:t.roughness,roughness:C.baseRoughness,metalness:.5});}
