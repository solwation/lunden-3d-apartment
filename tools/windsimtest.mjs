// #2117: node --test tools/windsimtest.mjs  (the weather's wind: Open-Meteo wind in the month records, old caches without wind, the seeded
// seasonal draw for Lund, the fade between real and drawn, m/s and direction in scene axes, and that the rain / snow slant, the cloud
// shadows and the site sway follow it). Function-level checks against the hand-made fixture; no network, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';

globalThis.document ??= { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }) }) };
const { WIND, WEATHER, SITE_WIND, CLOUD_SHADOW: C } = await import('../src/config.js');
const WS = await import('../src/windsim.js');
const RW = await import('../src/realweather.js');
const { Weather } = await import('../src/weather.js');
const CS = await import('../src/cloudshadow.js');
const SW = await import('../src/sitewind.js');

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/openmeteo-2024-01.json', import.meta.url)));
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; }, m }; };
const NOW = new Date(2026, 9, 11, 12).getTime();
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('direction and units: meteorological FROM degrees → downwind scene x/z (x east, z south, north = −z); m/s → power', () => {
  const at = (deg) => WS.windVector(deg, 1);
  assert.ok(close(at(270).x, 1) && close(at(270).z, 0), 'a west wind blows towards +x (east)');
  assert.ok(close(at(0).x, 0) && close(at(0).z, 1), 'a north wind blows towards +z (south)');
  assert.ok(close(at(90).x, -1) && close(at(180).z, -1), 'east → −x, south → −z (north)');
  const sw = at(225), d = new T.Vector2(...SITE_WIND.dir).normalize();
  assert.ok(close(sw.x, d.x, 0.01) && close(sw.z, d.y, 0.01), '#2101\'s start direction is a south-westerly');
  for (const deg of [0, 37, 180, 251, 359]) { const f = WS.windFrom(WS.windVector(deg, 7.5)); assert.ok(close(f.from, deg, 1e-6) && close(f.speed, 7.5), `round trip ${deg}`); }
  assert.equal(WS.windPower(0), 0); assert.equal(WS.windPower(WIND.power.full), 1); assert.equal(WS.windPower(40), 1);
  const p2 = WS.windPower(2), p5 = WS.windPower(5), p10 = WS.windPower(10);
  assert.ok(p2 > 0.08 && p2 < 0.25 && p5 > p2 && p10 > p5 && p10 < 1, `2 m/s ${p2}, 5 m/s ${p5}, 10 m/s ${p10}`);
});

test('real weather: the request asks for the 10 m wind in m/s; parse / pack / unpack keep it; km/h is converted', () => {
  const rw = new RW.RealWeather({ fetchFn: async () => ({}), storage: mem(), now: () => NOW });
  const u = new URL(rw.url(2024, 1));
  assert.match(u.searchParams.get('hourly'), /wind_speed_10m/); assert.match(u.searchParams.get('hourly'), /wind_direction_10m/);
  assert.equal(u.searchParams.get('wind_speed_unit'), 'ms');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['end_date', 'hourly', 'latitude', 'longitude', 'start_date', 'timezone', 'wind_speed_unit'], 'only the site, the dates and what to return');
  const rec = RW.parseMonth(fx, 2024, 1), k = 14 * 24 + 12;
  assert.ok(close(rec.w[k], 13, 0.01) && rec.d[k] === 250, `15 Jan 12:00: ${rec.w[k]} m/s from ${rec.d[k]}°`);
  const back = RW.unpack(JSON.parse(JSON.stringify(RW.pack(rec))));
  assert.ok(!back.noWind && close(back.w[k], 13, 0.05) && back.d[k] === 250 && back.t.length === rec.t.length);
  const kmh = structuredClone(fx); kmh.hourly_units.wind_speed_10m = 'km/h'; kmh.hourly.wind_speed_10m = kmh.hourly.wind_speed_10m.map((v) => v * 3.6);
  assert.ok(close(RW.parseMonth(kmh, 2024, 1).w[k], 13, 0.01), 'km/h → m/s');
  const none = structuredClone(fx); delete none.hourly.wind_speed_10m; delete none.hourly.wind_direction_10m;
  const nr = RW.parseMonth(none, 2024, 1);
  assert.ok(nr && Number.isNaN(nr.w[k]) && RW.hourWind(nr, k) === null, 'a response without wind still parses (no wind for the hour)');
});

