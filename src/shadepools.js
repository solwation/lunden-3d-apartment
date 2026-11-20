import * as THREE from 'three';
import { glowMaterial } from './groundglow.js';

// The pools a shaded lamp throws on the floor and ceiling (#2191): one additive decal per pool, all merged into ONE mesh
// with one material (groundglow.js's soft fall-off), brightness per quad in the vertex colour so every lamp fades with
// its own switch (no light, one draw call). A lamp's `shade.pool` = { floor: [radius m, peak], ceiling: [radius, peak] }
// (*guesses* by eye). The quads follow the lamp: a moved pendant (Möblera om) re-seats them from its `pos`.

export class ShadePools {
  /** `entries`: [{ lamp }] (every lamp), `floorAt(level)` → y of the floor, `ceilingAt(level, x, z)` → y of the ceiling. */
  constructor(entries, floorAt, ceilingAt) {
    this.items = entries.map((e) => e.lamp).filter((l) => l.shade?.pool);
    this.floorAt = floorAt; this.ceilingAt = ceilingAt;
    this.k = new Map(this.items.map((l) => [l, 0]));
    this.seen = new Map(); // the position / level each lamp's quads were last placed for
    this.mesh = null;
    if (!this.items.length) return;
    const n = this.items.length * 2 * 4;
    const g = new THREE.BufferGeometry(), idx = [];
    for (let q = 0; q < n / 4; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setIndex(idx);
    const uv = g.attributes.uv;
    for (let q = 0; q < n / 4; q++) [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], j) => uv.setXY(q * 4 + j, u, v));
    const mat = glowMaterial(0xffffff);
    mat.vertexColors = true; mat.opacity = 1; mat.polygonOffsetFactor = -1;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = 'shadePools'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.raycast = () => {};
    this.mesh.visible = false;
    this.dirty = true;
  }

  /** How far on lamp `lamp` is (0…1, the mains included). */
  set(lamp, k) {
    if (!this.mesh || !this.k.has(lamp) || Math.abs(this.k.get(lamp) - k) < 1e-3) return;
    this.k.set(lamp, k); this.dirty = true;
  }

  /** After a frame's set() calls: re-seat moved lamps' quads and upload the brightness. */
  commit() {
    const m = this.mesh;
    if (!m) return;
    const pos = m.geometry.attributes.position, col = m.geometry.attributes.color;
    let any = false;
    this.items.forEach((l, i) => {
      const key = `${l.pos.x.toFixed(3)},${l.pos.y.toFixed(3)},${l.pos.z.toFixed(3)}`;
      if (this.seen.get(l) !== key) {
        this.seen.set(l, key); this.dirty = true;
        const { x, z } = l.pos, [rf] = l.shade.pool.floor ?? [0], [rc] = l.shade.pool.ceiling ?? [0];
        const fy = this.floorAt(l.level) + 0.012, cy = this.ceilingAt(l.level, x, z) - 0.012;
        [[rf, fy], [rc, cy]].forEach(([r, y], s) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], j) => pos.setXYZ((i * 2 + s) * 4 + j, x + u * r, y, z + v * r)));
        pos.needsUpdate = true;
      }
      const c = new THREE.Color(l.color), k = this.k.get(l);
      [l.shade.pool.floor, l.shade.pool.ceiling].forEach((p, s) => {
        const peak = p ? p[1] * k : 0;
        for (let j = 0; j < 4; j++) col.setXYZ((i * 2 + s) * 4 + j, c.r * peak, c.g * peak, c.b * peak);
      });
      if (k > 0.001) any = true;
    });
    if (this.dirty) { col.needsUpdate = true; this.dirty = false; }
    m.visible = any;
  }
}
