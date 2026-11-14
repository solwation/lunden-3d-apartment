// #1947: the shark that bites swimmers, the pure rules: a small seeded risk only while swimming, a warning while the fin comes closer, a
// bite only in the water, escape on land, the debug rates.   node --test src/sharkattack.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHARK } from './config.js';
import { rng } from './riverfishswim.js';
import { newAttack, attackStep } from './sharkattack.js';

const C = SHARK.attack, dt = 1 / 60;
// A straight river along x, 8 m wide round z = 0; the shark surfaces `speed x warn` m up / down it.
const river = (over = {}) => ({ dt, swimming: true, x: 0, z: 0, random: rng(7), blocked: false, test: false,
  water: (x, z) => Math.abs(z) <= 4, centre: (x) => ({ x, z: 0 }), spawn(sign) { return { x: this.x + sign * C.speed * C.warn, z: 0 }; }, ...over });
/** Run until an event (or `max` s); `each(w, st, t)` may move the prey. */
const until = (st, w, max, each = null) => { for (let t = 0; t < max; t += dt) { each?.(w, st, t); const ev = attackStep(st, w); if (ev) return { ev, t }; } return { ev: null, t: max }; };
const always = () => 0; // random() that always rolls an attack

test('the tunables are sane: a low risk, a real warning, a shark faster than a swimmer', () => {
  assert.ok(C.perMinute > 0 && C.perMinute <= 0.5, 'at most one attack per two minutes of swimming on average');
  assert.ok(C.warn >= 5 && C.speed * C.warn >= 12 && C.bite > 0.5 && C.bite < 3);
  assert.ok(C.speed > 1.25, 'faster than a swimmer going downstream (SWIM.speed + SWIM.current)');
  assert.ok(C.test.perMinute >= 60 && C.test.calm <= 5, 'the debug rates provoke it within seconds');
});

test('no shark on land, in the calm start of a swim, while blocked or during the cool-down', () => {
  const st = newAttack();
  assert.equal(until(st, river({ swimming: false, random: always }), 600).ev, null);
  assert.equal(st.phase, 'idle'); assert.equal(st.swum, 0);
  assert.equal(until(newAttack(), river({ random: always }), C.calm - 0.1).ev, null, 'calm seconds first');
  assert.equal(until(newAttack(), river({ random: always, blocked: true }), 600).ev, null, 'blocked (the shared shark is in the river)');
  const cool = Object.assign(newAttack(), { cool: 50 });
  const r = until(cool, river({ random: always }), 600);
  assert.equal(r.ev, 'warn'); assert.ok(r.t >= 49.9, `after the cool-down, got ${r.t}`);
  assert.equal(until(newAttack(), river({ random: always, spawn: () => null }), 120).ev, null, 'nowhere to surface: no attack');
});

test('the seeded risk: attacks are rare with the real rate (about perMinute per swum minute), quick with the debug rate', () => {
  let attacks = 0; const minutes = 2000, r = rng(1947);
  for (let i = 0; i < minutes; i++) { // one-minute swims after the calm start; a coarse step is the same hazard
    const st = Object.assign(newAttack(), { swum: C.calm });
    for (let t = 0; t < 60; t += 0.5) if (attackStep(st, river({ dt: 0.5, random: r })) === 'warn') { attacks++; break; }
  }
  const expected = minutes * (1 - Math.exp(-C.perMinute));
  assert.ok(Math.abs(attacks - expected) < expected * 0.25, `${attacks} attacks in ${minutes} swum minutes, expected about ${expected.toFixed(0)}`);
  const quick = until(newAttack(), river({ test: true, random: rng(3) }), 30);
  assert.equal(quick.ev, 'warn'); assert.ok(quick.t < C.test.calm + 3, `debug: after ${quick.t} s`);
});

test('a swimmer who stays is warned, sees the fin come closer and is bitten after about the warning time', () => {
  const st = newAttack(), w = river({ random: always });
  assert.equal(until(st, w, C.calm + 1).ev, 'warn');
  const d0 = Math.hypot(st.x - w.x, st.z - w.z);
  assert.ok(Math.abs(d0 - C.speed * C.warn) < 1e-9 && st.show === 0, 'it surfaces speed x warn m away, the fin still under');
  let last = d0, closer = true, shown = 0;
  const r = until(st, w, 60, () => { const d = Math.hypot(st.x - w.x, st.z - w.z); closer &&= d <= last + 1e-9; last = d; shown = Math.max(shown, st.show); });
  assert.equal(r.ev, 'bite'); assert.ok(closer, 'never further away'); assert.equal(shown, 1);
  assert.ok(r.t > C.warn * 0.8 && r.t < C.warn * 1.05, `bitten after ${r.t.toFixed(2)} s (warn ${C.warn})`);
  assert.ok(Math.hypot(st.x - w.x, st.z - w.z) <= C.bite + 1e-9);
  assert.ok(Math.abs(Math.sin(st.yaw) * (w.x - st.x) + Math.cos(st.yaw) * (w.z - st.z)) > 0 , 'heading at the swimmer');
  // afterwards it sinks and the next attack waits for the cool-down
  assert.equal(st.phase, 'leave'); assert.equal(st.cool, C.again);
  until(st, river({ swimming: false }), C.sink + 1);
  assert.equal(st.phase, 'idle'); assert.equal(st.show, 0);
});

test('fleeing downstream only delays it; the shark never leaves the water round a bend', () => {
  const st = newAttack(), bend = (x, z) => Math.abs(z - (x > 10 ? (x - 10) * 0.8 : 0)) <= 4; // the channel turns at x = 10
  const w = river({ random: always, x: 0, z: 0, water: bend, centre: (x) => ({ x, z: x > 10 ? (x - 10) * 0.8 : 0 }), spawn() { return { x: 26, z: 12.8 }; } });
  assert.equal(until(st, w, C.calm + 1).ev, 'warn');
  let wet = true;
  const r = until(st, w, 120, () => { w.x -= 1.25 * dt; wet &&= bend(st.x, st.z); });
  assert.equal(r.ev, 'bite'); assert.ok(wet, 'always in the channel');
  assert.ok(r.t > C.warn, `fleeing bought time: ${r.t.toFixed(1)} s`);
});

test('on land you are safe: no bite however close, the shark waits where you left, gives up and sinks', () => {
  const st = newAttack(), w = river({ random: always });
  until(st, w, C.calm + 1);
  until(st, w, C.warn * 0.5); // half the warning swum away
  w.swimming = false; w.x = 0; w.z = 6; // out on the bank beside the place
  const r = until(st, w, 120);
  assert.equal(r.ev, 'gone'); assert.ok(Math.abs(r.t - C.linger) < 0.1, `gave up after ${r.t.toFixed(2)} s`);
  assert.ok(Math.abs(st.z) <= 4, 'it stayed in the water');
  assert.ok(Math.hypot(st.x, st.z) >= C.bite - 1e-6 && Math.hypot(st.x, st.z) < C.bite + 0.5, 'waiting where the swimmer got out');
  until(st, w, C.sink + 1);
  assert.equal(st.phase, 'idle');
  assert.equal(until(st, w, 300).ev, null, 'nothing more on land');
});

test('back into the water while it waits: bitten', () => {
  const st = newAttack(), w = river({ random: always });
  until(st, w, C.calm + 1); until(st, w, C.warn * 0.5);
  w.swimming = false;
  assert.equal(until(st, w, C.linger * 0.5).ev, null);
  w.swimming = true; // (same place)
  const r = until(st, w, 30);
  assert.equal(r.ev, 'bite'); assert.ok(r.t < 2);
});
