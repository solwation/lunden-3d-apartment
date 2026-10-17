import * as THREE from 'three';
import { freeCanvasAfterUpload } from './lowmemory.js';
import { AO } from './config.js';

// Baked ambient occlusion: soft darkening of floors (and ceilings) along walls and fixed
// cabinets, from a distance field over the plan. Drawn as one multiply-blended overlay plane
// per surface, so it works on parquet and tiles alike and costs a single draw call.

const CELL = 0.025;

/** Distance (m) from every cell to the nearest blocker, two-pass chamfer transform. */
function distanceField(nx, nz, rects) {
  const INF = 1e9, d = new Float32Array(nx * nz).fill(INF);
  for (const r of rects) {
    const i0 = Math.max(0, Math.floor(r.x0 / CELL)), i1 = Math.min(nx - 1, Math.ceil(r.x1 / CELL) - 1);
    const k0 = Math.max(0, Math.floor(r.z0 / CELL)), k1 = Math.min(nz - 1, Math.ceil(r.z1 / CELL) - 1);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) d[k * nx + i] = 0;
  }
  const a = 1, b = Math.SQRT2;
  const relax = (c, n, w) => { if (d[n] + w < d[c]) d[c] = d[n] + w; };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = k * nx + i;
    if (i > 0) relax(c, c - 1, a);
    if (k > 0) {
      relax(c, c - nx, a);
      if (i > 0) relax(c, c - nx - 1, b);
      if (i < nx - 1) relax(c, c - nx + 1, b);
    }
  }
  for (let k = nz - 1; k >= 0; k--) for (let i = nx - 1; i >= 0; i--) {
    const c = k * nx + i;
    if (i < nx - 1) relax(c, c + 1, a);
    if (k < nz - 1) {
      relax(c, c + nx, a);
      if (i < nx - 1) relax(c, c + nx + 1, b);
      if (i > 0) relax(c, c + nx - 1, b);
    }
  }
  for (let c = 0; c < d.length; c++) d[c] *= CELL;
  return d;
}

