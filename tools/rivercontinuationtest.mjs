// #1814: source registration, actual emitted water/land joins, and bounded existing batches.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SITE, EDGE_BACKDROP as E, WALK } from '../src/config.js';
import { geoToPlan } from '../src/sitegeo.js';
import { riverPath } from '../src/riverbridge.js';

test('the extra plan positions reuse the archived river; only the final western fog tail is assumed', () => {
  const source = JSON.parse(fs.readFileSync('docs/references/surrounding-views/osm-2026-10-08.json')).features.find(f => f.id === '137217705');
  const points = source.points.map(p => geoToPlan(...p));
  const sourced = [...SITE.river.downstream.path.slice(0, -1), ...E.rivers[0].path.slice(1), ...E.rivers[1].path.slice(1, -1)];
  for (const p of sourced) assert(points.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < .008), `archived OSM vertex ${p}`);
  assert.equal(SITE.river.path.length, 25, 'historical station indexing retained');
  assert.deepEqual(riverPath.slice(0, 25), SITE.river.path);
  assert.deepEqual(riverPath.at(-1), E.rivers[1].path[0]);
  assert.deepEqual(SITE.river.upstream.boundary, E.rivers[0].path[0]);
  for (const r of E.rivers) {
    const [x,z] = r.path.at(-1), W = WALK;
    const distance = Math.hypot(x - Math.max(W.x0,Math.min(W.x1,x)), z - Math.max(W.z0,Math.min(W.z1,z)));
    assert(distance > SITE.south.view.fogFar, `${r.name} endpoint beyond normal fog from the walking/flying rectangle (${distance})`);
  }
});

