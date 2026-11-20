// #2151: glossy surfaces indoors reflect the room — when the room probe captures (world load, a new zone, a light change,
// the settle time, phones once), which map each quality level shows, the daylight bands' hysteresis and where a zone's
// probe stands. Pure helpers of src/roomprobe.js (no GPU).   node --test tools/roomprobetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { probeMode, windowReflect, daylightBand, zoneCenter, paintedScale, ProbePlan, probeZone } from '../src/roomprobe.js';
import { ROOM_PROBE as R } from '../src/config.js';

test('quality level → mode: painted below minLevel, live on desktop, once on phones, off with &noprobe', () => {
  assert.equal(probeMode(0), 'painted');
  for (let l = R.minLevel; l <= 4; l++) assert.equal(probeMode(l), 'live', `level ${l}`);
  assert.equal(probeMode(0, { lowMemory: true }), 'painted');
  assert.equal(probeMode(2, { lowMemory: true }), 'once');
  assert.equal(probeMode(3, { off: true }), 'off');
  assert.equal(probeMode(0, { off: true }), 'off');
});

test('a 64 px probe: the same pre-filtered size as the painted room (one program for both)', () => {
  assert.equal(R.size, 64, 'roomEnv is 256 wide → PMREM cube size 256 / 4 = 64');
  for (const k of Object.values(R.k)) assert.ok(k > 0 && k <= 1);
  assert.ok(R.k.tile < R.k.porcelain && R.k.floorTile <= R.k.tile && R.k.porcelain < R.k.chrome, 'tiles low (#271), chrome strongest');
});

test('daylight bands with hysteresis', () => {
  const B = [0.1, 0.5], m = 0.05;
  assert.equal(daylightBand(0, null, B, m), 0);
  assert.equal(daylightBand(0.3, null, B, m), 1);
  assert.equal(daylightBand(0.9, null, B, m), 2);
  assert.equal(daylightBand(0.52, 1, B, m), 1, 'just over the edge: stays');
  assert.equal(daylightBand(0.56, 1, B, m), 2, 'clearly over: changes');
  assert.equal(daylightBand(0.48, 2, B, m), 2, 'just under on the way down: stays');
  assert.equal(daylightBand(0.44, 2, B, m), 1);
  assert.equal(daylightBand(0.02, 2, B, m), 0, 'a jump over two edges changes at once');
});

test('the painted room dims at night', () => {
  assert.equal(paintedScale(1), 1);
  assert.equal(paintedScale(0), R.paintedNight);
  assert.ok(paintedScale(0.5) > paintedScale(0.2));
  assert.equal(paintedScale(2), 1);
});

test('live: the first capture at once, a new zone or a light change after settling, a cached zone is shown without one', () => {
  const p = new ProbePlan({ mode: 'live', keep: 2, settle: 0.5 }), dt = 0.25;
  assert.equal(p.step(dt, null, 'a'), null, 'outdoors: nothing');
  assert.deepEqual(p.step(dt, 'kitchen', 'day'), { capture: 'kitchen', sig: 'day' }, 'world load: at once');
  p.begin('kitchen', 'day');
  assert.equal(p.step(dt, 'bath', 'day'), null, 'one capture at a time');
  assert.deepEqual(p.finish(), { key: 'kitchen', evicted: [] });
  assert.equal(p.current, 'kitchen');
  assert.equal(p.step(dt, 'kitchen', 'day'), null, 'fresh: nothing to do');
  // a new zone: captured once it has held for `settle`
  assert.equal(p.step(dt, 'bath', 'day'), null);
  assert.equal(p.step(dt, 'bath', 'day'), null);
  assert.deepEqual(p.step(dt, 'bath', 'day'), { capture: 'bath', sig: 'day' });
  p.begin('bath', 'day'); p.finish();
  // back in the kitchen: its map is still fresh → shown, no capture
  assert.deepEqual(p.step(dt, 'kitchen', 'day'), { show: 'kitchen' });
  assert.equal(p.step(dt, 'kitchen', 'day'), null);
  // the lamps go on: the signature changes → recapture after settling
  assert.equal(p.step(dt, 'kitchen', 'evening+lamps'), null);
  assert.equal(p.step(dt, 'kitchen', 'evening+lamps'), null);
  assert.deepEqual(p.step(dt, 'kitchen', 'evening+lamps'), { capture: 'kitchen', sig: 'evening+lamps' });
  p.begin('kitchen', 'evening+lamps'); p.finish();
  // the bathroom's day map is stale now
  p.step(dt, 'bath', 'evening+lamps'); p.step(dt, 'bath', 'evening+lamps');
  assert.deepEqual(p.step(dt, 'bath', 'evening+lamps'), { capture: 'bath', sig: 'evening+lamps' });
  // a lamp flicking on and off within the settle time captures nothing
  const q = new ProbePlan({ mode: 'live', settle: 0.5 });
  q.step(dt, 'k', 'a'); q.begin('k', 'a'); q.finish();
  for (let i = 0; i < 6; i++) assert.equal(q.step(dt, 'k', i % 2 ? 'a' : 'b'), null);
});

