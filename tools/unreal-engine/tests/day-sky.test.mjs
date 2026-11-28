// #2434: actual DayCycle inputs and inverse of the pinned Three Neutral shader.
// Pure math/source checks only: UE compilation and transmitted sky remain native gates.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as T from 'three';
import { DayCycle, skyGradientPalette, skyFragmentShader } from '../../../src/daycycle.js';
import { CLOUD_SHADOW, SKYLAYER, SKY_DUSK, HAZE } from '../../../src/config.js';

const smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b);
const lerp = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
const close = (a, b) => a.forEach((v, i) => assert(Math.abs(v - b[i]) < 1e-10, `${a} != ${b}`));
const palette = skyGradientPalette();
assert(!skyFragmentShader.includes('tonemapping_fragment'));
assert(skyFragmentShader.includes('colorspace_fragment'));
assert.equal(SKY_DUSK.sun.at(-1), .16);
assert.equal(SKY_DUSK.halo.sun.at(-1), .17);
assert.deepEqual(HAZE.scatter, { color: [1, .86, .66], amount: .12 });

// Execute the installed Three170 GLSL Neutral body as scalar/vector JS operations.
// The reference is the actual shader text, rather than another handwritten curve.
const chunk = T.ShaderChunk.tonemapping_pars_fragment;
const begin = chunk.indexOf('vec3 NeutralToneMapping('), open = chunk.indexOf('{', begin);
let end = open + 1, depth = 1;
for (; depth; end++) depth += (chunk[end] === '{') - (chunk[end] === '}');
let body = chunk.slice(open + 1, end - 1)
  .replaceAll('const float ', 'const ').replaceAll('float ', 'let ')
  .replace('color *= toneMappingExposure;', 'color = mul(color, toneMappingExposure);')
  .replace('color -= offset;', 'color = sub(color, offset);')
  .replace('color *= newPeak / peak;', 'color = mul(color, newPeak / peak);');
const vec3 = x => ({ r: x, g: x, b: x });
const mul = (v, x) => ({ r: v.r*x, g: v.g*x, b: v.b*x });
const sub = (v, x) => ({ r: v.r-x, g: v.g-x, b: v.b-x });
const mix = (a, b, x) => ({ r: a.r+(b.r-a.r)*x, g: a.g+(b.g-a.g)*x, b: a.b+(b.b-a.b)*x });
assert(body.includes('color = mul(color, newPeak / peak);'));
const neutral = new Function('color', 'toneMappingExposure', 'min', 'max', 'mix', 'vec3', 'mul', 'sub', body);
const map = rgb => {
  const out = neutral({ r: rgb[0], g: rgb[1], b: rgb[2] }, 1, Math.min, Math.max, mix, vec3, mul, sub);
  return [out.r, out.g, out.b];
};
function inverse(target) {
  const peak = Math.max(...target);
  if (Math.min(...target) < 0 || peak >= 1) return null;
  let pre = target;
  if (peak >= .76) {
    const p = .0576 / (1-peak) + .52, g = 1-1/(.15*(p-peak)+1);
    pre = target.map(v => (v-peak*g)/(1-g)*(p/peak));
  }
  if (pre.some(v => v < 0 || !Number.isFinite(v))) return null;
  const x = Math.min(...pre), black = x < .04 ? Math.sqrt(x/6.25)-x : .04;
  return pre.map(v => v+black);
}

