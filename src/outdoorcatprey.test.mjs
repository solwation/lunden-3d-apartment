import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTDOOR_CATS as C } from './config.js';
import { OutdoorCatBrain } from './outdoorcatbrain.js';
import { pickPrey, pickPerched, wantsChatter, leapTo, leapPose, leapOutcome, chatterAt, preyKind } from './outdoorcatprey.js';

// #2182: cats and birds. Function-level checks of the hunting helpers and of the brain's bird stalk / leap / chatter.
const H = C.brain.hunt, ok = () => true;

test('pickPrey: the nearest within range, birds preferred by their bias, unreachable ones skipped', () => {
  const cat = { x: 0, z: 0 };
  assert.equal(pickPrey(cat, [], ok), null);
  assert.deepEqual(pickPrey(cat, [{ x: 5, z: 0, kind: 'bird' }], ok), { x: 5, z: 0, kind: 'bird' });
  assert.equal(preyKind({ x: 1, z: 1 }), 'squirrel');
  assert.equal(pickPrey(cat, [{ x: 4, z: 0 }, { x: 4.5, z: 0, kind: 'bird' }], ok).kind, 'bird', 'a bird a little farther than a squirrel wins (bias)');
  assert.equal(pickPrey(cat, [{ x: 2, z: 0 }, { x: 8, z: 0, kind: 'bird' }], ok).kind, 'squirrel', 'a clearly nearer squirrel wins');
  assert.equal(pickPrey(cat, [{ x: C.brain.preyRange + 1, z: 0, kind: 'bird' }], ok), null, 'out of range');
  assert.equal(pickPrey(cat, [{ x: 3, z: 0, kind: 'bird' }, { x: 6, z: 0, kind: 'bird' }], (x) => x > 4).x, 6, 'blocked way: the next one');
});

test('pickPerched: birds above the cat within range; ground-level or far ones are ignored; pitch is bounded', () => {
  const cat = { x: 0, z: 0, gy: 0 };
  assert.equal(pickPerched(cat, [{ x: 4, y: 0.1, z: 0 }]), null);
  assert.equal(pickPerched(cat, [{ x: H.chatterRange + 1, y: 5, z: 0 }]), null);
  const p = pickPerched(cat, [{ x: 8, y: 6, z: 0 }, { x: 4, y: 4, z: 0 }]);
  assert.equal(p.bird.x, 4); assert.ok(p.pitch > 0.5 && p.pitch <= 0.9);
  assert.ok(pickPerched(cat, [{ x: 1.2, y: 30, z: 0 }]).pitch <= 0.9);
});

test('leap: never past the prey, always a miss, arc is smooth; chatter bursts alternate with pauses', () => {
  const l = leapTo(0, 0, 2.6, 0); assert.ok(Math.abs(l.len - H.leapLen) < 1e-9 && l.x < 2.6);
  assert.ok(Math.abs(leapTo(0, 0, 0.5, 0).len - 0.425) < 1e-9);
  assert.equal(leapPose(0).fwd, 0); assert.equal(leapPose(1).fwd, 1); assert.ok(leapPose(0.4).hop > 0.05 && leapPose(1).hop < 1e-9);
  assert.deepEqual(leapOutcome(), { caught: false, missed: true });
  assert.ok(chatterAt(H.burst / 2).k > 0.99 && chatterAt(H.burst + 0.1).k === 0 && chatterAt(H.burstEvery * 2 + 0.01).n === 2);
  const w = (traits) => { let n = 0; for (let m = 0; m < 400; m++) if (wantsChatter(3, m, traits)) n++; return n; };
  assert.ok(w({ curious: 1 }) > w({ curious: 0 }) && w({ curious: 0 }) > 0, 'curious cats chatter more; same every call');
  assert.equal(wantsChatter(3, 17, { curious: 0.5 }), wantsChatter(3, 17, { curious: 0.5 }));
});

