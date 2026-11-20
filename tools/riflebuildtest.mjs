// #2209: legacy cached-client head proof follows the same build-independent head as the current logical boxes.
// This checks one ordinary ray across the three builds, not additional anatomical regions or mesh precision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarLook, PVP_RIFLE_HEAD as H, rifleSkullEntry, rifleHeadFrontRegion, rifleHeadContact, rifleBoxHeadContact } from '../src/config.js';

test('one legacy head ray has identical entry and acceptance for slim, medium and heavy builds', () => {
  const look = { ...avatarLook('canonical-head'), style: 0, tall: 1 }, state = { p: [0, 0, 0], r: 0 };
  const o = [-.072, H.headY + .09, -4], d = [0, 0, 1];
  const entry = rifleSkullEntry({ ...look, build: 1 }, state, o, d);
  assert(entry !== null);
  const point = o.map((v, i) => +(v + d[i] * entry).toFixed(3));
  const shot = { t: 'a', w: 'rifle', o, d, hc: [H.version, ...point] };
  for (const build of [0, 1, 2]) {
    const target = { ...look, build };
    assert.equal(rifleSkullEntry(target, state, o, d), entry, `build ${build} has the same x/z profile`);
    assert.equal(rifleHeadFrontRegion(target, state, point, o, d), true);
    assert.equal(rifleHeadContact(target, state, shot, [0, 0, -4], 40, 4), true, `same legacy packet remains a head hit for build ${build}`);
    const box = rifleBoxHeadContact(target, state, o, d, 40);
    assert(box, 'the current client/server boxes also accept this ordinary ray');
  }
  assert.equal(rifleHeadContact(look, state, { ...shot, d: [0, 0, -1] }, [0, 0, -4], 40, 4), false, 'a forged reversed ray still cannot award head damage');
});
