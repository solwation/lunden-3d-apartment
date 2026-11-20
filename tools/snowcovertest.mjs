// #2176: the snow cover model (src/snowcover.js, src/snowground.js pure parts), headless. Run: node tools/snowcovertest.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SNOW_COVER as P } from '../src/config.js';
import { snowStep, snowSeries, coverOf, calendarCover, lyingNow, snowHold, snowWhite, snowState, snowLies, SnowCover } from '../src/snowcover.js';
import { shelterData } from '../src/snowground.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const near = (a, b, e, m) => ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`);

// build-up and melt
const fall = Array.from({ length: 10 }, () => ({ temp: -2, snowCm: 0.8, rainMm: 0 }));
const built = snowSeries(fall); near(built, 8, 1e-9, 'ten snowy hours build 8 cm'); eq(coverOf(built), 1, 'deep snow covers everything');
near(coverOf(2), 0.5, 1e-9, '2 cm = half cover');
eq(snowStep(5, { temp: -3 }), 5, 'frost without snowfall changes nothing');
eq(snowStep(5, { temp: 0 }), 5, '0 °C does not melt');
const dry = snowStep(5, { temp: 3 }), wet = snowStep(5, { temp: 3, rainMm: 2 });
near(dry, 5 - P.melt * 3, 1e-9, 'melt per degree-hour'); ok(wet < dry, 'rain on snow melts faster');
eq(snowStep(0.1, { temp: 8 }), 0, 'never below zero'); eq(snowStep(P.max, { snowCm: 5 }), P.max, 'capped');
eq(snowSeries([null, null], 3), 3, 'hours without data change nothing');
ok(snowSeries([...fall, ...Array.from({ length: 200 }, () => ({ temp: 4, snowCm: 0, rainMm: 0.3 }))]) === 0, 'a long mild spell melts it all');
eq(lyingNow(false, P.lies - 0.01), false, 'not yet'); eq(lyingNow(false, P.lies), true, 'lies'); eq(lyingNow(true, P.gone + 0.01), true, 'hysteresis holds'); eq(lyingNow(true, P.gone), false, 'gone');
eq(calendarCover(1), 1, 'January: calendar snow'); eq(calendarCover(7), 0, 'July: none');

// patchiness: asphalt first, grass last; shelter / ridge keep it longer
const plain = { n: 0.5 };
ok(snowHold('asphalt', plain) > snowHold('paving', plain) && snowHold('paving', plain) > snowHold('gravel', plain) && snowHold('gravel', plain) > snowHold('grass', plain), 'hold order asphalt > paving > gravel > grass');
for (const c of ['asphalt', 'paving', 'gravel', 'grass']) ok(snowHold(c, { n: 0.5, shelter: 1 }) < snowHold(c, plain), `${c}: shelter lowers the hold`);
ok(snowHold('asphalt', { n: 0.5, ridge: 1 }) < snowHold('asphalt', plain), 'ridge lowers the hold');
ok(snowHold('asphalt', { n: 0.1, shelter: 1, ridge: 1 }) >= 0, 'hold never negative');
let prev = -1; for (let c = 0; c <= 1.0001; c += 0.05) { const w = snowWhite(c, 'asphalt', plain); ok(w >= prev - 1e-12, 'white grows with the cover'); prev = w; }
eq(snowWhite(1, 'asphalt', { n: 0 }), 1, 'full cover whitens even the barest asphalt spot'); eq(snowWhite(0, 'grass', plain), 0, 'no cover, no snow');
const mid = 0.45; // thin cover: grass white, asphalt bare, a sheltered asphalt spot in between
ok(snowWhite(mid, 'grass', plain) > 0.9 && snowWhite(mid, 'asphalt', plain) < 0.05, 'thaw: grass keeps snow, asphalt is bare');
ok(snowWhite(mid, 'asphalt', { n: 0.5, shelter: 1 }) > snowWhite(mid, 'asphalt', plain), 'under a tree the asphalt keeps its snow longer');

