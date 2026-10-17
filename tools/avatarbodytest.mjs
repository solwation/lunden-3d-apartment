// #1137: the body and the three shared head boxes follow the chosen avatar height (120, 165 and 195 cm), ordinary
// functional checks: node --test tools/avatarbodytest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, avatarBody, avatarProportions, decodeAvatarLook, encodeAvatarLook, splitAvatarCode, rifleBoxHeadContact as hit,
  rifleHeadBaseY as base, playerBodySegment } from '../src/config.js';

const seed = 'body-1137', HEIGHTS = [120, 165, 195];
const look = (cm) => ({ ...decodeAvatarLook('241302112', seed), height: cm });
const state = (cm, extra = {}) => ({ p: [0, 0, 0], r: -Math.PI, ...splitAvatarCode(encodeAvatarLook(look(cm))), ...extra });
/** Highest / lowest y where a horizontal ray towards the head (from +z, figure facing +z) still hits. */
const span = (st) => { let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < 2.5; y += 0.002) if (hit(seed, st, [0, y, 3], [0, 0, -1], 10)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  return [lo, hi]; };

test('no chosen height keeps PLAYER\'s own body exactly', () => {
  const b = avatarBody(decodeAvatarLook('241302112', seed));
  assert.deepEqual(b, { eye: PLAYER.eye, crouchEye: PLAYER.crouchEye, headroom: PLAYER.headroom, radius: PLAYER.radius, scale: 1 });
});

for (const cm of HEIGHTS) test(`${cm} cm: crouch below standing, head room over the head, radius in range`, () => {
  const b = avatarBody(look(cm)), m = cm / 100;
  assert.ok(Math.abs(b.eye - avatarProportions(cm).eye) < 1e-12);
  assert.ok(b.crouchEye < b.eye * 0.65, `crouch ${b.crouchEye} under eye ${b.eye}`);
  assert.ok(b.headroom > m && b.headroom < m + 0.2, `headroom ${b.headroom} just over the ${m} m figure`);
  assert.ok(b.radius >= 0.15 && b.radius <= 0.235, `radius ${b.radius}`);
});

test('100 cm: crouch eye under the standing eye (#1136 gap)', () => {
  const b = avatarBody(look(100));
  assert.ok(b.crouchEye < b.eye - 0.3);
});

for (const cm of HEIGHTS) test(`${cm} cm: head boxes reach the head top and start at the neck`, () => {
  const [lo, hi] = span(state(cm)), m = cm / 100;
  assert.ok(Math.abs(hi - m) < 0.03, `head top hit ${hi} near ${m}`);
  assert.ok(lo > m * 0.8 && lo < m - 0.15, `lowest head hit ${lo}`);
  assert.ok(Math.abs(base(seed, state(cm)) - lo) < 0.005, 'the body boundary is the lowest head box');
  assert.equal(hit(seed, state(cm), [0, m + 0.05, 3], [0, 0, -1], 10), null, 'over the head misses');
  // crouched: the head comes down well below standing, still hit
  const [clo, chi] = span(state(cm, { c: true }));
  assert.ok(Number.isFinite(clo) && chi < hi - 0.25 * m, `crouched head ${clo}…${chi}`);
});

test('a child has a relatively larger head: the head boxes take a larger share of the height', () => {
  const share = (cm) => { const [lo, hi] = span(state(cm)); return (hi - lo) / (cm / 100); };
  assert.ok(share(120) > share(165) * 1.1 && Math.abs(share(165) - share(195)) < 0.01);
});

for (const cm of HEIGHTS) test(`${cm} cm: seated / lying head and body follow the scaled figure`, () => {
  const spot = { pos: { x: 0, y: 0.45 + 0.72, z: 0 }, yaw: 0, kind: 'sit' };
  // the seated wire state as remote-pose.js restState sends it (feet = seat − avatarSeat × body scale)
  const code = encodeAvatarLook(look(cm)), body0 = avatarProportions(cm).body;
  const sit = { p: [0, spot.pos.y - 0.72 - 0.45 * body0, 0], r: 0, c: false, pose: 1 };
  const st = { ...sit, ...splitAvatarCode(code) }, body = avatarProportions(cm).body;
  assert.ok(Math.abs(sit.p[1] - (0.45 - 0.45 * body)) < 1e-9, 'the hips on the seat');
  const head = base(seed, st);
  assert.ok(head > 0.45 + 0.4 * body && head < 0.45 + 1.0 * body, `seated head base ${head}`);
  const [a, b] = playerBodySegment(seed, st);
  assert.ok([a, b].every(v => v.every(Number.isFinite)));
  const lie = { p: [0, 0.5 - 0.8 * body0, 0], r: 0, c: false, pose: 2 };
  assert.ok(Number.isFinite(base(seed, { ...lie, ...splitAvatarCode(code) })));
});
