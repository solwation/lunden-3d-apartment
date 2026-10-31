import * as THREE from 'three';

// #1745: Nordic Wellness S:t Lars Sportcenter, east of Sankt Lars väg opposite the old hospital block (IES). Its footprint is the bounding
// box of OSM way 88457612 (stale NTI-gymnasiet tag, docs/references/surrounding-views/nordic-wellness-osm-check-2026-10-31.json); the
// heights and every metre in the SITE.east record's `model` are *guess*es read from the user's two Google 3D views
// (docs/nordic-wellness-st-lars-maps-mot-norr.jpg / -mot-soder.jpg): a big three-storey brick box with a flat roof almost covered by
// solar panels, a glass corner (SE) towards the road and the junction, and a lower brick part in the south-west.
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

/** Build the gym from a rectangular outline `p` (x0..x1, z0..z1, road on the east); returns `eave`, `windows` and `roofY(x, z)`. */
export function buildNordicGym(b, p, base, bottom, parts) {
  const M = b.model, xs = p.map(q => q[0]), zs = p.map(q => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const eave = base + b.levels * M.storey, lowEave = base + M.lowHeight, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const lowX1 = x0 + M.low.w, lowZ0 = z1 - M.low.d; // the low south-west part
  const inLow = (x, z) => x < lowX1 && z > lowZ0;
  // Brick: the tall block as two boxes around the low corner, the low part, a plinth band; roofs as thin slabs.
  box(x1 - x0, eave - bottom, lowZ0 - z0, cx, bottom, (z0 + lowZ0) / 2, M.brick, parts.facade);
  box(x1 - lowX1, eave - bottom, z1 - lowZ0, (lowX1 + x1) / 2, bottom, (lowZ0 + z1) / 2, M.brick, parts.facade);
  box(M.low.w, lowEave - bottom, M.low.d, (x0 + lowX1) / 2, bottom, (lowZ0 + z1) / 2, M.brickLow, parts.facade);
  const slab = (xa, xb, za, zb, y) => box(xb - xa, M.roofThick, zb - za, (xa + xb) / 2, y, (za + zb) / 2, M.roof, parts.roof);
  slab(x0, x1, z0, lowZ0, eave); slab(lowX1, x1, lowZ0, z1, eave); slab(x0, lowX1, lowZ0, z1, lowEave);
  for (const g of parts.roof.slice(-3)) g.deleteAttribute('color'); // the roof batch has no vertex colours (one uniform roof colour)
  // Solar panels: long dark-blue rows over the tall roof, a walkway margin round the edge and one gap for a rooftop unit.
  const top = eave + M.roofThick, ph = M.panelHeight, m = M.panelMargin;
  for (let z = z0 + m; z + M.panelRow <= z1 - m + 1e-6; z += M.panelRow + M.panelGap) {
    const from = z + M.panelRow > lowZ0 ? lowX1 + m : x0 + m, to = x1 - M.panelEastInset; // a row that reaches into the low corner's strip starts east of it
    box(to - from, ph, M.panelRow, (from + to) / 2, top, z + M.panelRow / 2, M.panel, parts.glass);
  }
  box(M.unit.w, M.unit.h, M.unit.d, M.unit.x, top, M.unit.z, M.unitColor, parts.glass);
  // Glass corner: the south-east corner towards the road bend and junction, wrapping the east and south faces over every storey (teal glass, pale floor bands and mullions).
  const gw = M.glass.east, gs = M.glass.south, gb = base + M.glass.sill, gt = eave - M.glass.head;
  const mull = (x, z, hx, hz) => box(hx, gt - gb + .3, hz, x, gb - .15, z, M.mullion, parts.glass);
  box(.1, gt - gb, gw, x1 + .06, gb, z1 - gw / 2, M.glassColor, parts.glass);
  box(gs, gt - gb, .1, x1 - gs / 2, gb, z1 + .06, M.glassColor, parts.glass);
  for (let k = 0; k <= Math.round(gw / M.glass.bay); k++) mull(x1 + .09, z1 - k * gw / Math.round(gw / M.glass.bay), .08, .12);
  for (let k = 0; k <= Math.round(gs / M.glass.bay); k++) mull(x1 - k * gs / Math.round(gs / M.glass.bay), z1 + .09, .12, .08);
  for (let f = 1; f < b.levels; f++) { const y = base + f * M.storey - .12; box(.14, .24, gw, x1 + .09, y, z1 - gw / 2, M.mullion, parts.glass); box(gs, .24, .14, x1 - gs / 2, y, z1 + .09, M.mullion, parts.glass); }
  // Window bays on the brick faces (flat dark panes, one row per storey); the glass corner and the low part have their own.
  const windows = [];
  const pane = (x, y, z, w, h, nx, nz) => {
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz)).translate(x + nx * .03, y, z + nz * .03).toNonIndexed();
    g.deleteAttribute('uv'); const c = rgb(M.windowColor), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.glass.push(g);
    windows.push({ x: x + nx * .03, y, z: z + nz * .03, n: [nx, nz], width: w, height: h });
  };
  for (let f = 0; f < b.levels; f++) {
    const y = base + f * M.storey + M.window.sill + M.window.h / 2;
    for (let x = x0 + 3; x < x1 - 2.5; x += M.window.bay) { // the long south and north faces; the low part has one storey only
      if (x < x1 - gs - 2.5 && (f === 0 || x > lowX1 + 1)) pane(x, y, z1, M.window.w, M.window.h, 0, 1);
      pane(x, y, z0, M.window.w, M.window.h, 0, -1);
    }
    for (let z = z0 + 3; z < z1 - 2.5; z += M.window.bay) { // the west end and the east end
      if (f === 0 || z < lowZ0 - 1) pane(x0, y, z, M.window.w, M.window.h, -1, 0);
      if (z < z1 - gw - 2.5) pane(x1, y, z, M.window.w, M.window.h, 1, 0);
    }
  }
  const roofY = (x, z) => (x < x0 || x > x1 || z < z0 || z > z1 ? -Infinity : inLow(x, z) ? lowEave + M.roofThick : eave + M.roofThick);
  return { base, eave, ridge: eave + M.roofThick, windows, roofY, nordicGym: { x0, x1, z0, z1, lowX1, lowZ0 } };
}
