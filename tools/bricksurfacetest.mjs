// #2071: the physical height/roughness masks follow the retained colour map's actual bond.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BRICK_SURFACE as B } from '../src/config.js';
import { brickSurfacePixels, brickSurfaceTexture } from '../src/bricksurface.js';

test('brick surface is deterministic, shallow and aligned to the existing 4 × 8 half bond', () => {
  const a = brickSurfacePixels();
  assert.deepEqual(a, brickSurfacePixels());
  assert.equal(a.byteLength, 512 * 512 * 4);
  const pixel = (x, y, channel = 0) => a[4 * (y * 512 + x) + channel];
  // Fixed independent oracle: existing colour rectangles start at x=4, y=4 and offset 64 px on alternate courses.
  for (let row = 0; row < 8; row++) {
    const y = row * 64;
    for (const x of [0, 64, 128, 192, 256, 320, 384, 448]) {
      assert.equal(pixel(x, y), Math.round(B.mortarHeight * 255), 'every bed joint is recessed');
      assert.equal(pixel(x, y, 1), Math.round(B.mortarRoughness * 255), 'rough mortar follows the same joint');
    }
    const seam = row % 2 ? 64 : 0, face = row % 2 ? 0 : 64;
    assert.equal(pixel(seam, y + 32), Math.round(B.mortarHeight * 255), 'vertical perpend follows half bond');
    assert.ok(pixel(face, y + 32) > 190, 'brick centre remains raised');
    assert.ok(pixel(face, y + 32, 1) < pixel(seam, y + 32, 1), 'brick is slightly smoother than mortar');
  }
  assert.ok(B.bump * (B.faceHeight - B.mortarHeight) < 0.003, 'nominal relief remains under 3 mm');
});

test('one reusable linear packed texture supplies both scalar maps with canvas-compatible orientation and distance filtering', () => {
  const t = brickSurfaceTexture();
  assert.equal(t, brickSurfaceTexture());
  assert.equal(t.colorSpace, THREE.NoColorSpace);
  assert.equal(t.flipY, true);
  assert.equal(t.wrapS, THREE.RepeatWrapping); assert.equal(t.wrapT, THREE.RepeatWrapping);
  assert.equal(t.minFilter, THREE.LinearMipmapLinearFilter); assert.equal(t.magFilter, THREE.LinearFilter);
  assert.equal(t.generateMipmaps, true); assert.equal(t.anisotropy, 8);
  assert.deepEqual([...t.repeat], [1, 1]);
});
