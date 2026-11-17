import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COMPUTER_MEDIA as C, PLAYROOM as R } from './config.js';
import { pcPedestalRect } from './computerfurniture.js';
import { FINISH } from './clubhousematerials.js';

/**
 * #2028 (part of #2023): the SPEL gaming corner's wall decor -- floating shelves over each station (and in the wall gaps between the
 * stations) holding invented figures, game controllers, headsets, game boxes and a little trophy, an original framed game poster in each
 * gap, and one big geometric rug under the stations. Original designs, no brand marks or characters. All plain boxes/cylinders/cones/fans
 * merged into ONE vertex-coloured geometry that joins the room's furniture batch (no light, no extra draw; LED colours above 1.0 glow).
 * The shelves sit between the PC pedestal and the desk's wall side, below the existing wall posters (SPEL posters hang at y 1.5-2.3), and
 * stay inside SPEL's side strips; the rug is flat (top under 1.2 cm) so collisions, contact shadows and the central aisle are unchanged.
 * Every size is a *guess* (no product data), scaled to the child-sized desks.
 */
export const SHELF = { y: 1.3, thick: .03, depth: .15, inset: .05, poster: [.5, .66], posterY: .9, rug: { x: R.x + 6, z: R.z - 1.8, hx: 2.5, hz: 3.0, base: .005, step: .0007, tile: .5 } };

const led = (hue, sat = 1, light = .56, gain = 2.1) => new THREE.Color().setHSL(((hue % 1) + 1) % 1, sat, light).multiplyScalar(gain);
const hueOf = hex => { const o = {}; new THREE.Color(hex).getHSL(o); return o.h; };

/** Collects everything as one non-indexed vertex-coloured geometry (position, normal, colour, finish). */
class Acc {
  constructor() { this.parts = []; this.p = []; this.n = []; this.c = []; this.f = []; }
  geom(g, hex, finish = FINISH.paint) {
    const q = g.index ? g.toNonIndexed() : g, col = hex.isColor ? hex : new THREE.Color(hex), pos = q.attributes.position, nor = q.attributes.normal;
    for (let i = 0; i < pos.count; i++) { this.p.push(pos.getX(i), pos.getY(i), pos.getZ(i)); this.n.push(nor.getX(i), nor.getY(i), nor.getZ(i)); this.c.push(col.r, col.g, col.b); this.f.push(finish); }
    g.dispose(); if (q !== g) q.dispose();
  }
  /** a triangle with a wanted outward normal (winding is fixed to match it) */
  tri(a, b, c, hex, finish, normal) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), Cc = new THREE.Vector3(...c), nn = new THREE.Vector3(...normal);
    const flip = B.clone().sub(A).cross(Cc.clone().sub(A)).dot(nn) < 0, col = hex.isColor ? hex : new THREE.Color(hex);
    for (const v of flip ? [A, Cc, B] : [A, B, Cc]) { this.p.push(v.x, v.y, v.z); this.n.push(...normal); this.c.push(col.r, col.g, col.b); this.f.push(finish); }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('aClubFinish', new THREE.Float32BufferAttribute(this.f, 1));
    return g;
  }
}

/** A wall seen from inside SPEL: `u` runs along the wall (world z), y up, `w` out from the wall face into the room. */
function wallFrame(acc, side, face) {
  const X = w => face + (side < 0 ? w : -w), out = [side < 0 ? 1 : -1, 0, 0];
  const box = (u0, u1, y0, y1, w0, w1, hex, finish = FINISH.paint) => {
    const xa = Math.min(X(w0), X(w1)), xb = Math.max(X(w0), X(w1));
    acc.geom(new THREE.BoxGeometry(xb - xa, y1 - y0, u1 - u0).translate((xa + xb) / 2, (y0 + y1) / 2, (u0 + u1) / 2), hex, finish);
  };
  const cyl = (u, y0, y1, w, r0, r1, hex, seg = 8, finish = FINISH.paint) => acc.geom(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(X(w), (y0 + y1) / 2, u), hex, finish);
  const ball = (u, y, w, rx, ry, rz, hex, finish = FINISH.paint) => acc.geom(new THREE.SphereGeometry(1, 8, 5).scale(rx, ry, rz).translate(X(w), y, u), hex, finish);
  /** a flat polygon (fan from its first corner) on the wall plane at depth w, corners as [u, y] */
  const poly = (pts, w, hex, finish = FINISH.paint) => { for (let i = 1; i < pts.length - 1; i++) acc.tri([X(w), pts[0][1], pts[0][0]], [X(w), pts[i][1], pts[i][0]], [X(w), pts[i + 1][1], pts[i + 1][0]], hex, finish, out); };
  return { box, cyl, ball, poly };
}

