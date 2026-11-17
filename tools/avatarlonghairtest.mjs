// #2053: long hair in locks (src/avatarlonghair.js), headless. node --test tools/avatarlonghairtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_HAIR, AVATAR_LONGHAIR as LH } from '../src/config.js';
import { bindAt, NAMES } from '../src/olof.js';
import { isFlyaway } from '../src/avatarflyaway.js';
import { longHairTris } from '../src/avatarlonghair.js';
import { load, penetration } from './avatarlonghairpose.mjs';

const HEAD_BEFORE = 9444; // s1f0 head-bone triangles (facePart 1 … 29) at e1255a64, before #2048's nose (which has its own budget)
const hair = (a, i) => a.region.getX(i) === 3 && a.facePart.getX(i) === 7 && !isFlyaway(a, i, 7, 11);

test('#2053 budget: the locks grow the head by at most +10 % and keep one draw (no new attribute)', () => {
  const growth = longHairTris(24) - 4 * 24 * AVATAR_HAIR.long.rows;
  assert.ok(growth > 0 && growth <= HEAD_BEFORE * 0.1, `+${growth} > ${HEAD_BEFORE}×0.1`);
  const g = avatarModelGeometry({ ...avatarLook('lh'), style: 1, facial: 0, gender: 1 }), a = g.attributes;
  assert.equal(Object.keys(a).length, 17, 'no additional retained attributes');
  g.dispose();
});

test('#2053 locks: an uneven hem of tapered tips, strands in front of the shoulders skinned towards the torso', () => {
  const g = avatarModelGeometry({ ...avatarLook('lh'), style: 1, facial: 0, gender: 1 }), a = g.attributes, hb = bindAt('head');
  const torso = NAMES.indexOf('torso'), head = NAMES.indexOf('head');
  // the hem: the lowest hair point per 6° of azimuth round the back
  const low = new Map();
  let front = 0, frontTorso = 0;
  for (let i = 0; i < a.position.count; i++) {
    if (!hair(a, i)) continue;
    const x = a.position.getX(i) - hb.x, y = a.position.getY(i) - hb.y, z = a.position.getZ(i) - hb.z, az = Math.atan2(x, z) * 180 / Math.PI;
    assert.equal(a.skinIndex.getX(i), head, 'hair is skinned to the head first');
    if (Math.abs(az) > 140) { const k = Math.round(az / 6); low.set(k, Math.min(low.get(k) ?? 1, y)); }
    if (z > 0.08 && y < -0.12) { front++; if (a.skinIndex.getY(i) === torso && a.skinWeight.getY(i) > 0.9) frontTorso++; }
  }
  const hem = [...low.values()], mean = hem.reduce((s, v) => s + v, 0) / hem.length, sd = Math.sqrt(hem.reduce((s, v) => s + (v - mean) ** 2, 0) / hem.length);
  assert.ok(hem.length >= 12 && sd > 0.012, `the back's hem varies (sd ${sd.toFixed(4)} m over ${hem.length} bins)`);
  assert.ok(mean < -0.2, `still long at the back (${mean.toFixed(3)})`);
  assert.ok(front >= 4 * 6 && frontTorso === front, `strands lie on the chest in front of the shoulders, on the torso bone (${frontTorso}/${front})`);
  // tips: the lowest few mm of every lock are narrow (a tapered tip, not a cut edge): triangles ending within 5 mm of the hem are thin
  let wide = 0, tips = 0;
  for (let i = 0; i < a.position.count; i += 3) {
    if (!hair(a, i) || a.position.getY(i) - hb.y > -0.18) continue;
    const ys = [0, 1, 2].map((k) => a.position.getY(i + k)), xs = [0, 1, 2].map((k) => a.position.getX(i + k)), zs = [0, 1, 2].map((k) => a.position.getZ(i + k));
    if (Math.min(...ys) - hb.y > -0.2) continue;
    tips++;
    const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    if (span > 0.02) wide++;
  }
  assert.ok(tips > 50 && wide / tips < 0.05, `the lowest triangles are narrow tips (${wide}/${tips} wider than 2 cm)`);
  g.dispose();
});

test('#2053 flyaways root on the locks only (not the under-layer or the torso-skinned front strands)', () => {
  const g = avatarModelGeometry({ ...avatarLook('lh'), style: 1, facial: 0, gender: 0 }), a = g.attributes;
  let fly = 0; for (let i = 0; i < a.position.count; i++) if (isFlyaway(a, i, 7, 11)) { fly++; assert.notEqual(a.skinIndex.getY(i) === NAMES.indexOf('torso') && a.skinWeight.getY(i) > 0, true); }
  assert.ok(fly > 0, 'long hair still has flyaways');
  g.dispose();
});

test('#2053 no hair inside the body standing, walking, running or sitting (both figures)', async () => {
  const m = await load();
  for (const gender of [0, 1]) {
    const res = penetration(m, { ...m.cfg.avatarLook('pose2053'), style: 1, gender, hat: 0, tall: 1, build: 1 }, { poses: ['rest', 'walk', 'walk2', 'run', 'run2', 'sit'] });
    for (const [pose, r] of Object.entries(res)) assert.equal(r.inside, 0, `gender ${gender} ${pose}: ${r.inside} hair vertices > 2 mm inside, deepest ${r.deepest}`);
  }
});
