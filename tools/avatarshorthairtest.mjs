// #2055: layered short hair and the wound bun (src/avatarshorthair.js): the budget (≤ +10 % of the head's triangles before, b622b587),
// locks that stand proud of the shell and break its silhouette, the nape's tufts below the shell's edge,
// the bun's ropes coiling round the gloss's bun axis inside the #2014 sway radius, and no new attribute or flyaway roots on the locks.
//   node --test tools/avatarshorthairtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_HAIR as HAIR, AVATAR_SHORT_HAIR as S, AVATAR_HAIR_GLOSS as G, AVATAR_SWAY as SW, AVATAR_HAIRLINE } from '../src/config.js';
import { bindAt } from '../src/olof.js';
import { glassesExtraTriangles } from '../src/avatarglasses.js'; // #2173
import { isFlyaway } from '../src/avatarflyaway.js';
import { hairAngles } from '../src/avatarhairline.js';
import { shortHairTriangles, shortJag, shortHairDrop, bunParts, shortHairFDecl, shortHairColor } from '../src/avatarshorthair.js';
import * as THREE from 'three';

// the head's triangles (face parts 1 … 29, flyaways left out) at the base b622b587, per style
const before = { 0: 8916 + 464, 2: 9276 + 464 }; // (+ 464 for #2170's lash rows: 576 triangles in place of 112)
const headTris = (style) => {
  const g = avatarModelGeometry({ ...avatarLook('2055-' + style), style, facial: 0, gender: style % 2 }), a = g.attributes;
  let head = 0, hair = 0;
  for (let i = 0; i < a.position.count; i += 3) { if (isFlyaway(a, i, 7, 11)) continue; const f = a.facePart.getX(i); if (f > 0 && f < 30) head++; if (f === 7) hair++; }
  return { g, head, hair };
};

test('#2055 budget: ≤ +10 % head triangles for short hair and the bun, other styles unchanged, no new attribute', () => {
  for (const style of [0, 2]) {
    const { g, head } = headTris(style), extra = shortHairTriangles(style);
    assert(extra > 0 && extra <= before[style] * 0.1, `style ${style}: +${extra} > ${before[style]}×0.1`);
    assert(head - glassesExtraTriangles() - before[style] <= before[style] * 0.1 + 1, `style ${style}: head ${head} vs ${before[style]}`);
    assert.equal(Object.keys(g.attributes).length, 17, 'no additional attributes');
    g.dispose();
  }
  for (const style of [1, 3, 4]) assert.equal(shortHairTriangles(style), 0);
});

test('#2055 short hair: locks stand proud of the shell round the outline; tufts reach below the old edge', () => {
  const hb = bindAt('head'), c = HAIR.centre, g = avatarModelGeometry({ ...avatarLook('2055-l'), style: 0, facial: 0 }), a = g.attributes;
  // the outermost hair radius per 10° of azimuth near the crown's side outline (elevation 30–60°) varies by several mm (not a smooth cap)
  const bins = new Map();
  for (let i = 0; i < a.position.count; i++) {
    if (a.region.getX(i) !== 3 || isFlyaway(a, i, 7, 11)) continue;
    const p = [a.position.getX(i) - hb.x, a.position.getY(i) - hb.y, a.position.getZ(i) - hb.z], [az, el] = hairAngles(p);
    const r = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
    if (el > 30 && el < 60) { const k = Math.round(az / 10); bins.set(k, Math.max(bins.get(k) ?? 0, r)); }
  }
  const rs = [...bins.values()];
  let rough = 0; for (let i = 1; i < rs.length; i++) rough = Math.max(rough, Math.abs(rs[i] - rs[i - 1]));
  assert(rough > 0.002, `the outline is bumpy (${(rough * 1000).toFixed(1)} mm)`);
  g.dispose();
  // the nape's tufts: deeper than the shell's old drop at the back, none in front; the shell runs at least that much lower
  assert(Math.max(...Array.from({ length: 60 }, (_, i) => shortJag(120 + i))) > 0.005 && shortJag(0) === 0 && shortJag(40) === 0);
  for (let az = 60; az <= 180; az += 3) assert(shortHairDrop(0, az) * 0.07 * Math.PI / 180 >= shortJag(az) - 1e-9, `shell under the tufts at ${az}°`);
  assert.equal(shortHairDrop(2, 150), 0);
  // #2053 stops thinning well below the line (hanging locks); short hair's lower shell must stay within that reach plus `below`
  const L = AVATAR_HAIRLINE, cut = L.baby + L.drop * Math.PI / 180 * 0.12 + 0.003 + S.jag[0];
  for (let az = 0; az <= 180; az += 3) assert((L.drop + shortHairDrop(0, az)) * Math.PI / 180 * 0.09 <= cut, `the soft line still reaches the shell's edge at ${az}°`);
});

test('#2055 bun: ropes coil round the gloss axis, inside the sway radius and the gloss bun radius', () => {
  const parts = bunParts(HAIR.bunAt, G.bunTilt), axis = new THREE.Vector3(0, Math.cos(G.bunTilt), Math.sin(G.bunTilt)), at = new THREE.Vector3(...HAIR.bunAt);
  let far = 0, along = 0, n = 0;
  for (const [geo, region] of parts.slice(1, -1)) {
    assert.equal(region, 'hair');
    const p = geo.attributes.position, v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) far = Math.max(far, v.fromBufferAttribute(p, i).distanceTo(at));
    for (let i = 0; i + 6 < p.count; i += 6) { // successive rings' centres run round the axis (the coil's tangent ⟂ the axis)
      const c0 = new THREE.Vector3(), c1 = new THREE.Vector3();
      for (let k = 0; k < 6; k++) { c0.add(v.fromBufferAttribute(p, i + k)); c1.add(w.fromBufferAttribute(p, i + 6 + k)); }
      const t = c1.sub(c0).normalize(); along += Math.abs(t.dot(axis)); n++;
    }
  }
  assert(far < Math.min(SW.bunRadius[1], G.bunRadius), `the bun reaches ${far.toFixed(3)} m`);
  assert(along / n < 0.35, `the ropes coil round the axis (mean |cos| ${(along / n).toFixed(2)})`);
});

test('#2055 shader parts compile to plain strings with the uniform declared once', () => {
  assert.equal((shortHairFDecl().match(/uniform vec4 uShortHair/g) || []).length, 1);
  assert(/uShortHair\.rgb/.test(shortHairColor({ hb: bindAt('head'), region: 3 })));
});
