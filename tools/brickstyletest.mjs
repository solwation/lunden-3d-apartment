// node --test tools/brickstyletest.mjs — #1556: the old Sankt Lars pavilions wear nr 41's brick style (src/brickstyle.js)
// on their own OSM footprints, storeys and eaves, as one geometry per southbackdrop batch (no extra draw calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SITE } from '../src/config.js';
import { brickPavilion, BRICK_STYLE } from '../src/brickstyle.js';
import { buildStLars41 } from '../src/stlars41.js';

const S = SITE.south, P = S.brickStyle;
const pavilions = S.buildings.filter(b => P.sources.includes(b.source));
// #1722: the streets the entrances turn to (as southbackdrop gathers them) and a sloping ground under the pavilions
const streets = [...SITE.roads.filter(r => r.name === 'Sankt Lars väg').map(r => r.path), ...S.access.map(r => r.path), ...S.paths.map(r => r.path)];
const slope = base => (x, z) => base - 0.4 + 0.02 * (x + z); // arbitrary tilt: the door's steps must follow it

test('every listed source is an existing generic four-storey pavilion, listed once', () => {
  assert.equal(new Set(P.sources).size, P.sources.length);
  assert.equal(pavilions.length, P.sources.length);
  for (const b of pavilions) assert.ok(!b.template && b.levels >= 4 && b.roof === 'hipped', b.name);
});

test('walls, friezes and windows stay on the footprint, between the ground and the eave, in one geometry per batch', () => {
  const base = 2, bottom = 1.5, out = 0.5 + S.brickEntrance.landing + S.brickEntrance.maxSteps * S.brickEntrance.tread;
  for (const b of pavilions) {
    const p = b.polygon.slice(0, -1), eave = base + b.levels * S.storey, parts = { facade: [], roof: [], glass: [] }, pav = brickPavilion(b, base, bottom, eave, { streets, ground: slope(base) });
    let windows = 0;
    for (const [ring, hole] of [[p, false], ...(b.holes ?? []).map(h => [h.slice(0, -1), true])]) {
      const sign = (hole ? -1 : 1) * Math.sign(ring.reduce((s, q, i) => { const r = ring[(i + 1) % ring.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0));
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], d = Math.hypot(c[0] - a[0], c[1] - a[1]);
        pav.edge(a, c, sign);
        for (let k = 1; k * S.bay + S.window[0] / 2 < d; k++) windows += b.levels;
      }
    }
    pav.flush(parts);
    assert.equal(parts.facade.length, 1, `${b.name}: one facade geometry`); assert.equal(parts.glass.length, 1, `${b.name}: one glass geometry`); assert.equal(parts.roof.length, 0, `${b.name}: the roof stays southbackdrop's`);
    assert.equal(parts.glass[0].attributes.position.count / 9, windows - pav.skippedWindows, `${b.name}: one 3-triangle pane per generic window position, minus those under a door`);
    const xs = p.map(q => q[0]), zs = p.map(q => q[1]), box = new THREE.Box3().setFromBufferAttribute(parts.facade[0].attributes.position);
    assert.ok(box.min.x > Math.min(...xs) - out && box.max.x < Math.max(...xs) + out && box.min.z > Math.min(...zs) - out && box.max.z < Math.max(...zs) + out, `${b.name}: on its footprint (steps and canopy aside)`);
    assert.ok(box.min.y >= bottom - 1e-6 && box.max.y <= eave + 1e-6, `${b.name}: between the ground and the eave`);
    const col = parts.facade[0].attributes.color, brick = new THREE.Color(BRICK_STYLE.brick), plinth = new THREE.Color(BRICK_STYLE.plinth), frame = new THREE.Color(BRICK_STYLE.frame);
    const has = c => { for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - c.r) + Math.abs(col.getY(i) - c.g) + Math.abs(col.getZ(i) - c.b) < 1e-6) return true; return false; };
    assert.ok(has(brick) && has(plinth) && has(frame), `${b.name}: brick, white plinth and white frames`);
    for (const g of [...parts.facade, ...parts.glass]) g.dispose();
  }
});

// #1614: each triangle's winding must agree with its explicit normal. The facade / roof / glass materials are DoubleSide,
// and three r170 flips the normal on back faces (`normal *= faceDirection`), so a triangle wound against its normal is lit
// as if it faced the other way: the sun side dark, the shade side lit. Checked for every brickKit user.
const reversed = g => {
  const p = g.attributes.position, n = g.attributes.normal, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  let bad = 0, all = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a);
    const geo = b.cross(c); if (geo.length() < 1e-9) continue; // degenerate (clamped arch slivers)
    all++; if (geo.dot(m.fromBufferAttribute(n, i)) <= 0) bad++;
  }
  return [bad, all];
};
const assertWound = (parts, name) => {
  for (const key of ['facade', 'roof', 'glass']) for (const g of parts[key]) {
    const [bad, all] = reversed(g);
    assert.ok(all > 0, `${name} ${key}: has triangles`);
    assert.equal(bad, 0, `${name} ${key}: ${bad} of ${all} triangles wound against their normal`);
    g.dispose();
  }
};

