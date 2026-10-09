import * as THREE from 'three';
import { SITE } from './config.js';

// #575: Karpvägen 2–10 (Brf S:t Lars Park) on their exact OSM footprints. Three brick storeys under a recessed light top
// storey with dark metal end volumes, stacked park-side balconies, stair strips with pale panels, flat felt roofs.
// Every size comes from SITE.west.karp (photo/render reading, *guess*). All geometry merges into the west backdrop's batches.
const K = SITE.west.karp, C = K.colors;
const plain = g => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };
const tint = (g, color) => { g.userData.tint = color; return g; };

/** Drop vertices on (near) straight runs: OSM splits some façades into collinear pieces. */
function simplify(p) {
  const out = p.filter((b, i) => {
    const a = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length];
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
    return Math.abs(ux * vz - uz * vx) / (Math.hypot(ux, uz) * Math.hypot(vx, vz)) > 0.05;
  });
  return out.length >= 3 ? out : p;
}
const sign = p => Math.sign(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0));
/** Mitred inward offset of a simple (here orthogonal) polygon. */
function inset(p, d) {
  const o = sign(p), lines = p.map((a, i) => {
    const b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const nx = o * uz, nz = -o * ux; // outward
    return { x: a[0] - nx * d, z: a[1] - nz * d, ux, uz };
  });
  return lines.map((l, i) => {
    const m = lines[(i - 1 + lines.length) % lines.length], det = m.ux * l.uz - m.uz * l.ux;
    if (Math.abs(det) < 1e-6) return [l.x, l.z];
    const t = ((l.x - m.x) * l.uz - (l.z - m.z) * l.ux) / det;
    return [m.x + m.ux * t, m.z + m.uz * t];
  });
}
const prism = (poly, y0, y1) => new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: y1 - y0, bevelEnabled: false })
  .rotateX(-Math.PI / 2).translate(0, y0, 0);
const cap = (poly, y) => new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2).translate(0, y, 0);

/** Each edge of `poly` with its frame: start, unit direction, outward normal, length and façade kind. */
function edges(poly) {
  const o = sign(poly);
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const nx = o * uz, nz = -o * ux, facing = nx * K.park[0] + nz * K.park[1];
    return { a, len, ux, uz, nx, nz, angle: Math.atan2(nx, nz), kind: facing > 0.7 ? 'park' : facing < -0.7 ? 'entrance' : 'end' };
  });
}

