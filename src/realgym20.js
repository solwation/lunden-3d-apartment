import * as THREE from 'three';

// Realgymnasiet, Sankt Lars väg 20: the long brick building south of HepCat Store on the east side of the road (#127/#261,
// the old `longhouse`; OSM way 130681301 since #535), rebuilt from the user's photos in #1532
// (docs/foton/skolbyggnad-fran-brofastet.jpg from the road bridge, docs/foton/skolbyggnad-real-nr20-hepcat-bakom.jpg).
// The OSM outline is kept: an L of an 18.2 m wide west leg along the road and an 18 m deep south leg towards the bridge.
// It is read as three volumes: on the SW corner a gable house (one tall storey, steep black standing-seam roof, its gable
// with large windows and a window in the peak facing the car park and the bridge), the long one-storey range north of it
// along the road (same eave, a lower black roof with dormers, a row of narrow tall windows) and east of the gable house a
// taller hall (two high storeys of very tall windows, a steep grey standing-seam roof gabled to the west with a round
// window and hipped to the east, a chimney and a ridge vent). A brick stair tower with its own small gable rises over
// the eave between the gable house and the range. All metre values come from the SITE.east record's `model`, every one
// *guess*; colours are read from the photos. Everything is pushed into the east backdrop's existing facade / roof /
// glass batches as one geometry each: no extra draw calls, textures or lights.

const BRICK = 0xd8a08c;   // multiplies the shared brick texture: the photos' muted red brick
const PLINTH = 0x6a625c;  // dark plinth
const DARK = 0x26292b;    // window frames, the black covers over the windows, downpipes
const GLASS = 0x3a4a52;   // dark window glass

