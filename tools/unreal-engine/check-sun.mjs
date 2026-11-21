// #2283: compare Unreal's sun (and moon) with the web's own src/daycycle.js for the same date and clock time.
//   node tools/unreal-engine/check-sun.mjs <lighting-result.json> [--tolerance 1]
// The result file comes from tools/unreal-engine/tests/test_lighting.py: `sun` is a list of
// { year, month, day, hour, sun: [X, Y, Z], moon: [X, Y, Z] } with unit vectors towards the body in Unreal axes.
// The reference is the web's real sunDirection(hour, dayOfYear) (plan axes, x east, y up, z south), mapped with the tested
// coordinates.mjs axis swap (Unreal X = x, Y = z, Z = y). Elevation, azimuth (in the plan, from Unreal +X towards +Y) and
// the angle between the two directions must each be within the tolerance (degrees). The moon uses src/moon.js moonState
// turned into a direction the way DayCycle.update does it (daycycle.js keeps skyDirection private, so its eight lines
// are repeated below); it is reported and checked with the same tolerance.
// #2307: when the result has them, also the sky's state for the stars, the moon disc, the clouds and the small lamps,
// against the web's own functions (within 0.001): Night = 1 - daylight (daycycle.js uNight), MoonPh = (sin e, -cos e, lit
// fraction) of moonState's elongation (uMoonPh), CloudCover = the sky's cloud threshold from cloudshadow.js skyCloudState for
// the weather's overcast (forced rain 1, snow x 0.7, weather.js) scaled 0 (clear) ... 1 (overcast), DuskLight = daylight x
// (1 - 0.6 x the weather's overcast) (main.js), and the `dusk` run played through Lights.updateAuto's rule (LIGHTING.auto;
// lights.js keeps it in a class with the scene, so its five lines are repeated below) with the same hand switches.
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { sunDirection, dayOfYear } from '../../src/daycycle.js';
import { moonState } from '../../src/moon.js';
import { DAY, LIGHTING, CLOUD_SHADOW } from '../../src/config.js';
import { skyCloudState, stepCloudDrift } from '../../src/cloudshadow.js';
import { webToUnreal } from './coordinates.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const tolIndex = args.indexOf('--tolerance');
const tolerance = tolIndex >= 0 ? Number(args[tolIndex + 1]) : 1;
if (!file) { console.error('usage: node tools/unreal-engine/check-sun.mjs <lighting-result.json> [--tolerance deg]'); process.exit(2); }
const result = JSON.parse(await readFile(file, 'utf8'));
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const summerTime = (doy) => doy >= 87 && doy < 300; // daycycle.js (private)

function skyDirection(solar, dec) { // daycycle.js skyDirection (private), unchanged
  const lat = DAY.lat * RAD, h = (solar - 12) * 15 * RAD;
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const el = Math.asin(sinEl);
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  const e = -Math.cos(el) * Math.sin(az), s = Math.cos(el) * Math.cos(az);
  const b = DAY.planNorth * RAD, cb = Math.cos(b), sb = Math.sin(b);
  return new THREE.Vector3(e * cb + s * sb, sinEl, s * cb - e * sb).normalize();
}

const toUnreal = (v) => { const [x, y, z] = webToUnreal([v.x, v.y, v.z]); return [x / 100, y / 100, z / 100]; };
const angles = ([x, y, z]) => ({ el: Math.asin(Math.max(-1, Math.min(1, z / Math.hypot(x, y, z)))) * DEG, az: Math.atan2(y, x) * DEG });
const wrap = (d) => ((d + 540) % 360) - 180;
const between = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b)))) * DEG;

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const daylightAt = (y, m, d, h) => smooth(-0.08, 0.18, sunDirection(h, dayOfYear(y, m, d)).y); // DayCycle.daylight
const moonAt = (y, m, d, h) => moonState(Date.UTC(y, m - 1, d) + (h - (summerTime(dayOfYear(y, m, d)) ? 2 : 1)) * 36e5, DAY.lat, DAY.lon);
const S = CLOUD_SHADOW.sky, full = CLOUD_SHADOW.thr[1];
const coverOf = (oc) => (S.clearThr - skyCloudState(oc).thr) / (S.clearThr - full);
const extra = [];
const near = (what, got, want) => { const ok = got !== undefined && Math.abs(got - want) <= 1e-3; extra.push({ what, got, want, ok }); };