// Pin the actual source addition AND its placement before cloud-deck/horizon output.
assert(skyFragmentShader.includes('col += vec3(0.75, 0.78, 0.95) * uFlash;'));
assert(skyFragmentShader.indexOf('col += vec3(0.75, 0.78, 0.95)') < skyFragmentShader.indexOf('col = mix(col, uCloudCol, uWhite)'));
let compared = 0, rejected = 0, flashCompared = 0, flashRejected = 0;
for (const [month, date, hour] of [[11,16,14], [6,21,14], [12,24,14], [11,16,18.25]]) {
  for (const oc of [0,.125,.4,.7,1]) {
    const scene = new T.Scene(); scene.fog = new T.Fog(0,1,1000);
    const camera = new T.PerspectiveCamera(); camera.position.set(0,1.62,0);
    const lights = { sun: new T.DirectionalLight(), hemi: new T.HemisphereLight(), ambient: new T.AmbientLight(), fill: new T.AmbientLight() };
    const day = new DayCycle({ scene, camera, lights, startHour: hour, month, date, year: 2026 });
    day.paused = true; day.hour = hour; day.overcast = oc; day.update(0);
    const y = day.sunDir.y, u = day.uniforms;
    if (month === 11 && hour === 14) assert(Math.abs(y-.17784014567139098) < 1e-12, JSON.stringify({y,oc,hour,month,date,actualHour:day.hour}));
    if (y < .17) continue; // explicitly preserved legacy twilight/night, not claimed source coverage
    assert.equal(u.uBandAmt.value, 0); assert.equal(u.uBodyAmt.value, 0);
    close(u.uHalo.value.toArray(), [0,0,0]); close(u.uRim.value.toArray(), [0,0,0]);
    const daylight = smooth(-.08,.18,y), glowAmt = (1-smooth(0,.35,Math.abs(y)))*smooth(-.15,.05,y);
    const zenith = lerp(lerp(palette.nightZenith,palette.dayZenith,daylight),palette.overcast.map(v=>v*(.15+.85*daylight)),oc*.85);
    const horizon = lerp(lerp(lerp(palette.nightHorizon,palette.dayHorizon,daylight),palette.duskHorizon,glowAmt*.6),palette.overcast.map(v=>v*(.2+.8*daylight)),oc*.7);
    close(zenith,u.uZenith.value.toArray()); close(horizon,u.uHorizon.value.toArray());
    close(u.uGlow.value.toArray(), [1,.2541520943200296,.04518620437910499]);
    close(u.uScatter.value.toArray(), HAZE.scatter.color.map(v=>v*.12*daylight*(1-oc)*smooth(-.05,.1,y)));
    // Horizon/zenith, empty sky/cloud rims/cores, sun-facing and away. Source
    // colours outside Neutral's nonnegative inverse domain MUST retain legacy.
    for (const h of [0,.005,.02,.08,.3,.7,1]) for (const s of [0,.3,.8,.99]) {
      const base = lerp(horizon,zenith,h**.55).map((v,i)=>v+(u.uGlow.value.toArray()[i]*glowAmt+u.uScatter.value.toArray()[i])*s**6*(1-h));
      for (const cover of [0,.2,.7,1]) for (const thick of [0,.2,.7,1]) {
        let cloud = lerp([.95,.95,.95],[.16,.18,.24],1-daylight).map((v,i)=>v+u.uGlow.value.toArray()[i]*glowAmt*.35);
        cloud = lerp(cloud,lerp([.5,.53,.57],[.08,.09,.11],1-daylight),oc*.8)
          .map((v,i)=>v*(1-CLOUD_SHADOW.sky.shade*thick*(.6+.4*oc))*(1+([.9,.95,1.04][i]-1)*(1-thick))*(1+.1*(1-thick)));
        const target = lerp(horizon,lerp(base,cloud,cover*.85),smooth(-.02,.02,h));
        const input = inverse(target);
        if (!input) { rejected++; continue; }
        close(map(input),target); compared++;
        // Real DayCycle flash also damps haze scattering. Read actual uniforms
        // after update, rather than assuming flash changes only an additive term.
        for (const flash of [.1,.35,.675,1]) {
          day.flash = flash; day.update(0);
          close(u.uScatter.value.toArray(), HAZE.scatter.color.map(v=>v*.12*daylight*(1-oc)*smooth(-.05,.1,y)*(1-Math.min(1,flash*.5))));
          const flashBase = lerp(horizon,zenith,h**.55).map((v,i)=>v+(u.uGlow.value.toArray()[i]*glowAmt+u.uScatter.value.toArray()[i])*s**6*(1-h));
          const rawSky = lerp(flashBase,cloud,cover*.85).map((v,i)=>v+[.75,.78,.95][i]*u.uFlash.value);
          const flashed = lerp(horizon,rawSky,smooth(-.02,.02,h));
          const flashedInput = inverse(flashed);
          if (!flashedInput) { flashRejected++; continue; }
          close(map(flashedInput),flashed); flashCompared++;
        }
        day.flash = 0; day.update(0);
      }
    }
    assert(inverse(horizon)); assert(inverse(zenith));
  }
}
assert(compared > 3000 && rejected > 0);
assert(flashCompared > 3000 && flashRejected > 0);
// Actual full-night uniforms, excluding celestial discs/stars, across the same
// source raw-flash operation. The inverse rejection policy is unchanged.
for (const oc of [0,.4,1]) {
  const scene = new T.Scene(); scene.fog = new T.Fog(0,1,1000);
  const camera = new T.PerspectiveCamera(); camera.position.set(0,1.62,0);
  const lights = {sun:new T.DirectionalLight(),hemi:new T.HemisphereLight(),ambient:new T.AmbientLight(),fill:new T.AmbientLight()};
  const day = new DayCycle({scene,camera,lights,startHour:18.25,month:11,date:16,year:2026});
  day.paused=true; day.hour=18.25; day.overcast=oc;
  for (const flash of [0,.1,.35,.675,1]) {
    day.flash=flash; day.update(0); const u=day.uniforms;
    assert(day.sunDir.y < -.17); assert.equal(u.uWhite.value,0);
    for(const name of ['uBandAmt','uBodyAmt','uGlowAmt']) assert.equal(u[name].value,0);
    close(u.uScatter.value.toArray(),[0,0,0]); assert.equal(u.uFlash.value,flash);
    for(const h of [0,.005,.02,.3,1]) for(const cover of [0,.5,1]) {
      const base=lerp(u.uHorizon.value.toArray(),u.uZenith.value.toArray(),h**.55);
      const cloud=lerp([.16,.18,.24],[.08,.09,.11],oc*.8).map((v,i)=>v*[.9,.95,1.04][i]*1.1);
      const raw=lerp(base,cloud,cover*.85).map((v,i)=>v+[.75,.78,.95][i]*u.uFlash.value);
      const target=lerp(u.uHorizon.value.toArray(),raw,smooth(-.02,.02,h));
      const input=inverse(target);
      if(!input) { flashRejected++; continue; }
      close(map(input),target); flashCompared++;
    }
  }
}
assert.equal(inverse([1,.97,.88]), null, 'peak1 is not a finite invertible Neutral output');
assert.equal(inverse([.99,0,0]), null, 'inverse desaturation may require unsupported negative scene colour');
const c = { ...CLOUD_SHADOW, palette, top: SKYLAYER.top, fade: SKYLAYER.fade };
const python = spawnSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tools/unreal-engine/python');import sky_clouds;print(sky_clouds.shader(json.load(sys.stdin)))"], { input: JSON.stringify(c), encoding: 'utf8' });
assert.equal(python.status,0,python.stderr);
for (const literal of ['float inputPeak = 0.0576/(1-peak)+0.52;', 'preBlack = (target-peak*g)/(1-g)*(inputPeak/peak);', 'peak >= 1', 'any(preBlack < 0)', 'smoothstep(0.16,0.17,sun.y)']) assert(python.stdout.includes(literal));
assert(!python.stdout.includes('dot(nativeSky,luma)'));
const builder = readFileSync('tools/unreal-engine/python/build_lighting.py','utf8');
assert(builder.includes('SkyThreshold, Overcast, EAI, Flash);'));
assert(builder.includes('SkyThreshold, Overcast, EAI, Flash,'));
assert(!builder.includes('float3(0.75, 0.78, 0.95) * Flash * EAI'));
for(const branch of ['daylight','night']) {
  const code=python.stdout.slice(python.stdout.indexOf(`float3 ${branch}(float3 nativeSky`));
  assert(code.indexOf('target += float3(0.75,0.78,0.95)*flash;') < code.indexOf('target = lerp(horizon,target'));
  assert(code.indexOf('target = lerp(horizon,target') < code.indexOf('float peak = max(target'));
}
assert(builder.includes('col = clouds.night(col, dw, sw, Cam*0.01'));
console.log(`Day sky pure PASS: actual November/June uniforms, ${compared} actual-Three-Neutral roundtrips, ${rejected} explicit domain rejections; flash ${flashCompared} roundtrips / ${flashRejected} domain rejections; native compilation/translucency/capture pending.`);
