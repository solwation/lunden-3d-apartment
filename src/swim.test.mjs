// #1949: the air: about a minute still, less swimming, least upstream, back quickly at the surface, a warning in the last seconds.
// #1944: the dive: crouch held goes down to SWIM.dive.eyeOverBed over the bed, released always comes up, a rising bed lifts the diver.
// #1943: the pure swimming rules: the current runs downstream along the centre line, the same input is faster with it than against
// it, an idle swimmer drifts, and the edge decision (climb / last-resort rescue).   node --test src/swim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIM, SITE } from './config.js';
import { currentDir, current, swimVelocity, exitDecision, swimEye, diveMax, diveStep, isDiving, upstreamPart, airRate, airStep, airWarning, kickState, kickDir, kickStart, kickSpeed, kickStep, kickDepth } from './swim.js';

// A river frame like riverbridge.js riverAt builds for the segment a -> b: normal (-dz, dx) / len.
const frame = ([ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); return { nx: -dz / l, nz: dx / l, dx: dx / l, dz: dz / l }; };
const R = SITE.river, path = R.path.concat(R.downstream?.path ?? []);

test('the current follows the centre line downstream on every segment (east -> west, the way the water level falls)', () => {
  assert.ok(R.fall.perM > 0, 'the water line falls with the chainage');
  assert.ok(path[0][0] > path.at(-1)[0], 'the path starts upstream in the east and ends at the west edge');
  for (let i = 1; i < path.length; i++) {
    const f = frame(path[i - 1], path[i]), d = currentDir(f), c = current(f);
    assert.ok(Math.abs(d.x - f.dx) < 1e-12 && Math.abs(d.z - f.dz) < 1e-12, `segment ${i}: along the path`);
    assert.ok(Math.abs(Math.hypot(c.x, c.z) - SWIM.current) < 1e-12);
  }
});

test('downstream is noticeably faster than upstream for the same input; sideways keeps the drift', () => {
  const f = frame(path[8], path[9]), d = currentDir(f);
  const down = swimVelocity(d.x, d.z, 1, f), vDown = Math.hypot(down.x, down.z);
  const up = swimVelocity(-d.x, -d.z, 1, f), vUp = Math.hypot(up.x, up.z);
  assert.ok(Math.abs(vDown - (SWIM.speed + SWIM.current)) < 1e-9 && Math.abs(vUp - (SWIM.speed - SWIM.current)) < 1e-9);
  assert.ok(vDown > vUp * 1.5, `down ${vDown} vs up ${vUp}`);
  assert.ok(up.x * d.x + up.z * d.z < 0, 'a full stroke still makes way against the current');
  const across = swimVelocity(f.nx, f.nz, 1, f);
  assert.ok(Math.abs(across.x * d.x + across.z * d.z - SWIM.current) < 1e-9, 'carried downstream while crossing');
  assert.ok(Math.abs(across.x * f.nx + across.z * f.nz - SWIM.speed) < 1e-9);
});

test('an idle swimmer drifts slowly downstream; the input amount scales only the stroke; no sprint', () => {
  const f = frame(path[3], path[4]), d = currentDir(f);
  const idle = swimVelocity(0, 0, 0, f);
  assert.ok(Math.abs(idle.x - d.x * SWIM.current) < 1e-12 && Math.abs(idle.z - d.z * SWIM.current) < 1e-12);
  assert.ok(SWIM.current > 0.1 && SWIM.current < SWIM.speed, 'slight: a swimmer can beat it');
  const half = swimVelocity(d.x * 3, d.z * 3, 0.5, f); // (any length of the direction)
  assert.ok(Math.abs(Math.hypot(half.sx, half.sz) - SWIM.speed / 2) < 1e-9);
  const over = swimVelocity(d.x, d.z, 7, f);
  assert.ok(Math.abs(Math.hypot(over.sx, over.sz) - SWIM.speed) < 1e-9, 'amount is clamped: nothing swims faster than SWIM.speed');
});

