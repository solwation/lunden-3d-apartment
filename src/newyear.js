import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NEW_YEAR as N } from './config.js';

// New Year's Eve (#1199, part of #1170): in the last N.count game seconds before 00:00 on 31 December every TV switches
// itself on and counts down 10 … 1 (Screen.overlay, screens.js), then shows "Gott nytt år!" for N.cheer s; the TVs it
// switched on go off again afterwards. Champagne flutes stand on the coffee table from the countdown until
// N.glassesUntil o'clock on 1 January. Stateless in the game date/time (DayCycle), so spooling, ?newyear and the real
// clock all work; the fireworks are #1200.

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

/** Four flutes as two merged meshes (glass + champagne), only built when first needed. */
function buildGlasses() {
  const H = N.h, foot = 0.035, stem = 0.004, bowl0 = H * 0.42, rim = 0.028;
  const outer = [[0, 0], [foot, 0], [foot, 0.003], [stem * 1.6, 0.008], [stem, 0.014], [stem, bowl0 - 0.01], [stem * 2.5, bowl0],
    [rim * 0.85, bowl0 + (H - bowl0) * 0.25], [rim, bowl0 + (H - bowl0) * 0.7], [rim * 0.96, H]].map(([x, y]) => new THREE.Vector2(x, y));
  const top = bowl0 + (H - bowl0) * N.fill;
  const inner = [[0, bowl0 + 0.004], [stem * 2, bowl0 + 0.004], [rim * 0.8, bowl0 + (H - bowl0) * 0.25], [rim * 0.93, top], [0, top]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const glassGeo = [], wineGeo = [];
  for (const [x, z] of N.glasses) {
    glassGeo.push(new THREE.LatheGeometry(outer, 16).translate(x, 0, z));
    wineGeo.push(new THREE.LatheGeometry(inner, 12).translate(x, 0, z));
  }
  const g = new THREE.Group();
  const glass = new THREE.Mesh(mergeGeometries(glassGeo), new THREE.MeshStandardMaterial({ color: N.colors.glass, roughness: 0.05,
    metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  const wine = new THREE.Mesh(mergeGeometries(wineGeo), new THREE.MeshStandardMaterial({ color: N.colors.champagne, roughness: 0.15,
    transparent: true, opacity: 0.85, emissive: N.colors.champagne, emissiveIntensity: 0.08 }));
  wine.renderOrder = 1; glass.renderOrder = 2; // the champagne inside, then the glass over it
  g.add(wine, glass);
  g.position.y = 0.47; // the ILVA coffee table's top (FURNITURE coffeetable h)
  g.name = 'newyear-glasses';
  return g;
}

export class NewYear {
  /** tvs: the TV targets (furniture.js tv(), with .screen and toggle()); allowed(): may the TVs switch on (mains, furniture shown). */
  constructor({ scene, day, tvs, allowed = () => true }) {
    Object.assign(this, { scene, day, tvs, allowed, phase: '', forced: new Set(), glasses: null, st: null, year: 0 });
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
    this.phase = st.phase;
    const out = glassesOut(this.day);
    if (out && !this.glasses) { this.glasses = buildGlasses(); this.scene.add(this.glasses); }
    if (this.glasses) this.glasses.visible = out;
  }
}
