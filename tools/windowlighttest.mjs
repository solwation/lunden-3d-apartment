// #2152: node --test tools/windowlighttest.mjs  (the windows' sky light indoors: lights chunk patch, window sources, visibility,
// fall-off, blinds dimming, nearest-window / flat choice, quality / night fallback, door re-cast). three 0.170.0 resolvable as 'three'.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { WINDOW_LIGHT as WL, BLINDS } from '../src/config.js';
import { installWindowLight, windowLightUniforms as U, windowSources, castWindow, windowIrradiance, windowPass, pickWindows, pickRegion,
  baseFactor, homeRegion, WindowLight } from '../src/windowlight.js';

// A 6 m wide, 8 m deep one-storey flat: north window (glass z 0.1, inner face 0.4) at x 2…4, a wall at z 5 with a 0.9 m doorway
// at x 4.5…5.4 (a door leaf closing it), south window at x 1…2.5 (glass z 7.9, inner 7.6).
const BANDS = [{ y0: -0.1, y1: 2.6 }];
const OPENINGS = [{
  north: [{ x0: 2, x1: 4, y0: 0.8, y1: 2.4, win: {}, glass: 0.1, inner: 0.4 }, { x0: 0.5, x1: 1.4, y0: 0, y1: 2.1, entryPane: true }],
  south: [{ x0: 1, x1: 2.5, y0: 0.7, y1: 2.3, win: {}, glass: 7.9, inner: 7.6 }],
}];
const WALLS = [[0, 0.4, 6, 0.4], [6, 0, 6, 8], [0, 7.6, 6, 7.6], [0, 0, 0, 8], [0, 5, 4.5, 5], [5.4, 5, 6, 5]];
const door = { t: 0, kind: 'hinged', object: { position: { y: 1 } }, segment() { return this.t > 0.5 ? [5.4, 5, 5.4, 5.9] : [4.5, 5, 5.4, 5]; } };
const world = { size: { x: 6, z: 8 }, levels: [{ openings: OPENINGS[0], wallSegments: WALLS }], doors: [door] };
const L = [{ floor: 0, ceiling: 2.5 }, { floor: 3, ceiling: 2.5 }];
const UP = { x: 0, y: 1, z: 0 }, DOWN = { x: 0, y: -1, z: 0 }, SOUTH = { x: 0, y: 0, z: 1 }, NORTH = { x: 0, y: 0, z: -1 };

const sources = () => { const s = windowSources(OPENINGS, BANDS); for (const w of s) castWindow(w, [...WALLS, door.segment()]); return s; };

test('the lights chunks are patched once and every lit ShaderLib entry shares the window uniforms by reference', () => {
  assert.equal(installWindowLight(), false, 'already installed at import');
  const E = T.ShaderChunk.lights_fragment_end;
  assert.equal(E.split('windowLight( irradiance').length - 1, 1, 'one call');
  assert.ok(E.indexOf('windowLight(') < E.indexOf('RE_IndirectDiffuse( irradiance'), 'before the indirect diffuse is applied');
  assert.match(T.ShaderChunk.lights_pars_begin, /uniform vec4 winSrc\[ WL_MAX \* 3 \];/);
  for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon']) {
    assert.equal(T.ShaderLib[k].uniforms.winSrc, U.winSrc, k);
    const c = T.UniformsUtils.clone(T.ShaderLib[k].uniforms);
    assert.equal(c.winSrc.value, U.winSrc.value, `${k}: a material's clone keeps the shared array`);
  }
  assert.equal(T.ShaderLib.basic.uniforms.winSrc, undefined, 'unlit materials untouched');
});

test('window sources: glass centre, inward normal and size; a glazed entrance door is no window', () => {
  const [n, s] = windowSources(OPENINGS, BANDS, 10, 20);
  assert.equal(windowSources(OPENINGS, BANDS).length, 2);
  assert.deepEqual([n.x, n.z, n.nz, n.hw, +n.hh.toFixed(2), n.x0, n.x1], [13, 20.1, 1, 1, 0.8, 12, 14]);
  assert.deepEqual([s.x, s.z, s.nz, +s.oz.toFixed(2)], [11.75, 27.9, -1, 27.55]);
  assert.ok(n.oz > 20.4, 'its rays start just inside the inner face');
});

