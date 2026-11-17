// #2048: the nose (src/avatarnose.js): its own triangle budget, a closed head skin round the finer grid, the Spider mask's exact
// flattening, the sliders without folds at every end, and the forms (narrow bridge, tip, underside with nostrils, wings).
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, avatarShape, AVATAR_SURFACE, AVATAR_NOSE as N, AVATAR_FACE as FACE, AVATAR_NOSE_FORMS as NF, decodeAvatarLook } from '../src/config.js';
import { bindAt } from '../src/olof.js';
import { contourRows } from '../src/avatarcontour.js';
import { noseTriangles, noseForms, noseHeight, noseMask, noseFormOffset, noseFormWeights, noseSlideOffset, noseNormalTurn } from '../src/avatarnose.js';
import { longHairTris } from '../src/avatarlonghair.js';
import { AVATAR_HAIR } from '../src/config.js';

// head-bone triangles (facePart 1 … 29) per variant before #2048 (37d922df, after the eyes #2045 and ears #2047)
const before = [['s0f0', 8524], ['s0f1', 9412], ['s0f3', 9488], ['s1f0', 9444], ['s2f0', 8860], ['s3f0', 9552], ['s4f0', 14140]];
const own = noseTriangles(contourRows(AVATAR_SURFACE.head, AVATAR_SURFACE.nosePatch.rings));
// #2053: long hair's locks grow the head on their own budget (tools/avatarlonghairtest.mjs), left out here
const long2053 = (style) => (style === 1 ? longHairTris(24) - 4 * 24 * AVATAR_HAIR.long.rows : 0);
const shell = (a, i) => a.facePart.getX(i) === 1 && a.rifleSkull.getX(i) === 1;

test('#2048 budget: the finer nose grid stays within +10 % of the head triangles', () => {
  for (const [key, tris] of before) {
    const style = +key[1], facial = +key[3], g = avatarModelGeometry({ ...avatarLook('nose'), style, facial, gender: style % 2 }), a = g.attributes;
    let head = 0, curl = 0; for (let i = 0; i < a.position.count; i += 3) { const f = a.facePart.getX(i); if (f > 0 && f < 30) head++; if (f === 7 && a.faceAnchor.getY(i) > 0.5 && a.faceAnchor.getZ(i) < 0.5) curl++; }
    head -= long2053(style);
    if (curl) head -= curl - 5040; // (#2054: the curl volumes in place of the #1377 tubes have their own budget, avatarcurlstest)
    assert.equal(head, tris + own, `${key}: ${head} head triangles = ${tris} + the nose's ${own}`);
    assert.ok(own <= tris * 0.1, `${key}: nose +${own} > ${tris}×0.1`);
    g.dispose();
  }
});

test('#2048 the head skin stays closed round the finer grid (every edge shared by two triangles)', () => {
  const g = avatarModelGeometry({ ...avatarLook('nose'), style: 0, facial: 0 }), a = g.attributes, p = a.position, edges = new Map();
  const key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e6)).join();
  let tris = 0;
  for (let i = 0; i < p.count; i += 3) {
    if (!shell(a, i)) continue; tris++;
    const k = [key(i), key(i + 1), key(i + 2)];
    for (let e = 0; e < 3; e++) { const ab = [k[e], k[(e + 1) % 3]].sort().join('|'); edges.set(ab, (edges.get(ab) || 0) + 1); }
  }
  const open = [...edges.values()].filter((n) => n !== 2).length;
  assert.ok(tris > 2000, 'the head shell');
  assert.equal(open, 0, `${open} edges not shared by exactly two triangles (a crack or T-junction)`);
  g.dispose();
});

