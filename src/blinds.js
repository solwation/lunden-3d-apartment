import { setIcon } from './hudicons.js';
import * as THREE from 'three';
import { BLINDS, CURTAINS } from './config.js';
import { Curtain } from './curtains.js';

// Pleated blinds, bottom-up (#273, BLINDS in config): a folded pack on the window board, a top rail drawn up to the
// window's head. Each blind is two meshes (the pleated fabric, rebuilt only while it moves, and the top rail); the
// bottom rail, the guide cords and their head brackets are static and get baked with the fittings (merge.js).
// E on a blind opens #blind-panel (reading mode, like the wall clock's strip): W / S, ↑ / ↓ or ▲ ▼ (held) move it.
// Light: the fabric casts the sun's shadow; the visitor's room loses daylight (DayCycle.dim) by how much of its glass
// its blinds cover (blackout more than white); a white blind glows by day and warm from a lit room at night.

const KEY = 'lunden.blinds';
const B = BLINDS;

function loadState() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

const railMat = new THREE.MeshStandardMaterial({ color: B.colors.rail, roughness: 0.35, metalness: 0.6 });
const pickMat = new THREE.MeshBasicMaterial({ visible: false }); // a generous, invisible grip around the top rail

/** A box mesh between x0..x1, y0..y1, z0..z1. */
function boxMesh(x0, x1, y0, y1, z0, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

export class Blind {
  /** spec: { level, x0, x1, z (the blind's plane), out (±1 the way out along z), y0 (the window board), y1 (the head), tone }.
   * `statics` gets the bottom rail, cords and brackets (merged later). */
  constructor(spec, id, statics) {
    Object.assign(this, spec, { id, kind: 'blind', name: 'plisségardinen', verb: 'dra i', room: null, t: 0, moved: false });
    const { rail } = B, x0 = spec.x0, x1 = spec.x1, zc = spec.z, rh = rail.h, rd = rail.d / 2;
    this.yb = spec.y0 + rh; // the fabric's bottom (on the bottom rail)
    const hMax = spec.y1 - spec.y0 - 2 * rh - 0.004;
    this.n = Math.max(4, Math.round(hMax / B.pleat)); // pleats
    this.hMin = Math.max(0.012, this.n * B.pack);
    this.hMax = hMax;
    this.dark = spec.tone === 'dark';
    // static: the bottom rail on the window board, two guide cords up to small brackets under the head
    statics.add(boxMesh(x0, x1, spec.y0, spec.y0 + rh, zc - rd, zc + rd, railMat));
    for (const cx of [x0 + 0.035, x1 - 0.035]) {
      statics.add(boxMesh(cx - 0.0007, cx + 0.0007, spec.y0 + rh, spec.y1 - 0.01, zc - 0.0007, zc + 0.0007, railMat));
      statics.add(boxMesh(cx - 0.008, cx + 0.008, spec.y1 - 0.012, spec.y1, zc - 0.008, zc + 0.008, railMat));
    }
    this.object = new THREE.Group();
    // the fabric: a zig-zag of 2n strips, one material per blind (its glow follows its own room)
    this.mat = new THREE.MeshStandardMaterial({ color: this.dark ? B.colors.dark : B.colors.light, roughness: 0.92, side: THREE.DoubleSide, emissive: 0x000000 });
    const verts = this.n * 2 * 6;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // fixed bounds over the whole window: frustum culling, the raycast and the detail culler never need a recompute
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, spec.y0, zc - 0.02), new THREE.Vector3(x1, spec.y1, zc + 0.02));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    this.fabric = new THREE.Mesh(g, this.mat);
    this.fabric.castShadow = this.fabric.receiveShadow = true;
    // the top rail (+ the grip), moved as a group
    this.top = new THREE.Group();
    const tr = boxMesh(x0, x1, 0, rh, zc - rd, zc + rd, railMat);
    tr.castShadow = true;
    const grip = boxMesh(x0, x1, -0.05, rh + 0.04, zc - 0.04, zc + 0.04, pickMat);
    this.top.add(tr, grip);
    this.object.add(this.fabric, this.top);
    for (const m of [this.fabric, tr, grip]) m.userData.door = this; // E targets (and kept out of the merge)
    this.pickable = this.object;
    this.built = -1;
    this.set(0);
  }

  /** The fabric's height between the rails. */
  get h() { return this.hMin + this.t * (this.hMax - this.hMin); }
  /** How much of the glass the blind covers, 0 (folded) … 1 (drawn to the head). */
  get cover() { return this.t; }
  get isOpen() { return this.t > 0.01; }

  /** Set how far it is drawn up (0 folded … 1 at the head) and rebuild the folds. */
  set(t) {
    this.t = Math.min(1, Math.max(0, t));
    if (Math.abs(this.t - this.built) < 1e-5) return;
    this.built = this.t;
    const h = this.h, m = this.n * 2, rise = h / m;
    const d = Math.sqrt(Math.max(0, B.fold * B.fold - rise * rise)); // the folds' depth
    const pos = this.fabric.geometry.attributes.position, a = pos.array;
    const { x0, x1, z: zc, yb } = this;
    const zAt = (k) => zc + (k % 2 ? -d / 2 : d / 2);
    let i = 0;
    const v = (x, y, z) => { a[i++] = x; a[i++] = y; a[i++] = z; };
    for (let k = 0; k < m; k++) {
      const ya = yb + k * rise, yc = ya + rise, za = zAt(k), zb = zAt(k + 1);
      v(x0, ya, za); v(x1, ya, za); v(x1, yc, zb);
      v(x0, ya, za); v(x1, yc, zb); v(x0, yc, zb);
    }
    pos.needsUpdate = true;
    this.fabric.geometry.computeVertexNormals();
    this.top.position.y = yb + h;
  }
}

