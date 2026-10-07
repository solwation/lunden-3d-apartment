import * as THREE from 'three';
import { PERF } from './config.js';

// Small-detail culling (#189): from the street the whole flat is in the view frustum (the walls don't stop three's
// culling), so every handle, knob, bottle and trinket inside was a draw call of its own. A mesh smaller than
// `PERF.detail.maxR` that would look tinier than `k` (its radius / distance) is moved to a layer the camera does
// not render (nor the shadow camera, nor the raycaster — it is far beyond reach then: never nearer than `minDist`).
// Checked when the camera has moved a little, not every frame.
// From outside the flat, anything inside it is only drawn if the line from the eye to it passes through one of the
// façade's openings (windows, doors; with a margin of its size): the walls hide the rest (a coarse occlusion test).
// The front door's leaf only counts as solid while it is shut: open, the whole doorway shows the hall (#210).
// Things that move by themselves while the visitor may stand still (the car driving in, the cat, darts in flight …)
// mark their root with `userData.moving`: the meshes under it are judged again every update, not only when the
// camera has moved (#267 — the car's wheels and rear windows stayed hidden from when it was far away).
// The lit parts of the lamps (materials with `userData.lamp`, set by lights.js) are never culled for being small: a
// glowing shade or bulb that vanished a few metres off made the lamp look off (#294); from outside, walls still hide them.

const HIDDEN = 7; // the layer far-away details go to
const D = PERF.detail;

export class DetailCuller {
  /** Collect the small meshes under `root` (call once everything is built). */
  /** box: { W, D, roof, floor1, doorHeight } the flat's footprint (plan), roof height, Övre plan's floor, the door height; openings: { north: [], south: [] } (x0 x1 y0 y1);
   * doorOpen(): is the front door open (then its whole doorway counts, #210)? */
  constructor(root, box, openings, doorOpen = () => false) {
    // the front door's leaf is solid while it is shut: through it only its transom counts (doorHeight above its sill)
    const solid = (o) => o.y0 < 0.05 || Math.abs(o.y0 - box.floor1) < 0.05;
    this.shut = { north: openings.north.map((o) => (solid(o) ? { ...o, y0: o.y0 + box.doorHeight } : o)), south: openings.south };
    this.full = { north: openings.north, south: openings.south };
    Object.assign(this, { box, doorOpen, open: false, openings: this.shut });
    this.items = [];
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.moving = []; // the items under a root with userData.moving
    this.movers = []; // those roots: their matrices are brought up to date before they are judged (no render has run yet)
    root.updateMatrixWorld(true);
    const walk = (o, moving) => {
      if (o.userData.moving && !moving) this.movers.push(o);
      moving ||= !!o.userData.moving;
      for (const c of o.children) walk(c, moving);
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const s = o.geometry.boundingSphere;
      const r = s.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (!(r > 0 && r < D.maxOcclude)) return;
      const lamp = [o.material].flat().some((m) => m?.userData.lamp); // a lamp's lit parts: never too small to draw (#294)
      const baseCut = r < D.maxR && !lamp ? Math.max(D.minDist, r / D.k) : Infinity;
      const it = { o, r, center: s.center.clone(), cut: baseCut, baseCut, far: false, lamp };
      this.items.push(it);
      if (moving) this.moving.push(it);
    };
    walk(root, false);
    this.qualityScale = 1.0;
  }

  /** Set quality distance scaling factor (1.0 = high, 0.7 = medium/low) (#460). */
  setQuality(scale = 1.0) {
    if (Math.abs(this.qualityScale - scale) < 1e-3) return;
    this.qualityScale = scale;
    for (const it of this.items) {
      if (it.baseCut !== Infinity) it.cut = Math.max(D.minDist * 0.8, it.baseCut * scale);
    }
    this.refresh();
  }

  update(camera) {
    const p = camera.getWorldPosition(this.tmp ??= new THREE.Vector3());
    const open = !!this.doorOpen();
    if (open !== this.open) { this.open = open; this.openings = open ? this.full : this.shut; this.last.set(1e9, 0, 0); } // look again now
    const still = p.distanceToSquared(this.last) < D.move * D.move;
    if (still && !this.moving.length) return;
    if (!still) this.last.copy(p);
    for (const o of this.movers) o.updateMatrixWorld();
    const w = this.w ??= new THREE.Vector3();
    const { W, D: Dz, roof } = this.box;
    const outside = p.x < 0 || p.x > W || p.z < 0 || p.z > Dz || p.y > roof;
    for (const it of still ? this.moving : this.items) {
      w.copy(it.center).applyMatrix4(it.o.matrixWorld);
      const far = w.distanceToSquared(p) > it.cut * it.cut || (outside && this.hidden(p, w, it.r));
      if (far === it.far) continue;
      it.far = far;
      if (far) it.o.layers.set(HIDDEN); else it.o.layers.set(0);
    }
  }

  /** Seen from `eye` (outside the flat), is a thing at `c` (radius r) inside it hidden by the walls? */
  hidden(eye, c, r) {
    const { W, D: Dz, roof } = this.box;
    if (c.x < 0 || c.x > W || c.z < 0 || c.z > Dz || c.y > roof) return false; // not in the flat
    // where the line from the thing to the eye leaves the box: the nearest face it crosses
    const dx = eye.x - c.x, dy = eye.y - c.y, dz = eye.z - c.z;
    let t = Infinity, face = null;
    const hit = (tt, f) => { if (tt > 0 && tt < t) { t = tt; face = f; } };
    if (dz < 0) hit(-c.z / dz, 'north'); else if (dz > 0) hit((Dz - c.z) / dz, 'south');
    if (dx < 0) hit(-c.x / dx, 'side'); else if (dx > 0) hit((W - c.x) / dx, 'side');
    if (dy > 0) hit((roof - c.y) / dy, 'side');
    if (face === null || face === 'side') return true; // the party walls and the roof have no openings
    const x = c.x + dx * t, y = c.y + dy * t, m = r * (1 - t) + 0.04; // its outline shrinks towards the eye
    return !this.openings[face].some((o) => x > o.x0 - m && x < o.x1 + m && y > o.y0 - m && y < o.y1 + m);
  }

  /** Look again at the next update even if the camera has not moved (something was taken into the hand or put down). */
  refresh() { this.last.set(1e9, 0, 0); }

  /** Everything back on the normal layer (screenshots of detail, tests). */
  reset() { for (const it of this.items) { it.far = false; it.o.layers.set(0); } this.last.set(1e9, 0, 0); }
}
