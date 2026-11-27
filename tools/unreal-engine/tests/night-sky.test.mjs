// Pure source/colour checks; material compilation and actual capture acceptance still require Unreal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { DayCycle, skyFragmentShader, skyGradientPalette } from '../../../src/daycycle.js';
import { SKY_DUSK, CLOUD_SHADOW, SKYLAYER } from '../../../src/config.js';

assert(!skyFragmentShader.includes('tonemapping_fragment'));
assert(skyFragmentShader.includes('colorspace_fragment'));
assert.deepEqual(SKY_DUSK.sun.slice(0, 2), [-0.17, -0.04]);
const palette = skyGradientPalette();
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const close = (a, b) => a.forEach((v, i) => assert(Math.abs(v - b[i]) < 1e-12));
let roundtrips = 0;
for (const oc of [0, .125, .4, .7, 1]) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 1, 1000);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.62, 0);
  const lights = { sun: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(),
    ambient: new THREE.AmbientLight(), fill: new THREE.AmbientLight() };
  const day = new DayCycle({ scene, camera, lights, startHour: 18.25, month: 11, date: 16, year: 2026 });
  day.paused = true; day.overcast = oc; day.update(0);
  assert(day.sunDir.y < SKY_DUSK.sun[0]);
  const u = day.uniforms;
  assert.equal(u.uNight.value, 1);
  for (const name of ['uBandAmt', 'uBodyAmt', 'uGlowAmt']) assert.equal(u[name].value, 0);
  close(u.uScatter.value.toArray(), [0, 0, 0]);
  close(u.uZenith.value.toArray(), lerp(palette.nightZenith, palette.overcast.map(v => v * .15), oc * .85));
  close(u.uHorizon.value.toArray(), lerp(palette.nightHorizon, palette.overcast.map(v => v * .2), oc * .7));
  // Exhaust night cloud thickness/coverage and view elevations, including horizon and zenith.
  for (let h = 0; h <= 20; h++) for (let t = 0; t <= 20; t++) for (const cover of [0, .5, 1]) {
    const thick = t / 20;
    const base = lerp(u.uHorizon.value.toArray(), u.uZenith.value.toArray(), (h / 20) ** .55);
    let cloud = lerp([.16, .18, .24], [.08, .09, .11], oc * .8);
    cloud = cloud.map((v, i) => v * (1 - CLOUD_SHADOW.sky.shade * thick * (.6 + .4 * oc))
      * ([.9, .95, 1.04][i] * (1 - thick) + thick) * (1 + .1 * (1 - thick)));
    const target = lerp(base, cloud, cover * .85);
    const x = Math.min(...target), offset = x < .04 ? Math.sqrt(x / 6.25) - x : .04;
    const input = target.map(v => v + offset);
    const minimum = Math.min(...input), black = minimum < .08 ? minimum - 6.25 * minimum ** 2 : .04;
    const mapped = input.map(v => v - black);
    assert(Math.max(...mapped) < .76, 'inverse must stay below Neutral compression');
    close(mapped, target);
    roundtrips++;
  }
}
const c = { ...CLOUD_SHADOW, sky: CLOUD_SHADOW.sky, palette, top: SKYLAYER.top, fade: SKYLAYER.fade };
const python = spawnSync('python3', ['-c', `import json,sys;sys.path.insert(0,'tools/unreal-engine/python');import sky_clouds;print(sky_clouds.shader(json.load(sys.stdin)))`],
  { input: JSON.stringify(c), encoding: 'utf8' });
assert.equal(python.status, 0, python.stderr);
for (const name of ['nightZenith', 'nightHorizon', 'overcast'])
  for (const v of palette[name]) assert(python.stdout.includes(String(v)));
assert(python.stdout.includes('sqrt(max(x,0)/6.25)-x'));
assert(python.stdout.includes('1-smoothstep(-0.17,-0.04,sun.y)'));
const builder = readFileSync('tools/unreal-engine/python/build_lighting.py', 'utf8');
assert(builder.includes('col = clouds.night(col, dw, sw, Cam*0.01'));
assert(!builder.includes('exp2(1.53'));
console.log(`Night source OK: actual START DayCycle uniforms, 5 overcast states, ${roundtrips} Neutral roundtrips; daytime shader untouched. Native material/capture pending.`);
