import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NEW_YEAR as N, DRINKS as D } from './config.js';
import { Glass } from './things.js';
import { Contents, liquidGeometry } from './drinks.js';

// New Year's Eve (#1199, part of #1170): in the last N.count game seconds before 00:00 on 31 December every TV switches
// itself on and counts down 10 … 1 (Screen.overlay, screens.js), then shows "Gott nytt år!" for N.cheer s; the TVs it
// switched on go off again afterwards. Champagne flutes stand on the coffee table from the countdown until
// N.glassesUntil o'clock on 1 January. Stateless in the game date/time (DayCycle), so spooling, ?newyear and the real
// clock all work; the fireworks (#1200) start from onMidnight when the countdown ends. The flutes are real glasses (#1222).

/** The New Year phase at the DayCycle's date/time: 'count' (with `left` whole seconds shown), 'cheer' or ''. */
export function newYearPhase(day) {
  const s = (24 - day.hour) * 3600;
  if (day.month === 12 && day.date === 31 && s <= N.count) return { phase: 'count', left: Math.max(1, Math.ceil(s)), frac: s % 1 };
  if (day.month === 1 && day.date === 1 && day.hour * 3600 < N.cheer) return { phase: 'cheer', left: 0, frac: 0 };
  return { phase: '', left: 0, frac: 0 };
}

/** Are the flutes out (from the countdown to N.glassesUntil on 1 January)? */
export const glassesOut = (day) => (day.month === 12 && day.date === 31 && (24 - day.hour) * 3600 <= N.count)
  || (day.month === 1 && day.date === 1 && day.hour < N.glassesUntil);

/** Draws the countdown / greeting on a TV canvas; returns the Ambilight [h, s, l]. */
function drawNewYear(ctx, w, h, st, year) {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, '#1b2d63'); g.addColorStop(1, N.colors.bg);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (st.phase === 'count') {
    const pop = 1 + 0.18 * Math.max(0, st.frac - 0.75) / 0.25; // each number swells a little as it arrives
    ctx.fillStyle = N.colors.gold;
    ctx.font = `600 ${Math.round(h * 0.09)}px system-ui, sans-serif`;
    ctx.fillText(`Nyårsafton ${year - 1}`, w / 2, h * 0.14);
    ctx.fillStyle = N.colors.digit;
    ctx.font = `800 ${Math.round(h * 0.62 * pop)}px system-ui, sans-serif`;
    ctx.fillText(String(st.left), w / 2, h * 0.56);
    return [0.62, 0.5, 0.28];
  }
  ctx.fillStyle = N.colors.gold;
  ctx.font = `800 ${Math.round(h * 0.2)}px system-ui, sans-serif`;
  ctx.fillText('Gott nytt år!', w / 2, h * 0.42);
  ctx.fillStyle = N.colors.digit;
  ctx.font = `700 ${Math.round(h * 0.24)}px system-ui, sans-serif`;
  ctx.fillText(String(year), w / 2, h * 0.7);
  return [0.12, 0.8, 0.45];
}

// The flutes (#1222) are real glasses (things.js Glass): champagne in them, taken, drunk a sip at a time, put down and
// filled again from the champagne bottle like any glass. While a flute stands untouched at its place on the coffee table
// it is drawn only as part of one merged decor pair (glass + champagne: 2 draw calls for all of them); its own model is
// hidden there but still the look ray's target (the raycaster ignores `visible`). Taken, it is its own glass (2 draw calls
// while out); sent home (F, cleaning) it is a fresh full flute in the decor again while the glasses are out, and away
// (hidden, no target) outside that time. Flutes put down somewhere else stay ordinary glasses.

const TABLE = 0.47; // the ILVA coffee table's top (FURNITURE coffeetable h)
const AWAY = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true }; // a flute put away: nothing to aim at

let shapes = null;
/** The flute's outer profile (one shared lathe), its inner profile for the drink, and the shared glass material. */
function fluteShapes() {
  if (shapes) return shapes;
  const H = N.h, foot = 0.035, stem = 0.004, bowl0 = H * 0.42, rim = 0.028;
  const outer = [[0, 0], [foot, 0], [foot, 0.003], [stem * 1.6, 0.008], [stem, 0.014], [stem, bowl0 - 0.01], [stem * 2.5, bowl0],
    [rim * 0.85, bowl0 + (H - bowl0) * 0.25], [rim, bowl0 + (H - bowl0) * 0.7], [rim * 0.96, H]].map(([x, y]) => new THREE.Vector2(x, y));
  const inner = [[0.0001, bowl0 + 0.004], [stem * 2, bowl0 + 0.004], [rim * 0.8, bowl0 + (H - bowl0) * 0.25], [rim * 0.93, bowl0 + (H - bowl0) * 0.7],
    [rim * 0.9, H - 0.003]];
  const material = new THREE.MeshStandardMaterial({ color: N.colors.glass, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35,
    depthWrite: false, side: THREE.DoubleSide });
  return (shapes = { geo: new THREE.LatheGeometry(outer, 16), inner, material });
}