test('an old cache entry (v1, no wind) serves at once and is fetched again for its wind; the new one is stored as v2', async () => {
  const store = mem(), rec = RW.parseMonth(fx, 2024, 1), v1 = RW.pack(rec); delete v1.w; delete v1.d;
  store.setItem('lunden.weather.2024-01', JSON.stringify({ v: 1, at: NOW - 86400000 * 300, final: true, d: v1 }));
  const log = [], rw = new RW.RealWeather({ fetchFn: async (url) => { log.push(url); return { ok: true, status: 200, json: async () => fx }; }, storage: store, now: () => NOW, startAfter: 0 });
  rw.tick(2024, 1, 15);
  const first = rw.at(2024, 1, 15, 12);
  assert.ok(first && first.kind === 'rain' && first.wind === null, 'the old copy serves the hour, without wind (the draw fills it)');
  await wait(20);
  assert.equal(log.length, 1, 'fetched once more for its wind');
  const w = rw.at(2024, 1, 15, 12).wind, f = WS.windFrom(w);
  assert.ok(close(f.speed, 13, 0.01) && close(f.from, 250, 0.01) && w.x > 0 && w.z < 0, `then the real wind: ${f.speed.toFixed(1)} m/s from ${f.from.toFixed(0)}° (towards east-north-east)`);
  const saved = JSON.parse(store.getItem('lunden.weather.2024-01'));
  assert.ok(saved.v === 2 && saved.d.w.length === saved.d.t.length);
  rw.tick(2024, 1, 15); await wait(20);
  assert.equal(log.length, 1, 'a v2 archive month is not fetched again');
  // between two hours: a vector blend (no direction jump through a wrong angle); a calm hour
  const a = rw.at(2024, 1, 15, 7).wind, b = rw.at(2024, 1, 15, 8).wind, m = rw.at(2024, 1, 15, 7.5).wind;
  assert.ok(close(m.x, (a.x + b.x) / 2) && close(m.z, (a.z + b.z) / 2));
  assert.ok(WS.windFrom(rw.at(2024, 1, 3, 12).wind).speed < 1.5, 'the calm 3rd');
});

test('the draw: deterministic, prevailing south-west–west, stronger in winter, smooth, more in rain and storms', () => {
  assert.deepEqual(WS.simWind(2027, 3, 14, 15.25), WS.simWind(2027, 3, 14, 15.25));
  const sector = (from, a, b) => from >= a && from <= b;
  let n = 0, sw = 0, east = 0; const mean = Array(12).fill(0), cnt = Array(12).fill(0), speeds = [];
  for (const y of [2027, 2028, 2029]) for (let m = 1; m <= 12; m++) for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) for (let h = 0; h < 24; h += 3) {
    const f = WS.windFrom(WS.simWind(y, m, d, h));
    n++; if (sector(f.from, 190, 295)) sw++; if (sector(f.from, 30, 150)) east++;
    mean[m - 1] += f.speed; cnt[m - 1]++; speeds.push(f.speed);
  }
  const avg = mean.map((s, i) => s / cnt[i]), winter = (avg[11] + avg[0] + avg[1]) / 3, summer = (avg[5] + avg[6] + avg[7]) / 3;
  assert.ok(sw / n > 0.45, `south-west–west ${(100 * sw / n).toFixed(0)} %`);
  assert.ok(east / n > 0.08 && east / n < sw / n / 2, `easterlies ${(100 * east / n).toFixed(0)} %`);
  assert.ok(winter > summer + 0.7, `winter ${winter.toFixed(2)} m/s, summer ${summer.toFixed(2)} m/s`);
  speeds.sort((a, b) => a - b);
  const q = (p) => speeds[Math.floor(p * (speeds.length - 1))];
  assert.ok(q(0.5) > 2.5 && q(0.5) < 6 && q(0.05) < 2.5 && q(0.99) > 7 && q(1) <= WIND.max, `median ${q(0.5).toFixed(1)}, 5 % ${q(0.05).toFixed(1)}, 99 % ${q(0.99).toFixed(1)} m/s`);
  // smooth: 6-minute steps over a fortnight, including midnights and month ends
  let jump = 0;
  for (let t = 0; t < 14 * 24; t += 0.1) {
    const at = (tt) => { const dd = new Date(2027, 0, 25 + Math.floor(tt / 24)); return WS.simWind(dd.getFullYear(), dd.getMonth() + 1, dd.getDate(), tt % 24); };
    const a = at(t), b = at(t + 0.1); jump = Math.max(jump, Math.hypot(a.x - b.x, a.z - b.z));
  }
  assert.ok(jump < 0.6, `largest change in 6 min: ${jump.toFixed(2)} m/s`);
  const calm = WS.windFrom(WS.simWind(2027, 8, 5, 15)).speed, wet = WS.windFrom(WS.simWind(2027, 8, 5, 15, { rain: 1 })).speed, storm = WS.windFrom(WS.simWind(2027, 8, 5, 15, { rain: 1, storm: true })).speed;
  assert.ok(close(wet - calm, WIND.rain, 1e-9) && close(storm - wet, WIND.storm, 1e-9), `${calm.toFixed(1)} → rain ${wet.toFixed(1)} → storm ${storm.toFixed(1)} m/s`);
});

