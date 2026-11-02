import * as THREE from 'three';
import { SITE } from './config.js';
// #1793: the low volumes Google 3D shows next to the old hospital pavilions and OSM does not map (SITE.south.annexes, all *guess*).
// Plain boxes / one gable prism each, pushed into the south backdrop's existing facade and roof batches: no draw call, no glass.
const tint = (g, hex) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const c = new THREE.Color(hex), a = []; for (let i = 0; i < g.attributes.position.count; i++) a.push(c.r, c.g, c.b); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g; };
const tri = pts => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); return g; };
const box = (w, h, d, x, y, z, yaw) => new THREE.BoxGeometry(w, h, d).rotateY(-yaw).translate(x, y, z);

/** The annexes' footprint polygons ([x, z] corners), e.g. to keep trees off them. */
export function annexPolygons() {
  return (SITE.south.annexes?.items ?? []).map(a => {
    const t = a.yaw * Math.PI / 180, ux = Math.cos(t), uz = Math.sin(t), [w, d] = a.size;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [a.c[0] + ux * i * w / 2 - uz * j * d / 2, a.c[1] + uz * i * w / 2 + ux * j * d / 2]);
  });
}

/** Pushes the annexes' wall and roof geometry (vertex coloured) into `parts.facade` / `parts.roof`. `ground(x, z)` is the terrain height. */
export function annexParts(ground, parts) {
  const A = SITE.south.annexes, polys = annexPolygons();
  A.items.forEach((a, n) => {
    const t = a.yaw * Math.PI / 180, ux = Math.cos(t), uz = Math.sin(t), [w, d] = a.size, ys = polys[n].map(q => ground(...q));
    const bottom = Math.min(...ys) - .1, eave = Math.min(...ys) + a.h, wall = a.brick ? A.brick : A.facade;
    parts.facade.push(tint(box(w, eave - bottom, d, a.c[0], (bottom + eave) / 2, a.c[1], t), wall));
    if (a.roof === 'gable') { // ridge along the long axis: two slopes and the two triangular gable ends
      const P = (i, j, y) => [a.c[0] + ux * i * w / 2 - uz * j * d / 2, y, a.c[1] + uz * i * w / 2 + ux * j * d / 2], top = eave + a.rise;
      const r = [[-1, 0], [1, 0]].map(([i]) => P(i, 0, top)), c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => P(i, j, eave));
      parts.roof.push(tint(tri([c[0], c[1], r[1], c[0], r[1], r[0], c[3], r[1], c[2], c[3], r[0], r[1]]), A.gableRoof));
      parts.facade.push(tint(tri([c[0], P(-1, 0, top), c[3], c[1], c[2], P(1, 0, top)]), wall));
    } else {
      parts.roof.push(tint(box(w + .3, .25, d + .3, a.c[0], eave + .12, a.c[1], t), A.roof));
      for (const [i, j, hw, hd, hh] of a.hoods ?? []) parts.roof.push(tint(box(hw, hh, hd, a.c[0] + ux * i - uz * j, eave + .25 + hh / 2, a.c[1] + uz * i + ux * j, t), A.hood));
    }
  });
}
