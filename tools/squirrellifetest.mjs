// #2128: node --test tools/squirrellifetest.mjs  (the squirrels' seasons, scan, eating and tail motion; no browser)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SQUIRRELS as C, SQUIRREL_LIFE as L, SEASON } from '../src/config.js';
import { SquirrelBrain, NutField, linkTrees } from '../src/squirrelbrain.js';
import { encodeAnimal, STATES } from '../src/squirrelsync.js';
import { squirrelSeason, seasonLife, tailWave, scanHead, eatPaws, TAIL_JOINTS } from '../src/squirrellife.js';

const rng = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const world = (seed, month) => {
  const rnd = rng(seed), ts = linkTrees([[0, 0], [8, 3], [15, -2], [6, 14], [-9, 9], [22, 8]].map(([x, z]) => ({ x, z, y: 0, cy: 6, r: 3.5 })));
  const ground = () => 0, nuts = new NutField(ts, ground, () => true, rnd), player = { x: 500, z: 500, lure: false, hx: 500, hz: 500 };
  return { rnd, ts, nuts, env: { trees: ts, ground, walkable: () => true, nuts, player, scares: [], rnd, onTake: () => false, month: month == null ? undefined : () => month } };
};
/** One squirrel kept on the ground with a nut laid in front of it now and then, for `seconds`: what it did (state counts, entries). */
const life = (seed, month, seconds = 1800) => {
  const w = world(seed, month), b = new SquirrelBrain(C.animals[0], w.env, 0), seen = {}, log = [];
  w.nuts.setActive(true); for (const o of w.nuts.slots) o.wait = 1e9;
  let last = '', yOff = 0;
  for (let t = 0; t < seconds; t += 0.1) {
    if (Math.round(t * 10) % 300 === 0) { const s = w.nuts.slots[0]; Object.assign(s, { alive: true, held: false, x: b.x + 1.2, z: b.z + 1, y: 0, age: 0, life: 1e9 }); b.caches.length = 0; } // (room for another cache: SQUIRRELS.cache.max)
    if (!['forage', 'search', 'fetch', 'eat', 'stash', 'bury', 'dig', 'seek', 'scan'].includes(b.state)) { Object.assign(b, { x: b.tr.x, z: b.tr.z, y: 0, calmT: 0, route: [] }); b.hasNut = false; b.startForage(); }
    b.update(0.1);
    if (b.state === 'scan') yOff = Math.max(yOff, Math.abs(b.y)); // (on the ground: a cat's prey())
    if (b.state !== last) { seen[b.state] = (seen[b.state] ?? 0) + 1; last = b.state; log.push(b.state); }
  }
  return { seen, log, yOff, b };
};

test('#2128: seasons: autumn buries, winter digs up, summer keeps the old cache chance', () => {
  assert.equal(squirrelSeason(10), 'autumn'); assert.equal(squirrelSeason(3), 'winter'); assert.equal(squirrelSeason(7), 'summer'); assert.equal(squirrelSeason(4), 'spring');
  assert.equal(seasonLife(7).bury, C.cache.chance, 'summer = the old all-year chance');
  assert.equal(seasonLife(0).bury, C.cache.chance, 'no month: the old numbers');
  assert.ok(seasonLife(10).bury > seasonLife(7).bury && seasonLife(7).bury > seasonLife(3).bury, 'autumn buries most, winter least');
  assert.ok(seasonLife(3).dig > seasonLife(4).dig && seasonLife(10).dig === 0 && seasonLife(7).dig === 0, 'digging up is a winter / early-spring thing');
  for (const m of SEASON.snowMonths) assert.equal(squirrelSeason(m), 'winter', 'the snow months count as winter (hidden there anyway)');
});

test('#2128: behaviours per season in the brain: autumn stashes, winter digs and eats, everybody scans', () => {
  const autumn = life(5, 10), winter = life(5, 3), summer = life(5, 7);
  const stashRate = (r) => (r.seen.stash ?? 0) / Math.max(1, (r.seen.stash ?? 0) + (r.log.filter((s, i) => s === 'eat' && r.log[i - 1] === 'fetch').length));
  assert.ok(stashRate(autumn) > 0.6, `autumn: most found nuts buried (${stashRate(autumn).toFixed(2)})`);
  assert.ok(stashRate(winter) < 0.25, `winter: found nuts eaten (${stashRate(winter).toFixed(2)})`);
  assert.ok(stashRate(autumn) > stashRate(summer) && stashRate(summer) > stashRate(winter), 'summer in between');
  const digs = (r) => r.log.filter((s, i) => s === 'dig' && r.log[i - 1] !== 'seek').length; // (a cache it smells, not one of its own)
  assert.ok(digs(winter) >= 3 && digs(autumn) === 0, `winter digs old caches up (${digs(winter)}), autumn does not (${digs(autumn)})`);
  assert.ok(winter.log.some((s, i) => s === 'eat' && winter.log[i - 1] === 'dig'), 'and eats what it dug up');
  for (const r of [autumn, winter, summer]) assert.ok((r.seen.scan ?? 0) >= 5, `stops to scan (${r.seen.scan})`);
  assert.equal(winter.yOff, 0, 'scans on the ground (a cat can stalk it)');
  // deterministic: the same seed and month do the same things
  assert.deepEqual(life(5, 10, 600).log, life(5, 10, 600).log);
});

