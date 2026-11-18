// #2110: the outdoor wind on the hair / bun / hem springs, headless. node --test tools/avatarwindtest.mjs (needs `three` resolvable: sitewind.js)
// Function-level: zero indoors and in still air, grows with the weather's power, leans downwind in the bone's own frame, irregular (not one
// sine), bounded by AVATAR_WIND.max and the springs' walls, fades over a door instead of popping, and #2014's own sway still adds on top.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newWind, stepWind } from '../src/avatarwind.js';
import { newSway, stepSway } from '../src/avatarsway.js';
import { AVATAR_WIND as C, AVATAR_SWAY as S, SITE_WIND as W } from '../src/config.js';
import { siteWindPower } from '../src/sitewind.js';

/** A bone's world matrix elements: position and yaw (0 = facing +z). */
const mat = (x, y, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]; };
const dir = (() => { const l = Math.hypot(W.dir[0], W.dir[1]); return { x: W.dir[0] / l, y: W.dir[1] / l }; })();
/** Runs `secs` at 60 fps standing at (x, z) facing `yaw`; returns per-frame spring offsets and wind targets. */
function run({ power, outdoors = true, secs = 20, yaw = 0, x = 3, z = -7, sway = newSway(), wind = newWind(), at = 0 }) {
  const dt = 1 / 60, head = mat(x, 1.6, z, yaw), torso = mat(x, 1.1, z, yaw), trace = [];
  for (let t = 0; t < secs; t += dt) {
    const o = typeof outdoors === 'function' ? outdoors(t) : outdoors;
    stepWind(wind, dt, { time: at + t, power, dir }, o, head, torso);
    stepSway(sway, dt, head, torso, wind);
    trace.push({ t, hair: [...sway.hair.p], bun: [...sway.bun.p], hem: [...sway.hem.p], push: [...wind.hair] });
  }
  return trace;
}
const mag = (p) => Math.hypot(p[0], p[1], p[2]);
const peak = (tr, g) => Math.max(...tr.map((f) => mag(f[g])));

test('zero indoors and in still air: the springs stay exactly at rest', () => {
  for (const tr of [run({ power: 1, outdoors: false }), run({ power: 0 })])
    for (const g of ['hair', 'bun', 'hem']) assert.equal(peak(tr, g), 0, g);
});

test('grows with the weather: a calm clear breeze barely stirs, a storm clearly moves hair and hem', () => {
  const calm = siteWindPower({}), storm = siteWindPower({ overcast: 1, rain: 1, storm: true });
  const c = run({ power: calm }), s = run({ power: storm });
  assert.ok(peak(c, 'hair') > 0 && peak(c, 'hair') < 0.006, `calm hair ${peak(c, 'hair')}`);
  assert.ok(peak(s, 'hair') > 0.015, `storm hair ${peak(s, 'hair')}`);
  assert.ok(peak(s, 'hem') > 0.008 && peak(s, 'bun') > 0.003, `storm hem ${peak(s, 'hem')} bun ${peak(s, 'bun')}`);
  for (const g of ['hair', 'bun', 'hem']) assert.ok(peak(s, g) > peak(c, g) * 3, g);
});

test('bounded: never beyond AVATAR_WIND.max or the spring walls, finite at every frame rate', () => {
  for (const dt of [1 / 144, 1 / 60, 1 / 20, 0.2]) {
    const sw = newSway(), wd = newWind(), head = mat(0, 1.6, 0, 0.4), torso = mat(0, 1.1, 0, 0.4);
    for (let t = 0; t < 30; t += dt) {
      stepWind(wd, dt, { time: t, power: 1, dir }, true, head, torso);
      stepSway(sw, dt, head, torso, wd);
      for (const g of ['hair', 'bun', 'hem']) {
        assert.ok(Math.hypot(wd[g][0], wd[g][2]) <= C[g].max + 1e-9 && wd[g][1] <= C[g].max + 1e-9, `${g} target`);
        for (let i = 0; i < 3; i++) { const v = sw[g].p[i]; assert.ok(Number.isFinite(v) && v >= S[g].min[i] - 1e-12 && v <= S[g].max[i] + 1e-12, `${g}[${i}] ${v} dt ${dt}`); }
      }
    }
  }
});

test('downwind in the bone frame: the mean push points with the wind for any heading', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -2.2]) {
    const tr = run({ power: 0.8, yaw, secs: 40 });
    const m = [0, 0, 0]; for (const f of tr) for (let i = 0; i < 3; i++) m[i] += f.push[i] / tr.length;
    // the bone's axes in world: x = (cos yaw, -sin yaw), z = (sin yaw, cos yaw) in (x, z); back to world
    const c = Math.cos(yaw), s = Math.sin(yaw), wx = m[0] * c + m[2] * s, wz = -m[0] * s + m[2] * c;
    assert.ok(wx * dir.x + wz * dir.y > 0.004, `yaw ${yaw}: mean ${wx} ${wz}`);
  }
});

test('irregular: gusts and flutter, not one steady sine (several distinct peaks of different height)', () => {
  const tr = run({ power: 0.8, secs: 30 }), v = tr.map((f) => f.hair[0] * dir.x + f.hair[2] * dir.y);
  const peaks = []; for (let i = 1; i < v.length - 1; i++) if (v[i] > v[i - 1] && v[i] >= v[i + 1]) peaks.push(v[i]);
  assert.ok(peaks.length > 10, `peaks ${peaks.length}`);
  const sd = Math.sqrt(peaks.reduce((a, p) => a + (p - peaks.reduce((x, y) => x + y) / peaks.length) ** 2, 0) / peaks.length);
  assert.ok(sd > 0.001, `peak spread ${sd}`);
});

test('a door: the push fades within a couple of seconds instead of popping, and comes back outdoors', () => {
  const wd = newWind(), tr = run({ power: 1, secs: 6, wind: wd, outdoors: (t) => t < 3 });
  const jumps = tr.slice(1).map((f, i) => mag(f.push.map((v, k) => v - tr[i].push[k])));
  assert.ok(Math.max(...jumps) < 0.006, `largest frame step ${Math.max(...jumps)}`);
  assert.equal(mag(tr.at(-1).push), 0); assert.equal(wd.on, 0);
  const back = run({ power: 1, secs: 3, wind: wd, outdoors: true, at: 6 });
  assert.ok(peak(back, 'hair') > 0.01);
});

test("#2014's own motion still adds: a walk-stop with wind differs from wind alone", () => {
  const sw = newSway(), wd = newWind(), sw2 = newSway(), wd2 = newWind(), dt = 1 / 60; let z = 0, d = 0;
  for (let t = 0; t < 3; t += dt) {
    const v = t < 2 ? 1.4 : 0; z += v * dt;
    const h = mat(0, 1.6, z, 0), to = mat(0, 1.1, z, 0), h2 = mat(0, 1.6, 0, 0), to2 = mat(0, 1.1, 0, 0);
    stepWind(wd, dt, { time: t, power: 0.5, dir }, true, h, to); stepSway(sw, dt, h, to, wd);
    stepWind(wd2, dt, { time: t, power: 0.5, dir }, true, h2, to2); stepSway(sw2, dt, h2, to2, wd2);
    d = Math.max(d, mag(sw.hair.p.map((x, i) => x - sw2.hair.p[i])));
  }
  assert.ok(d > 0.003, `walk-stop adds ${d}`);
});
