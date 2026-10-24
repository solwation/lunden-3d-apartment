// node --test tools/brickstyletest.mjs — #1556: the old Sankt Lars pavilions wear nr 41's brick style (src/brickstyle.js)
// on their own OSM footprints, storeys and eaves, as one geometry per southbackdrop batch (no extra draw calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SITE } from '../src/config.js';
import { brickPavilion, BRICK_STYLE } from '../src/brickstyle.js';

const S = SITE.south, P = S.brickStyle;
const pavilions = S.buildings.filter(b => P.sources.includes(b.source));

test('every listed source is an existing generic four-storey pavilion, listed once', () => {
  assert.equal(new Set(P.sources).size, P.sources.length);
  assert.equal(pavilions.length, P.sources.length);
  for (const b of pavilions) assert.ok(!b.template && b.levels >= 4 && b.roof === 'hipped', b.name);
});

test('walls, friezes and windows stay on the footprint, between the ground and the eave, in one geometry per batch', () => {
  const base = 2, bottom = 1.5;
  for (const b of pavilions) {
    const p = b.polygon.slice(0, -1), eave = base + b.levels * S.storey, parts = { facade: [], roof: [], glass: [] }, pav = brickPavilion(b, base, bottom, eave);
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
    assert.equal(parts.glass[0].attributes.position.count / 9, windows, `${b.name}: one 3-triangle pane per generic window position`);
    const xs = p.map(q => q[0]), zs = p.map(q => q[1]), box = new THREE.Box3().setFromBufferAttribute(parts.facade[0].attributes.position);
    assert.ok(box.min.x > Math.min(...xs) - 0.5 && box.max.x < Math.max(...xs) + 0.5 && box.min.z > Math.min(...zs) - 0.5 && box.max.z < Math.max(...zs) + 0.5, `${b.name}: on its footprint`);
    assert.ok(box.min.y >= bottom - 1e-6 && box.max.y <= eave + 1e-6, `${b.name}: between the ground and the eave`);
    const col = parts.facade[0].attributes.color, brick = new THREE.Color(BRICK_STYLE.brick), plinth = new THREE.Color(BRICK_STYLE.plinth), frame = new THREE.Color(BRICK_STYLE.frame);
    const has = c => { for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - c.r) + Math.abs(col.getY(i) - c.g) + Math.abs(col.getZ(i) - c.b) < 1e-6) return true; return false; };
    assert.ok(has(brick) && has(plinth) && has(frame), `${b.name}: brick, white plinth and white frames`);
    for (const g of [...parts.facade, ...parts.glass]) g.dispose();
  }
});
