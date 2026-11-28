// A garage pane and a window light can be closer to a different house than their source building (#2324).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURTYARD, GLASS_PANES, HUS_L, SITE } from '../../../src/config.js';
import { poolGeometry } from '../../../src/groundglow.js';
import { paneTints } from '../../../src/glasspanes.js';
import { roomVertex } from '../../../src/interiormap.js';
import { buildWindowLights } from '../../../src/surroundings.js';
import { windowHabit, windowLevel } from '../../../src/windowschedule.js';
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
  // #2397: the courtyard bollards' pools (hidden by day, as on the web) travel with the gard zone
  const PL = COURTYARD.bollards.pool;
  const pools = new THREE.Mesh(poolGeometry(-20, 17.85, 1, 0, PL.r, PL.r, () => 0, { rings: 2, segs: 4 }));
  Object.assign(pools, { name: 'courtyard-bollard-pools', visible: false });
  // #2430: the bands under the caps (courtyard.js keeps their merged mesh in its group's userData)
  const { h, r } = COURTYARD.bollards, courtyard = new THREE.Group();
  courtyard.userData.bollardBands = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.005, r - 0.005, 0.08, 12).translate(-20, h - 0.08, 17.85).toNonIndexed());
  courtyard.position.y = 0.5;
  courtyard.add(courtyard.userData.bollardBands);
  const world = { object: new THREE.Group() };
  world.object.add(group, pools, courtyard);
  world.object.updateMatrixWorld(true);

  const bands = facadeLightingData(world, ['kvarteret', 'gard']).bollardBands;
  assert.deepEqual([bands.name, bands.on, bands.lit, bands.off], ['courtyardBollardBands', ...Object.values(COURTYARD.bollards.band)]);
  assert.equal(bands.indices.length, 3 * 2 * 12); // the upright faces only: the caps lie inside the bollard
  for (const [x, y, z, u, v] of bands.vertices) {
    // Unreal cm: x = web x, y = web z; 1 mm proud of the imported band, at the group's height
    assert.ok(Math.abs(Math.hypot(x + 2000, y - 1785) - 100 * (r - 0.004)) < 0.02, `band radius at ${x},${y}`);
    assert.ok(z > 100 * (0.5 + h - 0.121) && z < 100 * (0.5 + h - 0.039), `band height ${z}`);
    assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1);
  }
  assert.equal(facadeLightingData(world, ['kvarteret']).bollardBands, undefined);

  const bollard = facadeLightingData(world, ['kvarteret', 'gard']).surfaces.at(-1);
  assert.equal(bollard.name, 'courtyardBollardPools');
  assert.deepEqual([bollard.colour, bollard.peak], [PL.color, PL.peak]);
  assert.equal(bollard.indices.length, 3 * (4 + 2 * 4));
  const data = facadeLightingData(world, ['kvarteret']);
  assert.deepEqual(data.bollardLight, { on: PL.on, off: PL.off, fade: PL.fade, colour: PL.color, peak: PL.peak });
  assert.deepEqual(data.panes.map((p) => p.house), ['C']);
  assert.deepEqual(data.windows.map((w) => [w.house,w.localPower]), [['C',true]]);
  assert.deepEqual(data.panes[0].faces, [{ normal: [0, 1], offset: 0 }]);
  assert.equal(data.surfaces.length, 2);
  for (const surface of data.surfaces) {
    assert.equal(surface.colour, HUS_L.doorLamp.color);
    assert.equal(surface.peak, surface.name.endsWith('Wash') ? HUS_L.doorLamp.wash.peak : HUS_L.doorLamp.pool.peak);
    assert.equal(surface.vertices.length, 4);
    assert.equal(surface.indices.length, 6);
    assert.equal(new Set(surface.indices).size, 4);
  }
  assert.deepEqual(data.schedule.routines['unit:C'], windowHabit('unit:C'));

  // Real production window geometry/routines, not a replacement schedule. The canvas stub
  // only constructs the unrelated spill mask; these checks do not claim raster parity.
  globalThis.document = { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}
  }) }) };
  try {
    const source = buildWindowLights();
    group.userData.windows = source;
    group.add(source.object);
    world.object.updateMatrixWorld(true);
    const exported = facadeLightingData(world, ['kvarteret']);
    assert.equal(exported.windows.length, source.habits.length);
    const external = source.habits.flatMap((h,i) => !h.house ? [i] : []);
    assert.equal(external.length, 86);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    for (const [i,h] of source.habits.entries()) {
      const row = exported.windows[i];
      source.object.getMatrixAt(i,matrix); position.setFromMatrixPosition(matrix);
      assert.deepEqual(row.position, [position.x,position.z,position.y].map(v => Math.round(v*10000)/100));
      assert.equal(row.routine,h.key);
      assert.equal(row.localPower,!!h.house);
      assert.equal(row.house,h.house ?? 'external');
      const {key,hall,house,...habit} = h;
      assert.deepEqual(exported.schedule.routines[h.key],habit);
    }
    const i = source.habits.findIndex(h => h.key === '28.17,1.70,7.95');
    const h = source.habits[i], row = exported.windows[i];
    assert.equal(windowLevel(h,18.25),1);
    assert.deepEqual(row.position,[2817,795,170]);
    const camera = new THREE.PerspectiveCamera(72,640/360,.1,1000);
    camera.rotation.order='YXZ'; camera.position.set(2.875,1.62,-12);
    camera.rotation.set(8*Math.PI/180,Math.PI,0); camera.updateMatrixWorld();
    const pixel = new THREE.Vector3(28.17,1.7,7.95).project(camera);
    assert.ok(Math.abs((pixel.x+1)*320-2.966)<.01 && Math.abs((1-pixel.y)*180-213.806)<.01);
    // Evaluate the actual HLSL early-out expression against source scene colour,
    // including a power cut. No shader curve is reconstructed by this test.
    const shader = readFileSync(new URL('../facade/window.hlsl', import.meta.url),'utf8');
    const [,gate] = shader.match(/if \(([^\n]+)\) return 0;/);
    const dark = new Function('LocalPower','PowerAvailable','k',`return ${gate};`);
    for (const hour of [14,18.25,22.25,.25,6.25]) for (const night of [0,1]) for (const power of [true,false]) {
      source.update(hour,night,power);
      for (const [j,habit] of source.habits.entries()) {
        const k = habit.hall ? .85*night : windowLevel(habit,hour)*(.25+.75*night);
        const colour = new THREE.Color(); source.object.getColorAt(j,colour);
        assert.equal(dark(exported.windows[j].localPower,power,k),colour.r===0 && colour.g===0 && colour.b===0,
          `${habit.key} at ${hour}, night ${night}, power ${power}`);
      }
    }
    source.update(18.25,1,true);
    const lit = new THREE.Color(); source.object.getColorAt(i,lit);
    source.update(18.25,1,false);
    const powerOff = new THREE.Color(); source.object.getColorAt(i,powerOff);
    assert.deepEqual(powerOff.toArray(),lit.toArray());
    assert.ok(powerOff.r>0);
    for (const [j,habit] of source.habits.entries()) if (habit.house) {
      source.object.getColorAt(j,powerOff); assert.deepEqual(powerOff.toArray(),[0,0,0]);
    }
  } finally { delete globalThis.document; }

});
