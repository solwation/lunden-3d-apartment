// #2194: node --test tools/moontest.mjs  (the moon's real phase and position, src/moon.js, and its consumers in daycycle.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { moonState, moonEvents, phaseName } from '../src/moon.js';
import { DAY } from '../src/config.js';

const LAT = DAY.lat, LON = DAY.lon, H = 36e5;
/** UTC time (ms) of the extreme elongation (new: min, full: max) within `days` days after `fromIso`, 1-minute scan. */
function extreme(fromIso, days, kind) {
  let best = null; const s = Date.parse(fromIso);
  for (let t = s; t < s + days * 864e5; t += 6e4) { const v = moonState(t, LAT, LON).elong * (kind === 'new' ? 1 : -1); if (!best || v < best.v) best = { v, t }; }
  return best.t;
}

test('new and full moon fall within 1 h of the tabulated instants (USNO / NASA, UTC)', () => {
  const known = [['new', '2026-11-08T00:00Z', '2026-11-09T07:02Z'], ['full', '2026-11-23T00:00Z', '2026-11-24T14:53Z'],
    ['new', '2000-01-05T00:00Z', '2000-01-06T18:14Z'], ['full', '2000-01-20T00:00Z', '2000-01-21T04:40Z'],
    ['full', '2018-01-30T00:00Z', '2018-01-31T13:27Z'], ['new', '2024-04-07T00:00Z', '2024-04-08T18:21Z']];
  for (const [kind, from, want] of known) assert.ok(Math.abs(extreme(from, 3, kind) - Date.parse(want)) < 1 * H, `${kind} near ${want}`);
});

test('illumination and phase follow the cycle: new dark, quarters half, full bright, waxing then waning', () => {
  const at = (iso) => moonState(Date.parse(iso), LAT, LON);
  assert.ok(at('2026-11-09T07:00Z').illum < 0.005);
  assert.ok(at('2026-11-24T15:00Z').illum > 0.995);
  const q1 = at('2026-11-17T01:00Z'); assert.ok(Math.abs(q1.illum - 0.5) < 0.08 && q1.waxing, 'first quarter around 2026-11-17');
  const q3 = at('2026-12-01T12:00Z'); assert.ok(Math.abs(q3.illum - 0.5) < 0.08 && !q3.waxing, 'last quarter around 2026-12-01');
  assert.ok(Math.abs(at('2026-11-24T15:00Z').phase - 0.5) < 0.01);
  assert.equal(phaseName(0.5), 'Fullmåne'); assert.equal(phaseName(0), 'Nymåne'); assert.equal(phaseName(0.99), 'Nymåne');
  // a synodic month is 29.53 days: the same phase again after it
  const a = at('2026-11-12T00:00Z').illum, b = at('2026-12-11T13:00Z').illum; assert.ok(Math.abs(a - b) < 0.05);
});

test('rise and set: the full moon rises near sunset and sets near sunrise; every day has at most one of each', () => {
  const ev = moonEvents(Date.parse('2026-11-24T00:00Z'), 24, LAT, LON);
  assert.equal(ev.rise.length, 1); assert.equal(ev.set.length, 1);
  // Lund 2026-11-24: sunset ~14:50 UTC (15:50 CET), sunrise ~06:55 UTC; the full moon rises ~sunset +-1.5 h, sets ~sunrise +-1.5 h
  assert.ok(Math.abs(ev.rise[0] - Date.parse('2026-11-24T14:00Z')) < 1.5 * H, new Date(ev.rise[0]).toISOString());
  assert.ok(Math.abs(ev.set[0] - Date.parse('2026-11-24T07:15Z')) < 1.5 * H, new Date(ev.set[0]).toISOString());
  // the new moon travels with the sun: up by day, gone at night
  const nm = moonState(Date.parse('2026-11-09T10:30Z'), LAT, LON); assert.ok(nm.alt > 5 && nm.alt < 20);
  assert.ok(moonState(Date.parse('2026-11-09T22:00Z'), LAT, LON).alt < -10);
  // a month of days: never two rises
  for (let d = 0; d < 30; d++) assert.ok(moonEvents(Date.parse('2026-11-01T00:00Z') + d * 864e5, 24, LAT, LON).rise.length <= 1);
});

test('position: culminates south, highest near the full moon in winter (declination up to ~+28 near the 2025-26 lunar standstill)', () => {
  let top = -90;
  for (let t = Date.parse('2026-11-24T00:00Z'); t < Date.parse('2026-11-25T00:00Z'); t += 6e4 * 5) { const m = moonState(t, LAT, LON); if (m.alt > top) top = m.alt; }
  assert.ok(top > 50 && top < 64, `full moon in November culminates at ${top.toFixed(1)} deg`);
  const m = moonState(Date.parse('2026-11-24T23:05Z'), LAT, LON); assert.ok(Math.abs(m.az) < 12, 'near the meridian it is due south');
});
