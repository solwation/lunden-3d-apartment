// #2061: the full beard's sideburn runs up into the scalp's soft hairline (src/avatarsideburn.js): the mapped hairline matches the real
// head, the beard is dense up to the line in front of the ear and gone well inside the hair, the cheek in front of the sideburn and the
// beard's density elsewhere are unchanged, the back edge in front of the ear is feathered, and the sideburn lies flat under the hair shell.
//   node --test tools/avatarsideburntest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_BEARD as B, AVATAR_HAIR as HAIR, AVATAR_FACE as FACE, AVATAR_SIDEBURN as S } from '../src/config.js';
import { bindAt } from '../src/olof.js';
import { isFlyaway } from '../src/avatarflyaway.js';
import { beardAngles, beardDensity } from '../src/avatarbeard.js';
import { hairlineAt, hairAngles } from '../src/avatarhairline.js';
import { sideburnTop, sideburnLine } from '../src/avatarsideburn.js';

const hb = bindAt('head'), W = FACE.warp, DEG = Math.PI / 180;
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const warp = (y, z) => W.width * (1 - W.narrow * sm(W.y[0], W.y[1], y) * sm(W.z[0], W.z[1], z));
const toBeard = (p) => beardAngles(p[0] / warp(p[1], p[2]), p[1], p[2]);
/** The head's skin (face part 1) and the full beard's own vertices (not flyaways), head frame (after the face warp). */
function parts(facial = 1) {
  const g = avatarModelGeometry({ ...avatarLook('2061'), style: 0, facial, gender: 0 }), a = g.attributes, head = [], beard = [];
  for (let i = 0; i < a.position.count; i++) {
    const p = [a.position.getX(i) - hb.x, a.position.getY(i) - hb.y, a.position.getZ(i) - hb.z];
    if (a.facePart.getX(i) === 1 && a.region.getX(i) === 0) head.push(...p);
    if (a.region.getX(i) === 8 && !isFlyaway(a, i, 7, 11)) beard.push(p);
  }
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(head, 3));
  const mesh = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(), skin = (o, d) => { ray.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize()); const h = ray.intersectObject(mesh, false); return h.length ? h.at(-1) : null; };
  g.dispose();
  return { beard, skin };
}
const { beard, skin } = parts();
const dir = (A, E) => [Math.sin(A * DEG) * Math.cos(E * DEG), Math.sin(E * DEG), Math.cos(A * DEG) * Math.cos(E * DEG)];
/** The visible hairline on the real skin at hair azimuth A, `dE` degrees above it, in the beard's angles. */
const lineOnSkin = (A, dE = 0) => { const p = skin(HAIR.centre, dir(A, hairlineAt(A) + dE)).point; return toBeard([p.x, p.y, p.z]); };

test('#2061 the mapped hairline matches the real head: the sideburn top lies `over` above the probed line (within 2°)', () => {
  for (const A of [64, 66, 68, 70, 72, 74, 76, 78]) {
    const [a, e] = lineOnSkin(A), top = sideburnLine(a);
    assert(top - e > 0.5 && top - e < S.over + 2, `hair ${A}°: the top ${top.toFixed(1)}° vs the line ${e.toFixed(1)}° at beard ${a.toFixed(1)}°`);
  }
});

test('#2061 the full beard is dense up to the hairline in front of the ear and gone well inside the hair', () => {
  for (const lip of [false, true]) for (const A of [65, 67, 69, 71, 73, 75, 77]) {
    const [a, e] = lineOnSkin(A), [a2, e2] = lineOnSkin(A, 14);
    if (a > B.azimuth - S.back) continue; // (the feathered back edge)
    assert(beardDensity(a, e - 1, lip, false) > 0.75, `hair ${A}°: dense at the line (${beardDensity(a, e - 1, lip, false).toFixed(2)})`);
    assert.equal(beardDensity(a2, e2, lip), 0, `hair ${A}°: nothing 14° inside the hair`);
  }
});

test('#2061 the cheek in front of the sideburn is unchanged; the back edge in front of the ear is feathered, not cut', () => {
  for (const a of [0, 30, 60, S.from[0]]) for (const t of [-20, 0, 10]) assert.equal(sideburnTop(a, t), t);
  for (const e of [-3, 0, 3]) { // (below the sideburn's own top feather)
    const ramp = [0, 0.25, 0.5, 0.75, 1].map((t) => beardDensity(B.azimuth - 0.01 - t * (S.back + 2), e, false, false));
    assert(ramp[0] < 0.02 && ramp[4] > 0.8, `the edge at ${e}°: nothing at the grid edge, full ${S.back + 2}° in (${ramp.map((d) => d.toFixed(2))})`);
    assert(ramp.filter((d) => d > 0.05 && d < 0.95).length >= 2, `a soft back edge at ${e}° (${ramp.map((d) => d.toFixed(2))})`);
  }
});

test('#2061 the sideburn lies flat on the skin where it meets the hair (under the scalp shell, lifted at least 1.5 mm)', () => {
  const c = B.centre;
  let n = 0;
  for (const p of beard) {
    const [A, E] = hairAngles(p);
    if (Math.abs(A) < 64 || Math.abs(A) > 78 || Math.abs(E - hairlineAt(A)) > 2) continue;
    const h = skin(c, [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
    if (!h) continue;
    n++;
    const off = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - h.distance;
    assert(off < 0.0013, `${(off * 1000).toFixed(2)} mm off the skin at hair ${A.toFixed(0)}°/${E.toFixed(0)}°`);
  }
  assert(n >= 4, `sideburn vertices at the line checked (${n})`);
});