/** Build Sankt Lars väg 20; returns `eave`, `ridge`, `windows` and `roofY(x, z)` (the drawn roof's height, #1294). */
export function buildRealgym20(b, p, base, bottom, parts, ground = null) {
  const M = b.model;
  // Local frame: origin the SW corner, a along the south face (east), b northwards along the west face.
  const iSW = p.reduce((k, q, i) => (q[1] - q[0] > p[k][1] - p[k][0] ? i : k), 0), O = p[iSW];
  const iSE = p.reduce((k, q, i) => (q[0] + q[1] > p[k][0] + p[k][1] ? i : k), 0);
  const L0 = Math.hypot(p[iSE][0] - O[0], p[iSE][1] - O[1]), ux = (p[iSE][0] - O[0]) / L0, uz = (p[iSE][1] - O[1]) / L0, vx = uz, vz = -ux;
  const local = (x, z) => [(x - O[0]) * ux + (z - O[1]) * uz, (x - O[0]) * vx + (z - O[1]) * vz];
  const W = (a, bb, y) => [O[0] + a * ux + bb * vx, y, O[1] + a * uz + bb * vz];
  const lp = p.map(q => local(...q));
  // The idealised outline (local metres): leg a in [0, AW], b in [0, BN]; hall a in [AW, AE], b in [0, BH].
  const inner = lp.reduce((k, q, i) => (Math.abs(q[0] - 18) + Math.abs(q[1] - 18) < Math.abs(lp[k][0] - 18) + Math.abs(lp[k][1] - 18) ? i : k), 0);
  const AW = lp[inner][0], BH = lp[inner][1], AE = Math.max(...lp.map(q => q[0])), BN = Math.max(...lp.map(q => q[1]));
  // The floor: the ground along the south front (the car park and the bridge side); the outline's highest corner (`base`) lies
  // up the slope at the range's north end, where the windows follow the rising ground instead (`minSill`).
  const groundAt = ground ?? (() => base);
  base = Math.max(...[O, p[iSE], p[inner]].map(q => groundAt(...q)));
  const G = M.gable, R = M.range, H = M.hall, ov = M.overhang;
  const EG = base + G.eave, ER = base + G.eave, EH = base + H.eave, GL = G.length;
  const sG = G.rise / (AW / 2), sR = R.rise / (AW / 2), sH = H.rise / (BH / 2);
  // Roof heights of the three volumes (local), extended over their overhangs.
  const hG = (a) => EG + G.rise - sG * Math.abs(a - AW / 2);
  const hR = (a) => ER + R.rise - sR * Math.abs(a - AW / 2);
  const hH = (a, bb) => EH + sH * Math.min(BH / 2 - Math.abs(bb - BH / 2), AE - a);
  const mainRoof = (a, bb) => {
    let y = -Infinity;
    if (a > -ov - 1e-6 && a < AW + 1e-6 && bb > -ov - 1e-6 && bb < GL + 1e-6) y = Math.max(y, hG(a));
    if (a > -ov - 1e-6 && a < AW + ov + 1e-6 && bb > GL - 1e-6 && bb < BN + ov + 1e-6) y = Math.max(y, hR(a));
    if (a > AW - ov - 1e-6 && a < AE + ov + 1e-6 && bb > -ov - 1e-6 && bb < BH + ov + 1e-6) y = Math.max(y, hH(a, bb));
    return y;
  };

  const F = { pos: [], nrm: [], col: [] }, Gl = { pos: [], nrm: [], col: [] }, Rf = { pos: [], nrm: [] };
  const rgb = hex => new THREE.Color(hex).toArray();
  const cBrick = rgb(BRICK), cPlinth = rgb(PLINTH), cDark = rgb(DARK), cGlass = rgb(GLASS);
  const tri = (B, q, n, col) => { for (const v of q) { B.pos.push(...v); B.nrm.push(...n); if (col) B.col.push(...col); } };
  const normalOf = (a, c, d) => new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize().toArray();
  const quad = (B, a, c, d, e, n, col) => { tri(B, [a, c, d], n, col); tri(B, [a, d, e], n, col); };
  // A roof face: a convex local polygon [[a, b], ...] at height h(a, b); its normal turned upwards.
  const roofFace = (poly, h, B = Rf) => {
    const v = poly.map(([a, bb]) => W(a, bb, h(a, bb)));
    for (let i = 1; i < v.length - 1; i++) {
      let q = [v[0], v[i], v[i + 1]], n = normalOf(...q);
      if (n[1] < 0) { q = [v[0], v[i + 1], v[i]]; n = n.map(x => -x); }
      tri(B, q, n);
    }
  };
  // Raised parts on the roofs (tower cap, dormers, chimney, vents): local boxes with their own height, for roofY.
  const extras = [];
  const roofAt = (a, bb) => extras.reduce((y, e) => (a > e.box[0] - 1e-3 && a < e.box[1] + 1e-3 && bb > e.box[2] - 1e-3 && bb < e.box[3] + 1e-3 ? Math.max(y, e.h(a, bb)) : y), mainRoof(a, bb));

  // A wall face along the local line (a0, b0) -> (a1, b1) with outward local normal (na, nb): s along it, y up, t outwards.
  const face = (a0, b0, a1, b1, na, nb) => {
    const len = Math.hypot(a1 - a0, b1 - b0), da = (a1 - a0) / len, db = (b1 - b0) / len, n = [na * ux + nb * vx, 0, na * uz + nb * vz];
    const at = (s, y, t = 0) => W(a0 + da * s + na * t, b0 + db * s + nb * t, y);
    return {
      len, at, n,
      rect(s0, s1, y0, y1, t, col, B = F) { quad(B, at(s0, y0, t), at(s1, y0, t), at(s1, y1, t), at(s0, y1, t), n, col); },
      gable(s0, s1, y0, y1, t, col, B = F) { tri(B, [at(s0, y0, t), at(s1, y0, t), at((s0 + s1) / 2, y1, t)], n, col); },
      box(s0, s1, y0, y1, t0, t1, col, B) { // a small block standing out of the face (covers, downpipes, the tower): front, sides, top
        quad(B, at(s0, y0, t1), at(s1, y0, t1), at(s1, y1, t1), at(s0, y1, t1), n, col);
        for (const [s, sg] of [[s0, -1], [s1, 1]]) { const A = at(s, y0, t0), Bq = at(s, y0, t1), C = at(s, y1, t1), D = at(s, y1, t0), d = at(s + sg, 0, 0), o = at(s, 0, 0); quad(B, A, Bq, C, D, [d[0] - o[0], 0, d[2] - o[2]], col); }
        quad(B, at(s0, y1, t0), at(s1, y1, t0), at(s1, y1, t1), at(s0, y1, t1), [0, 1, 0], col);
      },
    };
  };
  const windows = [];
  // A window: dark frame, glass, optionally a black cover over its top (`cover` m), a transom rail and a sill.
  const windowAt = (f, s, sill, head, width, edge, opts = {}) => {
    const c0 = f.at(s, 0, 0), lift = Math.max(0, groundAt(c0[0], c0[2]) + M.minSill - (base + sill)), cap = opts.cap ?? Infinity;
    const fr = M.frame, y0 = base + sill + lift, y1 = Math.min(base + head + lift, cap);
    f.rect(s - width / 2 - fr, s + width / 2 + fr, y0 - fr, y1 + fr, 0.02, cDark, Gl);
    const top = opts.cover ? y1 - opts.cover : y1;
    f.rect(s - width / 2, s + width / 2, y0, top, 0.035, cGlass, Gl);
    if (opts.cover) f.box(s - width / 2 - fr, s + width / 2 + fr, top, y1 + fr, 0, 0.12, cDark, Gl);
    if (opts.transom) f.rect(s - width / 2, s + width / 2, base + lift + opts.transom - .05, base + lift + opts.transom + .05, 0.045, cDark, Gl);
    f.box(s - width / 2 - .08, s + width / 2 + .08, y0 - .08, y0 - fr, 0, 0.1, cDark, Gl);
    const c = f.at(s, (y0 + top) / 2, 0.035);
    windows.push({ x: c[0], y: (y0 + top) / 2 - .09, z: c[2], n: [f.n[0], f.n[2]], width, height: top - y0, edge });
  };
  const row = (f, s0, s1, step, fn) => { const n = Math.max(1, Math.floor((s1 - s0) / step) + 1), w = (n - 1) * step, c = (s0 + s1) / 2; for (let k = 0; k < n; k++) fn(c - w / 2 + k * step); };
  const plinth = (f, s0, s1) => { // a dark band over the ground along the wall, cut where the ground bends
    const n = Math.max(1, Math.ceil((s1 - s0) / 3)), y = s => { const q = f.at(s, 0, 0); return groundAt(q[0], q[2]) + M.plinth; };
    for (let k = 0; k < n; k++) { const a = s0 + (s1 - s0) * k / n, c = s0 + (s1 - s0) * (k + 1) / n; quad(F, f.at(a, bottom, .03), f.at(c, bottom, .03), f.at(c, y(c), .03), f.at(a, y(a), .03), f.n, cPlinth); }
  };

  // Outer walls along the real outline (exact OSM vertices), up to each volume's eave.
  const v = (i) => lp[(iSW + i) % lp.length]; // walk from the SW corner: SE, hall NE, inner corner, leg NE, NW
  const order = lp.map((_, i) => v(i));
  const ccw = order.reduce((s, q, i) => { const r = order[(i + 1) % order.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) > 0;
  for (let i = 0; i < order.length; i++) {
    const A = order[i], B = order[(i + 1) % order.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (len < .3) continue;
    const na = (ccw ? 1 : -1) * (B[1] - A[1]) / len, nb = (ccw ? -1 : 1) * (B[0] - A[0]) / len, f = face(A[0], A[1], B[0], B[1], na, nb);
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    plinth(f, 0, len);
    if (Math.abs(nb + 1) < .1) { // the south front: gable house, then the hall
      const split = AW - A[0];
      f.rect(0, split, bottom, EG, 0, cBrick); f.gable(0, split, EG, EG + G.rise, 0, cBrick);
      f.rect(split, len, bottom, EH, 0, cBrick);
      for (const s of G.southWindows) windowAt(f, s, G.window.sill, G.window.head, G.window.width, 'gable-south', { cover: G.window.cover });
      windowAt(f, split / 2, G.peak.sill, G.peak.head, G.peak.width, 'gable-peak');
      row(f, split + H.margin, len - H.margin, H.bay, s => windowAt(f, s, H.window.sill, H.window.head, H.window.width, 'hall-south', { transom: H.window.transom }));
      f.box(split - .5, split - .38, bottom, EG, 0, .12, cDark, Gl);
    } else if (mid[0] > AW + 1 && Math.abs(na - 1) < .1) { // the hall's hipped east end
      f.rect(0, len, bottom, EH, 0, cBrick);
      row(f, H.margin, len - H.margin, H.bay, s => windowAt(f, s, H.window.sill, H.window.head, H.window.width, 'hall-east', { transom: H.window.transom }));
    } else if (mid[0] > AW + 1) { // the hall's north side, towards the yard
      f.rect(0, len, bottom, EH, 0, cBrick);
      row(f, H.margin, len - H.margin, H.bay, s => windowAt(f, s, H.window.sill, H.window.head, H.window.width, 'hall-north', { transom: H.window.transom }));
    } else if (Math.abs(na - 1) < .1) { // the range's east side
      f.rect(0, len, bottom, ER, 0, cBrick);
      row(f, 1.5, len - 1.5, R.bay, s => windowAt(f, s, R.window.sill, R.window.head, R.window.width, 'range-east', { cover: R.window.cover, cap: ER - .35 }));
    } else if (Math.abs(nb - 1) < .1) { // the range's north gable towards HepCat
      f.rect(0, len, bottom, ER, 0, cBrick); f.gable(0, len, ER, ER + R.rise, 0, cBrick);
      row(f, 3, len - 3, 3.0, s => windowAt(f, s, R.window.sill, R.window.head, R.window.width, 'range-north', { cover: R.window.cover, cap: ER - .35 }));
    } else { // the west front along the road: the gable house's side, the stair tower, the range
      f.rect(0, len, bottom, EG, 0, cBrick);
      const sOf = bb => (A[1] - bb); // runs north to south: s grows southwards
      for (const bb of G.westWindows) windowAt(f, sOf(bb), G.window.sill, G.window.head, G.window.width, 'gable-west', { cover: G.window.cover });
      const T = M.tower, t0 = sOf(T.b + T.width / 2);
      row(f, sOf(BN - 1.5), sOf(T.b + T.width / 2 + 1.6), R.bay, s => windowAt(f, s, R.window.sill, R.window.head, R.window.width, 'range-west', { cover: R.window.cover, cap: ER - .35 }));
      for (const bb of M.downpipes) f.box(sOf(bb) - .06, sOf(bb) + .06, bottom, EG, 0, .12, cDark, Gl);
      // The stair tower: a brick block proud of the front, above the eave, with its own small gable roof running back into the roof.
      const ty = EG + T.extra, s0 = t0, s1 = t0 + T.width;
      f.box(s0, s1, bottom, ty, 0, T.proj, cBrick, F);
      const aTop = (ty - EG) / sG, ridge = ty + T.rise, back = (ridge - EG) / sG; // where the tower's top and ridge meet the main roof (local a)
      const bA = A[1] - s0, bB = A[1] - s1, bm = (bA + bB) / 2, hw = T.width / 2 + .25, drop = T.rise / (T.width / 2);
      const fr = face(-T.proj, bA, -T.proj, bB, -1, 0);
      fr.gable(0, T.width, ty, ridge, 0, cBrick);
      plinth(fr, 0, T.width);
      windowAt(fr, T.width / 2, G.eave + T.window.sill, G.eave + T.window.head, T.window.width, 'tower');
      for (const [bb, sign] of [[bA, 1], [bB, -1]]) { const sf = face(0, bb, aTop, bb, 0, sign); tri(F, [sf.at(0, EG), sf.at(0, ty), sf.at(sf.len, ty)], sf.n, cBrick); }
      const tRoof = (a, bb) => ridge - drop * Math.abs(bb - bm);
      for (const e of [bA + .25, bB - .25]) roofFace([[-T.proj - .25, e], [back, e], [back, bm], [-T.proj - .25, bm]], tRoof);
      extras.push({ box: [-T.proj - .25, back, bB - .25, bA + .25], h: tRoof });
      // The glazed dormer beside the tower on the gable house's west slope.
      dormer(M.gableDormer, hG, 'glass');
    }
  }
  // Walls inside the outline that show above a lower roof: the gable house's north gable over the range, the hall's west wall.
  { const f = face(0, GL, AW, GL, 0, 1);
    quad(F, f.at(0, EG), f.at(AW / 2, ER + R.rise), f.at(AW / 2, EG + G.rise), f.at(0, EG), f.n, cBrick);
    quad(F, f.at(AW / 2, ER + R.rise), f.at(AW, EG), f.at(AW, EG), f.at(AW / 2, EG + G.rise), f.n, cBrick); }
  { const f = face(AW, BH, AW, 0, -1, 0);
    f.rect(0, BH, EG, EH, 0, cBrick); f.gable(0, BH, EH, EH + H.rise, 0, cBrick);
    // the round window high in the west gable
    const c = f.at(BH / 2, EH + H.rise * H.roundAt, 0.03), r = H.round, seg = 12;
    for (const [rad, out, col] of [[r + M.frame * 2, 0.02, cDark], [r, 0.035, cGlass]]) for (let i = 0; i < seg; i++) {
      const a0 = 2 * Math.PI * i / seg, a1 = 2 * Math.PI * (i + 1) / seg, P = (ang) => f.at(BH / 2 + rad * Math.cos(ang), c[1] + rad * Math.sin(ang), out);
      tri(Gl, [f.at(BH / 2, c[1], out), P(a0), P(a1)], f.n, col);
    }
    windows.push({ x: c[0], y: c[1], z: c[2], n: [f.n[0], f.n[2]], width: r * 2, height: r * 2, edge: 'hall-round', round: true }); }

  // Roofs, all in the dark roof batch: the hall's grey seamed roof is drawn in the same dark grey, since the seamed schoolRoof
  // batch's bounds would grow over to here and stop being culled from the courtyard (+1 draw call, +11k triangles there).
  roofFace([[-ov, -ov], [AW / 2, -ov], [AW / 2, GL], [-ov, GL]], (a) => hG(a));
  roofFace([[AW / 2, -ov], [AW, -ov], [AW, GL], [AW / 2, GL]], (a) => hG(a));
  roofFace([[-ov, GL], [AW / 2, GL], [AW / 2, BN + ov], [-ov, BN + ov]], (a) => hR(a));
  roofFace([[AW / 2, GL], [AW, GL], [AW, BH], [AW / 2, BH]], (a) => hR(a));
  roofFace([[AW / 2, BH], [AW + ov, BH], [AW + ov, BN + ov], [AW / 2, BN + ov]], (a) => hR(a));
  const rEnd = AE - BH / 2;
  roofFace([[AW - ov, -ov], [AE + ov, -ov], [rEnd, BH / 2], [AW - ov, BH / 2]], hH);
  roofFace([[AW - ov, BH / 2], [rEnd, BH / 2], [AE + ov, BH + ov], [AW - ov, BH + ov]], hH);
  roofFace([[AE + ov, -ov], [AE + ov, BH + ov], [rEnd, BH / 2]], hH);
  // Dormers on the range's west slope: a broad one with a band of windows and small ones.
  function dormer(D, h, kind) {
    const a0 = D.a, b0 = D.b[0], b1 = D.b[1], yt = base + D.top, aBack = AW / 2 - (h(AW / 2) - yt) / (h === hG ? sG : sR), yb = h(a0);
    const f = face(a0, b1, a0, b0, -1, 0), wl = b1 - b0;
    if (kind === 'glass') f.rect(0, wl, yb, yt, 0, cDark, Gl);
    else {
      f.rect(0, wl, yb, yt, 0, cBrick);
      windowAt(f, wl / 2, yb + .25 - base, yt - .2 - base, wl - .8, 'dormer');
    }
    for (const [bb, sign] of [[b0, -1], [b1, 1]]) { const s = face(a0, bb, aBack, bb, 0, sign); tri(F, [s.at(0, yb), s.at(0, yt), s.at(s.len, yt)], s.n, cBrick); }
    roofFace([[a0 - .2, b0 - .2], [aBack, b0 - .2], [aBack, b1 + .2], [a0 - .2, b1 + .2]], () => yt + .12);
    extras.push({ box: [a0 - .2, aBack, b0 - .2, b1 + .2], h: () => yt + .12 });
  }
  for (const D of M.dormers) dormer(D, hR, 'brick');
  // Chimney and ridge vent on the hall, ventilation units on the gable house's east slope.
  const block = (a0, a1, b0, b1, y0, y1, col, B) => {
    const c = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
    for (let i = 0; i < 4; i++) { const [pa, pb] = c[i], [qa, qb] = c[(i + 1) % 4], A = W(pa, pb, y0), Bq = W(qa, qb, y0), C = W(qa, qb, y1), D = W(pa, pb, y1), m = W((pa + qa) / 2, (pb + qb) / 2, 0), o = W((a0 + a1) / 2, (b0 + b1) / 2, 0), l = Math.hypot(m[0] - o[0], m[2] - o[2]); quad(B, A, Bq, C, D, [(m[0] - o[0]) / l, 0, (m[2] - o[2]) / l], col); }
    const top = c.map(([a, bb]) => W(a, bb, y1)); quad(B, top[0], top[1], top[2], top[3], [0, 1, 0], col);
    extras.push({ box: [a0, a1, b0, b1], h: () => y1 });
  };
  const [ca, cb] = H.chimney, cy = hH(ca, cb);
  block(ca - .45, ca + .45, cb - .6, cb + .6, cy - .5, cy + M.chimneyHeight, cBrick, F);
  block(ca - .55, ca + .55, cb - .7, cb + .7, cy + M.chimneyHeight, cy + M.chimneyHeight + .12, null, Rf);
  const [va, vb] = H.vent, vy = hH(va, vb);
  block(va - .6, va + .6, vb - .6, vb + .6, vy - .3, vy + .7, null, Rf);
  block(va - .8, va + .8, vb - .8, vb + .8, vy + .7, vy + .85, null, Rf);
  // The ventilation units on the gable house's east slope, grey-dark like the roof (the roof batch has no vertex colours).
  for (const [a0, a1, b0, b1, ht] of M.vents) block(a0, a1, b0, b1, hG(a1) - .3, hG(a0) + ht, null, Rf);

  const geo = (B, keys) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
    if (keys.includes('color')) g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    if (keys.includes('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    return g;
  };
  parts.facade.push(geo(F, ['color']));
  parts.glass.push(geo(Gl, ['color']));
  parts.roof.push(geo(Rf, []));

  const roofY = (x, z) => roofAt(...local(x, z));
  return {
    base, eave: EH, ridge: EH + H.rise, windows, roofY,
    realgym20: { AW, AE, BH, BN, GL, EG, ER, EH, ridgeG: EG + G.rise, ridgeR: ER + R.rise, ridgeH: EH + H.rise, towerTop: EG + M.tower.extra + M.tower.rise, local, roofAt,
      triangles: { facade: F.pos.length / 9, glass: Gl.pos.length / 9, roof: Rf.pos.length / 9 } },
  };
}
