import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { riverAt } from '../src/riverbridge.js';
import { swimBedY } from '../src/farwalk.js';
import { creditMovement, MOVEMENT_COUNTERS } from '../src/movementstats.js';
import { BICYCLE, SWIM, PLAYER } from '../src/config.js';
import { MEDALS, thresholdOf, levelOf } from '../src/medalcatalog.js';
import { COUNTERS, boardCounters } from '../src/boardcatalog.js';
import { clampCounters } from '../cloudflare/boards.js';
import worker from '../cloudflare/worker.js';

function swimmer() {
  const p = new Player({}, new THREE.PerspectiveCamera()), s = {}, r = riverAt(100, 120);
  p.pos.set(r.x, swimBedY(r.x, r.z), r.z);
  p.swim = { t: 0, stuck: 0, depth: 0, exit: null };
  p.segments = () => [[], []]; // isolated terrain fixture; production swim movement/collisions remain real
  p.edgeNotice = () => {};
  p.onSwimTravel = (m, dt, under) => creditMovement(s, 'swim', m, dt, under);
  return { p, s };
}

test('actual Player swimStep excludes current-only drift and collision-rejected own movement', () => {
  const { p, s } = swimmer(), start = p.pos.clone();
  for (let i = 0; i < 20; i++) p.swimStep(.05, 0, 0, 0);
  assert.ok(p.pos.distanceTo(start) > .2, 'real current moves the body');
  assert.equal(s.swimMetres, undefined, 'current is not own travel');
  for (let i = 0; i < 20; i++) p.swimStep(.05, 1, 0, 1);
  assert.ok(Math.abs(s.swimMetres - SWIM.speed) < 1e-8);
  // A wall one radius ahead, parallel to the local current: real pushOut rejects the forward stroke.
  p.pos.copy(start); const r = riverAt(start.x, start.z), x = start.x + r.nx * PLAYER.radius, z = start.z + r.nz * PLAYER.radius;
  p.camera.rotation.y = Math.atan2(-r.nx, -r.nz);
  p.segments = () => [[[x - r.nz * 10, z + r.nx * 10, x + r.nz * 10, z - r.nx * 10]], []];
  const before = s.swimMetres;
  for (let i = 0; i < 20; i++) p.swimStep(.05, 1, 0, 1);
  assert.ok(s.swimMetres - before < .001, 'wall rejects strokes while allowing tangential current drift');
});

test('actual dive producer counts only fully submerged intervals; exit and surface give zero', () => {
  const { p, s } = swimmer();
  for (let i = 0; i < 20; i++) p.swimStep(.05, 0, 0, 0);
  assert.equal(s.diveSeconds, undefined);
  p.crouch = true; p.swim.depth = 1;
  for (let i = 0; i < 20; i++) p.swimStep(.05, 0, 0, 0);
  assert.ok(Math.abs(s.diveSeconds - 1) < 1e-8);
  p.crouch = false; p.swim.depth = 0;
  p.swimStep(.05, 0, 0, 0);
  assert.ok(Math.abs(s.diveSeconds - 1) < 1e-8);
  p.swim.exit = { x: p.pos.x + 1, z: p.pos.z };
  p.swimStep(.05, 1, 0, 1);
  assert.ok(Math.abs(s.diveSeconds - 1) < 1e-8);
});

test('actual bicycle producer counts accepted travel, not idle, blocked moves or a rescue teleport', () => {
  const p = new Player({}, new THREE.PerspectiveCamera()), s = {};
  p.riding = { yaw: Math.PI / 2, speed: 0, pitch: 0 };
  p.bikeSupport = () => ({ y: 0, pitch: 0 }); p.bikeRiseAllowed = () => true;
  p.bikeSteepUp = () => false; p.bikeHull = () => true;
  p.bikePose = p.edgeNotice = () => {}; p.bikeSplash = () => {};
  p.onCycleTravel = (m, dt) => creditMovement(s, 'cycle', m, dt);
  p.bikeStep(.05); assert.equal(s.cycleMetres, undefined);
  p.keys.add('KeyW');
  for (let i = 0; i < 20; i++) p.bikeStep(.05);
  assert.ok(s.cycleMetres > 1 && s.cycleMetres < 6);
  const before = s.cycleMetres; p.bikeHull = () => false;
  for (let i = 0; i < 20; i++) p.bikeStep(.05);
  assert.equal(s.cycleMetres, before);
  p.bikeHull = () => true; p.bikeSplash = () => p.pos.set(1000, 0, 1000);
  p.bikeStep(.05); assert.ok(s.cycleMetres - before < .02, 'rescue position is outside the counted block');
  const paused = s.cycleMetres; p.bikeStep(0); assert.equal(s.cycleMetres, paused);
});

