// #2045: round irises and pupils, thick lids with a crease and an upper lash line (src/avatarlids.js): the eyes' triangle budget, round
// discs, the lids' thickness and fold, the lashes' place and the vertex GLSL.
//   node --test tools/avatarlidstest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_LIDS as L, AVATAR_FACE as FACE, AVATAR_SURFACE as SURFACE } from '../src/config.js';
import { irisDisc, pupilDisc, lidSurface, upperLashes, lidBlink, scleraZ, edgeY } from '../src/avatarlids.js';

const flat = () => 0; // a flat head surface at the eyeball's centre (the real one: avatar.js headFront)
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

test('#2045 the eyes stay within +10 % of the head\'s triangles over #2033\'s 608, in every variant', () => {
  for (const [style, facial] of [[0, 0], [0, 3], [1, 0], [2, 0], [3, 0], [4, 0]]) {
    const g = avatarModelGeometry({ ...avatarLook('2045-' + style), style, facial }), a = g.attributes;
    let eye = 0, head = 0;
    for (let i = 0; i < a.position.count; i += 3) { const f = a.facePart.getX(i); if (f === 3 || f === 26) eye++; if (f > 0 && f < 100) head++; }
    assert.ok(eye - 608 <= 0.1 * (head - eye + 608), `s${style}f${facial}: ${eye} eye triangles, head ${head}`);
    assert.equal(eye, 1248, 'the documented count (docs/verification/2045)');
    g.dispose();
  }
});

test('#2045 the iris and pupil are round: no corner deeper than 0.06 mm at any pupil size', () => {
  const n = L.iris.segments, sag = (r) => r * (1 - Math.cos(Math.PI / n));
  assert.ok(sag(FACE.eye.iris) < 0.00006 && sag(FACE.eye.pupil * 1.5) < 0.00006);
  const iris = irisDisc(), p = iris.attributes.position, rim = [];
  for (let i = 0; i < p.count; i++) if (Math.abs(Math.hypot(p.getX(i), p.getY(i)) - FACE.eye.iris) < 1e-7) rim.push(i);
  assert.equal(rim.length, n, 'one full ring at the iris\' radius');
  const sh = iris.attributes.shade.array; assert.ok(Math.min(...rim.map((i) => sh[i])) < 0.6, 'a dark limbal ring');
  assert.equal(tris(pupilDisc()), n);
});

test('#2045 the lids have thickness in front of the eyeball, a fold over the upper lid and no gap at the opening', () => {
  const g = lidSurface(flat), p = g.attributes.position, stride = L.lid.rows.length + 1, cols = L.lid.cols, mid = cols / 4; // column `mid`: straight up
  const at = (i, j) => [p.getX(i * stride + j), p.getY(i * stride + j), p.getZ(i * stride + j)];
  const [, yb, zb] = at(mid, 0), [, y1, z1] = at(mid, 1), [, , z2] = at(mid, 2);
  assert.ok(zb < scleraZ(0) && yb < edgeY(0, true), 'the margin\'s back is tucked inside the opening, behind the eyeball');
  assert.ok(Math.abs(y1 - edgeY(0, true)) < 1e-9 && z1 - scleraZ(0) >= 0.001, `the upper margin stands ${(z1 - scleraZ(0)) * 1000} mm proud`);
  assert.ok(z2 > z1, 'its rounded top');
  const [, , zl] = at(3 * mid, 1); assert.ok(zl - scleraZ(0) >= 0.0007, 'the lower margin too');
  const sh = g.attributes.shade.array, k = L.lid.rows.findIndex((s) => s === L.crease.at) + 1;
  assert.ok(sh[mid * stride + k] < 0.9 && sh[mid * stride + 1] < sh[mid * stride + 2], 'a darker crease and lash line');
  // the iris' front never pokes through the margin's front edge (z) where the opening's edge clamps it (avatar.js, the gaze)
  assert.ok(z1 > scleraZ(0) + SURFACE.eye.irisDepth * FACE.eye.iris * Math.sqrt(1 - (SURFACE.eye.upper / FACE.eye.iris) ** 2));
});

test('#2045 the lashes root in the upper margin and point forward and up, both sides wound outwards', () => {
  for (const side of [-1, 1]) {
    const g = upperLashes(side), p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i), base = [p.getY(i), p.getZ(i)], tip = [p.getY(i + 1), p.getZ(i + 1)];
      assert.ok(base[0] >= edgeY(x, true) && tip[0] > base[0] && tip[1] > base[1], 'up and forward from the margin');
    }
    let down = 0, up = 0; for (let i = 0; i < n.count; i++) { if (n.getY(i) < 0) down++; else up++; }
    assert.ok(down > 0 && up > 0, 'a closed wedge');
    assert.equal(tris(g), L.lash.segments * 4);
  }
});

test('#2045 the blink GLSL is self-contained', () => {
  const s = lidBlink(FACE.warp.width);
  assert.ok(!/NaN|undefined|Infinity/.test(s));
  assert.equal((s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length);
  assert.match(s, /uFly/); assert.match(s, /region - 9\.0/);
});