test('the edge: climb where a bank is in reach, rescue only after SWIM.rescueAfter s against an edge with no way up', () => {
  const st = {};
  assert.equal(exitDecision(st, { blocked: false, pushing: true, bank: null, dt: 0.1 }), 'swim');
  assert.equal(exitDecision(st, { blocked: true, pushing: false, bank: { x: 0, z: 0 }, dt: 0.1 }), 'swim', 'drifting against a bank is no wish to get out');
  assert.equal(exitDecision(st, { blocked: true, pushing: true, bank: { x: 0, z: 0 }, dt: 0.1 }), 'climb');
  let n = 0, last = 'swim';
  while (last === 'swim' && n < 1000) { last = exitDecision(st, { blocked: true, pushing: true, bank: null, dt: 0.1 }); n++; }
  assert.equal(last, 'rescue');
  assert.ok(Math.abs(n * 0.1 - SWIM.rescueAfter) < 0.11, `after ${n * 0.1} s`);
  assert.equal(st.stuck, 0);
  for (let i = 0; i < 20; i++) exitDecision(st, { blocked: true, pushing: true, bank: null, dt: 0.1 });
  exitDecision(st, { blocked: false, pushing: true, bank: null, dt: 0.1 }); // free again: the count starts over
  assert.equal(st.stuck, 0);
});

test('the eye floats just above the surface; a depth lowers it (the dive hook)', () => {
  for (let t = 0; t < 3; t += 0.05) { const e = swimEye(t); assert.ok(e > 0.05 && e < 0.25, `eye ${e}`); }
  assert.ok(swimEye(0, 1) < 0);
});

// #1944
const DEEP = 0.6 + SITE.bridges.pool; // the water's depth at the centre line (riverbridge.js riverGround)
const eyeOver = (depth) => SWIM.eye - depth; // the eye over the water line (without the bob)

test('the dive: held crouch goes down at SWIM.dive.rate to SWIM.dive.eyeOverBed over the bed and stays there', () => {
  assert.ok(DEEP >= 1.5, `mid-channel is deep enough to dive in (${DEEP} m)`);
  let d = 0, t = 0; const dt = 1 / 60;
  assert.ok(!isDiving(d));
  d = diveStep(d, true, DEEP, dt); assert.ok(Math.abs(d - SWIM.dive.rate * dt) < 1e-12);
  while (t < 5) { d = diveStep(d, true, DEEP, dt); t += dt; assert.ok(eyeOver(d) + DEEP >= SWIM.dive.eyeOverBed - 1e-9, 'never closer to the bed'); }
  assert.ok(Math.abs(eyeOver(d) + DEEP - SWIM.dive.eyeOverBed) < 1e-9, 'at the bed limit');
  assert.equal(d, diveMax(DEEP));
  assert.ok(isDiving(d) && eyeOver(d) < -1, `the eye is ${-eyeOver(d)} m under the surface`);
  assert.ok(swimEye(0, d) < -1);
});

test('the dive: letting go always reaches the surface, from any depth, in bounded time', () => {
  for (const water of [0.3, 0.6, 1, DEEP, 5]) {
    let d = diveMax(water), t = 0; const dt = 1 / 30;
    while (d > 0 && t < 10) { d = diveStep(d, false, water, dt); t += dt; }
    assert.equal(d, 0); assert.ok(t <= diveMax(water) / SWIM.dive.rate + 2 * dt, `up from ${water} m in ${t} s`);
    assert.ok(!isDiving(d) && swimEye(0, d) > 0);
  }
});