// the shelter map: a tree disc, a north band, a kerb ridge
const M = { size: 64, extent: 32, centre: [0, 0], treeReach: 1, northBand: 4 }; // 1 m per texel
const px = shelterData({ trees: [{ x: -16, z: -16, r: 5 }], boxes: [{ x0: 10, x1: 20, z0: 10, z1: 20, y1: 9 }], roadAt: (x, z) => (Math.abs(z + 20) < 6 ? { across: z + 20, half: 3 } : null) }, M);
const at = (x, z, ch) => px[((Math.floor(z + 32)) * 64 + Math.floor(x + 32)) * 4 + ch];
ok(at(-16, -16, 0) > 250, 'tree centre sheltered'); eq(at(0, 0, 0), 0, 'open ground not sheltered');
ok(at(15, 9, 0) > at(15, 6.5, 0) && at(15, 6.5, 0) > 0, 'north band fades away from the facade'); eq(at(15, 21, 0), 0, 'nothing on the south side');
ok(at(0, -16.5, 1) > 0 && at(0, -20, 1) === 0 && at(0, -10, 1) === 0, 'ridge only at the road edge (|across| ≈ half)');

// the driver over a weather series (the fixture, fed through a fake real source)
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/openmeteo-snow-2176.json', import.meta.url)));
const rec = new Map(); fx.hourly.time.forEach((t, i) => rec.set(t, i));
const rawAt = (y, m, d, h) => { const i = rec.get(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`); return i === undefined ? null : { temp: fx.hourly.temperature_2m[i], snowCm: fx.hourly.snowfall[i], rainMm: fx.hourly.snowfall[i] > 0 ? 0 : fx.hourly.rain[i] }; };
const day = { year: 2026, month: 1, date: 1, hour: 12 }, weather = { real: { rawAt, version: 1, want() {} }, force: null };
const drv = new SnowCover(weather, day); const at12 = (m, d, h = 12) => { Object.assign(day, { month: m, date: d, hour: h }); return drv.update(100).cover; };
near(at12(1, 1), 0, 1e-9, 'before the snowfall: bare');
ok(at12(1, 2, 9) > 0.3 && at12(1, 2, 9) < 1, 'during the snowfall: building up');
near(at12(1, 3, 7), 1, 1e-9, 'after the snowfall: full cover');
near(at12(1, 7), 1, 1e-9, 'frost keeps it');
const thaw = []; for (let h = 0; h < 5 * 24; h += 2) thaw.push(at12(1, 9 + Math.floor(h / 24), h % 24)); ok(thaw.every((v, i) => !i || v <= thaw[i - 1] + 1e-9), 'thaw: monotone melt'); ok(thaw.some((v) => v > 0.05 && v < 0.95), 'thaw: a patchy stage exists');
near(at12(1, 20), 0, 1e-9, 'mild rainy winter day: snow-free');
eq(snowState.source, 'real', 'source is real'); eq(snowLies(1), false, 'binary reading follows (no snow)');
at12(1, 5); eq(snowLies(1), true, 'binary reading: snow lies in the frost');
// a jump back in time re-reads the history
near(at12(1, 3, 7), 1, 1e-9, 'jump back: same as before');
// without data for the hour: the calendar
const noData = new SnowCover({ real: { rawAt: () => null, version: 1, want() {} }, force: null }, { year: 2030, month: 7, date: 5, hour: 12 });
eq(noData.update(1).cover, 0, 'no data in July: calendar 0'); const dec = new SnowCover({ real: null, force: null }, { year: 2030, month: 12, date: 5, hour: 12 }); eq(dec.update(1).cover, 1, 'no real weather in December: calendar 1');
const forced = new SnowCover({ real: { rawAt, version: 1, want() {} }, force: 'clear' }, { year: 2026, month: 1, date: 20, hour: 12 }); eq(forced.update(1).cover, 1, 'forced weather: calendar'); 
console.log(`snowcovertest: ${n} checks passed`);
