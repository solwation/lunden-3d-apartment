// #2189: node tools/showermoisturetest.mjs — the pure moisture helpers (build-up, drying with door / vent, streaked mirror fog).
import assert from 'node:assert/strict';
import { newMoisture, stepMoisture, fogAmount, clearSeconds } from '../src/showermoisture.js';
let n = 0; const ok = (c, l) => { assert.ok(c, l); n++; };
const run = (m, s, o) => { for (let i = 0; i < s * 10; i++) stepMoisture(m, 0.1, o); return m; };
const wet = run(newMoisture(), 60, { on: true });
ok(wet.mist > 0.9 && wet.wet > 0.98, 'a minute of shower fogs and wets');
const shut = run({ ...wet }, 60, { on: false, door: 0 }), open = run({ ...wet }, 60, { on: false, door: 1 });
ok(shut.mist < wet.mist && open.mist < shut.mist, 'an open door clears faster');
ok(run({ ...wet }, 60, { on: false, vent: 2 }).mist < shut.mist, 'ventilation clears faster');
ok(shut.wet > shut.mist, 'tiles dry slower than the mirror clears');
ok(run({ ...wet }, 400, { on: false }).mist === 0, 'everything fades after the shower');
ok(run(newMoisture(), 20, { on: true, door: 1 }).mist < run(newMoisture(), 20, { on: true }).mist, 'an open door slows the build-up');
ok(fogAmount(0, 0.5) === 0 && fogAmount(1, 0.9) > 0.85, 'no mist = clear, full mist = fogged everywhere');
ok(fogAmount(0.3, 0.1) > fogAmount(0.3, 0.9), 'columns clear one by one (streaks)');
ok(clearSeconds(1, 1) < clearSeconds(1, 0), 'clearSeconds follows the door');
console.log(`showermoisture: ${n} pass, fail 0`);
