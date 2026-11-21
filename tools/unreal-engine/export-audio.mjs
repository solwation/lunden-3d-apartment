// #2287: the web's sound parameters for the Unreal port, read from the web's own modules (never typed in by hand).
// Writes tools/unreal-engine/audio-params.json, which tools/unreal-engine/python/build_audio.py turns into the MetaSounds,
// sound classes, reverb settings and BPC_LundenAudio's variable defaults, and which tests/test_audio.py checks the
// Blueprint against. Besides the constants (src/config.js FOOTSTEPS, PLAYER strides, WIND_SOUND, WIND.power,
// AMBIENT_BED, ROOM_REVERB, SEASON) it stores answers of the web's own functions (footsteps.js pickStep, windsound.js
// gustAt / windStrength / windSoundParams, ambientbed.js riverBabbleParams / trafficLevel / cityHumParams /
// distToPolyline) for the test to compare with.
//
//   THREE_DIR=<node_modules/three> node tools/unreal-engine/export-audio.mjs [--check]
//
// --check: exit 1 when the versioned file differs from what the web sources give now (stale), else 0.
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const OUT = path.join(here, 'audio-params.json');
const three = process.env.THREE_DIR ?? path.join(root, 'node_modules/three');
if (!fs.existsSync(path.join(three, 'build/three.module.js'))) {
  console.error(`export-audio: three.js not found at ${three} (set THREE_DIR)`); process.exit(2);
}
const base = pathToFileURL(three + '/').href;
register('data:text/javascript,' + encodeURIComponent(`const base=${JSON.stringify(base)};export async function resolve(s,c,n){` +
  `if(s==='three')return{url:base+'build/three.module.js',shortCircuit:true};` +
  `if(s.startsWith('three/addons/'))return{url:base+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
globalThis.window ??= globalThis; globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const src = (f) => pathToFileURL(path.join(root, 'src', f)).href;
const C = await import(src('config.js'));
const { pickStep } = await import(src('footsteps.js'));
const { gustAt, windStrength, windSoundParams } = await import(src('windsound.js'));
const { riverBabbleParams, trafficLevel, cityHumParams, distToPolyline } = await import(src('ambientbed.js'));
const { windPower } = await import(src('windsim.js'));
const { riverPath } = await import(src('riverbridge.js'));
const { webToUnreal, rectToUnreal } = await import(pathToFileURL(path.join(here, 'coordinates.mjs')).href);

const r6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (_, v) => r6(v)));

// main.js footsteps(): a jump of more than this many metres between frames is a teleport, not a step. It is a literal in
// main.js, so it is read from the source text; a changed line makes this script fail instead of guessing.
const mainText = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const tele = /if \(d > ([\d.]+) \|\| player\.vy !== 0/.exec(mainText);
if (!tele) { console.error('export-audio: main.js footsteps() teleport test not found'); process.exit(3); }

const F = C.FOOTSTEPS;
const footsteps = {
  ...F, strideWalk: C.PLAYER.strideWalk, strideRun: C.PLAYER.strideRun, teleport: Number(tele[1]),
  source: 'src/config.js FOOTSTEPS, PLAYER.strideWalk/strideRun; src/footsteps.js synthFootstep; src/main.js footsteps()',
};

// pickStep answers for every class the surface sensor can give and the weather states that change the profile.
const SURFACES = ['grass', 'hard', 'gravel', 'wood'], WHERES = ['ground', 'exposed', 'core', 'indoor'];
const pick = [];
for (const surface of SURFACES) for (const where of WHERES) for (const road of [false, true]) for (const stairs of [false, true])
  for (const wet of [0, F.wetMin - 0.05, F.wetMin]) for (const month of [6, ...F.leafMonths.slice(0, 1)])
    for (const [snow, temp] of [[0, 10], [F.snowMin, 0], [1, F.squeakTemp]]) {
      const info = { surface, where, road, stairs }, env = { snow, wet, temp, month };
      pick.push([surface, where, road, stairs, r6(wet), month, r6(snow), r6(temp), pickStep(info, env)]);
    }

// The wind's sound (windsound.js) and the open air's bed (ambientbed.js) at sample inputs.
const strength = [], gust = [], wind = [];
for (const speed of [0, 1, 3, 6, 9, 13, 20]) for (const g of [0, 0.5, 1]) strength.push([speed, g, r6(windStrength(speed, g))]);
for (const t of [0, 1.7, 5, 12.5, 33, 71.25]) for (const p of [0, 0.4, 1]) gust.push([t, p, r6(gustAt(t, p))]);
for (const speed of [0, 2, 5, 9, 13, 20]) for (const g of [0, 0.5, 1]) for (const leaves of [0, 0.45, 1])
  for (const near of [0, 0.5, 1]) for (const indoors of [false, true]) {
    const p = windSoundParams({ speed, gust: g, leaves, near, indoors });
    wind.push([speed, g, leaves, near, indoors, ...['gain', 'lpHz', 'lpQ', 'bandGain', 'bandHz', 'bandQ'].map((k) => r6(p[k]))]);
  }
const river = [], traffic = [], city = [], dist = [];
for (const d of [0, 3, 6, 10, 25, 50, 69, 70, 120]) for (const indoors of [false, true]) {
  const p = riverBabbleParams({ dist: d, indoors });
  river.push([d, indoors, r6(p.gain), r6(p.hz), r6(p.q)]);
}
for (let h = 0; h < 24; h += 0.75) traffic.push([h, r6(trafficLevel(h))]);
for (const h of [0, 3, 6.5, 8, 12, 16.8, 21, 23.5]) for (const indoors of [false, true]) {
  const p = cityHumParams({ hour: h, indoors });
  city.push([h, indoors, r6(p.gain), r6(p.hz)]);
}
for (const [x, z] of [[2.5, 10], [-25, 24], [0, -12], [60, 120], [-80, 200], [150, 40]])
  dist.push([x, z, r6(distToPolyline(riverPath, x, z))]);

const leaves = {};
for (let m = 1; m <= 12; m++) leaves[m] = C.SEASON.trees[m]?.[3] ?? 1;
const RR = C.ROOM_REVERB;

const params = round({
  formatVersion: 1,
  kind: 'lunden-audio-params',
  generator: 'tools/unreal-engine/export-audio.mjs',
  owner: '#2287',
  units: 'web units: metres, seconds, Hz, linear gain; `unreal` arrays are centimetres on Unreal axes (coordinates.mjs)',
  masterGain: C.AUDIO_MASTER_GAIN,
  footsteps,
  pickStep: {
    source: 'src/footsteps.js pickStep(stepInfo, { snow, wet, temp, month })',
    columns: ['surface', 'where', 'road', 'stairs', 'wet', 'month', 'snow', 'temp', 'profile'],
    cases: pick,
  },
  wind: {
    source: 'src/config.js WIND_SOUND, WIND.power, SEASON.trees[month][3]; src/windsound.js; src/windsim.js windPower; src/main.js (every 0.25 s)',
    sound: C.WIND_SOUND,
    power: C.WIND.power,
    leaves,
    powerCases: [0, 2, 6.5, 9, 13, 30].map((s) => [s, r6(windPower(s))]),
    strengthCases: strength,
    gustCases: gust,
    columns: ['speed', 'gust', 'leaves', 'near', 'indoors', 'gain', 'lpHz', 'lpQ', 'bandGain', 'bandHz', 'bandQ'],
    cases: wind,
  },
  ambient: {
    source: 'src/config.js AMBIENT_BED; src/ambientbed.js; src/riverbridge.js riverPath (Höje å centreline)',
    bed: C.AMBIENT_BED,
    river: { web: riverPath.map(([x, z]) => [x, z]), unreal: riverPath.map(([x, z]) => webToUnreal([x, 0, z]).slice(0, 2)) },
    riverColumns: ['dist', 'indoors', 'gain', 'hz', 'q'],
    riverCases: river,
    trafficCases: traffic,
    cityColumns: ['hour', 'indoors', 'gain', 'hz'],
    cityCases: city,
    distCases: dist,
  },
  reverb: {
    source: 'src/config.js ROOM_REVERB; src/roomreverb.js reverbZone; src/stepsurface.js indoorRoomClass',
    profiles: RR.profiles,
    courtyard: { ...RR.courtyard, unreal: rectToUnreal(RR.courtyard), maxYUnreal: RR.courtyard.maxY * 100 },
    fade: RR.fade,
  },
  snowMonths: C.SEASON.snowMonths,
});

const text = JSON.stringify(params, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (have !== text) { console.error(`export-audio: ${path.relative(root, OUT)} is stale; run without --check`); process.exit(1); }
  console.log('export-audio: audio-params.json is current');
} else {
  fs.writeFileSync(OUT, text);
  console.log(`export-audio: wrote ${path.relative(root, OUT)} (${pick.length} pickStep, ${wind.length} wind, ${river.length + city.length} bed cases)`);
}
