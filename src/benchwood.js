// #2098: weathered outdoor bench slats. Each slat geometry carries its own frame as two vertex attributes, written in the
// slat's local frame before it is turned and placed: `benchSlat` = (along + a per-slat offset, across, thick, 1) and
// `benchHalf` = (half width, half thickness), packed as 16-bit integers (along in ALONG m, the rest in CROSS m units: 12 bytes a
// vertex, also for the padded rest of a batch). A fragment patch of the existing MeshStandardMaterial then draws fine
// grain lines that run along the slat (a function of across/thick, wobbling slowly along), a slight cool-grey weathering
// and lighter worn long edges; geometry without the attributes (mask 0: the courtyard's other timber, the bus stop's steel)
// is unchanged. No texture, uniform, draw, light or per-frame work; vertex positions are unchanged (rememberFragmentCompile).
// It chains an existing onBeforeCompile (the bus stop's railMetal, #2089) and runs after its colour step, so railMetal's
// saturation mask still sees the original wood colour. tools/benchwoodtest.mjs checks it against three's own sources.
import * as THREE from 'three';
import { BENCH_WOOD as W } from './config.js';
import { rememberFragmentCompile } from './vertexcompile.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x)); // GLSL float literal
const ALONG = 0.002, CROSS = 0.00025; // m per integer step: ±65 m along (seeds × seedSpan + half a slat), ±8 m across
const SEEDS = 8; // per-slat offsets cycle through this many (consecutive slats always differ)

/** Decode a packed tag (the vertex shader's step, for tests): [along + offset, across, thick, mask, half width, half thickness] in m. */
export function benchTag(g, i) {
  const s = g.attributes.benchSlat, h = g.attributes.benchHalf;
  return [s.getX(i) * ALONG, s.getY(i) * CROSS, s.getZ(i) * CROSS, s.getW(i), h.getX(i) * CROSS, h.getY(i) * CROSS];
}
/** Tag a slat in its own frame (before any rotate/translate): `along`, `across`, `thick` = axis indices (0 x, 1 y, 2 z),
 * `seed` = a small integer giving the slat its own grain. Returns the geometry. Custom attributes survive applyMatrix4. */
export function benchSlat(g, along, across, thick, seed = 0) {
  g.computeBoundingBox();
  const bb = g.boundingBox, mid = bb.getCenter(new THREE.Vector3()).toArray(), lo = bb.min.toArray(), hi = bb.max.toArray();
  const p = g.attributes.position, n = p.count, slat = new Int16Array(n * 4), half = new Uint16Array(n * 2), off = (seed % SEEDS) * W.seedSpan;
  if ((hi[along] - lo[along]) / 2 >= W.seedSpan / 2) throw new Error('benchwood: a slat longer than seedSpan');
  for (let i = 0; i < n; i++) {
    const a = [p.getX(i), p.getY(i), p.getZ(i)];
    slat.set([Math.round((a[along] - mid[along] + off) / ALONG), Math.round((a[across] - mid[across]) / CROSS), Math.round((a[thick] - mid[thick]) / CROSS), 1], i * 4);
    half.set([Math.round((hi[across] - lo[across]) / 2 / CROSS), Math.round((hi[thick] - lo[thick]) / 2 / CROSS)], i * 2);
  }
  g.setAttribute('benchSlat', new THREE.BufferAttribute(slat, 4));
  g.setAttribute('benchHalf', new THREE.BufferAttribute(half, 2));
  return g;
}

/** Give every untagged geometry of a batch zero bench attributes (mask 0), so mergeGeometries sees one attribute set. */
export function padBenchSlats(list) {
  if (!list.some((g) => g.attributes.benchSlat)) return list;
  for (const g of list) if (!g.attributes.benchSlat) {
    const n = g.attributes.position.count;
    g.setAttribute('benchSlat', new THREE.BufferAttribute(new Int16Array(n * 4), 4));
    g.setAttribute('benchHalf', new THREE.BufferAttribute(new Uint16Array(n * 2), 2));
  }
  return list;
}

const VERTEX_HEAD = `attribute vec4 benchSlat;
attribute vec2 benchHalf;
varying vec4 vBenchSlat;
varying vec2 vBenchHalf;`;
const VERTEX_BODY = `vBenchSlat = vec4( benchSlat.x * ${f(ALONG)}, benchSlat.yz * ${f(CROSS)}, benchSlat.w ); vBenchHalf = benchHalf * ${f(CROSS)};`;

const FRAGMENT_HEAD = `varying vec4 vBenchSlat;
varying vec2 vBenchHalf;
float benchHash( float n ) { n = fract( n * 0.1031 ); n *= n + 33.33; n *= n + n; return fract( n ); }
float benchLine( float x ) { float i = floor( x ), t = fract( x ); t = t * t * ( 3.0 - 2.0 * t ); return mix( benchHash( i ), benchHash( i + 1.0 ), t ); }`;

