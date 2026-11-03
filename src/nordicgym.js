import { nordicFrame, nordicParking } from './nordicground.js';
import { skirtTop } from './edgebackdrop.js';
import * as THREE from 'three';

// #1745: Nordic Wellness S:t Lars Sportcenter; placed by #1756, moved and enlarged by #1762, turned and completed by #1788.
// The outline is the fitted rectangle of OSM way 1136415461 (68.8 x 36.7 m, docs/references/surrounding-views/
// nordic-wellness-osm-check-2026-10-31.json) east of Sankt Lars väg, as in the user's two Google 3D views
// (docs/nordic-wellness-st-lars-maps-mot-norr.jpg / -mot-soder.jpg).
// #1788 (user report eb39f76b): the gym is turned so its glass facade and corner face Sankt Lars väg (the short WSW face
// at x0 and wrapping the south face z1), with the lower brick part at the far ENE end (x1, z1).
// #1788 also adds the missing building volume on the other side of Sankt Lars väg: "Grenhuset" (Internationella Engelska Skolan Lund,
// OSM way 88457557, Sankt Lars väg 90), a 3-storey brick campus volume opposite the gym.
// Everything goes into the east backdrop's existing facade / roof / glass batches (vertex colours): no extra draw call, texture or light.
const rgb = (hex) => new THREE.Color(hex);
const box = (w, h, d, x, y, z, hex, list) => { // a vertex-coloured box centred on (x, z), its underside at y
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z).toNonIndexed();
  g.deleteAttribute('uv');
  const c = rgb(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  list.push(g); return g;
};

// OSM way 88457557 "Grenhuset" (Internationella Engelska Skolan Lund, Sankt Lars väg 90), directly west of Sankt Lars väg opposite the gym.
const GRENHUSET_POLY = [
  [-163.07,-230.21],[-148.03,-216.4],[-152.81,-211.19],[-157.85,-215.82],
  [-185.43,-185.79],[-180.89,-181.62],[-186.22,-175.83],[-201.27,-189.64],
  [-186.58,-205.63],[-197.95,-216.07],[-224.09,-187.62],[-221.49,-185.23],
  [-237.08,-168.24],[-245.96,-176.4],[-232.72,-190.8],[-237.42,-195.11],
  [-208.55,-226.53],[-235.18,-251],[-226.28,-260.68],[-214.59,-249.94],
  [-199.74,-236.31],[-188.41,-248.64],[-176.46,-261.66],[-165.49,-251.59],
  [-189.13,-225.84],[-177.18,-214.86],[-163.07,-230.21]
];

function inGrenhuset(x, z) {
  const p = GRENHUSET_POLY;
  let yes = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes;
  }
  return yes;
}

