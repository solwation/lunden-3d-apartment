// Staleness guard for models/avatar-rigged.glb (#2059). The game takes only the skeleton and
// animations from the GLB (setupRigged in src/avatar.js replaces the mesh geometry at runtime), so
// bone names/hierarchy, inverse bind matrices and animation clips must match a fresh build, while
// the redundant mesh geometry is allowed to drift (head geometry changes often) and is only
// reported. Run: node tools/avatarglbstaleness.test.mjs
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';
import { buildAvatarModel } from './buildavatarglb.mjs';

const buf = fs.readFileSync(new URL('../models/avatar-rigged.glb', import.meta.url));
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
let mesh; gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
const fresh = buildAvatarModel();
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

const oldBones = mesh.skeleton.bones, newBones = fresh.skinnedMesh.skeleton.bones;
check(oldBones.length === newBones.length, `bone count ${oldBones.length} vs ${newBones.length}`);
for (let i = 0; i < Math.min(oldBones.length, newBones.length); i++) {
  check(oldBones[i].name === newBones[i].name, `bone ${i} name ${oldBones[i].name} vs ${newBones[i].name}`);
  check(oldBones[i].parent?.name === newBones[i].parent?.name, `bone ${newBones[i].name} parent`);
  const a = mesh.skeleton.boneInverses[i].elements, b = fresh.skinnedMesh.skeleton.boneInverses[i].elements;
  check(a.every((v, k) => Math.abs(v - b[k]) < 1e-4), `bone ${newBones[i].name} inverse bind matrix`);
  check(oldBones[i].position.distanceTo(newBones[i].position) < 1e-4, `bone ${newBones[i].name} rest position`);
}
const oldAnims = new Map(gltf.animations.map(c => [c.name, c]));
check(oldAnims.size === fresh.animations.length, `clip count ${oldAnims.size} vs ${fresh.animations.length}`);
for (const c of fresh.animations) {
  const o = oldAnims.get(c.name);
  if (!o) { check(false, `missing clip ${c.name}`); continue; }
  check(Math.abs(o.duration - c.duration) < 1e-4, `clip ${c.name} duration`);
  check(o.tracks.length === c.tracks.length, `clip ${c.name} track count`);
  for (const t of c.tracks) {
    const ot = o.tracks.find(x => x.name === t.name);
    check(ot && ot.values.length === t.values.length &&
      ot.values.every((v, k) => Math.abs(v - t.values[k]) < 1e-3), `clip ${c.name} track ${t.name}`);
  }
}
const ov = mesh.geometry.getAttribute('position').count, nv = fresh.skinnedMesh.geometry.getAttribute('position').count;
console.log(`info: mesh vertices committed ${ov}, fresh ${nv} (mesh drift is allowed; runtime replaces it)`);
if (fails.length) { console.error('FAIL avatar GLB stale:\n  ' + fails.join('\n  ') + '\nRebuild: node tools/buildavatarglb.mjs'); process.exit(1); }
console.log('ok: avatar-rigged.glb skeleton, bind poses and animations match a fresh build');