test('the dive: a rising bed lifts the diver at once; the shallows allow no dive', () => {
  let d = diveMax(DEEP);
  d = diveStep(d, true, 0.8, 0); // (dt 0: the limit alone, as player.js applies it after the stroke)
  assert.equal(d, diveMax(0.8)); assert.ok(eyeOver(d) + 0.8 >= SWIM.dive.eyeOverBed - 1e-9);
  assert.equal(diveMax(0.2), 0); assert.equal(diveStep(0.5, true, 0.2, 1 / 60), 0, 'no room: at the surface');
  assert.equal(diveStep(0, false, DEEP, 1), 0);
  assert.ok(!isDiving(SWIM.eye) && isDiving(SWIM.eye + SWIM.dive.under + 0.01), 'diving = the eye SWIM.dive.under m below the water line');
});

// #1949: the diver's air
const airTime = (moving, up, dt = 1 / 60) => { let air = SWIM.air.seconds, t = 0; while (air > 0 && t < 600) { air = airStep(air, true, moving, up, dt); t += dt; } return t; };

test('air: about a minute holding still, noticeably less swimming, least against the current', () => {
  const still = airTime(false, 0), swim = airTime(true, 0), up = airTime(true, 1), half = airTime(true, 0.5);
  assert.ok(Math.abs(still - 60) < 0.1, `still ${still}`);
  assert.ok(Math.abs(still - SWIM.air.seconds) < 0.1 && Math.abs(swim - SWIM.air.seconds / SWIM.air.swim) < 0.1 && Math.abs(up - SWIM.air.seconds / SWIM.air.upstream) < 0.1);
  assert.ok(swim < still * 0.75, `swimming ${swim} s vs still ${still} s`);
  assert.ok(up < swim * 0.75, `upstream ${up} s vs swimming ${swim} s`);
  assert.ok(half < swim && half > up, 'partly upstream lies between');
  assert.equal(airRate(false, 1), 1, 'no stroke: the direction does not matter');
});

test('air: the upstream part comes from the stroke against the current on the real river', () => {
  const f = frame(path[8], path[9]), d = currentDir(f);
  const part = (ix, iz, amount = 1) => { const v = swimVelocity(ix, iz, amount, f); return upstreamPart(v.sx, v.sz, v.cx, v.cz); };
  assert.ok(Math.abs(part(-d.x, -d.z) - 1) < 1e-9, 'straight upstream');
  assert.equal(part(d.x, d.z), 0, 'downstream');
  assert.ok(Math.abs(part(f.nx, f.nz)) < 1e-9, 'across');
  assert.equal(part(0, 0, 0), 0, 'no stroke');
  const diag = part(-d.x + f.nx, -d.z + f.nz);
  assert.ok(Math.abs(diag - Math.SQRT1_2) < 1e-9, `45 degrees upstream ${diag}`);
});

test('air: comes back quickly at the surface, never over full or under empty', () => {
  let air = 0, t = 0;
  while (air < SWIM.air.seconds && t < 60) { air = airStep(air, false, false, 0, 1 / 60); t += 1 / 60; }
  assert.ok(t <= 6, `full again after ${t} s`);
  assert.equal(airStep(SWIM.air.seconds, false, true, 1, 1), SWIM.air.seconds);
  assert.equal(airStep(0.01, true, true, 1, 1), 0);
});

test('air: the warning covers the last SWIM.air.warn seconds at the current rate and reaches 1 at empty', () => {
  const A = SWIM.air;
  assert.equal(A.warn, 10);
  assert.equal(airWarning(A.seconds, 1), 0);
  assert.equal(airWarning(A.warn + 0.01, 1), 0, 'still: none before 10 s are left');
  assert.ok(airWarning(A.warn - 0.5, 1) > 0);
  assert.ok(Math.abs(airWarning(A.warn / 2, 1) - 0.5) < 1e-9);
  assert.equal(airWarning(0, 1), 1);
  const rate = airRate(true, 1); // upstream: the same 10 s start at a fuller meter
  assert.equal(airWarning(A.warn * rate + 0.01, rate), 0);
  assert.ok(airWarning(A.warn * rate - 0.5, rate) > 0 && airWarning(A.warn * rate - 0.5, 1) === 0);
  for (const [moving, up] of [[false, 0], [true, 0], [true, 1]]) { // time actually spent in the warning
    let air = A.seconds, w = 0; const r = airRate(moving, up);
    while (air > 0) { if (airWarning(air, r) > 0) w += 1 / 60; air = airStep(air, true, moving, up, 1 / 60); }
    assert.ok(Math.abs(w - A.warn) < 0.1, `${moving}/${up}: ${w} s of warning`);
  }
});

