import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PATIO as P } from './config.js';
import { addCushions, addFoldedThrow } from './cushions.js';
import { Openable } from './openables.js';

// The patio: the Rusta Verona lounge (#408) + a slatted table, a parasol, a cushion box, big planters with exotic
// plants (furniture builders, placed via FURNITURE in config so F and collision work as for the
// indoor furniture) and the seasonal bits driven by the day cycle (Patio.update): the parasol
// folds at night and in winter, beers on the table in summer, a snowman on the lawn in winter.
// Local frame as in furniture.js: the sitter faces +z, x across, y up.

const frameMat = new THREE.MeshStandardMaterial({ color: P.frame, roughness: 0.45, metalness: 0.5 });
const steelMat = new THREE.MeshStandardMaterial({ color: P.verona.frame, roughness: 0.5, metalness: 0.45 }); // powder-coated steel
const cushionMat = new THREE.MeshStandardMaterial({ color: P.verona.cushion, roughness: 0.95 });
const tableSteel = new THREE.MeshStandardMaterial({ color: P.slatTable.frame, roughness: 0.5, metalness: 0.45 });
const woodMat = new THREE.MeshStandardMaterial({ color: P.slatTable.wood, roughness: 0.75 });

function rbox(w, h, d, x, y, z, material, r = 0.02) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A square steel tube from (x0, y0, z0) to (x1, y1, z1) (an axis-aligned box `t` thick across). */
function tube(x0, x1, y0, y1, z0, z1, material = steelMat, t = P.verona.tube) {
  const w = Math.max(x1 - x0, t), h = Math.max(y1 - y0, t), d = Math.max(z1 - z0, t);
  return rbox(w, h, d, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, material, 0.004);
}

/**
 * One Verona frame (#408): an open box of square tube (posts, rails at the top and at the floor, flat slats front to
 * back) over x0…x1 × z0…z1 (the back at z0), with `back` (rear posts up to H, two rails and a middle post) and arms
 * (`arms`: 'x0' | 'x1', a front post, two rails), plus its cushions: a seat cushion, and a back cushion with a back.
 */
function veronaModule(g, x0, x1, z0, z1, { back = false, arms = [] } = {}) {
  const V = P.verona, t = V.tube, y = V.base;
  for (const x of [x0 + t / 2, x1 - t / 2]) for (const z of [z0 + t / 2, z1 - t / 2]) g.add(tube(x, x, 0, back && z < z0 + t ? V.H : y, z, z));
  for (const yy of [t / 2 + 0.02, y - t / 2]) {
    for (const z of [z0 + t / 2, z1 - t / 2]) g.add(tube(x0 + t, x1 - t, yy, yy, z, z));
    for (const x of [x0 + t / 2, x1 - t / 2]) g.add(tube(x, x, yy, yy, z0 + t, z1 - t));
  }
  const n = 4, sw = (x1 - x0 - 2 * t) / n;
  for (let i = 0; i < n; i++) g.add(tube(x0 + t + sw * (i + 0.15), x0 + t + sw * (i + 0.85), y - 0.012, y, z0 + t, z1 - t, steelMat, 0.012));
  if (back) {
    for (const yy of [V.H - t / 2, (y + V.H) / 2]) g.add(tube(x0 + t, x1 - t, yy, yy, z0 + t / 2, z0 + t / 2));
    g.add(tube((x0 + x1) / 2, (x0 + x1) / 2, y, V.H - t, z0 + t / 2, z0 + t / 2));
  }
  for (const side of arms) {
    const x = side === 'x0' ? x0 + t / 2 : x1 - t / 2;
    g.add(tube(x, x, y, V.arm, z1 - t / 2, z1 - t / 2));
    for (const yy of [V.arm - t / 2, (y + V.arm) / 2]) g.add(tube(x, x, yy, yy, z0 + t, z1 - t / 2));
  }
  // cushions: thick and soft, each module its own (the joints show)
  const zf = back ? z0 + t + V.backT : z0;
  g.add(rbox(x1 - x0 - 0.015, V.seatT, z1 - zf - 0.01, (x0 + x1) / 2, y + V.seatT / 2, (zf + z1) / 2, cushionMat, 0.045));
  if (back) {
    const c = rbox(x1 - x0 - 0.02, V.backH, V.backT, (x0 + x1) / 2, y + V.seatT + V.backH / 2 - 0.02, z0 + t + V.backT / 2, cushionMat, 0.06);
    c.rotation.x = -0.12; // leaning back
    g.add(c);
  }
}