/** A champagne flute of the New Year table: a Glass that belongs to `ny` (NewYear). */
export class Flute extends Glass {
  constructor(scene, camera, ny, [x, z], i) {
    const { geo, inner, material } = fluteShapes();
    const model = new THREE.Mesh(geo, material);
    model.position.set(x, TABLE, z);
    model.name = `newyear-flute-${i}`;
    super(scene, camera, { model, kind: 'glass', name: 'champagneglaset', inner });
    Object.assign(this, { ny, decor: false, season: true });
    model.visible = false;
    this.backTarget.pickable = new THREE.Object3D(); // no "put it back": put down on the table it is a glass standing there
  }

  /** At its place on the coffee table (neither held, put down elsewhere nor broken)? */
  get atHome() { return !this.held && !this.placed && !this.broken; }
  get target() { return this.atHome && !this.ny?.out ? AWAY : super.target; }
  onTake() { this.decor = false; super.onTake(); }
}

/** The decor of the flutes standing untouched: two merged meshes (glass + champagne). */
function buildDecor(flutes) {
  const { geo, inner, material } = fluteShapes(), fill = D.pour.glass.champagne.to;
  const glassGeo = [], wineGeo = [];
  for (const f of flutes) {
    const { x, z } = f.home.pos;
    glassGeo.push(geo.clone().translate(x, 0, z));
    wineGeo.push(liquidGeometry(inner, fill).translate(x, 0, z));
  }
  const full = new Contents(); full.set('champagne', fill);
  const wine = new THREE.Mesh(mergeGeometries(wineGeo), new THREE.MeshStandardMaterial({ roughness: 0.15, transparent: true }));
  full.color(wine.material.color); wine.material.opacity = full.opacity(); // as the same drink in a glass (GlassLiquid)
  const glass = new THREE.Mesh(mergeGeometries(glassGeo), material);
  for (const g of [...glassGeo, ...wineGeo]) g.dispose();
  wine.renderOrder = 1; glass.renderOrder = 2; // the champagne inside, then the glass over it
  wine.raycast = glass.raycast = () => {}; // the flutes' own (hidden) models are the targets
  const g = new THREE.Group();
  g.add(wine, glass);
  g.position.y = TABLE;
  g.name = 'newyear-glasses';
  return g;
}

export class NewYear {
  /** tvs: the TV targets (furniture.js tv(), with .screen and toggle()); allowed(): may the TVs switch on (mains, furniture shown);
   * shown(): is the furniture shown (F hides the flutes with it). `flutes`: the glasses (main.js adds them to the holdables). */
  constructor({ scene, camera, day, tvs, allowed = () => true, shown = () => true, onMidnight = null }) {
    Object.assign(this, { scene, day, tvs, allowed, shown, onMidnight, phase: '', forced: new Set(), glasses: null, decorKey: '', out: false, st: null, year: 0 });
    this.flutes = N.glasses.map((xz, i) => new Flute(scene, camera, this, xz, i));
    this.overlay = (ctx, w, h) => drawNewYear(ctx, w, h, this.st, this.year); // one shared overlay for every TV
  }

  update() {
    const st = this.st = newYearPhase(this.day);
    this.year = this.day.month === 1 ? this.day.year : this.day.year + 1;
    if (st.phase && !this.phase && this.allowed()) {
      for (const t of this.tvs) if (!t.isOpen) { t.toggle(); this.forced.add(t); }
    }
    if (!st.phase && this.phase) {
      for (const t of this.tvs) t.screen.overlay = null;
      for (const t of this.forced) if (t.isOpen) t.toggle();
      this.forced.clear();
    }
    if (st.phase) for (const t of this.tvs) t.screen.overlay = t.isOpen ? this.overlay : null;
    if (this.phase === 'count' && st.phase === 'cheer') this.onMidnight?.(); // the countdown reached 0: the fireworks (#1200)
    this.phase = st.phase;
    this.updateFlutes();
  }

  /** The flutes: at home and out, a full flute in the decor; at home otherwise, away; taken or put down, their own model. */
  updateFlutes() {
    const out = this.out = glassesOut(this.day), on = this.shown();
    for (const f of this.flutes) {
      if (f.atHome && out && !f.decor) { f.contents.set('champagne', D.pour.glass.champagne.to); f.used = false; f.liquid.show(f.contents); f.decor = true; }
      if (!(f.atHome && out)) f.decor = false;
      f.model.visible = on && !f.broken && (f.held || f.placed);
    }
    const key = this.flutes.map((f) => (f.decor ? 1 : 0)).join('');
    if (key !== this.decorKey) {
      this.decorKey = key;
      if (this.glasses) { this.scene.remove(this.glasses); for (const m of this.glasses.children) m.geometry.dispose(); }
      const standing = this.flutes.filter((f) => f.decor);
      this.glasses = standing.length ? buildDecor(standing) : null;
      if (this.glasses) this.scene.add(this.glasses);
    }
    if (this.glasses) this.glasses.visible = out && on;
  }
}
