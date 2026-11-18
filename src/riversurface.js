import * as THREE from 'three';
import { RIVER_SURFACE as C, COLORS } from './config.js';

// #2082: two small, curved ripple directions. Shared world coordinates keep independently batched river ends in phase.
const applied = new WeakSet();
const smooth = (a,b,x) => { const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t); };
export const riverRippleWeight = (distance, footprint=0) => (1-smooth(...C.distance,distance))*(1-smooth(...C.footprint,footprint));
export function riverRippleSlope(x,z,distance=0,footprint=0) {
  const f=riverRippleWeight(distance,footprint), out=[0,0];
  for(const[a,b,c,d,bend,gain]of C.waves){const k=gain*Math.cos(a*x+b*z+bend*Math.sin(c*x+d*z))*f,n=Math.hypot(a,b);out[0]+=a/n*k;out[1]+=b/n*k;}
  return out;
}
const f = n => Number(n).toFixed(8);

/** Preserve the supplied Standard material. With levels, affect only water-coloured vertices on the two existing far-water planes.
 * Snow disables vertex colours in edge-land: its older all-white winter treatment deliberately receives no ripple mask. */
export function riverSurface(material, levels=null) {
  if(applied.has(material))return material;
  applied.add(material);
  const prior=material.onBeforeCompile, key=material.customProgramCacheKey(), color=new THREE.Color(COLORS.water);
  const rippleKey=key+':river-surface-2082:'+JSON.stringify([C,levels]);
  material.userData.riverSurface={levels:levels?.slice()??null,stationary:true};
  material.onBeforeCompile=function(shader,renderer){
    prior.call(this,shader,renderer);
    if(levels && !this.vertexColors)return; // preserve the old colourless edge snow shader itself
    const mask=levels ? `riverRippleWorld.w=0.0;
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
if(distance(color.rgb,vec3(${f(color.r)},${f(color.g)},${f(color.b)}))<0.00001 && min(abs(riverRippleWorld.y-(${f(levels[0])})),abs(riverRippleWorld.y-(${f(levels[1])})))<${f(C.levelTolerance)})riverRippleWorld.w=1.0;
#endif` : '';
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec4 riverRippleWorld;')
      .replace('#include <project_vertex>',`#include <project_vertex>\nriverRippleWorld=vec4((modelMatrix*vec4(transformed,1.0)).xyz,1.0);\n${mask}`);
    const waves=C.waves.map(([a,b,c,d,bend,gain])=>{const n=Math.hypot(a,b);return `slope+=vec2(${f(a/n)},${f(b/n)})*${f(gain)}*cos(dot(p,vec2(${f(a)},${f(b)}))+${f(bend)}*sin(dot(p,vec2(${f(c)},${f(d)}))));`;}).join('\n');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec4 riverRippleWorld;')
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
if(riverRippleWorld.w>0.5){
  vec2 p=riverRippleWorld.xz;
  float footprint=max(fwidth(p.x),fwidth(p.y));
  float fade=(1.0-smoothstep(${f(C.distance[0])},${f(C.distance[1])},distance(cameraPosition,riverRippleWorld.xyz)))*(1.0-smoothstep(${f(C.footprint[0])},${f(C.footprint[1])},footprint));
  if(fade>0.0){vec2 slope=vec2(0.0);${waves}
    normal=normalize(normal-faceDirection*mat3(viewMatrix)*vec3(slope.x,0.0,slope.y)*fade);
  }
}`);
  };
  material.customProgramCacheKey=()=>levels && !material.vertexColors ? key : rippleKey;
  return material;
}