// ---- #1951: a swim stroke with the jump button ----
const K = SWIM.kick, DT = 1 / 60;
/** `n` frames of a stroke state: the distance the push carried (x, y, z). */
const carry = (k, n, o = { x: 0, y: 0, z: 0 }) => { for (let i = 0; i < n; i++) { const v = kickStep(k, DT); o.x += v.x * DT; o.y += v.y * DT; o.z += v.z * DT; } return o; };

test('stroke: the direction is the look under the surface, the level heading at it', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  let d = kickDir(0, 0, true); assert.ok(near(d.x, 0) && near(d.y, 0) && near(d.z, -1), 'yaw 0 looks towards -z');
  d = kickDir(Math.PI / 2, 0, true); assert.ok(near(d.x, -1) && near(d.z, 0));
  d = kickDir(0, Math.PI / 2, true); assert.ok(near(d.y, 1) && near(Math.hypot(d.x, d.z), 0), 'straight up');
  d = kickDir(0.7, -0.6, true); assert.ok(near(Math.hypot(d.x, d.y, d.z), 1) && d.y < 0, 'a unit vector, down when looking down');
  for (const pitch of [-1.2, -0.4, 0, 0.9]) { // at the surface: no vertical part, full strength along the heading
    d = kickDir(0.7, pitch, false);
    assert.ok(d.y === 0 && near(Math.hypot(d.x, d.z), 1) && near(d.x, -Math.sin(0.7)) && near(d.z, -Math.cos(0.7)), `pitch ${pitch}`);
  }
});

test('stroke: one press is a short push that fades out and carries speed x time / 2', () => {
  const k = kickState();
  assert.deepEqual(kickStep(k, DT), { x: 0, y: 0, z: 0 }, 'nothing without a press');
  assert.ok(kickStart(k, 0, 0, false));
  assert.equal(kickSpeed(0), K.speed); assert.equal(kickSpeed(K.time), 0); assert.equal(kickSpeed(K.time / 2), K.speed / 2);
  let last = Infinity; const o = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < Math.round(K.time / DT) + 5; i++) { const v = kickStep(k, DT), s = Math.hypot(v.x, v.y, v.z); assert.ok(s <= last + 1e-12, 'never faster again'); last = s; o.z += v.z * DT; }
  assert.equal(last, 0); assert.equal(k.on, false);
  assert.ok(Math.abs(-o.z - K.speed * K.time / 2) < 1e-6, `carried ${-o.z} m`);
  const coarse = kickState(); kickStart(coarse, 0, 0, false); // the same distance at 10 frames a second
  let z = 0; for (let i = 0; i < 12; i++) z += kickStep(coarse, 0.1).z * 0.1;
  assert.ok(Math.abs(-z - K.speed * K.time / 2) < 1e-6, `carried ${-z} m at 10 Hz`);
});

test('stroke: a pause between strokes, so hammering the button adds a bounded speed', () => {
  const k = kickState(); let n = 0; const o = { x: 0, y: 0, z: 0 }, T = 12;
  for (let i = 0; i < T / DT; i++) { if (kickStart(k, 0, 0, false)) n++; carry(k, 1, o); } // a press every frame
  assert.ok(Math.abs(n - T / K.pause) <= 1, `${n} strokes in ${T} s`);
  const extra = -o.z / T;
  assert.ok(extra > SWIM.speed * 0.5 && extra < K.speed * 0.75, `strokes in a row add ${extra} m/s`);
  assert.ok(K.pause > 0.3 && K.pause <= K.time, 'a real pause, and no gap without push between strokes in a row');
  const one = kickState(); kickStart(one, 0, 0, false); carry(one, Math.round(K.pause / DT) - 2);
  assert.equal(kickStart(one, 0, 0, false), false, 'not yet'); carry(one, 3);
  assert.equal(kickStart(one, 0, 0, false), true, 'after the pause');
});