test('visibility: the rays stop at the walls and at a shut door; an open door lets the light through to the hall', () => {
  const [n] = sources();
  const p = { x: 3, y: 1, z: 4.9 }, hall = { x: 5, y: 1, z: 6 };
  assert.ok(windowIrradiance(n, p, NORTH) > 0, 'the wall facing the window is lit');
  assert.equal(windowIrradiance(n, { x: 3, y: 1, z: 6 }, NORTH), 0, 'behind the wall: none');
  assert.equal(windowIrradiance(n, hall, NORTH), 0, 'the hall behind the shut door: none');
  door.t = 1; castWindow(n, [...WALLS, door.segment()]);
  assert.ok(windowIrradiance(n, hall, NORTH) > 0, 'door open: some light into the hall');
  door.t = 0;
});

test('fall-off: brighter by the window than deep in, the ceiling over the window lit, the other level and behind the glass not', () => {
  const [n] = sources();
  const near = windowIrradiance(n, { x: 3, y: 0, z: 1.2 }, UP), mid = windowIrradiance(n, { x: 3, y: 0, z: 3 }, UP), deep = windowIrradiance(n, { x: 3, y: 0, z: 4.8 }, UP);
  assert.ok(near > mid && mid > deep && deep > 0, `${near} > ${mid} > ${deep}`);
  assert.ok(near / deep > 3, 'a clear gradient');
  const ceilNear = windowIrradiance(n, { x: 3, y: 2.5, z: 0.6 }, DOWN), ceilDeep = windowIrradiance(n, { x: 3, y: 2.5, z: 4.5 }, DOWN);
  assert.ok(ceilNear > 2 * ceilDeep, `ceiling over the window ${ceilNear} vs deep ${ceilDeep}`);
  assert.ok(windowIrradiance(n, { x: 3, y: 1, z: 2 }, NORTH) > windowIrradiance(n, { x: 3, y: 1, z: 2 }, SOUTH), 'facing the window gets more');
  assert.equal(windowIrradiance(n, { x: 3, y: 3.2, z: 2 }, UP), 0, 'the other storey');
  assert.equal(windowIrradiance(n, { x: 3, y: 1, z: 0.05 }, SOUTH), 0, 'outside the glass');
  assert.ok(windowIrradiance(n, { x: 3, y: 0.8, z: 0.3 }, UP) > 0, 'the window board in the reveal');
  assert.equal(windowIrradiance(n, { x: 3, y: 0, z: 1.2 }, UP, 0), 0, 'strength 0 (blind shut fully): none');
});

test('blinds and curtains dim their own window only', () => {
  const [n, s] = sources();
  const blind = (o) => ({ level: 0, x0: 2, x1: 4, out: -1, cover: 1, dark: false, ...o });
  assert.equal(windowPass(n), 1);
  assert.ok(Math.abs(windowPass(n, [blind()]) - (1 - BLINDS.dim.light)) < 1e-9, 'white blind drawn');
  assert.ok(Math.abs(windowPass(n, [blind({ dark: true })]) - (1 - BLINDS.dim.dark)) < 1e-9, 'blackout drawn');
  assert.ok(Math.abs(windowPass(n, [blind({ cover: 0.5, dark: true })]) - (1 - 0.5 * BLINDS.dim.dark)) < 1e-9, 'half drawn');
  assert.equal(windowPass(s, [blind({ dark: true })]), 1, 'another window\'s blind (the other façade, overlapping in x)');
  assert.equal(windowPass(n, [blind({ level: 1, dark: true })]), 1, 'another level');
  const curtain = { level: 0, cover: 1, daylightCut: 0.6, spec: { facade: 'north', glass: [2, 4] } };
  assert.equal(windowPass(s, [], [curtain]), 1, 'a curtain on the other façade');
  assert.ok(Math.abs(windowPass(n, [], [curtain]) - 0.4) < 1e-9, 'curtain shut');
  assert.ok(Math.abs(windowPass(n, [blind()], [curtain]) - (1 - BLINDS.dim.light) * 0.4) < 1e-9, 'both');
});

