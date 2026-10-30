import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BINOCULARS as B, MAILBOX as M } from './config.js';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';

// The binoculars (#1706), a Holdable (holdable.js) lying in the yellow letterbox (mailbox.js). Take, hold, put down and put
// back work as for every loose thing (keep.js saves where it lies or that it is in the hand). While they are in the hand,
// the right mouse button / the touch button (`useAlt`) raises them: the field of view drops to baseFov / zoom, a black
// double-circle mask covers the screen and looking turns slower (main.js reads `zoomed`, `fov()` and `lookScale()`).
// The scope always goes down again (`setZoom(false)`) when they leave the hand, on the menu, death and waking, riding and
// whenever main.js's step finds anything else in the hand. They are not a weapon (no `clickIsUse`, `shoots`, `hitsTarget`).
// One vertex-coloured mesh (one draw call, only while the hatch is open or they are out); the mask is one SVG element.

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });

/** Two barrels along z (forward = −z), a bridge and a focus wheel, centred on the origin. */
export function binocularGeometry() {
  const { barrel: r, length: L, gap, bell } = B.size, cyl = (rad, len, x, z, hex, seg = 12) => paint(new THREE.CylinderGeometry(rad, rad, len, seg).rotateX(Math.PI / 2).translate(x, 0, z), hex);
  const parts = [];
  for (const s of [-1, 1]) {
    const x = s * gap / 2;
    parts.push(cyl(r, L, x, 0, 0x2c2f33));                          // the barrel
    parts.push(cyl(bell, 0.05, x, -L / 2 - 0.02, 0x1d1f22));        // the objective bell (front)
    parts.push(cyl(bell * 0.86, 0.004, x, -L / 2 - 0.046, 0x5b7c99)); // its glass
    parts.push(cyl(r * 0.85, 0.034, x, L / 2 + 0.017, 0x151617));   // the eyepiece (back), black rubber
  }
  parts.push(paint(new THREE.BoxGeometry(gap, 0.018, 0.05).translate(0, 0.004, -0.005), 0x34373b)); // the hinge bridge
  parts.push(cyl(0.011, 0.03, 0, -0.01, 0x9a9da1, 10).translate(0, r * 0.9, 0)); // the focus wheel between the barrels, on top
  return mergeGeometries(parts);
}

const NONE = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };

/** The black double-circle mask: two overlapping round windows, sized by the shorter side of the screen. */
function buildMask() {
  if (typeof document === 'undefined') return null;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), { radius, offset } = B.mask, ns = 'http://www.w3.org/2000/svg';
  el.id = 'binoculars-mask';
  el.setAttribute('viewBox', '-50 -50 100 100');
  el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:visible';
  el.innerHTML = `<defs><mask id="binoculars-holes" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000"><rect x="-2000" y="-2000" width="4000" height="4000" fill="#fff"/><circle cx="${-offset * 100}" cy="0" r="${radius * 100}" fill="#000"/><circle cx="${offset * 100}" cy="0" r="${radius * 100}" fill="#000"/></mask></defs><rect x="-2000" y="-2000" width="4000" height="4000" fill="#000" mask="url(#binoculars-holes)"/>`;
  el.hidden = true;
  el.style.display = 'none';
  const canvas = document.querySelector('canvas');
  if (canvas?.parentNode) canvas.after(el); else document.body.prepend(el); // before the HUD in the DOM, so the HUD stays on top
  return el;
}

export class Binoculars extends Holdable {
  /** group: the letterbox's group (mailbox.js, local +z = out of the wall), lid: its hatch Openable. */
  constructor(scene, camera, group, lid) {
    const model = new THREE.Group();
    const body = new THREE.Mesh(binocularGeometry(), vmat);
    body.castShadow = true;
    model.add(body);
    group.updateMatrixWorld(true);
    // lying across the cavity (barrels along the box's width), on its floor, in the middle of the depth
    const qGroup = group.getWorldQuaternion(new THREE.Quaternion());
    const qHome = qGroup.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    const homePos = group.localToWorld(new THREE.Vector3(0, M.wall + B.size.bell + 0.002, M.d / 2));
    const pickPos = group.localToWorld(new THREE.Vector3(0, M.h * 0.5, M.d / 2));
    const ext = new THREE.Vector3(M.w * 0.8, M.h * 0.7, M.d * 0.8).applyQuaternion(qGroup);
    super(scene, camera, {
      name: 'kikaren', verb: 'ta', backName: 'brevlådan', backVerb: 'lägga tillbaka kikaren i', model,
      home: { pos: homePos, rot: new THREE.Euler().setFromQuaternion(qHome) },
      heldPose: { pos: new THREE.Vector3(B.held.x, B.held.y, B.held.z), rot: new THREE.Euler(0.05, 0, 0) },
      pick: { pos: pickPos, size: [Math.abs(ext.x), Math.abs(ext.y), Math.abs(ext.z)] },
      cooldown: 0.25, grip: B.grip, // (no useLabel: the touch button beside the action button is `useAlt`'s, main.js)
    });
    Object.assign(this, { isBinoculars: true, lid, zoomed: false, altIcon: '🔭', altLabel: 'Kika', mask: buildMask(), zoomCount: 0 });
  }

  get lidOpen() { return this.lid.t > 0.02; }

  /** Only while the hatch is open can they be seen and taken; put back, they lie in the box again. */
  get target() {
    if (this.held) return this.lidOpen ? this.backTarget : NONE; // (shut: the hatch is in the way, E opens it instead)
    return this.lidOpen || this.placed ? this.takeTarget : NONE;
  }

  idle() { this.model.visible = this.placed || this.lidOpen; }

  onTake() { this.model.visible = true; sfx.click?.(this.where()); }
  onPut() { this.setZoom(false); }
  goHome() { super.goHome(); this.model.visible = !!this.lid && this.lidOpen; } // (the constructor's first goHome runs before `lid` is set)

  /** Zoom on / off; only with the binoculars in the hand. */
  setZoom(on) {
    on = !!on && this.held;
    if (on === this.zoomed) return;
    this.zoomed = on;
    if (on) this.zoomCount++;
    if (this.mask) { this.mask.hidden = !on; this.mask.style.display = on ? '' : 'none'; }
    this.model.visible = !on; // (their own barrels would fill the view)
    if (this.held) sfx.click?.(this.where());
  }
  onUse() { this.setZoom(!this.zoomed); }
  /** The right mouse button / the touch button. */
  useAlt() { this.use(); }

  /** The camera's field of view for the ordinary one `base` (null: not zoomed). */
  fov(base = B.baseFov) { return this.zoomed ? B.baseFov / B.zoom : base; }
  /** How much of a look movement is applied: slower while zoomed. */
  lookScale() { return this.zoomed ? B.sensitivity / B.zoom : 1; }
}
