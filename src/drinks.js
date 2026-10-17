import * as THREE from 'three';
import { BeerPortion } from './beercan.js';
import { DRINKS as D } from './config.js';

// What a glass or a cup holds (#166–#169): amounts per drink (wine, champagne, whisky, milk, coffee, beer) as
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
  constructor() { this.a = {}; this.to = null; this.beer = []; }

  get total() { let s = 0; for (const k in this.a) s += this.a[k]; return s; }
  has(kind) { return (this.a[kind] ?? 0) > 0.005; }
  /** The biggest part, or null when empty. */
  get main() { let best = null; for (const k in this.a) if (this.a[k] > 0.005 && (!best || this.a[k] > this.a[best])) best = k; return best; }
  get pouring() { return !!this.to; }

  clear() { this.a = {}; this.to = null; this.beer = []; }
  /** Only `kind`, up to `f` (tests, the beer test's full cup). */
  set(kind, f) { this.clear(); this.a = f > 0 ? { [kind]: f } : {}; }

  /** Start pouring `amount` of `kind` in over `secs` seconds (update() moves it in). */
  pour(kind, amount, secs = D.secs, origin = null) {
    this.finish();
    this.from = { ...this.a };
    this.to = { ...this.a, [kind]: (this.a[kind] ?? 0) + amount };
    this.t = 0; this.secs = secs;
    if (origin?.portion && origin.ml > 0) {
      const lot = this.beer.find(l => l.portion === origin.portion);
      if (lot) lot.ml += origin.ml; else this.beer.push({ portion: origin.portion, ml: origin.ml });
    }
  }

  canAddBeer(portion) { return this.beer.length < D.beerLots || this.beer.some(l => l.portion === portion); }
  keepBeer() {
    return { lots: this.beer.map(l => ({ ml: l.ml, portion: l.portion.toJSON() })),
      ...(this.to && (this.to.beer ?? 0) > (this.from.beer ?? 0) ? { pending: { from: this.from, to: this.to, t: this.t, secs: this.secs } } : {}) };
  }
  loadBeer(s, shared) {
    this.beer = [];
    if (!s) return; // legacy contents remain anonymous and cannot heal
    this.to = null;
    const fail = () => { delete this.a.beer; this.to = null; this.beer = []; };
    if (!Array.isArray(s.lots) || s.lots.length > D.beerLots) { fail(); return; }
    const p = s.pending, amounts = a => a && typeof a === 'object' && Object.entries(a).every(([k,n]) => D.pour.glass[k] && Number.isFinite(n) && n >= 0) && Object.values(a).reduce((x,y) => x+y,0) <= 1.000001;
    if (p && (!amounts(p.from) || !amounts(p.to) || !Number.isFinite(p.t) || p.t < 0 || !Number.isFinite(p.secs) || p.secs <= 0 || p.t >= p.secs
      || [...new Set([...Object.keys(p.from), ...Object.keys(p.to), ...Object.keys(this.a)])].some(k => !Object.hasOwn(p.to, k) || p.to[k] < (p.from[k] ?? 0) || Math.abs((this.a[k] ?? 0) - ((p.from[k] ?? 0) + (p.to[k] - (p.from[k] ?? 0)) * p.t / p.secs)) > 1e-4))) { fail(); return; }
    const seen = new Set();
    if (s.lots.some(l => !l || !Number.isFinite(l.ml) || l.ml <= 0 || !BeerPortion.fromJSON(l.portion) || l.ml + l.portion.drunk > l.portion.total + 1e-4
      || shared.invalid?.has(l.portion.id) || ((l.portion.fin || l.portion.finished) && l.portion.drunk < l.portion.total - 1e-4)
      || (shared.get(l.portion.id) && shared.get(l.portion.id).total !== l.portion.total) || seen.has(l.portion.id) || !seen.add(l.portion.id))
      || s.lots.reduce((n,l) => n+l.ml,0) > ((p?.to ?? this.a).beer ?? 0) * D.ml.glass + 1e-4) { fail(); return; }
    if (p) { this.from = { ...p.from }; this.to = { ...p.to }; this.t = p.t; this.secs = p.secs; }
    for (const lot of s.lots) this.beer.push({ portion: BeerPortion.fromJSON(lot.portion, shared), ml: lot.ml });
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
    if (tot <= 0) return [];
    const fraction = Math.min(1, amount / tot), terminal = [];
    for (const lot of this.beer) {
      const ml = lot.ml * fraction; lot.ml -= ml;
      if (lot.portion.drink(ml).terminal) terminal.push(lot.portion.id);
    }
    this.beer = this.beer.filter(l => l.ml > 1e-4);
    const left = tot - amount < 1e-6 ? 0 : tot - amount; // 1 − 5 × 0.2 is not quite 0 in floats
    if (!left) { this.a = {}; return terminal; }
    for (const k in this.a) this.a[k] *= left / tot;
    return terminal;
  }

  /**
   * The colour of the mix, into `out`: each part weighted by its amount × its tint, mixed in sRGB (as paint
   * looks); a part's `withCoffee` colour stands in for its own when there is coffee in it (milk → café au lait).
   */
  color(out = new THREE.Color()) {
    let w = 0;
    const coffee = this.has('coffee');
    tmpB.setRGB(0, 0, 0);
    for (const k in this.a) {
      const wk = this.a[k] * (D[k]?.tint ?? 1);
      if (wk <= 0) continue;
      const hex = (coffee && D[k]?.withCoffee) || (D[k]?.color ?? 0x888888);
      tmpB.add(tmpA.set(hex).convertLinearToSRGB().multiplyScalar(wk));
      w += wk;
    }
    return w > 0 ? out.copy(tmpB.multiplyScalar(1 / w).convertSRGBToLinear()) : out.set(0x888888);
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
  r(y) { return innerRadius(this.inner, y); }

  /** Show `contents` (its total = the fill). */
  show(contents) {
    const f = contents.total;
    this.mesh.visible = f > 0.01;
    if (!this.mesh.visible) return;
    contents.color(this.material.color);
    this.material.opacity = contents.opacity();
    if (Math.abs(f - this.level) < 0.003) return;
    this.level = f;
    this.mesh.geometry.dispose();
    this.mesh.geometry = liquidGeometry(this.inner, f);
  }
}

/** Inner radius of the profile `p` ([[r, y], …]) at height y. */
function innerRadius(p, y) {
  if (y <= p[0][1]) return p[0][0];
  for (let i = 1; i < p.length; i++) if (y <= p[i][1]) {
    const [r0, y0] = p[i - 1], [r1, y1] = p[i];
    return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return p[p.length - 1][0];
}

/** The drink's solid in a glass with inner profile `inner`, filled to `f` (also the New Year flutes' merged decor, #1222). */
export function liquidGeometry(inner, f) {
  const p = inner, y0 = p[0][1], yl = y0 + (p[p.length - 1][1] - y0) * Math.min(1, f), r = (y) => innerRadius(p, y);
  const pts = [[0, y0], [r(y0), y0], ...p.filter(([, y]) => y > y0 && y < yl), [r(yl), yl], [r(yl) * 0.999, yl], [0, yl]];
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 24);
}
