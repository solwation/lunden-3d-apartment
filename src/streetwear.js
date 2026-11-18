// #2103: street wear on the local roads: slightly darker, polished wheel tracks, a few thin wavy cracks (some sealed with
// glossy black bitumen), an intermittent crack along the road edges, and zebra bars flaking where the wheels run. Fragment
// work only, chained onto the asphalt / paint materials' existing callbacks (#2072 aggregate, #2099 wet ground keeps working
// on top: wet asphalt darkens the cracks and tracks with the rest). The lane layout comes from one extra per-vertex attribute
// `roadFrame` = (signed metres across the nearest local road's centre line, its half width), computed once at build from
// SITE.roads; positions, indices, draws, textures and lights are unchanged. Placement is deterministic (world-metre hashes).
import * as THREE from 'three';
import { SITE, STREET_WEAR as SW, COLORS } from './config.js';
import { samples } from './roads.js';
import { rememberFragmentCompile } from './vertexcompile.js';

const CELL = 6; // m: the sample grid's bucket for the nearest-centre-line search

const indices = new Map(); // road (or 'all') → its centre-line samples in CELL m buckets (built once)
function roadIndex(road) {
  const key = road ?? 'all';
  if (indices.has(key)) return indices.get(key);
  const index = new Map();
  for (const r of road ? [road] : SITE.roads) if (r.path) for (const p of samples(r)) {
    const k = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
    if (!index.has(k)) index.set(k, []);
    index.get(k).push(p);
  }
  indices.set(key, index);
  return index;
}

/** The road frame at (x, z): { across (signed m from the centre line), half (its half width) } of `road` (default: the nearest
 * local path road), or null far from it. */
export function roadFrameAt(x, z, road = undefined, reach = 2) {
  const I = roadIndex(road), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best = null, bd = Infinity;
  for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) for (const p of I.get((cx + dx) + ',' + (cz + dz)) ?? []) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best && { across: (x - best.x) * best.nx + (z - best.z) * best.nz, half: best.w / 2 };
}

/** Add the `roadFrame` attribute (vec2) to a geometry in world coordinates: the frame of `road` (a SITE.roads path road: its own
 * strip, so a junction's neighbour never bends its lanes), of the nearest local road when undefined, or (0, 0) = no lanes
 * (no tracks) for null (car park, fillets). Positions untouched. */
export function addRoadFrame(geometry, road = undefined) {
  const p = geometry.attributes.position, a = new Float32Array(p.count * 2);
  if (road !== null) for (let i = 0; i < p.count; i++) {
    const f = roadFrameAt(p.getX(i), p.getZ(i), road);
    if (f) { a[i * 2] = f.across; a[i * 2 + 1] = f.half; }
  }
  geometry.setAttribute('roadFrame', new THREE.BufferAttribute(a, 2));
  return geometry;
}

const g = (x) => Number(x).toFixed(4);

/** The wheel-track weight 0…1 at `across` m on a road `half` m wide (JS twin of the shader's wearTrack, for tests). */
export function trackWeight(across, half, sigma = SW.tracks.sigma, T = SW.tracks) {
  if (!(half > 0.5) || Math.abs(across) >= half) return 0;
  const lane = half * 2 >= T.twoLanes ? half / 2 : 0, u = lane ? Math.abs(Math.abs(across) - lane) : Math.abs(across);
  return Math.exp(-(((u - T.gauge) / sigma) ** 2));
}

const VERTEX_HEAD = /* glsl */`
attribute vec2 roadFrame;
varying vec2 vRoadFrame;
varying vec2 vWearXZ;`;
const VERTEX_BODY = /* glsl */`
vRoadFrame = roadFrame;
vWearXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;`;

/** Shared GLSL: hashes, value noise and the track profile. */
function commonGLSL() {
  const T = SW.tracks;
  return /* glsl */`
varying vec2 vRoadFrame;
varying vec2 vWearXZ;
float wearHash(vec2 p) { return fract(sin(dot(p, vec2(41.37, 289.13))) * 43758.5453); }
float wearNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(wearHash(i), wearHash(i + vec2(1.0, 0.0)), u.x), mix(wearHash(i + vec2(0.0, 1.0)), wearHash(i + vec2(1.0, 1.0)), u.x), u.y); }
// x: wheel tracks, y: lane-centre strip (0 off the lanes)
vec2 wearTrack(vec2 frame, float sigma) {
  float hw = frame.y, a = abs(frame.x);
  if (hw < 0.5 || a >= hw) return vec2(0.0);
  float lane = hw * 2.0 >= ${g(T.twoLanes)} ? hw * 0.5 : 0.0;
  float u = lane > 0.0 ? abs(a - lane) : a;
  float d = (u - ${g(T.gauge)}) / sigma, c = u / ${g(T.oilSigma)};
  return vec2(exp(-d * d), exp(-c * c));
}
// anti-aliased line coverage for distance d, full width w: thinner than a pixel fades instead of shimmering
float wearLine(float d, float w) { float px = max(fwidth(d), 1e-5); return clamp(0.5 + (0.5 * w - abs(d)) / px, 0.0, 1.0) * clamp(w / px, 0.0, 1.0); }`;
}

