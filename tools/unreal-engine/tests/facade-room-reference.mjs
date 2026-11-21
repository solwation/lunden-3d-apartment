// Compile the web's actual fragment function as a GLSL compute reference, using the same per-face packed samples.
import { interiorMapShader } from '../../../src/interiormap.js';
const s = { uniforms: {}, vertexShader:'#include <common>\n#include <project_vertex>',
  fragmentShader:'#include <common>\n#include <opaque_fragment>' };
interiorMapShader(s);
const head = s.fragmentShader.split('if ( vRoomC.w > 0.0 )')[0].replace('#include <common>','')
  .replace('uniform vec2 uRoomLevel','vec2 uRoomLevel').replaceAll('varying vec4','vec4');
console.log(`#version 450
#define saturate(x) clamp(x,0.,1.)
const mat4 viewMatrix = mat4(1.);
${head}
layout(local_size_x=1) in;
layout(set=0,binding=0,std430) readonly buffer Inputs { float a[]; };
layout(set=0,binding=1,std430) writeonly buffer Outputs { vec4 result[]; };
void main() {
  uint i=gl_GlobalInvocationID.x, b=i*INPUT_COUNT;
  // Web metres (X,Y up,Z); native sample fields are UE cm (X,Y,Z up).
  vec3 origin=vec3(a[b+0],a[b+2],a[b+1])*.01, n=vec3(a[b+3],0,a[b+4]);
  vec3 world=vec3(a[b+25],a[b+27],a[b+26])*.01;
  vec3 eye=normalize(vec3(a[b+28],a[b+30],a[b+29]));
  vec3 camera=world+eye;
  vRoomC=vec4(origin-camera,a[b+7]);
  vRoomA=vec4(a[b+8],a[b+9],a[b+10],a[b+11]);
  vRoomB=vec4(a[b+12]+.99*a[b+13],a[b+14],a[b+5],a[b+6]);
  uRoomLevel=mix(DAY_LEVEL,NIGHT_LEVEL,a[b+31]);
  float alpha;
  vec3 room=roomColour(world-camera,n,alpha);
  vec3 glow=(alpha>0. && a[b+15]>.5 && a[b+31]>DUSK_ON && a[b+32]>.5) ? WINDOW_EMISSIVE : vec3(0);
  result[i]=vec4(room*alpha+glow,alpha);
}`);