test('#2048 noseBlend carries the height: the Spider mask flattens it exactly, nothing behind the face', () => {
  const g = avatarModelGeometry({ ...avatarLook('nose'), style: 0, facial: 0 }), a = g.attributes, p = a.position, hb = bindAt('head');
  let nose = 0, maxH = 0;
  for (let x = -0.03; x <= 0.03; x += 0.0005) for (let y = 0.04; y <= 0.15; y += 0.0005) maxH = Math.max(maxH, noseHeight(x, y));
  assert.ok(maxH <= N.maxProjection, `the highest point ${maxH} fits noseBlend's range ${N.maxProjection}`);
  for (let i = 0; i < p.count; i++) {
    if (!shell(a, i)) continue;
    const z = p.getZ(i) - hb.z, nb = a.noseBlend.getX(i);
    if (z <= 0) { assert.equal(nb, 0); continue; }
    if (nb > 0) nose++;
    // the mask subtracts noseBlend · maxProjection: the height itself, to the attribute's 1/255 step (x before faceWarp's squeeze)
    const W = FACE.warp, y = p.getY(i) - hb.y, t = (a, b, v) => { const u = Math.min(1, Math.max(0, (v - a) / (b - a))); return u * u * (3 - 2 * u); };
    const x = (p.getX(i) - hb.x) / (W.width * (1 - W.narrow * t(W.y[0], W.y[1], y) * t(W.z[0], W.z[1], z)));
    assert.ok(Math.abs(nb * N.maxProjection - noseHeight(x, y)) <= N.maxProjection / 255 + 1e-6, `vertex ${i}: noseBlend ≠ height`);
  }
  assert.ok(nose > 300, `${nose} nose vertices on the finer grid`);
  g.dispose();
});

test('#2048 the size and width sliders fold no skin at either end', () => {
  const g = avatarModelGeometry({ ...avatarLook('nose'), style: 0, facial: 0 }), a = g.attributes, p = a.position, hb = bindAt('head'), M = N.mask;
  const ends = [];
  for (const size of [0, 8]) for (const width of [0, 8]) ends.push([avatarShape('noseSize', size) * avatarShape('noseWidth', width), avatarShape('noseSize', size), avatarShape('noseSize', size)]);
  const moved = (i, s) => { // the shader (noseSlideOffset is noseSlideAt's twin)
    const x = p.getX(i) - hb.x, y = p.getY(i) - hb.y, z = p.getZ(i) - hb.z, d = z > 0 ? noseSlideOffset(x, y, a.noseBlend.getX(i) * N.maxProjection, s) : [0, 0, 0];
    return [x + d[0], y + d[1], z + d[2]];
  };
  const normal = (A, B, C) => { const u = B.map((v, k) => v - A[k]), w = C.map((v, k) => v - A[k]); const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n); return n.map((v) => v / l); };
  let checked = 0;
  for (const s of ends) for (let i = 0; i < p.count; i += 3) {
    if (!shell(a, i) || p.getZ(i) - hb.z < 0.05) continue;
    const y = p.getY(i) - hb.y; if (y < M.y[0] - 0.005 || y > M.y[3] + 0.005) continue;
    const n0 = normal(...[0, 1, 2].map((k) => moved(i + k, [1, 1, 1]))), n1 = normal(...[0, 1, 2].map((k) => moved(i + k, s)));
    assert.ok(n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] > 0.2, `triangle ${i} turns over at uNose ${s}`);
    checked++;
  }
  assert.ok(checked > 1500);
  // and the ends really differ: the wings' width and the tip's projection
  const wing = N.ala[1], wide = ends[3], narrow = ends[0];
  assert.ok(wing * (1 + (wide[0] - 1) * noseMask(wing, N.ala[2])[0]) - wing * (1 + (narrow[0] - 1) * noseMask(wing, N.ala[2])[0]) > 0.006, 'the wings move > 6 mm between the width ends');
  g.dispose();
});

test('#2048 forms: a bridge narrower between the eyes than the wings, a rounded tip, an underside with nostrils and a creased wing', () => {
  const width = (y) => { let w = 0; const h = noseHeight(0, y) / 2; for (let x = 0; x < 0.03; x += 0.0002) if (noseHeight(x, y) > h) w = x; return w; }; // half width at half height
  assert.ok(width(0.107) < 0.006 && width(0.07) > 2 * width(0.107), `bridge ${width(0.107)} vs base ${width(0.07)}`);
  assert.equal(noseHeight(0, 0.05) + noseHeight(0.03, 0.09) + noseHeight(0, 0.15), 0, 'the face round the nose is not lifted');
  let tipY = 0, tip = 0; for (let y = 0.06; y < 0.1; y += 0.0002) if (noseHeight(0, y) > tip) { tip = noseHeight(0, y); tipY = y; }
  assert.ok(tipY > 0.074 && tipY < 0.084 && tip > 0.02, `the tip ${tip} at ${tipY}`);
  // the columella stands out between the nostrils, the nostril is a dip between it and the wing
  const [, nx, ny] = N.nostril;
  assert.ok(noseHeight(0, ny) > noseHeight(nx, ny) + 0.002, 'the columella stands proud of the nostrils');
  assert.ok(noseForms(nx, ny).nostril > 0.9 && noseForms(0, 0.09).nostril === 0, 'the nostrils sit on the underside only');
  // a steep underside under the tip (seen from below): the height falls > 2 mm per mm of height between tip and lip
  assert.ok((noseHeight(0, tipY - 0.004) - noseHeight(0, tipY - 0.009)) / 0.005 > 1.5, 'a steep underside');
  const [, ax, ay, , , ra] = N.ala; let crease = 0;
  for (let t = 0; t < 1; t += 0.05) crease = Math.max(crease, noseForms(ax + ra * Math.cos(t), ay + ra * Math.sin(t)).crease);
  assert.ok(crease > 0.8, 'the crease runs round the wing\'s upper outer edge');
});

