import * as THREE from 'three';
import { PLAYROOM as R } from './config.js';
import { POSTER_WALLS } from './posterlayout.js';

// #2027: SPEL's hexagon acoustic/LED panels, LED line patterns and corner floor lamps. Pure geometry in local room metres (x east, z south), returned as
// { geometry, color } pairs: src/playroomposters.js merges them into its one unlit vertex-coloured mesh, so they cost no extra draw and no light.
const L = R.posters.leds;

/** The dimensions of one cluster: cell centres (a, y, key) on the wall, from its row strings. */
export function hexCells(cluster, H = L.hex) {
  const pitch = Math.sqrt(3) * H.r + H.gap, rowPitch = 1.5 * H.r + H.gap * Math.sqrt(3) / 2, n = cluster.rows.length, cells = [];
  cluster.rows.forEach((row, j) => [...row].forEach((key, i) => cells.push({ a: cluster.x + (i - (row.length - 1) / 2) * pitch, y: cluster.y + ((n - 1) / 2 - j) * rowPitch, key })));
  return cells;
}

const place = (g, W, a, y, d) => { // a geometry built facing +z at the origin → on wall `W` at (along a, height y), `d` out from the plane
  if (W.n < 0) g.rotateY(Math.PI);
  return g.translate(a, y, W.plane + W.n * d);
};
const prep = (g) => g.index ? g.toNonIndexed() : g;

/** Every piece as { geometry, color }. All are static. */
export function clubhouseLedPieces() {
  const out = [], H = L.hex, W = POSTER_WALLS[H.wall], add = (geometry, color) => out.push({ geometry: prep(geometry), color: new THREE.Color(color) });
  for (const c of L.clusters) for (const { a, y, key } of hexCells(c)) {
    // an acoustic slab (a 6-sided prism, pointy side up), its lighter face and, for a glowing cell, two stacked emissive faces (bright core on a coloured field)
    const slab = new THREE.CylinderGeometry(H.r, H.r, H.depth, 6, 1, true).rotateX(Math.PI / 2);
    place(slab, W, a, y, H.depth / 2); add(slab, H.side);
    const cap = (r) => new THREE.CircleGeometry(r, 6).rotateZ(Math.PI / 6);
    const col = key === 'x' ? null : new THREE.Color(H.colors[key]);
    add(place(cap(H.r), W, a, y, H.depth + .001), col ? col.clone().multiplyScalar(H.halo) : H.face); // a glowing cell's frame carries a dim wash of its colour
    if (!col) continue;
    add(place(cap(H.r * H.inset), W, a, y, H.depth + H.glowDepth), col);
    add(place(cap(H.r * H.core), W, a, y, H.depth + H.glowDepth + .002), col.clone().lerp(new THREE.Color(0xffffff), .55));
  }
  const N = L.lines, NW = POSTER_WALLS[N.wall];
  for (const ch of N.chains) {
    const dx = (ch.x1 - ch.x0) / (ch.n * 2), pts = [];
    for (let i = 0; i <= ch.n * 2; i++) pts.push([ch.x0 + i * dx, N.y + (i % 2 ? N.amp : -N.amp)]);
    // two zigzags mirrored about the centre line make a chain of diamonds
    for (const s of [1, -1]) for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], my = N.y;
      const y0 = my + s * (ay - my), y1 = my + s * (by - my), len = Math.hypot(bx - ax, y1 - y0);
      const g = new THREE.PlaneGeometry(len + N.w * .6, N.w).rotateZ(Math.atan2(y1 - y0, bx - ax));
      add(place(g, NW, (ax + bx) / 2, (y0 + y1) / 2, N.off), ch.color);
    }
  }
  const P = L.lamp;
  for (const l of L.lamps) {
    add(new THREE.CylinderGeometry(P.rBase, P.rBase, P.baseH, 14).translate(l.x, P.baseH / 2, l.z), 0x15161e);
    add(new THREE.CylinderGeometry(P.rTube * 2.2, P.rTube * 2.2, .06, 8).translate(l.x, P.baseH + .03, l.z), 0x15161e);
    add(new THREE.CylinderGeometry(P.rTube, P.rTube, P.h, 8, 1, true).translate(l.x, P.baseH + P.h / 2, l.z), l.color);
  }
  return out;
}