// Before alphamap_fragment, i.e. after color_fragment and any colour step chained there (railMetal). The grain coordinate
// changes only slowly along a slat (wobbleFreq << grainFreq), so its lines run along the slat's length.
const FRAGMENT_COLOR = `float benchMask = vBenchSlat.w;
float benchId = floor( vBenchSlat.x / ${f(W.seedSpan)} + 0.5 );
float benchS = ( vBenchSlat.y + 0.6 * vBenchSlat.z ) * ${f(W.grainFreq)} + ${f(W.wobble)} * benchLine( vBenchSlat.x * ${f(W.wobbleFreq)} ) + 37.0 * benchHash( benchId + 0.5 );
float benchFine = 1.0 - smoothstep( 0.3, 0.9, fwidth( benchS ) );
float benchGrain = smoothstep( 0.6, 0.85, benchLine( benchS ) ) * benchFine;
float benchStreak = ( benchLine( benchS * 0.07 + 5.0 ) * 2.0 - 1.0 ) * ( 1.0 - smoothstep( 0.3, 0.9, fwidth( benchS * 0.07 ) ) );
vec3 benchRgb = diffuseColor.rgb * ( 1.0 - ${f(W.grain)} * benchGrain + ${f(W.streak)} * benchStreak );
float benchWeather = ${f(W.weather)} + ${f(W.weatherVary)} * ( benchLine( vBenchSlat.x * 1.7 + 11.0 ) * 2.0 - 1.0 );
benchRgb = mix( benchRgb, dot( benchRgb, vec3( 0.299, 0.587, 0.114 ) ) * vec3( ${W.grey.map(f).join(', ')} ), benchWeather );
float benchEdge = max( vBenchHalf.x - abs( vBenchSlat.y ), vBenchHalf.y - abs( vBenchSlat.z ) );
float benchWear = ( 1.0 - smoothstep( 0.2 * ${f(W.edge)}, ${f(W.edge)}, benchEdge ) ) * ( 0.6 + 0.4 * benchLine( vBenchSlat.x * ${f(W.wearFreq)} ) );
benchRgb = mix( benchRgb, benchRgb * ${f(W.wearLift)} + ${f(W.wearAdd)}, ${f(W.wear)} * benchWear );
diffuseColor.rgb = mix( diffuseColor.rgb, benchRgb, benchMask );`;

// After metalnessmap_fragment: dry, matt, non-metallic timber (the bus stop's batch has metalness 0.2 for its steel).
const FRAGMENT_SURFACE = `roughnessFactor = mix( roughnessFactor, max( roughnessFactor, ${f(W.roughness)} ), benchMask );
metalnessFactor = mix( metalnessFactor, 0.0, benchMask );`;

/** The source-string patch (exported for the Node test). Throws if three's chunks are missing, so a three upgrade fails loudly. */
export function benchWoodShader(shader) {
  const put = (src, anchor, text, after = true) => {
    if (!src.includes(anchor)) throw new Error(`benchwood: missing ${anchor}`);
    return src.replace(anchor, after ? `${anchor}\n${text}` : `${text}\n${anchor}`);
  };
  shader.vertexShader = put(put(shader.vertexShader, '#include <common>', VERTEX_HEAD), '#include <begin_vertex>', VERTEX_BODY);
  let s = put(shader.fragmentShader, '#include <common>', FRAGMENT_HEAD);
  s = put(s, '#include <alphamap_fragment>', FRAGMENT_COLOR, false);
  shader.fragmentShader = put(s, '#include <metalnessmap_fragment>', FRAGMENT_SURFACE);
  return shader;
}

const KEY = 'bench-wood-2098';
/** Patch a MeshStandardMaterial in place, after its existing onBeforeCompile (if any), and return it. */
export function benchWood(material) {
  const before = material.onBeforeCompile, beforeKey = material.customProgramCacheKey;
  const own = before === THREE.Material.prototype.onBeforeCompile;
  const compile = own ? benchWoodShader : (shader, renderer) => { before.call(material, shader, renderer); benchWoodShader(shader); };
  if (!own) rememberFragmentCompile(compile, before);
  const base = beforeKey === THREE.Material.prototype.customProgramCacheKey ? '' : beforeKey.call(material) + '|';
  material.onBeforeCompile = compile;
  material.customProgramCacheKey = () => base + KEY;
  material.userData.benchWood = true;
  return material;
}
rememberFragmentCompile(benchWoodShader); // fragment-only: vertex positions stay native (detail.js phone culling)
