import * as THREE from 'three';
import { RIVER_SURFACE as C, COLORS, RAIN_RIPPLES } from './config.js';
import { wetUniforms } from './wetground.js';

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

// #2186: sky reflection and downstream drift. Pure helpers (mirrored in GLSL below).
/** Flow speed (m/s): `cycles` whole wave-lengths per wrap of the shared clock, so the clock's wrap is invisible (integer ku, c). */
export const riverFlowSpeed = (wrap = RAIN_RIPPLES.wrap) => 2 * Math.PI * C.flow.cycles / wrap;
/** Unit downstream direction (x, z) from a path segment's delta: the river runs towards increasing path index (SITE.river.fall drops that way). */
export function riverFlowDirection(dx, dz) { const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
/** Ripple slope in the river frame (along u, across v) at clock `t`: the pattern travels +u at riverFlowSpeed. Bounded by the summed gains. */
export function riverFlowSlope(u, v, t = 0, distance = 0, footprint = 0) {
  const w = riverRippleWeight(distance, footprint), s = riverFlowSpeed(), out = [0, 0];
  for (const [a, b, c, d, bend, gain] of C.flow.waves) {
    const us = u - s * t, k = gain * Math.cos(a * us + b * v + bend * Math.sin(c * us + d * v)) * w, n = Math.hypot(a, b);
    out[0] += a / n * k; out[1] += b / n * k;
  }
  return out;
}
/** Fresnel weight of the reflected sky for cos(view, normal): Schlick-like with an artistic power. 0 from below the surface. */
export const riverSkyWeight = (cosTheta) => { const c = Math.max(0, Math.min(1, cosTheta)); return (C.sky.f0 + (1 - C.sky.f0) * (1 - c) ** C.sky.power) * C.sky.gain; };
/** Share of the mirror that turns into dark tree-green at `shore` = |across| / half width (0 mid-stream, 1 at the shoreline, beyond = under the bank). */
export const riverBankMix = (shore) => { const t = Math.max(0, Math.min(1, (shore - C.bank.from) / (1 - C.bank.from))); return C.bank.mix * t * t * (3 - 2 * t); };
/** Add the per-vertex river frame the drifting ripples and the bank shading need: riverFlow = (tx, tz, chainage, across m), riverShore =
 * |across| / half width. `at(x, z)` = riverAt (nearest segment: nx, nz normal, along, distance, width). Non-indexed or indexed geometry. */
export function addRiverFlow(geometry, at) {
  const pos = geometry.attributes.position, flow = new Float32Array(pos.count * 4), shore = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = at(x, z), [tx, tz] = riverFlowDirection(r.nz, -r.nx);
    const side = Math.sign((x - r.x) * r.nx + (z - r.z) * r.nz) || 1, across = side * r.distance;
    flow.set([tx, tz, r.along, across], i * 4); shore[i] = r.distance / Math.max(0.1, r.width / 2);
  }
  geometry.setAttribute('riverFlow', new THREE.BufferAttribute(flow, 4)); geometry.setAttribute('riverShore', new THREE.BufferAttribute(shore, 1));
  return geometry;
}
const vec3 = (c) => `vec3(${c.map(f).join(',')})`;

/** Preserve the supplied Standard material. With levels, affect only water-coloured vertices on the two existing far-water planes.
 * Snow disables vertex colours in edge-land: its older all-white winter treatment deliberately receives no ripple mask. */