/**
 * The family's Rusta Verona lounge (#408, #429, shortened #489): a row of three modules along x, centred on the origin, backs at −z, seats
 * facing +z, an arm at each end; in front of the +x end module the two divans (backless, no arms, P.verona.divanL long)
 * end to end along +z — one long bench along the east screen wall, an L. Six places: one per row module facing +z,
 * the bench's (P.verona.bench) facing −x, towards the table. The decorative cushions (#399) — along the backs, and
 * standing against the screen wall on the bench (`wall: true`) — are one merged mesh, shown by the season.
 */
export function veronasofa() {
  const g = new THREE.Group();
  const V = P.verona, W = V.W, D = V.D, X = 1.5 * W, z0 = -D / 2, z1 = D / 2, z3 = z1 + 2 * V.divanL;
  for (let i = 0; i < 3; i++) {
    const a = -X + i * W;
    veronaModule(g, a, a + W, z0, z1, { back: true, arms: i === 0 ? ['x0'] : i === 2 ? ['x1'] : [] });
  }
  for (let k = 0; k < 2; k++) veronaModule(g, X - W, X, z1 + k * V.divanL, z1 + (k + 1) * V.divanL); // the bench
  const seatY = V.base + V.seatT, benchX = X - W / 2 - 0.06; // (the wall cushions take the back of the bench's seat)
  const spots = [0, 1, 2].map((i) => ({ x: -X + W * (i + 0.5), y: seatY, z: 0.04 }))
    .concat(V.bench.map((u) => ({ x: benchX, y: seatY, z: z1 + u * (z3 - z1), dir: [-1, 0] })));
  g.userData.rest = { kind: 'sit', name: 'loungesoffan', verb: 'sätta dig i', spots };
  g.userData.footprint = [{ x0: -X, x1: X, z0, z1 }, { x0: X - W, x1: X, z0: z1, z1: z3 }];
  // cosy cushions (#399): leaning against the backs, and against the screen wall along the bench (in a frame turned to
  // face −x: its x runs along the bench from its north end, its z out from the bench's outer edge); merged into one mesh
  // (the shared cushion atlas), kept out of the sofa's merge, shown by the season and the weather (Patio.update)
  const tmp = new THREE.Group(), wall = new THREE.Group();
  wall.position.set(X, 0, z1);
  wall.rotation.y = -Math.PI / 2;
  wall.updateMatrix();
  const rowC = addCushions(tmp, P.cushions.filter((c) => !c.wall), { backZ: 0, seatY });
  const benchC = addCushions(tmp, P.cushions.filter((c) => c.wall), { backZ: 0, seatY });
  const meshes = rowC.concat(benchC);
  const geos = meshes.map((c) => {
    c.updateMatrix();
    const geo = c.geometry.applyMatrix4(c.matrix);
    return benchC.includes(c) ? geo.applyMatrix4(wall.matrix) : geo;
  });
  const cushions = new THREE.Mesh(mergeGeometries(geos), meshes[0].material);
  cushions.castShadow = cushions.receiveShadow = true;
  cushions.userData.cushion = true;
  g.add(cushions);
  g.userData.keep = [cushions];
  seasonal.cushions.push(cushions);
  return g;
}