test('live: at most `keep` zones are kept, the least recently used is freed (never the one shown)', () => {
  const p = new ProbePlan({ mode: 'live', keep: 2, settle: 0 });
  const cap = (k) => { const a = p.step(0, k, 's'); assert.equal(a.capture, k); p.begin(k, 's'); return p.finish().evicted; };
  assert.deepEqual(cap('a'), []);
  assert.deepEqual(cap('b'), []);
  p.step(0, 'a', 's'); // a used again → b is the oldest
  assert.deepEqual(cap('c'), ['b']);
  assert.deepEqual([...p.cache.keys()].sort(), ['a', 'c']);
});

test('once (phones): one capture of the first zone, then never again — not for a new zone, not for a light change', () => {
  const p = new ProbePlan({ mode: 'once' });
  assert.equal(p.step(0.25, null, 'day'), null);
  assert.deepEqual(p.step(0.25, 'kitchen', 'day'), { capture: 'kitchen', sig: 'day' });
  p.begin('kitchen', 'day'); p.finish();
  for (let i = 0; i < 20; i++) {
    assert.equal(p.step(0.25, 'bath', 'night'), null);
    assert.equal(p.step(0.25, 'kitchen', 'night+lamps'), null);
  }
});

test('painted / off: never captures', () => {
  for (const mode of ['painted', 'off']) {
    const p = new ProbePlan({ mode, settle: 0 });
    for (let i = 0; i < 5; i++) assert.equal(p.step(0.25, 'kitchen', `s${i}`), null);
  }
});

test('a zone: the room centre when it is in the room, else the visitor\'s spot; keys per flat, level and room', () => {
  const regions = [{ name: 'Kök', x: 2, z: 3, area: 10 }, { name: 'Kök', x: 9, z: 9, area: 1 }, { name: 'Bad', x: 1, z: 6, area: 5 }];
  assert.deepEqual(zoneCenter(regions, 'Kök'), { x: 2, z: 3 }, 'the largest region');
  assert.equal(zoneCenter(regions, 'Kök', () => false), null, 'centre outside the room');
  assert.equal(zoneCenter(regions, 'Hall'), null);
  // a room map: x < 2 'Bad', else 'Kök'; the centre of 'Bad' (1, 6) is in it
  const map = { at: (x, z) => (x < 0 || z < 0 ? null : x < 2 ? 'Bad' : 'Kök'), regions: () => regions };
  const home = { roomMaps: [map], floorOf: () => 0.5 };
  assert.deepEqual(probeZone({ x: 0.5, z: 5 }, 0, home), { key: 'L:0:Bad', x: 1, y: 0.5 + R.height, z: 6 });
  assert.equal(probeZone({ x: -1, z: 5 }, 0, home), null, 'outside the flat');
  assert.equal(probeZone({ x: 0.5, z: 5 }, -1, home), null, 'aloft / no level');
  assert.equal(probeZone({ x: 0.5, z: 5 }, 1, home), null, 'no map for that level');
  const unit = { id: 'L1004', ox: 10, oz: 0, roomMaps: [map], levels: [{ floor: 3 }] };
  assert.deepEqual(probeZone({ x: 15, z: 5 }, 0, null, unit), { key: 'L1004:0:Kök', x: 12, y: 3 + R.height, z: 3 }, 'a visited flat: its own coordinates');
});

test('window mirror (#2179): clear by day, a body and a stronger env map on a lit evening, weaker unlit, untouched outdoors', () => {
  const W = R.window, day = windowReflect(1, true), lit = windowReflect(0, true), dark = windowReflect(0, false), out = windowReflect(0, null);
  assert.deepEqual(day, { opacity: W.opacity[0], scale: 1 });
  assert.ok(Math.abs(lit.opacity - W.opacity[1]) < 1e-9 && Math.abs(lit.scale - W.gain) < 1e-9);
  assert.ok(dark.opacity > day.opacity && dark.opacity < lit.opacity && dark.scale > 1 && dark.scale < lit.scale);
  assert.deepEqual(out, day, 'seen from outside: unchanged');
  let prev = Infinity;
  for (let d = 0; d <= 1.0001; d += 0.05) { const w = windowReflect(d, true); assert.ok(w.opacity <= prev + 1e-12, 'monotone with daylight'); prev = w.opacity; }
  assert.equal(windowReflect(W.edge[1], true).opacity, W.opacity[0], 'day from the upper edge');
  assert.ok(R.k.window > 0 && R.k.window <= 1);
});
