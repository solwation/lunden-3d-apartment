// Identify the architectural surfaces between the #2321 stair camera's lit pixels and the actual exported lamps.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LIGHTING } from '../../../src/config.js';

const dir = process.argv[2] ?? 'unreal/Lunden/Import';
const { lights, site } = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json')));
const views = JSON.parse(fs.readFileSync(new URL('../../../unreal/Lunden/Tests/views.json', import.meta.url)));
const view = views.views.find(v => v.id === 'stairs');
const camera = new THREE.PerspectiveCamera(views.verticalFovDeg, views.viewport.width / views.viewport.height, .05, 1500);
camera.position.set(view.x, view.feetY + views.standingEyeHeightM, view.z);
camera.rotation.order = 'YXZ';
camera.rotation.set(THREE.MathUtils.degToRad(view.pitchDeg), THREE.MathUtils.degToRad(view.yawDeg), 0);
camera.updateMatrixWorld();

const loader = new GLTFLoader();
// Only position, sidedness and opacity enter these rays. Skip browser image decoding in the Node fixture.
loader.register(parser => ({ name: 'StairRayGeometry', beforeRoot() {
  for (const material of parser.json.materials) {
    delete material.pbrMetallicRoughness?.baseColorTexture;
    delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    delete material.extensions;
  }
} }));
const bytes = fs.readFileSync(path.join(dir, 'l1007.glb'));
const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
scene.updateMatrixWorld(true);
const solid = [];
scene.traverse(mesh => {
  if (!mesh.isMesh || mesh.material.transparent) return;
  for (let p = mesh; p; p = p.parent) if (p.userData.kind === 'collision') return;
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  solid.push({ mesh, box });
});
function firstHit(ray) {
  const meshes = solid.filter(({ box }) => ray.ray.intersectsBox(box)).map(({ mesh }) => mesh);
  return ray.intersectObjects(meshes, false)[0];
}

const passage = 'room_hall_l0_x288_z634', closet = 'room_klk_l0_x396_z587';
const probes = [
  ['shaft-wall', .40, .34, 'furn_dani_l1_x366_z689', true],  // upper floor lamp, floor slab
  ['shaft-wall', .40, .34, 'furn_tubelamp_l0_x539_z796', true], // living-room lamp, wall
  ['riser', .50, .90, closet, true],
  ['tread', .50, .847, closet, true],
  ['door', .22, .16, passage, false],  // direct pool light actually sees this patch of the door
  ['door', .22, .16, 'room_badrum_l0_x117_z631', true],
];
for (const [label, x, y, id, blocked] of probes) {
  const viewRay = new THREE.Raycaster();
  viewRay.near = camera.near;
  viewRay.setFromCamera(new THREE.Vector2(2*x - 1, 1 - 2*y), camera);
  const receiver = firstHit(viewRay);
  assert.ok(receiver, 'missing receiver for ' + label);
  const lamp = lights.find(l => l.id === id);
  assert.ok(lamp?.stairVisibility?.length, 'lamp has no visibility function: ' + id);
  const normal = receiver.face.normal.clone().transformDirection(receiver.object.matrixWorld);
  const delta = new THREE.Vector3(...lamp.position.web).sub(receiver.point);
  const distance = delta.length();
  assert.ok(distance < lamp.distance && normal.dot(delta) > 0, id + ' should illuminate ' + label + ' without masking');
  const ray = new THREE.Raycaster(receiver.point.clone().addScaledVector(normal,.002), delta.normalize(), .015, distance - .12);
  const hit = firstHit(ray);
  assert.equal(!!hit, blocked, id + ' → ' + label);
  console.log(id, '→', label, hit ? 'blocked by ' + hit.object.name : 'clear');
}
assert.equal(lights.find(l => l.id === closet).distance, LIGHTING.ceiling.range);
assert.equal(lights.find(l => l.id === 'room_badrum_l0_x117_z631').distance, LIGHTING.spots.range);
console.log('STAIR_LIGHT_RAYS_OK');

// #2372 uses the same apartment geometry. Trace nine pixels of the original crop, including
// the part beyond the plan's collinear vertex at z=11.639 m, to the exported window-light receiver.
if (site.livingWallLight) {
  const living = views.views.find(v => v.id === 'living-room');
  camera.position.set(living.x, living.feetY + views.standingEyeHeightM, living.z);
  camera.rotation.set(THREE.MathUtils.degToRad(living.pitchDeg), THREE.MathUtils.degToRad(living.yawDeg), 0);
  camera.updateMatrixWorld();
  const [x, z0, y0, z1, y1] = site.livingWallLight.wall;
  for (const u of [.01, .04, .07]) for (const v of [.18, .25, .33]) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(2*u - 1, 1 - 2*v), camera);
    const hit = firstHit(ray);
    assert.equal(hit?.object.material.name, 'std_f1f1ee_r85_m0', `wall paint at (${u}, ${v})`);
    const p = hit.point;
    assert.ok(Math.abs(p.x - x) < .001 && z0 <= p.z && p.z <= z1 && y0 <= p.y && p.y <= y1,
      `painted receiver is outside the diffuse window field: ${p.toArray()}`);
  }
  console.log('LIVING_WALL_RAYS_OK 9 painted receiver points');
}
