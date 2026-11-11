import assert from 'node:assert/strict';
import test from 'node:test';
import { modelURL } from '../src/modelurl.js';
test('HTTP(S) model URLs carry the module build even under a project subpath', () => {
  for (const protocol of ['http:', 'https:']) {
    const url = modelURL('../models/cat-rigged.glb', `${protocol}//example.test/lunden/src/cat.js?v=build123&r=1`);
    assert.equal(url.href, `${protocol}//example.test/lunden/models/cat-rigged.glb?v=build123`);
  }
  assert.equal(modelURL('../models/cat-rigged.glb', 'https://example.test/src/cat.js').search, '');
});
test('Node file URLs stay unversioned and usable by fileURLToPath', async () => {
  const { fileURLToPath } = await import('node:url');
  const url = modelURL('../models/cat-rigged.glb', 'file:///tmp/lunden/src/cat.js?v=build123');
  assert.equal(url.href, 'file:///tmp/lunden/models/cat-rigged.glb');
  assert.equal(fileURLToPath(url), '/tmp/lunden/models/cat-rigged.glb');
});