function aoTexture(size, rects, strength, radius, hole) {
  const nx = Math.ceil(size.x / CELL), nz = Math.ceil(size.z / CELL);
  const dist = distanceField(nx, nz, rects);
  const c = document.createElement('canvas');
  c.width = nx; c.height = nz;
  const g = c.getContext('2d');
  const img = g.createImageData(nx, nz);
  for (let i = 0; i < dist.length; i++) {
    // inside a blocker the overlay is hidden anyway; keep it neutral there
    const x = ((i % nx) + 0.5) * CELL, z = (Math.floor(i / nx) + 0.5) * CELL;
    const inHole = hole && x > hole.x0 && x < hole.x1 && z > hole.z0 && z < hole.z1;
    const v = dist[i] === 0 || inHole ? 255 : 255 * (1 - strength * Math.exp(-dist[i] / radius));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = freeCanvasAfterUpload(new THREE.CanvasTexture(c)); // drawn once (#628)
  tex.colorSpace = THREE.SRGBColorSpace; // round-trips, so the blend multiplies by the canvas value
  return tex;
}

const multiply = (map) => new THREE.MeshBasicMaterial({
  map, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

/**
 * Overlays for one level. floorRects block the floor (walls, cabinets), ceilRects the ceiling
 * (walls only). The holes (stair opening) are left neutral.
 */
export function buildAO(size, y0, yC, floorRects, ceilRects, { floorHole, ceilHole } = {}) {
  const group = new THREE.Group();
  for (const [rects, y, down, s, hole] of [
    [floorRects, y0 + 0.007, false, AO.floor, floorHole], [ceilRects, yC - 0.007, true, AO.ceiling, ceilHole],
  ]) {
    const geo = new THREE.PlaneGeometry(size.x, size.z);
    geo.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    // canvas row 0 = z 0 (north); keep the texture unflipped and map u = x / W, v = z / D
    const tex = aoTexture(size, rects, s.strength, s.radius, hole);
    tex.flipY = false;
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / size.x + 0.5, p.getZ(i) / size.z + 0.5);
    geo.translate(size.x / 2, y, size.z / 2);
    const mesh = new THREE.Mesh(geo, multiply(tex));
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}

// Wall overlays (#1074): soft bands where a wall meets the floor and the ceiling, and down
// inner (concave) corners where two walls meet. The darkening is computed per fragment from
// distances carried in a vertex attribute, so one merged mesh per level covers every wall.

const STEP = 0.025; // m between exposure samples along a wall face
const NEAR = 0.01; // m in front of a face where "is something there?" is asked

function insidePoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const rectPts = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];

const wallMaterial = () => new THREE.ShaderMaterial({
  uniforms: {
    uFloor: { value: new THREE.Vector2(AO.wall.floor.strength, AO.wall.floor.radius) },
    uCeil: { value: new THREE.Vector2(AO.wall.ceiling.strength, AO.wall.ceiling.radius) },
    uCorner: { value: new THREE.Vector2(AO.wall.corner.strength, AO.wall.corner.radius) },
  },
  vertexShader: `
    attribute vec4 aDist;
    varying vec4 vDist;
    void main() {
      vDist = aDist;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  // v is the "canvas value" of the floor/ceiling overlays; decode it like their sRGB texture
  // and re-encode at the output, so both kinds of overlay multiply the frame the same way.
  fragmentShader: `
    uniform vec2 uFloor, uCeil, uCorner;
    varying vec4 vDist;
    float occ(vec2 s, float d) { return 1.0 - s.x * exp(-max(d, 0.0) / s.y); }
    void main() {
      float v = occ(uFloor, vDist.x) * occ(uCeil, vDist.y) * occ(uCorner, vDist.z) * occ(uCorner, vDist.w);
      vec3 c = vec3(v);
      c = mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045))));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, fog: false, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

/**
 * One overlay mesh for the walls of a level between floor y0 and ceiling yC.
 * `pieces` = wall solids [{ pts: footprint polygon, y0, y1 }] (full-height walls, the infill
 * under/over windows, door lintels); `blockers` = footprint polygons that fill the plan
 * (walls, window openings). A face gets an overlay only where the plan in front of it is
 * open room inside `size`, so faces against other walls, façades and window reveals stay
 * bare; door openings, glass and mirrors are never covered (objects in front hide it).
 * No floor band over `floorHole`, no ceiling band under `ceilHole` (the stair opening).
 * Pieces that stop short of the floor or ceiling (door lintels, window infills) also block the plan,
 * but only over their own height: the jambs of a door opening get no overlay where the lintel fills
 * the opening above them, which the overlay's polygon offset otherwise pulled through the lintel's
 * face as dark stripes above the doors (#1129). Where a partial piece's face runs over a wall's end,
 * only the wall's face gets the overlay, so the strip is not darkened twice.
 */
export function buildWallAO(size, y0, yC, pieces, blockers, { floorHole, ceilHole } = {}) {
  const S = AO.wall, FAR = 100;
  const cutF = S.floor.radius * S.cutoff, cutC = S.ceiling.radius * S.cutoff, cutK = S.corner.radius * S.cutoff;
  const bbox = (pts) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { pts, x0, x1, z0, z1 };
  };
  const boxes = blockers.map(bbox);
  // partial-height pieces (lintels, window infills) block only between their own y0 and y1 (#1129)
  const isPartial = (p) => p.y0 > y0 + 0.005 || p.y1 < yC - 0.005;
  const partial = pieces.filter(isPartial).map((p) => ({ ...bbox(p.pts), y0: p.y0, y1: p.y1, src: p }));
  // full-height pieces (walls): where a partial piece's face runs over one of them (a lintel across the end of a
  // wall block, L1007's Sovrum 2 door), the wall's own face carries the overlay; twice would darken that strip twice
  const full = pieces.filter((p) => !isPartial(p)).map((p) => bbox(p.pts));
  const hit = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && insidePoly(b.pts, x, z);
  let slab = []; // the partial pieces that fill the height band being built
  const blocked = (x, z) => x < 0 || z < 0 || x > size.x || z > size.z
    || boxes.some((b) => hit(b, x, z)) || slab.some((b) => hit(b, x, z));
  const pos = [], dist = [];
  let flipped = false; // the face's room side is the left normal (-uz, ux) of its edge, or the right one
  const quad = (ax, az, ux, uz, s0, s1, ya, yb, k0, k1) => {
    // corners of [s0,s1] × [ya,yb] on the face; k0/k1 = distance-to-corner offsets (FAR = no corner)
    const vs = [[s0, ya], [s1, ya], [s1, yb], [s0, yb]];
    const v = vs.map(([s, y]) => [ax + ux * s, y, az + uz * s, y - y0, yC - y, k0 === null ? FAR : s - k0, k1 === null ? FAR : k1 - s]);
    // wound to face the room (front faces only): the order 0-1-2 faces (-uz, ux); either polygon orientation (#1084)
    for (const i of flipped ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) { const p = v[i]; pos.push(p[0], p[1], p[2]); dist.push(p[3], p[4], p[5], p[6]); }
  };
  for (const piece of pieces) {
    const pts = piece.pts;
    const pa = Math.max(piece.y0, y0), pb = Math.min(piece.y1, yC);
    if (pb - pa < 0.01) continue;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.02) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      // the room side: the normal whose near point is outside this piece
      let nx = -uz, nz = ux;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      flipped = insidePoly(pts, mx + nx * NEAR, mz + nz * NEAR);
      if (flipped) { nx = -nx; nz = -nz; }
      // the face in height bands split where a partial piece in front of it starts or stops
      const fx0 = Math.min(ax, bx) - 2 * NEAR, fx1 = Math.max(ax, bx) + 2 * NEAR;
      const fz0 = Math.min(az, bz) - 2 * NEAR, fz1 = Math.max(az, bz) + 2 * NEAR;
      const near = partial.filter((b) => b.src !== piece && b.x1 >= fx0 && b.x0 <= fx1 && b.z1 >= fz0 && b.z0 <= fz1);
      const cuts = [pa, pb];
      for (const b of near) for (const y of [b.y0, b.y1]) if (y > pa + 0.01 && y < pb - 0.01) cuts.push(y);
      cuts.sort((a, b) => a - b);
      for (let c = 0; c + 1 < cuts.length; c++) {
        const ya = cuts[c], yb = cuts[c + 1];
        if (yb - ya < 0.01) continue;
        const ym = (ya + yb) / 2;
        slab = near.filter((b) => b.y0 <= ym && b.y1 >= ym);
        const open = (s) => !blocked(ax + ux * s + nx * NEAR, az + uz * s + nz * NEAR)
          && (!isPartial(piece) || !full.some((b) => hit(b, ax + ux * s - nx * NEAR / 2, az + uz * s - nz * NEAR / 2)));
        // exposed runs along the face, ends refined to the exact edge of what blocks them
        const n = Math.max(1, Math.round(len / STEP));
        const refine = (lo, hi) => { // open at lo, blocked at hi (either order along the face)
          for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (open(m)) lo = m; else hi = m; }
          return (lo + hi) / 2;
        };
        let run = null;
        const flush = (end) => {
          if (!run) return;
          const s0 = run.s0, s1 = end;
          run = null;
          if (s1 - s0 < 0.02) return;
          // an end is an inner corner when a wall stands just in front of the face past it
          const corner = (s, dir) => blocked(ax + ux * (s + dir * 0.02) + nx * 0.02, az + uz * (s + dir * 0.02) + nz * 0.02);
          const k0 = corner(s0, -1) ? s0 : null, k1 = corner(s1, 1) ? s1 : null;
          const ax2 = ax + nx * 0.001, az2 = az + nz * 0.001;
          // only where some term is visible: floor band, ceiling band, corner columns between them
          const fTop = Math.min(yb, y0 + cutF), cBot = Math.max(ya, yC - cutC);
          // [s0,s1] minus where the line just in front of the face crosses a hole
          const minus = (hole) => {
            if (!hole) return [[s0, s1]];
            let t0 = s0, t1 = s1;
            for (const [p, d, lo, hi] of [[ax + nx * NEAR, ux, hole.x0, hole.x1], [az + nz * NEAR, uz, hole.z0, hole.z1]]) {
              if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return [[s0, s1]]; continue; }
              const a = (lo - p) / d, b = (hi - p) / d;
              t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
            }
            if (t1 <= t0) return [[s0, s1]];
            return [[s0, t0], [t1, s1]].filter(([a, b]) => b - a > 0.005);
          };
          if (fTop > ya) for (const [a, b] of minus(floorHole)) quad(ax2, az2, ux, uz, a, b, ya, Math.min(fTop, yb), k0, k1);
          if (cBot < yb) for (const [a, b] of minus(ceilHole)) quad(ax2, az2, ux, uz, a, b, Math.max(cBot, ya, fTop), yb, k0, k1);
          const m0 = Math.max(ya, fTop), m1 = Math.min(yb, cBot);
          if (m1 > m0) {
            const c0 = k0 === null ? null : Math.min(s1, s0 + cutK), c1 = k1 === null ? null : Math.max(s0, s1 - cutK);
            if (c0 !== null && c1 !== null && c0 >= c1) quad(ax2, az2, ux, uz, s0, s1, m0, m1, k0, k1);
            else {
              if (c0 !== null) quad(ax2, az2, ux, uz, s0, c0, m0, m1, k0, k1);
              if (c1 !== null) quad(ax2, az2, ux, uz, c1, s1, m0, m1, k0, k1);
            }
          }
        };
        let prev = 0, prevOpen = false;
        for (let j = 0; j < n; j++) {
          const s = (j + 0.5) * (len / n);
          const o = open(s);
          if (o && !prevOpen) run = { s0: j === 0 ? 0 : refine(s, prev) };
          else if (!o && prevOpen) flush(refine(prev, s));
          prev = s; prevOpen = o;
        }
        if (run) flush(len, false);
      }
      slab = [];
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 4));
  const mesh = new THREE.Mesh(geo, wallMaterial());
  mesh.renderOrder = 1;
  mesh.name = 'wall-ao';
  return mesh;
}

