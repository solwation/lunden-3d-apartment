import * as THREE from 'three';
import { DRINKS as D } from './config.js';

// What a glass or a cup holds (#166–#169): amounts per drink (wine, champagne, whisky, milk, coffee) as
// fractions of the vessel's height, poured in over a second, drunk a sip at a time. Shared by the glasses
// (things.js) and the coffee cups (cups.js). A held thing that pours has `drink` (the kind) and `pour(secs)`
// (it tips meanwhile): the bottles, the milk, the coffee jug.

/** The Swedish name of a drink ("vin", "mjölk" …). */
export const drinkName = (kind) => D[kind]?.name ?? kind;

/**
 * How much of `kind` one pour adds to a `vessel` ('glass' | 'cup') holding `fill` (DRINKS.pour); 0 when it
 * can't go in there or the vessel is full.
 */
export function pourAmount(vessel, kind, fill) {
  const r = D.pour[vessel]?.[kind];
  if (!r) return 0;
  const to = fill < 0.01 && r.empty != null ? r.empty : r.to != null ? Math.max(fill, r.to) : fill + (r.add ?? 0);
  const got = Math.min(1, to) - fill;
  return got > 0.005 ? got : 0;
}

const tmpA = new THREE.Color(), tmpB = new THREE.Color();

export class Contents {
  constructor() { this.a = {}; this.to = null; }

  get total() { let s = 0; for (const k in this.a) s += this.a[k]; return s; }
  has(kind) { return (this.a[kind] ?? 0) > 0.005; }
  /** The biggest part, or null when empty. */
  get main() { let best = null; for (const k in this.a) if (this.a[k] > 0.005 && (!best || this.a[k] > this.a[best])) best = k; return best; }
  get pouring() { return !!this.to; }

  clear() { this.a = {}; this.to = null; }
  /** Only `kind`, up to `f` (tests, the beer test's full cup). */
  set(kind, f) { this.to = null; this.a = f > 0 ? { [kind]: f } : {}; }

  /** Start pouring `amount` of `kind` in over `secs` seconds (update() moves it in). */
  pour(kind, amount, secs = D.secs) {
    this.finish();
    this.from = { ...this.a };
    this.to = { ...this.a, [kind]: (this.a[kind] ?? 0) + amount };
    this.t = 0; this.secs = secs;
  }

  finish() { if (this.to) { this.a = this.to; this.to = null; } }

  /** Moves a pour on; true while something changed. */
  update(dt) {
    if (!this.to) return false;
    this.t += dt;
    const k = Math.min(1, this.t / this.secs);
    if (k >= 1) { this.finish(); return true; }
    const a = {};
    for (const key in this.to) a[key] = (this.from[key] ?? 0) + (this.to[key] - (this.from[key] ?? 0)) * k;
    this.a = a;
    return true;
  }

  /** Drink `amount` off the top: every part in proportion. */
  sip(amount) {
    this.finish();
    const tot = this.total;
    if (tot <= 0) return;
    const left = tot - amount < 1e-6 ? 0 : tot - amount; // 1 − 5 × 0.2 is not quite 0 in floats
    if (!left) { this.a = {}; return; }
    for (const k in this.a) this.a[k] *= left / tot;
  }

  /** The colour of the mix (each part weighted by its amount × its tint), into `out`. */
  color(out = new THREE.Color()) {
    let w = 0;
    out.setRGB(0, 0, 0);
    for (const k in this.a) {
      const wk = this.a[k] * (D[k]?.tint ?? 1);
      if (wk <= 0) continue;
      out.add(tmpA.set(D[k]?.color ?? 0x888888).multiplyScalar(wk));
      w += wk;
    }
    return w > 0 ? out.multiplyScalar(1 / w) : out.set(0x888888);
  }

  opacity() {
    let w = 0, o = 0;
    for (const k in this.a) { w += this.a[k]; o += this.a[k] * (D[k]?.opacity ?? 1); }
    return w > 0 ? o / w : 1;
  }
}

/**
 * The liquid inside a glass: a solid of revolution following the glass's inner profile `inner` ([[r, y], …]
 * from the bottom of the bowl up, in the glass's own frame), rebuilt up to the level when the fill changes.
 */
export class GlassLiquid {
  constructor(parent, inner) {
    this.inner = inner;
    this.material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.15, transparent: true, opacity: 1 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.visible = false;
    this.mesh.raycast = () => {}; // the glass is the target, not what is in it
    this.mesh.renderOrder = -1;   // inside a see-through glass: drawn before it
    parent.add(this.mesh);
    this.level = -1;
  }

  /** Inner radius at height y. */
  r(y) {
    const p = this.inner;
    if (y <= p[0][1]) return p[0][0];
    for (let i = 1; i < p.length; i++) if (y <= p[i][1]) {
      const [r0, y0] = p[i - 1], [r1, y1] = p[i];
      return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
    return p[p.length - 1][0];
  }

  /** Show `contents` (its total = the fill). */
  show(contents) {
    const f = contents.total;
    this.mesh.visible = f > 0.01;
    if (!this.mesh.visible) return;
    contents.color(this.material.color);
    this.material.opacity = contents.opacity();
    if (Math.abs(f - this.level) < 0.003) return;
    this.level = f;
    const p = this.inner, y0 = p[0][1], yl = y0 + (p[p.length - 1][1] - y0) * Math.min(1, f);
    const pts = [[0, y0], [this.r(y0), y0], ...p.filter(([, y]) => y > y0 && y < yl), [this.r(yl), yl], [this.r(yl) * 0.999, yl], [0, yl]];
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  }
}