export function buildKarpFacade(b, polygon, base, bottom, storey, parts) {
  const p = simplify(polygon), windows = [];
  const brickTop = base + K.brickLevels * storey, parapet = brickTop + K.parapet, top = parapet + K.topHeight;
  const E = edges(p);
  // Long axis = longest edge; (u, v) frame for the end volumes and roof housings.
  const L = E.reduce((m, e) => (e.len > m.len ? e : m)), U = [L.ux, L.uz], V = [-L.uz, L.ux];
  const u = q => q[0] * U[0] + q[1] * U[1], v = q => q[0] * V[0] + q[1] * V[1];
  const us = p.map(u), vs = p.map(v), u0 = Math.min(...us), u1 = Math.max(...us);
  const parkV = Math.sign(K.park[0] * V[0] + K.park[1] * V[1]); // +1: the park lies towards +v
  const at = (uu, vv) => [U[0] * uu + V[0] * vv, U[1] * uu + V[1] * vv];

  // The sloping site: plinth from the lowest ground, brick up to the parapet, a dark terrace deck on top.
  parts.facade.push(tint(plain(prism(p, bottom, base + K.plinth)), C.plinth));
  const brick = plain(prism(p, base + K.plinth, parapet)), P = brick.attributes.position, N = brick.attributes.normal, uv = [];
  // Wall-following texture coordinates (2 m per repeat) so the diagonal footprints keep square bricks.
  for (let i = 0; i < P.count; i++) uv.push((P.getX(i) * -N.getZ(i) + P.getZ(i) * N.getX(i)) / 2, P.getY(i) / 2);
  brick.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); parts.karpBrick.push(brick);
  parts.karpRoof.push(plain(cap(p, parapet + 0.01)));

  const q = inset(p, K.setback);
  parts.facade.push(tint(plain(prism(q, parapet, top)), C.render));
  parts.karpRoof.push(plain(cap(q, top + 0.01)));

  // End volumes: at both ends of the long axis, flush with the gable and the park-side corner.
  const boxes = [];
  for (const end of [0, 1]) {
    const ua = end ? u1 - K.endBox.length : u0, ub = end ? u1 : u0 + K.endBox.length;
    // The park side's v at this end (the footprint may be wider at one end, Hus 3).
    const slab = p.filter(c => u(c) >= ua - 0.5 && u(c) <= ub + 0.5).map(v), vPark = parkV > 0 ? Math.max(...(slab.length ? slab : vs)) : Math.min(...(slab.length ? slab : vs));
    const va = parkV > 0 ? vPark - K.endBox.width : vPark, vb = parkV > 0 ? vPark : vPark + K.endBox.width;
    boxes.push({ ua, ub, va, vb });
    const [cx, cz] = at((ua + ub) / 2, (va + vb) / 2), h = top + K.endBox.rise - parapet + 0.02;
    const g = new THREE.BoxGeometry(ub - ua, h, vb - va).rotateY(-Math.atan2(U[1], U[0])).translate(cx, parapet - 0.02 + h / 2, cz);
    parts.facade.push(tint(plain(g), C.metal));
    // The big window in the end face (photo: the dark box's glazed gable).
    const n = end ? [U[0], U[1]] : [-U[0], -U[1]], [fx, fz] = at(end ? ub : ua, (va + vb) / 2), y = parapet + 0.35 + K.endBox.window[1] / 2;
    pane(fx, fz, n, y, K.endBox.window[0], K.endBox.window[1], true);
  }
  const inBox = (x, z, pad = 0.4) => boxes.some(bx => { const uu = u([x, z]), vv = v([x, z]); return uu > bx.ua - pad && uu < bx.ub + pad && vv > bx.va - pad && vv < bx.vb + pad; });

  // Dark coping on the brick parapet, dark fascia at the top storey's roof edge.
  for (const e of E) band(e, parapet - K.coping / 2 + 0.03, K.coping, 0.03, C.coping);
  for (const e of edges(q)) band(e, top - K.fascia / 2 + 0.06, K.fascia, 0.03, C.coping);

  function band(e, y, h, out, color) {
    const g = new THREE.BoxGeometry(e.len + 0.06, h, 0.06).rotateY(e.angle).translate(e.a[0] + e.ux * e.len / 2 + e.nx * out, y, e.a[1] + e.uz * e.len / 2 + e.nz * out);
    parts.facade.push(tint(plain(g), color));
  }
  function rect(target, x, z, n, y, w, h, out, color, rot = 0) {
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(n[0], n[1]) + rot).translate(x + n[0] * out, y, z + n[1] * out);
    target.push(color === undefined ? plain(g) : tint(plain(g), color));
  }
  // A white-framed opaque reflective pane (#569's shared glass), centred at (x, y, z) on a face with outward normal n.
  function pane(x, z, n, y, w, h, record = true) {
    rect(parts.facade, x, z, n, y, w + 2 * K.frame, h + 2 * K.frame, 0.02, C.frame);
    rect(parts.karpGlass, x, z, n, y, w, h, 0.03);
    const t = [-n[1], n[0]], off = w / 2 - Math.min(w / 3, 0.45); // one post off-centre (an opening sash beside a fixed light)
    rect(parts.facade, x + t[0] * off, z + t[1] * off, n, y, K.mullion, h, 0.035, C.frame);
    if (record) windows.push({ x: x + n[0] * 0.03, y, z: z + n[1] * 0.03, n, width: w, height: h });
  }
  const along = (e, t) => [e.a[0] + e.ux * t, e.a[1] + e.uz * t];

  // A vertical strip: glazing per storey with pale infill panels between (stairs on the entrance side, gable strips).
  function strip(e, t, door) {
    const [x, z] = along(e, t), n = [e.nx, e.nz], S = K.strip, y0 = base + K.plinth, y1 = brickTop - 0.25;
    rect(parts.facade, x, z, n, (y0 + y1) / 2, S.width + 2 * K.frame, y1 - y0 + K.frame, 0.02, C.frame);
    rect(parts.facade, x, z, n, (y0 + y1) / 2, S.width, y1 - y0, 0.025, C.panel);
    for (let f = 0; f < K.brickLevels; f++) {
      if (f === 0 && door) {
        rect(parts.karpGlass, x, z, n, base + 0.05 + S.door[1] / 2, S.door[0], S.door[1], 0.03);
        windows.push({ x: x + n[0] * 0.03, y: base + 0.05 + S.door[1] / 2, z: z + n[1] * 0.03, n, width: S.door[0], height: S.door[1], door: true });
        const c = new THREE.BoxGeometry(S.door[0] + 1.2, 0.18, 1.4).rotateY(e.angle).translate(x + n[0] * 0.7, base + S.door[1] + 0.35, z + n[1] * 0.7);
        parts.facade.push(tint(plain(c), C.canopy));
        continue;
      }
      // Stairs: landings half a storey up; gable strips: ordinary sill height.
      const y = base + f * storey + (door && f ? -storey / 2 + 0.35 : K.sill) + S.window / 2;
      rect(parts.karpGlass, x, z, n, y, S.width - 0.1, S.window, 0.03);
      windows.push({ x: x + n[0] * 0.03, y, z: z + n[1] * 0.03, n, width: S.width - 0.1, height: S.window });
    }
  }

  for (const e of E) {
    const n = [e.nx, e.nz], taken = [];
    if (e.kind === 'park') {
      const B = K.balcony, count = Math.max(1, Math.round(e.len / B.spacing));
      for (let k = 0; k < count; k++) {
        const t = e.len * (k + 0.5) / count, [x, z] = along(e, t);
        taken.push([t, B.width / 2 + 0.7]);
        for (let f = 0; f < K.brickLevels; f++) {
          const floor = base + f * storey + (f ? 0 : B.groundLift);
          const slab = new THREE.BoxGeometry(B.width, B.slab, B.depth).rotateY(e.angle).translate(x + n[0] * B.depth / 2, floor - B.slab / 2, z + n[1] * B.depth / 2);
          parts.facade.push(tint(plain(slab), C.slab));
          const ry = floor + B.rail / 2;
          rect(parts.facade, x, z, n, ry, B.width, B.rail, B.depth, C.rail);
          for (const s of [-1, 1]) {
            const sx = x + e.ux * s * B.width / 2 + n[0] * B.depth / 2, sz = z + e.uz * s * B.width / 2 + n[1] * B.depth / 2;
            const g = new THREE.PlaneGeometry(B.depth, B.rail).rotateY(e.angle + Math.PI / 2).translate(sx, ry, sz);
            parts.facade.push(tint(plain(g), C.rail));
          }
          pane(x, z, n, floor + 0.05 + B.glass[1] / 2, B.glass[0], B.glass[1]);
        }
      }
    } else if (e.kind === 'entrance') {
      for (const s of b.karp.stairs) { const t = e.len * s; strip(e, t, true); taken.push([t, K.strip.width / 2 + 1.1]); }
    } else if (e.len < K.gableStrip) {
      strip(e, e.len / 2, false); taken.push([e.len / 2, K.strip.width / 2 + 1.1]);
    }
    // Ordinary windows in the remaining brick, every storey.
    const free = t => t > 1.1 && t < e.len - 1.1 && !taken.some(([c, r]) => Math.abs(t - c) < r);
    const n0 = Math.floor((e.len - 2) / K.bay), first = (e.len - n0 * K.bay) / 2;
    for (let k = 0; k <= n0; k++) {
      const t = first + k * K.bay; if (!free(t)) continue;
      const [x, z] = along(e, t);
      for (let f = 0; f < K.brickLevels; f++) pane(x, z, n, base + f * storey + K.sill + K.window[1] / 2, K.window[0], K.window[1]);
    }
    // Glass railing along the roof terraces on the park side.
    if (e.kind === 'park') { const [x, z] = along(e, e.len / 2); rect(parts.facade, x, z, n, parapet + 0.5, e.len, 0.9, -0.15, C.rail); }
  }

  // The recessed top storey: terrace doors to the park, windows elsewhere; none inside the end volumes.
  for (const e of edges(q)) {
    const n = [e.nx, e.nz], park = e.kind === 'park', count = Math.floor((e.len - 1.5) / K.topBay);
    for (let k = 0; k <= count; k++) {
      const t = (e.len - count * K.topBay) / 2 + k * K.topBay, [x, z] = along(e, t);
      if (t < 0.9 || t > e.len - 0.9 || inBox(x + n[0] * 0.2, z + n[1] * 0.2)) continue;
      if (park) pane(x, z, n, parapet + 0.05 + 2.1 / 2, 1.9, 2.1);
      else pane(x, z, n, parapet + K.sill - 0.2 + K.window[1] / 2, K.window[0], K.window[1]);
    }
  }
  // White roof housings on the long axis (render).
  const vm = (Math.min(...vs) + Math.max(...vs)) / 2;
  for (const f of [0.35, 0.65]) {
    const uu = u0 + (u1 - u0) * f; let vv = vm;
    const [x, z] = at(uu, vv); if (!inside(x, z, q)) continue;
    const [w, h, d] = K.roofBox;
    parts.facade.push(tint(plain(new THREE.BoxGeometry(w, h, d).rotateY(-Math.atan2(U[1], U[0])).translate(x, top + h / 2, z)), C.roofBox));
  }
  return { windows, eave: top, ridge: top + K.endBox.rise, brickTop };
}
function inside(x, z, p) { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; }

let brickMap;
/** One small deterministic salmon-red brick texture shared by the three houses (2 m per repeat, like the other backdrops). */
export function karpBrickTexture() {
  if (brickMap) return brickMap;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), B = K.brick;
  g.fillStyle = B.mortar; g.fillRect(0, 0, 256, 256);
  let seed = 575; const rand = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  for (let row = 0; row < 32; row++) for (let col = -1; col < 9; col++) {
    const v = Math.floor((rand() - 0.5) * B.variation);
    g.fillStyle = `rgb(${B.base[0] + v},${B.base[1] + v * 0.8},${B.base[2] + v * 0.7})`;
    g.fillRect(col * 32 + (row % 2) * 16 + 1, row * 8 + 1, 30, 6.5);
  }
  brickMap = new THREE.CanvasTexture(c); brickMap.colorSpace = THREE.SRGBColorSpace; brickMap.wrapS = brickMap.wrapT = THREE.RepeatWrapping;
  return brickMap;
}
