// #2224: Olof's computer in the Vicco Berdi secretary. Headless checks of the pure layout (src/berdi.js) against
// TILLY_DESK: the verified 110 × 45 × 140 cm outline, every device inside its compartment (nothing pokes through the
// shut fronts), the flap folding down into a writing surface at sitting height, the door swinging clear, the cabinet
// standing in the old desk's spot against the east wall. Run: node --test tools/berditest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILLY_DESK as C, FURNITURE } from '../src/config.js';
import { berdiLayout, deviceBoxes, regionOf, within, flapTop, flapOutline, doorEdge } from '../src/berdi.js';

const L = berdiLayout(C), K = C.cabinet;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('outline is the verified 110 × 45 × 140 cm Berdi in the old desk spot', () => {
  const o = L.outer;
  assert.ok(close(o.x1 - o.x0, 1.10) && close(o.z1 - o.z0, .45) && close(o.y1 - o.y0, 1.40), JSON.stringify(o));
  assert.equal(K.board, .016);
  const item = FURNITURE.filter(f => f.type === 'tillydesk');
  assert.equal(item.length, 1);
  // the movable id (and with it every saved move of the old desk) is unchanged
  assert.equal(`f-${item[0].type}-${item[0].level}-${item[0].x}-${item[0].z}-0-0`, 'f-tillydesk-1-2.292-9.43-0-0');
  assert.equal(item[0].mediaId, 'pc-olof');
  // rot 90: local -z is world +x; the back stands a few mm off the east wall's face (x 2.632), never in it
  const backX = item[0].x - o.z0;
  assert.ok(backX < 2.632 - .002 && backX > 2.62, String(backX));
  for (const b of L.boards) for (let i = 0; i < 3; i++) {
    assert.ok(b[1][i] - b[0][i] / 2 >= [o.x0, o.y0, o.z0][i] - 1e-9 && b[1][i] + b[0][i] / 2 <= [o.x1, o.y1, o.z1][i] + 1e-9, `board ${JSON.stringify(b)}`);
  }
});

test('every device sits inside its own compartment (no poke-through when shut)', () => {
  const rows = deviceBoxes(C);
  assert.equal(rows.filter(r => r[1] === 'upper' && r[0].startsWith('monitor')).length, 2, 'both monitors behind the flap');
  assert.deepEqual(rows.filter(r => r[1] === 'lower').map(r => r[0]), ['computer box']);
  for (const [name, region, box] of rows) assert.ok(within(box, regionOf(L, region)), `${name} outside ${region}: ${JSON.stringify(box)} vs ${JSON.stringify(regionOf(L, region))}`);
  // behind a front means behind the carcass front edge, where the shut flap/door lie
  for (const r of ['upper', 'lower']) assert.ok(close(regionOf(L, r).z1, L.outer.z1 - K.board));
  console.log({ devices: rows.length, upper: rows.filter(r => r[1] === 'upper').length });
});

test('the shut fronts cover their openings', () => {
  const [fx, fy, fz] = L.flap.hinge, [fw, fl] = L.flap.size;
  assert.ok(fx - fw / 2 <= L.upper.x0 && fx + fw / 2 >= L.upper.x1, 'flap spans the cavity');
  assert.ok(fy <= L.upper.y0 && fy + fl >= L.upper.y1, 'flap spans the cavity height');
  assert.ok(close(fz, L.outer.z1));
  const [dx, dy] = L.door.hinge, [dw, dh] = L.door.size;
  assert.ok(dx <= L.lower.x0 && dx + dw >= L.lower.x1, 'door spans the computer compartment');
  // (a reveal of at most `gap` under the shelf board's edge, like the flap's at the top)
  assert.ok(dy <= L.lower.y0 && dy + dh >= L.lower.y1 - K.gap - 1e-9, 'door spans its height');
  assert.ok(fy + fl >= L.outer.y1 - K.gap - 1e-9);
  assert.ok(dy + dh < fy, 'door and flap do not overlap');
});

test('open, the flap is a writing surface at sitting height and the door swings clear', () => {
  const shut = flapTop(L, 0), open = flapTop(L, K.flapMax * Math.PI / 180);
  assert.ok(close(shut.y, L.flap.hinge[1] + L.flap.size[1]) && close(shut.reach, L.outer.z1));
  assert.ok(close(open.y, L.upper.y0, 1e-9), 'flat flap level with the cavity floor');
  assert.ok(open.y > .68 && open.y < .78, `writing height ${open.y}`);
  assert.ok(close(L.desk.y, open.y) && L.desk.z1 < open.reach && L.desk.z0 > L.outer.z1);
  const outline = flapOutline(L, Math.PI / 2);
  assert.ok(close(outline[1][1] - outline[0][1], L.flap.size[1]));
  const [ex, ez] = doorEdge(L, K.doorMax * Math.PI / 180);
  assert.ok(ez > L.outer.z1 && ex < L.door.hinge[0] + .1, `door edge ${ex}, ${ez}`);
  // in the default spot the open door's edge stays clear of the room door's sweep (world z 8.616)
  const item = FURNITURE.find(f => f.type === 'tillydesk');
  assert.ok(item.z + L.door.hinge[0] - .02 > 8.616);
});
