import * as THREE from 'three';

// Sankt Lars väg 41 (#1117, rebuilt from the user's photos in #1529: docs/foton/stlars41-hornvy-41a.jpg and
// docs/foton/stlars41-fasad-41b-entre.jpg). The OSM outline (way 145221569) is kept: a 28.2 x 24.3 m main block with a
// 13.0 x 6.1 m wing on its SE long side. Main block 3 storeys over a white rendered plinth, the wing 2 storeys with its own
// eave, a narrow stair tower rising above the eaves on the SE face beside the wing (entrance 41A) and centred on the SW
// face (entrance 41B), low hipped dark-grey roofs with brick chimneys, corbel friezes under every eave, belt courses, white
// mullioned windows under segmental or round arches and blind niches. All metre values come from the SITE.south record
// (`model`, every one *guess*); colours are read from the photos. Everything is pushed into the southbackdrop facade / roof /
// glass batches as one geometry each: no extra draw calls, textures or lights.

const BRICK = 0x924530;      // warm red-orange brick (photos)
const BRICK_DARK = 0x7a3a28; // arch heads, blind niches
const FRIEZE = 0x833d2b;     // corbel friezes and belt courses
const PLINTH = 0xe6e3dc;     // white rendered plinth
const BASEMENT = 0xc3c8c4;   // glass-block basement windows
const FRAME = 0xf2f1ec;      // white window frames and mullions
const DOOR = 0x2f4a45;       // dark green double doors
const PIPE = 0x3b3f43;       // downpipes, chimney caps

const rgb = hex => new THREE.Color(hex).toArray();

