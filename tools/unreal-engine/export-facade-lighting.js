// #2324. Read the built desktop meshes before the export strips the web shader's per-pane attributes.
// All positions and room dimensions below are in Unreal centimetres. Horizontal normals are Unreal [X,Y].
import * as THREE from 'three';
import { HUS_L, ROOM_MAP, WINDOW_SCHEDULE } from '../../src/config.js';
import { roomColours, roomLevels } from '../../src/interiormap.js';
import { roundCm, webToUnrealRounded } from './coordinates.mjs';

const cm = (v) => roundCm(100 * v);
function roomPanes(mesh, isHusL) {
  const { position, roomC, roomA, roomB, normal } = mesh.geometry.attributes;
  if (!roomC || !roomA || !roomB) throw new Error('Desktop room attributes missing on ' + mesh.name);
  const panes = new Map(), centre = new THREE.Vector3();
  const index = mesh.geometry.index, vertices = index?.count ?? position.count;
  const vert = (i) => index ? index.getX(i) : i;
  // A single room can span both triangles of a pane, or the many triangles of a thin glazed box.
  // Choose the normal of its largest upright triangle, to avoid tiny edge and horizontal cap faces.
  const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < vertices; i += 3) {
    const v = vert(i);
    if (roomC.getW(v) <= 0) continue;
    const building = isHusL ? 'Hus L' : mesh.userData.buildingRanges.find((r) => v < r.end).building;
    if (building === 'garage') continue;
    n.fromBufferAttribute(normal, v).transformDirection(mesh.matrixWorld);
    if (Math.abs(n.y) > 0.5) continue;
    p.fromBufferAttribute(position, v);
    a.fromBufferAttribute(position, vert(i + 1)).sub(p);
    b.fromBufferAttribute(position, vert(i + 2)).sub(p);
    const area = a.cross(b).lengthSq();
    centre.fromBufferAttribute(roomC, v).applyMatrix4(mesh.matrixWorld);
    const key = centre.toArray().join(',');
    const previous = panes.get(key), faces = previous?.faces ?? new Map();
    const direction = [n.x, n.z], directionKey = direction.map((v) => v.toFixed(4)).join(',');
    const offset = cm(p.applyMatrix4(mesh.matrixWorld).sub(centre).dot(n));
    if (area > (faces.get(directionKey)?.area ?? 0)) faces.set(directionKey, { area, normal: direction, offset });
    if (area <= (previous?.area ?? 0)) continue;
    const packed = roomB.getX(v), kind = Math.floor(packed + 0.001), seed = roomB.getY(v);
    const data = {
      house: building.slice(-1), position: webToUnrealRounded(centre.toArray()),
      normal: [n.x, n.z], halfWidth: cm(roomB.getZ(v)), halfHeight: cm(roomB.getW(v)),
      depth: cm(roomC.getW(v)), floor: cm(roomA.getX(v)), ceiling: cm(roomA.getY(v)),
      left: cm(roomA.getZ(v)), right: cm(roomA.getW(v)), dressing: ROOM_MAP.kinds[kind].name,
      cover: (packed % 1) / 0.99, seed, colours: roomColours(seed), duskLit: mesh.name === 'neighborLitGlass'
    };
    panes.set(key, { area, data, faces });
  }
  return [...panes.values()].map(({ data, faces }) => ({ ...data,
    faces: [...faces.values()].filter(({ normal }) => Math.abs(normal[0]*data.normal[0]+normal[1]*data.normal[1]) > .999)
      .map(({ normal, offset }) => ({ normal, offset })) }));
}

function scheduledWindows({ object, habits }, routines) {
  const windows = [], transform = new THREE.Matrix4(), point = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3();
  const face = new THREE.Vector3(), { width, height } = object.geometry.parameters;
  for (let i = 0; i < object.count; i++) {
    const habit = habits[i];
    if (!habit.house) continue;
    object.getMatrixAt(i, transform);
    const e = transform.elements, f = Math.fround;
    const dot = f(f(f(e[12]*f(12.9898)) + f(e[13]*f(78.233))) + f(e[14]*f(37.719)));
    const noise = f(f(Math.sin(dot))*f(43758.5453)), glowSeed = noise - Math.floor(noise);
    transform.premultiply(object.matrixWorld).decompose(point, q, scale);
    face.set(0, 0, 1).applyQuaternion(q);
    const { key, hall = false, home, kind, on, off, morning, wake, leave, rgb, tv } = habit;
    routines[key] ??= { home, kind, on, off, morning, wake, leave, rgb, tv };
    windows.push({ house: habit.house, position: webToUnrealRounded(point.toArray()), normal: [face.x, face.z],
      width: cm(width * scale.x), height: cm(height * scale.y), glowSeed, hall, routine: key });
  }
  return windows;
}

// Preserve the source wash cuts round doors and windows and the terrain-following pool triangles.
function glowSurface(mesh) {
  const { position, uv } = mesh.geometry.attributes, index = mesh.geometry.index;
  const point = new THREE.Vector3(), vertices = [], indices = [], seen = new Map();
  for (let i = 0; i < (index?.count ?? position.count); i++) {
    const v = index ? index.getX(i) : i;
    const xyz = webToUnrealRounded(point.fromBufferAttribute(position, v).applyMatrix4(mesh.matrixWorld).toArray());
    const vertex = [...xyz, uv.getX(v), uv.getY(v)], key = vertex.join(',');
    if (!seen.has(key)) { seen.set(key, vertices.length); vertices.push(vertex); }
    indices.push(seen.get(key));
  }
  return { name: mesh.name, vertices, indices };
}

export function facadeLightingData(world, zones) {
  const panes = [], fixtures = [], windows = [], surfaces = [], routines = {};
  for (const group of world.object.children) {
    const isHusL = !!group.userData.neighborOpenings;
    if ((!isHusL && !group.userData.siteNeighborOpenings) || !zones.includes(isHusL ? 'hus-l' : 'kvarteret')) continue;
    for (const name of isHusL ? ['neighborGlass', 'neighborLitGlass', 'neighborEntryGlass'] : ['siteNeighborGlass']) {
      panes.push(...roomPanes(group.getObjectByName(name), isHusL));
    }
    for (const fixture of group.userData.wallLampFixtures) {
      const gallery = fixture.kind === 'gallery';
      const lamp = gallery ? HUS_L.loft.lamp : fixture.kind === 'entrance' ? HUS_L.doorLamp : HUS_L.patioLamp;
      fixtures.push({ ...fixture, position: webToUnrealRounded(fixture.position),
        width: cm(lamp.w - (gallery ? 0.02 : 0.03)), height: cm(lamp.h - (gallery ? 0 : 0.04)) });
    }
    for (const name of isHusL ? ['doorLampWash', 'doorLampPools'] : ['loggiaLampWash', 'loggiaLampPools']) {
      surfaces.push(glowSurface(group.getObjectByName(name)));
    }
    if (!isHusL) windows.push(...scheduledWindows(group.userData.windows, routines));
  }
  const dl = HUS_L.doorLamp;
  return { panes, fixtures, surfaces, windows, roomLevels: { day: roomLevels(0), night: roomLevels(1), strength: ROOM_MAP.strength },
    facadeGlow: HUS_L.facadeGlow, wallLight: { on: dl.on, off: dl.off, fade: dl.fade, colour: dl.color, washPeak: dl.wash.peak, poolPeak: dl.pool.peak },
    schedule: { routines, fade: WINDOW_SCHEDULE.fade, tv: WINDOW_SCHEDULE.tv, glow: ROOM_MAP.glow } };
}
