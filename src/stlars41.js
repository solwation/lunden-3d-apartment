import { BRICK_STYLE as C, rgb, brickKit, brickFacade } from './brickstyle.js';

// Sankt Lars väg 41 (#1117, rebuilt from the user's photos in #1529: docs/foton/stlars41-hornvy-41a.jpg and
// docs/foton/stlars41-fasad-41b-entre.jpg). The OSM outline (way 145221569) is kept: a 28.2 x 24.3 m main block with a
// 13.0 x 6.1 m wing on its SE long side. Main block 3 storeys over a white rendered plinth, the wing 2 storeys with its own
// eave, a narrow stair tower rising above the eaves on the SE face beside the wing (entrance 41A) and centred on the SW
// face (entrance 41B), low hipped dark-grey roofs with brick chimneys, corbel friezes under every eave, belt courses, white
// mullioned windows under segmental or round arches and blind niches. All metre values come from the SITE.south record
// (`model`, every one *guess*); colours are read from the photos. Everything is pushed into the southbackdrop facade / roof /
// glass batches as one geometry each: no extra draw calls, textures or lights.

// The facade vocabulary (colours, walls, friezes, belt courses, windows) is the shared old-hospital brick style in
// src/brickstyle.js (#1556), which the other old pavilions of the southern backdrop wear too.

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

  const kit = brickKit(W, (nu, nv) => [nu * ux + nv * vx, 0, nu * uz + nv * vz]), { F, G, R, quad, upTri, face } = kit;
  const brick = rgb(C.brick), dark = rgb(C.brickDark), frieze = rgb(C.frieze), basement = rgb(C.basement), door = rgb(C.door), pipe = rgb(C.pipe);

  const { wall, band, eaveFrieze, beltCourses, opening } = brickFacade(kit, { plinthTop, floorY, overhang: M.overhang });
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

  kit.flush(parts);

  return {
    eave,
    roofY: (x, z) => roofAt(...local(x, z)), // the drawn roof's height (#1294); -Infinity outside the roofs
    stlars41: { L, D, w0, w1, Dw, plinthTop, storey: S, eave, wingEave, towerEave, ridge: eave + b.rise, chimneys: M.chimneys, roofAt, mainRoof, local, triangles: { facade: F.pos.length / 9, roof: R.pos.length / 9, glass: G.pos.length / 9 } },
  };
}
