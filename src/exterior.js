import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING, COLORS } from './config.js';

// Brick: 250 × 65 mm + 10 mm joints → 0.26 m per brick, 0.075 m per course.
const TILE_W = 1.04, TILE_H = 0.6; // one texture tile = 4 bricks × 8 courses

function brickTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const mortar = new THREE.Color(COLORS.mortar).getStyle();
  g.fillStyle = mortar;
  g.fillRect(0, 0, 512, 512);
  const base = new THREE.Color(COLORS.brick);
  const bw = 128, bh = 64, joint = 8;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let i = -1; i < 5; i++) {
      const col = base.clone().offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.07);
      g.fillStyle = col.getStyle();
      g.fillRect(i * bw + off + joint / 2, row * bh + joint / 2, bw - joint, bh - joint);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const brickMat = () => new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95 });

/** Rectangles covering [x0,x1]×[y0,y1] minus the holes (all axis-aligned). */
function complement(x0, x1, y0, y1, holes) {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1])])]
    .filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1];
    if (xb - xa < 1e-4) continue;
    const ys = holes.filter((h) => h.x0 <= xa + 1e-4 && h.x1 >= xb - 1e-4)
      .map((h) => [Math.max(y0, h.y0), Math.min(y1, h.y1)]).sort((a, b) => a[0] - b[0]);
    let y = y0;
    for (const [ha, hb] of ys) {
      if (ha > y) out.push([xa, xb, y, ha]);
      y = Math.max(y, hb);
    }
    if (y < y1) out.push([xa, xb, y, y1]);
  }
  return out;
}

/** Vertical quad in the plane z (facing −z if `north`), world-space UVs for brick. */
function quadZ(xa, xb, ya, yb, z, north) {
  const geo = new THREE.PlaneGeometry(xb - xa, yb - ya);
  if (north) geo.rotateY(Math.PI);
  geo.translate((xa + xb) / 2, (ya + yb) / 2, z);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / TILE_W, pos.getY(i) / TILE_H);
  return geo;
}

/** Vertical quad in the plane x (facing −x if `west`). */
function quadX(za, zb, ya, yb, x, west) {
  const geo = new THREE.PlaneGeometry(zb - za, yb - ya);
  geo.rotateY(west ? -Math.PI / 2 : Math.PI / 2);
  geo.translate(x, (ya + yb) / 2, (za + zb) / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getZ(i) / TILE_W, pos.getY(i) / TILE_H);
  return geo;
}

function boxGeo(x0, x1, y0, y1, z0, z1) {
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return geo;
}

/**
 * Everything outside the apartment's own walls:
 *  - brick on our north/south façades (around the real openings)
 *  - neighbouring identical units on both sides (same façade pattern, glass only)
 *  - the stacked two-storey unit above, set back behind the loftgång on the north side
 *  - the loftgång (access balcony) with a grey-green railing, a street on the north side
 */
