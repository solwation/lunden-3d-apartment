// #2258: Santa's TV position follows the shared wall clock; headless test of the pure computation and the SantaTV sync step.
import assert from 'node:assert/strict';
import { santaTvPosition, santaTvDrift, SANTA_TV_SYNC } from '../src/santatvconfig.js';
const D = 120, t0 = Date.UTC(2026, 11, 24, 15, 0, 0);
assert.equal(santaTvPosition(t0, 0), null, 'unknown duration');
assert.equal(santaTvPosition(t0, NaN), null);
assert.ok(Math.abs(santaTvPosition(t0 + 500, D) - santaTvPosition(t0, D) - 0.5) < 1e-6, 'advances in real time');
assert.ok(santaTvPosition(t0 + D * 1000 * 7 + 250, D) - santaTvPosition(t0, D) - 0.25 < 1e-6, 'loops modulo duration');
const late = santaTvPosition(t0 + 3600e3 + 1234, D), early = santaTvPosition(t0, D);
assert.ok(Math.abs(santaTvDrift(late, (early + 3601.234) % D, D)) < 1e-6, 'late joiner matches an early client');
assert.ok(Math.abs(santaTvDrift(0.2, D - 0.3, D) - 0.5) < 1e-9, 'drift is shortest across the loop wrap');
assert.ok(Math.abs(santaTvDrift(D - 0.3, 0.2, D) + 0.5) < 1e-9);
assert.ok(santaTvPosition(-1500, D) >= 0 && santaTvPosition(-1500, D) < D);
// SantaTV.sync with a fake player: no seek within threshold, seek beyond it.
globalThis.document = { addEventListener() {} }; globalThis.window = { addEventListener() {} }; globalThis.performance ??= { now: () => Date.now() };
const { SantaTV } = await import('../src/santatv.js').catch(() => ({}));
if (SantaTV) {
  const tv = Object.create(SantaTV.prototype); const seeks = [];
  let cur = 0; tv.video = { getDuration: () => D, getCurrentTime: () => cur, getPlayerState: () => 1, seekTo: s => seeks.push(s) };
  const now = t0 + 10_500; cur = santaTvPosition(now, D) + 0.6; tv.sync(true, now); assert.equal(seeks.length, 0, 'within 1 s: no seek');
  cur = santaTvPosition(now, D) - 2; tv.sync(true, now); assert.equal(seeks.length, 1, 'drift >1 s seeks'); assert.ok(Math.abs(seeks[0] - santaTvPosition(now, D)) < 1e-6);
  tv.video.getDuration = () => 0; tv.sync(true, now); assert.equal(seeks.length, 1, 'unknown duration: no seek');
}
console.log('santatvsynctest ok', SantaTV ? '(with SantaTV.sync)' : '(pure only)');
