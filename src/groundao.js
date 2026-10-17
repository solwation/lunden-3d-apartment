import * as THREE from 'three';
import { GROUND_AO, SEASON, SHADOW_BOX } from './config.js';
import { registerSeasonal } from './seasons.js';

// Distant ground shadows (#1079). The sun's shadow map only covers ±14 m round its target (main.js), so trees, houses and
// walls further out cast nothing and stand pasted on the lawn. Here every tree gets a soft baked disc of darkening under
// its crown and every façade a thin band along its foot — all of it ONE indexed mesh with one multiply-blended shader
// (the technique of ao.js / contactshadow.js), draped over the terrain. Each vertex carries the point whose real shadow
// it stands in for (`aRef`: a crown's centre, a point up the wall); the vertex shader projects it with the sun's shadow
// matrix and fades the baked darkening out where the shadow map already covers it, so nothing is darkened twice. The
// shadow box follows a visited flat (main.js) and turns with the sun: `sun.shadow.matrix` is updated with each shadow
// render, so the fade always matches what the shadow map holds. Bare trees in winter keep `bare` of their share.

// #1144: the real sun shadows fade out towards the shadow map's rim (SHADOW_BOX.rim, in the same texture-space edge
// measure as `fade` below), so where the box's edge is in view the baked shadows take over softly instead of along a
// ruled line. Patched into three's getShadow() (the directional light's; point shadows keep theirs) before any shader
// compiles: this module is imported by main.js before the first render.
{
  const RET = 'return mix( 1.0, shadow, shadowIntensity );';
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment, at = chunk.indexOf(RET), [r0, r1] = SHADOW_BOX.rim;
  if (at >= 0) THREE.ShaderChunk.shadowmap_pars_fragment = chunk.slice(0, at) +
    `vec2 rimD = abs( shadowCoord.xy - 0.5 ) * 2.0;\n\t\tshadow = mix( shadow, 1.0, smoothstep( ${r0.toFixed(3)}, ${r1.toFixed(3)}, max( rimD.x, rimD.y ) ) );\n\t\t` +
    chunk.slice(at);
}

// until bound (or without a shadow map) a zero matrix puts every point on the map's rim: full baked shade everywhere
const shadowMatrix = { value: new THREE.Matrix4().makeScale(0, 0, 0) };
/** main.js: the sun's `shadow.matrix` (shared by reference, so it stays current). */
export function bindGroundAOShadow(matrix) { shadowMatrix.value = matrix; }

const VERT = /* glsl */`
attribute float aR;
attribute float aS;
attribute float aTree;
attribute vec3 aRef;
uniform mat4 uShadow;
uniform vec2 uFade;
uniform float uLeaves;
varying float vR;
varying float vS;
#include <fog_pars_vertex>
void main() {
  vR = aR;
  vec4 sc = uShadow * vec4(aRef, 1.0);
  vec2 d = abs(sc.xy - 0.5) * 2.0;
  float edge = (sc.z < 0.0 || sc.z > 1.0) ? 2.0 : max(d.x, d.y);
  vS = aS * smoothstep(uFade.x, uFade.y, edge) * mix(1.0, uLeaves, aTree);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
varying float vR;
varying float vS;
#include <fog_pars_fragment>
void main() {
  float r = clamp(vR, 0.0, 1.0);
  float a = vS * (1.0 - smoothstep(0.0, 1.0, r)); // soft from the centre / the wall foot to nothing at the rim
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    a *= 1.0 - fogFactor; // in the fog the darkening goes with the ground
  #endif
  gl_FragColor = vec4(vec3(1.0 - a), 1.0);
}`;

/** Signed area of a ring [[x, z] …] (positive: counter-clockwise seen with x right, z down). */
const area = (p) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;

/**
 * trees: [{ x, z, r (crown radius, m), y (crown centre height) }]; walls: [{ ring: [[x, z] …] (open, no repeated first
 * point), outside: (x, z) => bool — true off the building }]; ground(x, z): the surface to drape on.
 */
