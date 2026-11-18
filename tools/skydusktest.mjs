// #2124: node --test tools/skydusktest.mjs  (dawn / dusk sky colour depth: colours per sun height, day and night unchanged,
// overcast damping, and the haze contract: full fog straight towards the sun = the sky's horizon glow + halo there)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { SKY_DUSK } from '../src/config.js';
import { DayCycle, duskSkyState, sunDirection } from '../src/daycycle.js';
import { hazeUniforms } from '../src/aerialhaze.js';

const sum = (c) => c.r + c.g + c.b;
const ZERO = ['halo', 'rim'];

function makeDay({ hour, month = 6, oc = 0 }) {
  const scene = new T.Scene(); scene.fog = new T.Fog(0xcfe0ec, 45, 650);
  const camera = new T.PerspectiveCamera(); camera.position.set(0, 1.6, 0);
  const sun = new T.DirectionalLight(); scene.add(sun.target);
  const lights = { sun, hemi: new T.HemisphereLight(), ambient: new T.AmbientLight(), fill: new T.DirectionalLight() };
  const day = new DayCycle({ scene, camera, lights, clouds: new T.Texture(), startHour: hour, month, date: 15, year: 2026 });
  day.paused = true; day.overcast = oc; day.update(0);
  return day;
}

test('zero by day and at night: no band, halo, rim, body tint or zenith shift', () => {
  for (const y of [0.33, 0.5, 0.9, -0.18, -0.4, -0.9]) {
    const s = duskSkyState(y);
    for (const k of ZERO) assert.equal(sum(s[k]), 0, `${k} at y ${y}`);
    assert.equal(s.bodyAmt, 0); assert.equal(s.zenithAmt, 0); assert.equal(s.bandAmt, 0);
  }
  // the real DayCycle: June noon / December noon / winter midnight keep the old day and night sky (zenith = the night → day blend)
  for (const [hour, month] of [[13, 6], [12.5, 12], [1, 12]]) {
    const d = makeDay({ hour, month }), u = d.uniforms;
    for (const k of ['uHalo', 'uRim']) assert.equal(sum(u[k].value), 0, `${k} ${hour}h m${month}`);
    assert.equal(u.uBodyAmt.value, 0); assert.equal(u.uBandAmt.value, 0);
    const z = new T.Color(0x04070f).lerp(new T.Color(0x4f8fd0), d.daylight);
    for (const c of ['r', 'g', 'b']) assert.ok(Math.abs(u.uZenith.value[c] - z[c]) < 1e-9, `zenith ${c} ${hour}h m${month}`);
    assert.equal(hazeUniforms.fogHazeHalo.value.x, 0);
  }
});

test('colours per sun height: warm halo near the horizon, pink sun side, violet away, lit cloud edges, deeper zenith', () => {
  const at = (y) => duskSkyState(y);
  const sunset = at(0.01), after = at(-0.06), high = at(0.2), deep = at(-0.15);
  assert.ok(sum(sunset.halo) > 0.5 && sunset.halo.r > sunset.halo.g && sunset.halo.g > sunset.halo.b, 'bright warm halo on the horizon');
  assert.ok(sum(high.halo) < sum(sunset.halo) && sum(at(-0.06).halo) === 0, 'the halo belongs to a low sun above the horizon');
  for (const s of [sunset, after]) {
    assert.ok(s.pink.r > s.pink.b && s.pink.r > s.pink.g, 'pink towards the sun');
    assert.ok(s.violet.b > s.violet.g && s.violet.b > s.violet.r * 1.2, 'violet away from it');
    assert.ok(s.rim.r > s.rim.g && s.rim.g > s.rim.b && s.rim.r > 0.3, 'cloud edges lit warm from below');
    assert.ok(s.zenithAmt > 0.3 && s.bodyAmt > 0.2 && s.bandAmt > 0.3);
  }
  assert.ok(at(-0.06).bandAmt * sum(at(-0.06).pink) > deep.bandAmt * sum(deep.pink), 'the band fades as twilight deepens');
  assert.ok(high.bandAmt < sunset.bandAmt, 'and as the sun climbs');
  // the deeper zenith is darker than the plain night → day blend it replaces part of
  const d = makeDay({ hour: 21.75, month: 6 }), plain = new T.Color(0x04070f).lerp(new T.Color(0x4f8fd0), d.daylight);
  assert.ok(d.sunDir.y > -0.05 && d.sunDir.y < 0.05, `sunset sun y ${d.sunDir.y}`);
  assert.ok(sum(d.uniforms.uZenith.value) < sum(plain) * 0.8, 'darker zenith at sunset');
  assert.ok(sum(d.uniforms.uHalo.value) > 0.4 && sum(d.uniforms.uRim.value) > 0.3);
  // dawn mirrors dusk
  const dawn = makeDay({ hour: 4.3, month: 6 });
  assert.ok(Math.abs(dawn.sunDir.y) < 0.06, `dawn sun y ${dawn.sunDir.y}`);
  assert.ok(dawn.uniforms.uBandAmt.value > 0.3 && sum(dawn.uniforms.uHalo.value) > 0.1);
});