const FIGURES = [0x5fb4ff, 0xff8f5a, 0x9be564, 0xc99bff, 0xffd34f, 0xff6f91];
const CASES = [[0x2a6fd6, 0xffd34f], [0xc9356b, 0x66e0d0], [0x2f9e5c, 0xffffff], [0x7a4fd1, 0xff9f45], [0xe0572f, 0x2b2f3a], [0x1fa5b8, 0xf5e663]];

/** One shelf item standing on the plank top `y`, centred at `u`, depth about `.085` from the wall; returns its width along the wall. */
const ITEMS = {
  robot(F, u, y, k) {
    const c = FIGURES[k % 6], w = .085;
    F.box(u - .028, u + .028, y, y + .06, w - .03, w + .03, c, FINISH.metal); F.box(u - .023, u + .023, y + .06, y + .105, w - .025, w + .025, 0xdfe5ee, FINISH.metal);
    F.box(u - .018, u + .018, y + .078, y + .088, w + .025, w + .028, led(hueOf(c), 1, .6, 2.4));
    F.cyl(u, y + .105, y + .14, w, .003, .003, 0x8b9099, 5, FINISH.metal); F.ball(u, y + .142, w, .008, .008, .008, led(hueOf(c) + .5, 1, .6, 2.4));
    for (const s of [-1, 1]) { F.box(u + s * .04 - .007, u + s * .04 + .007, y + .02, y + .058, w - .01, w + .01, 0x8b9099, FINISH.metal); F.box(u + s * .015 - .008, u + s * .015 + .008, y - .0, y + .012, w - .015, w + .015, 0x2a2d36); }
    return .12;
  },
  wizard(F, u, y, k) {
    const c = FIGURES[k % 6], w = .085;
    F.cyl(u, y, y + .075, w, .036, .014, c, 8, FINISH.fabric); F.ball(u, y + .092, w, .02, .02, .02, 0xf2c9a0);
    F.cyl(u, y + .1, y + .17, w, .032, .004, 0x3b2f8f, 8, FINISH.fabric); F.cyl(u, y + .1, y + .106, w, .034, .034, 0xffd34f, 8);
    F.ball(u, y + .18, w, .007, .007, .007, led(.13, 1, .6, 2.4));
    return .1;
  },
  blob(F, u, y, k) {
    const c = FIGURES[k % 6], w = .085;
    F.ball(u, y + .038, w, .052, .04, .05, c, FINISH.paint);
    for (const s of [-1, 1]) { F.ball(u + s * .018, y + .05, w + .04, .014, .014, .01, 0xffffff); F.ball(u + s * .018, y + .05, w + .049, .006, .006, .004, 0x15171d); F.cyl(u + s * .03, y + .068, y + .1, w - .005, .012, .001, 0xfff3c4, 5); }
    F.box(u - .014, u + .014, y + .022, y + .027, w + .045, w + .048, 0x15171d);
    return .12;
  },
  astro(F, u, y, k) {
    const c = FIGURES[k % 6], w = .085;
    F.cyl(u, y, y + .07, w, .03, .03, 0xeef0f4, 8, FINISH.fabric); F.box(u - .02, u + .02, y + .03, y + .055, w + .028, w + .034, c);
    F.ball(u, y + .092, w, .03, .028, .03, 0xeef0f4, FINISH.paint); F.ball(u, y + .092, w + .014, .02, .016, .018, led(.55, .9, .5, 2.2));
    return .1;
  },
  trophy(F, u, y) {
    const w = .085;
    F.box(u - .03, u + .03, y, y + .015, w - .03, w + .03, 0x2a2d36); F.cyl(u, y + .015, y + .05, w, .006, .006, 0xffc94d, 6, FINISH.metal);
    F.cyl(u, y + .05, y + .1, w, .035, .012, 0xffc94d, 8, FINISH.metal); F.ball(u, y + .105, w, .008, .008, .008, led(.13, 1, .6, 2.4));
    return .08;
  },
  ctrl(F, u, y, k) {
    const c = FIGURES[(k + 2) % 6], w = .085, h = hueOf(c);
    F.box(u - .07, u + .07, y + .012, y + .035, w - .035, w + .035, 0x20232b);                        // body
    for (const s of [-1, 1]) { F.box(u + s * .058 - .018, u + s * .058 + .018, y, y + .03, w - .03, w + .04, 0x20232b); F.cyl(u + s * .035, y + .035, y + .043, w + .008, .014, .012, 0x0c0d12, 7); }
    F.box(u - .008, u + .008, y + .0355, y + .0365, w - .02, w + .02, led(h, 1, .6, 2.4));          // lit strip down the middle
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; F.box(u + .05 + Math.cos(a) * .014 - .005, u + .05 + Math.cos(a) * .014 + .005, y + .035, y + .041, w + .012 + Math.sin(a) * .014 - .005, w + .012 + Math.sin(a) * .014 + .005, led(h + i * .2, 1, .6, 2)); }
    F.box(u - .068, u - .042, y + .035, y + .04, w - .02, w + .01, 0x3a3e49);                        // d-pad
    return .17;
  },
  headset(F, u, y, k) {
    const c = FIGURES[(k + 4) % 6], w = .085, h = hueOf(c);
    F.box(u - .035, u + .035, y, y + .01, w - .035, w + .035, 0x15171d, FINISH.metal); F.box(u - .004, u + .004, y + .01, y + .12, w - .004, w + .004, 0x8b9099, FINISH.metal);
    F.box(u - .06, u + .06, y + .125, y + .136, w - .014, w + .014, 0x20232b);
    for (const s of [-1, 1]) { F.box(u + s * .06 - .006, u + s * .06 + .006, y + .075, y + .13, w - .014, w + .014, 0x20232b); F.box(u + s * .066 - .014, u + s * .066 + .014, y + .06, y + .115, w - .03, w + .03, 0x23252d); F.box(u + s * .081 - .001, u + s * .081 + .001, y + .07, y + .105, w - .02, w + .02, led(h, 1, .55, 2.4)); }
    return .17;
  },
  game(F, u, y, k) {
    const [a, b] = CASES[k % 6], [a2, b2] = CASES[(k + 3) % 6];
    const one = (cu, hgt, w, col, acc) => {
      F.box(cu - .035, cu + .035, y, y + hgt, w - .008, w + .008, col, FINISH.paint);
      F.box(cu - .035, cu + .035, y + hgt - .028, y + hgt, w + .008, w + .0095, acc); F.box(cu - .035, cu + .035, y, y + .012, w + .008, w + .0095, 0xf5f2ea);
      F.poly([[cu - .02, y + hgt * .45], [cu, y + hgt * .72], [cu + .02, y + hgt * .45], [cu, y + hgt * .3]], w + .0095, acc);       // emblem: a diamond
      F.box(cu - .028, cu + .028, y + hgt * .2, y + hgt * .24, w + .008, w + .0095, 0xffffff);
    };
    one(u - .04, .17, .075, a, b); one(u + .035, .145, .092, a2, b2);
    return .15;
  },
};
const ORDER = ['robot', 'game', 'ctrl', 'wizard', 'headset', 'game', 'blob', 'trophy', 'ctrl', 'game', 'astro', 'robot', 'headset'];

