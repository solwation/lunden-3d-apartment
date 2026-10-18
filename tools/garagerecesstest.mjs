// node --test tools/garagerecesstest.mjs — basement outdoor recess ceiling & lintel exclusion (#1270)
import test from 'node:test';
import assert from 'node:assert/strict';

const ctx = new Proxy({}, {
  get: (target, prop) => {
    if (prop === 'measureText') return () => ({ width: 0 });
    if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  }
});
globalThis.document = {
  createElement: () => ({ getContext: () => ctx, width: 0, height: 0 })
};

const { Garage } = await import('../src/garage.js');
const { GARAGE: G } = await import('../src/config.js');

test('doorway lintel filter excludes outdoor recesses', () => {
  const doorwayRects = G.rects.filter(q => !q.outside && Math.min(q.x1 - q.x0, q.z1 - q.z0) < 0.7);
  assert.ok(!doorwayRects.some(r => r.id === 'parkARecess'), 'parkARecess must not be treated as a doorway');
  assert.ok(!doorwayRects.some(r => r.outside), 'no outside rect must be in doorway lintel filter');
  assert.ok(doorwayRects.some(r => r.id === 'parkADoor'), 'parkADoor must have doorway lintel');
  assert.ok(doorwayRects.some(r => r.id === 'parkASide'), 'parkASide must have doorway lintel');
});

test('garage shell geometry excludes ceiling/lintel over park recesses', () => {
  const g = new Garage();

  // Hus A: parkARecess is x0: -9.76, x1: -9.12, z0: 41.4, z1: 43.4
  const shellA = g.areas.hallE.group.children[0];
  const posA = shellA.geometry.attributes.position.array;
  let ceilingVertsA = 0;
  for (let i = 0; i < posA.length; i += 3) {
    const x = posA[i], y = posA[i + 1], z = posA[i + 2];
    if (x > -9.75 && x < -9.13 && z > 41.41 && z < 43.39) {
      if (Math.abs(y - G.ceiling) < 1e-3 || Math.abs(y - (G.floor + G.doorHead)) < 1e-3) {
        ceilingVertsA++;
      }
    }
  }
  assert.equal(ceilingVertsA, 0, 'No ceiling or lintel soffit vertices inside Hus A outdoor recess');

  // Hus B: parkBRecess is x0: -23.52, x1: -22.6, z0: 46.1, z1: 48.1
  const shellB = g.areas.hallW.group.children[0];
  const posB = shellB.geometry.attributes.position.array;
  let ceilingVertsB = 0;
  for (let i = 0; i < posB.length; i += 3) {
    const x = posB[i], y = posB[i + 1], z = posB[i + 2];
    if (x > -23.51 && x < -22.61 && z > 46.11 && z < 48.09) {
      if (Math.abs(y - G.ceiling) < 1e-3) {
        ceilingVertsB++;
      }
    }
  }
  assert.equal(ceilingVertsB, 0, 'No ceiling vertices inside Hus B outdoor recess');
});
