import * as THREE from 'three';
import { PERF } from './config.js';

// Small-detail culling (#189): from the street the whole flat is in the view frustum (the walls don't stop three's
// culling), so every handle, knob, bottle and trinket inside was a draw call of its own. A mesh smaller than
// `PERF.detail.maxR` that would look tinier than `k` (its radius / distance) is moved to a layer the camera does
// not render (nor the shadow camera, nor the raycaster — it is far beyond reach then: never nearer than `minDist`).
// Checked when the camera has moved a little, not every frame.
// From outside the flat, anything inside it is only drawn if the line from the eye to it passes through one of the
// façade's openings (windows, doors; with a margin of its size): the walls hide the rest (a coarse occlusion test).

const HIDDEN = 7; // the layer far-away details go to
const D = PERF.detail;

export class DetailCuller {
  /** Collect the small meshes under `root` (call once everything is built). */
  /** box: { W, D, roof, floor1, doorHeight } the flat's footprint (plan), roof height, Övre plan's floor, the door height; openings: { north: [], south: [] } (x0 x1 y0 y1). */
  constructor(root, box, openings) {
    // the front door's leaf is solid: through it only its transom counts (doorHeight above its sill)
    const solid = (o) => o.y0 < 0.05 || Math.abs(o.y0 - box.floor1) < 0.05;
    openings = { north: openings.north.map((o) => (solid(o) ? { ...o, y0: o.y0 + box.doorHeight } : o)), south: openings.south };
    Object.assign(this, { box, openings });
    this.items = [];
    this.last = new THREE.Vector3(1e9, 0, 0);
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const s = o.geometry.boundingSphere;
      const r = s.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (r > 0 && r < D.maxOcclude) this.items.push({ o, r, center: s.center.clone(), cut: r < D.maxR ? Math.max(D.minDist, r / D.k) : Infinity, far: false });
    });
  }

  update(camera) {
    const p = camera.getWorldPosition(this.tmp ??= new THREE.Vector3());
    if (p.distanceToSquared(this.last) < D.move * D.move) return;
    this.last.copy(p);
    const w = this.w ??= new THREE.Vector3();
    const { W, D: Dz, roof } = this.box;
    const outside = p.x < 0 || p.x > W || p.z < 0 || p.z > Dz || p.y > roof;
    for (const it of this.items) {
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

  /** Everything back on the normal layer (screenshots of detail, tests). */
  reset() { for (const it of this.items) { it.far = false; it.o.layers.set(0); } this.last.set(1e9, 0, 0); }
}
