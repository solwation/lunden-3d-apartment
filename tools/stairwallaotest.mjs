// Verification for issue #1273:
// Stairwell inner corner AO must run continuously across floor/ceiling holes and slab band.
import { readFileSync } from 'fs';
import assert from 'node:assert';
import test from 'node:test';
import { buildWallAO } from '../src/ao.js';

test('stairwell corner AO is continuous from Level 0 through slab to Level 1 without gaps (#1273)', () => {
  const plan = JSON.parse(readFileSync('./data/plan.json', 'utf8'));
  const floorHole = { x0: 3.86, x1: 5.5512, z0: 5.7044, z1: 7.6042 };

  // Level 1 (upper floor: y0 = 2.8, yC = 5.3)
  const pieces1 = plan.floors[1].walls.map(w => ({ pts: w.outer, y0: 2.8, y1: 5.3 }));
  const blockers1 = pieces1.map(p => p.pts);
  const mesh1 = buildWallAO(plan.floors[1].size, 2.8, 5.3, pieces1, blockers1, { floorHole, slabBottom: 2.5 });

  // Level 0 (ground floor: y0 = 0.0, yC = 2.5)
  const pieces0 = plan.floors[0].walls.map(w => ({ pts: w.outer, y0: 0.0, y1: 2.5 }));
  const blockers0 = pieces0.map(p => p.pts);
  const mesh0 = buildWallAO(plan.floors[0].size, 0.0, 2.5, pieces0, blockers0, { ceilHole: floorHole });

  // Extract quads near east stair corner (x ≈ 5.55, z ≈ 5.70)
  const findCornerBands = (mesh) => {
    const pos = mesh.geometry.attributes.position;
    const dist = mesh.geometry.attributes.aDist;
    const bands = [];
    for (let i = 0; i < pos.count; i += 6) {
      const xs = [0, 1, 2, 3, 4, 5].map(k => pos.getX(i + k));
      const ys = [0, 1, 2, 3, 4, 5].map(k => pos.getY(i + k));
      const zs = [0, 1, 2, 3, 4, 5].map(k => pos.getZ(i + k));
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);

      // East wall facing west at x ≈ 5.55 in the north corner (z ≈ 5.70 to 6.50)
      if (minX > 5.5 && minZ < 5.8 && maxZ > 5.65) {
        bands.push({ y0: minY, y1: maxY, d0: dist.getX(i), d1: dist.getY(i), d2: dist.getZ(i) });
      }
    }
    return bands.sort((a, b) => a.y0 - b.y0);
  };

  const bands0 = findCornerBands(mesh0);
  const bands1 = findCornerBands(mesh1);

  assert(bands0.length > 0, 'Level 0 must have corner AO bands in stairwell');
  assert(bands1.length > 0, 'Level 1 must have corner AO bands in stairwell');

  // Level 0 must reach all the way up to y = 2.50
  const top0 = Math.max(...bands0.map(b => b.y1));
  assert(Math.abs(top0 - 2.5) < 0.01, `Level 0 corner AO top should reach 2.50, got ${top0}`);

  // Level 1 must start at slabBottom y = 2.50
  const bot1 = Math.min(...bands1.map(b => b.y0));
  assert(Math.abs(bot1 - 2.5) < 0.01, `Level 1 corner AO bottom should reach slabBottom 2.50, got ${bot1}`);

  // Check continuity in Level 1 from 2.50 up to ceiling (5.30)
  let curY = 2.5;
  for (const b of bands1) {
    if (b.y0 <= curY + 0.01) {
      curY = Math.max(curY, b.y1);
    }
  }
  assert(curY >= 5.29, `Level 1 corner AO must be continuous up to ceiling, stopped at ${curY}`);

  // Corner band across floorHole must not have floor darkening (d0 == 100)
  const holeBand1 = bands1.find(b => b.y0 <= 2.8 && b.y1 >= 3.0);
  assert(holeBand1, 'Must have a corner band spanning across floor slab/hole');
  assert(holeBand1.d0 >= 99, `Corner band in floorHole must have d0=FAR (no floor band), got ${holeBand1.d0}`);
});