// #2049: the shape variants (noseFormOffset, the vertex shader's noseFormAt twin) on the bind mesh as the shader sees it
const VARIANTS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const offsetAt = (x, y, nb, w) => noseFormOffset(x, y, nb * N.maxProjection, w);

test('#2049 old codes and the straight variant keep #2048\'s nose exactly', () => {
  for (const code of ['000000100', '200000100n6b2', '400000100n0', '241302113e7']) assert.deepEqual(noseFormWeights(decodeAvatarLook(code, 'x')), [0, 0, 0], code);
  assert.deepEqual(noseFormWeights({ noseForm: 9 }), [0, 0, 0], 'an unknown variant is straight');
  for (let x = -0.045; x <= 0.045; x += 0.001) for (let y = 0.04; y <= 0.15; y += 0.001) assert.deepEqual(noseFormOffset(x, y, noseHeight(x / FACE.warp.width, y), [0, 0, 0]).map(Math.abs), [0, 0, 0]);
  assert.deepEqual(noseFormWeights(decodeAvatarLook('000000100n36', 'x')), [0, 0, 1]);
});

test('#2049 every variant, at every size / width end, folds no skin and leaves the face round the nose alone', () => {
  const g = avatarModelGeometry({ ...avatarLook('nose'), style: 0, facial: 0 }), a = g.attributes, p = a.position, hb = bindAt('head'), M = N.mask, [bx, y0, y1] = NF.box;
  const ends = [[1, 1, 1]];
  for (const size of [0, 8]) for (const width of [0, 8]) ends.push([avatarShape('noseSize', size) * avatarShape('noseWidth', width), avatarShape('noseSize', size), avatarShape('noseSize', size)]);
  const moved = (i, s, w) => { // the shader: the sliders, then the variant's offset times the size (uNose.y)
    const x = p.getX(i) - hb.x, y = p.getY(i) - hb.y, z = p.getZ(i) - hb.z, nb = a.noseBlend.getX(i);
    const o = z > 0 ? offsetAt(x, y, nb, w) : [0, 0, 0], d = z > 0 ? noseSlideOffset(x, y, nb * N.maxProjection, s) : [0, 0, 0];
    return [x + d[0] + s[1] * o[0], y + d[1] + s[1] * o[1], z + d[2] + s[1] * o[2]];
  };
  const normal = (A, B, C) => { const u = B.map((v, k) => v - A[k]), w = C.map((v, k) => v - A[k]); const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n); return n.map((v) => v / l); };
  let checked = 0, worst = 1;
  for (const w of VARIANTS) for (const s of ends) for (let i = 0; i < p.count; i += 3) {
    if (!shell(a, i) || p.getZ(i) - hb.z < 0.05) continue;
    const y = p.getY(i) - hb.y; if (y < y0 - 0.005 || y > y1 + 0.005) continue;
    const n0 = normal(...[0, 1, 2].map((k) => moved(i + k, [1, 1, 1], [0, 0, 0]))), n1 = normal(...[0, 1, 2].map((k) => moved(i + k, s, w)));
    const d = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]; worst = Math.min(worst, d);
    assert.ok(d > 0.2, `triangle ${i} turns over: variant ${w} at uNose ${s} (${d.toFixed(2)})`);
    checked++;
  }
  assert.ok(checked > 3000, `${checked}`);
  // zero at the box's edge and beyond, and the nose never sinks behind the face (height + offset ≥ 0)
  for (const w of VARIANTS) {
    for (let t = -1; t <= 1; t += 0.01) for (const [x, y] of [[t * bx, y0], [t * bx, y1], [bx, y0 + (t + 1) / 2 * (y1 - y0)]]) assert.ok(offsetAt(x, y, 0, w).every((v) => Math.abs(v) < 1e-7), `variant ${w} at the box edge ${x}, ${y}`);
    for (let x = 0; x < bx; x += 0.0005) for (let y = y0; y < y1; y += 0.0005) {
      const H = noseHeight(x / FACE.warp.width, y), o = noseFormOffset(x, y, H, w), dz = o[2] + o[0] * x / NF.faceRound; // (less the slide along the face's curve)
      assert.ok(H + dz > -0.0004, `variant ${w} dents the face at ${x.toFixed(4)}, ${y.toFixed(4)}: ${(H + dz).toFixed(5)}`);
    }
  }
  g.dispose();
});

