// #1832: actual Player movement and collision; simple supported lanes isolate pace from scene decoration.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
if (process.env.THREE_DIR) register('data:text/javascript,' + encodeURIComponent(`
const root=${JSON.stringify(pathToFileURL(process.env.THREE_DIR + '/').href)};
export async function resolve(s,c,n){if(s==='three')return{url:root+'build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return{url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
const T = await import('three');
const { Player } = await import('../src/player.js');
const { PLAYER, GARAGE } = await import('../src/config.js');
const world = () => ({ size: { x: 6, z: 12.7 }, levels: [{ segments: [], footprints: [] }, { segments: [], footprints: [] }], doors: [] });
function sample({ inside = false, keys = ['KeyW'], analog = { x: 0, y: 0 }, setup, dt = 1 / 60, seconds = .5, boost = 1, crouch = false } = {}) {
  const w = world(); setup?.(w);
  const p = new Player(w, new T.PerspectiveCamera());
  p.spawn(inside ? 1.3 : -10, inside ? .8 : -8, inside ? Math.PI : Math.PI / 2);
  if (w.garage) { p.pos.y = GARAGE.floor; p.eyeY = GARAGE.floor + PLAYER.eye; }
  p.keys = new Set(keys); p.analog = analog; p.boost = boost; p.crouch = crouch;
  const start = p.pos.clone(); for (let i = 0; i < Math.round(seconds / dt); i++) p.update(dt);
  return { p, distance: Math.hypot(p.pos.x - start.x, p.pos.z - start.z), speed: Math.hypot(p.pos.x - start.x, p.pos.z - start.z) / seconds };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} should equal ${b}`);

test('outdoor sprint rises from 3.2 to 4.8m/s; ordinary walking and indoor sprint retain their old paces', () => {
  near(sample().speed, 1.6); near(sample({ inside: true }).speed, 1.6);
  near(sample({ keys: ['KeyW', 'ShiftLeft'] }).speed, 4.8);
  near(sample({ inside: true, keys: ['KeyW', 'ShiftRight'] }).speed, 3.2);
  near(PLAYER.run, 3.2); near(PLAYER.walk, 1.6);
});
test('full touch stick uses faster outdoor sprint, partial stick/crouch retain walk pace; diagonal does not multiply speed', () => {
  near(sample({ keys: [], analog: { x: 0, y: 1 } }).speed, PLAYER.runOutdoor);
  near(sample({ keys: [], analog: { x: 0, y: .5 } }).speed, PLAYER.walk * .5);
  near(sample({ inside: true, keys: [], analog: { x: 0, y: 1 } }).speed, PLAYER.run);
  near(sample({ keys: ['KeyW', 'KeyD', 'ShiftLeft'] }).speed, PLAYER.runOutdoor);
  near(sample({ keys: ['KeyW', 'ShiftLeft'], crouch: true }).speed, PLAYER.walk * PLAYER.crouchSpeed);
});
test('core, basement garage, visited flat and hidden room all keep indoor sprint despite exterior footprints', () => {
  const setups = [
    w => { w.core = { contains: () => true, covers: () => true, heights: () => [0], segments: () => [[], []], snap() {} }; },
    w => { w.garage = { inside: () => true, segments: [], dynamic: () => [], obstacles: () => [] }; },
    w => { w.unitAt = () => ({ floors: () => [0], levelAt: () => 0, ground: false, fixed: [[]], stairHeight: () => null, stairUnderside: () => null, doorSegments: () => [] }); },
    w => { w.playroom = { inside: true, contains: () => true, floorAt: () => 0, segments: [], footprints: [] }; },
  ];
  for (const setup of setups) near(sample({ keys: ['KeyW', 'ShiftLeft'], setup }).speed, PLAYER.run);
});
test('5cm substeps stop outdoor sprint and coffee-boosted sprint at a thin wall, including a one-second frame', () => {
  for (const dt of [1 / 60, 1 / 30, 1 / 15, 1]) for (const boost of [1, 1.8]) {
    const { p } = sample({ keys: ['KeyW', 'ShiftLeft'], dt, seconds: 2, boost, setup: w => w.levels[0].segments.push([-12, -15, -12, 0]) });
    near(p.pos.x, -12 + PLAYER.radius); assert.ok(p.pos.x > -12);
  }
});

test('actual composed Core.contains keeps representative L/A/B/C stairwell points at indoor pace', async () => {
  const { Core } = await import('../src/core.js'), { CoreHouse } = await import('../src/corehouse.js');
  const { CORE_A, CORE_B, CORE_C } = await import('../src/config.js');
  const core = Object.create(Core.prototype);
  core.parts = [CORE_A, CORE_B, CORE_C].map(C => Object.assign(Object.create(CoreHouse.prototype), {
    Y: C.stops, B: C.band, CEILTOP: C.stops.at(-1) + C.ceilingTop,
    car: [Infinity, Infinity, Infinity, Infinity], zones: [], floors: [],
  }));
  const samples = [['L', -17.3, 5, 0], ...[CORE_A, CORE_B, CORE_C].map(C => [C.house, (C.band.x0 + C.band.x1) / 2, (C.band.z0 + C.band.z1) / 2, C.stops[1]])];
  const w = world(); w.core = core; const p = new Player(w, new T.PerspectiveCamera());
  for (const [house, x, z, y] of samples) {
    p.pos.set(x, y, z);
    assert.equal(core.contains(x, z, y), true, house);
    assert.equal(p.inCore, true, house);
    near(p.runSpeed, PLAYER.run);
  }
});
