import * as THREE from 'three';
import { rememberFragmentCompile } from './vertexcompile.js';

// Distance LOD with a dithered "pixel fade" crossfade (#1958). Shared by every module that wants two levels of detail of an
// instanced thing; the trees (src/surroundings.js trees()) are the first user.
//
// How it works, with no transparent pass and no extra program per level:
//  * Two InstancedMeshes carry the same things: `near` (full detail) and `far` (a cheaper geometry). Per instance, the
//    distance d from the camera to the instance centre gives a fade f = lodFade(d, start, end): 0 up to `start`, 1 from `end`,
//    linear in between (the zone, a few metres wide).
//  * The materials are patched (`patchDitherLod`, `lodDepthMaterial`): the vertex shader computes f per instance from the
//    camera position (`lodCamera`, the MAIN camera also in the shadow pass) and the fragment shader discards by a 4x4 Bayer
//    pattern in screen space: the near level keeps a pixel where its threshold t >= f, the far level where t < f. The two
//    are complementary, so every pixel is drawn once, and a pixel fades from one level to the other as the camera moves.
//  * `InstanceLod` keeps the buffers short: it packs the instances the near level can still need (d < end + margin) to the
//    front of the near mesh (`count`) and copies those the far level needs (d > start - margin) into the far mesh. Triangles
//    and draw calls outside the zone are those of ONE level only; inside it both levels draw for that instance.
//  * Shadows: both meshes get a `customDepthMaterial` with the same patch, so the shadow follows the same fade (no pop).
//
// API:
//   const range = lodRange(start, end);                               // shared {value: Vector2}
//   patchDitherLod(material, { far, range });                         // before the first compile
//   mesh.customDepthMaterial = lodDepthMaterial({ far, range, map, alphaTest, side });
//   const lod = new InstanceLod([{ mesh, seeds?, tint? }], farMesh, { start, end, margin, step });
//   per frame: updateInstanceLods(camera);
// `seeds` (optional) is a parallel array that is reordered together with the instances (seasons.js indexes its seeds by
// instance index); `tint` (THREE.Color) makes the far copy's instance colour a constant instead of the source's colour.
// After anything rewrites the near buffers (seasons.js does), call `lod.sync()`.
// Things that are not two instanced meshes pass `centre` to say where a level measures its distance from: a uniform
// `{ value: Vector3 }` (one mesh, #1966 far players), 'origin' (each plain mesh from its own world origin; the same material
// drawn instanced still fades per instance) or 'attribute' (a merged mesh of many things, per vertex the local `lodCentre` of
// its thing). The entrance plants use the last two (#1967, src/entranceplants.js) and switch their meshes from
// `onLodUpdate(fn)`, which runs with the camera position and view frustum every `updateInstanceLods`.

/** Fade 0..1 for a distance: 0 up to `start`, 1 from `end`, linear between. */
export function lodFade(d, start, end) { return d <= start ? 0 : d >= end ? 1 : (d - start) / (end - start); }

