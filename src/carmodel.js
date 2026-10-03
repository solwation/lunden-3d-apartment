import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Car bodies (#250, #251): built from a side profile (car frame: facing +x, y up, z to the right, y = 0 the road).
// The profile is three lines along the car — `top` (bumper, bonnet, windscreen, roof, tail), `belt` (the window line)
// and `bot` (the underside) — plus the wheels. The lower body is extruded across the car from the outline between
// `bot` (with the wheel arches cut out) and the belt / bonnet / tail, rounded off at the edges and in plan towards
// the bumpers; above the belt sit the roof, the glass and the pillars, leaning in (tumblehome).
// `buildCar(spec, { doors })`: with `doors` the sides between the A and C pillars are four doors on hinges (our Megane,
// car.js), the cabin is open and furnished; without, one closed body (the parked cars, streetlife.js), merged per
// material for instancing.

/** Renault Megane E-Tech Electric (2022–): 4.20 × 1.78 × 1.50 m, wheelbase 2.69 m (Renault's data); the profile
 * heights are read off Renault's side views (our estimate). */
export const MEGANE = {
  L: 4.2, W: 1.78, wheelbase: 2.69, wheelR: 0.355, arch: 0.43,
  top: [[2.1, 0.56], [2.08, 0.7], [1.97, 0.8], [1.5, 0.9], [1.05, 0.97], [0.65, 1.22], [0.22, 1.45], [-0.1, 1.5], [-0.8, 1.48],
    [-1.3, 1.39], [-1.62, 1.25], [-1.8, 1.2], [-1.95, 1.08], [-2.08, 0.98], [-2.11, 0.72], [-2.09, 0.5]],
  belt: [[1.05, 0.97], [0.0, 1.0], [-1.6, 1.08], [-1.95, 1.08]],
  bot: [[2.08, 0.32], [1.85, 0.26], [1.0, 0.21], [-1.0, 0.21], [-1.85, 0.27], [-2.08, 0.34]],
  doors: [0.9, 0.0, -0.87], // the front door's front edge, the B pillar, the rear door's rear edge (x)
  lean: 0.16,               // rad: the glasshouse leans in
};

/** Linear interpolation in a table of [x, y] sorted by falling x. */
export function lerpTable(t, x) {
  if (x >= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x >= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y1 + (y0 - y1) * (x - x1) / (x0 - x1); }
  return t.at(-1)[1];
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The profile lines of a spec as functions of x. */
function lines(S) {
  const wx = S.wheelbase / 2;
  const top = (x) => lerpTable(S.top, x), belt = (x) => lerpTable(S.belt, x);
  const arch = (x) => { const d = Math.min(Math.abs(x - wx), Math.abs(x + wx)); return d < S.arch ? S.wheelR + Math.sqrt(S.arch * S.arch - d * d) : -1; };
  const bot = (x) => Math.max(lerpTable(S.bot, x), arch(x));
  const lowerTop = (x) => (x >= S.belt[0][0] || x <= S.belt.at(-1)[0] ? top(x) : belt(x));
  return { top, belt, bot, lowerTop, wx };
}

/** Half the width at x (rounded in plan towards the bumpers). */
const planK = (S, x) => 1 - 0.2 * Math.pow(smooth(S.L / 2 - 0.6, S.L / 2 + 0.02, Math.abs(x)), 1.6);

/** A shape from points [[x, y], …]; holes likewise. */
function shape(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  s.holes = holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}

/** Extrude a side outline `width` across (centred on z = 0 unless z0 given), with rounded edges; then `fz(x, y, z)` may
 * move z (plan rounding); smooth normals. */
function extrude(sh, width, { bevel = 0.04, segs = 3, z0 = null, fz = null } = {}) {
  const depth = Math.max(0.002, width - 2 * bevel);
  let g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 4 });
  g.translate(0, 0, z0 ?? -depth / 2);
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.clearGroups();
  g = mergeVertices(g, 1e-5);
  if (fz) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, fz(p.getX(i), p.getY(i), p.getZ(i))); }
  g.computeVertexNormals();
  return g;
}