// A cat on an open lawn with a bird list; time is driven by hand.
function lawn(birds, perched = []) {
  const clock = { t: C.epoch + 86400 * 3 };
  const spec = { name: 't', phase: 0, rest: [70, 40, 90, 55, 35, 80], traits: { social: 0, play: 0.5, lazy: 0, shy: 0, curious: 1 }, route: [[-6, -4], [0, -4.5], [6, -4], [7, 4], [0, 5], [-7, 4]] };
  const env = { now: () => clock.t, hour: () => 12, month: () => 7, ground: () => 0, clear: () => true, prey: () => birds, perched: () => perched, trees: [] };
  return { clock, env, brain: new OutdoorCatBrain(spec, 0, env) };
}
const FAR = { x: 99, z: 99, d: 99, ok: true, still: 0 };
// the first stop whose outing is a stalk, and a time well inside its rest
function inStalk(b, clock) {
  for (let m = 0; m < 4000; m++) if (b.behaviourAt(m) === 'stalk' && b.outingAt(m).kind === 'stalk') { clock.t = b.stop(m).start + 8; return m; }
  throw new Error('no stalk stop');
}

test('brain: a stalking cat creeps up to a ground bird, wiggles, leaps and misses; the bird list is never touched', () => {
  const birds = [], bird = { kind: 'bird', x: 0, z: 0 }, w = lawn(birds);
  const m = inStalk(w.brain, w.clock), P = w.brain.stop(m).P;
  w.brain.update(0.05, FAR, true); // (settled on its loop first, then the bird turns up)
  Object.assign(bird, { x: P.x + 5, z: P.z }); birds.push(bird);
  const seen = new Set(); let minD = 99, leapY = 0;
  for (let i = 0; i < 800; i++) {
    w.clock.t += 0.05; w.brain.update(0.05, FAR, true); seen.add(w.brain.st + ':' + w.brain.activity);
    minD = Math.min(minD, Math.hypot(w.brain.x - bird.x, w.brain.z - bird.z)); leapY = Math.max(leapY, w.brain.hop);
    if (w.brain.st === 'leap') assert.ok(Math.hypot(w.brain.x - bird.x, w.brain.z - bird.z) > 0.5, 'lands short of the bird (a miss) ');
  }
  assert.ok([...seen].some((q) => q === 'prey:creep'), 'creeps');
  assert.ok(seen.has('prey:crouch'), 'waits crouched');
  assert.ok(seen.has('leap:pounce') && seen.has('leap:look'), 'leaps then looks after it');
  assert.ok(minD > 0.5 && leapY > 0.05, `min distance ${minD}`);
  assert.deepEqual(bird, { kind: 'bird', x: P.x + 5, z: P.z }, 'the brain only reads the bird');
});

test('brain: a bird perched above makes a resting cat chatter (bursts, one sound per burst), then cooldown', () => {
  const w = lawn([], []);
  let m = 0; for (; m < 4000; m++) if (['rest', 'explore', 'stalk'].includes(w.brain.behaviourAt(m)) && wantsChatter(0, w.brain.outingAt(m).m, w.brain.traits)) break;
  w.clock.t = w.brain.stop(m).start + 6;
  w.brain.update(0.05, FAR, true);
  const P = w.brain.stop(m).P; w.env.perched = () => [{ x: P.x + 4, y: 5, z: P.z }];
  let chirps = 0, maxK = 0, sawChatter = false;
  for (let i = 0; i < 600; i++) { w.clock.t += 0.05; w.brain.update(0.05, FAR, true); if (w.brain.st === 'chatter') sawChatter = true; if (w.brain.chirp) chirps++; maxK = Math.max(maxK, w.brain.chatterK); }
  assert.ok(sawChatter && chirps >= 3 && chirps <= 8 && maxK > 0.9, `chirps ${chirps}`);
  assert.ok(w.brain.chatCool > 0 || w.brain.st !== 'chatter', 'cooldown set after it');
  assert.equal(w.brain.st === 'chatter', false);
});

test('brain: nothing to hunt, nothing changes (determinism of the schedule)', () => {
  const a = lawn([]), b = lawn([], []); a.brain.update(0.05, FAR, true);
  for (let i = 0; i < 200; i++) { a.clock.t += 0.5; b.clock.t += 0.5; a.brain.update(0.5, FAR, true); b.brain.update(0.5, FAR, true); assert.equal(a.brain.x, b.brain.x); assert.equal(a.brain.z, b.brain.z); }
});