let worst = 0, failed = 0;
const rows = [];
for (const c of result.sun ?? []) {
  const doy = dayOfYear(c.year, c.month, c.day);
  const sunWeb = toUnreal(sunDirection(c.hour, doy));
  const moon = moonState(Date.UTC(c.year, c.month - 1, c.day) + (c.hour - (summerTime(doy) ? 2 : 1)) * 36e5, DAY.lat, DAY.lon);
  const moonWeb = toUnreal(skyDirection(moon.ha / 15 + 12, moon.dec * RAD));
  for (const [body, web, ue] of [['sun', sunWeb, c.sun], ['moon', moonWeb, c.moon]]) {
    if (!ue) continue;
    const w = angles(web), u = angles(ue);
    // azimuth is undefined straight overhead; it never is at 55.7° N, but guard anyway
    const dEl = Math.abs(u.el - w.el), dAz = Math.abs(w.el) > 89.5 ? 0 : Math.abs(wrap(u.az - w.az)), dAng = between(web, ue);
    const bad = dEl > tolerance || dAz > tolerance || dAng > tolerance;
    worst = Math.max(worst, dEl, dAz, dAng); if (bad) failed++;
    rows.push({ date: `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`, hour: c.hour, body,
      webElevation: +w.el.toFixed(3), unrealElevation: +u.el.toFixed(3), webAzimuth: +w.az.toFixed(3), unrealAzimuth: +u.az.toFixed(3),
      dElevation: +dEl.toFixed(4), dAzimuth: +dAz.toFixed(4), dAngle: +dAng.toFixed(4), ok: !bad });
  }
}
if (!rows.length) { console.error(`${file}: no sun cases`); process.exit(3); }

for (const c of result.sun ?? []) {
  if (c.night === undefined) continue;
  const at = `${c.year}-${c.month}-${c.day} ${c.hour} h`, moon = moonAt(c.year, c.month, c.day, c.hour);
  near(`${at} night`, c.night, 1 - daylightAt(c.year, c.month, c.day, c.hour));
  [Math.sin(moon.elong), -Math.cos(moon.elong), moon.illum].forEach((v, i) => near(`${at} moonPh[${i}]`, c.moonPh?.[i], v));
  near(`${at} cloudCover (clear)`, c.cloudCover, coverOf(0));
}
const drift = {}, period = CLOUD_SHADOW.cell * CLOUD_SHADOW.cells;
for (const row of result.cloudDrift ?? []) {
  const angle = (row.heading - DAY.planNorth) * Math.PI / 180;
  // Seed each interval at its recorded phase and carry the last direction through calm weather.
  [drift.dx, drift.dz] = row.before.map(v => -v);
  stepCloudDrift(drift, row.dt, {x: -row.speed * Math.sin(angle), z: row.speed * Math.cos(angle)});
  for (const [i, target] of [drift.x, drift.z].entries()) {
    const delta = row.after[i] - target;
    near(`cloud phase after ${row.dt.toFixed(3)} s at ${row.speed} m/s, axis ${i}`, delta - Math.round(delta / period) * period, 0);
  }
}
for (const w of result.weather ?? []) {
  if (w.cloudCover === undefined) continue;
  const raw = w.rain || w.snow ? 1 : 0, oc = w.rain ? 1 : w.snow ? 0.7 : 0; // forced weather; day.overcast: snow x 0.7
  if (w.skyThreshold !== undefined) {
    near(`${w.event} sky threshold`, w.skyThreshold, skyCloudState(oc).thr);
    near(`${w.event} overcast`, w.overcast, oc);
  }
  near(`${w.event} -> rain ${w.rain} snow ${w.snow}: cloudCover`, w.cloudCover, coverOf(oc));
  near(`${w.event} -> rain ${w.rain} snow ${w.snow}: duskLight`, w.duskLight, daylightAt(w.year, w.month, w.day, w.hour) * (1 - 0.6 * raw));
}
if (result.dusk?.length) { // Lights.updateAuto (#234) with the same run
  const A = LIGHTING.auto, on = { A: false, B: false, C: false }, auto = { A: true, B: false, C: true };
  let dark;
  for (const r of result.dusk) {
    if (r.hand) on[r.hand[0]] = r.hand[1] === 'TurnOn' ? true : r.hand[1] === 'TurnOff' ? false : !on[r.hand[0]];
    const input = daylightAt(2026, 6, 21, r.hour) * (1 - 0.6 * r.rain);
    near(`dusk step ${r.step} duskLight`, r.duskLight, input);
    const first = dark === undefined, now = first ? input < (A.on + A.off) / 2 : dark ? input < A.off : input < A.on;
    if (now !== dark) { dark = now; for (const k in on) if (auto[k]) on[k] = dark; }
    for (const k in on) extra.push({ what: `dusk step ${r.step} lamp ${k} on`, got: r.lamps[k].isOn, want: on[k], ok: r.lamps[k].isOn === on[k] });
  }
}
for (const e of extra) if (!e.ok) failed++;
if (extra.length) console.log(`${extra.filter((e) => e.ok).length}/${extra.length} sky, cloud and dusk-lamp values as the web's` +
  (extra.some((e) => !e.ok) ? ': FAIL ' + JSON.stringify(extra.filter((e) => !e.ok)) : ''));
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.date} ${String(r.hour).padStart(5)} h ${r.body.padEnd(4)} elevation web ${r.webElevation.toFixed(3).padStart(8)} unreal ${r.unrealElevation.toFixed(3).padStart(8)}  azimuth web ${r.webAzimuth.toFixed(3).padStart(8)} unreal ${r.unrealAzimuth.toFixed(3).padStart(8)}  angle ${r.dAngle.toFixed(4)}°`);
console.log(`${failed ? 'FAIL' : 'PASS'}: ${rows.length} directions, worst difference ${worst.toFixed(4)}° (tolerance ${tolerance}°)`);
process.exit(failed ? 1 : 0);