/** An original framed game poster (about .5 x .66 m): a night sky, a glowing sun, jagged mountains, stars and a block-pixel title strip. */
function poster(F, u, hex) {
  const [pw, ph] = SHELF.poster, y0 = SHELF.posterY - ph / 2, y1 = y0 + ph, hw = pw / 2, s = hueOf(hex);
  F.box(u - hw - .02, u + hw + .02, y0 - .02, y1 + .02, 0, .018, 0x15171d, FINISH.wood);
  const sky = [0x120b3a, 0x2a1166, 0x5a1a7a, 0xa02a82, 0xe2506a, 0xff9a4f];
  const top = y1 - .09, band = (top - (y0 + .06)) / sky.length;
  sky.forEach((c, i) => F.box(u - hw, u + hw, top - (i + 1) * band, top - i * band, .018, .021, new THREE.Color(c)));
  F.box(u - hw, u + hw, top, y1, .018, .021, 0x120b3a);
  const disc = [], cy = y0 + .06 + band * 2.6;
  for (let i = 0; i < 14; i++) disc.push([u + Math.cos(i / 14 * 6.2832) * .105, cy + Math.sin(i / 14 * 6.2832) * .105]);
  F.poly(disc, .0225, led(.1, 1, .6, 1.4));
  F.poly([[u - hw, y0 + .06], [u - .12, y0 + .06 + band * 2.8], [u + .02, y0 + .06], [u - hw, y0 + .06]], .026, 0x143a46);
  F.poly([[u - .1, y0 + .06], [u + .1, y0 + .06 + band * 3.4], [u + hw, y0 + .06]], .0295, 0x0d2a36);
  F.poly([[u + .05, y0 + .06], [u + .17, y0 + .06 + band * 1.7], [u + hw, y0 + .06]], .033, 0x081c26);
  for (let i = 0; i < 9; i++) F.box(u - hw + .03 + (i * .137 % 1) * (pw - .06), u - hw + .036 + (i * .137 % 1) * (pw - .06), top - .02 - (i * .071 % 1) * .13, top - .014 - (i * .071 % 1) * .13, .021, .0225, 0xffffff);
  F.box(u - hw, u + hw, y0, y0 + .06, .018, .021, 0x0a0a14);
  const blocks = [.05, .03, .07, .04, .06, .03, .05, .04, .05];
  let x = u - hw + .035; blocks.forEach((b, i) => { F.box(x, x + b, y0 + .015, y0 + .045, .021, .0235, led(s + i * .09, 1, .58, 1.9)); x += b + .012; });
  F.poly([[u - .04, y1 - .02], [u, y1 - .06], [u + .04, y1 - .02]], .021, led(s, 1, .58, 2));            // a neon chevron over the picture
}