/** All the blinds (world.js builds them, main.js drives them). */
export class Blinds {
  constructor() {
    this.list = [];
    this.curtains = []; // Sovrum 1's curtains on their ceiling track (#342, src/curtains.js): same strip, cut and state
    this.object = new THREE.Group();
    this.statics = new THREE.Group(); // merged with the fittings
    this.active = null;
    this.dir = 0; // −1 down, +1 up while a key / button is held
    this.dim = 0; // the visitor's room's daylight cut, eased
    this.onMove = null; // (blind) while one moves: main.js redraws the shadows, counts the first pull
    this.saveAt = 0;
  }

  add(spec) {
    const b = new Blind(spec, `blind${this.list.length}`, this.statics);
    this.list.push(b);
    this.object.add(b.object);
    return b;
  }

  /** The curtains (#342, CURTAINS). */
  addCurtains() {
    for (const spec of CURTAINS) {
      const c = new Curtain(spec, `curtain${this.curtains.length}${spec.style === 'valance' ? '-valance' : ''}`, this.statics);
      this.curtains.push(c);
      this.object.add(c.object);
    }
  }

  /** After the room maps exist: which room each blind is in; and the state of the last visit. */
  init(roomAt) {
    const saved = loadState();
    for (const b of [...this.list, ...this.curtains]) {
      b.room = roomAt(b.level, (b.x0 + b.x1) / 2, b.z - b.out * 0.6);
      if (typeof saved[b.id] === 'number') b.set(saved[b.id]);
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries([...this.list, ...this.curtains].map((b) => [b.id, Math.round(b.t * 1000) / 1000])))); } catch { /* private mode */ }
  }

  /** Enter (a blind) / leave (null) the blind mode. */
  open(b) {
    if (this.active && this.active !== b) this.save();
    this.active = b;
    this.dir = 0;
    if (b) b.moved = false;
    else this.save();
  }

  /**
   * Every frame. env: { level, room (the visitor's), outdoors, daylight, sunDir (scene axes), overcast, lit(level, room) }.
   * Returns the daylight share to take away in the visitor's room (DayCycle.dim).
   */
  update(dt, env) {
    const b = this.active;
    if (b && this.dir) {
      const before = b.t;
      b.set(b.t + (this.dir * (b.speed ?? B.speed) * dt) / (b.travel ?? b.hMax - b.hMin));
      if (b.t !== before) {
        b.step?.(dt);
        const first = !b.moved;
        b.moved = true;
        this.onMove?.(b, first);
        this.saveAt += dt;
        if (this.saveAt > 1) { this.saveAt = 0; this.save(); }
      }
    }
    // a white blind glows: daylight through it (more with the sun on its façade), warm from a lit room at night
    const day = env.daylight * (1 - 0.5 * env.overcast);
    for (const x of this.list) {
      const sunOn = Math.max(0, env.sunDir.z * x.out) * Math.max(0, Math.min(1, env.sunDir.y * 4)) * (1 - env.overcast);
      const lit = x.room && env.lit(x.level, x.room) ? 1 : 0;
      const e = x.mat.emissive;
      if (x.dark) e.setScalar(B.glow.dark * lit);
      else {
        const dg = day * B.glow.day + sunOn * B.glow.sun * env.daylight, lg = lit * B.glow.lamp * (1 - 0.7 * env.daylight);
        e.setHex(B.colors.day).multiplyScalar(dg).add(tmp.setHex(B.colors.warm).multiplyScalar(lg));
      }
    }
    for (const c of this.curtains) c.glow(day, c.room && env.lit(c.level, c.room));
    // the visitor's room: how much of its glass is covered, by blackout or white fabric (weighted by width)
    let goal = 0;
    if (!env.outdoors && env.room) {
      let w = 0, cut = 0;
      for (const x of this.list) {
        if (x.level !== env.level || x.room !== env.room) continue;
        const ww = x.x1 - x.x0;
        w += ww;
        cut += ww * x.cover * (x.dark ? B.dim.dark : B.dim.light);
      }
      goal = w ? cut / w : 0;
      // drawn curtains take their share on top (a cotton print: less than the blackout blind)
      let cc = 0;
      for (const c of this.curtains) if (c.level === env.level && c.room === env.room) cc += c.cover * c.daylightCut * (c.spec.glass[1] - c.spec.glass[0]) / (w || 1);
      goal = 1 - (1 - goal) * (1 - Math.min(1, cc));
    }
    this.dim += (goal - this.dim) * (this.started ? Math.min(1, dt / B.fade * 3) : 1); // the first frame: at once (a reload, screenshots)
    this.started = true;
    if (Math.abs(goal - this.dim) < 1e-3) this.dim = goal;
    return this.dim;
  }
}
const tmp = new THREE.Color();