const day = (y, m, d, h) => ({ year: y, month: m, date: d, hour: h, daylight: 1 });
const newWeather = (dd, force = null) => { const cam = new T.PerspectiveCamera(); cam.position.set(30, 1.7, 60); return new Weather(new T.Scene(), cam, dd, force); };

test('Weather: real wind first, the draw beyond it, a smooth fade between them, the same wind for the cloud shadows', () => {
  const dd = day(2024, 1, 15, 12), w = newWeather(dd), rw = new RW.RealWeather({ fetchFn: null, storage: mem(), now: () => NOW });
  w.update(1 / 30);
  const drawn = { ...w.wind };
  assert.deepEqual(drawn, WS.simWind(2024, 1, 15, 12, { rain: w.rain, storm: w.storm }), 'no real data: the draw');
  assert.equal(dd.wind, w.wind, 'DayCycle gets the same wind');
  rw.months.set('2024-01', { rec: RW.parseMonth(fx, 2024, 1), at: NOW, final: true }); w.real = rw;
  const real = rw.at(2024, 1, 15, 12).wind, steps = [];
  for (let i = 0; i < 4 * 30; i++) { w.update(1 / 30); steps.push({ ...w.wind }); }
  let jump = 0; for (let i = 1; i < steps.length; i++) jump = Math.max(jump, Math.hypot(steps[i].x - steps[i - 1].x, steps[i].z - steps[i - 1].z));
  const mid = steps[Math.round(WEATHER.climate.fade * 15)];
  assert.ok(jump < Math.hypot(real.x - drawn.x, real.z - drawn.z) / 30, `eased over ${WEATHER.climate.fade} s (largest frame step ${jump.toFixed(3)} m/s)`);
  assert.ok(Math.hypot(mid.x - (drawn.x + real.x) / 2, mid.z - (drawn.z + real.z) / 2) < 0.6, 'half way at half the fade');
  assert.ok(close(w.wind.x, real.x) && close(w.wind.z, real.z), 'then the real wind');
  // a future day: no real data → the draw again
  Object.assign(dd, { year: 2027, month: 2, date: 3, hour: 9 }); w.real = null; w.src = undefined; w.update(1 / 30);
  assert.deepEqual({ ...w.wind }, WS.simWind(2027, 2, 3, 9, { rain: w.rain, storm: w.storm }));
});

test('rain streaks slant and snow drifts downwind, by the wind\'s strength', () => {
  for (const deg of [270, 0, 225, 120]) {
    const v = WS.windVector(deg, 4), s = WS.fallSlant(v), u = { x: v.x / 4, z: v.z / 4 };
    assert.ok(close(Math.hypot(s.x, s.z), WEATHER.slant.perMs * 4) && close(s.x * u.z - s.z * u.x, 0) && s.x * u.x + s.z * u.z > 0, `rain along the wind from ${deg}°`);
    assert.ok(s.dx * u.x + s.dz * u.z > 0 && close(Math.hypot(s.dx, s.dz), WEATHER.snowDrift.perMs * 4));
  }
  assert.ok(close(Math.hypot(WS.fallSlant(WS.windVector(250, 4)).x, WS.fallSlant(WS.windVector(250, 4)).z), WEATHER.wind, 0.01), '4 m/s ≈ the old fixed slant');
  assert.ok(close(Math.hypot(WS.fallSlant({ x: 30, z: 0 }).x), WEATHER.slant.max) && WS.fallSlant({ x: 0, z: 0 }).x === 0, 'capped; none in a calm');
  // in the Weather itself: forced rain, a westerly → streak bottoms east of their tops, moving east as they fall
  const dd = day(2026, 10, 12, 12), w = newWeather(dd, 'rain');
  w.state = function () { return { rain: 0.8, storm: false, overcast: 1, kind: 'rain', id: 'x', temp: 8, wind: WS.windVector(270, 10), source: 'forced' }; };
  w.update(1 / 30); w.update(1 / 30);
  const p = w.pos, top = [p[0], p[2]], bot = [p[3], p[5]];
  assert.ok(bot[0] - top[0] > 0.1 && close(bot[1], top[1], 1e-4), `streak slant east (${(bot[0] - top[0]).toFixed(3)} m over ${WEATHER.len} m)`);
  const x0 = p[0]; w.update(0.05);
  assert.ok(p[0] > x0 || p[1] > 50, 'moving east');
});

