import * as THREE from 'three';
import { SITE } from './config.js';

// The old Sankt Lars hospital brick style (#1529 for Sankt Lars väg 41, shared with the other old pavilions in #1556):
// warm red-orange brick over a white rendered plinth, white mullioned windows under segmental or round arches, corbel
// friezes under the eaves and belt courses. Colours are read from the user's photos of nr 41
// (docs/foton/stlars41-*.jpg). Everything is written into the southbackdrop facade / roof / glass batches as one
// geometry each per building: no extra draw calls, textures or lights.

export const BRICK_STYLE = {
  brick: 0x924530,      // warm red-orange brick (photos)
  brickDark: 0x7a3a28,  // arch heads, blind niches
  frieze: 0x833d2b,     // corbel friezes and belt courses
  plinth: 0xe6e3dc,     // white rendered plinth
  basement: 0xc3c8c4,   // glass-block basement windows
  frame: 0xf2f1ec,      // white window frames and mullions
  door: 0x2f4a45,       // dark green double doors
  pipe: 0x3b3f43,       // downpipes, chimney caps
};
export const rgb = hex => new THREE.Color(hex).toArray();

/**
 * Geometry buffers and face helpers. `W(u, v, y)` maps a building's local plan metres to the world, `dir(nu, nv)` a
 * local horizontal direction to a world one (both the identity for world-aligned faces).
 */
export function brickKit(W = (u, v, y) => [u, y, v], dir = (nu, nv) => [nu, 0, nv]) {
  const F = { pos: [], nrm: [], col: [] }, G = { pos: [], nrm: [] }, R = { pos: [], nrm: [] };
  // #1614: every triangle is wound so its geometric normal agrees with the explicit one. The batches are DoubleSide and
  // three flips the normal of a back face, so a triangle wound against `n` was lit as if it faced the other way (the
  // pavilions' walls and nr 41's faces, chimney caps and roof slopes lit from the shade side). Face lines may run either
  // way round a footprint, so the order follows the normal instead of each caller's direction convention.
  const tri = (B, a, c, d, n, col) => {
    const e = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], f = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    if ((e[1] * f[2] - e[2] * f[1]) * n[0] + (e[2] * f[0] - e[0] * f[2]) * n[1] + (e[0] * f[1] - e[1] * f[0]) * n[2] < 0) [c, d] = [d, c];
    for (const q of [a, c, d]) { B.pos.push(...q); B.nrm.push(...n); if (col) B.col.push(...col); }
  };
  const quad = (B, a, c, d, e, n, col) => { tri(B, a, c, d, n, col); tri(B, a, d, e, n, col); };
  const upTri = (a, c, d) => { // roof triangle, its normal turned upwards (and its winding with it, #1614)
    const n = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
    if (n.y < 0) n.negate();
    tri(R, a, c, d, n.toArray());
  };
  // A face: the local line (u0, v0) -> (u1, v1) with outward local normal (nu, nv). s runs along it, y is the height,
  // t the offset outwards.
  const face = (u0, v0, u1, v1, nu, nv) => {
    const len = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / len, dv = (v1 - v0) / len, n = dir(nu, nv);
    const at = (s, y, t = 0) => W(u0 + du * s + nu * t, v0 + dv * s + nv * t, y);
    return {
      u0, v0, du, dv, nu, nv, len, at,
      rect(s0, s1, y0, y1, t, col, B = F) { quad(B, at(s0, y0, t), at(s1, y0, t), at(s1, y1, t), at(s0, y1, t), n, col); },
      arch(sc, half, y, rise, t, col, B = F, seg = 6) { // a circular segment on top of y, `rise` high and 2*half wide
        const r = (half * half + rise * rise) / (2 * rise), cy = y + rise - r, a0 = Math.asin(Math.min(1, half / r));
        const pt = a => at(sc + r * Math.sin(a), Math.max(y, cy + r * Math.cos(a)), t);
        for (let i = 0; i < seg; i++) tri(B, at(sc, y, t), pt(-a0 + 2 * a0 * i / seg), pt(-a0 + 2 * a0 * (i + 1) / seg), n, col);
      },
      // A window-shaped pentagon: a rectangle s0..s1, y0..y1 with a shallow point `rise` above its middle (3 triangles).
      peaked(s0, s1, y0, y1, rise, t, col, B = F) {
        const sc = (s0 + s1) / 2, top = at(sc, y1 + rise, t);
        tri(B, at(s0, y0, t), at(s1, y0, t), at(s1, y1, t), n, col); tri(B, at(s0, y0, t), at(s1, y1, t), top, n, col); tri(B, at(s0, y0, t), top, at(s0, y1, t), n, col);
      },
      under(s0, s1, y, t0, t1, col) { quad(F, at(s0, y, t1), at(s1, y, t1), at(s1, y, t0), at(s0, y, t0), [0, -1, 0], col); },
    };
  };
  const geom = (B, colour) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
    if (colour) g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    return g;
  };
  /** Push the non-empty buffers into the southbackdrop batches. */
  const flush = parts => { if (F.pos.length) parts.facade.push(geom(F, true)); if (R.pos.length) parts.roof.push(geom(R)); if (G.pos.length) parts.glass.push(geom(G)); };
  return { F, G, R, tri, quad, upTri, face, geom, flush };
}

