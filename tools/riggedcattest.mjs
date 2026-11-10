// Automated verification test for rigged GLB cat evaluation (#1892)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.resolve(__dirname, '../models/cat-rigged.glb');
assert(fs.existsSync(modelPath), `Model file not found at ${modelPath}`);

const buffer = fs.readFileSync(modelPath);
assert(buffer.length > 100000 && buffer.length < 500000, `Model size out of expected bounds: ${buffer.length} bytes`);

// Parse GLB Header
const magic = buffer.toString('utf8', 0, 4);
assert.strictEqual(magic, 'glTF', 'GLB magic must be glTF');

const version = buffer.readUInt32LE(4);
assert.strictEqual(version, 2, 'GLB version must be 2');

const totalLength = buffer.readUInt32LE(8);
assert.strictEqual(totalLength, buffer.length, 'GLB length matches buffer length');

// Read JSON chunk
const chunk0Length = buffer.readUInt32LE(12);
const chunk0Type = buffer.toString('utf8', 16, 20);
assert.strictEqual(chunk0Type, 'JSON', 'First chunk must be JSON');

const jsonStr = buffer.toString('utf8', 20, 20 + chunk0Length);
const gltf = JSON.parse(jsonStr);

// Verify Meshes & Draw Call Optimization
assert.strictEqual(gltf.meshes.length, 1, 'Model must contain exactly 1 unified mesh (1 draw call)');

// Verify Armature & Skins
assert(gltf.skins && gltf.skins.length >= 1, 'Model must have a skeletal skin');
const skin = gltf.skins[0];
assert.strictEqual(skin.joints.length, 26, `Armature must have 26 bones, found ${skin.joints.length}`);

// Verify Key Functional Bones
const nodes = gltf.nodes;
const jointNames = skin.joints.map(idx => nodes[idx].name);

const requiredJoints = {
  head: 'Joint4',           // Head bone for watchPoint / gaze tracking
  leftFrontPaw: 'Joint15',  // Left front paw for catclimb.js contact
  rightFrontPaw: 'Joint18', // Right front paw for catclimb.js contact
  leftHindPaw: 'Joint22',   // Left hind paw
  rightHindPaw: 'Joint26',  // Right hind paw
  tailRoot: 'Joint7',       // Tail base for CAT_TAIL_UP posing
  tailTip: 'Joint12',       // Tail tip
};

for (const [role, name] of Object.entries(requiredJoints)) {
  assert(jointNames.includes(name), `Missing required bone ${name} for ${role}`);
}

// Verify Animations
assert(gltf.animations && gltf.animations.length >= 2, 'Must have at least idle and walk animations');
const animNames = gltf.animations.map(a => a.name);
assert(animNames.includes('idle'), 'Must include idle animation');
assert(animNames.includes('walk'), 'Must include walk animation');

// Verify Draw Call Comparison
const proceduralDrawCalls = 27; // Average BoxGeometry parts in src/cat.js
const riggedDrawCalls = gltf.meshes.length; // 1 SkinnedMesh
const drawCallReduction = ((proceduralDrawCalls - riggedDrawCalls) / proceduralDrawCalls) * 100;

console.log('✓ Model structure verified: glTF 2.0 binary');
console.log(`✓ Mesh count: ${gltf.meshes.length} (SkinnedMesh = 1 draw call vs ~${proceduralDrawCalls} procedural parts)`);
console.log(`✓ Draw call reduction: ${drawCallReduction.toFixed(1)}%`);
console.log(`✓ Skeleton: 26 bones mapped (head, tail chain, all 4 paws)`);
console.log(`✓ Animations: ${animNames.join(', ')}`);
console.log('✓ PASS: All architectural compatibility criteria satisfied.');
