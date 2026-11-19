// #2139: the remote players' playback helpers (src/ghostinterp.js) on deterministic snapshot series: a steady link, jitter with
// drops, a late frame, a stop, bursts after a stall, a landing, a respawn teleport and fast but legal motion.
//   node --test tools/ghostinterptest.mjs        (node tools/ghostinterptest.mjs --print: the before/after table of the jitter runs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { newPlayback, receive, playStep, sampleSnaps, teleported, holdGap, targetDelay } from '../src/ghostinterp.js';
import { GHOSTS as G, GHOST_PLAYBACK as PLAY } from '../src/config.js';

const NOMINAL = 1000 / G.hz, FRAME = 1000 / 60;
const v3 = (x, y, z) => ({ x, y, z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** A small deterministic PRNG (mulberry32). */
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** The sender: a state at every frame where 200 ms have passed since the last one (ghosts.js `lastSent`), only while it moved
 * more than GHOSTS.move; `path(ms)` = the feet. Returns [{ send, p }]. */
function sendTimes(path, from, to, exact = false) { // exact: every 200 ms to the millisecond instead of on 60 fps frames
  const out = []; let last = -Infinity, lastP = null;
  for (let t = from; t <= to; t += exact ? NOMINAL : FRAME) {
    const p = path(t);
    if (t - last >= NOMINAL && (!lastP || dist(p, lastP) > G.move)) { out.push({ send: t, p }); last = t; lastP = p; }
  }
  return out;
}

/** The network: `latency` ms plus jitter in [0, jitter) ms, a fraction `drop` lost, arrivals in order (TCP / WebSocket). */
function network(sent, { latency = 60, jitter = 0, drop = 0, seed = 7, late = {} } = {}) {
  const r = rng(seed); let floor = -Infinity; const out = [];
  for (const [i, s] of sent.entries()) {
    const lost = r() < drop, j = r() * jitter;
    if (lost && i > 2) continue;
    floor = Math.max(floor, s.send + latency + j + (late[i] ?? 0)); // a later message cannot overtake an earlier one
    out.push({ t: floor, p: s.p, send: s.send });
  }
  return out;
}

/** The receiver as Ghost.push / Ghost.draw use the helpers; frames at 60 fps. Returns the drawn frames. */
function play(arrivals, from, to) {
  const pb = newPlayback(NOMINAL), snaps = [], out = { p: v3(0, 0, 0), v: v3(0, 0, 0) }, frames = [];
  let n = 0;
  for (let t = from; t <= to; t += FRAME) {
    while (n < arrivals.length && arrivals[n].t <= t) {
      const m = arrivals[n++], ts = receive(pb, snaps, m.p, m.t, G.jump, PLAY, (last, at) => ({ t: at, p: last.p }));
      snaps.push({ t: ts, p: m.p }); if (snaps.length > 8) snaps.splice(0, snaps.length - 8);
    }
    if (!snaps.length) continue;
    const r = playStep(pb, snaps, t, G.delay, PLAY, out);
    frames.push({ t, p: { ...r.p }, v: { ...r.v }, mode: r.mode, delay: r.delay, at: r.at, snaps: snaps.length });
  }
  return frames;
}

/** The pre-#2139 receiver (ghosts.js at c0be4dfd): a fixed delay, straight lines, b missing → frozen on a, a hold after 1.5 intervals. */
function playBefore(arrivals, from, to) {
  const snaps = [], frames = []; let n = 0;
  for (let t = from; t <= to; t += FRAME) {
    while (n < arrivals.length && arrivals[n].t <= t) {
      const m = arrivals[n++], prev = snaps.at(-1);
      if (prev && dist(prev.p, m.p) > G.jump) snaps.length = 0;
      const last = snaps.at(-1);
      if (last && m.t - last.t > NOMINAL * 1.5) snaps.push({ t: m.t - NOMINAL, p: last.p });
      snaps.push({ t: m.t, p: m.p }); if (snaps.length > 8) snaps.splice(0, snaps.length - 8);
    }
    if (!snaps.length) continue;
    const at = t - G.delay; let a = snaps[0], b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].t <= at) { a = snaps[i]; b = snaps[i + 1] ?? snaps[i]; break; }
    const k = b === a ? 1 : Math.min(1, Math.max(0, (at - a.t) / (b.t - a.t))), sec = b === a ? 0 : (b.t - a.t) / 1000;
    frames.push({ t, p: v3(a.p.x + (b.p.x - a.p.x) * k, a.p.y + (b.p.y - a.p.y) * k, a.p.z + (b.p.z - a.p.z) * k), v: v3(sec ? (b.p.x - a.p.x) / sec : 0, 0, sec ? (b.p.z - a.p.z) / sec : 0) });
  }
  return frames;
}

