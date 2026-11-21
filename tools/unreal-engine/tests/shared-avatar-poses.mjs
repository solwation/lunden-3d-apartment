// Compare accepted public poses on the same room normalizer, including the pre-look default.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanState } from '../../../cloudflare/players.js';
import { PVP_HEAD_BOXES, playerBodySegment, rifleHeadBaseY } from '../../../src/config.js';

let stdin = '';
for await (const chunk of process.stdin) stdin += chunk;
const inputs = JSON.parse(stdin);
const { poses } = JSON.parse(await readFile(new URL('../wire/shared-avatar-poses.json', import.meta.url)));
assert.equal(PVP_HEAD_BOXES.version, 2);
assert.equal(inputs.length, poses.length);
for (const [i, row] of poses.entries()) {
  const native = cleanState(inputs[i]), web = cleanState(JSON.stringify(row.web));
  assert.ok(native && web, row.case);
  // The older page omits the neutral look. Both accepted states describe the same pose for the same avatar.
  assert.deepEqual({...native, look: native.look ?? [0, 0]}, {...web, look: web.look ?? [0, 0]}, row.case);
  assert.deepEqual(playerBodySegment('avatar-fixture', native), playerBodySegment('avatar-fixture', web), row.case);
  assert.equal(rifleHeadBaseY('avatar-fixture', native), rifleHeadBaseY('avatar-fixture', web), row.case);
}
