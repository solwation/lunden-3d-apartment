import * as THREE from 'three';
import { PINEAPPLE_MIRROR } from './config.js';
import { mirrorMaterial } from './mirror.js';
import { addReflector } from './reflections.js';

// Livia's pineapple mirror (#412, PINEAPPLE_MIRROR, docs/spegel-ananas-livia.jpg): an oval frame in matte mustard yellow
// with a relief of pointed scales, a crown of pointed leaves with a herringbone vein, and an oval glass with its own
// Reflector (#50). Our own model, no brand. Local frame: x across, y up (0 = the oval's centre), +z out of the wall.

/** Canvas height map (bump) of the pineapple's skin: offset rows of scales, each a dome with a pointed bottom and a
 * small ridge rising from the point, grooves between them. One tile = 2 scales across, 2 rows. */
function scaleBump() {
  const W = 256, H = 224, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#505050'; g.fillRect(0, 0, W, H);
  const sw = W / 2, sh = H / 2;
  const scale = (cx, top) => { // a scale: round top at `top`, the point sh * 1.25 below
    const bot = top + sh * 1.25;
    g.beginPath();
    g.moveTo(cx, bot);
    g.bezierCurveTo(cx - sw * 0.62, bot - sh * 0.55, cx - sw * 0.55, top, cx, top);
    g.bezierCurveTo(cx + sw * 0.55, top, cx + sw * 0.62, bot - sh * 0.55, cx, bot);
    const grad = g.createRadialGradient(cx, top + sh * 0.45, 2, cx, top + sh * 0.5, sw * 0.6);
    grad.addColorStop(0, '#d8d8d8'); grad.addColorStop(1, '#707070');
    g.fillStyle = grad; g.fill();
    g.strokeStyle = '#262626'; g.lineWidth = 5; g.stroke();
    // the little ridge up from the point, with a notch either side
    g.strokeStyle = '#f0f0f0'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx, bot - 4); g.lineTo(cx, bot - sh * 0.45); g.stroke();
    g.strokeStyle = '#3a3a3a'; g.lineWidth = 3;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 6, bot - 8); g.lineTo(cx + s * sw * 0.16, bot - sh * 0.38); g.stroke(); }
  };
  // draw from the top row down, wrapped, so each row overlaps the one above (scales point down)
  for (let row = -1; row <= 2; row++) {
    for (let col = -1; col <= 2; col++) scale(col * sw + (row % 2 ? sw / 2 : 0), row * sh - sh * 0.3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Canvas height map of a leaf: a raised midrib and herringbone grooves running up and out from it. */
function veinBump() {
  const W = 64, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#3a3a3a'; g.lineWidth = 3;
  for (let y = -H; y < 2 * H; y += 16) {
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + s * 3, y); g.lineTo(W / 2 + s * W / 2, y - 22); g.stroke(); }
  }
  g.strokeStyle = '#e8e8e8'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const ellipse = (rx, ry, n = 72, hole = false) => {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 * (hole ? -1 : 1); pts.push(new THREE.Vector2(Math.cos(a) * rx, Math.sin(a) * ry)); }
  return pts;
};

/** The mirror (a FURNITURE builder: `item.y` = the oval's centre over the floor, hung on the wall behind local z = 0). */
export function pineappleMirror(item) {
  const P = PINEAPPLE_MIRROR, g = new THREE.Group();
  const skin = scaleBump(); skin.repeat.set(1 / P.scale[0], 1 / P.scale[1]); // UVs in metres: one tile = 2 scales
  const veins = veinBump(); veins.repeat.set(1 / P.leaf.w, 1 / 0.04); veins.offset.x = 0.5;
  const frameMat = new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.8, bumpMap: skin, bumpScale: P.bump });
  const leafMat = new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.8, bumpMap: veins, bumpScale: P.bump });
  const [rx, ry] = P.oval, [gx, gy] = P.glass, d = P.depth, bev = 0.004;
  // the oval frame: an extruded ring with rounded edges, the hole a little smaller than the glass behind it
  const ring = new THREE.Shape(ellipse(rx - bev, ry - bev));
  ring.holes.push(new THREE.Path(ellipse(gx - 0.006 + bev, gy - 0.006 + bev, 72, true)));
  const frameGeo = new THREE.ExtrudeGeometry(ring, { depth: d - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 72 });
  frameGeo.translate(0, 0, bev + 0.003);
  const parts = { frame: [frameGeo], leaf: [] };
  // the crown: a small ribbed collar on top of the oval and P.leaf.n pointed leaves fanning up from it
  const collar = new THREE.Shape();
  const cw = P.collar[0] / 2, ch = P.collar[1], cy = ry - 0.012;
  collar.moveTo(-cw, cy); collar.lineTo(cw, cy); collar.lineTo(cw * 0.9, cy + ch); collar.lineTo(-cw * 0.9, cy + ch); collar.closePath();
  const collarGeo = new THREE.ExtrudeGeometry(collar, { depth: d * 0.8 - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  collarGeo.translate(0, 0, 0.005);
  parts.leaf.push(collarGeo);
  const n = P.leaf.n, mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const k = Math.abs(i - mid) / mid, a = ((i - mid) / mid) * P.leaf.spread, L = P.leaf.l * (1 - 0.38 * k ** 1.2), w = P.leaf.w;
    const s = new THREE.Shape(); // leaf-local: the base at y 0, the tip at y L (UVs along the leaf for the veins)
    s.moveTo(-w * 0.32, 0);
    s.quadraticCurveTo(-w * 0.62, L * 0.45, 0, L);
    s.quadraticCurveTo(w * 0.62, L * 0.45, w * 0.32, 0);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: d * 0.7 - 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 8 });
    geo.rotateZ(-a);
    // the middle leaves in front, the outer ones a hair further back (no z-fighting where they overlap)
    geo.translate(Math.sin(a) * 0.02, cy + ch * 0.55 + Math.cos(a) * 0.004, 0.004 + (1 - k) * 0.002);
    parts.leaf.push(geo);
  }
  for (const [geos, mat] of [[parts.frame, frameMat], [parts.leaf, leafMat]]) {
    for (const geo of geos) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  }
  // the oval glass behind the frame's hole, and its mirror image (#50: only the nearest one in view renders)
  const glassGeo = () => new THREE.CircleGeometry(1, 72).scale(gx, gy, 1);
  const glass = new THREE.Mesh(glassGeo(), mirrorMaterial);
  glass.position.z = 0.012;
  g.add(glass);
  g.userData.keep = [glass];
  addReflector(glass, glassGeo(), { level: item.level, name: 'ananas' });
  g.position.y = item.y;
  return g;
}
