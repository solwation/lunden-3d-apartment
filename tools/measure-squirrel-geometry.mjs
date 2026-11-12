import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SQUIRRELS } from '../src/config.js';
import { squirrelGeometry, squirrelRigGeometry } from '../src/squirrels.js';

// Unique retained typed-array views, including unused fallback morph targets.
// This is CPU geometry storage, not total GPU/renderer/texture memory.
function storage(geometries) {
  const unique = new Set(geometries), views = new Set();
  for (const g of unique) {
    for (const a of [g.index, ...Object.values(g.attributes), ...Object.values(g.morphAttributes).flat()]) {
      if (a) views.add(a.isInterleavedBufferAttribute ? a.data.array : a.array);
    }
  }
  return { geometries: unique.size, bytes: [...views].reduce((n, a) => n + a.byteLength, 0) };
}
const lod = [false, true].map(far => {
  const fallback = SQUIRRELS.animals.map(s => squirrelGeometry(s, far));
  const rigged = SQUIRRELS.animals.map(s => squirrelRigGeometry(s, far));
  return { far, triangles: rigged[0].index.count / 3,
    fallback: storage(fallback), rigged: storage(rigged), combined: storage([...fallback, ...rigged]) };
});
const files = ['src/config.js', 'src/squirrels.js', 'models/squirrel-rigged.glb'];
const binary = fs.readFileSync(files[2]);
const gltf = await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength), '');
const neutral = [];
gltf.scene.traverse(o => { if (o.geometry) neutral.push(o.geometry); });
console.log(JSON.stringify({ sourceHashes: Object.fromEntries(files.map(p =>
  [p, createHash('sha256').update(fs.readFileSync(p)).digest('hex')])), lod,
  neutralLoadedGeometry: storage(neutral),
  glbBytes: fs.statSync(files[2]).size }, null, 2));
