import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R } from './config.js';

// #1570: the BIO's 7.1 + height speakers (static boxes that join the room's merged batch) and the wall sconces (one tiny emissive mesh
// with a MeshBasicMaterial: no light source) that dim while a film runs. Every size/position is a *guess* (PLAYROOM.cinemaAudio / sconces).

/**
 * `cbox(colour, x0, x1, y0, y1, z0, z1)` and `paint(geometry, colour)` are the room's own helpers (local metres); returns the geometries for the
 * static batch, the floor footprints `[x0, x1, z0, z1]` (collision/contact shadow) and the sconce shades' mesh.
 */
export function playroomCinema(cbox, paint, dark, steel) {
  const A = R.cinemaAudio, S = R.furniture.cinema.screen, C = R.clubhouse, h = R.ceiling;
  const north = -R.d / 2, south = C.front - C.wall / 2, east = -C.side - C.wall / 2;
  const fur = [], footprints = [];
  // #1641: the film's sound positions: every speaker below at its world centre (the subwoofer stays out: its low end carries no direction)
  const speakers = [], at = (x, y, z, kind) => speakers.push({ x: R.x + x, y, z: R.z + z, kind });
  // driver cones (round grilles) facing +x, -x, +z or -z from a speaker face
  const driver = (x, y, z, radius, axis, sign) => {
    const g = new THREE.CylinderGeometry(radius, radius, .012, 10);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
    return paint(g.translate(R.x + x + (axis === 'x' ? sign * .006 : 0), y, R.z + z + (axis === 'z' ? sign * .006 : 0)), steel);
  };
  // front left / right: floor-standing towers just inside the screen's side edges
  const T = A.tower;
  for (const side of [-1, 1]) {
    const zc = side < 0 ? north + T.wallGap + T.w / 2 : south - T.wallGap - T.w / 2, x0 = A.frontX - T.d / 2, x1 = A.frontX + T.d / 2;
    fur.push(cbox(dark, x0, x1, T.plinth, T.h, zc - T.w / 2, zc + T.w / 2)); at(A.frontX, (T.plinth + T.h) / 2, zc, 'front');
    for (const [dy, r] of [[.78, .035], [.56, .07], [.3, .07]]) fur.push(driver(x1, dy, zc, r, 'x', 1));
    footprints.push([x0, x1, zc - T.w / 2, zc + T.w / 2]);
    for (const fz of [-1, 1]) fur.push(cbox(steel, A.frontX - .05, A.frontX + .05, 0, T.plinth, zc + fz * (T.w / 2 - .04) - .015, zc + fz * (T.w / 2 - .04) + .015));
  }
  // centre speaker on two feet below the screen, subwoofer on the floor
  const c = A.center;
  fur.push(cbox(dark, c.x - c.d / 2, c.x + c.d / 2, c.y, c.y + c.h, S.z - c.w / 2, S.z + c.w / 2));
  for (const fz of [-1, 1]) fur.push(cbox(steel, c.x - .05, c.x + .05, 0, c.y, S.z + fz * (c.w / 2 - .06) - .02, S.z + fz * (c.w / 2 - .06) + .02));
  for (const fz of [-.18, .18]) fur.push(driver(c.x + c.d / 2, c.y + c.h / 2, S.z + fz, .06, 'x', 1));
  footprints.push([c.x - c.d / 2, c.x + c.d / 2, S.z - c.w / 2, S.z + c.w / 2]); at(c.x, c.y + c.h / 2, S.z, 'center');
  const b = A.sub;
  fur.push(cbox(dark, b.x - b.d / 2, b.x + b.d / 2, 0, b.h, b.z - b.w / 2, b.z + b.w / 2), driver(b.x + b.d / 2, b.h / 2, b.z, .15, 'x', 1));
  footprints.push([b.x - b.d / 2, b.x + b.d / 2, b.z - b.w / 2, b.z + b.w / 2]);
  // side surrounds (north wall, south partition), rear surrounds (east wall), height speakers (ceiling)
  const u = A.surround;
  fur.push(cbox(dark, u.x - u.w / 2, u.x + u.w / 2, u.y - u.h / 2, u.y + u.h / 2, north, north + u.d), driver(u.x, u.y, north + u.d, .07, 'z', 1)); at(u.x, u.y, north + u.d / 2, 'surround');
  fur.push(cbox(dark, u.x - u.w / 2, u.x + u.w / 2, u.y - u.h / 2, u.y + u.h / 2, south - u.d, south), driver(u.x, u.y, south - u.d, .07, 'z', -1)); at(u.x, u.y, south - u.d / 2, 'surround');
  const r = A.rear;
  for (const z of r.z) fur.push(cbox(dark, east - r.d, east, r.y - r.h / 2, r.y + r.h / 2, z - r.w / 2, z + r.w / 2), driver(east - r.d, r.y, z, .07, 'x', -1)), at(east - r.d / 2, r.y, z, 'rear');
  const k = A.ceiling;
  for (const x of k.x) for (const z of k.z) fur.push(cbox(dark, x - k.w / 2, x + k.w / 2, h - k.h, h, z - k.d / 2, z + k.d / 2)), at(x, h - k.h / 2, z, 'height');
  // sconces: a dark back plate in the static batch, the emissive shade in one small mesh
  const L = R.sconces, shades = [];
  const sconce = (x, z, sign) => { // sign +1: on the north wall (shade extends toward +z), -1: on the south partition
    const wall = sign > 0 ? north : south, a = wall, bz = wall + sign * L.d;
    fur.push(cbox(dark, x - L.w / 2 - .02, x + L.w / 2 + .02, L.y - L.h / 2 - .02, L.y + L.h / 2 + .02, Math.min(a, a + sign * .02), Math.max(a, a + sign * .02)));
    shades.push(new THREE.BoxGeometry(L.w, L.h, L.d - .02).translate(R.x + x, L.y, R.z + (a + sign * .02 + bz) / 2));
  };
  for (const x of L.x.north) sconce(x, north, 1);
  for (const x of L.x.south) sconce(x, south, -1);
  // the BIO's ceiling panel (taken out of the room-wide sign batch, which also carries the neon signs) dims with the sconces
  const pc = R.clubhouse.side * 2, pz = (-R.d / 2 + C.front) / 2;
  shades.push(new THREE.BoxGeometry(1.2, .03, 1.2).translate(R.x - pc, h - .015, R.z + pz));
  shades.forEach((g, i) => {
    const col = new THREE.Color(i === shades.length - 1 ? L.panel : L.lit), n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) col.toArray(c, j * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal');
  });
  const merged = mergeGeometries(shades.map(g => g.toNonIndexed()));
  shades.forEach(g => g.dispose());
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'bio-sconces'; mesh.matrixAutoUpdate = false;
  /** 0 = lit, 1 = fully dimmed (the colour scaled to PLAYROOM.sconces.dimmed). */
  const setDim = level => material.color.setScalar(1 + (L.dimmed - 1) * level);
  return { fur, footprints, speakers, sconces: mesh, setDim };
}
