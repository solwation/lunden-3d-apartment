// Pure source/colour checks; material compilation and actual capture acceptance still require Unreal.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { DayCycle, skyFragmentShader, skyGradientPalette } from '../../../src/daycycle.js';
import { SKY_DUSK, CLOUD_SHADOW, SKYLAYER, DAY } from '../../../src/config.js';

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
// The complete source sky composes celestial radiance before the cloud mix.
// The old implementation inverted only the dim gradient/clouds, then subjected
// the un-inverted moon to Neutral, which is not an identity even below its knee.
const cloudBegin = skyFragmentShader.indexOf('    // clouds (equirectangular');
assert(skyFragmentShader.indexOf('    // sun and moon discs') < cloudBegin);
assert(skyFragmentShader.indexOf('    // stars') < cloudBegin);
const night = python.stdout.slice(python.stdout.indexOf('float3 night(float3 nativeSky'));
assert(night.indexOf('float m = max(dot(d,moon)') < night.indexOf('float3 shapeNight'));
assert(night.indexOf('base += star*') < night.indexOf('float3 shapeNight'));
assert(night.indexOf('float3 target = lerp(base,cloud') < night.indexOf('float peak = max(target'));
assert(builder.indexOf('col = clouds.night(') > builder.indexOf('col += star *'));
assert.equal(builder.split('col = clouds.night(').length, 2);
// Execute the actual installed Three170 Neutral body, including compression.
const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
const begin = chunk.indexOf('vec3 NeutralToneMapping('), open = chunk.indexOf('{',begin);
let end = open+1, depth = 1;
for (; depth; end++) depth += (chunk[end] === '{')-(chunk[end] === '}');
const body = chunk.slice(open+1,end-1).replaceAll('const float ','const ').replaceAll('float ','let ')
  .replace('color *= toneMappingExposure;','color = mul(color,toneMappingExposure);')
  .replace('color -= offset;','color = sub(color,offset);')
  .replace('color *= newPeak / peak;','color = mul(color,newPeak/peak);');
const mul=(v,k)=>v.map(x=>x*k), sub=(v,k)=>v.map(x=>x-k), vec3=k=>[k,k,k];
const convert=v=>Object.assign(v,{r:v[0],g:v[1],b:v[2]});
const neutral=new Function('color','toneMappingExposure','min','max','mix','vec3','mul','sub',body);
const map=rgb=>neutral(convert(rgb),1,Math.min,Math.max,
  (a,b,k)=>convert(lerp(a,b,k)),k=>convert(vec3(k)),(v,k)=>convert(mul(v,k)),(v,k)=>convert(sub(v,k)));
function inverse(target) {
  const peak=Math.max(...target);
  if (Math.min(...target)<0 || peak>=1) return null;
  let pre=target;
  if(peak>=.76) {
    const inputPeak=.0576/(1-peak)+.52, g=1-1/(.15*(inputPeak-peak)+1);
    pre=target.map(v=>(v-peak*g)/(1-g)*(inputPeak/peak));
  }
  if(pre.some(v=>v<0 || !Number.isFinite(v))) return null;
  const x=Math.min(...pre), offset=x<.04?Math.sqrt(x/6.25)-x:.04;
  return pre.map(v=>v+offset);
}
let celestialRoundtrips=0;
for(const mare of [.8,.9,1]) for(const sphere of [.85,.925,1]) for(const lit of [0,.1,.5,1]) {
  const base=palette.nightZenith;
  let moon=lerp(base,[.92,.94,1].map(v=>v*mare*sphere),lit);
  moon=lerp(moon,[.92,.94,1].map(v=>v*DAY.moonEarthshine),(1-lit)*.9);
  for(const cover of [0,.2,.7,1]) {
    const target=lerp(moon,[.16,.18,.24],cover*.85), input=inverse(target);
    if(!input) continue; // explicitly unrepresentable domain retains legacy; no clipping.
    close(map(input),target); celestialRoundtrips++;
  }
}
assert(celestialRoundtrips>100);
const moon=[.92,.94,.99];
assert(map(moon).some((v,i)=>Math.abs(v-moon[i])>.01), 'legacy un-inverted moon must expose this defect');
assert.equal(inverse([1,.97,.88]),null);
console.log(`Night source OK: actual START uniforms, ${roundtrips} dim-sky and ${celestialRoundtrips} complete celestial Neutral roundtrips; source cloud ordering; native material/capture pending.`);
