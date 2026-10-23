// #1510: the Auto regulator's decisions (src/quality.js, QUALITY.auto) against simulated devices. Decision logic only,
// no hardware claim. `node tools/qualityautotest.mjs` (no browser).
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { Quality } = await import('../src/quality.js');
let n = 0; const ok = (v, m) => { assert.ok(v, m); console.log('PASS', m); n++; };
const fresh = (start = 3, target = 60) => { const q = new Quality({ start, remember: false }); q.target = target; return q; };
// A device: ms(q) = the interval at the current level/pixel level, cpu(q, ms) = main-thread work (null = unknown).
const run = (q, seconds, ms, cpu = () => null) => {
  let t = 0; const levels = [];
  while (t < seconds) { const f = ms(q, t); q.update(f / 1000, cpu(q, f)); t += f / 1000; levels.push([t, q.level, q.pixelLevel]); }
  return levels;
};
const switchesIn = (q, fn) => { const s = q.switches; fn(); return q.switches - s; };

// 1. sustained overload steps down after ~2 windows (60 target, 40 fps, no CPU data → uncertain: level + resolution)
let q = fresh();
let tr = run(q, 3, () => 25);
let first = tr.find(([, l]) => l < 3);
ok(first && first[0] > 1.9 && first[0] < 3 && q.pixelLevel === q.level, `sustained 40 fps steps down at ${first?.[0].toFixed(2)} s (level + resolution, class unknown)`);
ok(q.log[0].cls === 'unknown' && q.diagnostics().gpuTime === false, 'classification marked unknown without CPU data; no GPU time claimed');

// 2. isolated stalls (a 180 ms save, a 400 ms load) in a steady 60 fps never move the level, but stay in diagnostics
q = fresh();
const sw = switchesIn(q, () => run(q, 60, (_, t) => (Math.abs(t % 7 - 3) < 0.01 ? 180 : Math.abs(t % 11 - 5) < 0.01 ? 400 : 1000 / 60)));
ok(q.level === 3 && sw === 0, 'single load/save stalls cause no level change');
ok(q.stalls.count >= 8 && q.stalls.recent.some((s) => s.ms >= 400) && q.stalls.recent.some((s) => s.ms === 180), `stalls kept in diagnostics (${q.stalls.count})`);
// … and a short burst (three 70 ms frames within one window) is not sustained load either
q = fresh();
run(q, 40, (_, t) => (t % 10 > 4 && t % 10 < 4.25 ? 70 : 1000 / 60));
ok(q.level === 3 && q.switches === 0, 'one short hitch burst every 10 s: no step');
// repeated hitches every window ARE sustained load
q = fresh();
run(q, 4, (_, t) => (Math.floor(t * 1000 / 120) % 2 ? 70 : 1000 / 60));
ok(q.level < 3 && q.log[0].why === 'hitches', 'repeated hitches (70 ms every ~120 ms) step down');

// 3. vsync cap: 60 FPS at level 2 is no proof of headroom → a trial step; level 3 is too expensive → reverted and backed off
q = fresh(2);
const capped = (qq) => (qq.level >= 3 ? 1000 / 30 : 1000 / 60); // a 60 Hz display: the expensive level falls to 30 fps
let swc = switchesIn(q, () => run(q, 120, capped));
const trials = q.log.filter((e) => e.why === 'trial'), failed = q.log.filter((e) => e.why === 'trial-failed');
ok(trials.length >= 1 && failed.length === trials.length && q.level === 2, `vsync cap: ${trials.length} trial(s), all reverted, back at level 2`);
ok(swc <= 4 && failed[0].backoff === 60 && (failed[1]?.backoff ?? 120) === 120, `backoff doubles, ${swc} switches in 120 s`);
const gap = trials[1] ? trials[1].t - trials[0].t : Infinity;
ok(gap >= 60, `no retry of the failed level within the backoff (next trial after ${gap.toFixed(0)} s)`);
// a trial that keeps the budget stays
q = fresh(2); run(q, 20, () => 1000 / 60);
ok(q.level === 3 && q.log.some((e) => e.why === 'trial-kept'), 'trial step kept while the budget holds');
// 144 Hz display at a 60 target: headroom is judged against the budget, not the display
q = fresh(1); run(q, 40, () => 1000 / 144);
ok(q.level === 3, '144 Hz display with 7 ms frames climbs to the top level by kept trials');

// 4. cooldown / blocked: no step up within `blocked` s of a step down
q = fresh();
run(q, 3, () => 25); const downAt = q.log[0].t, lvl = q.level;
run(q, 15, () => 1000 / 60);
ok(q.level === lvl, 'no step up within 20 s of a step down');
run(q, 20, () => 1000 / 60);
ok(q.level === lvl + 1 && q.log.at(-1).t - downAt >= 20, 'steps up (trial) after the block');

