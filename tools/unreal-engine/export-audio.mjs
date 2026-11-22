// #2287: the web's sound parameters for the Unreal port, read from the web's own modules (never typed in by hand).
// Writes tools/unreal-engine/audio-params.json, which tools/unreal-engine/python/build_audio.py turns into the MetaSounds,
// sound classes, reverb settings and BPC_LundenAudio's variable defaults, and which tests/test_audio.py checks the
// Blueprint against. Besides the constants (src/config.js FOOTSTEPS, PLAYER strides, WIND_SOUND, WIND.power,
// AMBIENT_BED, ROOM_REVERB, SEASON) it stores answers of the web's own functions (footsteps.js pickStep, windsound.js
// gustAt / windStrength / windSoundParams, ambientbed.js riverBabbleParams / trafficLevel / cityHumParams /
// distToPolyline) for the test to compare with.
// #2402: hail (weather.js: the rain loop louder and brighter) and thunder (audio.js sfx.thunder, played by weather.js
// strike). Thunder's numbers are measured from the web's own sfx.thunder through a recording stand-in for the
// AudioContext, fitted to the shape below and checked against every capture of a grid, so a changed web thunder fails here.
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
const { rainSurfaceMix } = await import(src('rainsurface.js'));
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

// #2402 weather.js: hail is the rain loop `loud` times louder and with a `cutoff` low-pass outdoors (the indoor
// muffling and level are the rain's); a storm strikes while more than `minRain` falls, the thunder `dist / soundSpeed`
// s after the flash. These are literals in weather.js, so they are read from the source text as the teleport is.
const weatherText = fs.readFileSync(path.join(root, 'src/weather.js'), 'utf8');
const need = (re, what) => { const m = re.exec(weatherText); if (!m) { console.error(`export-audio: weather.js ${what} not found`); process.exit(3); } return m; };
const loud = need(/const loud = this\.kind === 'snow' \? 0 : this\.kind === 'hail' \? ([\d.]+) : 1;/, 'hail loudness');
const room = need(/\(inside \? ([\d.]+) : 1\) \* \(mix\?\.gain \?\? 1\), Math\.min\(inside \? ([\d.]+) : this\.kind === 'hail' \? ([\d.]+) : ([\d.]+),/, 'rain/hail level and cutoff');
const stormRule = need(/if \(this\.storm && this\.rain > ([\d.]+)\) \{\s*this\.next -= dt;\s*if \(this\.next <= 0\) this\.strike\(inside, mix\);/, 'storm strike rule');
const delayRule = need(/sfx\.thunder\(dist \/ ([\d.]+), near, inside \|\| \(mix && mix\.thunder < 1\), mix\?\.thunder \?\? 1\);/, 'thunder delay');
need(/const dist = between\(Math\.random, W\.flash\.dist\);\s*const near = 1 - \(dist - W\.flash\.dist\[0\]\) \/ \(W\.flash\.dist\[1\] - W\.flash\.dist\[0\]\);/, 'strike distance and nearness');
need(/this\.next = between\(Math\.random, W\.flash\.every\);\s*sfx\.thunder/, 'next strike draw');
const hail = {
  source: 'src/weather.js Weather.update (the rain sound for kind hail); src/audio.js sfx.rain',
  loud: Number(loud[1]), cutoff: Number(room[3]), rainCutoff: Number(room[4]), inside: Number(room[1]), insideCutoff: Number(room[2]),
};

// #2402 sfx.thunder, measured. A stand-in AudioContext records every node, its settings and connections; each noise()
// burst is a buffer source -> biquad -> gain (linear attack, exponential fall to `floor`) -> the effect's out() gain.
class Param { constructor(v) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); } linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); } setTargetAtTime(v, t) { this.events.push(['target', v, t]); }
  cancelScheduledValues() {} }
