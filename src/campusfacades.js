import * as THREE from 'three';
import { SITE, CAMPUS_LOD, MAILBOX } from './config.js';
import { lowMemory } from './lowmemory.js';
import { schoolRoofTint } from './schoolfacade.js';
import { mailboxBodyParts } from './mailboxbody.js';

// Photo-specific facades for the old hospital buildings east of the site (#576–#581). The OSM footprint
// stays the building's outline; `sections` raise boxes of it to more storeys, and every part gets plinth,
// bands, cornice, quoins, windows and a roof that follows its own outline. Everything is merged into the
// campus batches that the school (#564) already uses: schoolBrick, modern (white trim), schoolGlass, schoolRoof.
const plain = g => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };
const tint = (g, color) => { g.userData.tint = color; return g; };
const signedArea = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const inside = (x, z, p) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };
const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
};
const ringDist = (x, z, rings) => { let d = Infinity; for (const r of rings) for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(x, z, r[i], r[(i + 1) % r.length])); return d; };
function clip(poly, axis, value, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], va = (a[axis] - value) * sign, vb = (b[axis] - value) * sign;
    if (va >= -1e-8) out.push(a);
    if ((va >= 0) !== (vb >= 0)) { const t = va / (va - vb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// Drop repeated and collinear points left by clipping.
function tidy(poly) {
  let p = poly.filter((q, i) => Math.hypot(q[0] - poly[(i + 1) % poly.length][0], q[1] - poly[(i + 1) % poly.length][1]) > .02);
  for (let changed = true; changed && p.length > 3;) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < .02 * Math.hypot(c[0] - a[0], c[1] - a[1])) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}
const clipBox = (p, [x0, z0, x1, z1]) => tidy(clip(clip(clip(clip(p, 0, x0, 1), 0, x1, -1), 1, z0, 1), 1, z1, -1));
const inBox = (x, z, [x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1;
/** A stepped cornice [[dy, h, depth], …] as one profile over its whole height at its deepest step (phones, #589). */
export const oneProfile = steps => {
  if (steps.length < 2) return steps;
  const lo = Math.min(...steps.map(([dy, h]) => dy - h / 2)), hi = Math.max(...steps.map(([dy, h]) => dy + h / 2));
  return [[(lo + hi) / 2, hi - lo, Math.max(...steps.map(c => c[2]))]];
};

/** Resolved style for one building: the named style in SITE.east.facadeStyles plus the building's overrides. */
export function facadeStyle(b) {
  const f = b.campus, base = SITE.east.facadeStyles[f.style];
  return { ...base, ...f, windows: f.windows ?? base.windows };
}

/** Build one mapped campus building with its photo-specific facade; returns windows and heights for tests.
 *  `lite` (phones, #589, CAMPUS_LOD): the same bodies, roofs and windows with fewer profiles and details. */
export function buildCampusFacade(b, p, holes, base, bottom, parts, lite = lowMemory) {
  const S = facadeStyle(b), levels = b.levels, storeys = S.storeys;
  S.lite = lite; S.profile = lite ? oneProfile(S.cornice) : S.cornice;
  const height = n => storeys.slice(0, n).reduce((s, h) => s + h, 0);
  // Pieces: the whole outline at the building's own storeys, then each raised section clipped to it.
  const pieces = [{ poly: p, holes, levels, raise: 0, box: null }];
  for (const s of S.sections ?? []) {
    const poly = clipBox(p, s.box);
    if (poly.length >= 3 && Math.abs(signedArea(poly)) > 4) pieces.push({ poly, holes: [], levels: s.levels ?? levels, raise: s.raise ?? 0, box: s.box, name: s.name, roof: s.roof, roofs: s.roofs });
  }
  const eaveOf = piece => base + height(piece.levels) + piece.raise;
  const hip = !!S.roof.hip;
  for (const piece of pieces) piece.eave = eaveOf(piece);
  if (hip) {
    hipParts(p, holes, pieces, S, outlineAngle(p));
    for (const piece of pieces) {
      piece.top = (x, z) => { let y = -Infinity; for (const h of piece.hips) y = Math.max(y, hipTop(h, x, z)); return y > -Infinity ? y : piece.eave; };
      piece.ridge = Math.max(piece.eave, ...piece.hips.map(h => {
        const R = h.rect, span = (a, b, w) => (h.sloped[a] && h.sloped[b] ? w / 2 : h.sloped[a] || h.sloped[b] ? w : Infinity);
        return h.eave + h.slope * Math.min(span('u0', 'u1', R.u1 - R.u0), span('v0', 'v1', R.v1 - R.v0));
      }));
    }
  }
  // A point on a piece is covered when a taller piece's box holds it: no trim or windows of the lower piece there.
  // A projecting centre (risalit) hides the walls and windows behind it.
  const C = S.centre, risalit = C?.depth ? [C.x[0], Math.min(C.face, C.face - C.normal * C.depth), C.x[1], Math.max(C.face, C.face - C.normal * C.depth)] : null;
  const coveredBy = (piece, x, z) => (risalit && inBox(x, z, risalit)) || pieces.some(o => o !== piece && o.box && eaveOf(o) > eaveOf(piece) + .05 && inBox(x, z, o.box));
  const outline = [p, ...holes];
  const windows = [];
  for (const piece of pieces) {
    const eave = eaveOf(piece), wallParts = S.render ? parts.modern : parts.schoolBrick;
    const shape = new THREE.Shape(piece.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.holes = piece.holes.map(h => new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    wallParts.push(tint(plain(new THREE.ExtrudeGeometry(shape, { depth: eave - bottom, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, bottom, 0)), S.wall));
    for (const [ring, hole] of [[piece.poly, false], ...piece.holes.map(h => [h, true])]) {
      const orientation = (hole ? -1 : 1) * Math.sign(signedArea(ring));
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
        if (len < .3) continue;
        const ux = dx / len, uz = dz / len, nx = orientation * uz, nz = -orientation * ux, angle = Math.atan2(nx, nz);
        // An edge inside the outline is a cut between pieces: only what shows above the lower roof.
        const mx = a[0] + dx / 2 + nx * .3, mz = a[1] + dz / 2 + nz * .3, cut = ringDist(mx, mz, outline) > .25 && inside(mx, mz, p) && !holes.some(h => inside(mx, mz, h));
        // Uncovered stretches of the edge, sampled every 0.25 m just inside the wall.
        const spans = [];
        for (let t = 0, open = null; t <= len + 1e-6; t += Math.min(.25, len - t || .25)) {
          const free = !coveredBy(piece, a[0] + ux * t - nx * .3, a[1] + uz * t - nz * .3);
          if (free && open === null) open = t;
          if ((!free || t >= len - 1e-6) && open !== null) { spans.push([open, free ? len : t]); open = null; }
          if (t >= len - 1e-6) break;
        }
        const box = (along, y, w, h, depth = .12, out = .06, color = S.trim, list = parts.modern) => {
          const g = depth < .096 ? new THREE.PlaneGeometry(w, h) : new THREE.BoxGeometry(w, h, depth);
          list.push(tint(plain(g.rotateY(angle).translate(a[0] + ux * along + nx * out, y, a[1] + uz * along + nz * out)), color));
        };
        for (const [t0, t1] of spans) {
          const w = t1 - t0, mid = (t0 + t1) / 2;
          if (w < .3) continue;
          // Cornice steps and dentils run along every uncovered stretch, cut edges included.
          for (const [dy, h, depth] of S.profile) box(mid, eave + dy, w + .12, h, depth, depth / 2 - .015);
          if (S.soffit) box(mid, eave - .06, w + 2 * S.soffit.depth, .12, S.soffit.depth * 2, 0, S.soffit.color);
          if (S.dentil && !lite && w > 1.2) for (let t = t0 + .3; t < t1 - .2; t += S.dentil.step) box(t, eave + S.cornice[0][0], S.dentil.width, S.dentil.height, S.dentil.depth, S.dentil.depth < .096 ? .19 : .08);
          if (cut) {
            // Upper floors that clear the neighbouring part's roof keep their windows on the cut wall.
            const px = a[0] + ux * mid + nx * .3, pz = a[1] + uz * mid + nz * .3;
            const next = pieces.filter(o => o !== piece && (o.box ? inBox(px, pz, o.box) : true) && eaveOf(o) < eave).sort((o, q) => eaveOf(q) - eaveOf(o))[0];
            if (!next) continue;
            const nTop = hip ? next.top(px, pz) : eaveOf(next) + (next.box ? 0 : Math.min(S.roof.rise, ringDist(px, pz, outline) * S.roof.slope));
            const count = w - 2 * S.margin < 0 ? 0 : Math.floor((w - 2 * S.margin) / S.bay) + 1;
            for (let k = 0; k < count; k++) for (let floor = 0; floor < piece.levels; floor++) {
              const W = S.windows[Math.min(floor, S.windows.length - 1)];
              if (base + height(floor) + W.sill < nTop + .1) continue;
              const wx = a[0] + ux * (mid + (k - (count - 1) / 2) * S.bay) + nx * .3, wz = a[1] + uz * (mid + (k - (count - 1) / 2) * S.bay) + nz * .3;
              if (S.court && courtBusy(S.court, wx, wz)) continue; // #1734: the arches and the bay take this stretch
              for (const offset of W.pair ? [-W.pair / 2, W.pair / 2] : [0]) windows.push(windowAt(a, ux, uz, nx, nz, angle, mid + (k - (count - 1) / 2) * S.bay + offset, base + height(floor), W, S, parts, i, floor));
            }
            continue;
          }
          box(mid, (bottom + base + S.plinth) / 2, w + .04, base + S.plinth - bottom, .13, .065, S.plinthColor ?? S.trim);
          if (S.apron) box(mid, base + (S.plinth + S.apron) / 2, w + .02, S.apron - S.plinth, .05, .03, S.trim);
          for (const band of S.bands ?? []) for (let f = 1; f < piece.levels + (band.top ? 1 : 0); f++) {
            const y = base + height(f) + (band.dy ?? 0);
            if (y < eave - .3) box(mid, y, w + .04, band.h, band.depth ?? .12, (band.depth ?? .12) / 2, band.color ?? S.trim);
          }
          for (const extra of S.courses ?? []) for (let f = 0; f < piece.levels; f++) {
            const y = base + height(f) + extra.y;
            box(mid, y, w + .02, extra.h, .05, .03, extra.color, extra.brick ? parts.schoolBrick : parts.modern);
          }
          if (S.frieze) box(mid, eave - S.frieze / 2, w + .02, S.frieze, .05, .03, S.trim);
          // Windows evenly over the stretch, keeping clear of corners; per-floor shapes from the photo.
          const count = w - 2 * S.margin < 0 ? 0 : Math.floor((w - 2 * S.margin) / S.bay) + 1;
          const xs = Array.from({ length: count }, (_, k) => mid + (k - (count - 1) / 2) * S.bay);
          if (S.piers) {
            const gaps = [t0 + S.piers.edge, ...xs.slice(1).map((x, k) => (x + xs[k]) / 2), t1 - S.piers.edge];
            for (const t of gaps) box(t, (base + S.plinth + eave - (S.frieze ?? 0)) / 2, S.piers.width, eave - (S.frieze ?? 0) - base - S.plinth, S.piers.depth, S.piers.depth / 2, S.piers.color ?? S.trim, S.piers.brick ? parts.schoolBrick : parts.modern);
          }
          for (const t of xs) for (let floor = 0; floor < piece.levels; floor++) {
            const W = S.windows[Math.min(floor, S.windows.length - 1)], fy = base + height(floor);
            for (const offset of W.pair ? [-W.pair / 2, W.pair / 2] : [0]) windows.push(windowAt(a, ux, uz, nx, nz, angle, t + offset, fy, W, S, parts, i, floor));
          }
        }
      }
    }
    // Convex corners of each piece get rusticated quoins (not where a taller piece covers them).
    if (S.quoin) {
      const ring = piece.poly, orientation = Math.sign(signedArea(ring));
      for (let i = 0; i < ring.length; i++) {
        const prev = ring[(i - 1 + ring.length) % ring.length], curr = ring[i], next = ring[(i + 1) % ring.length];
        if (orientation * ((curr[0] - prev[0]) * (next[1] - curr[1]) - (curr[1] - prev[1]) * (next[0] - curr[0])) <= 0) continue;
        if (coveredBy(piece, curr[0] - (curr[0] - prev[0]) * .01 + (next[0] - curr[0]) * .01, curr[1] - (curr[1] - prev[1]) * .01 + (next[1] - curr[1]) * .01)) continue;
        for (const [from, to, sign] of [[prev, curr, -1], [curr, next, 1]]) {
          const dx = to[0] - from[0], dz = to[1] - from[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
          const nx = orientation * uz, nz = -orientation * ux, angle = Math.atan2(nx, nz), along = sign < 0 ? -S.quoin / 2 : S.quoin / 2;
          const y0 = base + S.plinth, y1 = eave + S.cornice[0][0] - S.cornice[0][1] / 2;
          const at = (y, h, depth, color) => parts.modern.push(tint(plain((depth < .096 ? new THREE.PlaneGeometry(S.quoin, h) : new THREE.BoxGeometry(S.quoin, h, depth)).rotateY(angle).translate(curr[0] + ux * along + nx * (depth < .096 ? .096 : depth / 2), y, curr[1] + uz * along + nz * (depth < .096 ? .096 : depth / 2))), color));
          at((y0 + y1) / 2, y1 - y0, .09, S.trim);
          if (S.jointStep && !lite) for (let y = y0 + S.jointStep; y < y1; y += S.jointStep) at(y, .014, .092, S.joint);
        }
      }
    }
    // A low hip that follows the piece's own outline; a sawtooth ring rises inward to glazed faces.
    const rings = [piece.poly, ...piece.holes], R = { ...S.roof, ...piece.roof }, outer = [piece.poly];
    const top = hip ? piece.top : (x, z) => eave + Math.min(R.rise, (R.inward ? ringDist(x, z, outer) : ringDist(x, z, rings)) * R.slope);
    if (hip) for (const h of piece.hips) buildHip(h, S, parts, wallParts, lite);
    else {
      const higher = pieces.filter(o => o !== piece && o.box && eaveOf(o) > eave + .05).map(o => o.box);
      parts.schoolRoof.push(footprintRoof(piece.poly, piece.holes, top, (R.grid ?? 1.5) * (lite ? CAMPUS_LOD.roofGrid : 1), S.seam ?? .6, higher));
    }
    if (!hip && R.inward) for (const h of piece.holes) for (let i = 0; i < h.length; i++) {
      const a = h[i], c = h[(i + 1) % h.length], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], eave, a[1], c[0], eave, c[1], c[0], top(...c), c[1], a[0], eave, a[1], c[0], top(...c), c[1], a[0], top(...a), a[1]], 3));
      g.computeVertexNormals(); (parts.schoolGlass ?? parts.glass).push(tint(g, S.glass));
    }
    for (const [x, z] of (S.chimneys ?? []).filter(([x, z]) => inside(x, z, piece.poly) && !coveredBy(piece, x, z))) {
      const y = top(x, z);
      parts.schoolBrick.push(tint(plain(new THREE.BoxGeometry(...S.chimney).translate(x, y + S.chimney[1] / 2 - .4, z)), S.chimneyTint ?? 0xffffff));
      parts.schoolRoof.push(tint(new THREE.BoxGeometry(S.chimney[0] + .16, .12, S.chimney[2] + .16).toNonIndexed().translate(x, y + S.chimney[1] - .34, z), schoolRoofTint())); // #1696: own dark-metal tint, not the building's roof tone
    }
    if (!hip) { piece.ridge = eave + R.rise; piece.top = top; }
  }
  if (S.centre) Object.assign(S, buildCentre(p, base, pieces, eaveOf, S, parts, windows));
  if (S.court) buildCourt(base, pieces, S, parts, windows);
  const roofY = (x, z) => pieces.reduce((y, q) => (inside(x, z, q.poly) && !q.holes.some((h) => inside(x, z, h)) ? Math.max(y, q.top(x, z)) : y), -Infinity); // the drawn roof's height, for the walkable roof (#1294)
  return { roofY, windows, eave: Math.max(...pieces.map(eaveOf)), ridge: Math.max(...pieces.map(q => q.ridge)), pieces: pieces.map(q => ({ name: q.name, levels: q.levels, eave: q.eave, ridge: q.ridge, area: Math.abs(signedArea(q.poly)) })), tower: S.towerTop, clock: S.clock };
}

/** A window with frame, opaque reflective glass, sill, crown and glazing bars; t along the edge from a. */
function windowAt(a, ux, uz, nx, nz, angle, t, fy, W, S, parts, edge, floor) {
  const x = a[0] + ux * t, z = a[1] + uz * t, low = fy + W.sill, high = fy + W.head, h = high - low, width = W.width, rise = W.arch ?? 0;
  const outline = (w, height, r) => {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, height - r);
    if (r) s.quadraticCurveTo(0, height + r, -w / 2, height - r); else s.lineTo(-w / 2, height);
    s.closePath(); return s;
  };
  const decal = (shape, out, color, list) => list.push(tint(plain(new THREE.ShapeGeometry(shape, S.lite ? CAMPUS_LOD.curve : 6).rotateY(angle).translate(x + nx * out, low, z + nz * out)), color));
  const piece = (along, y, w, hh, depth, out, color = S.trim, list = parts.modern) => {
    const g = depth < .096 ? new THREE.PlaneGeometry(w, hh) : new THREE.BoxGeometry(w, hh, depth);
    list.push(tint(plain(g.rotateY(angle).translate(x + ux * along + nx * out, y, z + uz * along + nz * out)), color));
  };
  if (W.header) decal(outline(width + 2 * W.header, h + W.header, rise), .065, W.headerColor, parts.schoolBrick);
  decal(outline(width + 2 * S.frame, h + S.frame, rise), .07, S.frameColor ?? S.trim, parts.modern);
  decal(outline(width, h, rise), .075, S.glass, parts.schoolGlass ?? parts.glass);
  // Phones (#589): sill and crown as flat fronts, only the centre post and one rail of the glazing bars.
  if (S.lite) piece(0, low - .025, width + .26, .1, .04, .2, S.sillColor ?? S.trim);
  else piece(0, low - .025, width + .26, .1, .2, .1, S.sillColor ?? S.trim);
  if (W.crown === 'key') piece(0, high + .08, .22, .3, .08, .1);
  if (W.crown === 'cornice' && S.lite) piece(0, high + .17, width + .42, .2, .04, .2);
  else if (W.crown === 'cornice') { piece(0, high + .13, width + .3, .12, .18, .09); piece(0, high + .22, width + .42, .07, .22, .11); }
  // Glazing bars as thin planes: a centre post, two mullions and three rails.
  const bar = S.mullion, clear = h - rise, rails = W.rails ?? (W.bars !== false ? [.25, .5, .75] : []);
  piece(0, low + h / 2, bar * 1.5, h, .04, .1, S.frameColor ?? S.trim);
  if (W.bars !== false && !S.lite) for (const f of [.25, .75]) piece(width * (f - .5), low + clear / 2, bar * .65, clear, .04, .1, S.frameColor ?? S.trim);
  for (const f of S.lite ? rails.slice(rails.length >> 1, (rails.length >> 1) + 1) : rails) piece(0, low + h * f, width, bar * (W.bars !== false ? .65 : 1.5), .04, .1, S.frameColor ?? S.trim);
  return { x: x + nx * .075, y: low + h / 2, z: z + nz * .075, n: [nx, nz], width, height: h, edge, floor, arched: !!rise };
}

// #1733: steep hipped roofs per roof part (`roof.hip`). Every part is a rectangle in the outline's own frame (the
// clipped outline's bounds), hipped on its free edges with one slope, so the ridges and hips are exact planes and a
// part costs a handful of triangles. Where an end runs into a taller part it is carried on under that roof (hidden);
// a long side against a taller wall becomes a lean-to's back; an end against an equal part is cut off with a gable.
const outlineAngle = p => {
  let sx = 0, sz = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), t = Math.atan2(b[1] - a[1], b[0] - a[0]) * 4;
    sx += len * Math.cos(t); sz += len * Math.sin(t);
  }
  return Math.atan2(sz, sx) / 4;
};
/** Keep the part of a convex-or-not polygon where the linear function f([u, v]) <= 0. */
const clipLinear = (poly, f) => {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa <= 1e-9) out.push(a);
    if ((fa < -1e-9 && fb > 1e-9) || (fa > 1e-9 && fb < -1e-9)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
};
/** Flat triangles [[x,y,z]×3, …] as one geometry with face normals (pointing up / away from `ref` for walls) and planar uv. */
function triGeometry(tris, seam, uv = true, ref = null) {
  const pos = [], nor = [], uvs = [];
  for (let [a, b, c] of tris) {
    let n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
    if (n.lengthSq() < 1e-10) continue;
    const flip = ref ? n.x * (a[0] - ref[0]) + n.y * (a[1] - ref[1]) + n.z * (a[2] - ref[2]) < 0 : n.y < 0;
    if (flip) { [b, c] = [c, b]; n.negate(); }
    n.normalize();
    for (const q of [a, b, c]) { pos.push(...q); nor.push(n.x, n.y, n.z); uvs.push(q[0] / seam, q[2] / seam); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}
const fan = poly => { const t = []; for (let j = 1; j < poly.length - 1; j++) t.push([poly[0], poly[j], poly[j + 1]]); return t; };

/** The hip parts of every piece: { rect, sloped, eave, slope, dormers } in the frame turned by `angle`. */
function hipParts(p, holes, pieces, S, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), H = S.roof;
  const toLocal = ([x, z]) => [x * c + z * s, -x * s + z * c], toWorld = (u, v) => [u * c - v * s, u * s + v * c];
  const eaveAt = (x, z) => pieces.reduce((y, q) => (inside(x, z, q.poly) && !q.holes.some(h => inside(x, z, h)) ? Math.max(y, q.eave) : y), -Infinity);
  for (const piece of pieces) {
    const list = piece.box ? (piece.roofs ?? [piece.box]) : (S.roofs ?? []);
    piece.hips = [];
    for (const raw of list) {
      const r = Array.isArray(raw) ? { box: raw } : raw, poly = clipBox(p, r.box);
      if (poly.length < 3 || Math.abs(signedArea(poly)) < 4) continue;
      const loc = poly.map(toLocal), us = loc.map(q => q[0]), vs = loc.map(q => q[1]);
      const rect = { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
      // The neighbour across each edge: the tallest piece just outside it (sampled at three points along it).
      const near = {};
      for (const e of ['u0', 'u1', 'v0', 'v1']) {
        const onU = e[0] === 'u', sign = e[1] === '0' ? -1 : 1;
        let n = -Infinity;
        for (const f of [.2, .5, .8]) {
          const u = onU ? rect[e] + sign * .8 : rect.u0 + (rect.u1 - rect.u0) * f, v = onU ? rect.v0 + (rect.v1 - rect.v0) * f : rect[e] + sign * .8;
          n = Math.max(n, eaveAt(...toWorld(u, v)));
        }
        near[e] = n > piece.eave + .05 ? 'higher' : Math.abs(n - piece.eave) <= .05 ? 'equal' : 'free';
      }
      // The ridge runs between the two parts a linking wing joins, else along the longer side.
      const links = a => near[a + '0'] !== 'free' && near[a + '1'] !== 'free';
      const alongU = links('u') !== links('v') ? links('u') : rect.u1 - rect.u0 >= rect.v1 - rect.v0;
      const half = (alongU ? rect.v1 - rect.v0 : rect.u1 - rect.u0) / 2;
      const sloped = { u0: true, u1: true, v0: true, v1: true }, butt = [], o = H.overhang ?? .15, grow = { u0: o, u1: o, v0: o, v1: o };
      for (const e of ['u0', 'u1', 'v0', 'v1']) {
        const end = (e[0] === 'u') === alongU, higher = near[e] === 'higher', equal = near[e] === 'equal';
        if (end && higher) { grow[e] = half + .3; continue; }
        if (end && equal) { sloped[e] = false; grow[e] = 0; butt.push(e); continue; }
        if (!end && higher) { sloped[e] = false; grow[e] = .05; }
      }
      if (!sloped.u0 && !sloped.u1 && !sloped.v0 && !sloped.v1) sloped.v0 = sloped.v1 = true;
      const orig = { ...rect };
      rect.u0 -= grow.u0; rect.u1 += grow.u1; rect.v0 -= grow.v0; rect.v1 += grow.v1;
      const slope = r.slope ?? piece.roof?.slope ?? H.slope;
      piece.hips.push({ rect, orig, alongU, sloped, butt, eave: piece.eave, slope, dormers: r.dormers, toWorld, toLocal });
    }
  }
}
const hipDist = (h, u, v) => {
  const R = h.rect, d = { u0: u - R.u0, u1: R.u1 - u, v0: v - R.v0, v1: R.v1 - v };
  let m = Infinity; for (const e in d) if (h.sloped[e]) m = Math.min(m, d[e]);
  return m;
};
/** Height of a hip part at a world point, -Infinity outside its rectangle. */
const hipTop = (h, x, z) => { const [u, v] = h.toLocal([x, z]), R = h.rect; return u < R.u0 || u > R.u1 || v < R.v0 || v > R.v1 ? -Infinity : h.eave + h.slope * hipDist(h, u, v); };
/** Draw one hip part: its roof planes, gables on cut-off ends and the dormers on its long slopes. */
function buildHip(h, S, parts, wallParts, lite) {
  const R = h.rect, edges = ['u0', 'u1', 'v0', 'v1'].filter(e => h.sloped[e]);
  const dist = { u0: q => q[0] - R.u0, u1: q => R.u1 - q[0], v0: q => q[1] - R.v0, v1: q => R.v1 - q[1] };
  const W = (u, v, y) => { const [x, z] = h.toWorld(u, v); return [x, y, z]; }, at = (u, v) => h.eave + h.slope * hipDist(h, u, v);
  const tris = [];
  for (const e of edges) {
    let poly = [[R.u0, R.v0], [R.u1, R.v0], [R.u1, R.v1], [R.u0, R.v1]];
    for (const f of edges) if (f !== e) poly = clipLinear(poly, q => dist[e](q) - dist[f](q));
    if (poly.length >= 3) tris.push(...fan(poly.map(q => W(q[0], q[1], h.eave + h.slope * dist[e](q)))));
  }
  const roofTris = [...tris], wallTris = [], trimTris = [], glassTris = [];
  // A gable closes an end cut off against an equal part (its profile: the end corners and the ridge between them).
  for (const e of h.butt) {
    const onU = e[0] === 'u', a = onU ? R.v0 : R.u0, b = onU ? R.v1 : R.u1, P = t => (onU ? [R[e], t] : [t, R[e]]);
    const ts = [a, (a + b) / 2, b];
    for (let i = 0; i < ts.length - 1; i++) {
      const p0 = P(ts[i]), p1 = P(ts[i + 1]), y0 = at(...p0), y1 = at(...p1);
      if (Math.max(y0, y1) < h.eave + .02) continue;
      wallTris.push([W(...p0, h.eave), W(...p1, h.eave), W(...p1, y1)], [W(...p0, h.eave), W(...p1, y1), W(...p0, y0)]);
    }
  }
  // Dormers (*guess* sizes, S.dormer) evenly along the visible part of each long sloped side.
  const D = S.dormer, alongU = h.alongU;
  if (h.dormers && D) for (const e of alongU ? ['v0', 'v1'] : ['u0', 'u1']) {
    if (!h.sloped[e]) continue;
    const out = { u0: [-1, 0], u1: [1, 0], v0: [0, -1], v1: [0, 1] }[e], tan = [Math.abs(out[1]), Math.abs(out[0])];
    const s0 = alongU ? h.orig.u0 : h.orig.v0, s1 = alongU ? h.orig.u1 : h.orig.v1, len = s1 - s0 - 2 * D.margin;
    if (len < 0) continue;
    const n = Math.min(h.dormers, Math.floor(len / D.spacing) + 1), edge = R[e];
    for (let k = 0; k < n; k++) {
      if (lite && k % 2) continue;
      const s = (s0 + s1) / 2 + (k - (n - 1) / 2) * D.spacing;
      const L = (along, dIn, y) => { const u = tan[0] * along + (out[0] ? edge - out[0] * dIn : 0), v = tan[1] * along + (out[1] ? edge - out[1] * dIn : 0); return W(u, v, y); };
      const yf = h.eave + h.slope * D.inset, yt = yf + D.height, yr = yt + D.gable, dp = D.height / h.slope + .05, dr = (D.height + D.gable) / h.slope + .05, w = D.width / 2, ov = .12;
      const fl = L(s - w, D.inset, yf - .1), fr = L(s + w, D.inset, yf - .1), tl = L(s - w, D.inset, yt), tr = L(s + w, D.inset, yt), apex = L(s, D.inset, yr);
      trimTris.push([fl, fr, tr], [fl, tr, tl], [tl, tr, apex]);
      trimTris.push([fl, tl, L(s - w, D.inset + dp, yt)], [fr, tr, L(s + w, D.inset + dp, yt)]);
      const el = L(s - w - ov, D.inset - ov, yt - .06), er = L(s + w + ov, D.inset - ov, yt - .06), ap = L(s, D.inset - ov, yr + .02);
      const elb = L(s - w - ov, D.inset + dp, yt - .06), erb = L(s + w + ov, D.inset + dp, yt - .06), apb = L(s, D.inset + dr, yr + .02);
      roofTris.push([el, ap, apb], [el, apb, elb], [er, ap, apb], [er, apb, erb]);
      if (!lite) { const pw = D.width * .55, g0 = yf + .12, g1 = yt - .15, d = D.inset - .02; glassTris.push([L(s - pw / 2, d, g0), L(s + pw / 2, d, g0), L(s + pw / 2, d, g1)], [L(s - pw / 2, d, g0), L(s + pw / 2, d, g1), L(s - pw / 2, d, g1)]); }
    }
  }
  const ref = W((R.u0 + R.u1) / 2, (R.v0 + R.v1) / 2, h.eave - 3);
  parts.schoolRoof.push(triGeometry(roofTris, S.seam ?? .6));
  if (wallTris.length) wallParts.push(tint(triGeometry(wallTris, 1, false, ref), S.wall));
  if (trimTris.length) parts.modern.push(tint(triGeometry(trimTris, 1, false, ref), S.trim));
  if (glassTris.length) (parts.schoolGlass ?? parts.glass).push(tint(triGeometry(glassTris, 1, false, ref), S.glass));
}

/** Roof over an outline (with holes) at height top(x,z): small grid cells so the hip follows every wing. */
const minusBox = (poly, [x0, z0, x1, z1]) => {
  const rest = clip(poly, 0, x0, 1), middle = clip(rest, 0, x1, -1);
  return [clip(poly, 0, x0, -1), clip(rest, 0, x1, 1), clip(middle, 1, z0, -1), clip(middle, 1, z1, 1)].filter(q => q.length >= 3);
};
export function footprintRoof(p, holes, top, step, seam, without = []) {
  const positions = [], uv = [];
  const contour = p.map(q => new THREE.Vector2(...q)), holeV = holes.map(h => h.map(q => new THREE.Vector2(...q))), all = [p, ...holes].flat();
  for (const tri of THREE.ShapeUtils.triangulateShape(contour, holeV)) {
    const poly = tri.map(i => all[i]), xs = poly.map(q => q[0]), zs = poly.map(q => q[1]);
    for (let x = Math.floor(Math.min(...xs) / step) * step; x < Math.max(...xs); x += step)
      for (let z = Math.floor(Math.min(...zs) / step) * step; z < Math.max(...zs); z += step) {
        let cell = clip(poly, 0, x, 1); cell = clip(cell, 0, x + step, -1); cell = clip(cell, 1, z, 1); cell = clip(cell, 1, z + step, -1);
        // Leave out what lies under a taller part, so a lower hip never pokes through it.
        let cells = cell.length >= 3 ? [cell] : [];
        for (const box of without) cells = cells.flatMap(c => minusBox(c, box));
        for (cell of cells) for (let j = 1; j < cell.length - 1; j++) for (const q of [cell[0], cell[j], cell[j + 1]]) { positions.push(q[0], top(...q), q[1]); uv.push(q[0] / seam, q[1] / seam); }
      }
  }
  const normals = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2], d = .02;
    const n = new THREE.Vector3(-(top(x + d, z) - top(x - d, z)) / (2 * d), 1, -(top(x, z + d) - top(x, z - d)) / (2 * d)).normalize();
    normals.push(n.x, n.y, n.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

/** #1734: true where the recessed court wall's arched windows or bay stand (no ordinary window there). */
const courtBusy = (K, x, z) => Math.abs(z - K.face) < 1 && ((x > Math.min(...K.arches) - 2 && x < Math.max(...K.arches) + 2) || (K.bay && x > K.bay.x[0] - 1 && x < K.bay.x[1] + 1));

/** #1734: Klockhuset's recessed court wall: tall round-arched upper windows and a canted bay (all sizes *guess*). */
function buildCourt(base, pieces, S, parts, windows) {
  const K = S.court, z = K.face, n = K.normal, rot = n > 0 ? 0 : Math.PI, xs = K.arches;
  const behind = pieces.filter(q => inside((xs[0] + xs[xs.length - 1]) / 2, z - n, q.poly)), eave = Math.max(...behind.map(q => q.eave));
  const arch = new THREE.Shape(), w = K.width, h = K.height;
  arch.moveTo(-w / 2, 0); arch.lineTo(w / 2, 0); arch.lineTo(w / 2, h - w / 2); arch.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); arch.closePath();
  const flat = (g, x, y, out, color, list) => list.push(tint(plain(g.rotateY(rot).translate(x, y, z + n * out)), color));
  for (const x of xs) {
    const frame = new THREE.ShapeGeometry(arch, S.lite ? 5 : 8); frame.scale(1 + .3 / w, 1 + .2 / h, 1); frame.translate(0, -.1, 0);
    flat(frame, x, base + K.sill, .07, S.trim, parts.modern);
    flat(new THREE.ShapeGeometry(arch, S.lite ? 5 : 8), x, base + K.sill, .075, S.glass, parts.schoolGlass ?? parts.glass);
    flat(new THREE.PlaneGeometry(.06, h - w / 2), x, base + K.sill + (h - w / 2) / 2, .1, S.trim, parts.modern);
    flat(new THREE.PlaneGeometry(w, .06), x, base + K.sill + (h - w / 2) * .62, .1, S.trim, parts.modern);
    flat(new THREE.BoxGeometry(w + .26, .1, .2), x, base + K.sill - .05, .1, S.trim, parts.modern);
    windows.push({ x, y: base + K.sill + h * .4, z: z + n * .075, n: [0, n], width: w, height: h, edge: 'court', floor: 1, arched: true });
  }
  if (!K.bay) return;
  // The canted bay: front and two 45° cheeks from above the wing's roof to under the eave, a window in each face, a low cap.
  const B = K.bay, [x0, x1] = B.x, d = B.depth, y0 = base + B.from, y1 = eave - .35, pts = [[x0, z], [x0 + d, z + n * d], [x1 - d, z + n * d], [x1, z]];
  const shape = new THREE.Shape(pts.map(([x, zz]) => new THREE.Vector2(x, -zz)));
  (S.render ? parts.modern : parts.schoolBrick).push(tint(plain(new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0)), S.wall));
  parts.modern.push(tint(plain(new THREE.ExtrudeGeometry(shape, { depth: .25, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y1 - .25, 0)), S.trim));
  for (let i = 0; i < 3; i++) {
    const a = pts[i], c = pts[i + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]), nx = -(c[1] - a[1]) / len * n, nz = (c[0] - a[0]) / len * n, ang = Math.atan2(nx, nz);
    const mx = (a[0] + c[0]) / 2 + nx * .03, mz = (a[1] + c[1]) / 2 + nz * .03, ww = Math.min(1.1, len - .4), wy = (y0 + y1) / 2 + .2, wh = Math.min(2.2, y1 - y0 - .8);
    parts.modern.push(tint(plain(new THREE.PlaneGeometry(ww + .2, wh + .2).rotateY(ang).translate(mx, wy, mz)), S.trim));
    (parts.schoolGlass ?? parts.glass).push(tint(plain(new THREE.PlaneGeometry(ww, wh).rotateY(ang).translate(mx + nx * .01, wy, mz + nz * .01)), S.glass));
    windows.push({ x: mx + nx * .01, y: wy, z: mz + nz * .01, n: [nx, nz], width: ww, height: wh, edge: 'bay', floor: 1, arched: false });
  }
  const capTop = [(x0 + x1) / 2, y1 + .9, z - n * .3], cap = [];
  for (let i = 0; i < 3; i++) cap.push([[pts[i][0], y1, pts[i][1]], [pts[i + 1][0], y1, pts[i + 1][1]], capTop]);
  parts.schoolRoof.push(triGeometry(cap.map(t => t.map(q => [q[0] + (q[0] - capTop[0]) * .05, q[1], q[2] + (q[2] - capTop[2]) * .05])), S.seam ?? .6));
}

/** Projecting centre (risalit) with pediment, large round-arched window and an optional clock tower (byggnad 1). */
function buildCentre(p, base, pieces, eaveOf, S, parts, windows) {
  const C = S.centre, [x0, x1] = C.x, z = C.face, depth = C.depth, cx = (x0 + x1) / 2, n = C.normal;
  // The risalit's cornice follows the part of the building behind it (#1733: Klockhuset's pavilions stand taller).
  const behind = pieces.filter(q => inside(cx, z - n * (depth + 1), q.poly)), eave = Math.max(...(behind.length ? behind : pieces).map(eaveOf));
  const w = x1 - x0, zc = z - n * depth / 2;
  // The risalit block itself, slightly proud of the flanks and white-rendered on the ground floor.
  if (depth) parts.schoolBrick.push(tint(plain(new THREE.BoxGeometry(w, eave - base + .3, depth).translate(cx, base + (eave - base + .3) / 2 - .3, zc)), S.wall));
  const front = (x, y, ww, hh, d = .12, color = S.trim, list = parts.modern) => list.push(tint(plain((d < .096 ? new THREE.PlaneGeometry(ww, hh) : new THREE.BoxGeometry(ww, hh, d)).rotateY(n > 0 ? 0 : Math.PI).translate(x, y, z + n * d / 2)), color));
  if (C.mailbox) for (const { geo, color } of mailboxBodyParts(base + MAILBOX.height)) parts.modern.push(tint(plain(geo), color)); // #1706: the yellow letterbox on the west flank (its hatch and the binoculars: src/mailbox.js); no draw call of its own
  if (C.render) front(cx, base + C.render / 2, w + .1, C.render, .08);
  if (C.pilasters) for (const x of [x0 + .45, x1 - .45, x0 + w * .3, x1 - w * .3]) front(x, (base + eave) / 2, .7, eave - base, .14);
  if (depth) for (const [dy, h, d] of S.profile) front(cx, eave + dy, w + .3, h, d + .02);
  if (S.dentil && !S.lite && depth) for (let x = x0 + .3; x < x1 - .2; x += S.dentil.step) front(x, eave + S.cornice[0][0], S.dentil.width, S.dentil.height, S.dentil.depth + .05);
  // Pediment: a white triangle with a raking cornice on the risalit's front.
  const tri = new THREE.Shape([new THREE.Vector2(-w / 2 - .15, 0), new THREE.Vector2(w / 2 + .15, 0), new THREE.Vector2(0, C.pediment)]);
  const D = depth || C.pedDepth, ped = new THREE.ExtrudeGeometry(tri, { depth: D + .15, bevelEnabled: false }).translate(0, 0, -(D + .15)).rotateY(n > 0 ? 0 : Math.PI).translate(cx, eave + .1, z + n * .15);
  parts.modern.push(tint(plain(ped), S.trim));
  const roofFace = new THREE.BufferGeometry();
  // Pediment roof slopes back to the main roof.
  const back = z - n * (D + C.roofBack), yTop = eave + .1 + C.pediment;
  roofFace.setAttribute('position', new THREE.Float32BufferAttribute([x0 - .3, eave + .1, z + n * .15, cx, yTop, z + n * .15, cx, yTop, back, x0 - .3, eave + .1, z + n * .15, cx, yTop, back, x0 - .3, eave + .1, back, x1 + .3, eave + .1, z + n * .15, cx, yTop, back, cx, yTop, z + n * .15, x1 + .3, eave + .1, z + n * .15, x1 + .3, eave + .1, back, cx, yTop, back], 3));
  roofFace.computeVertexNormals(); roofFace.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(roofFace.attributes.position.count * 2).fill(0), 2)); parts.schoolRoof.push(roofFace);
  if (!C.window) return {};
  // The great round-arched window over the upper floors.
  const W = C.window, arch = new THREE.Shape(); arch.moveTo(-W.width / 2, 0); arch.lineTo(W.width / 2, 0); arch.lineTo(W.width / 2, W.height - W.width / 2);
  arch.absarc(0, W.height - W.width / 2, W.width / 2, 0, Math.PI, false); arch.closePath();
  const place = (shape, out, color, list, grow = 0) => { const g = new THREE.ShapeGeometry(shape, S.lite ? 5 : 10); if (grow) g.scale(1 + grow / W.width, 1 + grow / W.height, 1); list.push(tint(plain(g.rotateY(n > 0 ? 0 : Math.PI).translate(cx, base + W.sill, z + n * out)), color)); };
  place(arch, .07, S.trim, parts.modern, .5);
  place(arch, .075, S.glass, parts.schoolGlass ?? parts.glass);
  for (const f of [-.25, 0, .25]) front(cx + W.width * f, base + W.sill + (W.height - W.width / 2) / 2, .06, W.height - W.width / 2, .04 + .06);
  for (const f of [.3, .6]) front(cx, base + W.sill + (W.height - W.width / 2) * f, W.width, .06, .1);
  windows.push({ x: cx, y: base + W.sill + W.height * .4, z: z + n * .075, n: [0, n], width: W.width, height: W.height, edge: 'centre', floor: 1, arched: true });
  if (!C.tower) return {};
  // Clock tower: square clock stage, lantern with open arches, dark bell roof and a gilded spire.
  const T = C.tower, tx = cx, tz = T.z, y0 = eave + T.base;
  const block = (w2, h, y, color, list = parts.modern) => list.push(tint(plain(new THREE.BoxGeometry(w2, h, w2).translate(tx, y + h / 2, tz)), color));
  block(T.width, T.stage + (y0 - eave) + .5, eave - .5, S.trim);
  block(T.width + .35, .3, y0 + T.stage, S.trim);
  block(T.width + .2, .25, y0 + T.stage + .3, S.trim);
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const ang = Math.atan2(dx, dz), face = (r, out, color, list) => list.push(tint(plain(new THREE.CircleGeometry(r, S.lite ? 12 : 16).rotateY(ang).translate(tx + dx * (T.width / 2 + out), y0 + T.stage * .55, tz + dz * (T.width / 2 + out))), color));
    face(T.clock + .12, .02, T.clockRim, parts.modern);
    // The dial and hands are dynamic TowerClock instances, outside the baked facade batches (#1067).
  }
  // A dark low pyramid roof over the clock stage, under the lantern.
  parts.schoolRoof.push(new THREE.ConeGeometry((T.width + .4) * Math.SQRT1_2, .7, 4, 1, true).rotateY(Math.PI / 4).toNonIndexed().translate(tx, y0 + T.stage + .55 + .35, tz));
  block(T.lantern, T.lanternHeight, y0 + T.stage + .7, S.trim);
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const ang = Math.atan2(dx, dz), s = new THREE.Shape(), ow = T.lantern * .38, oh = T.lanternHeight * .62;
    s.moveTo(-ow / 2, 0); s.lineTo(ow / 2, 0); s.lineTo(ow / 2, oh - ow / 2); s.absarc(0, oh - ow / 2, ow / 2, 0, Math.PI, false); s.closePath();
    parts.modern.push(tint(plain(new THREE.ShapeGeometry(s, S.lite ? 4 : 8).rotateY(ang).translate(tx + dx * (T.lantern / 2 + .02), y0 + T.stage + 1.0, tz + dz * (T.lantern / 2 + .02))), T.opening));
  }
  const domeY = y0 + T.stage + .7 + T.lanternHeight;
  block(T.lantern + .3, .2, domeY, S.trim);
  const dome = new THREE.LatheGeometry([[T.lantern * .62, 0], [T.lantern * .6, T.dome * .25], [T.lantern * .48, T.dome * .6], [T.lantern * .25, T.dome * .9], [.08, T.dome]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  parts.schoolRoof.push(dome.translate(tx, domeY + .2, tz).toNonIndexed());
  const spire = new THREE.CylinderGeometry(.03, .07, T.spire, 6).translate(tx, domeY + .2 + T.dome + T.spire / 2, tz);
  parts.modern.push(tint(plain(spire), T.gilt));
  parts.modern.push(tint(plain(new THREE.SphereGeometry(.14, 8, 6).translate(tx, domeY + .2 + T.dome + T.spire * .3, tz)), T.gilt));
  return { towerTop: domeY + .2 + T.dome + T.spire,
    clock: { x: tx, y: y0 + T.stage * .55, z: tz, width: T.width, radius: T.clock, faceColor: T.clockFace, handColor: T.clockRim } };
}