export function buildExterior({ W, D, roofTop, north, south, frame, wall }) {
  const group = new THREE.Group();
  const bricks = [], glassGeo = [], frames = [], solids = [], rails = [], roofs = [];
  const N = BUILDING.neighbours;
  const loftD = BUILDING.loftgangDepth;
  const upperTop = roofTop + BUILDING.upperStoreys * BUILDING.storeyHeight;
  const eps = 0.006;

  const fakeWindow = (o, z, northSide) => {
    const s = northSide ? -1 : 1;
    glassGeo.push(quadZ(o.x0, o.x1, o.y0, o.y1, z + s * 0.002, northSide));
    const f = 0.06;
    frames.push(
      boxGeo(o.x0, o.x1, o.y0, o.y0 + f, z - 0.02, z + 0.02),
      boxGeo(o.x0, o.x1, o.y1 - f, o.y1, z - 0.02, z + 0.02),
      boxGeo(o.x0, o.x0 + f, o.y0, o.y1, z - 0.02, z + 0.02),
      boxGeo(o.x1 - f, o.x1, o.y0, o.y1, z - 0.02, z + 0.02),
    );
  };
  const shift = (list, dx, dy) => list.map((o) => ({ x0: o.x0 + dx, x1: o.x1 + dx, y0: o.y0 + dy, y1: o.y1 + dy }));

  for (let k = -N; k <= N; k++) {
    const ox = k * W;
    // lower stack (our apartment / the neighbours' apartments)
    const n0 = shift(north, ox, 0), s0 = shift(south, ox, 0);
    for (const [xa, xb, ya, yb] of complement(ox, ox + W, 0, roofTop, n0)) bricks.push(quadZ(xa, xb, ya, yb, -eps, true));
    for (const [xa, xb, ya, yb] of complement(ox, ox + W, 0, roofTop, s0)) bricks.push(quadZ(xa, xb, ya, yb, D + eps, false));
    if (k !== 0) {
      solids.push(boxGeo(ox + 0.001, ox + W - 0.001, 0, roofTop, 0, D));
      n0.forEach((o) => fakeWindow(o, -eps, true));
      s0.forEach((o) => fakeWindow(o, D + eps, false));
    }
    // upper unit, set back behind the loftgång
    const n1 = shift(north, ox, roofTop), s1 = shift(south, ox, roofTop);
    solids.push(boxGeo(ox + 0.001, ox + W - 0.001, roofTop, upperTop, loftD, D));
    for (const [xa, xb, ya, yb] of complement(ox, ox + W, roofTop, upperTop, n1)) bricks.push(quadZ(xa, xb, ya, yb, loftD - eps, true));
    for (const [xa, xb, ya, yb] of complement(ox, ox + W, roofTop, upperTop, s1)) bricks.push(quadZ(xa, xb, ya, yb, D + eps, false));
    n1.forEach((o) => fakeWindow(o, loftD - eps, true));
    s1.forEach((o) => fakeWindow(o, D + eps, false));
  }

  // gable ends of the row
  const xw = -N * W, xe = (N + 1) * W;
  bricks.push(quadX(0, D, 0, roofTop, xw - eps, true), quadX(0, D, 0, roofTop, xe + eps, false));
  bricks.push(quadX(loftD, D, roofTop, upperTop, xw - eps, true), quadX(loftD, D, roofTop, upperTop, xe + eps, false));

  // roof over the upper units + the loftgång deck edge
  roofs.push(boxGeo(xw - 0.1, xe + 0.1, upperTop, upperTop + 0.3, loftD - 0.1, D + 0.1));
  solids.push(boxGeo(xw, xe, roofTop - 0.25, roofTop, -0.05, loftD));

  // loftgång railing: top/bottom rail + balusters every 12 cm
  const rz = 0.04, rh = BUILDING.railHeight;
  rails.push(boxGeo(xw, xe, roofTop + rh - 0.04, roofTop + rh, rz - 0.03, rz + 0.03));
  rails.push(boxGeo(xw, xe, roofTop + 0.08, roofTop + 0.12, rz - 0.02, rz + 0.02));
  for (let x = xw + 0.06; x < xe; x += 0.12) rails.push(boxGeo(x - 0.01, x + 0.01, roofTop, roofTop + rh, rz - 0.01, rz + 0.01));

  // street/pavement in front of the entrances
  const street = new THREE.Mesh(boxGeo(xw - 20, xe + 20, -0.02, 0.0, -14, 0),
    new THREE.MeshStandardMaterial({ color: COLORS.street, roughness: 1 }));
  street.receiveShadow = true;
  group.add(street);

  const add = (geos, material, shadow = true) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(bricks, brickMat());
  add(solids, wall);
  add(frames, frame);
  add(glassGeo, new THREE.MeshStandardMaterial({ color: 0x33434d, roughness: 0.1, metalness: 0.4 }), false);
  add(rails, new THREE.MeshStandardMaterial({ color: COLORS.balcony, roughness: 0.5, metalness: 0.3 }));
  add(roofs, new THREE.MeshStandardMaterial({ color: 0x4b5157, roughness: 0.9 }));
  return group;
}