/** The asphalt's wear: after map_fragment (inside USE_MAP: the snow look, which drops the map, skips it all). Sets wearRough. */
function asphaltGLSL() {
  const T = SW.tracks, C = SW.cracks, E = SW.edge;
  return /* glsl */`
float wearRough = 1.0;
#ifdef USE_MAP
{
  vec2 P = vWearXZ;
  vec2 tr = wearTrack(vRoadFrame, ${g(T.sigma)});
  float vary = 1.0 - ${g(T.vary)} + ${g(2 * T.vary)} * wearNoise(P / ${g(T.scale)} + 3.1);
  diffuseColor.rgb *= 1.0 - (${g(T.dark)} * tr.x + ${g(T.oil)} * tr.y) * vary;
  wearRough *= 1.0 - ${g(T.polish)} * tr.x * vary;
  // a crack in some ${g(C.cell)} m cells: a wavy segment through a point in the cell's middle half, at a random angle
  vec2 cell = floor(P / ${g(C.cell)}) + ${g(C.seed % 97)};
  if (wearHash(cell) < ${g(C.share)}) {
    vec2 c = (floor(P / ${g(C.cell)}) + 0.25 + 0.5 * vec2(wearHash(cell + 3.3), wearHash(cell + 5.7))) * ${g(C.cell)};
    float ang = wearHash(cell + 1.9) * 6.2832; vec2 d = vec2(cos(ang), sin(ang));
    vec2 q = P - c; float s = dot(q, d), t = dot(q, vec2(-d.y, d.x));
    float len = 0.5 * mix(${g(C.length[0])}, ${g(C.length[1])}, wearHash(cell + 9.1));
    t += 0.07 * sin(s * 2.3 + ang * 7.0) + 0.03 * sin(s * 7.9 + ang * 13.0) + 0.012 * sin(s * 23.0);
    float body = 1.0 - smoothstep(len * 0.6, len, abs(s));
    if (body > 0.0) {
      if (wearHash(cell + 7.7) < ${g(C.sealed)}) {
        float seal = wearLine(t, ${g(C.sealWidth)}) * (1.0 - smoothstep(len, len + 0.25, abs(s)));
        diffuseColor.rgb *= 1.0 - ${g(1 - C.sealDark)} * seal; wearRough = mix(wearRough, ${g(C.sealRough)}, seal);
      } else diffuseColor.rgb *= 1.0 - ${g(C.dark)} * wearLine(t, ${g(C.width)} * (0.35 + 0.65 * body)) * body;
    }
  }
  // the edge crack: wavy, ${g(E.inset)} m inside the asphalt's edge, on part of the length
  float hw = vRoadFrame.y;
  if (hw > 0.5) {
    float e = abs(vRoadFrame.x) - (hw - ${g(E.inset)}) + ${g(E.wave)} * (wearNoise(P * 0.45) - 0.5) + 0.02 * sin(dot(P, vec2(3.1, 2.3)));
    float on = smoothstep(${g(1 - E.share)}, ${g(1 - E.share + 0.06)}, wearNoise(P * 0.09 + 11.0));
    diffuseColor.rgb *= 1.0 - ${g(E.dark)} * on * wearLine(e, ${g(E.width)});
  }
}
#endif`;
}

/** The zebra paint's wear: flaking to the asphalt colour, most where a wheel track runs. */
function paintGLSL() {
  const P = SW.paint, c = new THREE.Color(COLORS.asphalt); // linear (three's ColorManagement) like diffuseColor
  return /* glsl */`
float wearRough = 1.0;
{
  vec2 P = vWearXZ;
  float tr = wearTrack(vRoadFrame, ${g(P.sigma)}).x;
  float n = wearNoise(P * 7.0) * 0.55 + wearNoise(P * 23.0 + 5.0) * 0.3 + wearNoise(P * 61.0 + 9.0) * 0.15;
  float t = ${g(P.base)} + ${g(P.track)} * tr;
  float worn = 1.0 - smoothstep(t - ${g(P.edge)}, t + ${g(P.edge)}, n);
  diffuseColor.rgb = mix(diffuseColor.rgb * (0.94 + 0.06 * n), vec3(${g(c.r)}, ${g(c.g)}, ${g(c.b)}), worn);
  wearRough = mix(1.0, ${g(P.rough)} / max(roughness, 0.05), worn);
}`;
}

/** Chain the wear onto a MeshStandardMaterial ('asphalt' | 'paint') before its wetGround patch; its geometry needs `roadFrame`. */
export function streetWear(material, kind) {
  const m = material;
  if (!m?.isMeshStandardMaterial || m.userData.streetWear) return m;
  if (kind !== 'asphalt' && kind !== 'paint') throw new Error(`streetWear: unknown kind ${kind}`);
  m.userData.streetWear = kind;
  const body = kind === 'asphalt' ? asphaltGLSL() : paintGLSL(), head = commonGLSL(), before = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    if (shader.fragmentShader.includes('wearTrack')) return; // (an inherited, already worn callback)
    if (shader.vertexShader) shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${body}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= wearRough;');
  };
  rememberFragmentCompile(m.onBeforeCompile, before); // varyings only: vertex positions unchanged
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  m.customProgramCacheKey = function () { return `${base.call(this)}|wear2103-${kind}`; };
  m.needsUpdate = true;
  return m;
}