/**
 * The style's wall elements on a kit: `plinthTop` is the plinth's top, `floorY(k)` storey k's floor, `overhang` the
 * eave projection the main frieze follows.
 */
export function brickFacade(kit, { plinthTop, floorY, overhang }) {
  const C = BRICK_STYLE, brick = rgb(C.brick), dark = rgb(C.brickDark), frieze = rgb(C.frieze), plinth = rgb(C.plinth), frame = rgb(C.frame);
  const { F, G } = kit;
  // A wall: white plinth from yLo to plinthTop, brick above it up to yTop.
  const wall = (f, s0, s1, yLo, yTop) => {
    if (yLo < plinthTop) f.rect(s0, s1, yLo, Math.min(plinthTop, yTop), 0, plinth);
    if (yTop > plinthTop) f.rect(s0, s1, Math.max(yLo, plinthTop), yTop, 0, brick);
  };
  // A projecting band (front + underside); its ends run past s0/s1 by the projection, so corners close.
  const band = (f, s0, s1, yTop, h, proj, col) => { f.rect(s0 - proj, s1 + proj, yTop - h, yTop, proj, col); if (proj > 0.1) f.under(s0 - proj, s1 + proj, yTop - h, 0, proj, col); }; // thin belts: no underside
  const eaveFrieze = (f, s0, s1, y) => { band(f, s0, s1, y, 0.18, overhang * 0.6, frieze); band(f, s0, s1, y - 0.18, 0.32, 0.16, dark); };
  const beltCourses = (f, s0, s1, n) => { band(f, s0, s1, plinthTop + 0.1, 0.12, 0.06, plinth); for (let k = 1; k < n; k++) band(f, s0, s1, floorY(k) + 0.55, 0.16, 0.08, frieze); };
  // Windows: 'seg' segmental head, 'round' round head, 'blind' bricked-up niche, 'pair' two seg lights side by side.
  const opening = (f, s, y0, w, h, kind) => {
    if (kind === 'pair') { opening(f, s - w * 0.58, y0, w, h, 'seg'); opening(f, s + w * 0.58, y0, w, h, 'seg'); return; }
    const round = kind === 'round', rise = round ? w / 2 : 0.18, y1 = y0 + h - rise, seg = round ? 5 : 2;
    f.arch(s, w / 2 + 0.2, y1, rise + 0.22, 0.012, dark, F, seg); // brick arch head
    if (kind === 'blind') { f.rect(s - w / 2, s + w / 2, y0, y1, 0.012, dark); return; }
    f.rect(s - w / 2 - 0.06, s + w / 2 + 0.06, y0 - 0.06, y1, 0.02, frame);
    f.arch(s, w / 2 + 0.06, y1, rise + 0.03, 0.02, frame, F, seg);
    f.rect(s - w / 2 + 0.06, s + w / 2 - 0.06, y0 + 0.04, y1, 0.03, null, G);
    f.arch(s, w / 2 - 0.06, y1, Math.max(0.05, rise - 0.06), 0.03, null, G, seg);
    f.rect(s - 0.035, s + 0.035, y0 + 0.04, y1 + rise - 0.08, 0.045, frame); // mullion
    const yt = y0 + (y1 - y0) * 0.68; f.rect(s - w / 2 + 0.06, s + w / 2 - 0.06, yt, yt + 0.07, 0.045, frame); // transom
    f.rect(s - w / 2 - 0.1, s + w / 2 + 0.1, y0 - 0.12, y0 - 0.04, 0.05, frame); // sill
  };
  // The far version of a 'seg' window for backdrop pavilions (#1556): a white frame and a dark pane, both pentagons with
  // the segmental head's shallow point (6 triangles, against 26 for `opening`).
  const farWindow = (f, s, y0, w, h, rise, edge) => {
    f.peaked(s - w / 2 - edge, s + w / 2 + edge, y0 - edge, y0 + h - rise, rise + edge, 0.02, frame);
    f.peaked(s - w / 2 + edge, s + w / 2 - edge, y0 + edge, y0 + h - rise, rise - edge, 0.03, null, G);
  };
  return { wall, band, eaveFrieze, beltCourses, opening, farWindow };
}