/** Build Sankt Lars väg 41; returns `eave` and `roofY(x, z)` (the drawn roof's height, for the walkable roof, #1294). */
export function buildStLars41(b, p, base, bottom, parts) {
  const M = b.model, T = M.tower;
  const origin = p[0], L = Math.hypot(p[1][0] - origin[0], p[1][1] - origin[1]);
  const ux = (p[1][0] - origin[0]) / L, uz = (p[1][1] - origin[1]) / L, vx = -uz, vz = ux;
  const local = (x, z) => [(x - origin[0]) * ux + (z - origin[1]) * uz, (x - origin[0]) * vx + (z - origin[1]) * vz];
  const lp = p.map(q => local(...q));
  // Outline in local metres (u along the NW face, v towards the SE): main block [0, L] x [0, D], wing [w0, w1] x [D, Dw].
  const D = lp[2][1], w0 = lp[5][0], w1 = lp[4][0], Dw = lp[4][1];
  const W = (u, v, y) => [origin[0] + u * ux + v * vx, y, origin[1] + u * uz + v * vz];

  const plinthTop = base + M.plinth, S = M.storey;
  const floorY = k => plinthTop + k * S;
  const eave = floorY(3) + M.frieze, wingEave = floorY(M.wingLevels) + M.wingEaveLift, towerEave = eave + T.extra;

  const F = { pos: [], nrm: [], col: [] }, G = { pos: [], nrm: [] }, R = { pos: [], nrm: [] };
  const tri = (B, a, c, d, n, col) => { for (const q of [a, c, d]) { B.pos.push(...q); B.nrm.push(...n); if (col) B.col.push(...col); } };
  const quad = (B, a, c, d, e, n, col) => { tri(B, a, c, d, n, col); tri(B, a, d, e, n, col); };
  const upTri = (a, c, d) => { // roof triangle, its normal turned upwards
    const n = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
    if (n.y < 0) n.negate();
    tri(R, a, c, d, n.toArray());
  };

  // A face: the local line (u0, v0) -> (u1, v1) with outward local normal (nu, nv). s runs along it, y is the height,
  // t the offset outwards.
  const face = (u0, v0, u1, v1, nu, nv) => {
    const len = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / len, dv = (v1 - v0) / len, n = [nu * ux + nv * vx, 0, nu * uz + nv * vz];
    const at = (s, y, t = 0) => W(u0 + du * s + nu * t, v0 + dv * s + nv * t, y);
    return {
      u0, v0, du, dv, nu, nv, len, at,
      rect(s0, s1, y0, y1, t, col, B = F) { quad(B, at(s0, y0, t), at(s1, y0, t), at(s1, y1, t), at(s0, y1, t), n, col); },
      arch(sc, half, y, rise, t, col, B = F, seg = 6) { // a circular segment on top of y, `rise` high and 2*half wide
        const r = (half * half + rise * rise) / (2 * rise), cy = y + rise - r, a0 = Math.asin(Math.min(1, half / r));
        const pt = a => at(sc + r * Math.sin(a), Math.max(y, cy + r * Math.cos(a)), t);
        for (let i = 0; i < seg; i++) tri(B, at(sc, y, t), pt(-a0 + 2 * a0 * i / seg), pt(-a0 + 2 * a0 * (i + 1) / seg), n, col);
      },
      under(s0, s1, y, t0, t1, col) { quad(F, at(s0, y, t1), at(s1, y, t1), at(s1, y, t0), at(s0, y, t0), [0, -1, 0], col); },
    };
  };
  const brick = rgb(BRICK), dark = rgb(BRICK_DARK), frieze = rgb(FRIEZE), plinth = rgb(PLINTH), basement = rgb(BASEMENT), frame = rgb(FRAME), door = rgb(DOOR), pipe = rgb(PIPE);

  // A wall: white plinth from yLo to plinthTop, brick above it up to yTop.
  const wall = (f, s0, s1, yLo, yTop) => {
    if (yLo < plinthTop) f.rect(s0, s1, yLo, Math.min(plinthTop, yTop), 0, plinth);
    if (yTop > plinthTop) f.rect(s0, s1, Math.max(yLo, plinthTop), yTop, 0, brick);
  };
  // A projecting band (front + underside); its ends run past s0/s1 by the projection, so corners close.
  const band = (f, s0, s1, yTop, h, proj, col) => { f.rect(s0 - proj, s1 + proj, yTop - h, yTop, proj, col); if (proj > 0.1) f.under(s0 - proj, s1 + proj, yTop - h, 0, proj, col); }; // thin belts: no underside
  const eaveFrieze = (f, s0, s1, y) => { band(f, s0, s1, y, 0.18, M.overhang * 0.6, frieze); band(f, s0, s1, y - 0.18, 0.32, 0.16, dark); };
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
  const doorway = (f, s, w) => { // arched green double door with a fanlight, its foot at the ground
    const y1 = base + 2.3;
    f.rect(s - w / 2, s + w / 2, bottom, y1, 0.03, door);
    f.arch(s, w / 2 + 0.22, y1, w / 2 + 0.22, 0.012, dark, F, 6);
    f.arch(s, w / 2, y1, w / 2, 0.03, null, G, 6);
    f.rect(s - 0.03, s + 0.03, base + 0.1, y1, 0.04, pipe);
  };
  const basementWindow = (f, s) => f.rect(s - 0.4, s + 0.4, base + 0.2, base + 0.75, 0.02, basement);
  const downpipe = (f, s, yTop) => f.rect(s - 0.06, s + 0.06, bottom, yTop, 0.12, pipe);
  // Rows of openings: `perStorey[k]` lists [s, kind, width?] for storey k (from floorY(k)).
  const rows = (f, perStorey) => perStorey.forEach((cols, k) => cols.forEach(([s, kind, w = 1.15]) => {
    const h = (k === 2 ? 1.95 : 2.25) + (kind === 'round' ? w / 2 - 0.2 : 0);
    opening(f, s, floorY(k) + 0.85, w, h, kind);
    if (k === 0) basementWindow(f, s);
  }));

  // Stair tower on face f at s: proud by T.proj, T.depth into the block, up to towerEave; lights at the half-landings,
  // the entrance at its foot, friezes all round and a low pyramid cap.
  const tower = (f, s) => {
    const s0 = s - T.w / 2, s1 = s + T.w / 2, P = (q, t) => [f.u0 + f.du * q + f.nu * t, f.v0 + f.dv * q + f.nv * t];
    const a = P(s0, T.proj), c = P(s1, T.proj), d = P(s1, -T.depth), e = P(s0, -T.depth);
    const front = face(...a, ...c, f.nu, f.nv), right = face(...c, ...d, f.du, f.dv), back = face(...d, ...e, -f.nu, -f.nv), left = face(...e, ...a, -f.du, -f.dv);
    wall(front, 0, T.w, bottom, towerEave);
    wall(right, 0, T.proj, bottom, towerEave); right.rect(T.proj, T.proj + T.depth, eave - 0.3, towerEave, 0, brick);
    wall(left, T.depth, T.depth + T.proj, bottom, towerEave); left.rect(0, T.depth, eave - 0.3, towerEave, 0, brick);
    back.rect(0, T.w, eave - 0.3, towerEave, 0, brick);
    for (const [k, h] of [[0, 1.9], [1, 1.9], [2, 1.3]]) opening(front, T.w / 2, floorY(k + 1) + 0.2 - (k === 2 ? 0.25 : 0), 0.9, h, 'pair');
    doorway(front, T.w / 2, 1.5);
    beltCourses(front, 0, T.w, 0);
    eaveFrieze(front, 0, T.w, towerEave); eaveFrieze(right, 0, T.proj + T.depth, towerEave); eaveFrieze(back, 0, T.w, towerEave); eaveFrieze(left, 0, T.proj + T.depth, towerEave);
    const o = M.overhang * 0.6, Q = [front.at(-o, towerEave, o), front.at(T.w + o, towerEave, o), back.at(-o, towerEave, o), back.at(T.w + o, towerEave, o)];
    const top = W(...P(s, (T.proj - T.depth) / 2), towerEave + T.rise);
    for (let i = 0; i < 4; i++) upTri(Q[i], Q[(i + 1) % 4], top);
    const box = [Math.min(a[0], d[0]) - o, Math.max(a[0], d[0]) + o, Math.min(a[1], d[1]) - o, Math.max(a[1], d[1]) + o]; // the cap, overhang included
    return { s0, s1, box };
  };

  // Hipped roof over a local rectangle (overhang included): eave height y, the ridge `rise` higher. Returns its height.
  const hip = (a0, a1, b0, b1, y, rise) => {
    const h = Math.min(a1 - a0, b1 - b0) / 2, alongU = a1 - a0 >= b1 - b0, am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    const c = [W(a0, b0, y), W(a1, b0, y), W(a1, b1, y), W(a0, b1, y)];
    const r0 = alongU ? W(a0 + h, bm, y + rise) : W(am, b0 + h, y + rise), r1 = alongU ? W(a1 - h, bm, y + rise) : W(am, b1 - h, y + rise);
    if (alongU) { upTri(c[0], c[1], r1); upTri(c[0], r1, r0); upTri(c[2], c[3], r0); upTri(c[2], r0, r1); upTri(c[1], c[2], r1); upTri(c[3], c[0], r0); }
    else { upTri(c[1], c[2], r1); upTri(c[1], r1, r0); upTri(c[3], c[0], r0); upTri(c[3], r0, r1); upTri(c[0], c[1], r0); upTri(c[2], c[3], r1); }
    return (u, v) => (u < a0 || u > a1 || v < b0 || v > b1) ? -Infinity : y + rise * Math.min(1, Math.min(u - a0, a1 - u, v - b0, b1 - v) / h);
  };

  // Faces (outward normals): NW v=0, NE u=L, SE v=D, SW u=0; the wing's SW, SE and NE faces.
  const NW = face(0, 0, L, 0, 0, -1), NE = face(L, 0, L, D, 1, 0), SE = face(0, D, L, D, 0, 1), SW = face(0, 0, 0, D, -1, 0);
  const wSW = face(w0, D, w0, Dw, -1, 0), wSE = face(w0, Dw, w1, Dw, 0, 1), wNE = face(w1, D, w1, Dw, 1, 0);

  wall(NW, 0, L, bottom, eave); wall(NE, 0, D, bottom, eave); wall(SW, 0, D, bottom, eave);
  wall(SE, 0, w0, bottom, eave); wall(SE, w1, L, bottom, eave); SE.rect(w0, w1, wingEave - 0.4, eave, 0, brick); // above the wing roof
  wall(wSW, 0, Dw - D, bottom, wingEave); wall(wSE, 0, w1 - w0, bottom, wingEave); wall(wNE, 0, Dw - D, bottom, wingEave);

  const tSW = tower(SW, M.towerSW), tSE = tower(SE, M.towerSE); // 41B centred on the SW face, 41A beside the wing

  // Friezes and belt courses, broken where a tower stands.
  const around = (s0, s1, t) => (t ? [[s0, t.s0], [t.s1, s1]] : [[s0, s1]]).filter(([a, c]) => c > a);
  for (const [f, len, t] of [[NW, L], [NE, D], [SW, D, tSW], [SE, L, tSE]]) for (const [a, c] of around(0, len, t)) eaveFrieze(f, a, c, eave);
  for (const [f, s0, s1, t] of [[NW, 0, L], [NE, 0, D], [SW, 0, D, tSW], [SE, 0, w0, tSE], [SE, w1, L]]) for (const [a, c] of around(s0, s1, t)) beltCourses(f, a, c, 3);
  for (const [f, len] of [[wSW, Dw - D], [wSE, w1 - w0], [wNE, Dw - D]]) { eaveFrieze(f, 0, len, wingEave); beltCourses(f, 0, len, 2); }

  // Openings: the rhythm read from the photos where a face is seen; the unseen NW street face repeats a plain one (*guess*).
  const repeat = (cols, n = 3) => Array.from({ length: n }, () => cols);
  rows(NW, repeat(Array.from({ length: 8 }, (_, k) => [1.9 + k * (L - 3.8) / 7, 'seg'])));
  // SW (photo 2, from the car park): the NW flank left of the 41B tower, the SE flank right of it.
  const ts = M.towerSW;
  rows(SW, repeat([[1.9, 'seg'], [3.9, 'blind'], [5.9, 'seg'], [8.4, 'seg', 1.6], [ts + 3.0, 'blind'], [ts + 5.9, 'seg'], [ts + 7.5, 'seg'], [ts + 9.1, 'seg']]));
  // NE (photo 1, right): round-arched windows; an arcade of narrow round lights on the top floor.
  const ne = [2.6, 7.0, 12.15, 17.3, 21.7].map(s => [s, 'round', 1.3]);
  rows(NE, [ne, ne, Array.from({ length: 10 }, (_, k) => [1.6 + k * (D - 3.2) / 9, 'round', 0.62])]);
  // SE (photo 1): a column left of the 41A tower; right of the wing a wide round-arched window, paired lights on the top
  // floor; the main block's top floor above the wing roof.
  const seLow = [[1.4, 'seg', 1.0], [w1 + 3.5, 'round', 1.6]];
  rows(SE, [seLow, seLow, [[1.4, 'seg', 1.0], ...[2.2, 5.0, w1 - w0 - 5.0, w1 - w0 - 2.2].map(s => [w0 + s, 'round', 1.0]), [w1 + 2.6, 'round', 0.95], [w1 + 4.5, 'round', 0.95]]]);
  // Wing (photo 1): window, window, blind, window on its front; narrow round lights on its returns.
  rows(wSE, repeat([[1.5, 'seg', 1.25], [4.9, 'seg', 1.25], [7.5, 'blind', 1.25], [10.1, 'seg', 1.25]], 2));
  const wingSide = repeat([[1.3, 'round', 0.7], [3.05, 'round', 0.7], [4.8, 'round', 0.7]], 2);
  rows(wSW, wingSide); rows(wNE, wingSide);

  for (const [f, s, y] of [[SW, 0.25, eave], [SW, D - 0.25, eave], [SW, tSW.s0 - 0.2, eave], [SE, tSE.s1 + 0.1, eave], [SE, L - 0.25, eave], [NE, 0.25, eave], [wSE, 0.2, wingEave], [wSE, w1 - w0 - 0.2, wingEave]]) downpipe(f, s, y);

  // Roofs: the main block's and the wing's low hips, the towers' caps.
  const ov = M.overhang, mainRoof = hip(-ov, L + ov, -ov, D + ov, eave, b.rise), wingRoof = hip(w0 - ov, w1 + ov, D - 1.2, Dw + ov, wingEave, M.wingRise);
  const towerRoof = (u, v) => {
    for (const [u0, u1, v0, v1] of [tSW.box, tSE.box]) if (u >= u0 && u <= u1 && v >= v0 && v <= v1) // a pyramid: four triangles up to the apex
      return towerEave + T.rise * (1 - Math.max(Math.abs(u - (u0 + u1) / 2) / ((u1 - u0) / 2), Math.abs(v - (v0 + v1) / 2) / ((v1 - v0) / 2)));
    return -Infinity;
  };
  const roofAt = (u, v) => Math.max(towerRoof(u, v), mainRoof(u, v), wingRoof(u, v));

  // Brick chimneys standing on the main roof's slopes (their foot below the slope at every corner).
  for (const [cu, cv] of M.chimneys) {
    const hw = 0.38, hd = 0.5, foot = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => mainRoof(cu + a * hw, cv + c * hd))) - 0.1, top = eave + b.rise + 0.9;
    for (const f of [face(cu - hw, cv - hd, cu + hw, cv - hd, 0, -1), face(cu + hw, cv - hd, cu + hw, cv + hd, 1, 0), face(cu + hw, cv + hd, cu - hw, cv + hd, 0, 1), face(cu - hw, cv + hd, cu - hw, cv - hd, -1, 0)]) {
      f.rect(0, f.len, foot, top, 0, brick); band(f, 0, f.len, top - 0.15, 0.2, 0.06, frieze);
    }
    quad(F, W(cu - hw - 0.08, cv - hd - 0.08, top), W(cu + hw + 0.08, cv - hd - 0.08, top), W(cu + hw + 0.08, cv + hd + 0.08, top), W(cu - hw - 0.08, cv + hd + 0.08, top), [0, 1, 0], pipe);
  }

  const geom = (B, colour) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
    if (colour) g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    return g;
  };
  parts.facade.push(geom(F, true)); parts.roof.push(geom(R)); parts.glass.push(geom(G));

  return {
    eave,
    roofY: (x, z) => roofAt(...local(x, z)), // the drawn roof's height (#1294); -Infinity outside the roofs
    stlars41: { L, D, w0, w1, Dw, plinthTop, storey: S, eave, wingEave, towerEave, ridge: eave + b.rise, chimneys: M.chimneys, roofAt, mainRoof, local, triangles: { facade: F.pos.length / 9, roof: R.pos.length / 9, glass: G.pos.length / 9 } },
  };
}