// --- paving -------------------------------------------------------------------
/** Slab paving texture (PATIO.paving), one repeat = 6 × 6 slabs; use with UVs in metres. */
export function pavingTexture() {
  const { slab, joint, color: [r0, g0, b0], jointColor } = P.paving;
  const n = 6, ppm = 160, px = Math.round(slab * ppm), jw = Math.max(1, Math.round(joint * ppm));
  const c = document.createElement('canvas');
  c.width = c.height = px * n;
  const g = c.getContext('2d');
  g.fillStyle = jointColor;
  g.fillRect(0, 0, c.width, c.height);
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < n; row++) {
    const off = row % 2 ? px / 2 : 0; // half bond
    for (let col = -1; col < n; col++) {
      const k = 0.93 + rand() * 0.1;
      const x = col * px + off;
      g.fillStyle = `rgb(${r0 * k},${g0 * k},${b0 * k})`;
      g.fillRect(x + jw / 2, row * px + jw / 2, px - jw, px - jw);
      for (let i = 0; i < 40; i++) { // concrete speckle
        g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '60,55,50'},${0.05 + rand() * 0.06})`;
        g.fillRect(x + jw + rand() * (px - 2 * jw), row * px + jw + rand() * (px - 2 * jw), 2, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(1 / (slab * n), 1 / (slab * n));
  return tex;
}

// --- LED string lights on the screen walls (#81) --------------------------------
/**
 * One string per fence (site.fences, the patio side): little bulbs in sagging arcs between hooks, a
 * thin cable. All bulbs are one InstancedMesh with an emissive material; `lamps` are pool lights for
 * lights.js (one per string, in its middle). Switched by daylight with hysteresis (Patio.update).
 */
export function buildStringLights(fences, patioMidX) {
  const L = P.stringLights, group = new THREE.Group();
  const bulbs = [], cable = [], lamps = [];
  for (const f of fences) {
    const [ax, az] = f.a, [bx, bz] = f.b;
    const side = Math.sign(patioMidX - ax) || 1; // the patio side of the wall
    const x = ax + side * L.inset, len = Math.abs(bz - az), z0 = Math.min(az, bz);
    const hooks = Math.max(1, Math.round(len / L.hookEvery));
    const yAt = (z) => { const u = ((z - z0) / (len / hooks)) % 1; return L.y - 4 * L.sag * u * (1 - u); }; // catenary-ish
    for (let z = z0 + L.spacing / 2; z < z0 + len; z += L.spacing) bulbs.push([x, yAt(z) - 0.02, z]);
    const pts = [];
    for (let z = z0; z <= z0 + len + 1e-3; z += 0.05) pts.push(new THREE.Vector3(x, yAt(z), z));
    cable.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.003, 4));
    lamps.push({ pos: new THREE.Vector3(x + side * 0.4, L.y - 0.1, z0 + len / 2), intensity: L.light.intensity, range: L.light.range, color: L.color, level: 0 });
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }); // glow = colour (lit by nothing)
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 8, 6), mat, bulbs.length);
  const m = new THREE.Matrix4();
  bulbs.forEach(([x, y, z], i) => inst.setMatrixAt(i, m.makeTranslation(x, y, z)));
  group.add(inst, new THREE.Mesh(mergeGeometries(cable), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 })));
  return { object: group, mat, lamps, level: 0, on: false, glow: 0 };
}

// --- beers ------------------------------------------------------------------
const glassMat = new THREE.MeshStandardMaterial({ color: 0xe8f2f4, roughness: 0.05, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
const beerMat = new THREE.MeshStandardMaterial({ color: 0xd88a1c, roughness: 0.2, transparent: true, opacity: 0.88, emissive: 0x6a3a05, emissiveIntensity: 0.25 });
const foamMat = new THREE.MeshStandardMaterial({ color: 0xfbf6ea, roughness: 0.9 });
const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, roughness: 0.2, transparent: true, opacity: 0.8 });
const BUBBLES = 14, BEER_H = 0.12;
const seasonal = { parasols: [], beers: [], cushions: [], boxes: [] };

/** A pint of lager with rising bubbles; base at the origin. */
function beerGlass() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.033, 0.155, 20, 1, true), glassMat);
  glass.position.y = 0.0775;
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.008, 20), glassMat);
  bottom.position.y = 0.004;
  const beer = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.032, BEER_H, 20), beerMat);
  beer.position.y = 0.008 + BEER_H / 2;
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.039, 0.022, 20), foamMat);
  foam.position.y = 0.008 + BEER_H + 0.011;
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0022, 6, 4), bubbleMat, BUBBLES);
  bubbles.userData.seeds = Array.from({ length: BUBBLES }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.026, phase: Math.random(), speed: 0.6 + Math.random() * 0.6 }));
  bubbles.position.y = 0.01;
  g.add(glass, bottom, beer, foam, bubbles);
  g.userData.bubbles = bubbles;
  return g;
}

/** The small low table from the family's photo (#408, P.slatTable): a black steel frame (legs, rails at the top and the
 * floor) with dark wooden slats on top; `item.beers` puts two pints on it in summer. */
export function slattable(item) {
  const g = new THREE.Group();
  const { w, d, h, slats } = P.slatTable, t = 0.03, top = 0.02;
  for (const x of [-w / 2 + t / 2, w / 2 - t / 2]) for (const z of [-d / 2 + t / 2, d / 2 - t / 2]) g.add(tube(x, x, 0, h - top, z, z, tableSteel, t));
  for (const y of [t / 2 + 0.015, h - top - t / 2]) {
    for (const z of [-d / 2 + t / 2, d / 2 - t / 2]) g.add(tube(-w / 2 + t, w / 2 - t, y, y, z, z, tableSteel, t));
    for (const x of [-w / 2 + t / 2, w / 2 - t / 2]) g.add(tube(x, x, y, y, -d / 2 + t, d / 2 - t, tableSteel, t));
  }
  const sd = d / slats; // slats along the long side, small gaps between
  for (let i = 0; i < slats; i++) g.add(rbox(w - 0.004, top, sd - 0.008, 0, h - top / 2, -d / 2 + sd * (i + 0.5), woodMat, 0.003));
  if (item.beers) {
    const beers = new THREE.Group();
    beers.visible = false;
    for (const [x, z] of [[-0.18, 0.08], [0.06, -0.1]]) {
      const b = beerGlass();
      b.position.set(x, h, z);
      beers.add(b);
    }
    g.add(beers);
    seasonal.beers.push(beers);
    g.userData.keep = [beers]; // shown/hidden by the season (furniture.js leaves it unmerged)
  }
  g.userData.surfaces = [{ x0: -w / 2 + 0.02, x1: w / 2 - 0.02, z0: -d / 2 + 0.02, z1: d / 2 - 0.02, y: h }];
  g.userData.footprint = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  return g;
}

// --- parasol ----------------------------------------------------------------
/** Parasol on a cross base. The canopy is an open cone hanging from the top of the pole:
 * flat and wide when up, narrow and long when folded. */
export function parasol(item = {}) {
  const g = new THREE.Group();
  const { radius, height, color } = P.parasol;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, height, 12), frameMat);
  pole.position.y = height / 2;
  g.add(pole);
  for (const a of [0, Math.PI / 2]) {
    const foot = rbox(0.8, 0.05, 0.06, 0, 0.025, 0, frameMat, 0.01);
    foot.rotation.y = a;
    g.add(foot);
  }
  g.add(rbox(0.36, 0.06, 0.36, 0, 0.08, 0, new THREE.MeshStandardMaterial({ color: 0x8d8f8c, roughness: 0.9 }), 0.01)); // weight
  const geo = new THREE.ConeGeometry(1, 1, 8, 1, true);
  geo.translate(0, -0.5, 0); // apex at the origin
  const canopy = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.position.y = height;
  canopy.castShadow = true;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), frameMat);
  finial.position.y = height + 0.02;
  g.add(canopy, finial);
  g.traverse((m) => { m.castShadow = true; });
  const p = { canopy, open: 0, radius, manual: null, manualAuto: null, auto: 0, tilt: THREE.MathUtils.degToRad(item.tilt ?? 0) };
  // E on the parasol folds/unfolds it by hand (#51); see Patio.update for how long that choice holds
  p.interact = {
    name: 'parasollet', kind: 'parasol', pickable: g,
    get isOpen() { return (p.manual ?? p.auto) === 1; },
    get verb() { return this.isOpen ? 'fälla ihop' : 'fälla ut'; },
    toggle() {
      p.manual = this.isOpen ? 0 : 1;
      p.manualAuto = p.auto;
      return p.manual === 1;
    },
  };
  g.traverse((m) => { m.userData.door = p.interact; });
  seasonal.parasols.push(p);
  setParasol(p, 0);
  g.userData.footprint = [{ x0: -0.12, x1: 0.12, z0: -0.12, z1: 0.12 }];
  return g;
}

function setParasol(p, f) {
  p.open = f;
  const e = f * f * (3 - 2 * f); // smoothstep
  const r = THREE.MathUtils.lerp(0.09, p.radius, e), h = THREE.MathUtils.lerp(1.15, 0.38, e);
  p.canopy.scale.set(r, h, r);
  p.canopy.rotation.x = p.tilt * e; // open, the canopy leans its local +z side down (towards the sun, #398); folded it hangs straight
}

// --- cushion box (dynbox, #400) -------------------------------------------------
/**
 * An outdoor cushion box (P.dynbox): an anthracite slatted wood-look box, `L` long (local x), `D` deep (z: the back
 * at −z against the wall, the front +z), `H` high; the lid is hinged at the back (an Openable flap, E), two handles on
 * the ends. Inside (drawn only while the lid is open, #228): a folded blanket, and the patio cushions while they are put
 * away (Patio.update). Not a seat: E on it is the lid (#400).
 */
export function dynbox() {
  const g = new THREE.Group();
  const { L, D, H, lid: lt, wall: t, color, slat } = P.dynbox;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.85 });
  const hb = H - lt; // the body's height under the lid
  // the body: a bottom and four walls (hollow, so the contents show), little feet
  g.add(rbox(L - 2 * t, 0.02, D - 2 * t, 0, 0.04, 0, dark, 0.004));
  g.add(rbox(L, hb - 0.03, t, 0, 0.03 + (hb - 0.03) / 2, D / 2 - t / 2, mat, 0.006));
  g.add(rbox(L, hb - 0.03, t, 0, 0.03 + (hb - 0.03) / 2, -D / 2 + t / 2, mat, 0.006));
  for (const s of [-1, 1]) g.add(rbox(t, hb - 0.03, D - 2 * t, s * (L / 2 - t / 2), 0.03 + (hb - 0.03) / 2, 0, mat, 0.006));
  for (const [x, z] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) g.add(rbox(0.05, 0.03, 0.05, x * (L / 2 - 0.04), 0.015, z * (D / 2 - 0.04), dark, 0.004));
  // vertical slats on the front and the ends (the wood look), a frame rail at top and bottom
  for (let x = -L / 2 + slat; x < L / 2 - slat / 2; x += slat) g.add(rbox(0.012, hb - 0.11, 0.006, x, 0.03 + (hb - 0.03) / 2, D / 2 + 0.002, dark, 0.002));
  for (const s of [-1, 1]) for (let z = -D / 2 + slat; z < D / 2 - slat / 2; z += slat) g.add(rbox(0.006, hb - 0.11, 0.012, s * (L / 2 + 0.002), 0.03 + (hb - 0.03) / 2, z, dark, 0.002));
  for (const y of [0.06, hb - 0.03]) { // a frame rail round the outside (a ring: the box stays open inside)
    for (const s of [-1, 1]) {
      g.add(rbox(L + 0.008, 0.05, 0.012, 0, y, s * (D / 2 + 0.004), mat, 0.004));
      g.add(rbox(0.012, 0.05, D + 0.008, s * (L / 2 + 0.004), y, 0, mat, 0.004));
    }
  }
  // handles on the ends
  for (const s of [-1, 1]) g.add(rbox(0.025, 0.03, 0.16, s * (L / 2 + 0.02), hb - 0.12, 0, dark, 0.008));
  // the lid on a pivot at the back top edge, its planks running along the box
  const pivot = new THREE.Group();
  pivot.position.set(0, hb, -D / 2);
  pivot.add(rbox(L + 0.02, lt, D + 0.02, 0, lt / 2, D / 2, mat, 0.01));
  for (let z = slat; z < D; z += slat) pivot.add(rbox(L, 0.004, 0.008, 0, lt + 0.001, z, dark, 0.001));
  g.add(pivot);
  const lid = new Openable({ name: 'dynboxens lock', object: pivot, mode: 'flap', axis: [1, 0, 0], sign: -1, max: P.dynbox.max, speed: 1.6 });
  // inside: a folded blanket at one end, the patio cushions in two piles while they are put away
  const contents = new THREE.Group();
  addFoldedThrow(contents, { w: 0.4, d: 0.42, layer: 0.025, layers: 4, x: L / 2 - t - 0.24, z: 0, y: 0.05, yaw: 0.05, color: 'grey' });
  const tmp = new THREE.Group();
  const piles = addCushions(tmp, P.cushions.map((c) => ({ ...c, yaw: 0.1 * Math.sin(c.x * 7), lean: Math.PI / 2 })), { backZ: 0, seatY: 0 });
  piles.forEach((m, i) => {
    const s = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox);
    const th = (s.max.z - s.min.z) * 0.8, pile = i % 2, k = Math.floor(i / 2);
    m.position.set(-L / 2 + t + 0.26 + pile * 0.47, 0.05 + th * (k + 0.5), 0.02 * (k % 2 ? 1 : -1));
    m.updateMatrix();
  });
  const stack = new THREE.Mesh(mergeGeometries(piles.map((m) => m.geometry.applyMatrix4(m.matrix))), piles[0].material);
  stack.visible = false;
  contents.add(stack);
  contents.visible = false;
  g.add(contents);
  lid.contents = contents;
  lid.top = true; // a lid on top: what is inside stays below it (opentest)
  seasonal.boxes.push(stack);
  g.userData.targets = [lid];
  // #445: you can sit on the shut lid (two places, facing out); not while it is open, and it does not open under you.
  // Looking at the lid opens it; looking at the box's front / ends (the body) sits you down
  const open = () => lid.isOpen || lid.t > 0.01;
  g.userData.rest = { kind: 'sit', name: 'dynboxen', verb: 'sätta dig på', blockedText: 'Stäng locket först',
    spots: [-0.3, 0.3].map((x) => ({ x, y: H, z: 0.02, aim: [x, D / 2 + 0.01, hb / 2], taken: open })) };
  lid.seat = g; // (main.js: no opening it while sitting on it)
  // #447: the shut lid is a put-down surface (cups too); it does not open while something stands on it
  const top = new THREE.Group(); g.add(top);
  const lidTop = { x0: -L / 2 + 0.04, x1: L / 2 - 0.04, z0: -D / 2 + 0.04, z1: D / 2 - 0.04, y: H + 0.004, gate: top, door: lid };
  g.userData.surfaces = [lidTop];
  const lidUpdate = lid.update;
  lid.update = (dt) => { lidUpdate.call(lid, dt); top.visible = !lid.isOpen && lid.t === 0; };
  Object.defineProperty(lid, 'blocked', { get() { return !lid.isOpen && !!lidTop.mesh?.userData.occupied(); } });
  lid.blockedText = 'Ta bort det som står på locket först';
  g.userData.keep = [pivot, contents];
  g.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  g.userData.footprint = [{ x0: -L / 2, x1: L / 2, z0: -D / 2, z1: D / 2 }];
  return g;
}

// --- planters with exotic plants ------------------------------------------------
const potMat = new THREE.MeshStandardMaterial({ color: P.pot.color, roughness: 0.8 });
const soilMat = new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 1 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
const PLANT_MATS = {
  palm: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8, side: THREE.DoubleSide }),
  banana: new THREE.MeshStandardMaterial({ color: 0x67a63c, roughness: 0.7, side: THREE.DoubleSide }),
  agave: new THREE.MeshStandardMaterial({ color: 0x7c9c90, roughness: 0.7 }),
};
const M4 = () => new THREE.Matrix4();

/** Trachycarpus: hairy trunk, a crown of fan leaves on stalks. */
function palm(leaf, wood, top) {
  const trunk = new THREE.CylinderGeometry(0.065, 0.09, 1.3, 10);
  trunk.translate(0, top + 0.65, 0);
  wood.push(trunk);
  const crown = top + 1.3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.2, lean = 0.5 + (i % 3) * 0.3;
    const fan = new THREE.CircleGeometry(0.42, 14, Math.PI / 2 - 1.15, 2.3);
    fan.translate(0, 0.4, 0);
    const stalk = new THREE.CylinderGeometry(0.008, 0.012, 0.4, 5);
    stalk.translate(0, 0.2, 0);
    const m = M4().makeTranslation(0, crown, 0).multiply(M4().makeRotationY(a)).multiply(M4().makeRotationX(lean));
    leaf.push(fan.applyMatrix4(m), stalk.applyMatrix4(m));
  }
}

/** Banana (Musa): green pseudo-stem, big arching leaves. */
function banana(leaf, wood, top) {
  const stem = new THREE.CylinderGeometry(0.05, 0.07, 0.75, 10);
  stem.translate(0, top + 0.375, 0);
  leaf.push(stem);
  for (let i = 0; i < 7; i++) {
    const len = 1.0 + (i % 3) * 0.12, geo = new THREE.PlaneGeometry(0.34, len, 1, 10);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const t = pos.getY(k) / len + 0.5; // 0 at the base … 1 at the tip
      pos.setX(k, pos.getX(k) * Math.max(0.15, Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08))));
      pos.setY(k, t * len);
      pos.setZ(k, 0.55 * t * t * len); // arches outwards and droops
    }
    geo.computeVertexNormals();
    const a = (i / 7) * Math.PI * 2 * 1.3, lean = 0.25 + (i % 3) * 0.15;
    geo.applyMatrix4(M4().makeTranslation(0, top + 0.6 + (i % 3) * 0.06, 0).multiply(M4().makeRotationY(a)).multiply(M4().makeRotationX(lean)));
    leaf.push(geo);
  }
}

/** Agave: a rosette of thick, pointed blue-grey leaves. */
function agave(leaf, wood, top) {
  for (const [n, lean, len] of [[11, 1.2, 0.62], [8, 0.8, 0.58], [5, 0.35, 0.5]]) {
    for (let i = 0; i < n; i++) {
      const geo = new THREE.ConeGeometry(0.06, len, 6);
      geo.translate(0, len / 2, 0);
      geo.scale(1, 1, 0.4);
      const a = (i / n) * Math.PI * 2 + lean;
      geo.applyMatrix4(M4().makeTranslation(0, top + 0.02, 0).multiply(M4().makeRotationY(a)).multiply(M4().makeRotationX(lean)));
      leaf.push(geo);
    }
  }
}

/** A large planter (P.pot) with `item.plant`: 'palm', 'banana' or 'agave'. One mesh per material. */
export function planter(item) {
  const g = new THREE.Group();
  const { r, h } = P.pot;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, h, 28), potMat);
  pot.position.y = h / 2;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 28), soilMat);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = h - 0.03;
  g.add(pot, soil);
  const leaf = [], wood = [];
  ({ palm, banana, agave })[item.plant](leaf, wood, h - 0.03);
  for (const [list, mat] of [[leaf, PLANT_MATS[item.plant]], [wood, trunkMat]]) {
    if (list.length) g.add(new THREE.Mesh(mergeGeometries(list.map((x) => x.index ? x.toNonIndexed() : x)), mat));
  }
  g.traverse((m) => { m.castShadow = m.receiveShadow = true; });
  g.userData.footprint = [{ x0: -r, x1: r, z0: -r, z1: r }];
  return g;
}

// --- snowman ------------------------------------------------------------------
function snowman() {
  const g = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.95 });
  const coal = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), snow);
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = 0.005;
  g.add(patch);
  let y = 0;
  for (const r of [0.36, 0.27, 0.19]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), snow);
    s.position.y = y + r * 0.9;
    y += r * 1.75;
    g.add(s);
  }
  const head = g.children.at(-1).position.y;
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), coal);
    eye.position.set(x, head + 0.05, 0.165);
    g.add(eye);
  }
  for (const k of [0, 1, 2]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), coal);
    b.position.set(0, 0.62 + k * 0.12, 0.25 - Math.abs(k - 1) * 0.02);
    g.add(b);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xe8701c, roughness: 0.7 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, head, 0.26);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 20), new THREE.MeshStandardMaterial({ color: 0xc8262a, roughness: 0.9 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = head - 0.15;
  const hat = new THREE.Group();
  hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), coal));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 20), coal);
  crown.position.y = 0.1;
  hat.add(crown);
  hat.position.y = head + 0.15;
  hat.rotation.z = 0.12;
  g.add(nose, scarf, hat);
  const stick = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 });
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.55, 6), stick);
    arm.position.set(s * 0.42, 0.95, 0);
    arm.rotation.z = s * -1.0;
    g.add(arm);
  }
  g.traverse((m) => { m.castShadow = true; });
  patch.castShadow = false;
  patch.receiveShadow = true;
  return g;
}

/** The seasonal state of the patio, from the day cycle (month, hour, sun). */
export class Patio {
  constructor() {
    this.snowman = snowman();
    this.snowman.position.set(P.snowman.x, 0, P.snowman.z);
    this.snowman.rotation.y = Math.PI; // facing the house (north)
    this.object = this.snowman;
    this.t = 0;
    this.first = true;
  }

  /** For tests: parasol open fractions, beers shown, snowman shown. */
  get state() {
    return { strings: this.strings?.glow ?? null, parasols: seasonal.parasols.map((p) => p.open), beers: seasonal.beers.map((b) => b.visible), snowman: this.snowman.visible, cushions: seasonal.cushions.map((c) => c.visible) };
  }

  /** E targets: the parasols (folded/unfolded by hand). */
  get targets() { return seasonal.parasols.map((p) => p.interact); }

  /** A choice made by hand on the parasols, for a reload record (#277, keep.js); null when none was made. */
  saveState() { return seasonal.parasols.some((p) => p.manual !== null) ? seasonal.parasols.map((p) => [p.manual, p.manualAuto]) : null; }
  loadState(s) {
    if (!Array.isArray(s)) return;
    seasonal.parasols.forEach((p, i) => { const [m, ma] = s[i] ?? []; if ((m === 0 || m === 1) && (ma === 0 || ma === 1)) { p.manual = m; p.manualAuto = ma; } });
  }

  /** The string lights (main.js hands them over), switched with the daylight. */
  setStringLights(sl, forceOn = false) { this.strings = sl; if (forceOn) { sl.on = true; sl.glow = 1; } }

  update(day, dt) {
    this.t += dt;
    const sl = this.strings;
    if (sl) { // on below `on` daylight, off above `off` (no flicker at dusk), a short fade
      const L = P.stringLights;
      if (sl.on && day.daylight > L.off && !sl.forced) sl.on = false;
      else if (!sl.on && day.daylight < L.on) sl.on = true;
      sl.glow = THREE.MathUtils.clamp(sl.glow + (sl.on ? 1 : -1) * dt / L.fade, 0, 1);
      sl.mat.color.setHex(L.color).multiplyScalar(0.06 + 1.4 * sl.glow);
      for (const l of sl.lamps) l.k = sl.glow;
    }
    const sunUp = day.sunDir.y > 0.02;
    const auto = P.parasol.months.includes(day.month) && sunUp && !(day.overcast > 0.6) ? 1 : 0; // folded under rain clouds too (#248)
    for (const p of seasonal.parasols) {
      // A choice made by hand (E) holds until the automatic state itself changes (sunset/sunrise,
      // a new season): then the automatic one takes over again.
      if (p.manual !== null && auto !== p.manualAuto) p.manual = null;
      p.auto = auto;
      const target = p.manual ?? auto;
      const speed = p.manual !== null ? 2.5 : 0.5; // by hand: a quick flick; by itself: slowly
      if (this.first) setParasol(p, target); // no unfolding on arrival
      else if (p.open !== target) setParasol(p, THREE.MathUtils.clamp(p.open + Math.sign(target - p.open) * dt * speed, 0, 1));
    }
    const [h0, h1] = P.beerHours;
    const beers = P.beerMonths.includes(day.month) && day.hour >= h0 && day.hour < h1;
    for (const b of seasonal.beers) {
      b.visible = beers;
      if (beers) b.traverse((m) => { if (m.userData.seeds) bubbleUpdate(m, this.t); });
    }
    this.snowman.visible = P.snowman.months.includes(day.month);
    // the cushions (#399): out in the parasol's months, in the cushion box in winter and under rain clouds (#248)
    const cushions = P.parasol.months.includes(day.month) && !(day.overcast > 0.6);
    for (const c of seasonal.cushions) c.visible = cushions;
    for (const s of seasonal.boxes) s.visible = !cushions; // … and then they lie in the cushion box (#400)
    this.first = false;
  }
}

const dummy = new THREE.Object3D();
function bubbleUpdate(mesh, t) {
  mesh.userData.seeds.forEach((s, i) => {
    const k = (t * s.speed * 0.5 + s.phase) % 1;
    dummy.position.set(Math.cos(s.a + k) * s.r, k * (BEER_H - 0.01), Math.sin(s.a + k) * s.r);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