/** The wall decor of one SPEL side: `side` -1 west, +1 east; `stations` are that side's, `face` the wall's x. */
function wallDecor(acc, side, face, stations) {
  const F = wallFrame(acc, side, face), { y, thick, depth, inset } = SHELF, span = [];
  const iv = stations.map(s => { const [, , z0, z1] = pcPedestalRect(s), a = s.z - C.desk.width / 2; return { s, lo: Math.min(a, z0), hi: Math.max(s.z + C.desk.width / 2, z1) }; }).sort((p, q) => p.lo - q.lo);
  iv.forEach((q, i) => { span.push({ lo: q.lo + inset, hi: q.hi - inset, hex: q.s.color }); if (iv[i + 1]) { const g0 = q.hi, g1 = iv[i + 1].lo; span.push({ lo: g0 + .1, hi: g1 - .1, hex: '#9ad7ff', gap: [g0, g1] }); } });
  let k = side < 0 ? 0 : 5;
  for (const sp of span) {
    F.box(sp.lo, sp.hi, y - thick, y, 0, depth, 0x1b1d24, FINISH.wood);
    F.box(sp.lo + .02, sp.hi - .02, y - thick - .004, y - thick, depth - .018, depth - .004, led(hueOf(sp.hex), 1, .55, 2.3));      // lit strip under the front lip
    let u = sp.lo + .07;
    for (let n = 0; ; n++) {
      const name = ORDER[(k + n) % ORDER.length];
      const w = { robot: .12, wizard: .1, blob: .12, astro: .1, trophy: .08, ctrl: .17, headset: .17, game: .15 }[name];
      if (u + w > sp.hi - .03) break;
      ITEMS[name](F, u + w / 2, y, k + n); u += w + .05;
    }
    k += 3;
    if (sp.gap) poster(F, (sp.gap[0] + sp.gap[1]) / 2, sp.hex);
  }
}

