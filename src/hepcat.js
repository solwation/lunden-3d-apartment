import * as THREE from 'three';
import { SITE as S } from './config.js';

// HepCat Store (#127, #261; rebuilt from the user's photos in #1533: docs/foton/hepcat-store-fasad-mot-lunden.jpg and
// docs/foton/hepcat-store-gavel-nr21-soder.jpg). The two SITE.blocks footprints are kept: the brick house (one storey and
// an attic) with white pilasters, paired windows in eared surrounds, a dentil frieze and a stone plinth, a black
// standing-seam roof hipped at the north end and ending in a gable at the south end (nr 21, facing the school nr 20) with
// three pointed-arch windows and a dark double door; the white rendered middle rises two storeys under its own cross gable.
// All metre values are SITE.hepcat.model (*guess*). One 512² canvas atlas for every wall (it replaces the two old bay
// textures, one draw call fewer), the roof in the old metal batch, the chimney and downpipes in the old chimney batch.

const W = 512, H = 512; // the atlas in px
const BRICK = '#a4553b', MORTAR = '#cdbfae', WHITE = '#f1efe8', SHADE = '#d3cfc6', GLASS0 = '#5f7383', GLASS1 = '#26323b';

const blocks = () => ({ b: S.blocks.find((q) => q.style === 'hepcat'), w: S.blocks.find((q) => q.style === 'hepcatWhite') });

/** The house's dimensions from the two footprints and SITE.hepcat.model. */
function spec() {
  const { b, w } = blocks();
  if (!b || !w) return null;
  const M = S.hepcat.model, E = b.base + S.hepcat.storey, hw = (b.x1 - b.x0) / 2, whz = (w.z1 - w.z0) / 2, WE = w.base + S.hepcatWhite.storey;
  return {
    b, w, M, E, WE, hw, whz, cx: (b.x0 + b.x1) / 2, wcz: (w.z0 + w.z1) / 2,
    R: E + M.pitch * hw,                 // the wing ridge
    WR: WE + M.whitePitch * whz,          // the middle's ridge
    hipZ: b.z0 + hw,                      // where the north hip meets the ridge (the hip as steep as the sides)
  };
}

// ---------- the atlas: panels drawn in metres, y up from each panel's bottom ----------
const P = () => S.hepcat.model.pxPerM;
// [x, y (top), w, h] in px; set in hepcatTexture() from the model
const panels = {};
function layout(s) {
  const p = P(), bw = Math.round(S.hepcat.bay * p), bh = Math.round(s.E * p);
  panels.bay = [0, 0, bw, bh];                                        // a wing bay (long sides, north end)
  panels.gableW = [bw + 4, 0, bw, bh];                                // nr 21, west half: two windows
  panels.gableE = [2 * bw + 8, 0, bw, bh];                            // nr 21, east half: the double door
  panels.tri = [0, bh + 4, Math.round(2 * s.hw * p), Math.round((s.R - s.E) * p)]; // the gable over nr 21
  panels.white = [panels.tri[2] + 4, bh + 4, Math.round(2 * s.whz * p), Math.round((s.WR - s.w.base) * p)]; // the middle's front
  panels.plain = [0, panels.tri[1] + panels.tri[3] + 4, 24, 24];      // plain white render (returns, bargeboards)
  panels.stone = [28, panels.plain[1], 300, 80];                      // fieldstone for the plinth skirts down the slope
  for (const [k, r] of Object.entries(panels)) if (r[0] + r[2] > W || r[1] + r[3] > H) throw new Error(`hepcat atlas: ${k} does not fit`);
}

