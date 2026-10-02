import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HUS_L as H, COLORS, FENCE_HEIGHT, SEASON } from './config.js';
import { registerSnow } from './seasons.js';

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

const brickMat = () => new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95, side: THREE.DoubleSide });

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

/** Open brick drum (spiral stair tower) with world-space brick UVs. */
function drum(x, z, r, h) {
  const geo = new THREE.CylinderGeometry(r, r, h, 28, 1, true);
  geo.translate(x, h / 2, z);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / TILE_W, (uv.getY(i) * h) / TILE_H);
  return geo;
}

/**
 * Hus L around the apartment (see HUS_L in config):
 *  - våning 1–2: brick, a row of units like ours on both sides of the stair core with the portik;
 *    the other units get our façade openings as glass, and our patio/hedge/screen walls
 *  - våning 3–4: the stacked two-storey units, white render with brick pilasters, set back behind
 *    the loftgång (grey-green railing) on the north side; spiral stairs in brick drums at both ends
 *  - flat roof with solar panels
 */
export function buildExterior({ W, D, roofTop, north, south, frame, wall, site, mats }) {
  const group = new THREE.Group();
  const bricks = [], renders = [], glassGeo = [], frames = [], solids = [], rails = [], roofs = [], pilasters = [], panels = [];
  const patios = [], hedges = [], fences = [];
  const segments = []; // collision for the neighbours' screen walls and hedges (lawn side)
  const loftD = H.loftgangDepth;
  const upperTop = roofTop + H.upperStoreys * H.storeyHeight;
  const eps = 0.006;

  // unit origins along x: west row | core | east row (ours = 0)
  const coreX1 = -H.before * W, coreX0 = coreX1 - H.core.w;
  const units = [];
  for (let k = H.west; k >= 1; k--) units.push(coreX0 - k * W);
  for (let k = -H.before; k <= H.after; k++) units.push(k * W);
  const xw = coreX0 - H.west * W, xe = (H.after + 1) * W;

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
  const fakeWindowX = (o, x, west) => { // o: z0/z1/y0/y1 on a gable
    const s = west ? -1 : 1;
    glassGeo.push(quadX(o.z0, o.z1, o.y0, o.y1, x + s * 0.002, west));
    const f = 0.06;
    frames.push(
      boxGeo(x - 0.02, x + 0.02, o.y0, o.y0 + f, o.z0, o.z1), boxGeo(x - 0.02, x + 0.02, o.y1 - f, o.y1, o.z0, o.z1),
      boxGeo(x - 0.02, x + 0.02, o.y0, o.y1, o.z0, o.z0 + f), boxGeo(x - 0.02, x + 0.02, o.y0, o.y1, o.z1 - f, o.z1),
    );
  };
  const shift = (list, dx, dy) => list.map((o) => ({ x0: o.x0 + dx, x1: o.x1 + dx, y0: o.y0 + dy, y1: o.y1 + dy }));
  /** Façade quads around the holes into `out` (z plane), glass in the holes unless it is our unit. */
  const facade = (out, x0, x1, y0, y1, z, northSide, holes, glass = true) => {
    for (const [xa, xb, ya, yb] of complement(x0, x1, y0, y1, holes)) out.push(quadZ(xa, xb, ya, yb, z, northSide));
    if (glass) holes.forEach((o) => fakeWindow(o, z, northSide));
  };

  // våning 1–2 (L1008, the east end unit, has its own north façade: see HUS_L.endUnitNorthHidden)
  const endUnitX = H.after * W;
  const northOf = (ox) => (Math.abs(ox - endUnitX) < 1e-6
    ? north.filter((o) => !H.endUnitNorthHidden.some(([a, b]) => (o.x0 + o.x1) / 2 > a && (o.x0 + o.x1) / 2 < b))
    : north);
  for (const ox of units) {
    const ours = Math.abs(ox) < 1e-6;
    facade(bricks, ox, ox + W, 0, roofTop, -eps, true, shift(northOf(ox), ox, 0), !ours);
    facade(bricks, ox, ox + W, 0, roofTop, D + eps, false, shift(south, ox, 0), !ours);
    if (ours) continue;
    solids.push(boxGeo(ox + 0.001, ox + W - 0.001, 0, roofTop, 0, D));
    // the neighbours' patios: same slab, hedge and screen walls as ours
    if (site.patio) { // slab paving like ours: UVs in metres (x, z)
      const pg = boxGeo(ox + site.patio.x0, ox + site.patio.x1, -0.01, 0.0, D, site.patio.z1);
      const pp = pg.attributes.position, uv = pg.attributes.uv;
      for (let i = 0; i < pp.count; i++) uv.setXY(i, pp.getX(i), pp.getZ(i));
      patios.push(pg);
    }
    if (site.hedge) {
      const h = site.hedge;
      hedges.push(boxGeo(ox + h.x0, ox + h.x1, 0, 1.1, h.z0, h.z1));
      segments.push([ox + h.x0, h.z0, ox + h.x1, h.z0], [ox + h.x1, h.z0, ox + h.x1, h.z1],
        [ox + h.x1, h.z1, ox + h.x0, h.z1], [ox + h.x0, h.z1, ox + h.x0, h.z0]);
    }
    for (const f of site.fences ?? []) {
      fences.push(boxGeo(ox + f.a[0] - 0.025, ox + f.b[0] + 0.025, 0, FENCE_HEIGHT, Math.min(f.a[1], f.b[1]), Math.max(f.a[1], f.b[1])));
      segments.push([ox + f.a[0], f.a[1], ox + f.b[0], f.b[1]]);
    }
  }
  // stair core with the portik through the ground floor, a flat (L1101) on våning 2
  {
    const [p0, p1] = H.core.portik.map((p) => coreX0 + p), ph = H.core.portikHeight;
    const y2 = roofTop / 2;
    const win = (xa) => ({ x0: coreX0 + xa, x1: coreX0 + xa + 1.2, y0: y2 + 0.8, y1: y2 + 2.4 });
    const holes = [{ x0: p0, x1: p1, y0: 0, y1: ph }, win(1.0), win(6.4)];
    facade(bricks, coreX0, coreX1, 0, roofTop, -eps, true, holes, false);
    facade(bricks, coreX0, coreX1, 0, roofTop, D + eps, false, holes, false);
    [win(1.0), win(6.4)].forEach((o) => { fakeWindow(o, -eps, true); fakeWindow(o, D + eps, false); });
    solids.push(boxGeo(coreX0, p0, 0, roofTop, 0, D), boxGeo(p1, coreX1, 0, roofTop, 0, D), boxGeo(p0, p1, ph, roofTop, 0, D));
    bricks.push(quadX(0, D, 0, ph, p0 + eps, false), quadX(0, D, 0, ph, p1 - eps, true));
  }

  // våning 3–4: the upper units (L1201–L1209), one over each lower unit and one over the core
  const uppers = [...units.map((x0) => [x0, x0 + W]), [coreX0, coreX1]];
  for (const [x0, x1] of uppers) {
    facade(renders, x0, x1, roofTop, upperTop, loftD - eps, true, shift(north, x0, roofTop));
    facade(renders, x0, x1, roofTop, upperTop, D + eps, false, shift(south, x0, roofTop));
    solids.push(boxGeo(x0 + 0.001, x1 - 0.001, roofTop, upperTop, loftD, D));
  }
  const edges = [...new Set(uppers.flat().map((x) => +x.toFixed(3)))];
  const pw = H.pilaster / 2;
  for (const x of edges) {
    pilasters.push(boxGeo(x - pw, x + pw, roofTop, upperTop + 0.5, loftD - 0.1, loftD));
    pilasters.push(boxGeo(x - pw, x + pw, roofTop, upperTop + 0.5, D, D + 0.1));
  }

  // gable ends (L1008's east gable has windows)
  bricks.push(quadX(0, D, 0, roofTop, xw - eps, true));
  const sh = [0, roofTop / 2, roofTop, roofTop + H.storeyHeight];
  const gw = H.gableWindows.map((g) => ({ z0: g.z0, z1: g.z1, y0: sh[g.storey] + g.sill, y1: sh[g.storey] + g.head, storey: g.storey }));
  for (const [za, zb, ya, yb] of complement(0, D, 0, roofTop, gw.filter((g) => g.storey < 2).map((g) => ({ x0: g.z0, x1: g.z1, y0: g.y0, y1: g.y1 })))) {
    bricks.push(quadX(za, zb, ya, yb, xe + eps, false));
  }
  renders.push(quadX(loftD, D, roofTop, upperTop, xw - eps, true));
  for (const [za, zb, ya, yb] of complement(loftD, D, roofTop, upperTop, gw.filter((g) => g.storey >= 2).map((g) => ({ x0: g.z0, x1: g.z1, y0: g.y0, y1: g.y1 })))) {
    renders.push(quadX(za, zb, ya, yb, xe + eps, false));
  }
  gw.forEach((g) => fakeWindowX(g, xe + eps, false));

  // flat roof with a parapet, solar panels
  roofs.push(boxGeo(xw - 0.1, xe + 0.1, upperTop, upperTop + 0.3, loftD - 0.1, D + 0.1));
  for (const [xa, xb] of H.solar.x) for (const [za, zb] of H.solar.z) panels.push(boxGeo(xa, xb, upperTop + 0.35, upperTop + 0.42, za, zb));

  // loftgång deck from the west drum to the east end, plus the landing to the east drum
  const towers = H.towers.map((t) => (t.gable === 'west' ? { ...t, x: xw - t.r } : t)); // right against the gable (#172)
  const [tw, te] = towers;
  const deckX0 = tw.x + tw.r * 0.8;
  solids.push(boxGeo(deckX0, xe, roofTop - 0.25, roofTop, -0.05, loftD));
  solids.push(boxGeo(te.x - 1.2, te.x + 1.2, roofTop - 0.25, roofTop, te.z + te.r * 0.7, 0));
  for (const t of towers) {
    bricks.push(drum(t.x, t.z, t.r, roofTop + H.railHeight));
    for (let i = 0; i < 16; i++) { // collision: a 16-gon round the drum
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      segments.push([t.x + t.r * Math.cos(a0), t.z + t.r * Math.sin(a0), t.x + t.r * Math.cos(a1), t.z + t.r * Math.sin(a1)]);
    }
  }

  // loftgång railing: top/bottom rail + balusters every 12 cm (gap at the east drum's landing)
  const rz = 0.04, rh = H.railHeight;
  for (const [ra, rb] of [[deckX0, te.x - 1.2], [te.x + 1.2, xe]]) {
    rails.push(boxGeo(ra, rb, roofTop + rh - 0.04, roofTop + rh, rz - 0.03, rz + 0.03));
    rails.push(boxGeo(ra, rb, roofTop + 0.08, roofTop + 0.12, rz - 0.02, rz + 0.02));
    for (let x = ra + 0.06; x < rb; x += 0.12) rails.push(boxGeo(x - 0.01, x + 0.01, roofTop, roofTop + rh, rz - 0.01, rz + 0.01));
  }

  const add = (geos, material, shadow = true) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(bricks, brickMat());
  add(renders, new THREE.MeshStandardMaterial({ color: H.render, roughness: 0.95 }));
  add(pilasters, new THREE.MeshStandardMaterial({ color: COLORS.brick, roughness: 0.95 }));
  add(solids, wall);
  add(frames, frame);
  add(glassGeo, new THREE.MeshStandardMaterial({ color: 0x33434d, roughness: 0.1, metalness: 0.4 }), false);
  add(rails, new THREE.MeshStandardMaterial({ color: COLORS.balcony, roughness: 0.5, metalness: 0.3 }));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4b5157, roughness: 0.9 });
  registerSnow(roofMat, SEASON.snow.roof);
  add(roofs, roofMat);
  add(panels, new THREE.MeshStandardMaterial({ color: COLORS.solar, roughness: 0.3, metalness: 0.5 }), false);
  add(patios, mats.patio, false);
  add(hedges, mats.hedge);
  add(fences, mats.fence);
  group.userData.segments = segments;
  return group;
}
