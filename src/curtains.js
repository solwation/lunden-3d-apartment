import * as THREE from 'three';
import { LEVELS, SOFFITS } from './config.js';
import { sfx } from './audio.js';

// Curtains on a ceiling track (#342, CURTAINS in config): Sovrum 1's two teal jungle-print panels. A double track under
// the soffit; both panels stack to the east (the RÅGRUND chair fills the NW corner). Each panel is one wave-folded mesh
// rebuilt only while it moves: the fold count stays, the spacing shrinks and the folds deepen as it gathers; the print
// (our own canvas, tileable) rides with the cloth. They share the blinds' control strip (#blind-panel, src/blinds.js):
// A / D, ← / → or ◀ ▶ held draw them shut / open, and the blinds' daylight cut and saved state.

/** A seeded random (the same print every visit). */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** The jungle print: a tileable repeat on a teal ground — leaves, striped snake-plant blades, big flowers, zebras and
 * birds in brown / cream / dusty pink / mauve line work (after the user's photo; no brand). */
function printTexture(ground) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = ground;
  g.fillRect(0, 0, S, S);
  const r = rng(342);
  const ink = '#3a2a22', cream = '#eadfc8', brown = '#7a5a48', sage = '#8d9472', olive = '#5f6a4c', pink = '#c99a92', mauve = '#9a7b8c', rose = '#b5847e';
  // draw `fn` at (x, y) and its wrapped copies, so the repeat is seamless
  const wrap = (x, y, rad, fn) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      if (x + dx < -rad || x + dx > S + rad || y + dy < -rad || y + dy > S + rad) continue;
      g.save(); g.translate(x + dx, y + dy); fn(); g.restore();
    }
  };
  const leaf = (len, w, fill) => {
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w, -len / 2, 0, -len); g.quadraticCurveTo(-w, -len / 2, 0, 0);
    g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = ink; g.stroke();
    g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -len + 4); g.strokeStyle = cream; g.lineWidth = 1.2; g.stroke();
  };
  const blade = (len, w) => { // a striped snake-plant leaf
    g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(-w * 0.8, -len * 0.6, 0, -len); g.quadraticCurveTo(w * 0.8, -len * 0.6, w, 0); g.closePath();
    g.fillStyle = cream; g.fill(); g.save(); g.clip();
    g.fillStyle = olive;
    for (let y = -6; y > -len; y -= 13) { g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y - 7); g.lineTo(w, y - 12); g.lineTo(-w, y - 5); g.fill(); }
    g.restore(); g.lineWidth = 2; g.strokeStyle = ink; g.stroke();
  };
  const flower = (rad, a, b) => {
    const n = 7 + Math.floor(r() * 4);
    for (const [k, col] of [[1, a], [0.62, b], [0.3, cream]]) {
      for (let i = 0; i < n; i++) {
        g.save(); g.rotate((i / n) * Math.PI * 2 + k);
        g.beginPath(); g.ellipse(0, -rad * k * 0.55, rad * k * 0.32, rad * k * 0.5, 0, 0, Math.PI * 2);
        g.fillStyle = col; g.fill(); g.lineWidth = 1.5; g.strokeStyle = ink; g.stroke(); g.restore();
      }
    }
    g.beginPath(); g.arc(0, 0, rad * 0.12, 0, Math.PI * 2); g.fillStyle = brown; g.fill();
  };
  const zebra = (s) => {
    g.scale(s, s);
    g.fillStyle = '#f1ece0'; g.strokeStyle = ink; g.lineWidth = 2.5;
    for (const lx of [-26, -14, 16, 26]) { g.fillRect(lx - 4, 8, 8, 44); g.strokeRect(lx - 4, 8, 8, 44); }
    g.beginPath(); g.ellipse(0, 0, 38, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(26, -8); g.lineTo(44, -42); g.lineTo(56, -38); g.lineTo(40, -2); g.closePath(); g.fill(); g.stroke(); // neck
    g.beginPath(); g.ellipse(54, -42, 14, 8, 0.5, 0, Math.PI * 2); g.fill(); g.stroke(); // head
    g.fillStyle = ink;
    for (let x = -32; x < 34; x += 8) { g.beginPath(); g.moveTo(x, -19); g.quadraticCurveTo(x + 5, 0, x - 1, 18); g.lineTo(x + 3, 18); g.quadraticCurveTo(x + 8, 0, x + 3, -19); g.fill(); }
    for (let k = 0; k < 4; k++) g.fillRect(30 + k * 4, -30 - k * 6, 9, 3);
    g.beginPath(); g.moveTo(-38, -2); g.lineTo(-50, 14); g.stroke(); // tail
  };
  const bird = (s, body, wing) => {
    g.scale(s, s);
    g.strokeStyle = ink; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-30, 10); g.lineTo(-58, 30); g.lineTo(-52, 16); g.closePath(); g.fillStyle = wing; g.fill(); g.stroke(); // tail
    g.beginPath(); g.ellipse(0, 0, 30, 14, -0.3, 0, Math.PI * 2); g.fillStyle = body; g.fill(); g.stroke();
    g.beginPath(); g.ellipse(26, -14, 10, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(34, -16); g.lineTo(44, -10); g.lineTo(34, -8); g.fillStyle = cream; g.fill(); g.stroke(); // beak
    g.beginPath(); g.moveTo(-6, -4); g.quadraticCurveTo(-20, -40, 8, -30); g.quadraticCurveTo(10, -14, -6, -4); g.fillStyle = wing; g.fill(); g.stroke(); // wing
  };
  // under layer: many small leaves; then blades, flowers, the animals, more leaves around them
  for (let i = 0; i < 300; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI * 2, len = 36 + r() * 44, col = [sage, brown, olive, '#a59378'][Math.floor(r() * 4)];
    wrap(x, y, 70, () => { g.rotate(a); leaf(len, len * 0.55, col); });
  }
  for (let i = 0; i < 16; i++) {
    const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.6;
    wrap(x, y, 220, () => { g.rotate(a); blade(150 + r() * 60, 15); });
  }
  for (let i = 0; i < 22; i++) {
    const x = r() * S, y = r() * S, rad = 36 + r() * 36, pal = [[pink, rose], [mauve, pink], [cream, pink], [rose, mauve]][i % 4];
    wrap(x, y, rad + 10, () => flower(rad, pal[0], pal[1]));
  }
  const animals = [[180, 250, 'z', 1], [700, 160, 'b', 1], [520, 620, 'z', -1], [140, 820, 'b', -1], [880, 520, 'b', 1], [360, 420, 'b', 1]];
  for (const [x, y, k, flip] of animals) wrap(x, y, 170, () => { g.scale(flip, 1); if (k === 'z') zebra(1.9); else bird(1.6, [brown, '#8a6450', cream][Math.floor(r() * 3)], [rose, olive, brown][Math.floor(r() * 3)]); });
  for (let i = 0; i < 120; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI * 2, len = 26 + r() * 24;
    const td = (u, v) => Math.min(Math.abs(u - v), S - Math.abs(u - v));
    if (animals.some(([ax, ay]) => Math.hypot(td(x, ax), td(y, ay)) < 120)) continue; // the animals stay in view
    wrap(x, y, 50, () => { g.rotate(a); leaf(len, len * 0.5, [sage, '#b8a888', brown][Math.floor(r() * 3)]); });
  }
  for (let i = 0; i < 60; i++) { // small cream stars between the leaves
    const x = r() * S, y = r() * S;
    wrap(x, y, 8, () => { g.fillStyle = cream; g.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? 2 : 5, a = (k / 10) * Math.PI * 2; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const lerp = (a, b, t) => a + (b - a) * t;
const ROWS = 5, SEG = 4; // rows of vertices down the drop; segments per wave fold

/** One panel: a wave-folded sheet from x a..b at the rail's z, `fabric` m of cloth in `n` folds. */
class Panel {
  constructor(spec, zc, fabric, mat, y0, y1) {
    Object.assign(this, { zc, fabric, y0, y1, amp: spec.amp });
    this.n = Math.max(6, Math.round(fabric / 0.105));
    const cols = this.n * SEG + 1;
    this.cols = cols;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(cols * ROWS * 3), uv = new Float32Array(cols * ROWS * 2), idx = [];
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      uv[k * 2] = (i / (cols - 1)) * fabric / spec.tile; // the print gathers with the cloth
      uv[k * 2 + 1] = lerp(y0, y1, j / (ROWS - 1)) / spec.tile;
      if (i < cols - 1 && j < ROWS - 1) idx.push(k, k + 1, k + cols, k + 1, k + cols + 1, k + cols);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cols * ROWS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // fixed bounds over the whole track: culling, raycasts and the detail culler need no recompute
    g.boundingBox = new THREE.Box3(new THREE.Vector3(spec.x0 - 0.05, y0, zc - 0.05), new THREE.Vector3(spec.east + 0.05, y1, zc + 0.05));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }

  /** Lay the cloth between x a and b. */
  build(a, b) {
    this.a = a; this.b = b;
    const { n, cols, zc, y0, y1 } = this;
    const s = (b - a) / n, L = this.fabric / n; // fold spacing, cloth per fold
    const A = Math.min(this.amp, Math.sqrt(Math.max(0, (L / 2) ** 2 - (s / 2) ** 2)) / 2); // deeper as it gathers
    const p = this.mesh.geometry.attributes.position.array;
    for (let j = 0; j < ROWS; j++) {
      const v = j / (ROWS - 1), y = lerp(y0, y1, v);
      const aj = A * (1.12 - 0.12 * v); // a touch fuller at the hem
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 3, ph = (i / SEG) * Math.PI * 2;
        p[k] = a + (b - a) * (i / (cols - 1));
        p[k + 1] = y;
        p[k + 2] = zc + aj * Math.sin(ph);
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

export class Curtain {
  /** spec: a CURTAINS entry; `statics` gets the track (baked with the fittings). */
  constructor(spec, id, statics) {
    Object.assign(this, { spec, id, kind: 'curtain', name: 'gardinerna', verb: 'dra i', level: spec.level, room: null, t: 0, moved: false, dark: false, out: -1 });
    this.x0 = spec.glass[0]; this.x1 = spec.glass[1]; this.z = spec.z[0]; // the room lookup (Blinds.init)
    this.speed = spec.speed;
    this.travel = spec.park - spec.x0; // the leading edge's way
    const fl = LEVELS[spec.level].floor;
    const y0 = fl + spec.drop, y1 = fl + spec.top;
    this.tex = printTexture(spec.colors.ground);
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: 0x000000, roughness: 0.93, side: THREE.DoubleSide });
    // shut: the front panel from x0 to the middle, the back one from the middle to the track's east end
    const half = spec.overlap / 2, sw = (spec.east - spec.park) / 2;
    this.ends = {
      front: { open: [spec.park, spec.park + sw], shut: [spec.x0, spec.meet + half] },
      back: { open: [spec.park + sw, spec.east], shut: [spec.meet - half, spec.east] },
    };
    this.front = new Panel(spec, spec.z[1], spec.fullness * (spec.meet + half - spec.x0), this.mat, y0, y1);
    this.back = new Panel(spec, spec.z[0], spec.fullness * (spec.east - spec.meet + half), this.mat, y0, y1);
    this.object = new THREE.Group();
    this.object.add(this.front.mesh, this.back.mesh);
    for (const m of [this.front.mesh, this.back.mesh]) m.userData.door = this; // E targets, kept out of the merge
    this.pickable = this.object;
    // the track: two slim white rails on the soffit's underside + a mounting strip, end caps
    const trackMat = new THREE.MeshStandardMaterial({ color: spec.colors.track, roughness: 0.4, metalness: 0.1 });
    const sof = SOFFITS.find((o) => o.level === spec.level && spec.z[0] > o.z0 && spec.z[1] < o.z1 && spec.x0 > o.x0 && spec.east < o.x1);
    const yc = fl + (sof?.height ?? LEVELS[spec.level].ceiling); // the soffit's underside (RH 2.4)
    const box = (x0, x1, ya, yb, z0, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, yb - ya, z1 - z0), trackMat); m.position.set((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2); return m; };
    const tx0 = spec.x0 - 0.04, tx1 = spec.east + 0.02;
    for (const z of spec.z) statics.add(box(tx0, tx1, yc - 0.018, yc, z - 0.012, z + 0.012));
    statics.add(box(tx0, tx1, yc - 0.004, yc, spec.z[0] - 0.012, spec.z[1] + 0.012));
    this.yTop = y1;
    this.built = -1;
    this.sound = 0;
    this.set(0);
  }

  /** How much of the glass is covered, 0 (open) … 1 (shut). */
  get cover() {
    const g1 = this.spec.glass[1], g0 = Math.max(this.spec.glass[0], this.spec.x0); // shut = all of it (x0 is over the sash's frame)
    return Math.min(1, Math.max(0, (g1 - this.front.a) / (g1 - g0)));
  }
  get isOpen() { return this.t > 0.01; }

  /** 0 open (parked east) … 1 drawn shut. */
  set(t) {
    this.t = Math.min(1, Math.max(0, t));
    if (Math.abs(this.t - this.built) < 1e-5) return;
    this.built = this.t;
    for (const k of ['front', 'back']) {
      const e = this.ends[k];
      this[k].build(lerp(e.open[0], e.shut[0], this.t), lerp(e.open[1], e.shut[1], this.t));
    }
  }

  /** While it moves (Blinds.update): a soft runner rattle now and then. */
  step(dt) {
    this.sound -= dt;
    if (this.sound > 0) return;
    this.sound = 0.42;
    sfx.slide(new THREE.Vector3(this.front.a, this.yTop, this.spec.z[1]), { dur: 0.4, wardrobe: true });
  }

  /** The cotton lets a little daylight through (teal), warm from a lit room at night. */
  glow(day, lit) {
    const g = this.spec.glow, e = this.mat.emissive;
    e.setHex(this.spec.colors.glow).multiplyScalar(day * g.day);
    if (lit) e.add(tmp.setHex(this.spec.colors.warm).multiplyScalar(g.lamp));
  }
}
const tmp = new THREE.Color();
