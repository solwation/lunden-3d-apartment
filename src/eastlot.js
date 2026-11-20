// #1278: the parked cars of the east campus' car parks (stalls and lines: sitebackdrop.js, layout: parkinglayout.js). Instanced
// batches like the street car park's (paint, trim, glass, tyres per body type, #2201: no new texture), tagged `carBatch` so the view LOD
// (viewlod.js, #1213/#1246) draws the far ones coarse. Each car sits on the ground under its footprint, turned to the slope.
import * as THREE from 'three';
import { SITE, PARKING_LOT as P } from './config.js';
import { parkingLots } from './parkinglayout.js';
import { parkedCarBatches } from './streetlife.js';
import { carTypeFor } from './carvariants.js';
import { buildVehicleShadow, itemsFromMatrices } from './vehicleshadow.js';
import { lowMemory } from './lowmemory.js';

export function buildEastLotCars(ground) {
  const { cars } = parkingLots(), group = new THREE.Group(), colors = SITE.life.carColors;
  group.name = 'east-lot-cars';
  if (!cars.length) return group;
  const up = new THREE.Vector3(0, 1, 0), mats = [], paint = [];
  for (const c of cars) {
    const q = new THREE.Quaternion().setFromAxisAngle(up, c.yaw), [a, b, d, e] = c.foot; // a-b = rear to front on one side, a-e across
    const y = (ground(a[0], a[1]) + ground(b[0], b[1]) + ground(d[0], d[1]) + ground(e[0], e[1])) / 4;
    // slope: front minus rear, right minus left (the footprint's own corners, so the wheels stand on the ground)
    const fy = (ground(b[0], b[1]) + ground(d[0], d[1])) / 2 - (ground(a[0], a[1]) + ground(e[0], e[1])) / 2, sy = (ground(d[0], d[1]) + ground(e[0], e[1])) / 2 - (ground(a[0], a[1]) + ground(b[0], b[1])) / 2;
    const pitch = Math.atan2(fy, 2 * P.car.hx), roll = -Math.atan2(sy, 2 * P.car.hz);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, 0, pitch, 'XYZ'))); // local x = nose, z = across (the car's own axes)
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(c.x, y + 0.02, c.z), q, new THREE.Vector3(1, 1, 1)));
    paint.push(colors[Math.floor(c.color * colors.length)]);
  }
  const types = cars.map((_, i) => carTypeFor(i, P.seed)); // #2201: body types by a hash of the car's index
  group.add(...parkedCarBatches(mats, paint, types, 'eastlot')); // #2097: the same finish as the street car park; per body type three batches
  const shadow = buildVehicleShadow(itemsFromMatrices(mats, 'car', types), ground, { phone: lowMemory, name: 'east-lot-car-shadow' }); // #2185: contact shadows under every car
  if (shadow.mesh) group.add(shadow.mesh);
  return group;
}
