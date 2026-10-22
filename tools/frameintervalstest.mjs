import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameIntervals } from '../src/frameintervals.js';

test('real 250ms–2s intervals survive with previous callback work and separate state groups', () => {
  const log = new FrameIntervals().start();
  log.callback(0, { warmup: true, startup: true });
  log.complete({ ms: 40, phases: { render: 30 }, delta: { programs: 2 }, at: 'private', gc: 0 });
  log.callback(500, {});
  log.complete({ ms: 20, phases: { render: 12 }, delta: {}, gc: 0 });
  log.callback(1500, {});
  log.note({ background: true }); // hidden and visible entirely between callbacks
  log.callback(3500, {});
  log.callback(3800, { paused: true });
  log.callback(4100, {});
  log.callback(4360, {});
  const result = log.stop();
  assert.deepEqual(result.records.map(r => r.intervalMs), [500, 1000, 2000, 300, 300, 260]);
  assert.deepEqual(result.records[0].previousWork.phases, { render: 30 });
  assert.equal(result.records[0].outsideWorkMs, 460);
  assert.equal(result.records[1].outsideWorkMs, 980);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(result.byState.active.samples, 2);
  assert.equal(result.byState.active.max, 1000);
  assert.equal(result.byState.background.samples, 1);
  assert.equal(result.byState.paused.samples, 2);
  assert.equal(result.byState.warmup.samples, 1);
  assert.equal(result.summary.over250, 6);
  assert.equal(result.summary.p95, 2000);
});

test('bounded chronological ring, exact thresholds, reset, stop and disabled path', () => {
  const log = new FrameIntervals({ capacity: 3 });
  log.callback(1, {}); assert.equal(log.records.length, 0);
  log.start();
  for (const t of [0, 10, 60, 160, 410]) log.callback(t, {});
  const result = log.stop();
  assert.deepEqual(result.records.map(r => r.intervalMs), [50, 100, 250]);
  assert.equal(result.totalSamples, 4); assert.equal(result.droppedSamples, 1);
  assert.deepEqual(result.summary, { samples: 3, durationMs: 400, median: 100, p95: 250, p99: 250,
    max: 250, over50: 2, over100: 1, over250: 0 });
  log.callback(5000, {}); assert.equal(log.total, 4);
  log.start(); log.callback(10000, {}); assert.equal(log.export().summary.samples, 0);
  log.stop();
});
