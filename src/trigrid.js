import * as THREE from 'three';

// Fast short-segment hits against big static meshes (#96). three's Mesh.raycast tests every triangle of a
// mesh the ray's sphere/box test lets through — and the merged level meshes (#48) span the whole flat, so
// one blade check cost ~3 ms. A TriGrid buckets a static mesh's world-space triangles into 0.5 m cells
// once (built on first use); a segment then only tests the triangles in the cells around it. Triangles
// spanning too many cells (the ground, a whole floor) sit in a short list tested every time.

const CELL = 0.5, BIG = 512;
const key = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

export class TriGrid {
  constructor(mesh) {
    const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
    const n = (idx ? idx.count : pos.count) / 3;
    this.mesh = mesh;
    this.tri = new Float32Array(n * 9);
    this.mat = new Uint8Array(n); // material index (groups)
    for (const gr of g.groups) for (let t = gr.start / 3; t < Math.min(n, (gr.start + gr.count) / 3); t++) this.mat[t] = gr.materialIndex ?? 0;
    mesh.updateWorldMatrix(true, false);
    this.box = new THREE.Box3();
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const i = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      this.tri.set([p.x, p.y, p.z], t * 9 + k * 3);
      this.box.expandByPoint(p);
    }
    this.cells = new Map();
    this.big = [];
    for (let t = 0; t < n; t++) {
      const [x0, y0, z0, x1, y1, z1] = this.triCells(t);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > BIG) { this.big.push(t); continue; }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const k = key(x, y, z);
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push(t);
      }
    }
    this.stamp = new Uint32Array(n);
    this.q = 0;
  }

  triCells(t) {
    const v = this.tri, o = t * 9, f = Math.floor;
    const mn = (k) => Math.min(v[o + k], v[o + 3 + k], v[o + 6 + k]), mx = (k) => Math.max(v[o + k], v[o + 3 + k], v[o + 6 + k]);
    return [f(mn(0) / CELL), f(mn(1) / CELL), f(mn(2) / CELL), f(mx(0) / CELL), f(mx(1) / CELL), f(mx(2) / CELL)];
  }

  /** Every hit of `ray` (a THREE.Ray) within `far` whose segment box is `box`: pushes { distance, point, normal, object, materialIndex }. */
  hits(ray, far, box, side, out) {
    if (!this.box.intersectsBox(box)) return;
    this.q++;
    const f = Math.floor, test = (t) => {
      if (this.stamp[t] === this.q) return;
      this.stamp[t] = this.q;
      const v = this.tri, o = t * 9;
      a.set(v[o], v[o + 1], v[o + 2]); b.set(v[o + 3], v[o + 4], v[o + 5]); c.set(v[o + 6], v[o + 7], v[o + 8]);
      const m = Array.isArray(this.mesh.material) ? this.mesh.material[this.mat[t]] : this.mesh.material;
      if (!ray.intersectTriangle(a, b, c, (m?.side ?? side) === THREE.FrontSide, p)) return;
      const d = p.distanceTo(ray.origin);
      if (d > far) return;
      const normal = e1.subVectors(b, a).cross(e2.subVectors(c, a)).normalize().clone();
      out.push({ distance: d, point: p.clone(), normal, object: this.mesh, materialIndex: this.mat[t] });
    };
    for (const t of this.big) test(t);
    const x0 = f(box.min.x / CELL), y0 = f(box.min.y / CELL), z0 = f(box.min.z / CELL);
    const x1 = f(box.max.x / CELL), y1 = f(box.max.y / CELL), z1 = f(box.max.z / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const l = this.cells.get(key(x, y, z));
      if (l) for (const t of l) test(t);
    }
  }
}