test('counter guards bound physical increments and reject invalid time, values and other riding modes', () => {
  const s = {};
  for (const dt of [0, -.1, NaN, Infinity, .101, 60]) assert.equal(creditMovement(s, 'swim', 1, dt, true), false);
  for (const m of [-1, NaN, Infinity]) assert.equal(creditMovement(s, 'cycle', m, .05), false);
  assert.equal(creditMovement(s, 'scooter', 1, .05), false);
  assert.deepEqual(s, {});
  creditMovement(s, 'cycle', 1e9, .1); assert.equal(s.cycleMetres, BICYCLE.motion.maxSpeed * .1);
  creditMovement(s, 'swim', 1e9, .1, true); assert.equal(s.swimMetres, (SWIM.speed + SWIM.kick.speed) * .1);
  assert.equal(s.diveSeconds, .1);
});

test('new counters share catalog curves, floor wire values, preserve old IDs and have bounded Worker growth', () => {
  for (const [id, key, base] of [['cycling', 'cycleMetres', 1000], ['swimming', 'swimMetres', 100], ['diving', 'diveSeconds', 60]]) {
    const m = MEDALS.find(m => m.id === id);
    assert.equal(m.counter, key); assert.equal(thresholdOf(m, 1), base);
    assert.equal(levelOf(m, base - 1), 0); assert.equal(levelOf(m, base), 1);
    assert.equal(levelOf(m, 1e12), 10); assert.ok(COUNTERS[key].start >= base);
  }
  assert.equal(new Set(MEDALS.map(m => m.id)).size, MEDALS.length);
  assert.ok(['steps', 'jetpack', 'astronaut', 'fish', 'outdoorcats', 'tasks'].every(id => MEDALS.some(m => m.id === id)));
  assert.deepEqual(boardCounters({ cycleMetres: 1000.9, swimMetres: 100.9, diveSeconds: 60.9, route: [1, 2], notACounter2229: 12 }),
    { cycleMetres: 1000, swimMetres: 100, diveSeconds: 60 });
  const huge = Object.fromEntries(MOVEMENT_COUNTERS.map(k => [k, 1e12]));
  const first = clampCounters(huge, null, 0);
  for (const key of MOVEMENT_COUNTERS) assert.equal(first[key], COUNTERS[key].start);
  const later = clampCounters(huge, { c: first, t: 1000 }, 61000);
  for (const key of MOVEMENT_COUNTERS) assert.equal(later[key], first[key] + COUNTERS[key].perMin * 2); // existing one-minute slack
  assert.deepEqual(clampCounters(Object.fromEntries(MOVEMENT_COUNTERS.map(k => [k, 0])), { c: later, t: 61000 }, 121000), later);
});

test('actual local Worker POST accepts all three counters and derives medals in isolated storage', async () => {
  const map = new Map(), storage = { async get(k) { return map.get(k); }, async put(k, v) { map.set(k, v); }, async delete(k) { map.delete(k); },
    async list(o = {}) { return new Map([...map].filter(([k]) => k.startsWith(o.prefix ?? ''))); } };
  const response = await worker.fetch(new Request('https://fixture.test/boards', { method: 'POST', headers: {
    Origin: 'https://solwation.github.io', 'Content-Type': 'text/plain', 'CF-Connecting-IP': '192.0.2.223' },
    body: JSON.stringify({ id: 'movement-2230', name: 'Rörelsetest', c: { cycleMetres: 1000.8, swimMetres: 100.2, diveSeconds: 60.8, route: 'never stored' }, medals: { cycling: 50 } }) }), { boardStorage: storage });
  assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.ok, true); assert.equal(body.wrote, true);
  for (const id of ['cycling', 'swimming', 'diving']) assert.equal(body.m[id].length, 1);
  assert.deepEqual(map.get('b:movement-2230').c, { cycleMetres: 1000, swimMetres: 100, diveSeconds: 60 });
  assert.equal(JSON.stringify([...map.values()]).includes('never stored'), false);
});