test('every pavilion triangle winds the way its normal points, outer rings and holes alike (#1614)', () => {
  const base = 2, bottom = 1.5;
  for (const b of pavilions) {
    const p = b.polygon.slice(0, -1), eave = base + b.levels * S.storey, parts = { facade: [], roof: [], glass: [] }, pav = brickPavilion(b, base, bottom, eave, { streets, ground: slope(base) });
    for (const [ring, hole] of [[p, false], ...(b.holes ?? []).map(h => [h.slice(0, -1), true])]) {
      const sign = (hole ? -1 : 1) * Math.sign(ring.reduce((s, q, i) => { const r = ring[(i + 1) % ring.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0));
      for (let i = 0; i < ring.length; i++) pav.edge(ring[i], ring[(i + 1) % ring.length], sign);
      // the same footprint walked the other way round must come out right as well
      const back = [...ring].reverse(); for (let i = 0; i < back.length; i++) pav.edge(back[i], back[(i + 1) % back.length], -sign);
    }
    pav.flush(parts);
    assertWound(parts, b.name);
  }
});

test('every Sankt Lars väg 41 triangle winds the way its normal points (#1614)', () => {
  const b = S.buildings.find(q => q.template === 'stlars41'), parts = { facade: [], roof: [], glass: [] };
  assert.ok(b, 'nr 41 is listed');
  buildStLars41(b, b.polygon.slice(0, -1), 2, 1.5, parts);
  assert.ok(parts.facade.length && parts.roof.length && parts.glass.length, 'nr 41 fills all three batches');
  assertWound(parts, b.name);
});

// #1722: every pavilion has one or two street entrances (door, frame, canopy, steps), merged into the facade batch.
test('every pavilion has one or two street entrances: on a long outer face, facing a street, steps down to the ground, no extra batch (#1722)', () => {
  const E = S.brickEntrance, base = 2, bottom = 1.5, ground = slope(base);
  let total = 0;
  for (const b of pavilions) {
    const p = b.polygon.slice(0, -1), eave = base + b.levels * S.storey, parts = { facade: [], roof: [], glass: [] };
    const bare = { facade: [], roof: [], glass: [] }, none = brickPavilion(b, base, bottom, eave), pav = brickPavilion(b, base, bottom, eave, { streets, ground });
    assert.deepEqual(none.entrances, [], `${b.name}: no streets given, no entrances`);
    const sign = Math.sign(p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0));
    for (let i = 0; i < p.length; i++) { pav.edge(p[i], p[(i + 1) % p.length], sign); none.edge(p[i], p[(i + 1) % p.length], sign); }
    pav.flush(parts); none.flush(bare);
    assert.ok(pav.entrances.length >= 1 && pav.entrances.length <= E.max, `${b.name}: ${pav.entrances.length} entrances (1..${E.max})`);
    total += pav.entrances.length;
    assert.equal(parts.facade.length, 1, `${b.name}: still one facade geometry`); assert.equal(parts.glass.length, 1, `${b.name}: still one glass geometry`);
    assert.ok(parts.facade[0].attributes.position.count > bare.facade[0].attributes.position.count, `${b.name}: the entrances add facade triangles`);
    assert.equal(bare.glass[0].attributes.position.count - parts.glass[0].attributes.position.count, pav.skippedWindows * 9, `${b.name}: only the windows under a door are dropped`);
    for (const e of pav.entrances) {
      const d = Math.hypot(e.c[0] - e.a[0], e.c[1] - e.a[1]);
      assert.ok(d >= E.minEdge && e.s >= E.margin - 1e-9 && e.s <= d - E.margin + 1e-9, `${b.name}: the door is on a long face, clear of its corners`);
      assert.ok(e.dist <= E.reach, `${b.name}: the face looks at a street within reach`);
      assert.ok(e.steps >= 1 && e.steps <= E.maxSteps, `${b.name}: ${e.steps} steps`);
    }
    // the door stands on the ground: geometry near the entrance reaches down to the tilted terrain without hanging in the air
    const pos = parts.facade[0].attributes.position, e0 = pav.entrances[0], q = e0.at, reach = E.landing + E.maxSteps * E.tread + 1;
    let lowest = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      if (Math.hypot(x - q[0], z - q[1]) > reach || Math.hypot(x - q[0], z - q[1]) < 0.05) continue;
      if (y < lowest) lowest = y;
    }
    assert.ok(lowest <= ground(...q) + 1e-6, `${b.name}: steps reach the ground (${lowest.toFixed(2)} vs ${ground(...q).toFixed(2)})`);
    for (const g of [...parts.facade, ...parts.glass, ...bare.facade, ...bare.glass]) g.dispose();
  }
  assert.ok(total >= pavilions.length && total <= pavilions.length * E.max, `${total} entrances over ${pavilions.length} pavilions`);
});