export function buildGroundAO({ trees = [], walls = [], ground, C = GROUND_AO }) {
  const pos = [], R = [], S = [], T = [], ref = [], idx = [];
  const vert = (x, z, r, s, tree, rx, ry, rz) => {
    pos.push(x, ground(x, z) + C.lift, z); R.push(r); S.push(s); T.push(tree); ref.push(rx, ry, rz);
    return R.length - 1;
  };
  const tri = (a, b, c) => { // counter-clockwise from above; none across a height jump
    const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1], yc = pos[c * 3 + 1];
    if (Math.max(ya, yb, yc) - Math.min(ya, yb, yc) <= C.maxStep) idx.push(a, b, c);
  };
  for (const t of trees) {
    const rad = t.r * C.spread, c0 = vert(t.x, t.z, 0, C.tree, 1, t.x, t.y, t.z), rows = [];
    for (let i = 1; i <= C.rings; i++) {
      const row = [];
      for (let j = 0; j < C.segs; j++) {
        const a = (j / C.segs) * Math.PI * 2, rr = rad * i / C.rings;
        row.push(vert(t.x + Math.cos(a) * rr, t.z + Math.sin(a) * rr, i / C.rings, C.tree, 1, t.x, t.y, t.z));
      }
      rows.push(row);
    }
    for (let j = 0; j < C.segs; j++) {
      const k = (j + 1) % C.segs;
      tri(c0, rows[0][k], rows[0][j]);
      for (let i = 1; i < C.rings; i++) { tri(rows[i - 1][j], rows[i - 1][k], rows[i][k]); tri(rows[i - 1][j], rows[i][k], rows[i][j]); }
    }
  }
  for (const { ring, outside, height = 1.5 } of walls) {
    const n = ring.length;
    if (n < 3) continue;
    // outward normal of each edge: the side `outside` says is off the building (tested on the longest edge)
    let li = 0, ll = 0;
    for (let i = 0; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > ll) { ll = l; li = i; } }
    const nrm = (i, sg) => { const p = ring[i], q = ring[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [sg * (q[1] - p[1]) / l, -sg * (q[0] - p[0]) / l]; };
    const p = ring[li], q = ring[(li + 1) % n], [tx, tz] = nrm(li, 1);
    const sg = outside((p[0] + q[0]) / 2 + tx * 0.1, (p[1] + q[1]) / 2 + tz * 0.1) ? 1 : -1;
    // the band's outer line: each corner pushed out along the mitre of its two edges (capped at 2 × width)
    const outer = ring.map((v, i) => {
      const a = nrm((i + n - 1) % n, sg), b = nrm(i, sg);
      let mx = a[0] + b[0], mz = a[1] + b[1];
      const ml = Math.hypot(mx, mz);
      if (ml < 1e-6) { mx = b[0]; mz = b[1]; } else { mx /= ml; mz /= ml; }
      const k = Math.min(2, 1 / Math.max(0.5, mx * b[0] + mz * b[1])) * C.width;
      return [v[0] + mx * k, v[1] + mz * k];
    });
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n], oa = outer[i], ob = outer[(i + 1) % n], [nx, nz] = nrm(i, sg);
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / C.step));
      let prev = null;
      for (let s = 0; s <= steps; s++) {
        const f = s / steps, ix = a[0] + (b[0] - a[0]) * f, iz = a[1] + (b[1] - a[1]) * f;
        const ox = oa[0] + (ob[0] - oa[0]) * f, oz = oa[1] + (ob[1] - oa[1]) * f;
        const ry = ground(ix + nx * 0.1, iz + nz * 0.1) + height;
        // the inner vertex sits on the wall line but takes the ground just outside it (not the roof / plinth top)
        const inner = R.length;
        pos.push(ix, ground(ix + nx * 0.05, iz + nz * 0.05) + C.lift, iz); R.push(0); S.push(C.wall); T.push(0); ref.push(ix, ry, iz);
        const out = vert(ox, oz, 1, C.wall, 0, ix, ry, iz);
        if (prev) { // winding: seen from above, counter-clockwise either way round the ring
          if (sg > 0) { tri(prev[0], inner, out); tri(prev[0], out, prev[1]); } else { tri(prev[0], out, inner); tri(prev[0], prev[1], out); }
        }
        prev = [inner, out];
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aR', new THREE.Float32BufferAttribute(R, 1));
  geo.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1));
  geo.setAttribute('aTree', new THREE.Float32BufferAttribute(T, 1));
  geo.setAttribute('aRef', new THREE.Float32BufferAttribute(ref, 3));
  geo.setIndex(R.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const leaves = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFade: { value: new THREE.Vector2(...C.fade) } }]),
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4,
  });
  mat.uniforms.uShadow = shadowMatrix; // shared objects (UniformsUtils.merge would clone them)
  mat.uniforms.uLeaves = leaves;
  mat.name = 'ground-ao';
  registerSeasonal((month) => { leaves.value = C.bare + (1 - C.bare) * (SEASON.trees[month]?.[3] ?? 1); });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ground-ao';
  mesh.renderOrder = -1; // after the opaque ground, before glass / water / the additive light pools
  mesh.raycast = () => {}; // never an E / measuring target
  mesh.matrixAutoUpdate = false;
  mesh.userData.groundAO = { trees: trees.length, walls: walls.length, triangles: idx.length / 3 };
  return mesh;
}
