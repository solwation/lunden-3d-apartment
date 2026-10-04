import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALL_SHELVES as S } from './config.js';
import { leafShape, ROUND } from './sillplants.js';

// Two oak wall shelves in the kitchen dressed like a Scandinavian kitchen shelf (#291): cookbooks, glass jars of
// dry goods, a speckled stoneware jug, plates and a bowl, small vases, a mortar on a book lying flat, tapered
// candles in brass holders, a cutting board and three framed prints (passe-partout) leaning on the wall. Turned
// (lathe) profiles in soft glazes rather than blocks. Merged per material: matte things (oak, books, frames,
// candles, stone; vertex colours), glazed stoneware (vertex colours × a speckle map), brass, glass and the prints
// (one canvas atlas). The face pot with glasses and faux eucalyptus (#343, in the dried-eucalyptus vase's place) and
// the trailing pothos are groups of their own so they can be taken (#185, `userData.plants`).

const C = S.colors;

// ---- the prints: abstract, landscape, botanical line drawing; each slot has its own mat (passe-partout) ----
const PW = 256, PH = 320;
function printAtlas() {
  const c = document.createElement('canvas');
  c.width = PW * 3; c.height = PH;
  const g = c.getContext('2d');
  const R = rng(7);
  const mat = (x0, m) => { // the passe-partout round the art, art area returned
    g.fillStyle = '#f3efe6'; g.fillRect(x0, 0, PW, PH);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.strokeRect(x0 + m, m, PW - 2 * m, PH - 2 * m);
    return [x0 + m, m, PW - 2 * m, PH - 2 * m];
  };
  { // 0: abstract, mid-century shapes in sand / terracotta / sage
    const [x, y, w, h] = mat(0, 40);
    g.fillStyle = '#e4d6bf'; g.fillRect(x, y, w, h);
    g.fillStyle = '#b8694a'; g.beginPath(); g.arc(x + w * 0.62, y + h * 0.36, w * 0.24, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8f9c80'; g.beginPath(); g.moveTo(x + w * 0.1, y + h); g.lineTo(x + w * 0.1, y + h * 0.62);
    g.arc(x + w * 0.4, y + h * 0.62, w * 0.3, Math.PI, 0); g.lineTo(x + w * 0.7, y + h); g.fill();
    g.fillStyle = '#2f2d2a'; g.fillRect(x + w * 0.78, y + h * 0.58, w * 0.04, h * 0.42);
  }
  { // 1: landscape, a soft evening sky over layered hills and a strip of sea
    const [x, y, w, h] = mat(PW, 34);
    const sky = g.createLinearGradient(0, y, 0, y + h * 0.6);
    sky.addColorStop(0, '#b9c7cf'); sky.addColorStop(0.7, '#e6d6c3'); sky.addColorStop(1, '#efd2b4');
    g.fillStyle = sky; g.fillRect(x, y, w, h);
    const hill = (base, amp, col, seed) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(x, y + h);
      for (let i = 0; i <= 20; i++) g.lineTo(x + (w * i) / 20, y + h * base - amp * h * Math.sin(i * 0.35 + seed) * Math.cos(i * 0.17 + seed * 2));
      g.lineTo(x + w, y + h); g.fill();
    };
    hill(0.55, 0.06, '#9aa6ae', 1); hill(0.62, 0.05, '#7d8b8d', 3);
    g.fillStyle = '#a9b6b9'; g.fillRect(x, y + h * 0.7, w, h * 0.06);
    hill(0.8, 0.04, '#6f7a62', 5); hill(0.9, 0.03, '#565f4c', 2);
  }
  { // 2: botanical line drawing on cream paper
    const [x, y, w, h] = mat(PW * 2, 30);
    g.fillStyle = '#f7f3ea'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#4b5440'; g.lineWidth = 2.2; g.lineCap = 'round';
    const cx = x + w / 2;
    g.beginPath(); g.moveTo(cx, y + h * 0.92); g.bezierCurveTo(cx - 10, y + h * 0.6, cx + 12, y + h * 0.35, cx - 4, y + h * 0.1); g.stroke();
    for (let i = 0; i < 7; i++) {
      const t = 0.18 + i * 0.1, side = i % 2 ? 1 : -1, ly = y + h * (0.9 - t * 0.85), lx = cx + Math.sin(t * 5) * 6;
      const L = w * (0.3 - i * 0.02);
      g.beginPath(); g.moveTo(lx, ly);
      g.quadraticCurveTo(lx + side * L * 0.5, ly - L * 0.45, lx + side * L, ly - L * 0.2);
      g.quadraticCurveTo(lx + side * L * 0.5, ly + L * 0.05, lx, ly); g.stroke();
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + side * L * 0.8, ly - L * 0.22); g.stroke();
    }
  }
  for (let i = 0; i < 9000; i++) { // paper grain
    g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + R() * 0.03})`;
    g.fillRect(R() * c.width, R() * c.height, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Iron-speckle for the stoneware glaze: near white with small brown dots (multiplies the vertex colour). */
function speckleMap() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const R = rng(3);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const x = 4 + R() * 250, y = 4 + R() * 250, r = 0.4 + R() * 1.1;
    g.fillStyle = `rgba(90,60,40,${0.35 + R() * 0.45})`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 2);
  return tex;
}

function rng(seed) { let s = seed % 2147483646 + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

/** Non-indexed with one vertex colour (or a colour per lathe profile point: `hex` an array). */
function tint(geo, hex) {
  const per = Array.isArray(hex) ? hex.map((h) => new THREE.Color(h)) : null;
  if (per) { // a lathe: vertex index = segment × points + point
    const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = per[i % per.length]; arr.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  if (!per) {
    const col = new THREE.Color(hex), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 16) => new THREE.CylinderGeometry(r0, r1, h, n);
/** A turned profile [[r, y], …] (bottom centre at the origin). */
const lathe = (pts, n = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), n);
/** A vessel: the outer profile up to the rim, then the inside down at `wall` thickness to a floor at `floor`. */
function vessel(outer, wall, floor, n) {
  const inner = outer.slice(1).filter(([, y]) => y > floor).reverse().map(([r, y]) => [Math.max(0.001, r - wall), y]);
  const [rt, yt] = outer[outer.length - 1];
  return lathe([[0, 0], ...outer, [rt - wall * 0.5, yt + wall * 0.3], ...inner, [inner.length ? inner[inner.length - 1][0] : rt - wall, floor], [0, floor]], n);
}

/**
 * Builds the shelves. Local frame: x out of the wall (the wall face is at S.x), y up, z along the
 * wall — so the plan coordinates can be used directly.
 */
export function buildWallShelves() {
  const group = new THREE.Group();
  const matte = [], glaze = [], brass = [], glass = [], prints = [];
  const x0 = S.x, mid = (S.z0 + S.z1) / 2, xc = x0 + S.depth / 2;
  const put = (list, geo, hex, x, y, z) => { list.push(tint(geo, hex).translate(x, y, z)); };

  for (const y of S.heights) {
    put(matte, box(S.depth, S.thick, S.z1 - S.z0), C.oak, xc, y - S.thick / 2, mid);
    for (const z of [S.z0 + 0.12, S.z1 - 0.12]) { // L brackets
      put(matte, box(0.012, 0.14, 0.02), C.bracket, x0 + 0.006, y - S.thick - 0.07, z);
      put(matte, box(S.depth * 0.8, 0.012, 0.02), C.bracket, x0 + S.depth * 0.4, y - S.thick - 0.006, z);
    }
  }
  const [y1, y2] = S.heights;

  // a framed print with a passe-partout leaning on the wall: atlas slot i, outside w × h, frame `f` wide
  const print = (i, w, h, y, z, frameHex, f = 0.014) => {
    const lean = 0.1, xb = x0 + 0.05, d = 0.016;
    const lay = (geo) => geo.rotateZ(lean).translate(xb, y, z);
    const parts = [[d, f, w, 0, f / 2, 0], [d, f, w, 0, h - f / 2, 0], [d, h - 2 * f, f, 0, h / 2, -w / 2 + f / 2], [d, h - 2 * f, f, 0, h / 2, w / 2 - f / 2],
      [0.004, h - 2 * f, w - 2 * f, -0.005, h / 2, 0]]; // the four bars + a backing board
    parts.forEach(([a, b, c, px, py, pz], k) => matte.push(lay(tint(box(a, b, c), k < 4 ? frameHex : 0xd8d2c4).translate(px, py, pz))));
    const pic = new THREE.PlaneGeometry(w - 2 * f, h - 2 * f);
    pic.rotateY(Math.PI / 2); // facing +x
    const uv = pic.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
    prints.push(lay(pic.translate(0.002, h / 2, 0)));
  };

  // a book: page block, two boards and a spine facing +x with a band and a label; `flat` = lying down
  const book = (x, y, z, { t, h, d, hex, band, flat = false }) => {
    const parts = [
      [tint(box(d - 0.006, h - 0.006, t - 0.004), C.pages), -0.001, 0, 0],
      [tint(box(d, h, 0.0025), hex), 0, 0, -t / 2 + 0.00125], [tint(box(d, h, 0.0025), hex), 0, 0, t / 2 - 0.00125],
      [tint(box(0.003, h, t), hex), d / 2 - 0.0015, 0, 0],
      [tint(box(0.001, h * 0.05, t * 0.8), band), d / 2 + 0.0005, h * 0.36, 0], [tint(box(0.001, h * 0.05, t * 0.8), band), d / 2 + 0.0005, -h * 0.4, 0],
      [tint(box(0.001, h * 0.16, t * 0.55), C.pages), d / 2 + 0.0005, h * 0.12, 0],
    ];
    for (const [geo, px, py, pz] of parts) {
      geo.translate(px, py, pz);
      if (flat) geo.rotateX(Math.PI / 2); // lying on its board, the spine still facing the room
      matte.push(geo.translate(x, y + (flat ? t / 2 : h / 2), z));
    }
  };

  // ---------------- lower shelf ----------------
  // cookbooks standing at the left end
  [{ t: 0.032, h: 0.245, d: 0.19, hex: C.books[0], band: C.pages }, { t: 0.026, h: 0.23, d: 0.18, hex: C.books[1], band: 0x3a2f28 },
    { t: 0.036, h: 0.25, d: 0.19, hex: C.books[2], band: C.books[0] }]
    .reduce((z, b) => { book(x0 + 0.004 + b.d / 2, y1, z + b.t / 2, b); return z + b.t + 0.002; }, S.z0 + 0.02);

  // glass jars with dry goods and wooden / cork lids
  const jar = (x, z, r, h, fill, goods, lid) => {
    put(glass, vessel([[r * 0.96, 0], [r, 0.006], [r, h - 0.012], [r * 0.9, h - 0.004], [r * 0.9, h]], 0.003, 0.004, 28), 0xffffff, x, y1, z);
    put(matte, cyl(r - 0.004, r - 0.004, h * fill, 24), goods, x, y1 + 0.004 + (h * fill) / 2, z);
    put(matte, lathe([[0, 0], [r * 0.92, 0], [r * 0.95, 0.003], [r * 0.95, 0.019], [r * 0.9, 0.022], [0, 0.022]], 28), lid, x, y1 + h - 0.002, z);
  };
  jar(xc - 0.025, 0.735, 0.042, 0.15, 0.78, C.pasta, C.oak);
  jar(xc + 0.035, 0.83, 0.038, 0.11, 0.6, C.lentils, C.cork);

  // a clear bottle with a single olive branch, in front of the landscape print
  put(glass, vessel([[0.028, 0], [0.031, 0.008], [0.031, 0.12], [0.026, 0.145], [0.012, 0.17], [0.011, 0.2], [0.013, 0.203]], 0.0025, 0.005, 24), 0xffffff, xc + 0.045, y1, 1.13);
  { // its water and the branch: a thin stem with narrow grey-green leaves
    put(matte, cyl(0.027, 0.027, 0.07, 20), 0xc9d6d4, xc + 0.045, y1 + 0.04, 1.13);
    const stem = new THREE.CatmullRomCurve3([[0, 0.02, 0], [0.004, 0.2, 0.002], [0.02, 0.29, 0.01], [0.04, 0.33, 0.02]].map((p) => new THREE.Vector3(...p)));
    put(matte, new THREE.TubeGeometry(stem, 12, 0.0018, 4), 0x6b6a4a, xc + 0.045, y1, 1.13);
    const R = rng(11);
    for (let k = 0; k < 12; k++) {
      const p = stem.getPoint(0.55 + k * 0.035), side = k % 2 ? 1 : -1;
      const leaf = new THREE.SphereGeometry(0.012, 6, 3).scale(0.28, 0.06, 1);
      leaf.translate(0, 0, 0.011).rotateX(-0.6).rotateY(side * (0.9 + R() * 0.5) + k * 0.4);
      put(matte, leaf, k % 3 ? C.olive : 0x8d977a, xc + 0.045 + p.x, y1 + p.y, 1.13 + p.z);
    }
  }
  print(1, 0.2, 0.26, y1, 1.2, C.black);

  // a small oak cutting board leaning at the back, plates and a bowl in front of it
  {
    const s = new THREE.Shape();
    const w = 0.16, hb = 0.24, r = 0.02;
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, hb - r); s.quadraticCurveTo(w / 2, hb, w / 2 - r, hb);
    s.lineTo(0.025, hb); s.lineTo(0.022, hb + 0.05); s.absarc(0, hb + 0.05, 0.022, 0, Math.PI); s.lineTo(-0.025, hb);
    s.lineTo(-w / 2 + r, hb); s.quadraticCurveTo(-w / 2, hb, -w / 2, hb - r); s.lineTo(-w / 2, 0);
    const hole = new THREE.Path(); hole.absarc(0, hb + 0.05, 0.008, 0, Math.PI * 2, true); s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: false, curveSegments: 8 });
    g.translate(0, 0, -0.007).rotateY(Math.PI / 2).rotateZ(0.08); // in the y-z plane, leaning on the wall
    put(matte, g, C.oak, x0 + 0.03, y1, 1.43);
  }
  const plate = (r, hex, rim) => {
    const pts = [[0, 0.002], [r * 0.62, 0.002], [r * 0.64, 0], [r * 0.7, 0.003], [r * 0.95, 0.014], [r, 0.019], [r * 0.985, 0.021], [r * 0.93, 0.017], [r * 0.66, 0.008], [0, 0.008]];
    return tint(lathe(pts, 36), pts.map((_, j) => (j === 2 || j === 3 || j === 5 || j === 6 ? rim : hex)));
  };
  const px = x0 + 0.119, pz = 1.44;
  glaze.push(plate(0.082, C.offwhite, C.clay).translate(px, y1, pz));
  glaze.push(plate(0.08, C.sage, C.clay).translate(px, y1 + 0.009, pz));
  { // a bowl on top
    const out = [[0.03, 0], [0.034, 0.003], [0.05, 0.02], [0.058, 0.04], [0.06, 0.05]];
    const g = vessel(out, 0.004, 0.006, 32);
    const n = g.attributes.position.count / 33; // points per profile
    glaze.push(tint(g, Array.from({ length: n }, (_, j) => (j < 2 ? C.clay : C.sand))).translate(px, y1 + 0.018, pz));
  }

  // ---------------- upper shelf ----------------
  print(0, 0.24, 0.32, y2, 0.71, C.oak, 0.012);
  { // a speckled stoneware jug: a pinched spout to +z, a strap handle at −z
    const out = [[0.034, 0], [0.04, 0.005], [0.05, 0.04], [0.052, 0.07], [0.044, 0.11], [0.04, 0.13], [0.043, 0.15]];
    const g = vessel(out, 0.004, 0.006, 40);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), t = Math.max(0, (y - 0.1) / 0.05);
      const a = Math.atan2(p.getX(i), p.getZ(i)), k = 1 + 0.4 * t * t * Math.pow(Math.max(0, Math.cos(a)), 6);
      p.setXYZ(i, p.getX(i) * k, y + 0.006 * t * Math.pow(Math.max(0, Math.cos(a)), 6), p.getZ(i) * k);
    }
    g.computeVertexNormals();
    const n = p.count / 41;
    put(glaze, g, Array.from({ length: n }, (_, j) => (j < 2 ? C.clay : C.offwhite)), xc + 0.03, y2, 0.645);
    const handle = new THREE.TorusGeometry(0.032, 0.0055, 6, 14, Math.PI).scale(1, 1, 1.6);
    handle.rotateZ(-Math.PI / 2).rotateY(Math.PI / 2);
    put(glaze, handle, C.offwhite, xc + 0.03, y2 + 0.085, 0.645 - 0.046);
  }
  { // a small round vase in sand, matte
    const out = [[0.026, 0], [0.032, 0.006], [0.044, 0.04], [0.04, 0.072], [0.022, 0.092], [0.019, 0.1]];
    put(matte, vessel(out, 0.003, 0.01, 28), C.sand, xc + 0.045, y2, 0.795);
  }
  // tapered candles in brass holders
  for (const [z, h, wax] of [[0.885, 0.25, C.wax], [0.955, 0.2, C.wax2]]) {
    put(brass, lathe([[0, 0], [0.032, 0], [0.033, 0.004], [0.026, 0.008], [0.009, 0.014], [0.007, 0.03], [0.011, 0.036], [0.007, 0.042],
      [0.007, 0.06], [0.014, 0.064], [0.014, 0.075], [0.011, 0.077], [0, 0.077]], 24), C.brass, xc, y2, z);
    put(matte, lathe([[0, 0], [0.0105, 0], [0.0105, 0.02], [0.008, h * 0.75], [0.0045, h - 0.006], [0.0015, h], [0, h]], 16), wax, xc, y2 + 0.06, z);
    put(matte, cyl(0.0006, 0.0006, 0.012, 4), 0x1e1a16, xc, y2 + 0.06 + h + 0.004, z);
  }
  // a book lying flat, a stone mortar and pestle on it
  book(xc + 0.005, y2, 1.1, { t: 0.026, h: 0.22, d: 0.16, hex: C.books[3], band: C.books[2], flat: true });
  {
    const out = [[0.03, 0], [0.04, 0.008], [0.046, 0.03], [0.047, 0.05]];
    put(matte, vessel(out, 0.008, 0.018, 28), C.stone, xc + 0.005, y2 + 0.026, 1.1);
    const pestle = lathe([[0, 0], [0.012, 0.004], [0.014, 0.02], [0.009, 0.07], [0.008, 0.1], [0.006, 0.105], [0, 0.106]], 14);
    pestle.rotateZ(-0.55).rotateY(0.3);
    put(matte, pestle, C.stone2, xc + 0.0, y2 + 0.026 + 0.02, 1.095);
  }
  print(2, 0.15, 0.2, y2, 1.27, C.black, 0.01);
  { // a tall bud vase in off-white glaze in front of the botanical print
    const out = [[0.024, 0], [0.03, 0.008], [0.033, 0.05], [0.029, 0.1], [0.016, 0.15], [0.012, 0.17], [0.014, 0.19]];
    const g = vessel(out, 0.003, 0.012, 28);
    const n = g.attributes.position.count / 29;
    put(glaze, g, Array.from({ length: n }, (_, j) => (j < 1 ? C.clay : C.offwhite)), xc + 0.05, y2, 1.245);
  }
  { // a tea tin, painted, with a brass rim on the lid
    put(matte, cyl(0.028, 0.028, 0.095, 24), C.tin, xc - 0.005, y2 + 0.0475, 1.345);
    put(brass, cyl(0.0285, 0.0285, 0.016, 24), C.brass, xc - 0.005, y2 + 0.095 + 0.006, 1.345);
  }

  // ---------------- materials ----------------
  const matteMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const glazeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, map: speckleMap() });
  const brassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xeef5f3, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });
  const merge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
  const add = (geos, mat, shadow = true) => {
    const mesh = new THREE.Mesh(merge(geos), mat);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(matte, matteMat);
  add(glaze, glazeMat);
  add(brass, brassMat);
  add(glass, glassMat, false);
  add(prints, new THREE.MeshStandardMaterial({ map: printAtlas(), roughness: 0.85 }));

  // ---------------- the two you can take (#185): groups with their origin at the bottom centre ----------------
  const holdable = (parts, x, y, z) => {
    const g = new THREE.Group();
    for (const [geos, mat] of parts) {
      if (!geos.length) continue;
      const m = new THREE.Mesh(merge(geos), mat);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    g.position.set(x, y, z);
    group.add(g);
    return g;
  };
  // a white face pot with round wire glasses and a mop of faux baby eucalyptus for hair (lower shelf, #343)
  const F = S.facePot;
  const fPot = [], fDark = [], fLeaf = [];
  {
    const r = F.r, h = F.h;
    // a straight cylinder with a slightly rounded bottom; the face looks along +x (into the room)
    fPot.push(tint(vessel([[r * 0.78, 0], [r * 0.93, 0.004], [r * 0.99, 0.013], [r, 0.024], [r, h]], 0.004, 0.012, 40), C.porcelain));
    fDark.push(tint(cyl(r - 0.005, r - 0.005, 0.004, 24), C.foam).translate(0, h - 0.012, 0)); // the foam under the plant
    const onPot = (th, y, out = 0) => new THREE.Vector3(Math.cos(th) * (r + out), y, Math.sin(th) * (r + out)); // th: 0 = front
    { // the nose: a narrow wedge from the brow (y 0.08) down to a tip standing ~13 mm out (y 0.04)
      const T = [r - 0.002, 0.082, 0], L = [r - 0.002, 0.039, -0.0105], Rr = [r - 0.002, 0.039, 0.0105], P = [r + 0.013, 0.041, 0];
      const M = [r + 0.004, 0.066, 0]; // the ridge, so it rounds off towards the brow
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...T, ...Rr, ...M, ...M, ...Rr, ...P, ...T, ...M, ...L, ...M, ...P, ...L, ...L, ...P, ...Rr], 3));
      g.computeVertexNormals();
      fPot.push(tint(g, C.porcelain));
    }
    for (const s of [-1, 1]) { // the eyes: small black dots
      const p = onPot(s * 0.5, 0.077);
      fDark.push(tint(new THREE.SphereGeometry(0.0034, 8, 6).scale(0.5, 1, 1).rotateY(-s * 0.5), C.wire).translate(p.x, p.y, p.z));
    }
    { // the smile: a thin engraved line that curves up at both ends, reaching round towards the cheeks
      const pts = [];
      for (let i = 0; i <= 16; i++) { const t = i / 8 - 1; pts.push(onPot(t * 0.95, 0.014 + 0.011 * Math.pow(Math.abs(t), 2.2), 0.0004)); }
      fDark.push(tint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0011, 4), C.smile));
    }
    // the glasses: two flat wire rings turned a little to follow the face, a bridge over the nose, temples back into the pot
    const ring = F.ring, wire = 0.0011, yG = 0.07, yaw = 0.4;
    for (const s of [-1, 1]) {
      const cx = 0.05, cz = s * 0.042, a = -s * yaw; // (0, y, u) → (u sin a, y, u cos a): the outer edge leans back
      const at = (u, v) => new THREE.Vector3(cx + u * s * Math.sin(a), yG + v, cz + u * s * Math.cos(a)); // u > 0 = outwards
      fDark.push(tint(new THREE.TorusGeometry(ring, wire, 5, 44).rotateY(Math.PI / 2 + a), C.wire).translate(cx, yG, cz));
      const o = at(ring, 0), back = [o, new THREE.Vector3(0.018, yG, s * (r + 0.004)), new THREE.Vector3(-0.012, yG, s * (r + 0.002)), new THREE.Vector3(-0.02, yG, s * (r - 0.003))];
      fDark.push(tint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(back), 12, wire, 4), C.wire));
    }
    { // the bridge, from ring to ring just above the nose's top
      const u = Math.sqrt(ring * ring - 0.006 * 0.006);
      const end = (s) => new THREE.Vector3(0.05 + u * Math.sin(yaw), yG + 0.006, s * (0.042 - u * Math.cos(yaw)));
      const curve = new THREE.QuadraticBezierCurve3(end(-1), new THREE.Vector3(r + 0.006, yG + 0.011, 0), end(1));
      fDark.push(tint(new THREE.TubeGeometry(curve, 10, wire, 4), C.wire));
    }
    // the plant: short branches out of the foam in every direction (the back ones short of the wall), pairs of small
    // round leaves along them, the new ones at the tips yellow-green; a few droop over the brow and the glasses
    const R = rng(F.seed), up = new THREE.Vector3(0, 1, 0);
    const leafGeo = (L) => leafShape(L, L * 0.95, { prof: ROUND, fold: 0.18, bend: L * 0.12, seg: 4 });
    const stemPts = [];
    for (let i = 0; i < F.branches; i++) {
      const a = (i / F.branches) * Math.PI * 2 + (R() - 0.5) * 0.5;
      const front = Math.cos(a) > 0.45 && Math.abs(Math.sin(a)) > 0.35 && i % 2 === 0; // beside the face, not over the eyes
      const el = front ? -0.05 - R() * 0.2 : 0.3 + R() * 1.15, dirH = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      let len = F.spread * (0.65 + R() * 0.45) * (front ? 0.7 : 1);
      const s0 = dirH.clone().multiplyScalar(0.012 + R() * 0.03).setY(h - 0.008);
      const dir = dirH.clone().multiplyScalar(Math.cos(el)).setY(Math.sin(el));
      if (dir.x < 0) len = Math.min(len, (F.back - Math.abs(s0.x)) / -dir.x); // keep off the wall behind the shelf
      const e = s0.clone().addScaledVector(dir, len);
      const c = s0.clone().addScaledVector(dir, len * 0.45).add(new THREE.Vector3(0, 0.035 + R() * 0.03, 0));
      const curve = new THREE.QuadraticBezierCurve3(s0, c, e);
      stemPts.push(curve);
      const nodes = 4 + Math.floor(R() * 3);
      for (let k = 0; k < nodes; k++) {
        const t = 0.25 + (0.75 * k) / (nodes - 1), p = curve.getPoint(t), tan = curve.getTangent(t);
        const side0 = new THREE.Vector3().crossVectors(tan, up);
        if (side0.lengthSq() < 1e-4) side0.set(0, 0, 1);
        side0.normalize().applyAxisAngle(tan, k * Math.PI / 2 + (R() - 0.5) * 0.6); // pairs crossing along the stem
        const tip = k === nodes - 1, L = (tip ? 0.016 : 0.022 + R() * 0.008);
        for (const sd of [-1, 1]) {
          const d = side0.clone().multiplyScalar(sd).addScaledVector(tan, 0.6).normalize();
          let n = new THREE.Vector3().crossVectors(tan, d);
          if (n.y + n.dot(dirH) * 0.5 < 0) n.negate(); // the faces turned up / out
          n.addScaledVector(d, -n.dot(d)).normalize();
          const m = new THREE.Matrix4().makeBasis(d, n, new THREE.Vector3().crossVectors(d, n)).setPosition(p);
          const hex = tip && R() < 0.7 ? C.euTip : C.euLeaves[Math.floor(R() * C.euLeaves.length)];
          const g = leafGeo(L).applyMatrix4(m);
          g.computeBoundingBox();
          if (g.boundingBox.min.x < -F.back - 0.01) continue; // nothing through the wall
          fLeaf.push(tint(g, hex));
        }
      }
    }
    for (const curve of stemPts) fLeaf.push(tint(new THREE.TubeGeometry(curve, 6, 0.0012, 3), C.euStem));
  }
  const porcelainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16 });
  const facePot = holdable([[fPot, porcelainMat], [fDark, matteMat], [fLeaf, leafMat]], xc, y1, F.z);
  // a golden pothos in an off-white pot, its vines trailing over the front edge (upper shelf)
  const pGlaze = [], pLeaf = [];
  {
    const out = [[0.04, 0], [0.044, 0.004], [0.05, 0.075], [0.053, 0.082], [0.053, 0.09]];
    const g = vessel(out, 0.004, 0.012, 32);
    const n = g.attributes.position.count / 33;
    pGlaze.push(tint(g, Array.from({ length: n }, (_, j) => (j < 1 ? C.clay : C.offwhite))));
    pLeaf.push(tint(cyl(0.046, 0.046, 0.004, 24), C.soil).translate(0, 0.078, 0));
    const heart = new THREE.Shape();
    heart.moveTo(0, 0); heart.bezierCurveTo(0.6, 0.15, 0.55, 0.85, 0, 1); heart.bezierCurveTo(-0.55, 0.85, -0.6, 0.15, 0, 0);
    const heartGeo = new THREE.ShapeGeometry(heart, 6);
    const R = rng(9);
    const leafAt = (p, s, yaw, pitch) => {
      const lf = heartGeo.clone().scale(s * 0.75, s, 1).rotateX(-Math.PI / 2 + pitch).rotateY(yaw);
      pLeaf.push(tint(lf, R() < 0.3 ? C.pothos2 : R() < 0.5 ? C.pothos : C.pothos3).translate(p.x, p.y, p.z));
    };
    for (let k = 0; k < 9; k++) { // a mound of leaves over the pot
      const a = (k / 9) * Math.PI * 2 + R() * 0.4, r = 0.012 + R() * 0.02;
      leafAt(new THREE.Vector3(Math.cos(a) * r, 0.085 + R() * 0.04, Math.sin(a) * r), 0.045 + R() * 0.015, -a - Math.PI / 2, 0.5 + R() * 0.5);
    }
    // the vines (local metres; the shelf's front edge is at x +0.1): over the edge and down, one along the shelf
    const vines = [
      [[0.02, 0.09, 0.0], [0.07, 0.095, 0.01], [0.108, 0.06, 0.02], [0.112, -0.05, 0.03], [0.11, -0.17, 0.05]],
      [[0.02, 0.09, -0.02], [0.08, 0.08, -0.04], [0.11, 0.02, -0.06], [0.115, -0.09, -0.08]],
      [[0.0, 0.09, -0.03], [0.02, 0.05, -0.09], [0.04, 0.01, -0.15], [0.06, 0.008, -0.2]],
    ];
    for (const pts of vines) {
      const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
      pLeaf.push(tint(new THREE.TubeGeometry(curve, 16, 0.0018, 4), C.vine));
      const len = curve.getLength(), count = Math.round(len / 0.035);
      for (let k = 1; k <= count; k++) {
        const t = k / (count + 0.5), p = curve.getPoint(t), tan = curve.getTangent(t);
        const side = k % 2 ? 1 : -1, yaw = Math.atan2(tan.x, tan.z) + Math.PI + side * 1.3;
        const hang = p.y < 0.04 && p.x > 0.09; // hanging leaves turn to face the room
        const q = p.clone().add(new THREE.Vector3(hang ? 0.006 : 0, 0, 0));
        leafAt(q, 0.03 + R() * 0.012, hang ? -Math.PI / 2 + side * 0.5 : yaw, hang ? -1.25 : 0.3);
      }
    }
  }
  const pothos = holdable([[pGlaze, glazeMat], [pLeaf, leafMat]], xc, y2, 1.455);
  group.userData.plants = [
    { model: facePot, kind: 'plant', back: 'hyllan', name: 'krukan med glasögonen' },
    { model: pothos, kind: 'plant', back: 'hyllan' },
  ];
  return group;
}
