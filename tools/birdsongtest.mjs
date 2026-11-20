// #2178: node --test tools/birdsongtest.mjs  (the song schedule month x hour x weather, the phrases, the perch/range rule, the scheduler's
// species / gull / alarm events and the two-voice cap).
import test from 'node:test';
import assert from 'node:assert/strict';
const { BIRD_SONG: S } = await import('../src/config.js');
const B = await import('../src/birdsong.js');
const { VoiceCap } = await import('../src/spatialsound.js');
const { sunTimes } = await import('../src/daycycle.js');

const doyOf = (m) => [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][m - 1];
const plan = (month, hour, rain = 0) => { const [rise, set] = sunTimes(doyOf(month)); return { rise, set, ...B.songPlan({ month, hour, rise, set, rain }) }; };
const seeded = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

test('dawn chorus Mar-Jul: the peak hour near sunrise beats midday, the evening session sits between, night is silent', () => {
  for (const m of [3, 4, 5, 6, 7]) {
    const { rise, set } = plan(m, 12), at = (h) => B.songPlan({ month: m, hour: h, rise, set }).rate;
    const dawn = at(rise + 0.1), noon = at(12), eve = at(set - 1), night = at(0.5);
    assert.ok(dawn > noon * 2, `m${m} dawn ${dawn} noon ${noon}`);
    assert.ok(eve > noon && eve < dawn, `m${m} evening ${eve}`);
    assert.equal(night, 0);
  }
  // outside the chorus months there is no dawn peak worth the name
  for (const m of [9, 11, 1]) { const { rise, set } = plan(m, 12), at = (h) => B.songPlan({ month: m, hour: h, rise, set }).rate; assert.ok(at(rise + 0.1) < at(12) * 1.5); }
});

test('season: spring mixes all four, late summer and winter are quiet with robin and great tit only', () => {
  const peak = (m) => { const { rise } = plan(m, 12); return plan(m, rise + 0.1).rate; };
  assert.ok(peak(5) > 3 * peak(8) && peak(5) > 3 * peak(12) && peak(5) > 3 * peak(1));
  const may = plan(5, 6).mix; for (const k of B.SPECIES) assert.ok(may[k] > 0.1, k);
  for (const m of [9, 10, 11, 12, 1]) { const mix = plan(m, 12).mix; assert.equal(mix.blackbird, 0); assert.equal(mix.chaffinch, 0); assert.ok(mix.robin > 0 && mix.greatTit > 0); assert.ok(Math.abs(mix.robin + mix.greatTit - 1) < 1e-9); }
  for (let m = 1; m <= 12; m++) { const mix = plan(m, 12).mix, sum = B.SPECIES.reduce((a, k) => a + mix[k], 0); assert.ok(Math.abs(sum - 1) < 1e-9, `m${m}`); }
});

test('rain: nearly silent (<= 5 % of dry, never negative), monotone', () => {
  const { rise } = plan(5, 12), dry = plan(5, rise + 0.2).rate; let prev = Infinity;
  for (const r of [0, 0.02, 0.1, 0.2, 0.4, 1]) { const v = plan(5, rise + 0.2, r).rate; assert.ok(v <= prev + 1e-12 && v >= 0); prev = v; }
  assert.ok(plan(5, rise + 0.2, 0.5).rate <= dry * 0.05 + 1e-9);
});

test('table: month x hour rates print and stay within the peak', () => {
  const rows = [];
  for (let m = 1; m <= 12; m++) { const [rise, set] = sunTimes(doyOf(m)); rows.push([m, ...[rise + 0.1, 9, 12, 15, set - 1, set + 0.6, 2].map((h) => B.songPlan({ month: m, hour: h, rise, set }).rate)]); }
  for (const r of rows) for (const v of r.slice(1)) assert.ok(v >= 0 && v <= S.peak + 1e-9);
});

test('phrases: finite, ordered, in the species band, sensible length', () => {
  for (const sp of B.SPECIES) for (let k = 0; k < 40; k++) {
    const ph = B.songPhrase(sp, seeded(k + 1)); assert.ok(ph.notes.length >= 3 && ph.dur > 0.3 && ph.dur < 6, `${sp} dur ${ph.dur}`);
    let t = -1; for (const n of ph.notes) { assert.ok(n.t > t - 1e-9 && n.d > 0 && n.f0 >= 900 && n.f0 <= 7500 && n.f1 >= 900 && n.f1 <= 7500 && n.g > 0 && n.g <= 1, JSON.stringify(n)); t = n.t; }
  }
  const trill = B.songPhrase('chaffinch', seeded(3)); assert.ok(trill.notes.length >= 12 && trill.notes[0].f0 > trill.notes[trill.notes.length - 2].f0, 'chaffinch trill falls');
  const tit = B.songPhrase('greatTit', seeded(3)); assert.ok(tit.notes[0].f0 > tit.notes[1].f0, 'ti-tu: high then low');
  for (const k of ['call', 'laugh', 'alarm']) { const g = B.gullCall(k, seeded(2)); assert.ok(g.dur > 0.3 && g.dur < 4 && g.notes.length >= 2); }
  assert.ok(B.gullCall('alarm', seeded(2)).notes.length >= 6 && B.gullCall('alarm', seeded(2)).dur > B.gullCall('call', seeded(2)).dur);
});

test('gull rate: day only, none in rain', () => {
  const [rise, set] = sunTimes(doyOf(6));
  assert.ok(B.gullRate({ hour: 12, rise, set }) > 1 && B.gullRate({ hour: 1, rise, set }) === 0 && B.gullRate({ hour: 12, rise, set, rain: 0.5 }) === 0);
});