/** Frames in [from, to] where the drawn figure did not move (a freeze) or reported no speed (the gait's stop). */
function stalls(frames, from, to) {
  let still = 0, slow = 0, step = 0, prev = null;
  for (const f of frames) {
    if (prev && f.t >= from && f.t <= to) { const d = dist(f.p, prev.p); if (d < 1e-4) still++; if (Math.hypot(f.v.x, f.v.z) < 0.5) slow++; step = Math.max(step, d); }
    prev = f;
  }
  return { still, slow, step };
}

const walk = (speed) => (t) => v3(t < 1000 ? 0 : (t - 1000) / 1000 * speed, 0, 0); // stands 1 s, then walks east
const WALK = 1.6;

test('steady 5 Hz link: the delay stays at GHOSTS.delay and a straight walk is drawn exactly on the old time base', () => {
  const sent = sendTimes(walk(WALK), 0, 8000, true);
  const frames = play(network(sent, { latency: 50 }), 0, 8000);
  for (const f of frames.filter((f) => f.t > 3000 && f.t < 7500)) {
    assert.equal(f.delay, G.delay, 'no jitter: the buffer keeps the old fixed delay');
    const truth = walk(WALK)(f.t - G.delay - 50); // the player's feet one delay + the latency ago
    assert.ok(dist(f.p, truth) < 0.002, `at ${f.t.toFixed(0)} ms drawn ${f.p.x.toFixed(4)} vs ${truth.x.toFixed(4)}`);
    assert.ok(Math.abs(f.v.x - WALK) < 0.01, 'the reported speed is the walking speed');
  }
});

test('jitter: no frozen frames and no stop in the reported speed while the player walks; the old code froze', () => {
  for (const jitter of [80, 120, 160]) for (const seed of [1, 2, 3, 4]) {
    const net = network(sendTimes(walk(WALK), 0, 12000), { latency: 70, jitter, seed });
    const after = stalls(play(net, 0, 12000), 4000, 11500), before = stalls(playBefore(net, 0, 12000), 4000, 11500), at = `jitter ${jitter} seed ${seed}`;
    assert.equal(after.still, 0, `${at}: frozen frames ${after.still}`);
    assert.equal(after.slow, 0, `${at}: frames reported as nearly stopped ${after.slow}`);
    assert.ok(after.step < WALK * FRAME / 1000 * 2.5, `${at}: largest frame step ${after.step.toFixed(3)} m`);
    assert.ok(before.still > 10, `${at}: the old receiver froze in only ${before.still} frames (the series is not jittery enough)`);
  }
});

test('jitter with lost states (the room rate limit): at most a few frames held, a tenth of the old freezes', () => {
  for (const [jitter, drop] of [[80, 0.05], [120, 0.05], [160, 0.1]]) for (const seed of [1, 2, 3, 4]) {
    const net = network(sendTimes(walk(WALK), 0, 12000), { latency: 70, jitter, drop, seed });
    const after = stalls(play(net, 0, 12000), 4000, 11500), before = stalls(playBefore(net, 0, 12000), 4000, 11500), at = `jitter ${jitter} drop ${drop} seed ${seed}`;
    assert.ok(after.still <= 10 && after.still <= before.still / 10, `${at}: frozen ${after.still} (before ${before.still})`);
    assert.ok(after.step < WALK * FRAME / 1000 * 2.5, `${at}: largest frame step ${after.step.toFixed(3)} m`);
  }
});

