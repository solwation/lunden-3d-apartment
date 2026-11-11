import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

test('models/car-megane.glb and models/car-parked.glb exist and have valid glTF 2.0 binary headers', () => {
  for (const filename of ['models/car-megane.glb', 'models/car-parked.glb']) {
    const modelPath = path.resolve(filename);
    assert.ok(fs.existsSync(modelPath), `${filename} must exist`);
    const stat = fs.statSync(modelPath);
    assert.ok(stat.size > 50000 && stat.size < 2000000, `Expected reasonable model size (50KB - 2MB), got ${stat.size} bytes for ${filename}`);

    const buf = fs.readFileSync(modelPath);
    const magic = buf.toString('ascii', 0, 4);
    assert.equal(magic, 'glTF', 'File must start with glTF binary magic');
    const version = buf.readUInt32LE(4);
    assert.equal(version, 2, 'glTF version must be 2');
  }
});

test('car-megane.glb contains expected nodes for doors, wheels, interior, screen and body', async () => {
  if (typeof self === 'undefined') globalThis.self = globalThis;
  const modelPath = path.resolve('models/car-megane.glb');
  const glbBuf = fs.readFileSync(modelPath);
  const arrayBuffer = glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });

  assert.ok(gltf.scene, 'gltf must contain a scene');

  const nodeNames = [];
  gltf.scene.traverse((obj) => {
    nodeNames.push(obj.name);
  });

  const expectedDoors = ['Door_FL', 'Door_FR', 'Door_RL', 'Door_RR'];
  for (const d of expectedDoors) {
    assert.ok(nodeNames.includes(d), `Must include door node: ${d}`);
  }

  const expectedWheels = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'];
  for (const w of expectedWheels) {
    assert.ok(nodeNames.includes(w), `Must include wheel node: ${w}`);
  }

  assert.ok(nodeNames.includes('Screen_OpenR'), 'Must include Screen_OpenR mesh node');
  assert.ok(nodeNames.includes('Body'), 'Must include Body group');
  assert.ok(nodeNames.includes('Interior'), 'Must include Interior group');
});

test('car-parked.glb contains all required trim meshes for streetlife.js', async () => {
  if (typeof self === 'undefined') globalThis.self = globalThis;
  const modelPath = path.resolve('models/car-parked.glb');
  const glbBuf = fs.readFileSync(modelPath);
  const arrayBuffer = glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength);

  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });

  const meshNames = [];
  gltf.scene.traverse((obj) => {
    if (obj.isMesh) meshNames.push(obj.name);
  });

  const expectedMeshes = [
    'Parked_paint', 'Parked_black', 'Parked_roof', 'Parked_glass',
    'Parked_chrome', 'Parked_lens', 'Parked_led', 'Parked_blink',
    'Parked_tail', 'Parked_tyre', 'Parked_rim'
  ];

  for (const m of expectedMeshes) {
    assert.ok(meshNames.includes(m), `Parked GLB must contain mesh: ${m}`);
  }
});

test('loadMeganeModel, buildCar and carGeometry integration', async () => {
  if (typeof document === 'undefined') {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') {
          return {
            width: 512,
            height: 512,
            getContext: () => new Proxy({
              width: 512,
              height: 512,
              createLinearGradient: () => ({ addColorStop: () => {} }),
              createRadialGradient: () => ({ addColorStop: () => {} }),
              getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) })
            }, {
              get(target, prop) {
                if (prop in target) return target[prop];
                return () => {};
              },
              set(target, prop, value) {
                target[prop] = value;
                return true;
              }
            })
          };
        }
        return {};
      }
    };
  }

  const { loadMeganeModel, loadParkedCarModel, buildCar, MEGANE } = await import('../src/carmodel.js');
  const [meganeGLTF, parkedGLTF] = await Promise.all([loadMeganeModel(), loadParkedCarModel()]);

  assert.ok(meganeGLTF, 'loadMeganeModel should resolve');
  assert.ok(parkedGLTF, 'loadParkedCarModel should resolve');

  // Build drivable Mégane car
  const carData = buildCar(MEGANE, { doors: true, paint: 0x4a7c59 });
  assert.ok(carData.group, 'Must return a group');
  assert.equal(carData.doors.length, 4, 'Must return 4 doors');
  assert.equal(carData.wheels.length, 4, 'Must return 4 wheels');
  assert.equal(carData.seats.length, 2, 'Must return 2 front seats');
  assert.ok(carData.screen, 'Must return screen mesh');

  const [dFL, dFR, dRL, dRR] = carData.doors;
  assert.equal(dFL.front, true);
  assert.equal(dFL.side, -1);
  assert.equal(dFR.front, true);
  assert.equal(dFR.side, 1);
  assert.equal(dRL.front, false);
  assert.equal(dRL.side, -1);
  assert.equal(dRR.front, false);
  assert.equal(dRR.side, 1);

  // Test carGeometry for parked cars
  const { carGeometry } = await import('../src/streetlife.js');
  const geoms = carGeometry();
  assert.equal(geoms.length, 4, 'carGeometry must return [paint, trim, glass, tyre]');
  const [paintG, trimG, glassG, tyreG] = geoms;
  assert.ok(paintG.attributes.position.count > 0, 'paint geometry must have vertices');
  assert.ok(trimG.attributes.position.count > 0, 'trim geometry must have vertices');
  assert.ok(glassG.attributes.position.count > 0, 'glass geometry must have vertices');
  assert.ok(tyreG.attributes.position.count > 0, 'tyre geometry must have vertices');
  assert.ok(trimG.attributes.color, 'trim geometry must have vertex colors');
});