test('#2049 the variants differ clearly in profile and from the front', () => {
  const H = (x, y) => noseHeight(x / FACE.warp.width, y);
  const profile = (w) => { // the midline's projection and the tip's height (where it projects most)
    let tip = 0, tipY = 0; const at = (y) => H(0, y) + noseFormOffset(0, y, H(0, y), w)[2];
    for (let y = 0.06; y < 0.1; y += 0.0002) if (at(y) > tip) { tip = at(y); tipY = y + noseFormOffset(0, y, H(0, y), w)[1]; }
    return { tip, tipY, bridge: at(NF.hump[1]) };
  };
  const straight = profile([0, 0, 0]), convex = profile(VARIANTS[0]), up = profile(VARIANTS[1]), broad = profile(VARIANTS[2]);
  // the dorsum's line from the radix to the tip: convex above it, upturned below it
  const line = (p) => p.bridge - straight.bridge;
  assert.ok(line(convex) > 0.0025, `the convex hump ${line(convex)}`);
  assert.ok(convex.tipY < straight.tipY - 0.0015, `the convex tip droops ${convex.tipY} vs ${straight.tipY}`);
  assert.ok(up.tipY > straight.tipY + 0.0025, `the upturned tip rises ${up.tipY} vs ${straight.tipY}`);
  assert.ok(line(up) < -0.001, `the upturned dorsum is scooped ${line(up)}`);
  assert.ok(line(broad) < -0.004, `the broad bridge is lower ${line(broad)}`);
  const wing = N.ala[1] * FACE.warp.width;
  assert.ok(noseFormOffset(wing, N.ala[2], 0.004, VARIANTS[2])[0] > 0.002, 'the broad nose\'s wings sit > 2 mm wider');
  assert.ok(Math.abs(noseFormOffset(0.016, 0.107, 0, VARIANTS[2])[0]) < 0.0005, 'the inner eye corner stays put');
});

test('#2058 the kiss leaves the nose alone and tears no skin round it (pucker smooth, none on the nose itself)', async () => {
  const { KISS } = await import('../src/config.js'), hb = bindAt('head');
  for (const facial of [0, 1, 2, 3]) {
    const g = avatarModelGeometry({ ...avatarLook('nose'), style: 0, facial }), a = g.attributes, p = a.position;
    const at = (i, k) => [p.getX(i) * (1 - k * a.pucker.getX(i) * KISS.narrow), p.getY(i), p.getZ(i) + k * a.pucker.getX(i) * KISS.pucker]; // avatar.js begin_vertex
    let worst = 0;
    for (let t = 0; t < p.count; t += 3) {
      const x = p.getX(t) - hb.x, y = p.getY(t) - hb.y, z = p.getZ(t) - hb.z;
      if (a.facePart.getX(t) < 1 || a.facePart.getX(t) > 29 || y < 0.055 || y > 0.12 || z < 0.03 || Math.abs(x) > 0.04) continue;
      for (let e = 0; e < 3; e++) {
        if (a.noseBlend.getX(t + e) >= KISS.noseFade) assert.equal(a.pucker.getX(t + e), 0, `facial ${facial}: the nose never pouts`);
        const i = t + e, j = t + (e + 1) % 3, l0 = Math.hypot(...at(i, 0).map((v, c) => v - at(j, 0)[c])), l1 = Math.hypot(...at(i, 1).map((v, c) => v - at(j, 1)[c]));
        if (l0 > 1e-4) worst = Math.max(worst, l1 / l0);
      }
    }
    assert(worst < 2, `facial ${facial}: an edge round the nose stretches ${worst.toFixed(2)}× in the kiss (was 8.8× before #2058)`);
    g.dispose();
  }
});