class Rec { constructor(kind, ctx) { this.kind = kind; this.out = []; ctx.nodes.push(this); } connect(n) { this.out.push(n); return n; } disconnect() {} }
class Recorder {
  constructor() { this.nodes = []; this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = new Rec('destination', this); this.listener = {}; recorder = this; }
  createGain() { const n = new Rec('gain', this); n.gain = new Param(1); return n; }
  createBiquadFilter() { const n = new Rec('biquad', this); n.type = 'lowpass'; n.frequency = new Param(350); n.Q = new Param(1); return n; }
  createBufferSource() { const n = new Rec('source', this); n.start = (t) => { n.t0 = t; }; n.stop = (t) => { n.t1 = t; }; return n; }
  createOscillator() { const n = this.createBufferSource(); n.kind = 'osc'; n.frequency = new Param(440); return n; }
  createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  createConvolver() { throw new Error('no room reverb in the recorder'); }
  createPanner() { const n = new Rec('panner', this); for (const k of ['positionX', 'positionY', 'positionZ']) n[k] = new Param(0); return n; }
  resume() {}
}
let recorder = null;
const realContext = globalThis.AudioContext;
globalThis.AudioContext = Recorder;
const audio = await import(src('audio.js'));
audio.initAudio();
globalThis.AudioContext = realContext;
function thunderCapture(near, inside, rand) {
  recorder.nodes.length = 0;
  const random = Math.random; Math.random = () => rand;
  try { audio.sfx.thunder(0, near, inside, 1); } finally { Math.random = random; }
  return recorder.nodes.filter((n) => n.kind === 'source').map((s) => {
    const f = s.out[0], g = f.out[0], d = g.out[0], lin = g.gain.events.find((e) => e[0] === 'lin'), fall = g.gain.events.find((e) => e[0] === 'exp');
    return { t0: s.t0, dur: fall[2] - s.t0, stop: s.t1 - fall[2], type: f.type, hz: f.frequency.value, q: f.Q.value, gain: lin[1],
      attack: lin[2] - s.t0, floor: fall[1], out: d.gain.value };
  });
}
const cap = (near, inside, rand) => thunderCapture(near, inside, rand);
const near1 = cap(1, false, 0), near0 = cap(0, false, 0), half = cap(1, false, 0.5), inside0 = cap(0, true, 0);
const crackAt = (n) => cap(n, false, 0)[0].type === 'highpass';
let lo = 0, hi = 1; // the crack's threshold: present at hi, absent at lo
for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (crackAt(m)) hi = m; else lo = m; }
const above = Math.round(hi * 1e6) / 1e6; // `near > above`: absent at it, present just over it
if (crackAt(above) || !crackAt(above + 1e-6)) { console.error(`export-audio: sfx.thunder's crack threshold is not a plain near > ${above}`); process.exit(4); }
const [crack, rumble1, roll1] = near1, rumble0 = near0[0], roll0 = near0[1];
const thunder = {
  source: 'src/audio.js sfx.thunder (measured through a recording AudioContext) and noise(); src/weather.js strike; src/config.js WEATHER.flash',
  inside: inside0[0].out / near0[0].out, floor: rumble1.floor, tail: rumble1.stop,
  crack: { above, duration: crack.dur, type: crack.type, hz: crack.hz, q: crack.q, gainPerNear: crack.gain, attack: crack.attack },
  rumble: { duration: [rumble1.dur, rumble0.dur - rumble1.dur, 2 * (half[1].dur - rumble1.dur)], hz: [rumble0.hz, rumble1.hz - rumble0.hz],
    insideHz: inside0[0].hz, q: rumble1.q, gain: [rumble0.gain, rumble1.gain - rumble0.gain], attack: [rumble1.attack, rumble0.attack - rumble1.attack] },
  rolls: { count: near0.length - 1, start: [roll1.t0, (half[2].t0 - roll1.t0) / (0.5 * half[1].dur)], duration: [roll1.dur, 2 * (half[2].dur - roll1.dur)],
    hz: roll1.hz, q: roll1.q, gain: roll1.gain, attack: roll1.attack },
  strike: { every: C.WEATHER.flash.every, dist: C.WEATHER.flash.dist, soundSpeed: Number(delayRule[1]), minRain: Number(stormRule[1]) },
};
/** The fitted thunder for (near, inside, rand), in the capture's form: what build_audio.py builds as MS_LundenThunder. */
function thunderModel(near, inside, rand) {
  const T = thunder, R = T.rumble, L = T.rolls, out = inside ? T.inside : 1, list = [];
  const burst = (t0, dur, type, hz, q, gain, attack) => ({ t0, dur, stop: T.tail, type, hz, q, gain, attack, floor: T.floor, out });
  if (near > T.crack.above) list.push(burst(0, T.crack.duration, T.crack.type, T.crack.hz, T.crack.q, T.crack.gainPerNear * near, T.crack.attack));
  const dur = R.duration[0] + R.duration[1] * (1 - near) + R.duration[2] * rand;
  list.push(burst(0, dur, 'lowpass', inside ? R.insideHz : R.hz[0] + R.hz[1] * near, R.q, R.gain[0] + R.gain[1] * near, R.attack[0] + R.attack[1] * (1 - near)));
  for (let k = 0; k < L.count; k++) list.push(burst(L.start[0] + rand * dur * L.start[1], L.duration[0] + rand * L.duration[1], 'lowpass', L.hz, L.q, L.gain, L.attack));
  return list;
}
for (const near of [0, 0.25, 0.6, 0.61, 0.9, 1]) for (const inside of [false, true]) for (const rand of [0, 0.37, 0.999]) {
  const web = thunderCapture(near, inside, rand), fit = thunderModel(near, inside, rand);
  const same = web.length === fit.length && web.every((w, i) => Object.keys(w).every((k) => typeof w[k] === 'string' ? w[k] === fit[i][k] : Math.abs(w[k] - fit[i][k]) < 1e-9));
  if (!same) { console.error(`export-audio: sfx.thunder(near ${near}, inside ${inside}, random ${rand}) no longer has the fitted shape:\n web ${JSON.stringify(web)}\n fit ${JSON.stringify(fit)}`); process.exit(4); }
}

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
  rain: {
    source: 'src/rainsurface.js rainSurfaceMix; src/weather.js Weather.update; src/audio.js sfx.rain',
    sound: C.WEATHER.sound,
    surface: C.RAIN_SURFACE,
    cloudTop: C.SKYLAYER.top, cloudFade: C.SKYLAYER.fade,
    cases: [
      {}, { indoors: true }, { underRoof: true }, { trees: 1, leaves: 1, grass: 1 },
      { trees: 1, leaves: 0, grass: 1 }, { underRoof: true, trees: 0.6, leaves: 0.5, riverDist: 15 },
      { riverDist: 0, metal: 0.4 }, { indoors: true, metal: 1 }, { riverDist: 34, grass: 0.4 },
    ].map(input => ({ input, mix: rainSurfaceMix(input) })),
  },
  hail,
  thunder,
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
