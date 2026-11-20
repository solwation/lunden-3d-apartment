// #2197: node --test tools/sunbouncetest.mjs  (the sun patch's warm bounce: patch projection, clip, wall clamp, colour, fall-off, window uniforms)
import test from 'node:test';
import assert from 'node:assert/strict';
import { WINDOW_LIGHT as WL } from '../src/config.js';
import { sunPatch, clampPatch, bounceColor, bounceAt } from '../src/sunbounce.js';
import { windowSources, castWindow, WindowLight, windowLightUniforms as U } from '../src/windowlight.js';

// a north-facing-wall window (inward normal +z): glass at z 0.1, x 2…4, y 0.8…2.4; sun from the north-west... outside = -z side
const SRC = { x: 3, y: 1.6, z: 0.1, nx: 0, nz: 1, hw: 1, hh: 0.8 };
const sunFrom = (el, az) => ({ x: Math.cos(el) * Math.sin(az), y: Math.sin(el), z: Math.cos(el) * Math.cos(az) });
const N = sunFrom(0.5, Math.PI); // sun in the north (z < 0), i.e. outside this window: dir.z < 0

test('the patch lands on the floor inside the room, in the sun direction', () => {
  const d = { x: 0, y: Math.sin(0.5), z: -Math.cos(0.5) };
  const p = sunPatch(SRC, d, 0, 3, 1);
  assert.equal(p.y, 0);
  assert.ok(p.z > 0.1, 'inward of the glass');
  assert.ok(Math.abs(p.x - 3) < 1e-9);
  assert.ok(Math.abs(p.z - (0.1 + 1.6 / Math.tan(0.5))) < 1e-9);
  assert.ok(p.flux > 0 && p.area > 0);
});

test('no patch: sun behind the façade, below the horizon, no light, shut blinds', () => {
  const inside = { x: 0, y: 0.5, z: 0.8 }; // sun on the room side of this window
  assert.equal(sunPatch(SRC, inside, 0, 3, 1), null);
  const down = { x: 0, y: -0.2, z: -0.9 };
  assert.equal(sunPatch(SRC, down, 0, 3, 1), null);
  const d = { x: 0, y: 0.5, z: -0.86 };
  assert.equal(sunPatch(SRC, d, 0, 0, 1), null);
  assert.equal(sunPatch(SRC, d, 0, 3, 0), null);
  assert.equal(sunPatch(SRC, null, 0, 3, 1), null);
});

test('lower sun: a longer patch with more area; flux follows the glass cosine, the pass and the intensity', () => {
  const hi = sunPatch(SRC, { x: 0, y: 0.8, z: -0.6 }, 0, 3, 1), lo = sunPatch(SRC, { x: 0, y: 0.3, z: -0.954 }, 0, 3, 1);
  assert.ok(lo.z > hi.z && lo.area > hi.area);
  assert.ok(lo.area <= WL.sunMaxArea);
  assert.ok(Math.abs(sunPatch(SRC, { x: 0, y: 0.8, z: -0.6 }, 0, 6, 0.5).flux - hi.flux * 1.0) < 1e-9, '2 × intensity × half pass');
  const oblique = sunPatch(SRC, { x: 0.6, y: 0.5, z: -0.62 }, 0, 3, 1);
  assert.ok(oblique.flux < sunPatch(SRC, { x: 0, y: 0.5, z: -0.866 }, 0, 3, 1).flux, 'sun raking along the façade lets less in');
});

test('a patch beyond the room reach is pulled in with less flux', () => {
  const p = sunPatch(SRC, { x: 0, y: 0.3, z: -0.954 }, 0, 3, 1);
  const q = clampPatch(p, 3, 0.15, 2);
  assert.ok(Math.hypot(q.x - 3, q.z - 0.15) <= 2 + 1e-9);
  assert.ok(Math.abs(q.flux - p.flux * WL.sunBeyond) < 1e-9);
  assert.equal(clampPatch(p, 3, 0.15, 99), p);
  assert.equal(clampPatch(null, 0, 0, 1), null);
});

test('colour: the floor tints the sun; the wall nearest the patch and the ceiling get light, the floor itself and far walls hardly', () => {
  const c = bounceColor([1, 0.9, 0.8], WL.floor);
  assert.ok(c[0] > c[1] && c[1] > c[2], 'warm: red > green > blue');
  const p = { x: 3, y: 0, z: 3, flux: 10, area: 2 };
  const nearWall = bounceAt(p, { x: 3, y: 1.2, z: 4 }, { x: 0, y: 0, z: -1 });
  const farWall = bounceAt(p, { x: 3, y: 1.2, z: 8 }, { x: 0, y: 0, z: -1 });
  const ceiling = bounceAt(p, { x: 3, y: 2.5, z: 3 }, { x: 0, y: -1, z: 0 });
  assert.ok(nearWall > farWall * 3, 'falls off with distance');
  assert.ok(ceiling > 0);
  assert.equal(bounceAt(p, { x: 4, y: 0, z: 3 }, { x: 0, y: 1, z: 0 }), 0, 'the floor lights itself with nothing');
  assert.equal(bounceAt(null, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), 0);
});

test('WindowLight feeds the uniforms: patch and area per window, colour; nothing at night', () => {
  const openings = [{ north: [{ x0: 2, x1: 4, y0: 0.8, y1: 2.4, win: {}, glass: 0.1, inner: 0.4 }], south: [] }];
  const src = windowSources(openings, [{ y0: -0.1, y1: 2.6 }]);
  const walls = [[0, 0.4, 6, 0.4], [6, 0, 6, 8], [0, 8, 6, 8], [0, 0, 0, 8]];
  for (const s of src) castWindow(s, walls);
  const wl = new WindowLight([{ id: 't', sources: src, box: { x0: 0, x1: 6, z0: 0, z1: 8, y0: -0.1, y1: 2.6 }, segs: () => walls }]);
  const env = (i) => ({ eye: { x: 3, y: 1.6, z: 3 }, sky: { r: 1, g: 1, b: 1 }, skyLight: 1, day: 1, fill: null, blinds: [], curtains: [], sunDir: { x: 0, y: 0.6, z: -0.8 }, sunLight: { intensity: i, color: { r: 1, g: 0.95, b: 0.86 } } });
  wl.update(0.016, env(3));
  assert.ok(U.winSun.value[3] > 0 && U.winSun.value[1] === 0, 'flux > 0 on the floor (y 0)');
  assert.ok(U.winSrc.value[13] > 0, 'area');
  assert.ok(U.winSunC.value[0] > U.winSunC.value[2], 'warm');
  wl.update(0.016, env(0));
  assert.equal(U.winSun.value[3], 0, 'no sun: no bounce');
});
