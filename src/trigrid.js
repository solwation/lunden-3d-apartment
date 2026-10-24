import * as THREE from 'three';

// Fast short-segment hits against big static meshes (#96). three's Mesh.raycast tests every triangle of a
// mesh the ray's sphere/box test lets through — and the merged level meshes (#48) span the whole flat, so
// one blade check cost ~3 ms. A TriGrid buckets a static mesh's world-space triangles into 0.5 m cells
// once (built on first use); a segment then only tests the triangles in the cells around it. Triangles
// spanning too many cells (the ground, a whole floor) sit in a short list tested every time.

// #1593: the fine cells are built lazily per coarse tile (TILE fine cells a side). A whole-site mesh (the terrain spans
// ~700 × 800 m) whose bounds contain the flat used to get millions of 0.5 m cell arrays the first time a short indoor
// segment touched it (Möblera om's wall check every frame: ~400 MB retained on the phone profile). Now only the tiles a
// segment actually passes are refined; cell membership, order and the hit visit order stay the same.
const CELL = 0.5, BIG = 512, TILE = 16;
// exact in float64 for tile indices within ±65536 (±524 km)
const tileKey = (x, y, z) => ((x + 65536) * 131072 + (y + 65536)) * 131072 + (z + 65536);
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
      // Keep the same float32 world vertices without a temporary array for every vertex (#715).
      const offset = t * 9 + k * 3;
      this.tri[offset] = p.x;
      this.tri[offset + 1] = p.y;
      this.tri[offset + 2] = p.z;
      this.box.expandByPoint(p);
    }
    this.tiles = new Map(); // tileKey → { x, y, z, tris: [t ascending], cells: null | Array(TILE³) of [t ascending] }
    this.big = [];
    const f = Math.floor;
    for (let t = 0; t < n; t++) {
      const [x0, y0, z0, x1, y1, z1] = this.triCells(t);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > BIG) { this.big.push(t); continue; }
      for (let x = f(x0 / TILE); x <= f(x1 / TILE); x++) for (let y = f(y0 / TILE); y <= f(y1 / TILE); y++) for (let z = f(z0 / TILE); z <= f(z1 / TILE); z++) {
        const k = tileKey(x, y, z);
        let tile = this.tiles.get(k);
        if (!tile) this.tiles.set(k, (tile = { x, y, z, tris: [], cells: null }));
        tile.tris.push(t);
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

  /** The fine cells of one tile, built on first use: the same triangles, in the same order, as a whole-mesh grid. */
  refine(tile) {
    const cells = (tile.cells = new Array(TILE * TILE * TILE));
    const bx = tile.x * TILE, by = tile.y * TILE, bz = tile.z * TILE, M = TILE - 1;
    for (const t of tile.tris) {
      const [x0, y0, z0, x1, y1, z1] = this.triCells(t);
      for (let x = Math.max(x0 - bx, 0), xe = Math.min(x1 - bx, M); x <= xe; x++)
        for (let y = Math.max(y0 - by, 0), ye = Math.min(y1 - by, M); y <= ye; y++)
          for (let z = Math.max(z0 - bz, 0), ze = Math.min(z1 - bz, M); z <= ze; z++) {
            const i = (x * TILE + y) * TILE + z;
            (cells[i] ??= []).push(t);
          }
    }
    return cells;
  }

  /** The triangles in fine cell (x, y, z) (cell indices), ascending; undefined when none. */
  cell(x, y, z) {
    const f = Math.floor, tx = f(x / TILE), ty = f(y / TILE), tz = f(z / TILE), tile = this.tiles.get(tileKey(tx, ty, tz));
    if (!tile) return undefined;
    return (tile.cells ?? this.refine(tile))[((x - tx * TILE) * TILE + (y - ty * TILE)) * TILE + (z - tz * TILE)];
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
      const l = this.cell(x, y, z);
      if (l) for (const t of l) test(t);
    }
  }
}