export function riverSurface(material, levels=null, {flow=false}={}) {
  if(applied.has(material))return material;
  applied.add(material);
  const prior=material.onBeforeCompile, key=material.customProgramCacheKey(), color=new THREE.Color(COLORS.water);
  const rippleKey=key+':river-surface-2082:'+JSON.stringify([C,levels,flow]);
  material.userData.riverSurface={levels:levels?.slice()??null,stationary:!flow,flow};
  material.onBeforeCompile=function(shader,renderer){
    prior.call(this,shader,renderer);
    if(levels && !this.vertexColors)return; // preserve the old colourless edge snow shader itself
    const mask=levels ? `riverRippleWorld.w=0.0;
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
if(distance(color.rgb,vec3(${f(color.r)},${f(color.g)},${f(color.b)}))<0.00001 && min(abs(riverRippleWorld.y-(${f(levels[0])})),abs(riverRippleWorld.y-(${f(levels[1])})))<${f(C.levelTolerance)})riverRippleWorld.w=1.0;
#endif` : '';
    const fv=flow?'attribute vec4 riverFlow;attribute float riverShore;varying vec4 vRiverFlow;varying float vRiverShore;':'';
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec4 riverRippleWorld;'+fv)
      .replace('#include <project_vertex>',`#include <project_vertex>\nriverRippleWorld=vec4((modelMatrix*vec4(transformed,1.0)).xyz,1.0);\n${flow?'vRiverFlow=riverFlow;vRiverShore=riverShore;\n':''}${mask}`);
    Object.assign(shader.uniforms,{uRiverHorizon:wetUniforms.uWetHorizon,uRiverZenith:wetUniforms.uWetZenith});
    if(flow)shader.uniforms.uRiverTime=wetUniforms.uWetTime;
    const waves=C.waves.map(([a,b,c,d,bend,gain])=>{const n=Math.hypot(a,b);return `slope+=vec2(${f(a/n)},${f(b/n)})*${f(gain)}*cos(dot(p,vec2(${f(a)},${f(b)}))+${f(bend)}*sin(dot(p,vec2(${f(c)},${f(d)}))));`;}).join('\n');
    const S=riverFlowSpeed(),fwaves=C.flow.waves.map(([a,b,c,d,bend,gain])=>{const n=Math.hypot(a,b);return `slope+=vec2(${f(a/n)},${f(b/n)})*${f(gain)}*cos(${f(a)}*us+${f(b)}*rv+${f(bend)}*sin(${f(c)}*us+${f(d)}*rv));`;}).join('\n');
    const drift=flow?`vec2 fd=normalize(vRiverFlow.xy+vec2(0.00001));float us=vRiverFlow.z-${f(S)}*uRiverTime,rv=vRiverFlow.w;${fwaves}
    slope=fd*slope.x+vec2(-fd.y,fd.x)*slope.y;`:waves;
    const decl=`varying vec4 riverRippleWorld;uniform vec3 uRiverHorizon,uRiverZenith;`+(flow?'varying vec4 vRiverFlow;varying float vRiverShore;uniform float uRiverTime;':'');
    const sky=`if(riverRippleWorld.w>0.5&&faceDirection>0.0){
  vec3 rV=normalize(vViewPosition);
  float rF=(${f(C.sky.f0)}+${f(1-C.sky.f0)}*pow(1.0-clamp(dot(normal,rV),0.0,1.0),${f(C.sky.power)}))*${f(C.sky.gain)};
  vec3 rR=transpose(mat3(viewMatrix))*reflect(-rV,normal);
  vec3 rSky=mix(uRiverHorizon,uRiverZenith,sqrt(clamp(rR.y,0.0,1.0)));
  ${flow?`float rS=smoothstep(${f(C.bank.from)},1.0,vRiverShore);rSky=mix(rSky,${vec3(C.bank.tint)},${f(C.bank.mix)}*rS);`:''}
  reflectedLight.indirectSpecular+=rSky*rF;
}`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+decl)
      .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n'+sky)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
if(riverRippleWorld.w>0.5){
  vec2 p=riverRippleWorld.xz;
  float footprint=max(fwidth(p.x),fwidth(p.y));
  float fade=(1.0-smoothstep(${f(C.distance[0])},${f(C.distance[1])},distance(cameraPosition,riverRippleWorld.xyz)))*(1.0-smoothstep(${f(C.footprint[0])},${f(C.footprint[1])},footprint));
  if(fade>0.0){vec2 slope=vec2(0.0);${drift}
    normal=normalize(normal-faceDirection*mat3(viewMatrix)*vec3(slope.x,0.0,slope.y)*fade);
  }
}`);
  };
  material.customProgramCacheKey=()=>levels && !material.vertexColors ? key : rippleKey;
  return material;
}
