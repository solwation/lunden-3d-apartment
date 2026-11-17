// #2048: the nose (src/avatarnose.js): its own triangle budget, a closed head skin round the finer grid, the Spider mask's exact
// flattening, the sliders without folds at every end, and the forms (narrow bridge, tip, underside with nostrils, wings).
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, avatarShape, AVATAR_SURFACE, AVATAR_NOSE as N, AVATAR_FACE as FACE } from '../src/config.js';
import { bindAt } from '../src/olof.js';
import { contourRows } from '../src/avatarcontour.js';
import { noseTriangles, noseForms, noseHeight, noseMask } from '../src/avatarnose.js';

// head-bone triangles (facePart 1 … 29) per variant before #2048 (37d922df, after the eyes #2045 and ears #2047)
const before = [['s0f0', 8524], ['s0f1', 9412], ['s0f3', 9488], ['s1f0', 9444], ['s2f0', 8860], ['s3f0', 9552], ['s4f0', 14140]];
const own = noseTriangles(contourRows(AVATAR_SURFACE.head, AVATAR_SURFACE.nosePatch.rings));
const shell = (a, i) => a.facePart.getX(i) === 1 && a.rifleSkull.getX(i) === 1;

test('#2048 budget: the finer nose grid stays within +10 % of the head triangles', () => {
  for (const [key, tris] of before) {
    const style = +key[1], facial = +key[3], g = avatarModelGeometry({ ...avatarLook('nose'), style, facial, gender: style % 2 }), a = g.attributes;
    let head = 0; for (let i = 0; i < a.position.count; i += 3) { const f = a.facePart.getX(i); if (f > 0 && f < 30) head++; }
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
  const moved = (i, [sx, sy, sz]) => {
    const x = p.getX(i) - hb.x, y = p.getY(i) - hb.y, z = p.getZ(i) - hb.z, [mw, ml] = z > 0 ? noseMask(x, y) : [0, 0];
    return [x + (sx - 1) * x * mw, y + (sy - 1) * M.length * (y - M.pivot) * ml, z + (sz - 1) * a.noseBlend.getX(i) * N.maxProjection];
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
