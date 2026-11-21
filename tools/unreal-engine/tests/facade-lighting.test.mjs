// A garage pane and a window light can be closer to a different house than their source building (#2324).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLASS_PANES, SITE } from '../../../src/config.js';
import { paneTints } from '../../../src/glasspanes.js';
import { roomVertex } from '../../../src/interiormap.js';
import { windowHabit } from '../../../src/windowschedule.js';
import { facadeLightingData } from '../export-facade-lighting.js';

test('the shared site glass keeps its builder’s house and omits the garage', () => {
  const houseA = SITE.blocks.find((b) => b.name === 'Hus A');
  const panes = [1, 3].map((dx) => new THREE.PlaneGeometry(1, 1).toNonIndexed().translate(houseA.x0 + dx, 2, houseA.z0));
  const mesh = new THREE.Mesh(mergeGeometries(paneTints(panes, 0xffffff, GLASS_PANES.near, roomVertex)));
  mesh.name = 'siteNeighborGlass';
  mesh.userData.buildingRanges = [{ end: 6, building: 'garage' }, { end: 12, building: 'Hus C' }];
  const lights = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.25, 1.45), new THREE.MeshBasicMaterial(), 1);
  lights.setMatrixAt(0, new THREE.Matrix4().makeTranslation(houseA.x0 + 3, 2, houseA.z0));
  const group = new THREE.Group();
  group.add(mesh, lights);
  for (const name of ['loggiaLampWash', 'loggiaLampPools']) {
    const plane = new THREE.PlaneGeometry(2, 1);
    const surface = new THREE.Mesh(name.endsWith('Wash') ? plane : plane.toNonIndexed());
    surface.name = name;
    group.add(surface);
  }
  Object.assign(group.userData, {
    siteNeighborOpenings: [], wallLampFixtures: [],
    windows: { object: lights, habits: [{ ...windowHabit('unit:C'), house: 'C', key: 'unit:C' }] }
  });
  const world = { object: new THREE.Group() };
  world.object.add(group);
  world.object.updateMatrixWorld(true);

  const data = facadeLightingData(world, ['kvarteret']);
  assert.deepEqual(data.panes.map((p) => p.house), ['C']);
  assert.deepEqual(data.windows.map((w) => w.house), ['C']);
  assert.deepEqual(data.panes[0].faces, [{ normal: [0, 1], offset: 0 }]);
  assert.equal(data.surfaces.length, 2);
  for (const surface of data.surfaces) {
    assert.equal(surface.vertices.length, 4);
    assert.equal(surface.indices.length, 6);
    assert.equal(new Set(surface.indices).size, 4);
  }
  assert.deepEqual(data.schedule.routines['unit:C'], windowHabit('unit:C'));
});