function rng(seed) { let t = seed >>> 0; return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** The façade atlas (one CanvasTexture). */
export function hepcatTexture() {
  const s = spec(), p = P();
  layout(s);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = WHITE; g.fillRect(0, 0, W, H);
  const M = s.M, rand = rng(1533);
  const inPanel = ([x, y, w, h], draw) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y + h); g.scale(p, -p); draw(w / p, h / p); g.restore(); };
  const rect = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const brick = (w, h) => {
    rect(MORTAR, 0, 0, w, h);
    const bw = 0.25, bh = 0.075;
    for (let r = 0; r * bh < h; r++) for (let x = (r % 2) * -bw / 2; x < w; x += bw) {
      const k = (rand() - 0.5) * 22, l = (rand() - 0.5) * 14;
      g.fillStyle = `rgb(${164 + k + l},${85 + k * 0.5},${59 + k * 0.3})`;
      g.fillRect(x + 0.012, r * bh + 0.012, bw - 0.024, bh - 0.02);
    }
  };
  const stone = (x, w, h) => { // fieldstone / split granite plinth
    rect('#6f675c', x, 0, w, h);
    for (let k = 0; k < w * h * 40; k++) {
      const sx = x + rand() * w, sy = rand() * h, sw = 0.12 + rand() * 0.2, sh = 0.08 + rand() * 0.12, v = 120 + rand() * 70;
      g.fillStyle = `rgb(${v + 12},${v * 0.92},${v * 0.78})`; g.fillRect(sx, sy, sw, sh);
    }
  };
  inPanel(panels.stone, (w, h) => stone(0, w, h));
  const dentils = (w, y0, y1) => { // the white toothed frieze under the eaves: a band and blocks hanging under it
    rect(WHITE, 0, y1 - 0.14, w, 0.14);
    for (let x = 0.12; x < w; x += 0.34) rect(WHITE, x, y0, 0.16, y1 - y0);
  };
  const glass = (x, y, w, h) => {
    const gr = g.createLinearGradient(0, y + h, 0, y); gr.addColorStop(0, GLASS0); gr.addColorStop(1, GLASS1);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  const sash = (x, y, w, h) => { rect('#fbfaf6', x - 0.06, y - 0.06, w + 0.12, h + 0.12); glass(x, y, w, h); rect('#fbfaf6', x, y + h * 0.62, w, 0.05); };
  /** A pair of windows in a white surround with "ears" and a T-shaped head, centred at cx (the photos' wing windows). */
  const pair = (cx, sill, lw, lh, gap, outline) => {
    const ow = 2 * lw + gap + 0.3, top = sill + lh;
    rect(WHITE, cx - ow / 2, sill - 0.1, ow, lh + 0.25);                   // the surround
    rect(WHITE, cx - ow / 2 - 0.22, top + 0.1, ow + 0.44, 0.28);            // the head with its ears
    rect(WHITE, cx - ow / 2 - 0.22, top - 0.05, 0.12, 0.2); rect(WHITE, cx + ow / 2 + 0.1, top - 0.05, 0.12, 0.2);
    rect(WHITE, cx - ow / 2 - 0.08, sill - 0.2, ow + 0.16, 0.12);           // the sill
    if (outline) { g.strokeStyle = SHADE; g.lineWidth = 0.03; g.strokeRect(cx - ow / 2 - 0.22, top + 0.1, ow + 0.44, 0.28); g.strokeRect(cx - ow / 2, sill - 0.1, ow, lh + 0.25); }
    sash(cx - gap / 2 - lw, sill, lw, lh); sash(cx + gap / 2, sill, lw, lh);
  };
  const text = (str, x, y, size, col) => { g.save(); g.translate(x, y); g.scale(1 / p, -1 / p); g.fillStyle = col; g.font = `bold ${Math.round(size * p)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(str, 0, 0); g.restore(); };
  const hp = M.pilaster / 2, pr = M.pair;

  // a wing bay: half a pilaster at each edge (two meet as one pilaster or wrap a corner)
  const bay = (w, h) => {
    brick(w, h);
    rect(WHITE, 0, 0, hp, h); rect(WHITE, w - hp, 0, hp, h);
    dentils(w, h - 0.85, h - 0.45); // under the eave's edge (the roof plane runs out over it, E - pitch * overhang)
    stone(0, w, M.plinth);
  };
  inPanel(panels.bay, (w, h) => { bay(w, h); pair(w / 2, pr.sill, pr.w, pr.h, pr.gap); });
  // nr 21 at ground level: a white band at the door head, the frieze under the gable's band
  const gable = (w, h) => {
    brick(w, h);
    rect(WHITE, 0, 0, hp, h); rect(WHITE, w - hp, 0, hp, h);
    rect(WHITE, 0, 2.55, w, 0.2);
    dentils(w, h - 0.45, h);
    stone(0, w, M.plinth);
  };
  inPanel(panels.gableW, (w, h) => {
    gable(w, h);
    rect(WHITE, 0.45, M.plinth, w - 0.9, 2.1);                                // the rendered window panel
    for (const [cx, word] of [[1.25, 'HEP'], [w - 1.25, 'CAT']]) {
      sash(cx - 0.42, 0.85, 0.84, 1.5);
      if (word === 'HEP') { rect('#ece9e2', cx - 0.4, 0.9, 0.8, 1.4); [...'HEP'].forEach((ch, i) => text(ch, cx - 0.17, 2.0 - i * 0.42, 0.36, '#6a2430')); [...'CAT'].forEach((ch, i) => text(ch, cx + 0.17, 1.8 - i * 0.42, 0.36, '#6a2430')); }
    }
  });
  inPanel(panels.gableE, (w, h) => {
    gable(w, h);
    const d = M.door, x = (w - d.w) / 2;
    rect(WHITE, x - 0.1, 0, d.w + 0.2, d.h + 0.12);
    rect('#2b2f31', x, 0, d.w, d.h); rect('#3a3f42', x + 0.08, 0.1, d.w / 2 - 0.12, d.h - 0.2); rect('#3a3f42', x + d.w / 2 + 0.04, 0.1, d.w / 2 - 0.12, d.h - 0.2);
    rect('#f4f3ee', 0.02, 2.88, 0.2, 0.22); text('21', 0.12, 2.99, 0.16, '#222');  // the house number on the middle pilaster
  });
  // the gable triangle over nr 21: brick, white rakes, three pointed-arch windows with leaded lattice, the middle highest
  inPanel(panels.tri, (w, h) => {
    brick(w, h);
    rect(WHITE, 0, 0, w, 0.12);
    g.strokeStyle = WHITE; g.lineWidth = 0.32; g.beginPath(); g.moveTo(0, 0); g.lineTo(w / 2, h); g.lineTo(w, 0); g.stroke();
    const arch = (cx, y0, aw, ah, grow = 0) => { // an equilateral pointed arch: two arcs of radius = span
      const r = aw + 2 * grow, x0 = cx - aw / 2 - grow, y = y0 - grow, ys = y + ah + grow - r * Math.sqrt(3) / 2;
      g.beginPath(); g.moveTo(x0, y);
      for (let i = 0; i <= 8; i++) { const t = Math.PI - (i / 8) * Math.PI / 3; g.lineTo(x0 + r + r * Math.cos(t), ys + r * Math.sin(t)); }
      for (let i = 1; i <= 8; i++) { const t = Math.PI / 3 - (i / 8) * Math.PI / 3; g.lineTo(x0 + r * Math.cos(t), ys + r * Math.sin(t)); }
      g.lineTo(x0 + r, y); g.closePath();
    };
    for (const [cx, aw, ah] of [[w / 2 - 0.85, 0.42, 1.25], [w / 2, 0.52, 1.75], [w / 2 + 0.85, 0.42, 1.25]]) {
      arch(cx, 0.45, aw, ah, 0.1); g.fillStyle = WHITE; g.fill();
      arch(cx, 0.45, aw, ah); g.fillStyle = GLASS1; g.fill();
      g.save(); g.clip(); g.strokeStyle = '#c9ccc8'; g.lineWidth = 0.025;
      for (let k = -2; k < 2.5; k += 0.18) { g.beginPath(); g.moveTo(cx - 1, 0.45 + k); g.lineTo(cx + 1, 1.45 + k); g.moveTo(cx - 1, 1.45 + k); g.lineTo(cx + 1, 0.45 + k); g.stroke(); }
      g.restore();
    }
  });
  // the white middle's front: render, a grey plinth, eared pairs on both floors, a round vent in the gable
  inPanel(panels.white, (w, h) => {
    rect(WHITE, 0, 0, w, h);
    for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(150,145,135,${0.012 + rand() * 0.018})`; g.fillRect(rand() * w, rand() * h, 0.3 + rand() * 0.6, 0.2 + rand()); }
    rect('#9b968d', 0, 0, w, 0.3);
    pair(w / 2, pr.sill, pr.w, pr.h, pr.gap, true);
    pair(w / 2, 4.05, 0.45, 1.0, 0.12, true);
    rect(SHADE, 0, s.WE - s.w.base - 0.05, w, 0.05);
    g.fillStyle = '#4b4f52'; g.beginPath(); g.arc(w / 2, s.WE - s.w.base + 0.75, 0.16, 0, Math.PI * 2); g.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------- geometry ----------
/** atlas uv for panel `k` at (sm, tm) metres from its bottom-left */
const uvAt = (k, sm, tm) => { const [x, y, , h] = panels[k], p = P(); return [(x + sm * p) / W, 1 - (y + h - tm * p) / H]; };

class Batch {
  constructor(uv) { this.pos = []; this.nor = []; this.uv = uv ? [] : null; }
  /** a convex polygon (fan); flips the winding so the face normal points along `want` (or up) */
  poly(pts, uvs, want) {
    const a = new THREE.Vector3(...pts[0]), n = new THREE.Vector3().subVectors(new THREE.Vector3(...pts[1]), a).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...pts[2]), a)).normalize();
    const ref = want ? new THREE.Vector3(...want) : new THREE.Vector3(0, 1, 0);
    let order = pts.map((_, i) => i);
    if (n.dot(ref) < 0) { order = order.reverse(); n.negate(); }
    for (let i = 1; i + 1 < order.length; i++) for (const j of [order[0], order[i], order[i + 1]]) {
      this.pos.push(...pts[j]); this.nor.push(n.x, n.y, n.z);
      if (this.uv) this.uv.push(...(uvs ? uvs[j] : [0, 0]));
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/** A wall face seen from outside: `l`/`r` its bottom-left/right [x, z], from y0 to y1, mapped onto panel k (s from sOff). */
function wall(B, k, l, r, y0, y1, n, sOff = 0, tOff = 0) {
  const len = Math.hypot(r[0] - l[0], r[1] - l[1]);
  B.poly([[l[0], y0, l[1]], [r[0], y0, r[1]], [r[0], y1, r[1]], [l[0], y1, l[1]]],
    [uvAt(k, sOff, tOff), uvAt(k, sOff + len, tOff), uvAt(k, sOff + len, tOff + y1 - y0), uvAt(k, sOff, tOff + y1 - y0)], n);
}
/** `n` bays of panel k along a face from l to r */
function bays(B, k, l, r, y0, y1, n, count) {
  for (let i = 0; i < count; i++) {
    const a = i / count, c = (i + 1) / count;
    wall(B, k, [l[0] + (r[0] - l[0]) * a, l[1] + (r[1] - l[1]) * a], [l[0] + (r[0] - l[0]) * c, l[1] + (r[1] - l[1]) * c], y0, y1, n);
  }
}
const plainUV = () => [uvAt('plain', 0.1, 0.1), uvAt('plain', 0.4, 0.1), uvAt('plain', 0.4, 0.4), uvAt('plain', 0.1, 0.4)];

/** A plinth skirt (surroundings.js plinth(): merged boxes with 0…1 uvs per face) mapped onto the atlas' stone plinth. */
export function hepcatStone(geo) {
  if (!panels.bay) layout(spec());
  const uv = geo.attributes.uv, p = geo.attributes.position, n = geo.attributes.normal, sw = panels.stone[2] / P() - 0.1, sh = panels.stone[3] / P() - 0.1;
  for (let f = 0; f + 6 <= uv.count; f += 6) { // one box face = 6 vertices: stone in metres from its lower left
    const along = (i) => (Math.abs(n.getX(f)) > 0.5 ? p.getZ(i) : p.getX(i));
    let a0 = Infinity, y0 = Infinity;
    for (let i = f; i < f + 6; i++) { a0 = Math.min(a0, along(i)); y0 = Math.min(y0, p.getY(i)); }
    for (let i = f; i < f + 6; i++) uv.setXY(i, ...uvAt('stone', 0.05 + Math.min(sw, along(i) - a0), 0.05 + Math.min(sh, p.getY(i) - y0)));
  }
  return geo;
}

/** The house: { walls (uv, the atlas), roof, dark (chimney, downpipes), roofY(x, z), lights } or null without the blocks. */
export function buildHepcat() {
  const s = spec();
  if (!s) return null;
  if (!panels.bay) layout(s);
  const { b, w, M, E, WE, R, WR, cx, wcz, whz, hipZ } = s, y0 = b.base;
  const Wl = new Batch(true), Rf = new Batch(true), Dk = [];
  const nb = (len) => Math.max(1, Math.round(len / S.hepcat.bay));
  // the wings' long sides and the north end (the parts of the long sides behind the middle are its walls)
  for (const [z0, z1] of [[b.z0, w.z0], [w.z1, b.z1]]) {
    bays(Wl, 'bay', [b.x0, z0], [b.x0, z1], y0, E, [-1, 0, 0], nb(z1 - z0));
    bays(Wl, 'bay', [b.x1, z1], [b.x1, z0], y0, E, [1, 0, 0], nb(z1 - z0));
  }
  bays(Wl, 'bay', [b.x1, b.z0], [b.x0, b.z0], y0, E, [0, 0, -1], nb(b.x1 - b.x0));
  // nr 21: the south gable (west half windows, east half the door) and its triangle up to the ridge
  wall(Wl, 'gableW', [b.x0, b.z1], [cx, b.z1], y0, E, [0, 0, 1]);
  wall(Wl, 'gableE', [cx, b.z1], [b.x1, b.z1], y0, E, [0, 0, 1]);
  Wl.poly([[b.x0, E, b.z1], [b.x1, E, b.z1], [cx, R, b.z1]], [uvAt('tri', 0, 0), uvAt('tri', 2 * s.hw, 0), uvAt('tri', s.hw, R - E)], [0, 0, 1]);
  // the white middle: front and back with their gables, plain returns on its north and south sides
  for (const [x, l, r, n] of [[w.x0, w.z0, w.z1, -1], [w.x1, w.z1, w.z0, 1]]) {
    wall(Wl, 'white', [x, l], [x, r], w.base, WE, [n, 0, 0]);
    Wl.poly([[x, WE, l], [x, WE, r], [x, WR, wcz]], [uvAt('white', 0, WE - w.base), uvAt('white', 2 * whz, WE - w.base), uvAt('white', whz, WR - w.base)], [n, 0, 0]);
  }
  for (const [z, l, r, n] of [[w.z0, w.x1, w.x0, -1], [w.z1, w.x0, w.x1, 1]])
    Wl.poly([[l, w.base, z], [r, w.base, z], [r, WE, z], [l, WE, z]], plainUV(), [0, 0, n]);
  // white bargeboards under the verges (nr 21 and both ends of the cross gable)
  const board = (a, apex, c, n, off, d = 0.22) => { // two strips along a gable's rakes, `off` pushes them out along n
    for (const [p, q] of [[a, apex], [apex, c]]) {
      const P0 = p.map((v, i) => v + n[i] * off), Q0 = q.map((v, i) => v + n[i] * off);
      Wl.poly([[P0[0], P0[1] - d, P0[2]], [Q0[0], Q0[1] - d, Q0[2]], Q0, P0], plainUV(), n);
    }
  };
  const vz = b.z1 + M.verge - 0.04, eS = E - M.pitch * M.overhang;
  board([b.x0 - M.overhang, eS, vz], [cx, R, vz], [b.x1 + M.overhang, eS, vz], [0, 0, 1], 0);
  const wo = M.whiteOverhang, wEv = WE - M.whitePitch * wo;
  for (const [x, n] of [[w.x0 - 0.4 + 0.04, -1], [w.x1 + 0.4 - 0.04, 1]]) board([x, wEv, w.z0 - wo], [x, WR, wcz], [x, wEv, w.z1 + wo], [n, 0, 0], 0);

  // ---------- roofs: black standing seam, raised seams every 0.5 m ----------
  const o = M.overhang, k = M.pitch, xa = b.x0 - o, xb = b.x1 + o, zn = b.z0 - o, zs = b.z1 + M.verge;
  const yAt = (x) => E + k * (s.hw - Math.abs(x - cx));
  // each long slope in three parts: north (to the hip), behind the middle (eaves trimmed to the wall line), south
  for (const [xe, xw] of [[xa, b.x0], [xb, b.x1]]) {
    Rf.poly([[xe, eS, zn], [xe, eS, w.z0], [cx, R, w.z0], [cx, R, hipZ]]);
    Rf.poly([[xw, E, w.z0], [xw, E, w.z1], [cx, R, w.z1], [cx, R, w.z0]]);
    Rf.poly([[xe, eS, w.z1], [xe, eS, zs], [cx, R, zs], [cx, R, w.z1]]);
  }
  Rf.poly([[xa, eS, zn], [xb, eS, zn], [cx, R, hipZ]]); // the north hip
  const wx0 = w.x0 - 0.4, wx1 = w.x1 + 0.4;
  for (const z of [w.z0 - wo, w.z1 + wo]) Rf.poly([[wx0, wEv, z], [wx1, wEv, z], [wx1, WR, wcz], [wx0, WR, wcz]]); // the cross gable
  // fascias: a dark edge under the eaves and verges gives the sheet its thickness
  const fas = (p, q, d = 0.12) => Rf.poly([[p[0], p[1] - d, p[2]], [q[0], q[1] - d, q[2]], q, p], null, [q[2] - p[2], 0, p[0] - q[0]]);
  for (const [p, q] of [[[xa, eS, zs], [xa, eS, w.z1]], [[xa, eS, w.z0], [xa, eS, zn]], [[xb, eS, zn], [xb, eS, w.z0]], [[xb, eS, w.z1], [xb, eS, zs]], [[xa, eS, zn], [xb, eS, zn]], [[xb, eS, zs], [cx, R, zs]], [[cx, R, zs], [xa, eS, zs]],
    [[wx0, wEv, w.z0 - wo], [wx1, wEv, w.z0 - wo]], [[wx1, wEv, w.z1 + wo], [wx0, wEv, w.z1 + wo]]]) fas(p, q); // (the roof material is double-sided)
  // seams: a low tent from the eave to the ridge (or the hip line)
  const seam = (A, B, L, N, h = 0.04, sw = 0.025) => {
    const add = (v, d, f) => v.map((c, i) => c + d[i] * f);
    Rf.poly([add(A, L, -sw), add(B, L, -sw), add(B, N, h), add(A, N, h)]);
    Rf.poly([add(A, N, h), add(B, N, h), add(B, L, sw), add(A, L, sw)]);
  };
  const len = Math.hypot(1, k);
  for (const sx of [-1, 1]) {
    const xe = sx < 0 ? xa : xb, N = [sx * k / len, 1 / len, 0];
    for (let z = zn + 0.3; z < zs - 0.1; z += 0.5) {
      if (z > w.z0 - wo && z < w.z1 + wo) continue; // under the cross gable
      const xr = z < hipZ ? xe + sx * -(z - zn) : cx; // the hip line runs at 45° in plan
      seam([xe, eS, z], [xr, yAt(xr), z], [0, 0, 1], N);
    }
  }
  const wl = Math.hypot(1, M.whitePitch);
  for (const sz of [-1, 1]) for (let x = wx0 + 0.25; x < wx1; x += 0.5)
    seam([x, wEv, wcz + sz * (whz + wo)], [x, WR, wcz], [1, 0, 0], [0, 1 / wl, sz * M.whitePitch / wl]);

  // ---------- chimney and downpipes (dark) ----------
  const [chx, chz, chs, chh] = M.chimney, chBase = yAt(chx + chs / 2) - 0.6;
  Dk.push(new THREE.BoxGeometry(chs, R + chh - chBase, chs).translate(chx, (R + chh + chBase) / 2, chz));
  Dk.push(new THREE.BoxGeometry(chs + 0.12, 0.08, chs + 0.12).translate(chx, R + chh, chz));
  for (const z of [w.z0 - 0.15, w.z1 + 0.15]) Dk.push(new THREE.BoxGeometry(0.09, E - 0.2 - y0, 0.09).translate(b.x0 - 0.12, y0 + (E - 0.2 - y0) / 2, z));

  // the walkable roof: the higher of the wing roof (hip at the north end) and the cross gable
  const roofY = (x, z) => {
    let y = -Infinity;
    if (x >= xa && x <= xb && z >= zn && z <= zs) y = Math.min(yAt(x), E + k * (z - b.z0));
    if (x >= wx0 && x <= wx1 && Math.abs(z - wcz) <= whz + wo) y = Math.max(y, WE + M.whitePitch * (whz - Math.abs(z - wcz)));
    if (Math.abs(x - chx) < chs / 2 && Math.abs(z - chz) < chs / 2) y = Math.max(y, R + chh);
    return y;
  };
  // lit windows (buildWindowLights): one quad per window pair, the quad is 1.25 x 1.45 m at scale 1
  const lights = [], pr = M.pair, pw = 2 * pr.w + pr.gap, ly = y0 + pr.sill + pr.h / 2, ls = [pw / 1.25, pr.h / 1.45, 1];
  for (const [z0, z1] of [[b.z0, w.z0], [w.z1, b.z1]]) {
    const n = nb(z1 - z0);
    for (let i = 0; i < n; i++) { const z = z0 + (i + 0.5) * (z1 - z0) / n; lights.push({ x: b.x0 - 0.03, y: ly, z, n: [-1, 0], s: ls }, { x: b.x1 + 0.03, y: ly, z, n: [1, 0], s: ls }); }
  }
  for (const [x, n] of [[w.x0 - 0.03, -1], [w.x1 + 0.03, 1]]) lights.push({ x, y: ly, z: wcz, n: [n, 0], s: ls }, { x, y: w.base + 4.05 + 0.5, z: wcz, n: [n, 0], s: [1.02 / 1.25, 1 / 1.45, 1] });
  for (const dx of [-(s.hw - 1.25), -1.25]) lights.push({ x: cx + dx, y: y0 + 1.6, z: b.z1 + 0.03, n: [0, 1], s: [0.84 / 1.25, 1.5 / 1.45, 1] });
  return { walls: Wl.geometry(), roof: Rf.geometry(), dark: Dk.map((g) => g.toNonIndexed()), roofY, lights, spec: s };
}