function buildGrenhuset(parts, brickHex, roofHex, windowHex) {
  const gBase = 5.4, gBottom = 4.8, gLevels = 3, gStorey = 3.6;
  const gEave = gBase + gLevels * gStorey; // 16.2 m
  const pts = GRENHUSET_POLY.slice(0, -1);
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));

  // Facade body: extruded 3-storey volume with plinth
  const body = new THREE.ExtrudeGeometry(shape, { depth: gEave - gBottom, bevelEnabled: false, steps: 1 });
  body.rotateX(-Math.PI / 2).translate(0, gBottom, 0);
  const bodyGeo = body.index ? body.toNonIndexed() : body;
  bodyGeo.deleteAttribute('uv');
  const n = bodyGeo.attributes.position.count, col = new Float32Array(n * 3);
  const cb = rgb(brickHex), cp = rgb(0x8a847d);
  for (let i = 0; i < n; i++) {
    const y = bodyGeo.attributes.position.getY(i);
    const c = y < gBase - 0.05 ? cp : cb;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.facade.push(bodyGeo);

  // Roof slab
  const roof = new THREE.ShapeGeometry(shape);
  roof.rotateX(-Math.PI / 2).translate(0, gEave, 0);
  const roofGeo = roof.index ? roof.toNonIndexed() : roof;
  roofGeo.deleteAttribute('uv');
  roofGeo.deleteAttribute('color'); // roof batch has no vertex color
  parts.roof.push(roofGeo);

  // Windows on the wings facing Sankt Lars väg
  const pane = (x, y, z, w, h, nx, nz) => {
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz)).translate(x + nx * .04, y, z + nz * .04).toNonIndexed();
    g.deleteAttribute('uv'); const c = rgb(windowHex), count = g.attributes.position.count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.glass.push(g);
  };
  // Window rows along the east gables and faces facing the road and park
  const facades = [
    { p0: [-163.07, -230.21], p1: [-148.03, -216.4] }, // east wing south-east face
    { p0: [-148.03, -216.4], p1: [-152.81, -211.19] }, // east wing end facing road
    { p0: [-165.49, -251.59], p1: [-189.13, -225.84] }, // north-east face facing road curve
    { p0: [-177.18, -214.86], p1: [-163.07, -230.21] }, // east wing south-west face
  ];
  for (const fac of facades) {
    const dx = fac.p1[0] - fac.p0[0], dz = fac.p1[1] - fac.p0[1], len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len, nx = uz, nz = -ux; // outward normal
    const bay = 3.6, margin = 2.0;
    for (let f = 0; f < gLevels; f++) {
      const y = gBase + f * gStorey + 1.2 + 0.8;
      for (let s = margin; s <= len - margin; s += bay) {
        pane(fac.p0[0] + s * ux, y, fac.p0[1] + s * uz, 1.8, 1.6, nx, nz);
      }
    }
  }
}

/** Build the photo-read brick front/green hall from OSM outline `p`, with the glazed road corner at (x0, z1).
 * Returns `eave`, actual `windows` and uniform flat `roofY(x, z)`. Also builds Grenhuset across Sankt Lars väg. */