test('the nearest windows and the flat the eye is in or nearest to', () => {
  const list = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 1, z: 0 }));
  assert.deepEqual(pickWindows(list, 8.2, 1, 0, 3).map((w) => w.x), [8, 7, 6]);
  assert.equal(pickWindows(list, 0, 0, 0).length, WL.max);
  const a = { box: { x0: 0, x1: 6, z0: 0, z1: 8, y0: 0, y1: 6 } }, b = { box: { x0: 30, x1: 36, z0: 0, z1: 8, y0: 9, y1: 15 } };
  assert.equal(pickRegion([a, b], 3, 1, 4), a, 'inside');
  assert.equal(pickRegion([a, b], 25, 10, 4), b, 'outside, nearer the other');
  assert.equal(pickRegion([a, b], 3, 1, 200), null, 'far from both');
  assert.ok(baseFactor(0) === 1 && Math.abs(baseFactor(1) - WL.base) < 1e-12, 'night: the global light unchanged; day: the base share');
});

test('WindowLight: on by day inside; off at the lowest quality, at night and far away; blinds and door moves follow', () => {
  door.t = 0;
  const region = homeRegion(world, L), wl = new WindowLight([region]);
  assert.equal(region.sources.length, 2);
  assert.ok(Math.abs(region.box.z0 - (0.1 + WL.inset)) < 1e-9 && Math.abs(region.box.z1 - (7.9 - WL.inset)) < 1e-9, 'between the glass planes');
  const fill = { color: new T.Color(1, 1, 1), intensity: 0.9, position: new T.Vector3(8, 6, -5), target: { position: new T.Vector3() } };
  const env = (o) => ({ eye: new T.Vector3(3, 1.6, 3), sky: new T.Color(1, 1, 1), skyLight: 2, day: 1, fill, blinds: [], curtains: [], ...o });
  wl.update(0.016, env());
  const A = U.winA.value, S = U.winSrc.value;
  assert.deepEqual([A[3], A[2]], [1, 2]);
  assert.ok(Math.abs(A[0] - WL.base) < 1e-6);
  assert.ok(Math.abs(U.winSky.value[0] - WL.gain * 2) < 1e-6, 'sky = gain × the hemi sky intensity');
  assert.ok(Math.abs(U.winFill.value[0] - 0.9 * WL.fillCut) < 1e-6 && Math.abs(Math.hypot(...U.winFillDir.value.slice(0, 3)) - 1) < 1e-6);
  wl.update(0.016, env({ blinds: [{ level: 0, x0: 2, x1: 4, out: -1, cover: 1, dark: true }] }));
  const north = wl.shown.findIndex((s) => s.nz > 0);
  assert.ok(Math.abs(S[north * 12 + 3] - (1 - BLINDS.dim.dark)) < 1e-6, 'the drawn blind dims its window\'s strength');
  wl.enabled = false; wl.update(0.016, env());
  assert.equal(A[3], 0, 'lowest quality: off (the global light)');
  wl.enabled = true; wl.update(0.016, env({ day: 0 }));
  assert.equal(A[3], 0, 'night: off');
  wl.update(0.016, env({ eye: new T.Vector3(3, 1.6, 300) }));
  assert.equal(A[3], 0, 'far from every flat: off');
  // a door opens: the rays are cast again (after `recast` s at most)
  const before = Float32Array.from(region.sources[0].vis);
  door.t = 1; wl.update(WL.recast + 0.01, env());
  assert.notDeepEqual(Array.from(region.sources[0].vis), Array.from(before), 're-cast');
  assert.deepEqual(Array.from(U.winVis.value.slice(0, WL.rays)), Array.from(wl.shown[0].vis), 'uploaded');
  door.t = 0;
});
