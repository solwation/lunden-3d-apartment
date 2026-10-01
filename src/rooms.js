// Which room is a point in? The plan only has room *labels*, so each level is rasterised
// (5 cm cells) with walls and door openings as barriers, and a breadth-first fill grows from
// every label at once: each cell belongs to the label it is reached from first. Open-plan
// areas (hall ↔ kitchen) are split halfway, which is what a visitor would expect anyway.

const CELL = 0.05;

export class RoomMap {
  /** barriers: plan rectangles {x0,x1,z0,z1}; rooms: [{name, x, z}] inside the size. */
  constructor(size, barriers, rooms) {
    this.nx = Math.ceil(size.x / CELL);
    this.nz = Math.ceil(size.z / CELL);
    this.size = size;
    this.rooms = rooms.filter((r) => r.x > 0 && r.x < size.x && r.z > 0 && r.z < size.z);
    const n = this.nx * this.nz;
    const blocked = new Uint8Array(n);
    for (const b of barriers) {
      const i0 = Math.max(0, Math.floor(b.x0 / CELL)), i1 = Math.min(this.nx - 1, Math.floor(b.x1 / CELL - 1e-6));
      const k0 = Math.max(0, Math.floor(b.z0 / CELL)), k1 = Math.min(this.nz - 1, Math.floor(b.z1 / CELL - 1e-6));
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) blocked[k * this.nx + i] = 1;
    }
    this.owner = new Int16Array(n).fill(-1);
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    this.rooms.forEach((r, id) => {
      const c = this.cell(r.x, r.z);
      if (c >= 0 && !blocked[c] && this.owner[c] < 0) { this.owner[c] = id; queue[tail++] = c; }
    });
    while (head < tail) {
      const c = queue[head++], i = c % this.nx, k = (c - i) / this.nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= this.nx || kk >= this.nz) continue;
        const d = kk * this.nx + ii;
        if (blocked[d] || this.owner[d] >= 0) continue;
        this.owner[d] = this.owner[c];
        queue[tail++] = d;
      }
    }
    this.blocked = blocked;
  }

  cell(x, z) {
    const i = Math.floor(x / CELL), k = Math.floor(z / CELL);
    return i < 0 || k < 0 || i >= this.nx || k >= this.nz ? -1 : k * this.nx + i;
  }

  /** Room name exactly at (x, z) (no searching around), or null. */
  exact(x, z) {
    const c = this.cell(x, z);
    return c >= 0 && this.owner[c] >= 0 ? this.rooms[this.owner[c]].name : null;
  }

  /** Centre of each labelled region: [{ name, x, z, area }] (area in m²). */
  regions() {
    const acc = this.rooms.map((r) => ({ name: r.name, x: 0, z: 0, n: 0 }));
    for (let c = 0; c < this.owner.length; c++) {
      const o = this.owner[c];
      if (o < 0) continue;
      acc[o].x += ((c % this.nx) + 0.5) * CELL;
      acc[o].z += (Math.floor(c / this.nx) + 0.5) * CELL;
      acc[o].n++;
    }
    return acc.filter((a) => a.n).map((a) => ({ name: a.name, x: a.x / a.n, z: a.z / a.n, area: a.n * CELL * CELL }));
  }

  /** Room name at (x, z), or null (outside / inside a wall). Looks a little around a wall cell. */
  at(x, z) {
    for (const [dx, dz] of [[0, 0], [0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]]) {
      const c = this.cell(x + dx, z + dz);
      if (c >= 0 && this.owner[c] >= 0) return this.rooms[this.owner[c]].name;
    }
    return null;
  }
}