test('stroke: under the surface it takes the eye up, down or neither, by the look', () => {
  const water = 1.8, max = diveMax(water), swim = (pitch, depth, want, n = Math.round(K.time / DT)) => {
    const k = kickState(); kickStart(k, 0, pitch, isDiving(depth)); let top = depth, deep = depth;
    for (let i = 0; i < n; i++) { depth = kickDepth(depth, want, kickStep(k, DT).y, water, DT); top = Math.min(top, depth); deep = Math.max(deep, depth); }
    return { depth, top, deep };
  };
  // crouch held on the bed (the deepest point): up when looking up, then down again as the push fades; level and down change nothing
  const up = swim(1.0, max, true, 240);
  assert.ok(up.top < max - 0.35, `an upward stroke lifts ${max - up.top} m with crouch held`);
  assert.ok(Math.abs(up.depth - max) < 1e-9, 'and sinks back to the bed');
  assert.equal(swim(0, max, true).depth, max); assert.equal(swim(-1.2, max, true).deep, max, 'never through the bed');
  // crouch released mid-water: a level stroke leaves the ordinary rise alone, an upward one is faster, a downward one goes down first
  const mid = 0.9, n = 12, plain = swim(0, mid, false, n).depth;
  assert.ok(Math.abs(plain - diveStep(mid, false, water, n * DT)) < 1e-9, 'level: exactly the ordinary float up');
  assert.ok(swim(1.2, mid, false, n).depth < plain - 0.05, 'up: sooner at the surface');
  const down = swim(-1.2, mid, false, n);
  assert.ok(down.depth > mid + 0.1 && down.deep <= max, `down: ${down.depth} m deep`);
  assert.equal(swim(-1.2, mid, false, 600).depth, 0, 'released always ends at the surface');
  assert.equal(swim(1.4, 0.4, false, 600).top, 0, 'an upward stroke never lifts over the floating height');
});

test('stroke: at the surface the vertical part is not used', () => {
  const water = 1.8;
  for (const pitch of [-1.4, 1.4]) {
    const k = kickState(); kickStart(k, 0, pitch, false);
    assert.equal(k.y, 0);
    let depth = 0; for (let i = 0; i < 60; i++) depth = kickDepth(depth, false, kickStep(k, DT).y, water, DT);
    assert.equal(depth, 0, `pitch ${pitch}`);
  }
  // even a vertical speed handed in is ignored above the diving line, and the plain rule is `diveStep`'s
  assert.equal(kickDepth(0, false, -3, water, DT), 0);
  assert.equal(kickDepth(SWIM.eye, true, 3, water, DT), diveStep(SWIM.eye, true, water, DT));
  for (const [d, want] of [[0, true], [0.5, true], [0.5, false], [1.2, false]]) assert.equal(kickDepth(d, want, 0, water, DT), diveStep(d, want, water, DT));
  assert.equal(kickDepth(0.5, true, 0, 0.2, DT), diveMax(0.2), 'the shallows: no depth to go to');
});

test('stroke: a push against the current is an upstream stroke for the air', () => {
  const f = { nx: 0, nz: 1 }, c = current(f), k = kickState(); // the current runs towards +x: yaw +pi/2 looks towards -x, upstream
  kickStart(k, Math.PI / 2, 0, true); const v = kickStep(k, DT);
  assert.ok(Math.abs(upstreamPart(v.x, v.z, c.x, c.z) - 1) < 1e-9);
  assert.equal(airRate(true, upstreamPart(v.x, v.z, c.x, c.z)), SWIM.air.upstream);
});