/** Points along f(x) from x0 to x1 (either direction) every `step` m. */
function along(f, x0, x1, step = 0.05) {
  const n = Math.max(2, Math.ceil(Math.abs(x1 - x0) / step)), out = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * (i / n); out.push([x, f(x)]); }
  return out;
}

const rbox = (sx, sy, sz, x, y, z, r = 0.02) => new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r, sx / 2.01, sy / 2.01, sz / 2.01)).translate(x, y, z);
const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };

/** Collects geometries per material name and merges them. */
class Parts {
  constructor() { this.by = {}; }
  add(name, ...geos) { (this.by[name] ??= []).push(...geos); return this; }
  merged(name) { const l = this.by[name]; return l?.length ? mergeGeometries(l.map(clean)) : null; }
  names() { return Object.keys(this.by); }
}

/** The new Renault logo (2021): two interlocked rhombus outlines, chrome on transparent. */
let logoTex = null;
export function renaultLogo() {
  if (logoTex) return logoTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#e8ecef'; g.lineWidth = 10; g.lineJoin = 'miter';
  const rh = (cx, cy) => { g.beginPath(); g.moveTo(cx, cy - 34); g.lineTo(cx + 22, cy); g.lineTo(cx, cy + 34); g.lineTo(cx - 22, cy); g.closePath(); g.stroke(); };
  rh(64, 48); rh(64, 80);
  logoTex = new THREE.CanvasTexture(c); logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = 4;
  return logoTex;
}