/**
 * The blind's control strip (#blind-panel): ▲ ▼ held (pointer events, touch too); with the mouse locked W / S or
 * ↑ / ↓ held do the same; E / Esc / × close it (main.js).
 */
export class BlindPanel {
  constructor(blinds, el) {
    Object.assign(this, { blinds, el, held: new Map() });
    this.bar = el.querySelector('.level i');
    this.pct = el.querySelector('.pct');
    for (const [act, dir] of [['up', 1], ['down', -1]]) {
      const b = el.querySelector(`[data-act=${act}]`);
      const stop = () => this.hold(act, 0);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); this.hold(act, dir); });
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointercancel', stop);
      b.addEventListener('lostpointercapture', stop);
    }
  }

  get open() { return !this.el.hidden; }

  show(blind) {
    // the curtains (#342) use the same strip sideways: ◀ draws them together (shut, #362: they meet in the middle), ▶ apart
    const c = blind?.kind === 'curtain';
    if (blind) {
      this.el.classList.toggle('curtain', c);
      this.el.setAttribute('aria-label', c ? 'Gardinerna' : 'Plisségardinen');
      const [u, dn] = ['up', 'down'].map((a) => this.el.querySelector(`[data-act=${a}]`));
      setIcon(u,c?'left':'up',c?'Dra för (håll inne)':'Dra upp (håll inne)');
      setIcon(dn,c?'right':'down',c?'Dra ifrån (håll inne)':'Dra ner (håll inne)');
      u.setAttribute('aria-label', c ? 'Dra för (håll inne)' : 'Dra upp (håll inne)');
      dn.setAttribute('aria-label', c ? 'Dra ifrån (håll inne)' : 'Dra ner (håll inne)');
      const hint = this.el.querySelector('small');
      if (hint) hint.textContent = c ? 'A/D: dra för/ifrån · E: klar' : 'W/S: dra upp/ner · E: klar';
    }
    this.el.hidden = !blind;
    this.held.clear();
    this.blinds.open(blind);
    this.render();
  }

  hold(key, dir) {
    if (dir) this.held.set(key, dir); else this.held.delete(key);
    this.blinds.dir = this.held.size ? [...this.held.values()].at(-1) : 0;
  }

  /** Keyboard while the strip is open; returns true when the key was used. */
  key(code, down) {
    const dir = (this.blinds.active?.kind === 'curtain' ? { KeyA: 1, ArrowLeft: 1, KeyD: -1, ArrowRight: -1 } : { KeyW: 1, ArrowUp: 1, KeyS: -1, ArrowDown: -1 })[code];
    if (!dir) return false;
    this.hold(code, down ? dir : 0);
    return true;
  }

  render() {
    const b = this.blinds.active;
    if (!b) return;
    const p = Math.round(b.t * 100);
    if (b.kind === 'curtain') {
      this.bar.style.height = '100%'; this.bar.style.width = `${p}%`;
      this.pct.textContent = p <= 0 ? 'ifrådragna' : p >= 100 ? 'fördragna' : `${p} % fördragna`;
      return;
    }
    this.bar.style.width = '';
    this.bar.style.height = `${p}%`;
    this.pct.textContent = p <= 0 ? 'nedfälld' : p >= 100 ? 'helt uppdragen' : `${p} % uppdragen`;
  }
}