test('perch: only treetops within range (3D), uniformly among them; none when no tree is near', () => {
  const crowns = [{ x: 10, z: 0, r: 4, y: 8 }, { x: 0, z: 37, r: 4, y: 8 }, { x: 60, z: 0, r: 4, y: 8 }, { x: 30, z: 30, r: 4, y: 8 }], eye = { x: 0, y: 1.7, z: 0 };
  const rnd = seeded(5), seen = new Set(), o = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 400; i++) { const p = B.pickPerch(crowns, eye, S.range, rnd, o); assert.ok(p); assert.ok(Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) <= S.range); seen.add(p.x + ',' + p.z); assert.ok(Math.abs(p.y - (8 + 3.2)) < 1e-9, 'the treetop'); }
  assert.deepEqual([...seen].sort(), ["0,37", "10,0"]);
  assert.ok(!seen.has('60,0') && !seen.has('30,30'), 'out of range excluded');
  assert.equal(B.pickPerch(crowns, { x: 500, y: 1, z: 500 }, S.range, rnd), null);
});

// a simulated minute-by-minute run through the scheduler with the real two-voice cap
function run({ month, hour, rain = 0, seconds = 600, crowns, gulls = null, flush = null, seed = 9, indoors = false }) {
  const cap = new VoiceCap(S.maxVoices), log = [], eye = { x: 0, y: 1.7, z: 0 }; let now = 0, maxBusy = 0;
  const bs = new B.BirdSong((call, pos, level) => {
    assert.ok(Math.hypot(pos.x - eye.x, pos.y - eye.y, pos.z - eye.z) <= (call.species === 'gull' ? S.gullRange : S.range) + 1e-9, 'within range');
    if (!cap.take(now, call.dur + 0.1)) return false;
    maxBusy = Math.max(maxBusy, cap.busy(now)); log.push({ now, call, level }); return true;
  }, seeded(seed));
  const [rise, set] = sunTimes(doyOf(month));
  for (let k = 0; k < seconds / S.every; k++) {
    now = k * S.every;
    bs.update(S.every, { month, hour: hour + now / 3600, rise, set, rain, indoors, eye, crowns, gulls, flushed: flush ? flush(now).n : 0, flushAt: flush ? flush(now).at : null });
  }
  return { log, maxBusy, stats: bs.stats };
}
const wood = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos(i) * 25, z: Math.sin(i) * 25, r: 5, y: 9 }));

test('scheduler: dawn chorus May is busy and capped at two voices; midday winter and rain are (nearly) silent', () => {
  const [rise] = sunTimes(doyOf(5));
  const dawn = run({ month: 5, hour: rise, crowns: wood }), winter = run({ month: 1, hour: 12, crowns: wood }), rain = run({ month: 5, hour: rise, rain: 0.8, crowns: wood }), night = run({ month: 5, hour: 1, crowns: wood });
  assert.ok(dawn.stats.song >= 15 && dawn.maxBusy === 2 && dawn.stats.skipped > 0, JSON.stringify(dawn.stats) + dawn.maxBusy);
  assert.ok(winter.log.every((e) => ['robin', 'greatTit'].includes(e.call.species)) && winter.stats.song < dawn.stats.song / 4, JSON.stringify(winter.stats));
  assert.ok(rain.stats.song <= dawn.stats.song * 0.1 + 1 && night.stats.song === 0, JSON.stringify([rain.stats, night.stats]));
  const species = new Set(dawn.log.map((e) => e.call.species)); assert.ok(species.size >= 3, [...species].join());
  assert.equal(run({ month: 5, hour: rise, crowns: [] }).stats.song, 0, 'no trees in range, no song');
});

test('scheduler: indoors the level is the indoor share; gulls call by day from the flock within range; a flush makes the alarm', () => {
  assert.ok(run({ month: 5, hour: 6, crowns: wood, indoors: true }).log.every((e) => Math.abs(e.level - S.level.song * S.indoors) < 1e-9));
  const gulls = { n: 4, at: (i, o) => { o.x = 20 + i * 30; o.y = 25; o.z = 0; } }; // 20, 50, 80, 110 m: only the first two within 60 m (3D ~ 32 / 56)
  const day = run({ month: 6, hour: 11, crowns: [], gulls, seconds: 1200 });
  assert.ok(day.stats.gull >= 15 && day.log.every((e) => e.call.species === 'gull'), JSON.stringify(day.stats));
  assert.ok(new Set(day.log.map((e) => e.call.kind)).size >= 2, 'call and laugh');
  assert.equal(run({ month: 6, hour: 2, crowns: [], gulls, seconds: 600 }).stats.gull, 0);
  const fl = run({ month: 6, hour: 11, crowns: [], gulls: { n: 0, at() {} }, seconds: 20, flush: (t) => ({ n: t > 10 ? 1 : 0, at: { x: 8, y: 1, z: 0 } }) });
  assert.equal(fl.stats.alarm, 1); assert.equal(fl.log.find((e) => e.call.kind === 'alarm').level, S.level.alarm);
  assert.equal(run({ month: 6, hour: 11, crowns: [], gulls: { n: 0, at() {} }, seconds: 20, flush: () => ({ n: 3, at: { x: 8, y: 1, z: 0 } }) }).stats.alarm, 0, 'a constant count is no new flush');
});

test('voice cap: at most two concurrent whatever the pressure (VoiceCap with BIRD_SONG.maxVoices)', () => {
  const cap = new VoiceCap(S.maxVoices); assert.equal(S.maxVoices, 2);
  assert.ok(cap.take(0, 2) && cap.take(0.5, 2) && !cap.take(1, 2) && cap.busy(1) === 2 && cap.take(2.1, 1) && cap.busy(2.1) === 2);
});
