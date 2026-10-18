// #1278: the parked cars of the east campus' car parks (stalls and lines: sitebackdrop.js, layout: parkinglayout.js). Four instanced
// batches like the street car park's (paint, trim, glass, tyres: no new geometry or texture), tagged `carBatch` so the view LOD
// (viewlod.js, #1213/#1246) draws the far ones coarse. Each car sits on the ground under its footprint, turned to the slope.
import * as THREE from 'three';
import { SITE, PARKING_LOT as P } from './config.js';
import { parkingLots } from './parkinglayout.js';
import { carGeometry } from './streetlife.js';

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
  const make = (geo, material, colored) => {
    const m = new THREE.InstancedMesh(geo, material, mats.length);
    mats.forEach((x, i) => { m.setMatrixAt(i, x); if (colored) m.setColorAt(i, new THREE.Color(paint[i])); });
    m.castShadow = m.receiveShadow = true; m.userData.carBatch = 'eastlot';
    return m;
  };
  const [body, trim, glass, tyres] = carGeometry();
  group.add(make(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.35 }), true),
    make(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.45 })),
    make(glass, new THREE.MeshStandardMaterial({ color: 0x33495c, roughness: 0.05, metalness: 0.55 })),
    make(tyres, new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.85 })));
  return group;
}