test('cloud shadows drift along the weather\'s wind, faster in a stronger wind, without a jump when it turns', () => {
  const sun = new T.Vector3(0.3, 0.8, -0.2).normalize(), s = CS.cloudShadowState({ sunDir: sun, oc: 0.45 });
  const pos = { x: 0, z: 0, dx: 0, dz: 0 };
  const sample = (x, z) => { CS.applyCloudShadows(s, pos); return CS.cloudShadowAt(x, 0, z); };
  for (const [deg, speed] of [[270, 6], [0, 10], [200, 3]]) {
    const wind = WS.windVector(deg, speed), v = CS.cloudVelocity(wind), dt = 20;
    assert.ok(close(Math.hypot(v.x, v.z), Math.min(C.drift[1], Math.max(C.drift[0], speed * C.windScale))), 'speed');
    const before = [[0, 0], [140, -60], [-300, 220]].map(([x, z]) => sample(x, z));
    CS.stepCloudDrift(pos, dt, wind);
    const after = [[0, 0], [140, -60], [-300, 220]].map(([x, z]) => sample(x + v.x * dt, z + v.z * dt));
    before.forEach((b, i) => assert.ok(close(b, after[i], 1e-5), `the shade moved downwind from ${deg}°`));
  }
  assert.ok(Math.hypot(...Object.values(CS.cloudVelocity(WS.windVector(250, 12)))) > Math.hypot(...Object.values(CS.cloudVelocity(WS.windVector(250, 2)))));
  const calm = CS.cloudVelocity({ x: 0, z: 0 }, { x: 0, z: 1 });
  assert.ok(close(calm.z, C.drift[0]) && close(calm.x, 0), 'a calm keeps the last direction, slowly');
  const none = CS.cloudVelocity(null);
  assert.ok(close(Math.hypot(none.x, none.z), C.speed), 'no wind: the old fixed drift');
});

test('SiteWind takes power and direction from the weather\'s wind, eased; &wind= still pins the power', () => {
  const weather = { wind: WS.windVector(90, 8), overcast: 0, rain: 0 };
  const sw = new SW.SiteWind(weather);
  assert.ok(close(SW.siteWind.power, WS.windPower(8)) && close(SW.siteWind.dir.x, -1) && close(SW.siteWind.dir.y, 0), 'an easterly: sway towards −x');
  assert.equal(SW.siteWindUniforms.uSiteWindDir.value, SW.siteWind.dir, 'the uniform is the same vector');
  weather.wind = WS.windVector(270, 2);
  sw.update(0.5);
  const d1 = SW.siteWind.dir.clone(), p1 = SW.siteWind.power;
  assert.ok(close(d1.length(), 1) && d1.x > -1 && p1 < WS.windPower(8) && p1 > WS.windPower(2), 'turning and easing, not jumping');
  for (let i = 0; i < 400; i++) sw.update(0.1);
  assert.ok(close(SW.siteWind.dir.x, 1, 1e-3) && close(SW.siteWind.power, WS.windPower(2), 1e-3), 'then the westerly');
  weather.wind = { x: 0, z: 0 }; sw.update(5);
  assert.ok(close(SW.siteWind.dir.x, 1, 1e-3), 'a calm keeps the direction');
  const forced = new SW.SiteWind({ wind: WS.windVector(270, 2) }, { force: 0.9, time: 3 });
  assert.equal(SW.siteWind.power, 0.9); forced.update(1); assert.equal(SW.siteWind.power, 0.9);
  new SW.SiteWind({ overcast: 1, rain: 0.8 });
  assert.equal(SW.siteWind.power, SW.siteWindPower({ overcast: 1, rain: 0.8 }), 'a weather without wind: #2101\'s formula');
  SW.siteWind.force = null; SW.siteWind.hold = false;
});