test('jitter: the delay rises above GHOSTS.delay, never beyond maxDelay, and slews (no time jumps)', () => {
  const frames = play(network(sendTimes(walk(WALK), 0, 12000), { latency: 70, jitter: 160, drop: 0.1, seed: 5 }), 0, 12000);
  const late = frames.filter((f) => f.t > 6000);
  assert.ok(Math.min(...late.map((f) => f.delay)) > G.delay + 30, 'the buffer grew');
  assert.ok(Math.max(...frames.map((f) => f.delay)) <= PLAY.maxDelay + 1e-9);
  for (let i = 1; i < frames.length; i++) {
    const da = frames[i].at - frames[i - 1].at;
    assert.ok(da >= FRAME * (1 - PLAY.slewUp) - 1e-6 && da <= FRAME * (1 + PLAY.slewDown) + 1e-6, `playhead step ${da}`);
  }
});

test('one late snapshot: a short decaying extrapolation, then no jump back when it arrives', () => {
  const sent = sendTimes(walk(3.2), 0, 6000, true);
  const idx = sent.findIndex((s) => s.send >= 4000);
  const frames = play(network(sent, { latency: 50, late: { [idx]: 260 } }), 0, 6000);
  const ex = frames.filter((f) => f.mode === 'extrap');
  assert.ok(ex.length > 0, 'extrapolated while the snapshot was late');
  const lastKnown = sent[idx - 1].p;
  for (const f of ex) assert.ok(f.p.x - lastKnown.x <= 3.2 * PLAY.extrapMs / 2000 + 1e-6, 'the lead stays within v × extrapMs / 2');
  for (let i = 1; i < frames.length; i++) if (frames[i].t > 3000) {
    const dx = frames[i].p.x - frames[i - 1].p.x;
    assert.ok(dx > -1e-6, `never backwards while walking forwards (${dx.toFixed(4)} m at ${frames[i].t.toFixed(0)} ms)`);
    assert.ok(dx < 3.2 * FRAME / 1000 * 1.6, `no catch-up jump (${dx.toFixed(4)} m)`);
  }
});

test('a real stop: the overshoot is bounded and the figure ends exactly where the room says', () => {
  const stopAt = 3000, path = (t) => v3(Math.min(t, stopAt) / 1000 * 4.8, 0, 0); // a sprint that stops dead
  const sent = sendTimes(path, 0, 7000, true);
  const frames = play(network(sent, { latency: 50 }), 0, 7000), end = sent.at(-1).p;
  const over = Math.max(...frames.map((f) => f.p.x - end.x));
  assert.ok(over <= 4.8 * PLAY.extrapMs / 2000 + 1e-6, `overshoot ${over.toFixed(3)} m`);
  const settled = frames.filter((f) => f.t > sent.at(-1).send + 50 + PLAY.maxDelay + PLAY.settleAfter + PLAY.settleMs + 50);
  assert.ok(settled.length > 10);
  for (const f of settled) { assert.ok(dist(f.p, end) < 1e-6, 'back on the last known point'); assert.equal(f.mode, 'hold'); }
});

test('a pause and walking off again: a hold point, no smear over the pause', () => {
  const path = (t) => v3(t < 2000 ? t / 1000 : t < 5000 ? 2 : 2 + (t - 5000) / 1000, 0, 0);
  const sent = sendTimes(path, 0, 8000), frames = play(network(sent, { latency: 50 }), 0, 8000);
  const mid = frames.filter((f) => f.t > 2600 && f.t < 5050);
  for (const f of mid) assert.ok(Math.abs(f.p.x - sent.find((s) => s.send >= 1999).p.x) < 1e-3 || f.mode === 'settle' || f.mode === 'extrap', `still standing at ${f.t.toFixed(0)}`);
});

test('a burst after a stall plays out at spaced playback times, finite throughout', () => {
  const sent = sendTimes(walk(WALK), 0, 8000, true);
  const i0 = sent.findIndex((s) => s.send >= 4000), late = {};
  for (let i = i0; i < i0 + 5; i++) late[i] = (i0 + 5 - i) * NOMINAL; // five states stuck, then all at once
  const net = network(sent, { latency: 50, late });
  assert.equal(new Set(net.slice(i0, i0 + 5).map((m) => m.t)).size, 1, 'the burst arrives in one instant');
  const frames = play(net, 0, 8000);
  for (const f of frames) for (const k of ['x', 'y', 'z']) { assert.ok(Number.isFinite(f.p[k])); assert.ok(Number.isFinite(f.v[k])); }
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].p.x - frames[i - 1].p.x > -0.02, 'no large step back after the burst');
});

