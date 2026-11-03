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

/** Build the gym from a rectangular outline `p`; returns `eave`, `windows` and `roofY(x, z)`.
 * #1788: The glass corner is turned to the road (x0, z1), wrapping the west face x0 and south face z1.
 * The low brick part sits at the far ENE end (x1, z1). Also builds Grenhuset across Sankt Lars väg. */
export function buildNordicGym(b, p, base, bottom, parts) {
  const M = b.model, ex = p[1][0] - p[0][0], ez = p[1][1] - p[0][1], el = Math.hypot(ex, ez), ux = ex / el, uz = ez / el;
  const ox = p.reduce((s, q) => s + q[0], 0) / p.length, oz = p.reduce((s, q) => s + q[1], 0) / p.length; // pivot: the outline's centre
  const toLocal = (x, z) => [(x - ox) * ux + (z - oz) * uz, -(x - ox) * uz + (z - oz) * ux];
  const toWorld = (x, z) => [ox + x * ux - z * uz, oz + x * uz + z * ux];
  const L = p.map(q => toLocal(q[0], q[1])), xs = L.map(q => q[0]), zs = L.map(q => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const local = { facade: [], roof: [], glass: [] }; // built in the local frame, then turned and moved into `parts`
  const eave = base + b.levels * M.storey, lowEave = base + M.lowHeight, cx = (x0 + x1) / 2;
  const lowX0 = x1 - M.low.w, lowZ0 = z1 - M.low.d; // #1788: low part at the far east end (x1, z1)
  const inLow = (x, z) => x > lowX0 && z > lowZ0;

  // Brick: the tall block as two boxes around the low corner, the low part, a plinth band; roofs as thin slabs.
  box(x1 - x0, eave - bottom, lowZ0 - z0, cx, bottom, (z0 + lowZ0) / 2, M.brick, local.facade);
  box(lowX0 - x0, eave - bottom, z1 - lowZ0, (x0 + lowX0) / 2, bottom, (lowZ0 + z1) / 2, M.brick, local.facade);
  box(M.low.w, lowEave - bottom, M.low.d, (lowX0 + x1) / 2, bottom, (lowZ0 + z1) / 2, M.brickLow, local.facade);
  const slab = (xa, xb, za, zb, y) => box(xb - xa, M.roofThick, zb - za, (xa + xb) / 2, y, (za + zb) / 2, M.roof, local.roof);
  slab(x0, x1, z0, lowZ0, eave); slab(x0, lowX0, lowZ0, z1, eave); slab(lowX0, x1, lowZ0, z1, lowEave);
  for (const g of local.roof.slice(-3)) g.deleteAttribute('color'); // the roof batch has no vertex colours (one uniform roof colour)

  // Solar panels: dark-blue rows over the tall roof, a walkway margin round the edge and one gap for a rooftop unit.
  const top = eave + M.roofThick, ph = M.panelHeight, m = M.panelMargin;
  for (let z = z0 + m; z + M.panelRow <= z1 - m + 1e-6; z += M.panelRow + M.panelGap) {
    const from = x0 + m, to = z + M.panelRow > lowZ0 ? lowX0 - m : x1 - M.panelEastInset;
    if (to > from) box(to - from, ph, M.panelRow, (from + to) / 2, top, z + M.panelRow / 2, M.panel, local.glass);
  }
  const [unitX, unitZ] = toLocal(M.unit.x, M.unit.z); // plan coordinates, so the unit moves with the record
  box(M.unit.w, M.unit.h, M.unit.d, unitX, top, unitZ, M.unitColor, local.glass);

  // #1788 Glass corner: facing Sankt Lars väg at (x0, z1), wrapping the west (road) and south (park) faces over every storey.
  const gw = M.glass.east, gs = M.glass.south, gb = base + M.glass.sill, gt = eave - M.glass.head;
  const mull = (x, z, hx, hz) => box(hx, gt - gb + .3, hz, x, gb - .15, z, M.mullion, local.glass);
  box(.1, gt - gb, gw, x0 - .06, gb, z1 - gw / 2, M.glassColor, local.glass);
  box(gs, gt - gb, .1, x0 + gs / 2, gb, z1 + .06, M.glassColor, local.glass);
  for (let k = 0; k <= Math.round(gw / M.glass.bay); k++) mull(x0 - .09, z1 - k * gw / Math.round(gw / M.glass.bay), .08, .12);
  for (let k = 0; k <= Math.round(gs / M.glass.bay); k++) mull(x0 + k * gs / Math.round(gs / M.glass.bay), z1 + .09, .12, .08);
  for (let f = 1; f < b.levels; f++) {
    const y = base + f * M.storey - .12;
    box(.14, .24, gw, x0 - .09, y, z1 - gw / 2, M.mullion, local.glass);
    box(gs, .24, .14, x0 + gs / 2, y, z1 + .09, M.mullion, local.glass);
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
  for (let f = 0; f < b.levels; f++) {
    const y = base + f * M.storey + M.window.sill + M.window.h / 2;
    // South face (z1): glass covers x0 to x0 + gs; low part at lowX0..x1 (floor 0 only)
    for (let x = x0 + gs + 2.5; x < x1 - 2.5; x += M.window.bay) {
      if (f === 0 || x < lowX0 - 1) pane(x, y, z1, M.window.w, M.window.h, 0, 1);
    }
    // North face (z0): along Skånevägen
    for (let x = x0 + 3; x < x1 - 2.5; x += M.window.bay) {
      pane(x, y, z0, M.window.w, M.window.h, 0, -1);
    }
    // The photo-read road front has its own seven-bay rhythm below (#1822).
    // East end far from road (x1): low part is on floor 0 at lowZ0..z1
    for (let z = z0 + 3; z < z1 - 2.5; z += M.window.bay) {
      if (f > 0 || z < lowZ0 - 1) pane(x1, y, z, M.window.w, M.window.h, 1, 0);
    }
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
      return inLow(x, z) ? lowEave + M.roofThick : eave + M.roofThick;
    }
    if (inGrenhuset(wx, wz)) {
      return 16.5; // Grenhuset roof (eave 16.2 + 0.3)
    }
    return -Infinity;
  };

  return { base, eave, ridge: eave + M.roofThick, windows, roofY, nordicGym: { x0, x1, z0, z1, lowX0, lowZ0, centre: [ox, oz], axis: [ux, uz] } };
}
