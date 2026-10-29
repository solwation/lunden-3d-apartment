// #1691: a freed vertex attribute that is later marked for upload must not crash render on phones, and must be reported
// once through console.error with the attribute and geometry names. Needs a bare-`three` resolver, as in verification.md:
//   node --import <hook registering three@0.170.0 from ~/.cache/three-0.170.0> --test tools/lowmemcanarytest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { search: '?lowmem' };
const T = await import('three');
const { freeGeometryAfterUpload, freeSceneGeometryCopies } = await import('../src/lowmemory.js');

test('freed attribute marked for update: no version bump, one console.error with names', () => {
  const geo = new T.BoxGeometry(1, 1, 1); geo.name = 'testbox';
  const mesh = new T.Mesh(geo, new T.MeshBasicMaterial()); mesh.name = 'box-mesh';
  const root = new T.Group(); root.add(mesh);
  assert.equal(freeSceneGeometryCopies(root), 1);
  const normal = geo.attributes.normal; normal.onUploadCallback(); // what three fires after the first upload
  assert.equal(normal.cpuFreed, true); assert.equal(normal.array.length, 0);
  const seen = [], orig = console.error; console.error = (...a) => seen.push(a.join(' '));
  const version = normal.version;
  try { for (let i = 0; i < 5; i++) normal.needsUpdate = true; } finally { console.error = orig; }
  assert.equal(normal.version, version, 'version must stay put so three does not resize the buffer');
  assert.equal(seen.length, 1, 'one report per attribute, not per frame');
  assert.match(seen[0], /attribute=normal/); assert.match(seen[0], /geometry=testbox/);
  const pos = geo.attributes.position, pv = pos.version; pos.needsUpdate = true; assert.equal(pos.version, pv + 1); // unfreed: normal
});
test('label falls back to the mesh name', () => {
  const geo = new T.PlaneGeometry(1, 1), mesh = new T.Mesh(geo, new T.MeshBasicMaterial()); mesh.name = 'poster-12';
  freeSceneGeometryCopies(mesh);
  geo.attributes.uv.onUploadCallback();
  const seen = [], orig = console.error; console.error = (...a) => seen.push(a.join(' '));
  try { geo.attributes.uv.needsUpdate = true; } finally { console.error = orig; }
  assert.match(seen[0], /attribute=uv/); assert.match(seen[0], /geometry=poster-12/);
});
test('three WebGLAttributes does not throw on a freed attribute marked for update', async () => {
  const { WebGLAttributes } = await import('three/src/renderers/webgl/WebGLAttributes.js');
  const gl = new Proxy({ ARRAY_BUFFER: 1, STATIC_DRAW: 2, FLOAT: 3, createBuffer: () => ({}) }, { get: (t, k) => t[k] ?? (() => {}) });
  const attrs = WebGLAttributes(gl);
  const geo = new T.BoxGeometry(1, 1, 1); freeGeometryAfterUpload(geo);
  const n = geo.attributes.normal; attrs.update(n, gl.ARRAY_BUFFER); // first upload fires onUploadCallback (frees the array)
  assert.equal(n.cpuFreed, true);
  const orig = console.error; console.error = () => {};
  try { n.needsUpdate = true; assert.doesNotThrow(() => attrs.update(n, gl.ARRAY_BUFFER)); } finally { console.error = orig; }
});