test('the curve passes through every snapshot and never dips under a floor it lands on', () => {
  const s = [{ t: 0, p: v3(0, 3, 0) }, { t: 200, p: v3(1, 2, 0) }, { t: 400, p: v3(2, 0, 0) }, { t: 600, p: v3(3, 0, 0) }, { t: 800, p: v3(4, 0, 0) }];
  const out = { p: v3(0, 0, 0), v: v3(0, 0, 0) };
  for (const q of s.slice(0, -1)) { sampleSnaps(s, q.t, PLAY, out); assert.ok(dist(out.p, q.p) < 1e-9); }
  for (let at = 0; at <= 800; at += 5) { sampleSnaps(s, at, PLAY, out); assert.ok(out.p.y >= -1e-9, `y ${out.p.y} at ${at}`); }
});

test('teleports on implausible speed, not only on GHOSTS.jump; fast legal motion is no teleport', () => {
  const pb = newPlayback(NOMINAL), hold = holdGap(pb, true, PLAY);
  assert.ok(teleported(v3(0, 0, 0), v3(20, 0, 0), 200, hold, NOMINAL, G.jump, PLAY), 'a 20 m respawn within one interval');
  assert.ok(teleported(v3(0, 0, 0), v3(20, 0, 0), 4000, hold, NOMINAL, G.jump, PLAY), 'the same after standing still for 4 s (drawn over one interval)');
  assert.ok(teleported(v3(0, 0, 0), v3(0, 0, 150), 200, hold, NOMINAL, G.jump, PLAY), 'beyond GHOSTS.jump');
  assert.ok(!teleported(v3(0, 0, 0), v3(4.5, 0, 0), 200, hold, NOMINAL, G.jump, PLAY), 'the jetpack in thin air (22.5 m/s)');
  assert.ok(!teleported(v3(0, 50, 0), v3(0, 38, 0), 200, hold, NOMINAL, G.jump, PLAY), 'a 60 m/s fall');
  assert.ok(!teleported(v3(0, 0, 0), v3(9, 0, 0), 400, hold, NOMINAL, G.jump, PLAY), 'a dropped state at 22.5 m/s');
  assert.ok(!teleported(v3(0, 0, 0), v3(0.3, 0, 0), 3000, hold, NOMINAL, G.jump, PLAY), 'a first step after a pause');
  // through the receiver: the figure appears at the respawn point, no frame in between
  const path = (t) => v3(t < 3000 ? t / 1000 * WALK : 30 + (t - 3000) / 1000 * 0.5, 0, 0);
  const frames = play(network(sendTimes(path, 0, 5000, true), { latency: 50 }), 0, 5000);
  assert.equal(frames.filter((f) => f.p.x > 5.5 && f.p.x < 29.5).length, 0, 'no streak');
});

test('targetDelay: floor GHOSTS.delay, cap maxDelay', () => {
  const pb = newPlayback(NOMINAL);
  assert.equal(targetDelay(pb, G.delay, PLAY), G.delay);
  pb.jit = 1000; assert.equal(targetDelay(pb, G.delay, PLAY), PLAY.maxDelay);
});

if (process.argv.includes('--print')) {
  for (const [name, o] of [['steady', { latency: 50 }], ['jitter 80', { latency: 70, jitter: 80, drop: 0.05, seed: 2 }], ['jitter 160 + 10 % drops', { latency: 70, jitter: 160, drop: 0.1, seed: 2 }]]) {
    const net = network(sendTimes(walk(WALK), 0, 12000), o), a = stalls(play(net, 0, 12000), 4000, 11500), b = stalls(playBefore(net, 0, 12000), 4000, 11500);
    const d = play(net, 0, 12000).filter((f) => f.t > 6000).map((f) => f.delay);
    console.log(`${name.padEnd(24)} before: frozen ${String(b.still).padStart(3)} / slow ${String(b.slow).padStart(3)} frames, max step ${b.step.toFixed(3)} m | after: frozen ${a.still} / slow ${a.slow}, max step ${a.step.toFixed(3)} m, delay ${Math.min(...d).toFixed(0)}–${Math.max(...d).toFixed(0)} ms`);
  }
}