/**
 * #1556: an old pavilion of the southern backdrop in nr 41's style on its own OSM footprint, keeping its storeys, eave
 * and roof (drawn by southbackdrop, which also closes the wall tops up to the roof line). `edge(a, c, sign)` writes one
 * footprint edge's plinth and brick wall, eave frieze, belt courses and far windows (the generic far-facade rhythm: every
 * SITE.south.bay along the face, every storey); `flush(parts)` adds the building to the batches as one geometry each.
 */
export function brickPavilion(b, base, bottom, eave, ctx = {}) {
  const S = SITE.south, P = S.brickStyle, E = S.brickEntrance, kit = brickKit();
  const fac = brickFacade(kit, { plinthTop: base + P.plinth, floorY: k => base + k * S.storey, overhang: P.frieze / 0.6 });
  const frieze = rgb(BRICK_STYLE.frieze), dark = rgb(BRICK_STYLE.brickDark), frameCol = rgb(BRICK_STYLE.frame), doorCol = rgb(BRICK_STYLE.door), plinthCol = rgb(BRICK_STYLE.plinth), pipe = rgb(BRICK_STYLE.pipe);
  const ground = ctx.ground ?? (() => base), entrances = planEntrances(b, ctx.streets ?? [], E), byEdge = new Map(entrances.map(e => [e.key, e]));
  let skippedWindows = 0;
  // #1722: a simple entrance on a face: white frame, dark double door, a flat canopy and steps down to the ground. Written into
  // the facade batch only (no glass, no new geometry per batch).
  const entrance = (f, s) => {
    const w = E.w, h = E.h, y1 = base + h, t = 0.03;
    f.rect(s - w / 2 - E.frame, s + w / 2 + E.frame, base, y1 + E.frame, 0.02, frameCol);
    f.rect(s - w / 2, s + w / 2, base, y1, t, doorCol);
    f.rect(s - 0.025, s + 0.025, base, y1, t + 0.01, pipe); // the leaves' meeting line
    const cw = w / 2 + E.canopy.side, cy = y1 + E.canopy.lift;
    f.rect(s - cw, s + cw, cy - E.canopy.t, cy, E.canopy.out, frameCol);
    f.under(s - cw, s + cw, cy - E.canopy.t, 0, E.canopy.out, frameCol);
    kit.quad(kit.F, f.at(s - cw, cy, 0), f.at(s + cw, cy, 0), f.at(s + cw, cy, E.canopy.out), f.at(s - cw, cy, E.canopy.out), [0, 1, 0], frameCol);
    // steps: each box from its own top down to the ground below it; the top one is the landing at the door's sill
    const sw = w / 2 + E.side, lowAt = (s0, s1, t0, t1) => Math.min(...[[s0, t0], [s1, t0], [s0, t1], [s1, t1]].map(([ss, tt]) => { const q = f.at(ss, 0, tt); return ground(q[0], q[2]); }));
    const depth = i => E.landing + i * E.tread, drop = Math.max(0, base - lowAt(s - sw, s + sw, 0, depth(E.maxSteps - 1)));
    const n = Math.max(1, Math.min(E.maxSteps, Math.ceil(drop / E.rise))), h1 = Math.max(drop, 0.12) / n;
    for (let i = 0; i < n; i++) {
      const top = base - i * h1, d = depth(i), lo = Math.min(lowAt(s - sw, s + sw, 0, d), top - h1) - 0.05, col = i === 0 ? plinthCol : frameCol;
      const [a0, a1, b0, b1] = [s - sw, s + sw, 0, d], dd = [f.du, 0, f.dv];
      kit.quad(kit.F, f.at(a0, top, b0), f.at(a1, top, b0), f.at(a1, top, b1), f.at(a0, top, b1), [0, 1, 0], col);
      f.rect(a0, a1, lo, top, b1, col);
      kit.quad(kit.F, f.at(a0, lo, b0), f.at(a0, lo, b1), f.at(a0, top, b1), f.at(a0, top, b0), dd.map(v => -v), col);
      kit.quad(kit.F, f.at(a1, lo, b0), f.at(a1, lo, b1), f.at(a1, top, b1), f.at(a1, top, b0), dd, col);
    }
    return n;
  };
  return {
    entrances, get skippedWindows() { return skippedWindows; },
    edge(a, c, sign) {
      const dx = c[0] - a[0], dz = c[1] - a[1], d = Math.hypot(dx, dz);
      if (d < 1e-6) return;
      const f = kit.face(a[0], a[1], c[0], c[1], sign * dz / d, -sign * dx / d), door = byEdge.get(a[0] + ',' + a[1]);
      fac.wall(f, 0, d, bottom, eave);
      fac.band(f, 0, d, eave, 0.18, P.frieze, frieze); // corbel frieze under the eave
      fac.band(f, 0, d, eave - 0.18, 0.3, 0.06, dark);
      for (const k of P.belts) if (k < b.levels) fac.band(f, 0, d, base + k * S.storey + P.beltLift, 0.16, 0.08, frieze);
      if (door) door.steps = entrance(f, door.s);
      for (let k = 1; k * S.bay + S.window[0] / 2 < d; k++) for (let floor = 0; floor < b.levels; floor++) {
        if (door && floor === 0 && Math.abs(k * S.bay - door.s) < E.w / 2 + S.window[0] / 2 + E.clear) { skippedWindows++; continue; } // the door stands where a ground-floor window would
        fac.farWindow(f, k * S.bay, base + floor * S.storey + S.sill, S.window[0], S.window[1], P.rise, P.frame);
      }
    },
    flush: parts => kit.flush(parts),
  };
}

