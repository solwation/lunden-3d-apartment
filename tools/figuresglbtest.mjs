import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadSantaModel, santaFigure, Santa } from '../src/santa.js';
import { loadPingpingModel, pingpingModel } from '../src/pingping.js';
import { buildPingpingSurface } from '../src/pingpingsurface.js';

test('models/santa.glb exists and contains valid glTF binary header', () => {
  const file = path.resolve(process.cwd(), 'models/santa.glb');
  assert.ok(fs.existsSync(file), 'models/santa.glb must exist');
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 50000, `Santa GLB should be non-trivial, got ${buf.length} bytes`);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File magic must be glTF');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('models/pingping.glb exists and contains valid glTF binary header', () => {
  const file = path.resolve(process.cwd(), 'models/pingping.glb');
  assert.ok(fs.existsSync(file), 'models/pingping.glb must exist');
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 20000, `Pingping GLB should be non-trivial, got ${buf.length} bytes`);
  const magic = buf.toString('ascii', 0, 4);
  assert.equal(magic, 'glTF', 'File magic must be glTF');
  const version = buf.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
});

test('santa.glb contains required meshes (body, arms, legs sitting/sleeping, glass)', async () => {
  const loader = new GLTFLoader();
  const file = path.resolve(process.cwd(), 'models/santa.glb');
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    loader.parse(ab, '', resolve, reject);
  });

  assert.ok(gltf.scene, 'GLTF scene must be present');

  let body = null;
  let armL = null, armR = null;
  let legsSit = null, legsSleep = null;
  let glass = null;

  gltf.scene.traverse((obj) => {
    if (obj.name === 'Santa_body') body = obj;
    if (obj.name === 'Santa_arm_left') armL = obj;
    if (obj.name === 'Santa_arm_right') armR = obj;
    if (obj.name === 'Santa_legs_sitting') legsSit = obj;
    if (obj.name === 'Santa_legs_sleeping') legsSleep = obj;
    if (obj.name === 'Santa_glass') glass = obj;
  });

  assert.ok(body, 'Santa_body mesh must exist');
  assert.ok(body.geometry.attributes.color, 'Santa_body must have vertex colors');
  assert.ok(armL, 'Santa_arm_left mesh must exist');
  assert.ok(armR, 'Santa_arm_right mesh must exist');
  assert.ok(legsSit, 'Santa_legs_sitting mesh must exist');
  assert.ok(legsSleep, 'Santa_legs_sleeping mesh must exist');
  assert.ok(glass, 'Santa_glass node must exist');
});

test('pingping.glb contains body, face, flippers, and feet', async () => {
  const loader = new GLTFLoader();
  // Node verifies native geometry; #1927 browser checks decode/render the embedded maps.
  loader.register(parser=>{parser.loadTexture=()=>Promise.resolve(null);return {name:'PingpingNodeGeometryOnly'};});
  const file = path.resolve(process.cwd(), 'models/pingping.glb');
  const buf = fs.readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    loader.parse(ab, '', resolve, reject);
  });

  assert.ok(gltf.scene, 'GLTF scene must be present');

  let body = null;
  let face = null;
  let flippers = null;
  let feet = null;

  gltf.scene.traverse((obj) => {
    if (obj.name === 'Pingping_body') body = obj;
    if (obj.name === 'Pingping_face') face = obj;
    if (obj.name === 'Pingping_flippers') flippers = obj;
    if (obj.name === 'Pingping_feet') feet = obj;
  });

  assert.ok(body, 'Pingping_body mesh must exist');
  assert.ok(face, 'Pingping_face mesh must exist');
  assert.ok(face.geometry.attributes.uv, 'Pingping_face must have UVs');
  assert.ok(flippers, 'Pingping_flippers mesh must exist');
  assert.ok(feet, 'Pingping_feet mesh must exist');
});

test('src/santa.js loads GLB model and builds figure with blush support', async () => {
  const gltf = await loadSantaModel();
  assert.ok(gltf, 'loadSantaModel should resolve parsed gltf');

  const fig = santaFigure();
  assert.ok(fig.object, 'figure object must exist');
  assert.ok(fig.body, 'figure body must exist');
  assert.ok(fig.left, 'figure left arm must exist');
  assert.ok(fig.right, 'figure right arm must exist');
  assert.ok(fig.glass, 'figure glass must exist');

  // Verify Santa class instantiates and can update blush
  const scene = new THREE.Scene();
  const fakeSofa = {
    spots: [{ taken: () => false }],
    pickable: new THREE.Object3D()
  };
  fakeSofa.pickable.userData.rest = { spots: [{ x: 0, y: 0.44, z: -0.08 }] };

  const santa = new Santa({ scene, day: { month: 12, date: 24, hour: 15 }, sofa: fakeSofa });
  assert.equal(santa.state, 'sitting');
  assert.doesNotThrow(() => {
    santa.sips = 5;
    santa.updateBlush();
  });
});

test('src/pingping.js loads GLB model and constructs complete Pingping model', async () => {
  const gltf = await loadPingpingModel();
  assert.ok(gltf, 'loadPingpingModel should resolve parsed gltf');

  const model = pingpingModel();
  assert.ok(model, 'pingpingModel must return a group');
  assert.equal(model.children.length, 4, 'Should contain 4 child meshes (body, face, flippers, feet)');
  const [body, face, flippers, feet] = model.children;
  assert.ok(body.isMesh && body.geometry.attributes.position.count > 0);
  assert.ok(face.isMesh && face.geometry.attributes.position.count > 0);
  assert.ok(flippers.isMesh && flippers.geometry.attributes.position.count > 0);
  assert.ok(feet.isMesh && feet.geometry.attributes.position.count > 0);
});

test('Pingping exported native attributes match the complete fallback recipe', async () => {
  const gltf=await loadPingpingModel(),fallback=buildPingpingSurface();
  for(const mesh of fallback.children){
    const exported=gltf.scene.getObjectByName(mesh.name).geometry;
    assert.deepEqual(Object.keys(exported.attributes).sort(),Object.keys(mesh.geometry.attributes).sort());
    for(const [name,attribute]of Object.entries(mesh.geometry.attributes)){
      if(name!=='normal'){assert.deepEqual(exported.attributes[name].array,attribute.array,mesh.name+'/'+name);continue;}
      // GLTFExporter normalises Float32 normals. Its (1,0,0) for unused sphere-pole vertices
      // is also allowed, provided those zero-normal vertices cannot be submitted by the index.
      for(let i=0;i<attribute.count;i++){
        const a=new THREE.Vector3().fromBufferAttribute(attribute,i),b=new THREE.Vector3().fromBufferAttribute(exported.attributes.normal,i);
        if(a.lengthSq()===0){assert(!mesh.geometry.index.array.includes(i),mesh.name+' unused zero-normal pole');assert.deepEqual(b.toArray(),[1,0,0]);}
        else assert(a.normalize().distanceTo(b)<1e-7,mesh.name+' normal export rounding');
      }
    }
    assert.deepEqual(exported.index?.array,mesh.geometry.index?.array,mesh.name+'/index');
  }
  const bytes=fs.readFileSync('models/pingping.glb'),json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  assert.equal(json.images.length,2,'one face atlas and one shared short-pile normal map');
  assert(json.materials.every(m=>m.normalTexture),'the exported recipe includes cloth normals on every material');
  assert(json.materials.find(m=>m.name==='Mat_PingpingFace').pbrMetallicRoughness.baseColorTexture,'exported face is textured');
});
