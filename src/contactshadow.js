import * as THREE from 'three';
import { CONTACT_SHADOW } from './config.js';

// Contact shadows under loose furniture (#1075). Every floor-standing piece gets soft multiply-blended rounded rectangles
// over its collision footprint; all of them are one InstancedMesh (a single draw call) inside the furniture group, so F
// hides them with the furniture. The instance matrices follow the pieces' own world matrices each frame, so a moved
// chair (Möblera om), a piece hidden for the season or culled by detail takes its shadow along.

const VERT = /* glsl */`
attribute vec2 aHalf;
uniform float uSoft;
varying vec2 vP;
varying vec2 vHalf;
void main() {
  vHalf = aHalf;
  vP = position.xz * 2.0 * (aHalf + uSoft); // metres from the rectangle's centre
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform float uSoft, uRadius, uStrength;
varying vec2 vP;
varying vec2 vHalf;
void main() {
  float r = min(uRadius, min(vHalf.x, vHalf.y));
  vec2 q = abs(vP) - vHalf + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; // signed distance to the rounded footprint
  float a = 1.0 - smoothstep(-uSoft, uSoft, d);
  gl_FragColor = vec4(vec3(1.0 - uStrength * a), 1.0);
}`;

/** Merge a piece's footprint rectangles that tile a larger rectangle exactly (a sofa's back, arms and seat). */
export function shadowRects(rects) {
  let list = rects.map(({ x0, x1, z0, z1 }) => ({ x0, x1, z0, z1 })).filter((r) => r.x1 > r.x0 && r.z1 > r.z0);
  const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const u = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) };
      if (Math.abs(area(u) - area(a) - area(b)) < 1e-6) { list[i] = u; list.splice(j, 1); merged = true; break outer; }
    }
  }
  return list;
}

/**
 * entries: [{ object, rects (local footprint), base (local y of the floor under the piece) }]. Returns the InstancedMesh;
 * add it as the LAST child of the furniture group so the pieces' world matrices are current when it refreshes.
 */
export function buildContactShadows(entries, C = CONTACT_SHADOW) {
  const parts = [];
  for (const e of entries) for (const r of shadowRects(e.rects)) parts.push({ e, r });
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute('normal');
  const half = new Float32Array(parts.length * 2);
  parts.forEach(({ r }, i) => { half[i * 2] = (r.x1 - r.x0) / 2; half[i * 2 + 1] = (r.z1 - r.z0) / 2; });
  geo.setAttribute('aHalf', new THREE.InstancedBufferAttribute(half, 2));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uSoft: { value: C.soft }, uRadius: { value: C.radius }, uStrength: { value: C.strength } },
    transparent: true, depthWrite: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, parts.length));
  mesh.count = parts.length;
  mesh.name = 'contact-shadows';
  mesh.frustumCulled = false; // instances spread over the whole flat
  mesh.renderOrder = 1;
  mesh.raycast = () => {}; // never an E / measuring / rearranging target
  mesh.matrixAutoUpdate = false;
  mesh.userData.contactShadows = true;
  // each part's local placement on its piece: centre of the rectangle on the floor, scaled to rectangle + soft edge
  const local = parts.map(({ e, r }) => new THREE.Matrix4().compose(
    new THREE.Vector3((r.x0 + r.x1) / 2, e.base + C.lift, (r.z0 + r.z1) / 2), new THREE.Quaternion(),
    new THREE.Vector3(r.x1 - r.x0 + 2 * C.soft, 1, r.z1 - r.z0 + 2 * C.soft)));
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), m = new THREE.Matrix4(), inv = new THREE.Matrix4();
  const shown = (o) => { for (; o && o !== mesh.parent; o = o.parent) if (!o.visible) return false; return !!o; };
  const refresh = () => {
    if (mesh.parent && !mesh.parent.visible) return; // F: nothing drawn, nothing to follow
    inv.copy(mesh.parent?.matrixWorld ?? m.identity()).invert();
    const arr = mesh.instanceMatrix.array;
    let changed = false;
    parts.forEach(({ e }, i) => {
      if (shown(e.object)) m.multiplyMatrices(inv, e.object.matrixWorld).multiply(local[i]); else m.copy(zero);
      const o = i * 16, el = m.elements;
      for (let k = 0; k < 16; k++) if (arr[o + k] !== el[k]) { arr.set(el, o); changed = true; break; }
    });
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  };
  // refresh as the scene updates its world matrices before a render (no hook in the main loop needed)
  mesh.updateMatrixWorld = function (force) { THREE.InstancedMesh.prototype.updateMatrixWorld.call(this, force); refresh(); };
  mesh.userData.refresh = refresh;
  mesh.userData.parts = parts.length;
  return mesh;
}