test('overcast damps band, zenith and halo; the rim fades more gently; off (inside the deck) clears all', () => {
  const clear = duskSkyState(0.01, 0), part = duskSkyState(0.01, 0.45), full = duskSkyState(0.01, 1), off = duskSkyState(0.01, 0, 1);
  assert.ok(part.bandAmt < clear.bandAmt && full.bandAmt < part.bandAmt && full.bandAmt <= clear.bandAmt * (1 - SKY_DUSK.overcast) + 1e-9);
  assert.ok(sum(part.halo) < sum(clear.halo) && sum(full.halo) <= sum(clear.halo) * (1 - SKY_DUSK.overcast) + 1e-9);
  assert.ok(sum(full.rim) / sum(clear.rim) > sum(full.halo) / sum(clear.halo), 'rain clouds still catch some red from below');
  for (const k of ZERO) assert.equal(sum(off[k]), 0); assert.equal(off.bodyAmt, 0); assert.equal(off.zenithAmt, 0); assert.equal(off.bandAmt, 0);
});

test('haze contract (#2100): full fog straight towards the sun = the sky\'s horizon colour there, halo included', () => {
  for (const [hour, oc] of [[21.75, 0], [21.6, 0.45], [4.3, 0], [21.75, 1]]) {
    const d = makeDay({ hour, oc }), u = d.uniforms;
    assert.ok(sum(u.uHalo.value) > 0 || oc === 1, `halo at ${hour}`);
    // sky at d = sun on the horizon row (h = 0, s = 1): horizon + glow·amt + scatter + halo (band and clouds are zero there)
    const skyOut = u.uHorizon.value.clone().add(u.uGlow.value.clone().multiplyScalar(u.uGlowAmt.value)).add(u.uScatter.value).add(u.uHalo.value).convertLinearToSRGB();
    const W = hazeUniforms.fogHazeWarm.value, H = hazeUniforms.fogHazeHalo.value, fog = d.scene.fog.color.clone().convertLinearToSRGB();
    const hazeOut = { r: fog.r + W.x + H.x, g: fog.g + W.y + H.y, b: fog.b + W.z + H.z };
    for (const k of ['r', 'g', 'b']) assert.ok(Math.abs(skyOut[k] - hazeOut[k]) < 1e-6, `${hour}h oc ${oc} ${k}: sky ${skyOut[k]} haze ${hazeOut[k]}`);
  }
});

test('sky shader: the new terms vanish on the horizon row and the program has no variants', () => {
  const d = makeDay({ hour: 13 }), frag = d.sky.material.fragmentShader;
  assert.match(frag, /smoothstep\(uBand\.x, uBand\.x \+ uBand\.z, h\)/, 'band starts above h = 0 (uBand.x > 0)');
  assert.ok(SKY_DUSK.band.low > 0);
  assert.doesNotMatch(frag, /#if/, 'one program on every profile');
  assert.equal(sunDirection(13, 166).y > 0.33, true, 'June noon is "day" for the envelopes');
});
