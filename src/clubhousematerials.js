import * as THREE from 'three';
import { PLAYROOM as R } from './config.js';
import { rememberFragmentCompile } from './vertexcompile.js';

export const FINISH = { paint: 0, wood: 1, fabric: 2, metal: 3, floor: 4 };

// #1574: per-room light levels shared by every clubhouse material, [BIO, BILJARD, SPEL, hall] (PLAYROOM.zones): the ceiling-lamp term and the ambient term of
// each fragment are scaled by the room it is in. The Vector4s are live: set a component and every clubhouse surface follows next frame (no recompile).
export const CLUB_ZONES = { lamp: new THREE.Vector4(...R.zones.lamp), ambient: new THREE.Vector4(...R.zones.ambient) };

// Linear vertex colours and a per-surface finish keep the room in one PBR batch.
export function clubhouseSurface(geometry, hex, finish = FINISH.paint) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const count = g.attributes.position.count, colour = new THREE.Color(hex);
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colour.toArray(colours, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.setAttribute('aClubFinish', new THREE.BufferAttribute(new Float32Array(count).fill(finish), 1));
  g.deleteAttribute('uv');
  return g;
}

export function clubhouseMaterial() {
  const C = R.appearance;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: C.paintRoughness });
  const before = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    before.call(material, shader);
    shader.uniforms.uClubOrigin = { value: new THREE.Vector3(R.x, 0, R.z) };
    shader.uniforms.uClubPlank = { value: new THREE.Vector3(C.plankWidth, C.plankLength, C.plankSeam) };
    shader.uniforms.uClubSurface = { value: new THREE.Vector3(C.grainScale, C.weaveScale, C.textureStrength) };
    shader.uniforms.uClubLight = { value: new THREE.Color(C.lampColor).multiplyScalar(C.lampStrength) };
    shader.uniforms.uClubLayout = { value: new THREE.Vector4(R.clubhouse.side, R.clubhouse.front, R.d / 2, R.ceiling - C.lampDrop) };
    shader.uniforms.uClubFalloff = { value: C.lampFalloff };
    shader.uniforms.uClubZoneLamp = { value: CLUB_ZONES.lamp };
    shader.uniforms.uClubZoneAmbient = { value: CLUB_ZONES.ambient };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float aClubFinish;
      varying float vClubFinish;
      varying vec3 vClubPosition;
      uniform vec3 uClubOrigin;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      vClubFinish = aClubFinish;
      vClubPosition = (modelMatrix * vec4(position, 1.0)).xyz - uClubOrigin;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying float vClubFinish;
      varying vec3 vClubPosition;
      uniform vec3 uClubPlank, uClubSurface, uClubLight;
      uniform vec4 uClubLayout;
      uniform float uClubFalloff;
      uniform vec4 uClubZoneLamp, uClubZoneAmbient;
      float clubZone(vec4 z, vec3 p) { // BIO / BILJARD / SPEL (x), the hall south of the partition (w)
        return p.z > uClubLayout.y ? z.w : (p.x < -uClubLayout.x ? z.x : (p.x > uClubLayout.x ? z.z : z.y));
      }
      float clubHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      vec2 clubUV(vec3 p, vec3 n) {
        vec3 a = abs(n);
        return a.y > max(a.x,a.z) ? p.xz : (a.x > a.z ? p.zy : p.xy);
      }
      float clubGrain(vec2 uv) {
        return sin(uv.y*uClubSurface.x + 1.8*sin(uv.x*2.7) + .7*sin(uv.x*7.1));
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 clubN = normalize(transpose(mat3(viewMatrix)) * normalize(vNormal));
      vec2 clubP = clubUV(vClubPosition,clubN);
      float clubType = vClubFinish;
      float clubVariation = 1.0;
      if (clubType > 3.5) {
        vec2 plank = vec2(vClubPosition.x/uClubPlank.y, vClubPosition.z/uClubPlank.x);
        float row = floor(plank.y);
        plank.x += clubHash(vec2(row,0.0));
        vec2 cell = fract(plank);
        vec2 dist = min(cell,1.0-cell)*uClubPlank.yx;
        vec2 aa = max(fwidth(dist),vec2(.0001));
        float seam = min(smoothstep(vec2(0.0),vec2(uClubPlank.z)+aa,dist).x,
                         smoothstep(vec2(0.0),vec2(uClubPlank.z)+aa,dist).y);
        clubVariation = mix(.64,1.0,seam) * (.94+.12*clubHash(floor(plank)));
        clubVariation *= 1.0 + uClubSurface.z*clubGrain(vClubPosition.xz);
      } else if (clubType > .5 && clubType < 1.5) {
        clubVariation += uClubSurface.z*clubGrain(clubP);
      } else if (clubType > 1.5 && clubType < 2.5) {
        vec2 thread = clubP*uClubSurface.y;
        float fade = 1.0-smoothstep(.5,2.0,max(fwidth(thread.x),fwidth(thread.y)));
        clubVariation += fade*uClubSurface.z*sin(thread.x)*sin(thread.y);
      }
      diffuseColor.rgb *= clubVariation;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      if(vClubFinish>3.5) roughnessFactor=${C.floorRoughness};
      else if(vClubFinish>2.5) roughnessFactor=${C.metalRoughness};
      else if(vClubFinish>1.5) roughnessFactor=${C.fabricRoughness};
      else if(vClubFinish>.5) roughnessFactor=${C.woodRoughness};`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      if(vClubFinish>2.5 && vClubFinish<3.5) metalnessFactor=${C.metalness};`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      vec3 clubWorldNormal = normalize(transpose(mat3(viewMatrix))*normal);
      float clubRoomX = vClubPosition.x < -uClubLayout.x ? -2.0*uClubLayout.x :
        (vClubPosition.x > uClubLayout.x ? 2.0*uClubLayout.x : 0.0);
      float clubLampZ = vClubPosition.z > uClubLayout.y ?
        (uClubLayout.z+uClubLayout.y)*.5 : (-uClubLayout.z+uClubLayout.y)*.5;
      vec3 clubDelta = vec3(clubRoomX,uClubLayout.w,clubLampZ)-vClubPosition;
      float clubLambert = max(dot(clubWorldNormal,normalize(clubDelta)),0.0);
      reflectedLight.indirectDiffuse *= clubZone(uClubZoneAmbient,vClubPosition);
      reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor)*uClubLight*clubZone(uClubZoneLamp,vClubPosition)*
        clubLambert/(1.0+uClubFalloff*dot(clubDelta,clubDelta));
      if(vClubFinish>1.5 && vClubFinish<2.5) {
        float clubGrazing = pow(1.0-max(dot(normal,normalize(vViewPosition)),0.0),3.0);
        reflectedLight.indirectDiffuse += material.diffuseColor*uClubLight*clubGrazing*${C.clothSheen};
      }`);
  };
  // This exact callback adds varyings and fragment shading, never vertex deformation.
  rememberFragmentCompile(material.onBeforeCompile, before);
  material.customProgramCacheKey = () => 'clubhouse-surfaces-v1';
  return material;
}