/** The big pattern rug (flat quads a few mm above the floor): a woven border, a lattice of the four station colours and a centre medallion. */
function rug(acc, stations) {
  const { x, z, hx, hz, base, step, tile } = SHELF.rug, up = [0, 1, 0], hues = stations.map(s => new THREE.Color(s.color).multiplyScalar(.55));
  const quad = (pts, lvl, hex) => { const col = hex.isColor ? hex : new THREE.Color(hex), pp = pts.map(([a, b]) => [x + a, base + lvl * step, z + b]); acc.tri(pp[0], pp[1], pp[2], col, FINISH.fabric, up); acc.tri(pp[0], pp[2], pp[3], col, FINISH.fabric, up); };
  const rect = (x0, x1, z0, z1, lvl, hex) => quad([[x0, z0], [x0, z1], [x1, z1], [x1, z0]], lvl, hex);
  const diamond = (cx, cz, r, lvl, hex) => quad([[cx, cz - r], [cx - r, cz], [cx, cz + r], [cx + r, cz]], lvl, hex);
  const ring = (a, b, lvl, hex) => { rect(-hx + a, hx - a, -hz + a, -hz + b, lvl, hex); rect(-hx + a, hx - a, hz - b, hz - a, lvl, hex); rect(-hx + a, -hx + b, -hz + b, hz - b, lvl, hex); rect(hx - b, hx - a, -hz + b, hz - b, lvl, hex); };
  rect(-hx, hx, -hz, hz, 0, 0x10142a);
  ring(0, .1, 1, 0x7a1d46); ring(.14, .17, 1, 0xe6b84f); ring(.2, .34, 1, 0x1b2b5c); ring(.38, .41, 1, 0x58d9ec);
  for (let i = 0; i < 2 * Math.floor(hx / .24); i++) { const cx = -hx + .6 + (i + .5) * (2 * hx - 1.2) / (2 * Math.floor(hx / .24)); diamond(cx, -hz + .27, .08, 2, hues[i % 4]); diamond(cx, hz - .27, .08, 2, hues[(i + 2) % 4]); }
  const ix = hx - .6, iz = hz - .6, nx = Math.round(ix * 2 / tile), nz = Math.round(iz * 2 / tile);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const cx = -ix + (i + .5) * ix * 2 / nx, cz = -iz + (j + .5) * iz * 2 / nz;
    if (Math.abs(cx) + Math.abs(cz) < 1.45) continue;
    diamond(cx, cz, .23, 1, hues[(i + 2 * j) % 4]); diamond(cx, cz, .1, 2, 0xe6b84f);
  }
  [[1.2, 0x2a1166], [1.0, 0x58d9ec], [.82, 0x10142a], [.62, 0xc9356b], [.4, 0x1b2b5c], [.22, 0xe6b84f], [.09, 0x10142a]].forEach(([r, c], i) => diamond(0, 0, r, 2 + i, c));
}

/** The clubhouse shelf, poster and rug decor as merged geometry (one part) for the room's furniture batch. */
export function clubhouseShelves() {
  const acc = new Acc(), st = C.stations.filter(s => s.clubhouse);
  for (const side of [-1, 1]) {
    const mine = st.filter(s => (s.yaw > 0 ? -1 : 1) === side);
    wallDecor(acc, side, side < 0 ? mine[0].bounds[0] : mine[0].bounds[1], mine);
  }
  rug(acc, st);
  const g = acc.build(); return [g];
}
