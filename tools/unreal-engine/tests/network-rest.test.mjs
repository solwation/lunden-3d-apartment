// #2292: make the Unreal root from the actual rest export, compare with the web player's outgoing presence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { networkRestRoot } from '../export-player.js';
import { webToUnreal } from '../coordinates.mjs';
import { restState } from '../../../src/remote-pose.js';
import { AVATAR_HEIGHT, AVATAR_SEEDED_TALL, avatarProportions, decodeAvatarLook, encodeAvatarLook, encodeAvatarWireLook } from '../../../src/config.js';

const look = decodeAvatarLook('', 'synthetic-presence');
const samples = AVATAR_SEEDED_TALL.map((tall) => ({ tall, code: encodeAvatarWireLook({ ...look, height: undefined, tall }) }));
for (let height = AVATAR_HEIGHT.min; height <= AVATAR_HEIGHT.max; height++) {
  samples.push({ tall: avatarProportions(height).body, code: encodeAvatarLook({ ...look, height }) });
}
const spots = [
  { kind: 'sit', pos: { x: -3.2, y: 1.04, z: 7.3 }, yaw: 1.57 },
  { kind: 'lie', pos: { x: 4.5, y: 3.38, z: -2.3 }, yaw: -0.7 },
  { kind: 'lie', pos: { x: -1.7, y: 1.23, z: 4.64 }, yaw: 2.8, bodyY: 0.82 },
];
for (const spot of spots) {
  const { baseCm, perBodyScaleCm } = networkRestRoot(spot);
  for (const { tall, code } of samples) {
    const state = restState({ active: true, kind: spot.kind, spot, camera: { rotation: { x: 0.5, y: 1.3 } } }, code, 'synthetic-peer');
    const expected = webToUnreal(state.p);
    const delta = expected.map((v, i) => v - (baseCm[i] + tall * perBodyScaleCm[i]));
    assert.ok(Math.hypot(...delta) < 0.025, `${spot.kind}: root error ${delta} cm at scale ${tall}`);
  }
}
if (process.argv[2]) {
  const { spots: exported, networkBodyScales } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).spawn.rest;
  assert.deepEqual(networkBodyScales.seeded, AVATAR_SEEDED_TALL);
  assert.equal(networkBodyScales.minHeightCm, AVATAR_HEIGHT.min);
  for (let i = 0; i < networkBodyScales.byHeight.length; i++) assert.equal(networkBodyScales.byHeight[i], avatarProportions(i + AVATAR_HEIGHT.min).body);
  for (const kind of ['sit', 'lie']) assert.ok(exported.some((s) => s.kind === kind));
  for (const { networkRoot } of exported) {
    assert.ok([networkRoot.baseCm, networkRoot.perBodyScaleCm].every((v) => v.length === 3 && v.every(Number.isFinite)));
  }
  console.log(`checked ${exported.length} real exported anchors`);
}
console.log(`PASS ${samples.length * spots.length} web presence roots (seats and both bed heights)`);