// #2060: the sliders' ends leave no shading edge on the cheek beside the wings. The edge was the moved skin's facets disagreeing
// with their shading normals (the bump's frame follows the facets): the width piled the cheek up in a thin ring and the normals
// stayed put. Measured on the cheek round the nose (no nose height at any corner) as each facet's angle to its corners' shader
// normals (noseNormalTurn, noseNormalGLSL's twin), less the same angle on the default straight nose.
test('#2060 the size / width ends keep the cheek beside the wings smooth for every variant (old codes untouched)', () => {
  const g = avatarModelGeometry({ ...avatarLook('nose'), style: 0, facial: 0 }), a = g.attributes, p = a.position, n = a.normal, hb = bindAt('head');
  const rel = (i) => [p.getX(i) - hb.x, p.getY(i) - hb.y, p.getZ(i) - hb.z], H = (i) => a.noseBlend.getX(i) * N.maxProjection;
  const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  const cheek = [];
  for (let t = 0; t < p.count; t += 3) {
    const [x, y, z] = rel(t);
    if (a.facePart.getX(t) === 1 && z > 0.05 && Math.abs(x) > 0.012 && Math.abs(x) < 0.06 && y > 0.04 && y < 0.13 && [0, 1, 2].every((k) => H(t + k) === 0)) cheek.push(t);
  }
  assert.ok(cheek.length > 150, `${cheek.length} cheek triangles`);
  const misfit = (s, w) => cheek.map((t) => {
    const P = [0, 1, 2].map((k) => { const [x, y, z] = rel(t + k), d = noseSlideOffset(x, y, H(t + k), s), o = noseFormOffset(x, y, H(t + k), w); return [x + d[0] + s[1] * o[0], y + d[1] + s[1] * o[1], z + d[2] + s[1] * o[2]]; });
    const u = P[1].map((v, m) => v - P[0][m]), v2 = P[2].map((v, m) => v - P[0][m]);
    const fn = unit([u[1] * v2[2] - u[2] * v2[1], u[2] * v2[0] - u[0] * v2[2], u[0] * v2[1] - u[1] * v2[0]]);
    const sn = unit([0, 1, 2].map((m) => [0, 1, 2].reduce((acc, k) => { const [x, y] = rel(t + k); return acc + noseNormalTurn(x, y, H(t + k), [n.getX(t + k), n.getY(t + k), n.getZ(t + k)], s, w)[m]; }, 0)));
    return Math.acos(Math.min(1, fn[0] * sn[0] + fn[1] * sn[1] + fn[2] * sn[2])) * 180 / Math.PI;
  });
  const mid = [1, 1, 1], base = misfit(mid, [0, 0, 0]);
  // the middle sliders of the straight nose move nothing and turn no normal (old codes stay pixel-identical)
  for (const t of cheek.slice(0, 40)) { const [x, y] = rel(t); assert.deepEqual(noseSlideOffset(x, y, H(t), mid).map(Math.abs), [0, 0, 0]); }
  let worst = 0;
  for (const size of [0, 8]) for (const width of [0, 8]) for (const w of [[0, 0, 0], ...VARIANTS]) {
    const s = [avatarShape('noseSize', size) * avatarShape('noseWidth', width), avatarShape('noseSize', size), avatarShape('noseSize', size)];
    misfit(s, w).forEach((d, k) => { worst = Math.max(worst, d - base[k]); assert.ok(d - base[k] < 12, `variant ${w} size ${size} width ${width}: a cheek facet ${(d - base[k]).toFixed(1)}° off its normals`); });
  }
  // and the widening spreads over the cheek: no stretch of skin across the face shrinks below 0.6 (#2048's ring: 0.28)
  const wide = [avatarShape('noseSize', 8) * avatarShape('noseWidth', 8), 1, 1];
  for (let y = 0.05; y < 0.12; y += 0.002) for (let x = 0; x < 0.06; x += 0.0005) {
    const k = (0.0005 + noseSlideOffset(x + 0.0005, y, 0, wide)[0] - noseSlideOffset(x, y, 0, wide)[0]) / 0.0005;
    assert.ok(k > 0.6, `the skin at ${x.toFixed(4)}, ${y.toFixed(3)} squeezed to ${k.toFixed(2)}`);
  }
  g.dispose();
});