// 5. classification: CPU-bound holds the resolution; GPU-uncertain steps the resolution first
q = fresh();
run(q, 3, () => 25, (_, f) => f * 0.9);
ok(q.level === 2 && q.pixelLevel === 3 && q.log[0].cls === 'cpu?' && q.log[0].kind === 'cpu', 'CPU-bound overload: level down, resolution held');
const cpuDevice = (qq) => 25 - (3 - qq.level) * 3; // CPU work shrinks with the level (detail/shadow cadence), not with px
q = fresh(); run(q, 30, cpuDevice, (_, f) => f * 0.9);
ok(q.pixelLevel === 3 && q.level < 2, `sustained CPU load keeps stepping only CPU knobs (level ${q.level}, px ${q.pixelLevel})`);
q = fresh(); q.set(2, 'set', 3);
run(q, 3, () => 25, () => 5);
ok(q.level === 2 && q.pixelLevel === 2 && q.log[0].cls === 'gpu?', 'GPU-uncertain overload lowers the held resolution first (class gpu?)');

// a 'cpu?' level step that buys nothing is reverted; the next overload tries the resolution (back-pressure case)
const backPressure = (qq) => 22 + qq.pixelLevel * 3; // only the resolution helps, though the main thread looks busy
q = fresh(); run(q, 30, backPressure, (_, f) => f * 0.9);
ok(q.log.some((e) => e.why === 'ineffective' && e.kind === 'cpu') && q.pixelLevel < 3 && q.log.some((e) => e.kind === 'gpu' && e.why !== 'ineffective'),
  `ineffective cpu-kind step reverted, resolution step tried next (level ${q.level}, px ${q.pixelLevel})`);

// 6. response measurement: a step that buys nothing is reverted and not repeated at once
q = fresh();
swc = switchesIn(q, () => run(q, 120, () => 25));
const bad = q.log.filter((e) => e.why === 'ineffective');
ok(bad.length >= 1 && q.level === 3, `ineffective step reverted (${bad.length}×), the picture kept`);
ok(swc <= 6 && q.backoffs.downgpu.s + q.backoffs.downcpu.s >= 180, `bounded, slowing switching under level-independent load (${swc} switches in 120 s)`);

// … but a cheaper step measured WORSE means the scene got heavier meanwhile (a moving route, loading): kept, not reverted.
// (lowmem UHD 630 route: every step was reverted into a heavier scene, ending at the start level 3 × over budget.)
const heavier = (t) => (t < 4 ? 1 : t < 9 ? 1.35 : 1.7);
q = fresh(2); { let t = 0, up = 0, prev = [2, 2];
  while (t < 40) { const f = (30 + 4 * q.level + 3 * q.pixelLevel) * heavier(t); q.update(f / 1000, f * 0.9); t += f / 1000;
    if (q.level > prev[0] || q.pixelLevel > prev[1]) up++; prev = [q.level, q.pixelLevel]; }
  ok(up === 0 && !q.log.some((e) => e.why === 'ineffective') && q.log.some((e) => e.why === 'step-unclear') && q.level === 0 && q.pixelLevel === 0,
    `scene heavier under the measurement: steps kept as unclear, monotonic descent to level ${q.level}/px ${q.pixelLevel}, ${q.switches} switches`); }

// 7. manual lock: nothing moves, nothing is judged
q = new Quality({ start: 3 }); q.choose(1);
run(q, 30, () => 50); run(q, 30, () => 5);
ok(q.level === 1 && q.switches === 0 && q.mode === 'manual', 'manual level never moves');

// 8. pause / visibility: held explicitly; the gap and the frames right after resume are not judged or counted as stalls
q = fresh(); run(q, 2, () => 1000 / 60);
q.pause('hidden'); q.update(5); q.update(0.4);
ok(q.stalls.count === 1 && q.paused === null, 'the frame spanning a hidden tab is no stall; a real 400 ms frame after it is');
q = fresh(); run(q, 1.5, () => 25); q.pause('menu'); run(q, 1.2, () => 25);
ok(q.level === 3, 'pause resets the overload streak (no step from frames split around a menu)');

// 9. 30 FPS target: 24 fps is within the budget, 18 fps is not
q = fresh(3, 30); run(q, 10, () => 1000 / 24);
ok(q.level === 3, '30 target accepts 24 fps');
q = fresh(3, 30); run(q, 4, () => 1000 / 18);
ok(q.level < 3, '30 target steps down at 18 fps');

console.log(`ALL PASS (${n})`);