/** The OpenR screens' picture: the driver's display (speed, range) and the centre screen (a map, Google built in). */
let screenTex = null;
function screenTexture() {
  if (screenTex) return screenTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#05080c'; g.fillRect(0, 0, 512, 160);
  // driver's display (left half): speed, gear, range
  g.fillStyle = '#e9eef5'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText('0', 120, 92);
  g.font = '16px sans-serif'; g.fillStyle = '#8fa3b8'; g.fillText('km/h', 120, 116); g.fillText('P', 40, 92);
  g.fillStyle = '#2bd17e'; g.fillRect(170, 128, 70, 6); g.fillStyle = '#8fa3b8'; g.fillText('412 km', 205, 150);
  // centre screen (right half): a map
  g.fillStyle = '#1d2a35'; g.fillRect(262, 6, 244, 148);
  g.strokeStyle = '#3d5466'; g.lineWidth = 8;
  for (const [a, b, d, e] of [[262, 60, 506, 90], [330, 6, 360, 154], [430, 6, 410, 154]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(d, e); g.stroke(); }
  g.strokeStyle = '#4aa3ff'; g.lineWidth = 5; g.beginPath(); g.moveTo(345, 154); g.lineTo(352, 78); g.lineTo(450, 90); g.stroke();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(345, 140, 7, 0, 7); g.fill();
  screenTex = new THREE.CanvasTexture(c); screenTex.colorSpace = THREE.SRGBColorSpace;
  return screenTex;
}

/**
 * Build a car. Returns { group, parts (closed body: per-material geometries, no group), doors: [{ pivot, side, front }],
 * seats: [{ x, y, z, name }], materials }.
 * opts: { doors: true → hinged doors + interior (our car), paint: hex }.
 */
export function buildCar(S = MEGANE, { doors: withDoors = false, paint = 0xf2f2ee } = {}) {
  const P = new Parts(), { top, belt, bot, lowerTop, wx } = lines(S), W = S.W, hw = W / 2, [xA, xB, xC] = S.doors;
  const shoulder = (y) => 0.055 * smooth(0.78, 1.06, y) + 0.035 * smooth(0.45, 0.22, y); // the sides round in to the belt and tuck in below
  const fzPlan = (x, y, z) => z * planK(S, x) * (1 - shoulder(y)); // rounded in plan too
  // ---- the lower body: one piece (closed car) or a front and a rear block with a sill between (doors)
  const lower = (x0, x1) => shape([...along(lowerTop, x0, x1), ...along(bot, x1, x0)]);
  if (withDoors) {
    P.add('paint', extrude(lower(S.L / 2, xA), W, { bevel: 0.05, fz: fzPlan }), extrude(lower(xC, -S.L / 2), W, { bevel: 0.05, fz: fzPlan }));
    P.add('paint', rbox(xA - xC, 0.08, W - 0.04, (xA + xC) / 2, 0.255, 0, 0.03)); // the sill under the doors
  } else P.add('paint', extrude(lower(S.L / 2, -S.L / 2), W, { bevel: 0.05, fz: fzPlan }));
  // black cladding: the wheel arches and along the sills, the lower bumpers
  for (const x of [wx, -wx]) for (const s of [-1, 1]) {
    P.add('black', new THREE.TorusGeometry(S.arch + 0.015, 0.035, 6, 22, Math.PI).translate(x, S.wheelR, s * (hw * planK(S, x) - 0.005)));
  }
  for (const s of [-1, 1]) P.add('black', rbox(2 * (wx - S.arch) - 0.02, 0.07, 0.04, 0, 0.25, s * (hw - 0.005), 0.02));
  P.add('black', rbox(0.06, 0.12, W * 0.66, S.L / 2 + 0.03, 0.34, 0, 0.03), rbox(0.06, 0.14, W * 0.7, -S.L / 2 - 0.03, 0.36, 0, 0.03)); // lower bumpers
  P.add('black', rbox(0.04, 0.1, W * 0.42, S.L / 2 + 0.045, 0.45, 0, 0.02)); // the lower grille
  // ---- glasshouse: windscreen, roof (black), rear glass, spoiler, pillars
  const lean = S.lean, rise = 0.48, roofHW = hw - 0.03 - Math.sin(lean) * rise; // the roof's half width where the sides lean in to
  const band = (x0, x1, t) => shape([...along(top, x0, x1), ...along((x) => top(x) - t, x1, x0)]);
  const xW0 = S.top.find(([x]) => x <= 1.06)[0], xW1 = 0.22, xR = -0.95, xG = -1.62;
  P.add('glass', extrude(band(xW0, xW1, 0.02), 2 * hw - 0.08, { bevel: 0.01, segs: 1, fz: (x, y, z) => z * (1 - 0.1 * smooth(1.0, 1.45, y)) }));
  P.add('roof', extrude(band(xW1 + 0.02, xR, 0.05), 2 * roofHW + 0.02, { bevel: 0.025 }));
  P.add('glass', extrude(band(xR, xG, 0.03), 2 * roofHW - 0.02, { bevel: 0.01, segs: 1 }));
  P.add('paint', extrude(band(xG, -1.83, 0.06), 2 * roofHW, { bevel: 0.025 })); // the spoiler / top of the tailgate
  P.add('black', extrude(band(xW0 + 0.03, xW0 - 0.06, 0.03), W * 0.86, { bevel: 0.01, segs: 1 })); // the cowl
  // C pillars (and the closed car's side windows): the sides between belt and roof, leaning in
  const sideGlass = (x0, x1) => [...along(belt, x0, x1, 0.1), ...along((x) => top(x) - 0.05, x1, x0, 0.1)];
  const sides = (pts, name, inset = 0) => { for (const s of [-1, 1]) {
    const g = extrude(shape(pts), 0.035, { bevel: 0.008, segs: 1, z0: 0 });
    g.translate(0, -1.0, 0).rotateX(s * -lean).translate(0, 1.0, s > 0 ? hw - 0.035 - inset : -hw + inset);
    P.add(name, g);
  } };
  sides([...along(belt, xC, -1.9, 0.1), ...along((x) => top(x) - 0.04, -1.9, xC, 0.1)], 'black'); // the C pillar (gloss black)
  P.add('black', extrude(shape([...along(top, xG, -1.95), ...along(belt, -1.95, xG)]), 2 * roofHW, { bevel: 0.01, segs: 1 })); // the tailgate's top
  if (withDoors) P.add('roof', rbox(xC + 1.9, 0.02, 2 * roofHW - 0.06, (xC - 1.9) / 2, belt(-1.3) + 0.01, 0, 0.01)); // the parcel shelf over the boot
  if (!withDoors) {
    sides([...along(belt, xA, xC, 0.1), ...along((x) => top(x) - 0.04, xC, xA - 0.02, 0.1)], 'glass', 0.005);
    for (const s of [-1, 1]) P.add('black', rbox(0.06, 0.45, 0.04, xB, 1.22, s * (hw - 0.07), 0.01).applyMatrix4(new THREE.Matrix4().makeRotationX(s * -lean * 0.5)));
  }
  // ---- lights: slim LED headlights with the DRL dropping into the bumper; the full-width rear bar; amber blinkers
  for (const s of [-1, 1]) {
    const z = s * hw * planK(S, 1.98) * 0.72;
    P.add('lens', rbox(0.22, 0.07, 0.36, 1.98, 0.8, z, 0.025).rotateY(0));
    P.add('led', rbox(0.04, 0.018, 0.3, 2.05, 0.83, z, 0.008), rbox(0.03, 0.2, 0.025, 2.065, 0.62, s * hw * 0.78, 0.01));
    P.add('blink', rbox(0.03, 0.02, 0.1, 2.06, 0.77, s * hw * 0.8, 0.008));
    P.add('tail', rbox(0.06, 0.06, 0.32, -2.06, 0.94, s * hw * 0.74, 0.02));
  }
  P.add('tail', rbox(0.03, 0.03, W * 0.76, -S.L / 2 - 0.012, 0.94, 0, 0.012));
  P.add('chrome', rbox(0.02, 0.02, W * 0.4, -2.08, 0.82, 0, 0.008)); // trim on the tailgate
  // ---- wheels: tyre, the aero rim with five twin spokes, the hub (one geometry per material, all four)
  const tyre = new THREE.LatheGeometry([[0.25, -0.11], [0.31, -0.115], [S.wheelR - 0.01, -0.1], [S.wheelR, -0.05], [S.wheelR, 0.05], [S.wheelR - 0.01, 0.1], [0.31, 0.115], [0.25, 0.11]].map(([r, y]) => new THREE.Vector2(r, y)), 28).rotateX(Math.PI / 2);
  const rimParts = [new THREE.CylinderGeometry(0.255, 0.255, 0.04, 28).rotateX(Math.PI / 2).translate(0, 0, 0.085)];
  for (let k = 0; k < 5; k++) for (const o of [-0.09, 0.09]) rimParts.push(new THREE.BoxGeometry(0.035, 0.22, 0.03).translate(0, 0.13, 0.11).rotateZ(k / 5 * Math.PI * 2 + o));
  const rim = mergeGeometries(rimParts.map(clean)), hub = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, 0.125);
  const wheels = [];
  for (const x of [wx, -wx]) for (const s of [-1, 1]) wheels.push({ x, s, z: s * (hw * planK(S, x) - 0.12) });
  // ---- doors (our car) or the closed sides' handles (parked cars)
  const doors = [], seats = [];
  const mats = {
    paint: new THREE.MeshStandardMaterial({ color: paint, roughness: 0.22, metalness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.25, metalness: 0.2 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.15, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.05, metalness: 0.6, transparent: true, opacity: withDoors ? 0.55 : 0.88, depthWrite: false }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.18, metalness: 0.9 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.1, metalness: 0.6 }),
    led: new THREE.MeshStandardMaterial({ color: 0xf4f6ff, emissive: 0xeaf0ff, emissiveIntensity: 0.3 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x8a0f12, emissive: 0xff2020, emissiveIntensity: 0.2 }),
    blink: new THREE.MeshStandardMaterial({ color: 0xc87a10, emissive: 0xffa020, emissiveIntensity: 0 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.85 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.8 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.95 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.6 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTexture(), emissiveIntensity: 0.9, roughness: 0.2 }),
    logo: new THREE.MeshStandardMaterial({ map: renaultLogo(), transparent: true, roughness: 0.2, metalness: 0.8, depthWrite: false }),
  };
  const group = new THREE.Group();
  if (withDoors) {
    // each door: a lower panel (paint) and the window frame (black) with its glass leaning in; a flush handle, a
    // dark inner panel; front doors carry the mirrors. Pivot at the front edge on the body side.
    const gap = 0.006;
    const spec = [{ x0: xA - gap, x1: xB + gap, front: true }, { x0: xB - gap, x1: xC + gap, front: false }];
    for (const d of spec) for (const s of [-1, 1]) {
      const pivot = new THREE.Group(), dp = new Parts();
      pivot.position.set(d.x0, 0, s * (hw - 0.002));
      const lowerPts = [...along(belt, d.x0, d.x1), [d.x1, 0.31], [d.x0, 0.31]];
      const panel = extrude(shape(lowerPts), 0.06, { bevel: 0.015, segs: 2, z0: -0.045, fz: (x, y, z) => z - hw * shoulder(y) }); // outer face at z 0, rounded like the body
      dp.add('paint', panel);
      dp.add('black', rbox(0.2, 0.025, 0.012, d.x0 - 0.22, belt(d.x0) - 0.12, 0.003, 0.006)); // flush handle
      dp.add('plastic', rbox(Math.abs(d.x1 - d.x0) - 0.08, belt(d.x0) - 0.4, 0.03, (d.x0 + d.x1) / 2, (belt(d.x0) + 0.36) / 2, -0.075, 0.02)); // inner panel
      // the window frame: front door along the A pillar (the windscreen's edge) to the roof; rear door to the C pillar
      const outer = d.front
        ? [[d.x0, belt(d.x0)], ...along((x) => top(x) - 0.03, xW0 - 0.1, xW1 - 0.02, 0.08).filter(([x]) => x < d.x0 - 0.02), ...along((x) => top(x) - 0.04, xW1 - 0.06, d.x1, 0.1), [d.x1, belt(d.x1)]]
        : [[d.x0, belt(d.x0)], ...along((x) => top(x) - 0.04, d.x0, d.x1 + 0.12, 0.1), [d.x1, belt(d.x1) + 0.12], [d.x1, belt(d.x1)]];
      const cx = outer.reduce((a, p) => a + p[0], 0) / outer.length, cy = outer.reduce((a, p) => a + p[1], 0) / outer.length;
      const inner = outer.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy); return [x - dx / l * 0.04, y - dy / l * 0.04]; });
      const frame = extrude(shape(outer, [inner.slice().reverse()]), 0.03, { bevel: 0.006, segs: 1, z0: -0.03 });
      const pane = extrude(shape(inner), 0.008, { bevel: 0, z0: -0.026 });
      const leanM = new THREE.Matrix4().makeTranslation(0, 1.0, 0).multiply(new THREE.Matrix4().makeRotationX(-lean)).multiply(new THREE.Matrix4().makeTranslation(0, -1.0, 0)); // in (−z) before the left side is mirrored
      dp.add('black', frame.applyMatrix4(leanM));
      dp.add('glass', pane.applyMatrix4(leanM));
      if (d.front) dp.add('black', rbox(0.16, 0.1, 0.2, d.x0 - 0.12, belt(d.x0) + 0.05, 0.12, 0.04), rbox(0.03, 0.015, 0.12, d.x0 - 0.05, belt(d.x0) + 0.03, 0.18, 0.006)); // the mirror
      for (const name of dp.names()) {
        const g = dp.merged(name).translate(-d.x0, 0, 0);
        if (s < 0) { g.scale(1, 1, -1); flip(g); } // mirrored to the left side
        const m = new THREE.Mesh(g, mats[name]); m.castShadow = name !== 'glass'; pivot.add(m);
      }
      group.add(pivot);
      doors.push({ pivot, side: s, front: d.front, angle: 0, target: 0 });
    }
    // the cabin: floor, dashboard with the OpenR screens, steering wheel (left-hand drive: the driver on −z), console,
    // front seats and the rear bench
    const I = new Parts();
    I.add('plastic', rbox(xA - xC - 0.05, 0.05, W - 0.2, (xA + xC) / 2, 0.29, 0, 0.01));
    I.add('plastic', rbox(0.38, 0.26, W - 0.14, 0.73, 0.84, 0, 0.06), rbox(0.3, 0.05, W - 0.16, 0.9, 0.96, 0, 0.02));
    I.add('plastic', rbox(0.75, 0.28, 0.22, 0.12, 0.45, 0, 0.05)); // centre console
    I.add('plastic', new THREE.TorusGeometry(0.17, 0.022, 8, 28).rotateY(Math.PI / 2).rotateZ(0.42).translate(0.42, 0.93, -0.37), rbox(0.06, 0.08, 0.08, 0.45, 0.92, -0.37, 0.02));
    I.add('plastic', new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8).rotateZ(Math.PI / 2 - 0.42).translate(0.55, 0.88, -0.37));
    for (const z of [-0.37, 0.37]) {
      I.add('fabric', rbox(0.5, 0.12, 0.5, -0.04, 0.48, z, 0.05));
      I.add('fabric', rbox(0.11, 0.62, 0.5, 0, 0.31, 0, 0.05).applyMatrix4(new THREE.Matrix4().makeRotationZ(0.22)).translate(-0.33, 0.56, z));
      I.add('fabric', rbox(0.09, 0.17, 0.27, -0.47, 1.18, z, 0.04));
      seats.push({ x: -0.02, y: 0.54, z, name: z < 0 ? 'förarsätet' : 'passagerarsätet' });
    }
    I.add('fabric', rbox(0.46, 0.13, W - 0.36, -0.6, 0.5, 0, 0.05), rbox(0.11, 0.55, W - 0.36, -0.86, 0.82, 0, 0.05));
    for (const [name, g] of I.names().map((n) => [n, I.merged(n)])) { const m = new THREE.Mesh(g, mats[name]); m.receiveShadow = true; group.add(m); }
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.19), mats.screen); // the OpenR "L": both screens in one sheet
    scr.position.set(0.64, 1.02, -0.13); scr.rotation.set(0, -Math.PI / 2, 0); scr.rotateX(-0.25);
    group.add(scr);
  }
  // logos front and back, plates are car.js's
  for (const [x, ry] of [[S.L / 2 + 0.052, Math.PI / 2], [-S.L / 2 - 0.058, -Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mats.logo); m.position.set(x, x > 0 ? 0.6 : 0.82, 0); m.rotation.y = ry; group.add(m);
  }
  const parts = {};
  for (const n of P.names()) parts[n] = P.merged(n);
  parts.tyre = mergeGeometries(wheels.map((w) => clean(tyre.clone().translate(w.x, S.wheelR, w.z))));
  parts.rim = mergeGeometries(wheels.flatMap((w) => [clean(rim.clone().applyMatrix4(sideM(w))), clean(hub.clone().applyMatrix4(sideM(w)))]));
  function sideM(w) { return new THREE.Matrix4().makeTranslation(w.x, S.wheelR, w.z).multiply(new THREE.Matrix4().makeScale(1, 1, w.s)); }
  for (const n of Object.keys(parts)) if (n !== 'tyre' && n !== 'rim') { const m = new THREE.Mesh(parts[n], mats[n]); m.castShadow = n !== 'glass'; group.add(m); }
  // wheels as their own groups (they turn while driving): tyre + rim each
  const wheelObjs = wheels.map((w) => {
    const o = new THREE.Group(); o.position.set(w.x, S.wheelR, w.z);
    const t = new THREE.Mesh(tyre, mats.tyre), r = new THREE.Mesh(mergeGeometries([clean(rim.clone()), clean(hub.clone())]), mats.rim);
    if (w.s < 0) r.scale.z = -1;
    t.castShadow = true; o.add(t, r); group.add(o);
    return o;
  });
  return { group, parts, doors, seats, materials: mats, wheels: wheelObjs };
}

/** After mirroring a geometry (scale z −1) its triangles wind the wrong way: swap two corners of each. */
function flip(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }
  else for (const k of Object.keys(g.attributes)) { const at = g.attributes[k], n = at.itemSize; for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) { const t = at.getComponent(i + 1, c); at.setComponent(i + 1, c, at.getComponent(i + 2, c)); at.setComponent(i + 2, c, t); } at.needsUpdate = true; }
  g.computeVertexNormals();
}