/** Which buffers an instance at distance d must be in: near while d < end + margin, far while d > start - margin. */
export function lodMembership(d, start, end, margin) { return { near: d < end + margin, far: d > start - margin }; }

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** The 4x4 Bayer threshold in (0, 1) of a pixel (the same table as the shader's). */
export function ditherThreshold(x, y) { return (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16; }
/** Does a level draw the pixel? Near keeps t >= f, far keeps t < f (exactly one of the two for every pixel). */
export function ditherKeeps(far, f, t) { return far ? t < f : t >= f; }

/**
 * New order of one buffer: the ids that must stay in the near buffer first (their previous relative order kept), the others
 * after them. `order[pos]` is the id at buffer position `pos`; `wantNear[id]` is 0/1. Returns { order, count, changed }.
 */
export function packOrder(order, wantNear) {
  const next = new Int32Array(order.length);
  let k = 0, changed = false;
  for (let p = 0; p < order.length; p++) if (wantNear[order[p]]) next[k++] = order[p];
  const count = k;
  for (let p = 0; p < order.length; p++) if (!wantNear[order[p]]) next[k++] = order[p];
  for (let p = 0; p < order.length; p++) if (next[p] !== order[p]) { changed = true; break; }
  return { order: next, count, changed };
}

/** The shared camera position uniform (world space) the shaders measure the distance from. Set by updateInstanceLods. */
export const lodCamera = { value: new THREE.Vector3() };
/** A shared fade range uniform for the materials of one kind of thing. */
export const lodRange = (start, end) => ({ value: new THREE.Vector2(start, end) });

const VERT_DECL = 'uniform vec3 uLodCam;\nuniform vec3 uLodCentre;\nuniform vec2 uLodRange;\nvarying float vLodFade;\n#ifdef LOD_CENTRE_ATTRIBUTE\nattribute vec3 lodCentre;\n#endif\n';
const VERT_BODY = `
#ifdef USE_INSTANCING
  vec3 lodCentre = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
  vLodFade = clamp((distance(lodCentre, uLodCam) - uLodRange.x) / max(uLodRange.y - uLodRange.x, 0.001), 0.0, 1.0);
#elif defined(LOD_CENTRE)
  vLodFade = clamp((distance(uLodCentre, uLodCam) - uLodRange.x) / max(uLodRange.y - uLodRange.x, 0.001), 0.0, 1.0);
#elif defined(LOD_CENTRE_ATTRIBUTE)
  vLodFade = clamp((distance((modelMatrix * vec4(lodCentre, 1.0)).xyz, uLodCam) - uLodRange.x) / max(uLodRange.y - uLodRange.x, 0.001), 0.0, 1.0);
#elif defined(LOD_ORIGIN)
  vLodFade = clamp((distance(modelMatrix[3].xyz, uLodCam) - uLodRange.x) / max(uLodRange.y - uLodRange.x, 0.001), 0.0, 1.0);
#else
  vLodFade = 0.0;
#endif
`;
const FRAG_DECL = `uniform float uLodFar;
varying float vLodFade;
float lodBayer(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 4.0));
  int i = q.y * 4 + q.x;
  // the 4x4 Bayer matrix (0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5), thresholds (v + 0.5) / 16
  float v = 0.0;
  if (i == 0) v = 0.0; else if (i == 1) v = 8.0; else if (i == 2) v = 2.0; else if (i == 3) v = 10.0;
  else if (i == 4) v = 12.0; else if (i == 5) v = 4.0; else if (i == 6) v = 14.0; else if (i == 7) v = 6.0;
  else if (i == 8) v = 3.0; else if (i == 9) v = 11.0; else if (i == 10) v = 1.0; else if (i == 11) v = 9.0;
  else if (i == 12) v = 15.0; else if (i == 13) v = 7.0; else if (i == 14) v = 13.0; else v = 5.0;
  return (v + 0.5) / 16.0;
}
`;
const FRAG_BODY = `
{
  float lodT = lodBayer(gl_FragCoord.xy);
  if (uLodFar > 0.5 ? lodT >= vLodFade : lodT < vLodFade) discard;
}
`;

/** The shader edit itself (vertex: per-instance fade; fragment: the dither discard). Vertex positions are not touched. */
function patchShader(shader, far, range, centre) {
  shader.uniforms.uLodCam = lodCamera;
  shader.uniforms.uLodCentre = centre?.value ? centre : NO_CENTRE;
  shader.uniforms.uLodRange = range;
  shader.uniforms.uLodFar = { value: far ? 1 : 0 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${VERT_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${FRAG_BODY}`);
}

/**
 * Make `material` dither-fade by distance (call before it is first compiled). `far` false: the near level (drawn where the
 * pattern's threshold >= fade); true: the far level. Wraps any onBeforeCompile the material already has. Without `centre` only
 * instanced meshes fade (a plain mesh counts as fade 0: near drawn, far not); `centre`: a `{ value: Vector3 }` uniform (world),
 * 'origin' or 'attribute' (see the header). The edit keeps vertex positions, so tightfrustum and the
 * site instance batch (which audit `hasNativeVertexCompile`) still treat the material as native.
 */
export function patchDitherLod(material, { far = false, range, centre = null }) {
  const mode = centre === 'origin' ? 'LOD_ORIGIN' : centre === 'attribute' ? 'LOD_CENTRE_ATTRIBUTE' : centre ? 'LOD_CENTRE' : null;
  if (mode) (material.defines ??= {})[mode] = ''; // #1966: a single (skinned) mesh fades by the distance to `centre` ({ value: Vector3 }, world); #1967: by its origin / a vertex attribute
  const before = material.onBeforeCompile, key = material.customProgramCacheKey?.bind(material) ?? (() => '');
  const patched = function (shader, renderer) { before.call(this, shader, renderer); patchShader(shader, far, range, centre); };
  material.onBeforeCompile = patched;
  material.customProgramCacheKey = () => `${key()}|dither-lod-v1${mode ? mode === 'LOD_CENTRE' ? 'c' : mode : ''}`;
  rememberFragmentCompile(patched, before); // the edit leaves vertex positions alone (audited here)
  return material;
}

/** A depth material (shadow casters) that follows the same fade; `map`/`alphaTest` cut leaf cards out like three's own. */
export function lodDepthMaterial({ far = false, range, map = null, alphaTest = 0, side = THREE.FrontSide, centre = null }) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest, side });
  m.name = far ? 'lod-depth-far' : 'lod-depth-near';
  patchDitherLod(m, { far, range, centre });
  return m;
}

const sets = [];
const NO_CENTRE = { value: new THREE.Vector3() };
const NOWHERE = new THREE.Sphere(new THREE.Vector3(0, -1e6, 0), 0); // an emptied mesh is frustum-culled (no zero-instance draw call)
const _sphere = new THREE.Sphere(), _centre = new THREE.Vector3();

/**
 * Packs the instances of one or more near meshes (same geometry kind) and one far mesh by distance. `sources`:
 * [{ mesh, seeds?, tint? }]. The far mesh must have a capacity of at least the sum of the near counts. Draws only what each
 * level needs inside `end + margin` / beyond `start - margin`; the shaders fade by the exact distance.
 */
export class InstanceLod {
  constructor(sources, far, { start, end, margin = 2, step = 1, range = null, turn = 3, pad = 6 }) {
    this.range = range; this.far = far; this.turn = Math.cos(turn * Math.PI / 180); this.pad = pad; this.dir = new THREE.Vector3(0, 0, -1); this.view = null; this.start = start; this.end = end; this.margin = margin; this.step = step;
    this.from = new THREE.Vector3(Infinity, 0, 0); this.ready = false;
    this.sources = sources.map((s) => {
      const mesh = s.mesh, n = mesh.count, centre = new Float32Array(n * 3), m = new THREE.Matrix4(), v = new THREE.Vector3();
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < n; i++) { mesh.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(mesh.matrixWorld); centre.set([v.x, v.y, v.z], i * 3); }
      const order = Int32Array.from({ length: n }, (_, i) => i);
      mesh.boundingSphere ?? mesh.computeBoundingSphere();
      return { sphere: mesh.boundingSphere.clone(), mesh, seeds: s.seeds ?? null, tint: s.tint ?? null, n, centre, order, wantNear: new Uint8Array(n).fill(1), wantFar: new Uint8Array(n) };
    });
    const total = this.sources.reduce((a, s) => a + s.n, 0);
    if (far.instanceMatrix.count < total) throw new RangeError(`far mesh holds ${far.instanceMatrix.count} of ${total} instances`);
    if (!far.instanceColor) far.setColorAt(0, new THREE.Color(1, 1, 1));
    far.count = 0;
    const first = this.sources[0].mesh;
    far.position.copy(first.position); far.quaternion.copy(first.quaternion); far.scale.copy(first.scale);
    const sphere = new THREE.Sphere().makeEmpty();
    for (const s of this.sources) { s.mesh.boundingSphere ?? s.mesh.computeBoundingSphere(); sphere.union(s.mesh.boundingSphere); }
    far.boundingSphere = sphere; this.farSphere = sphere;
    far.userData.lodFar = true; for (const s of this.sources) { s.mesh.userData.lod = this; }
    sets.push(this);
  }

  /** Change the zone at run time (tests, A/B measurements: `setRange(1e6, 2e6)` draws the near level everywhere). */
  setRange(start, end) {
    this.start = start; this.end = end; this.range?.value.set(start, end);
    this.sources.forEach((s) => s.wantFar.fill(0)); this.update(this.from.x === Infinity ? new THREE.Vector3() : this.from.clone(), true);
    this.sync();
  }

  /** Repack if the camera moved `step` m (or `force`). Cheap otherwise. */
  update(cam, force = false, view = null) {
    this.view = view;
    if (this.ready && !force && cam.distanceToSquared(this.from) < this.step * this.step && !(view && view.dir.dot(this.dir) < this.turn)) return;
    this.from.copy(cam); if (view) this.dir.copy(view.dir);
    let changed = !this.ready;
    for (const s of this.sources) {
      let diff = false;
      for (let id = 0; id < s.n; id++) {
        const dx = s.centre[id * 3] - cam.x, dy = s.centre[id * 3 + 1] - cam.y, dz = s.centre[id * 3 + 2] - cam.z;
        const mem = lodMembership(Math.sqrt(dx * dx + dy * dy + dz * dz), this.start, this.end, this.margin);
        const wn = mem.near ? 1 : 0;
        // the far level of a view-limited set also needs the instance to be (nearly) in the view: one far mesh for the whole
        // site then draws only what the camera can see, like the per-cell near meshes (`pad` m plus 6 % of the distance
        // cover the sphere's size and a turn of less than `turn` degrees since the last packing)
        let wf = mem.far ? 1 : 0;
        if (wf && view) { const d = Math.sqrt(dx * dx + dy * dy + dz * dz); wf = view.frustum.intersectsSphere(_sphere.set(_centre.set(s.centre[id * 3], s.centre[id * 3 + 1], s.centre[id * 3 + 2]), this.pad + d * 0.06)) ? 1 : 0; }
        if (wn !== s.wantNear[id] || wf !== s.wantFar[id]) { diff = true; s.wantNear[id] = wn; s.wantFar[id] = wf; }
      }
      if (diff || !this.ready) { this.#pack(s); changed = true; }
    }
    this.ready = true;
    if (changed) this.sync();
  }

  /** Move the near-needed instances to the front of the source's buffers (and its seeds), set its draw count. */
  #pack(s) {
    const { order, count, changed } = packOrder(s.order, s.wantNear), mesh = s.mesh;
    if (changed) {
      const ma = mesh.instanceMatrix.array, ca = mesh.instanceColor?.array;
      const oldM = ma.slice(0, s.n * 16), oldC = ca?.slice(0, s.n * 3), oldS = s.seeds?.slice(), at = new Int32Array(s.n);
      for (let p = 0; p < s.n; p++) at[s.order[p]] = p;
      for (let p = 0; p < s.n; p++) {
        const from = at[order[p]];
        ma.set(oldM.subarray(from * 16, from * 16 + 16), p * 16);
        if (ca) ca.set(oldC.subarray(from * 3, from * 3 + 3), p * 3);
        if (oldS) s.seeds[p] = oldS[from];
      }
      s.order = order;
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.count = count; mesh.boundingSphere = count ? s.sphere : NOWHERE;
  }

  /** Re-copy the far mesh from the (possibly just rewritten) near buffers; call after seasons.js changed colours/scales. */
  sync() {
    const fm = this.far.instanceMatrix.array, fc = this.far.instanceColor.array, c = new THREE.Color();
    let k = 0, shown = false;
    for (const s of this.sources) {
      shown ||= s.mesh.visible;
      if (!s.mesh.visible) continue;
      const ma = s.mesh.instanceMatrix.array, ca = s.mesh.instanceColor?.array;
      for (let p = 0; p < s.n; p++) {
        if (!s.wantFar[s.order[p]]) continue;
        fm.set(ma.subarray(p * 16, p * 16 + 16), k * 16);
        if (s.tint) { c.copy(s.tint); fc[k * 3] = c.r; fc[k * 3 + 1] = c.g; fc[k * 3 + 2] = c.b; }
        else if (ca) fc.set(ca.subarray(p * 3, p * 3 + 3), k * 3); else fc.fill(1, k * 3, k * 3 + 3);
        k++;
      }
    }
    this.far.count = k; this.far.visible = shown && k > 0; this.far.boundingSphere = k ? this.farSphere : NOWHERE;
    this.far.instanceMatrix.needsUpdate = true; this.far.instanceColor.needsUpdate = true;
  }

  /** For tests/measurements: instances drawn per level. */
  state() { return { near: this.sources.reduce((a, s) => a + s.mesh.count, 0), far: this.far.count }; }
}

/** Each frame: set the shared camera uniform and repack every set whose camera moved. */
export function updateInstanceLods(camera) {
  camera.updateMatrixWorld();
  const cam = camera.getWorldPosition(lodCamera.value);
  view.dir.set(0, 0, -1).transformDirection(camera.matrixWorld);
  view.frustum.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (const s of sets) s.update(cam, false, view);
  for (const b of batches) b.update(cam);
  for (const fn of updaters) fn(cam, view);
}
const updaters = [];
/** Run `fn(cameraPosition, { frustum, dir })` every updateInstanceLods (things that switch their own meshes, #1967). */
export function onLodUpdate(fn) { updaters.push(fn); return fn; }

/**
 * #1969: two levels of ONE merged mesh (a batch of buildings): `near` (full detail) and `far` (a lighter geometry of the same
 * things). The whole batch fades at once, by the distance from the camera to the batch's bounding box (so standing among its
 * buildings is distance 0): the same dither as the instanced levels, through a centre uniform kept that far from the camera.
 * Each level needs a material of its own (`material(far)` makes one; it is patched here) and gets a matching depth material when
 * it casts shadows. Outside the zone only one level is visible.
 */
export class BatchLod {
  constructor(near, far, { start, end, margin = 1, material }) {
    Object.assign(this, { near, far, start, end, margin, enabled: true, d: 0 });
    this.range = lodRange(start, end); this.centre = { value: new THREE.Vector3() };
    for (const [mesh, isFar] of [[near, false], [far, true]]) {
      mesh.material = patchDitherLod(material(isFar), { far: isFar, range: this.range, centre: this.centre });
      if (mesh.castShadow) mesh.customDepthMaterial = lodDepthMaterial({ far: isFar, range: this.range, centre: this.centre, side: mesh.material.side });
    }
    near.geometry.boundingBox ?? near.geometry.computeBoundingBox();
    near.updateWorldMatrix(true, false);
    this.box = near.geometry.boundingBox.clone().applyMatrix4(near.matrixWorld);
    far.visible = false; far.userData.lodFar = true; near.userData.batchLod = far.userData.batchLod = this;
    batches.push(this);
  }
  update(cam) {
    const d = this.d = this.enabled ? this.box.distanceToPoint(cam) : 0;
    this.centre.value.set(cam.x + d, cam.y, cam.z); // (the shader only measures the distance)
    this.near.visible = d < this.end + this.margin;
    this.far.visible = d > this.start - this.margin;
  }
}
const batches = [];
/** For tests: the batch levels. */
export const batchLods = () => batches;
const view = { frustum: new THREE.Frustum(), dir: new THREE.Vector3() }, _pv = new THREE.Matrix4();

/** For tests. */
export const instanceLodState = () => sets.map((s) => s.state());
