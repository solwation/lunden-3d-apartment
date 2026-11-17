// #2054: curly hair as curl volumes (src/avatarcurls.js): the head-triangle budget, the curls' anchors (each vertex its clump's centre,
// never read as a flyaway), their reach under headwear, the soft hairline left to the shell, no new attribute, deterministic builds.
//   node --test tools/avatarcurlstest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_HAIR as HAIR } from '../src/config.js';
import { bindAt } from '../src/olof.js';
import { isFlyaway } from '../src/avatarflyaway.js';
import { hairAngles, hairlineAt } from '../src/avatarhairline.js';
import { curlScalp, curlReach, clumpTriangles } from '../src/avatarcurls.js';

const isCurl = (a, i) => a.facePart.getX(i) === 7 && a.faceAnchor.getY(i) > 0.5 && a.faceAnchor.getZ(i) < 0.5;
const headTris = (a) => { let n = 0; for (let i = 0; i < a.position.count; i += 3) { const f = a.facePart.getX(i); if (f > 0 && f < 30) n++; } return n; };

test('#2054 budget: curly head triangles within +10 % of the integrated #1377 tubes (14796), the other styles unchanged', () => {
  const before = [9840, 10900, 10332, 10208, 14796]; // head-bone triangles per style at b622b587 (after #2048, #2050, #2052); long (style 1) +800 for #2053's locks; short (0) +660 and bun (2) +816 for #2055's locks and wound bun
  for (let style = 0; style < 5; style++) {
    const g = avatarModelGeometry({ ...avatarLook('nose'), style, facial: 0, gender: style % 2 }), head = headTris(g.attributes);
    if (style === 4) assert.ok(head <= before[4] * 1.1, `curly: ${head} > ${before[4]} × 1.1`);
    else assert.equal(head, before[style], `style ${style} unchanged`);
    g.dispose();
  }
});

test('#2054 curls: whole clumps anchored at their centre (not flyaways), within reach of it, no new attribute, deterministic', () => {
  const look = { ...avatarLook('2054'), style: 4, facial: 0 }, g = avatarModelGeometry(look), a = g.attributes;
  let n = 0;
  for (let i = 0; i < a.position.count; i += 3) {
    const c = [i, i + 1, i + 2].map((k) => isCurl(a, k));
    if (!c[0] && !c[1] && !c[2]) continue;
    assert(c[0] && c[1] && c[2], 'whole triangles');
    n++;
    for (let k = i; k < i + 3; k++) {
      assert(!isFlyaway(a, k, 7, 11), 'a curl is not read as a flyaway');
      const d = Math.hypot(a.position.getX(k) - a.faceAnchor.getX(k), a.position.getY(k) - a.faceAnchor.getY(k), a.position.getZ(k) - a.faceAnchor.getZ(k));
      assert(d < 0.045, `a curl vertex ${d.toFixed(3)} m from its anchor`);
    }
  }
  assert.equal(n % clumpTriangles(), 0, 'whole clumps');
  assert(n / clumpTriangles() >= 100, `${n / clumpTriangles()} clumps`);
  assert.equal(Object.keys(a).length, 17, 'no new attribute');
  const h = avatarModelGeometry(look);
  assert.deepEqual(Array.from(h.attributes.position.array.slice(-3000)), Array.from(a.position.array.slice(-3000)), 'the same curls every build');
  g.dispose(); h.dispose();
});

test('#2054 scalp curls: within their reach (under hats and the headphones band), above the soft hairline at the front', () => {
  const c = HAIR.centre, R = 0.095, deg = Math.PI / 180;
  const onSkull = (az, e, lift) => { const d = [Math.sin(az * deg) * Math.cos(e * deg), Math.sin(e * deg), Math.cos(az * deg) * Math.cos(e * deg)]; return d.map((v, i) => c[i] + v * (R + lift)); };
  const [g] = curlScalp({ onSkull, thick: () => 0.006, edge: hairlineAt }), p = g.attributes.position;
  let worst = -1;
  for (let i = 0; i < p.count; i++) {
    const q = [p.getX(i), p.getY(i), p.getZ(i)], [az, el] = hairAngles(q), r = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) - R;
    worst = Math.max(worst, r - curlReach(az, el + 6));
    if (Math.abs(az) < 55) assert(el > hairlineAt(az) - 1, `a curl below the front hairline at ${az.toFixed(1)}°, ${el.toFixed(1)}°`);
  }
  assert(worst < 0.001, `a curl reaches ${(worst * 1000).toFixed(1)} mm past its limit`);
  assert(curlReach(90, 0) <= HAIR.curly.hat[0] + 1e-9 && curlReach(140, -8) <= HAIR.curly.hat[0] + 1e-9 && Math.abs(curlReach(0, 80) - HAIR.curly.out) < 1e-9, 'tight under the knitted hat edge, full on the crown');
  g.dispose();
});

test('#2054 the curly hair is anchored where the length slider reads it (bind pose positions of other styles untouched)', () => {
  const hb = bindAt('head');
  for (const style of [0, 1, 2, 3]) {
    const g = avatarModelGeometry({ ...avatarLook('2054-' + style), style, facial: 0 }), a = g.attributes;
    for (let i = 0; i < a.position.count; i++) assert(!isCurl(a, i), `style ${style}: no curl anchors`);
    g.dispose();
  }
  assert(hb.y > 0.5, 'the head bone is above 0.5 m, so a curl anchor is told from plain hair (0, 0, 0)');
});