/**
 * #1722: where a pavilion's entrances stand (*guess*: no entrance nodes in the repo's OSM data). On the outer ring, the faces of at
 * least `E.minEdge` m that look towards the nearest street (`streets`: polylines of Sankt Lars väg, the service ways and paths,
 * within `E.reach` m); the nearest one gets an entrance, a second face another when it is nearly as close and `E.apart` m from
 * the first. The door stands where the street's nearest point projects onto the face, `E.margin` m from its ends at the least.
 * Returns [{ key, a, c, s, dist }]; `key` identifies the face's start corner for `edge()`.
 */
export function planEntrances(b, streets, E = SITE.south.brickEntrance) {
  const p = b.polygon.slice(0, -1), sign = Math.sign(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0));
  const nearest = m => { let best = { d: Infinity }; for (const l of streets) for (let i = 0; i < l.length - 1; i++) {
    const [ax, az] = l[i], dx = l[i + 1][0] - ax, dz = l[i + 1][1] - az, t = Math.max(0, Math.min(1, ((m[0] - ax) * dx + (m[1] - az) * dz) / (dx * dx + dz * dz || 1))), q = [ax + t * dx, az + t * dz], d = Math.hypot(m[0] - q[0], m[1] - q[1]);
    if (d < best.d) best = { d, q }; } return best; };
  const cands = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], d = Math.hypot(dx, dz);
    if (d < E.minEdge) continue;
    const nx = sign * dz / d, nz = -sign * dx / d, mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], near = nearest(mid);
    if (!(near.d <= E.reach) || ((near.q[0] - mid[0]) * nx + (near.q[1] - mid[1]) * nz) / (near.d || 1) < 0.5) continue;
    const s = Math.max(E.margin, Math.min(d - E.margin, ((near.q[0] - a[0]) * dx + (near.q[1] - a[1]) * dz) / d));
    cands.push({ key: a[0] + ',' + a[1], a, c, s, dist: near.d, at: [a[0] + dx / d * s, a[1] + dz / d * s] });
  }
  cands.sort((x, y) => x.dist - y.dist);
  const out = cands.slice(0, 1);
  for (const q of cands.slice(1)) if (out.length < E.max && q.dist <= out[0].dist * E.second && Math.hypot(q.at[0] - out[0].at[0], q.at[1] - out[0].at[1]) >= E.apart) out.push(q);
  return out;
}