export function buildNordicGym(b, p, base, bottom, parts, ground = () => base) {
  const M=b.model,frame=nordicFrame(p),{ux,uz,ox,oz,toLocal,toWorld,x0,x1,z0,z1}=frame;
  const H=M.hall,parking=nordicParking(frame,H,ground,skirtTop),terrain=parking.terrain;
  const local = { facade: [], roof: [], glass: [] }; // built in the local frame, then turned and moved into `parts`
  const eave = base + b.levels * M.storey, hallStart = x0 + H.frontDepth;
  const lowX0 = x1 - M.low.w, lowZ0 = z1 - M.low.d; // historical outline metadata; the photo has no low rear corner
  const entranceDepth = M.glass.east;

  // #1824: a short brick front and a full-height metal hall. The circulation corner stays
  // clear for #1823's glazed entrance/stair: x0..hallStart, z1-6..z1 (photo-read guesses).
  box(H.frontDepth, eave - bottom, z1 - z0 - entranceDepth, (x0 + hallStart) / 2, bottom, (z0 + z1 - entranceDepth) / 2, M.brick, local.facade);
  // Contact repair/model assumption, not a measured cellar depth: extend only the existing grey plinth down to the drawn ground.
  const foundationBottom=Math.min(bottom,parking.minimum(hallStart,x1,z0,z1));
  box(x1 - hallStart, H.plinthH + base - foundationBottom, z1 - z0, (hallStart + x1) / 2, foundationBottom, (z0 + z1) / 2, H.concrete, local.glass);
  box(x1 - hallStart, eave - base - H.plinthH, z1 - z0, (hallStart + x1) / 2, base + H.plinthH, (z0 + z1) / 2, H.baseColor, local.glass);
  box(x1 - x0, M.roofThick, z1 - z0, (x0 + x1) / 2, eave, (z0 + z1) / 2, M.roof, local.roof);
  local.roof.at(-1).deleteAttribute('color');

  const facePlane = (x, y, z, w, h, nx, nz, hex, list = local.glass) => {
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz)).translate(x, y, z).toNonIndexed();
    g.deleteAttribute('uv'); const c = rgb(hex), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); list.push(g); return g;
  };
  // One quad per vertical panel; narrow gaps expose the darker backing. Staggered seams and
  // shallow offsets distinguish the three horizontal bands without extra seam boxes/textures.
  const panelBottom = base + H.plinthH, bandH = (eave - panelBottom) / H.bands;
  const panelFaces = [
    { a: hallStart, b: x1, nx: 0, nz: -1, fixed: z0 },
    { a: hallStart, b: x1, nx: 0, nz: 1, fixed: z1 },
    { a: z0, b: z1, nx: 1, nz: 0, fixed: x1 },
  ];
  for (let band = 0; band < H.bands; band++) for (const side of panelFaces) {
    const off = (H.bands - band) * H.bandOffset, y = panelBottom + (band + .5) * bandH;
    for (let a = side.a - band * H.bandShift; a < side.b; a += H.bay) {
      const lo = Math.max(side.a, a) + H.seam / 2, hi = Math.min(side.b, a + H.bay) - H.seam / 2;
      if (hi <= lo) continue;
      const along = (lo + hi) / 2;
      facePlane(side.nx ? side.fixed + off : along, y, side.nz ? side.fixed + side.nz * off : along,
        hi - lo, bandH - H.seam, side.nx, side.nz, H.panelColors[band]);
    }
  }

  // Solar panels: dark-blue rows over the tall roof, a walkway margin round the edge and one gap for a rooftop unit.
  const top = eave + M.roofThick, ph = M.panelHeight, m = M.panelMargin;
  for (let z = z0 + m; z + M.panelRow <= z1 - m + 1e-6; z += M.panelRow + M.panelGap) {
    const from = x0 + m, to = x1 - M.panelEastInset;
    if (to > from) box(to - from, ph, M.panelRow, (from + to) / 2, top, z + M.panelRow / 2, M.panel, local.glass);
  }
  const [unitX, unitZ] = toLocal(M.unit.x, M.unit.z); // plan coordinates, so the unit moves with the record
  box(M.unit.w, M.unit.h, M.unit.d, unitX, top, unitZ, M.unitColor, local.glass);

  // #1823: photo-read green entrance cage, not a glass wrap over half of the hall.
  // Opaque blue reflection backplanes sit behind a shallow stair scene and the front profiles: a backdrop
  // approximation of reflective glazing without a transparent material, extra mesh, texture or light.
  const G = M.glass, gw = G.east, gs = G.south, gb = base + G.sill, gt = eave - G.head;
  const rect = (axis, a, y, w, h, at, color) => {
    const geo = new THREE.PlaneGeometry(w, h).rotateY(axis === 'road' ? -Math.PI / 2 : 0)
      .translate(axis === 'road' ? at : a, y, axis === 'road' ? a : at).toNonIndexed();
    geo.deleteAttribute('uv'); const c = rgb(color), colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); local.glass.push(geo); return geo;
  };
  const beam = (a, b, width, color) => {
    const v = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), length = v.length();
    const geo = box(width, length, width, 0, -length / 2, 0, color, local.glass);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()))
      .translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  };
  for (const [axis, start, span, face, back] of [
    ['road', z1 - gw, gw, x0 - G.offset, x0 + G.recess],
    ['side', x0, gs, z1 + G.offset, z1 - G.recess]
  ]) {
    const bays = Math.round(span / G.bay), bay = span / bays, h = gt - gb;
    // Different sky tones and broad upper reflection bands make the glazing blue, while leaving the stair readable.
    for (let k = 0; k < bays; k++) {
      const a = start + (k + .5) * bay;
      rect(axis, a, (gb + gt) / 2, bay, h, back, k % 2 ? G.backColor : G.skyColor);
      rect(axis, a, gb + h * .79, bay, h * .18, back + (axis === 'road' ? -G.offset : G.offset), G.reflectionColor);
    }
    for (let k = 0; k <= bays; k++) rect(axis, start + k * bay, (gb + gt) / 2, G.frame, h + G.frame, face, G.frameColor);
    for (const y of [gb, base + M.storey, base + M.storey * 2, gt]) rect(axis, start + span / 2, y, span + G.frame, G.frame, face, G.frameColor);
    // Small top-hung opening lights, alternating bays as in the side photograph.
    for (let k = 1; k < bays; k += 2) {
      const a = start + (k + .5) * bay, y = gt - G.openH / 2;
      rect(axis, a, y, bay - G.frame * 2, G.openH, face, G.openColor);
      rect(axis, a, y - G.openH / 2, bay - G.frame * 2, G.frame, face + (axis === 'road' ? -G.offset : G.offset), G.frameColor);
    }
  }
  // Two stacked flights behind the side glazing, plus their visible return along the road face.
  // Flat treads over one sloping stringer are sufficient at backdrop distance; no invisible stair boxes.
  for (const axis of ['side', 'road']) for (let f = 0; f < b.levels - 1; f++) {
    const run = axis === 'side' ? gs - G.stair.margin * 2 : gw - G.stair.margin * 2;
    const at = t => {
      const a = (f % 2 ? 1 - t : t) * run + G.stair.margin;
      return axis === 'side' ? [x0 + a, base + f * M.storey + t * M.storey, z1 - G.stair.inset]
        : [x0 + G.stair.inset, base + f * M.storey + t * M.storey, z1 - a];
    };
    beam(at(0), at(1), G.stair.stringer, G.stairColor);
    for (let k = 1; k <= G.stair.steps; k++) {
      const t = k / G.stair.steps, p = at(t), step = run / G.stair.steps;
      const geo = new THREE.PlaneGeometry(axis === 'side' ? step : G.stair.width, axis === 'side' ? G.stair.width : step)
        .rotateX(-Math.PI / 2).translate(p[0], p[1], p[2]).toNonIndexed();
      geo.deleteAttribute('uv'); const c = rgb(G.stairColor), colors = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); local.glass.push(geo);
    }
    const rail = t => { const p = at(t); p[1] += G.stair.railH; if (axis === 'side') p[2] += G.stair.width / 2; else p[0] -= G.stair.width / 2; return p; };
    beam(rail(0), rail(1), G.stair.rail, G.frameColor);
    for (const t of [0, .5, 1]) { const p = rail(t), q = [...p]; q[1] -= G.stair.railH; beam(q, p, G.stair.rail, G.frameColor); }
  }
  // Warm globes hang inside the profiles; they are coloured meshes, never actual lights.
  for (let i = 0; i < G.globes.length; i++) {
    const [along, height] = G.globes[i], x = x0 + G.stair.inset, z = z1 - along, y = base + height;
    beam([x, gt, z], [x, y, z], G.cord, G.frameColor);
    const globe = new THREE.SphereGeometry(G.globeR, 8, 4).translate(x, y, z).toNonIndexed();
    globe.deleteAttribute('uv'); const c = rgb(G.globeColor), colors = new Float32Array(globe.attributes.position.count * 3);
    for (let k = 0; k < colors.length; k += 3) { colors[k] = c.r; colors[k + 1] = c.g; colors[k + 2] = c.b; }
    globe.setAttribute('color', new THREE.BufferAttribute(colors, 3)); local.glass.push(globe);
  }
  // Road-facing decorative door. Narrow dark seals make the leaf legible within the green grid.
  const dz = z1 - G.door.along, dy = base + G.door.h / 2, dx = x0 - G.offset * 2;
  rect('road', dz, dy, G.door.w, G.door.h, dx, G.doorColor);
  for (const z of [dz - G.door.w / 2, dz + G.door.w / 2]) rect('road', z, dy, G.frame, G.door.h, dx - G.offset, G.frameColor);
  rect('road', dz, base + G.door.h, G.door.w, G.frame, dx - G.offset, G.frameColor);
  rect('road', dz, base + G.door.railY, G.door.w, G.frame, dx - G.offset, G.frameColor);
  box(G.door.handleOut, G.door.handleH, G.door.handleW, dx - G.door.handleOut / 2, base + G.door.handleY, dz + G.door.w * .3, G.rackColor, local.glass);
  box(G.door.canopy, G.frame, G.door.w + G.frame * 2, x0 - G.door.canopy / 2, base + G.door.h + G.frame, dz, G.frameColor, local.glass);
  // Small paved entry pad and two hoop cycle stands beside the circulation bay (same existing opaque batch).
  box(G.pad.depth, G.pad.thick, gw + G.pad.extra, x0 - G.pad.depth / 2, base - G.pad.thick, z1 - gw / 2, G.pavingColor, local.glass);
  for (let i = 0; i < G.rack.count; i++) {
    const x = x0 + G.stair.margin + i * G.rack.spacing, z = z1 + G.rack.offset;
    for (const sx of [-1, 1]) box(G.rack.bar, G.rack.h, G.rack.bar, x + sx * G.rack.w / 2, base, z, G.rackColor, local.glass);
    box(G.rack.w, G.rack.bar, G.rack.bar, x, base + G.rack.h, z, G.rackColor, local.glass);
  }

  // Window bays on the brick faces (flat dark panes, one row per storey); the glass corner and the low part have their own.
  const windows = [];
  const pane = (x, y, z, w, h, nx, nz, hex = M.windowColor, frontFloor = null) => {
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz)).translate(x + nx * .03, y, z + nz * .03).toNonIndexed();
    g.deleteAttribute('uv'); const c = rgb(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); local.glass.push(g);
    windows.push({ x: x + nx * .03, y, z: z + nz * .03, n: [nx, nz], width: w, height: h, ...(frontFloor === null ? {} : { frontFloor }) });
  };
  // #1824: the hall has one dark row in its middle side band, rather than generic brick windows on every floor.
  const hallWindowY = panelBottom + H.windowBand * bandH + H.windowSill + H.windowH / 2;
  for (let k = 0; k < H.windowCount; k++) {
    const x = hallStart + H.windowStart + k * H.windowBay;
    pane(x, hallWindowY, z1 + H.bands * H.bandOffset + H.windowFaceGap, H.windowW, H.windowH, 0, 1, H.windowColor);
  }
  facePlane(hallStart + H.loadingOffset, base + H.loadingSill + H.loadingH / 2, z1 + H.loadingFaceOffset, H.loadingW, H.loadingH, 0, 1, H.windowColor);

  // Rear parking: sampled at the actual rendered ground, in the existing untextured batch.
  // Cars are omitted to keep this delivery in the existing backdrop batches, without additional vehicle setup.
  const surface = (xa,xb,za,zb,hex,lift=H.parkingLift) => {
    const vertices=parking.triangles(xa,xb,za,zb,lift);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.computeVertexNormals();
    const c = rgb(hex), colors = new Float32Array(vertices.length);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); local.glass.push(g);
  };
  const parkX0 = x1 + H.parkingInset, parkX1 = parkX0 + H.parkingDepth, parkZ0 = z0 + H.parkingInset, parkZ1 = z1 - H.parkingInset;
  surface(parkX0, parkX1, parkZ0, parkZ1, H.asphalt);
  // Asphalt and paint share the actual north-skirt triangles, including every crease.
  for(let k=0;k<=H.stalls;k++){const z=parkZ0+k*H.stallW;surface(parkX0,parkX0+H.stallD,z,z+H.lineW,H.line,H.lineLift);}
  // Low planted islands at the row ends, simple leaves in the same batch, with no extra tree draws.
  for (const z of [parkZ0 - H.plantR, parkZ1 + H.plantR]) {
    const x = parkX0 + H.stallD / 2, y = terrain(...toWorld(x, z));
    const planter=box(H.stallD,H.planterH,H.plantR*2,x,y,z,H.concrete,local.glass),position=planter.attributes.position;
    for(let i=0;i<position.count;i++){const py=position.getY(i)>y+H.planterH/2?H.planterH:0;position.setY(i,terrain(...toWorld(position.getX(i),position.getZ(i)))+py);}planter.computeVertexNormals();
    const crown = new THREE.IcosahedronGeometry(H.plantR, 0).scale(...H.plantScale).translate(x, y + H.plantR * H.plantScale[1], z);
    crown.deleteAttribute('uv'); const c = rgb(H.plantColor), colors = new Float32Array(crown.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    crown.setAttribute('color', new THREE.BufferAttribute(colors, 3)); local.glass.push(crown);
  }
  // Narrow steel escape stair at the rear gable. Open treads and three long rail segments keep its cost bounded.
  const stairX = x1 + H.stairXOffset, stairZ = z1 - H.parkingInset - H.stairRun, stairBase = terrain(...toWorld(stairX, stairZ));
  for (let k = 1; k <= H.stairSteps; k++) {
    box(H.stairW, H.treadThick, H.stairRun / H.stairSteps, stairX, stairBase + k / H.stairSteps * H.stairH,
      stairZ + k / H.stairSteps * H.stairRun, H.steel, local.glass);
  }
  box(H.stairW, H.landingThick, H.landingD, stairX, stairBase + H.stairH, stairZ + H.stairRun + H.landingD / 2, H.steel, local.glass);
  for (const sign of [-1, 1]) {
    const x = stairX + sign * H.stairW / 2;
    for(const t of [0,.5,1]){const baseY=t?stairBase+t*H.stairH:terrain(...toWorld(x,stairZ));box(H.railSize,H.railH+stairBase+t*H.stairH-baseY,H.railSize,x,baseY,stairZ+t*H.stairRun,H.steel,local.glass);}
    const g = box(H.railSize, H.railSize, Math.hypot(H.stairRun, H.stairH), 0, -H.railSize / 2, 0, H.steel, []);
    g.rotateX(-Math.atan2(H.stairH, H.stairRun)).translate(x, stairBase + H.stairH / 2 + H.railH, stairZ + H.stairRun / 2); local.glass.push(g);
  }

  // #1822: the short road face is predominantly brick, with a narrow entrance strip on its right.
  // The photograph gives the count and proportions; the dimensions in M.front remain guesses.
  const F = M.front, frontEnd = z1 - gw, frontSpan = frontEnd - z0;
  box(.008, eave - bottom, frontSpan, x0 - .004, bottom, (z0 + frontEnd) / 2, F.brick, local.facade);
  box(.07, F.roofTrimH, frontSpan, x0 - .045, eave - F.roofTrimH, (z0 + frontEnd) / 2, F.frameColor, local.glass);
  for (let f = 0; f < b.levels; f++) for (let k = 0; k < F.count; k++) {
    const z = z0 + F.margin + k * (frontSpan - F.margin * 2) / (F.count - 1);
    const h = f ? F.upperH : F.groundH, w = f ? F.upperW : F.groundW;
    const sill = f ? F.upperSill : F.groundSill, y = base + f * M.storey + sill + h / 2;
    // A shallow dark frame and a warm lower pane share the existing glass batch.
    box(.035, h + F.frame * 2, w + F.frame * 2, x0 - .018, y - h / 2 - F.frame, z, F.frameColor, local.glass);
    pane(x0 - .025, y, z, w, h, -1, 0, f ? F.paneColor : F.litColor, f);
    if (!f) {
      // Window bars and a bright ceiling strip read as an occupied gym without a copied interior texture.
      box(.025, h, F.frame * .45, x0 - .065, y - h / 2, z, F.frameColor, local.glass);
      box(.025, F.frame * .5, w * .75, x0 - .065, y + h * .37, z, F.lightColor, local.glass);
    }
  }
  // Seven small wall lamps, offset beside the windows as in the photo. Their soft wall washes
  // use a radial vertex fall-off (groundglow's principle) baked into brick colours: no light/material/texture.
  for (let k = 0; k < F.count; k++) {
    const z = z0 + F.margin + k * (frontSpan - F.margin * 2) / (F.count - 1) + F.groundW * .65;
    const top = base + F.groundSill + F.groundH + F.frame * 1.5;
    box(.15, .11, F.lampW, x0 - .09, top, z, F.frameColor, local.glass);
    const centerY = top - F.washH * .43, verts = [], colors = [], brick = rgb(F.brick), glow = rgb(F.lightColor);
    const vertex = (r, a) => {
      verts.push(x0 - .015, centerY + Math.cos(a) * F.washH / 2 * r, z + Math.sin(a) * F.washW / 2 * r);
      const c = brick.clone().lerp(glow, (1 - r) ** 1.5 * .82); colors.push(c.r, c.g, c.b);
    };
    const rings = 3, segments = 12;
    for (let r = 0; r < rings; r++) for (let j = 0; j < segments; j++) {
      const r0 = r / rings, r1 = (r + 1) / rings, a0 = j / segments * Math.PI * 2, a1 = (j + 1) / segments * Math.PI * 2;
      vertex(r0, a0); vertex(r1, a1); vertex(r1, a0);
      if (r) { vertex(r0, a0); vertex(r0, a1); vertex(r1, a1); }
    }
    const wash = new THREE.BufferGeometry(); wash.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    wash.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); wash.computeVertexNormals(); local.facade.push(wash);
  }

  // Two small photo-read tree silhouettes share the glass batch too. Using the global tree
  // instances here would activate two otherwise-culled trunk/foliage draws at this remote road.
  for (const fraction of F.treeFractions) {
    const x = x0 - F.treeOffset, z = z0 + frontSpan * fraction;
    box(.12, F.treeH * .72, .12, x, base, z, F.treeBark, local.glass);
    const crown = new THREE.IcosahedronGeometry(F.treeR, 0).scale(1, 1.45, 1).translate(x, base + F.treeH - F.treeR * 1.45, z);
    crown.deleteAttribute('uv'); const c = rgb(F.treeLeaf), colors = new Float32Array(crown.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    crown.setAttribute('color', new THREE.BufferAttribute(colors, 3)); local.glass.push(crown);
  }

  const yaw = Math.atan2(-uz, ux); // three's rotateY(yaw) takes local +x to (ux, uz) and local +z to (-uz, ux)
  for (const k of ['facade', 'roof', 'glass']) for (const g of local[k]) { g.rotateY(yaw).translate(ox, 0, oz); parts[k].push(g); }
  for (const w of windows) { [w.x, w.z] = toWorld(w.x, w.z); w.n = [w.n[0] * ux - w.n[1] * uz, w.n[0] * uz + w.n[1] * ux]; }

  // #1788 Build Grenhuset on the west side of Sankt Lars väg
  buildGrenhuset(parts, M.brick, M.roof, M.windowColor);

  const roofY = (wx, wz) => {
    const [x, z] = toLocal(wx, wz);
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
      return eave + M.roofThick;
    }
    if (inGrenhuset(wx, wz)) {
      return 16.5; // Grenhuset roof (eave 16.2 + 0.3)
    }
    return -Infinity;
  };

  return { base, eave, ridge: eave + M.roofThick, windows, roofY, nordicGym: { x0, x1, z0, z1, lowX0, lowZ0, hallStart, centre: [ox, oz], axis: [ux, uz] } };
}
