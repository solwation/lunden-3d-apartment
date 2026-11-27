// Contract checks, not another implementation of windowlight/sunbounce math.
// THREE_DIR may point to the import-map's local three@0.170.0 package.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

if (process.env.THREE_DIR) {
  const root = pathToFileURL(process.env.THREE_DIR + '/').href;
  register('data:text/javascript,' + encodeURIComponent(`
    const root = ${JSON.stringify(root)};
    export async function resolve(s,c,next) {
      if(s === 'three') return {url:root+'build/three.module.js',shortCircuit:true};
      if(s.startsWith('three/addons/')) return {url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};
      return next(s,c);
    }`));
}
const { windowDaylight } = await import('../export-window-light.js');
const { LEVELS, WINDOW_LIGHT } = await import('../../../src/config.js');

function world() {
  const door = { kind: 'swing', t: 0, object: { position: { y: LEVELS[0].floor } },
    segment() { return this.t ? [0, 3, 0, 4] : [0, 3, 10, 3]; } };
  return { size: { x: 10, z: 20 }, doors: [door],
    levels: LEVELS.map(l => ({ wallSegments: [], openings: {
      north: [{ win: {}, x0: 2, x1: 4, y0: l.floor + 0.8, y1: l.floor + 2.0, glass: 0.1, inner: 0.4 }], south: [],
    } })),
    blinds: { list: [{ id: 'blind0', level: 0, out: -1, x0: 2, x1: 4, cover: 0.5, dark: true }],
      curtains: [{ id: 'curtain0', level: 0, spec: { facade: 'north', glass: [2, 4] }, cover: 0.25, daylightCut: 0.6, t: 0.3 }] },
  };
}

test('snapshot is detached JSON data with real bands, full rays, stable ids and well transmission', () => {
  const w = world(), a = windowDaylight(w);
  assert.deepEqual(a, JSON.parse(JSON.stringify(a)));
  assert.deepEqual(a, windowDaylight(w));
  assert.equal(a.runtimeCoverage, 'export-snapshot');
  assert.equal(a.region, 'L1007');
  assert.equal(new Set(a.sources.map(s => s.id)).size, a.sources.length);
  assert.equal(a.sources.filter(s => s.kind === 'well').length, 2);
  for (const s of a.sources) {
    assert.equal(s.reach.length, WINDOW_LIGHT.rays);
    assert(s.reach.every(r => Number.isFinite(r) && r >= 0));
    assert.deepEqual(a.bands.find(b => b.level === s.level), { level: s.level, y0: s.y0, y1: s.y1 });
  }
  const lower = a.sources.filter(s => s.level === 0 && s.kind === 'window');
  for (const well of a.sources.filter(s => s.kind === 'well')) {
    assert.equal(well.pass, WINDOW_LIGHT.well * lower.reduce((sum, s) => sum + s.pass, 0) / lower.length);
  }
  assert.deepEqual(lower[0].blindIds, ['blind0']);
  assert.deepEqual(lower[0].curtainIds, ['curtain0']);
  a.config.tint[0] = -100;
  a.snapshot.curtains[0].glass[0] = -100;
  assert.notEqual(WINDOW_LIGHT.tint[0], -100);
  assert.equal(w.blinds.curtains[0].spec.glass[0], 2);
});

test('current door pose changes exported visibility without changing glass identity', () => {
  const w = world(), closed = windowDaylight(w);
  w.doors[0].t = 1;
  const open = windowDaylight(w);
  assert.deepEqual(open.sources.map(s => s.id), closed.sources.map(s => s.id));
  assert.notDeepEqual(open.sources[0].reach, closed.sources[0].reach);
  assert.equal(open.snapshot.doors[0].t, 1);
});

test('missing world or non-finite transmission fails instead of inventing default snapshot data', () => {
  assert.throws(() => windowDaylight({}), /complete L1007/);
  const w = world();
  w.blinds.list[0].cover = NaN;
  assert.throws(() => windowDaylight(w), /non-finite/);
});