test('#2128: scan sits right up and goes back to foraging; on the wire it is the old search', () => {
  const w = world(9, 7), b = new SquirrelBrain(C.animals[0], w.env, 0);
  Object.assign(b, { x: 0, z: 0, y: 0, calmT: 0 }); b.startForage(); const left = b.left; b.startScan();
  for (let i = 0; i < 6; i++) b.update(0.1);
  assert.equal(b.state, 'scan'); assert.ok(b.rise > 0.9 && b.run === 0, 'sat up, still');
  assert.equal(STATES.length, 12, 'no new wire state'); assert.equal(STATES[encodeAnimal(b)[7]], 'search');
  assert.equal(encodeAnimal(b).length, 9, 'no new wire field');
  for (let i = 0; i < 50 && b.state === 'scan'; i++) b.update(0.1);
  assert.equal(b.state, 'forage'); assert.ok(b.left <= left, 'the same foraging trip goes on');
});

test('#2128: an eaten nut is held in the paws (hasNut) and gone from the ground', () => {
  const w = world(3, 7); w.nuts.setActive(true); for (const o of w.nuts.slots) o.wait = 1e9;
  const b = new SquirrelBrain(C.animals[0], w.env, 0); let held = false;
  for (let n = 0; n < 20 && !held; n++) {
    const s = w.nuts.slots[0]; Object.assign(s, { alive: true, held: false, x: b.tr.x + 1.2, z: b.tr.z + 1, y: 0, age: 0, life: 1e9 });
    Object.assign(b, { x: b.tr.x, z: b.tr.z, y: 0, calmT: 0, hasNut: false }); b.startForage(); b.sense = 0;
    for (let i = 0; i < 100 && !held; i++) { b.update(0.1); if (b.state === 'eat') { held = b.hasNut && !s.alive && b.rise === 1; } }
  }
  assert.ok(held, 'eats sitting up with the nut in its paws');
});

test('#2128: the tail moves in a bounded S, swings against the hops, opens in a leap and is deterministic', () => {
  const out = [], M = L.tail.max; let n = 0;
  for (let t = 0; t < 20; t += 0.037) for (const run of [0, 0.5, 1]) for (const leap of [null, 0, 0.5, 1]) for (const wind of [-1, 0, 1]) {
    tailWave(out, { t, phase: 1.3, run, hop: t * 28, leap, rise: (t % 3) / 3, wind });
    assert.equal(out.length, TAIL_JOINTS);
    for (const o of out) { assert.ok(Math.abs(o.x) <= M + 1e-12 && Math.abs(o.y) <= M + 1e-12, 'bounded'); assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y)); n++; }
  }
  assert.ok(n > 10000);
  // an S: at rest the joints bend opposite ways somewhere along the tail most of the time
  let s = 0, k = 0; for (let t = 0; t < 10; t += 0.1, k++) { tailWave(out, { t }); for (let j = 1; j < TAIL_JOINTS; j++) if (Math.sign(out[j].x) !== Math.sign(out[j - 1].x)) { s++; break; } }
  assert.ok(s / k > 0.6, `S-shaped (${(s / k).toFixed(2)})`);
  // the hop: the root swings against the body's bounce (negative correlation with sin(hop))
  let c = 0; for (let h = 0; h < 2 * Math.PI; h += 0.1) { tailWave(out, { t: 0, run: 1, hop: h }); const r = tailWave([], { t: 0, run: 0, hop: h }); c += (out[0].x - r[0].x) * Math.sin(h); }
  assert.ok(c < -0.5, `counter-swing ${c.toFixed(2)}`);
  // a leap: the plume opens out behind (mean pitch below rest) in mid-flight
  const mean = (a) => a.reduce((v, o) => v + o.x, 0) / a.length;
  assert.ok(mean(tailWave([], { t: 0, leap: 0.5 })) < mean(tailWave([], { t: 0 })) - 0.1, 'opens in a leap');
  assert.ok(mean(tailWave([], { t: 0, rise: 1 })) > mean(tailWave([], { t: 0 })), 'curls tighter sitting up');
  assert.deepEqual(tailWave([], { t: 3.3, phase: 2, run: 0.7, hop: 5, leap: 0.2, rise: 0.4, wind: 0.6 }), tailWave([], { t: 3.3, phase: 2, run: 0.7, hop: 5, leap: 0.2, rise: 0.4, wind: 0.6 }));
});

test('#2128: the scanning head holds still and snaps (jerky), within bounds; eating paws are bounded', () => {
  let moving = 0, steps = 0, jumps = 0; const dt = 1 / 120;
  for (let seed = 0; seed < 20; seed++) {
    let prev = scanHead(0, seed);
    assert.deepEqual(prev, { yaw: 0, pitch: 0 }, 'starts looking ahead');
    for (let t = dt; t < 4; t += dt) {
      const h = scanHead(t, seed); assert.ok(Math.abs(h.yaw) <= L.scan.yaw && Math.abs(h.pitch) <= L.scan.pitch);
      const d = Math.hypot(h.yaw - prev.yaw, h.pitch - prev.pitch); if (d > 1e-9) moving++; if (d / dt > 4) jumps++; steps++; prev = h;
    }
    assert.deepEqual(scanHead(1.234, seed), scanHead(1.234, seed), 'deterministic');
  }
  assert.ok(moving / steps < 0.3, `mostly still holds (${(moving / steps).toFixed(2)} of the time moving)`);
  assert.ok(jumps > 50, 'the moves are quick snaps');
  for (let t = 0; t < 5; t += 0.01) { const e = eatPaws(t, 3); for (const v of Object.values(e)) assert.ok(Number.isFinite(v) && Math.abs(v) < 2.5); }
});
