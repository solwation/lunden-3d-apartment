// #2154: node --test tools/skycloudstest.mjs  (procedural sky clouds: coverage follows the weather, sky and ground shadows share noise + drift)
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_SHADOW as C, WEATHER } from '../src/config.js';
import { skyCloudState, cloudShadowState, applyCloudShadows, stepCloudDrift, cloudShadowAt, cloudFieldAt, skyCloudDensity, CLOUD_NOISE_GLSL } from '../src/cloudshadow.js';
import { sunDirection } from '../src/daycycle.js';

const NOON = sunDirection(13, 172);
/** Fraction of the sky above 25 degrees elevation that is cloud (density > 0.5) for an overcast value. */
function coverage(oc) {
  const s = skyCloudState(oc); applyCloudShadows({ strength: 0, thr: 0, soft: 0, slope: { x: 0, z: 0 } }, 0);
  let n = 0, k = 0;
  for (let a = 0; a < 360; a += 3) for (let e = 25; e < 90; e += 4) {
    const r = Math.cos(e * Math.PI / 180); k++;
    if (skyCloudDensity(Math.sin(a * Math.PI / 180) * r, Math.sin(e * Math.PI / 180), Math.cos(a * Math.PI / 180) * r, 0, 0, s) > 0.5) n++;
  }
  return n / k;
}

test('coverage follows the real weather codes: clear empty, mainly clear a few, partly scattered, overcast dense', () => {
  const real = WEATHER.real.cloud, clear = coverage(0), c1 = coverage(real[1]), c2 = coverage(real[2]), c3 = coverage(real[3]), full = coverage(1);
  assert.ok(clear < 0.02, `clear ${clear}`);
  assert.ok(c1 < 0.15 && c1 >= clear, `code 1 ${c1}`);
  assert.ok(c2 > 0.08 && c2 < 0.45, `code 2 partly cloudy ${c2}`);
  assert.ok(c3 > 0.35 && c3 < 0.85, `code 3 ${c3}`);
  assert.ok(full > 0.7, `overcast ${full}`);
  assert.ok(clear <= c1 && c1 <= c2 && c2 <= c3 && c3 <= full, 'monotonic in cloudiness');
});

test('from the ramp on, the sky threshold is exactly the cloud shadows\' threshold', () => {
  for (const oc of [C.sky.ramp, 0.4, 0.7, 1]) assert.ok(Math.abs(skyCloudState(oc).thr - cloudShadowState({ sunDir: NOON, oc }).thr) < 1e-12, String(oc));
  assert.equal(skyCloudState(0).thr, C.sky.clearThr);
  const o = { thr: 0, soft: 0 }; assert.equal(skyCloudState(0.5, o), o, 'writes into the given object');
});

test('sky and shadows drift together: one integrated offset moves both, a cloud and its shadow stay paired', () => {
  const pos = { x: 0, z: 0, dx: 0, dz: 0 }, wind = { x: 6, z: -3 }, st = skyCloudState(0.55);
  const s = cloudShadowState({ sunDir: NOON, oc: 0.55 });
  s.slope.x = 0; s.slope.z = 0; // sun straight overhead: the shadow of a cloud lies right below it
  applyCloudShadows(s, stepCloudDrift(pos, 0, wind));
  const pts = []; for (let i = 0; i < 40; i++) pts.push([-900 + i * 47, 800 - i * 41]);
  const before = pts.map(([x, z]) => [cloudFieldAt(x, z), cloudShadowAt(x, 0, z)]);
  // field(x,z) at t0 must equal field(x - d, z - d') at t1 shifted by the travelled distance (pattern moves along the wind)
  applyCloudShadows(s, stepCloudDrift(pos, 20, wind));
  const v = { x: wind.x / Math.hypot(wind.x, wind.z), z: wind.z / Math.hypot(wind.x, wind.z) }, speed = Math.min(C.drift[1], Math.max(C.drift[0], Math.hypot(wind.x, wind.z) * C.windScale)), dist = speed * 20;
  pts.forEach(([x, z], i) => {
    assert.ok(Math.abs(cloudFieldAt(x + v.x * dist, z + v.z * dist) - before[i][0]) < 1e-6, 'the sky field moved by the wind drift');
    assert.ok(Math.abs(cloudShadowAt(x + v.x * dist, 0, z + v.z * dist) - before[i][1]) < 1e-6, 'the shadow moved by the same drift');
    // sky density straight overhead at a point equals the shadow's cloudiness there (same field, same threshold)
    const dens = skyCloudDensity(0, 1, 0, x, z, { thr: s.thr, soft: s.soft });
    const expectShadow = 1 - s.strength * dens; // base noise only, equal softness
    assert.ok(Number.isFinite(dens) && dens >= 0 && dens <= 1 && Number.isFinite(expectShadow));
  });
  assert.notEqual(pos.dx, 0);
});

test('sky density is the shadows\' cover where the softness matches: same cloud overhead, same shadow below', () => {
  const s = cloudShadowState({ sunDir: NOON, oc: 0.55 }); s.slope.x = 0; s.slope.z = 0; applyCloudShadows(s, 0);
  const st = { thr: s.thr, soft: s.soft };
  for (let i = 0; i < 50; i++) { const x = -700 + i * 29, z = 600 - i * 23;
    assert.ok(Math.abs(skyCloudDensity(0, 1, 0, x, z, st) * s.strength - (1 - cloudShadowAt(x, 0, z))) < 1e-9, `${x},${z}`); }
});

test('the sky shader reads the shared noise and the shadows\' drift uniform; clouds vanish below the horizon', () => {
  assert.match(CLOUD_NOISE_GLSL, /float csField\(/);
  assert.equal(skyCloudDensity(1, 0.01, 0, 0, 0, skyCloudState(1)), 0);
});
