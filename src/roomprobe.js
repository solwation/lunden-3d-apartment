import * as THREE from 'three';
import { ROOM_PROBE as R } from './config.js';

// Glossy surfaces indoors reflect the room (#2151). Chrome, stainless steel, porcelain, glossy glass and tiles are tagged
// by the modules that build them (`material.userData.roomProbe = 'chrome'` …, classes and strengths in ROOM_PROBE.k);
// this module gives every tagged material ONE environment map: a low-resolution view of the room the visitor is in,
// drawn by a cube camera from the room's centre and pre-filtered by three's PMREM, kept per room zone. No pass per frame:
// a map is drawn at world load (after the warm-up), when the visitor enters a zone without a fresh map and when the light
// changed (the daylight band, a lamp, the mains), one cube face per frame. Below ROOM_PROBE.minLevel the little painted
// room (roomEnv, #307) shows instead; phones capture once. Both maps are 64 px pre-filtered textures: same programs.

/** A little painted room for glossy metal to reflect (#307; moved here from lights.js, which re-exports it): an
 * equirectangular canvas — a pale ceiling, cream walls with two bright windows, a light oak floor. Made once. */
let envTex = null;
export function roomEnv() {
  if (envTex) return envTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#f2eee8'); grad.addColorStop(0.38, '#e2dbd0'); grad.addColorStop(0.5, '#cbc1b2');
  grad.addColorStop(0.56, '#b9a993'); grad.addColorStop(1, '#8f7d68');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(40, 40, 30, 28); g.fillRect(170, 44, 22, 24); // windows
  g.fillStyle = '#3d3a36';
  g.fillRect(100, 52, 24, 20); // a dark doorway / cabinets
  envTex = new THREE.CanvasTexture(c);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  return envTex;
}

// ---------- pure helpers (tools/roomprobetest.mjs) ----------

/** What the shiny materials show at quality `level`: 'off' (no env map at all, `&noprobe`), 'painted' (roomEnv), 'once'
 * (phones: one capture, never again) or 'live' (captured per zone, recaptured on light changes). */
export function probeMode(level, { lowMemory = false, off = false, minLevel = R.minLevel } = {}) {
  if (off) return 'off';
  if (level < minLevel) return 'painted';
  return lowMemory ? 'once' : 'live';
}

/** The daylight band 0 … bands.length of `value` (0 night … 1 day). With the previous band `prev` a value must pass an edge
 * by `margin` before the band changes, so a cloud drifting over the threshold does not recapture back and forth. */
export function daylightBand(value, prev = null, bands = R.bands, margin = R.margin) {
  let b = 0;
  while (b < bands.length && value >= bands[b]) b++;
  if (prev === null || prev === b) return b;
  const edge = b > prev ? bands[b - 1] : bands[b]; // the edge just crossed (towards b)
  return Math.abs(value - edge) < margin && Math.abs(b - prev) === 1 ? prev : b;
}

/** Where a zone's probe stands: the centre of the largest region named `name` (RoomMap.regions()) when `inside(x, z)`
 * says it is in that room (an L-shaped room's centre can fall in a wall or the next room), else null (use the visitor's spot). */
export function zoneCenter(regions, name, inside = () => true) {
  let best = null;
  for (const r of regions) if (r.name === name && (!best || r.area > best.area)) best = r;
  return best && inside(best.x, best.z) ? { x: best.x, z: best.z } : null;
}

/** The window glass' evening mirror (#2179): `daylight` = the probe's sky value (0 night … 1 day), `lit` = true / false for the
 * visitor's room, null when no room is around (outdoors: the glass stays as it is). → { opacity, scale }: the glass' alpha
 * and the env-map strength × (the shader's Fresnel term makes it strongest at a grazing angle by itself). */
export function windowReflect(daylight, lit, W = R.window) {
  const [e0, e1] = W.edge, t = Math.min(1, Math.max(0, (daylight - e0) / (e1 - e0)));
  const night = lit === null ? 0 : (1 - t * t * (3 - 2 * t)) * (lit ? 1 : W.unlit);
  return { opacity: W.opacity[0] + (W.opacity[1] - W.opacity[0]) * night, scale: 1 + (W.gain - 1) * night };
}

/** paintedScale: the painted room's strength by daylight (0 … 1), so it does not shine at night. */
export const paintedScale = (daylight, night = R.paintedNight) => night + (1 - night) * Math.min(1, Math.max(0, daylight));

/**
 * When to capture (pure: no GPU). Zones are keys ('L:0:Kök / matplats', 'L1004:1:Hall' …), `sig` the light's signature
 * (daylight band + lamps). `step(dt, key, sig)` → null, { show: key } (a fresh map is cached: use it) or
 * { capture: key, sig } (draw one; call `begin` then `finish` when its faces are done). A missing or stale map is captured
 * at once the first time, otherwise once (key, sig) has held for `settle` s. 'once' captures the first zone and stops.
 */
export class ProbePlan {
  constructor({ mode = 'live', keep = R.keep, settle = R.settle } = {}) {
    Object.assign(this, { mode, keep, settle });
    this.cache = new Map(); // key → sig, oldest use first
    this.current = null;    // the key whose map the materials show
    this.capturing = null;  // { key, sig }
    this.want = { key: null, sig: null, age: 0 };
    this.captures = 0;
  }

  step(dt, key, sig) {
    if (this.mode !== 'live' && this.mode !== 'once') return null;
    if (this.capturing || key === null || key === undefined) return null;
    if (this.mode === 'once') return this.captures ? null : { capture: key, sig };
    if (this.want.key !== key || this.want.sig !== sig) this.want = { key, sig, age: 0 };
    else this.want.age += dt;
    if (this.cache.get(key) === sig) {
      if (this.current === key) return null;
      this.cache.delete(key); this.cache.set(key, sig); // (most recently used)
      this.current = key;
      return { show: key };
    }
    return !this.captures || this.want.age >= this.settle ? { capture: key, sig } : null;
  }

  begin(key, sig) { this.capturing = { key, sig }; }
  abort() { this.capturing = null; }

  /** The capture is drawn: it is cached and shown. Returns { key, evicted: [keys whose maps can be freed] }. */
  finish() {
    const { key, sig } = this.capturing;
    this.capturing = null;
    this.captures++;
    this.cache.delete(key); this.cache.set(key, sig);
    this.current = key;
    const evicted = [];
    for (const k of this.cache.keys()) {
      if (this.cache.size <= this.keep) break;
      if (k !== key) { this.cache.delete(k); evicted.push(k); }
    }
    return { key, evicted };
  }
}

// ---------- the probe ----------

/** The visitor's zone: { key, x, y, z } (the probe's spot) or null outdoors / in a doorway / in the stairwell.
 * `home` = { roomMaps, floorOf(level) } (L1007), `unit` = the visited flat (visitunit.js) or null, `level` its / our level. */
const centres = new WeakMap(); // RoomMap → Map(name → { x, z } | null)
export function probeZone(pos, level, home, unit = null, height = R.height) {
  const ox = unit?.ox ?? 0, oz = unit?.oz ?? 0, maps = unit ? unit.roomMaps : home.roomMaps;
  const map = maps?.[level];
  if (!map || level < 0) return null;
  const lx = pos.x - ox, lz = pos.z - oz, name = map.at(lx, lz);
  if (!name) return null;
  const key = `${unit ? unit.id : 'L'}:${level}:${name}`;
  if (!centres.has(map)) centres.set(map, new Map()); // (regions() walks the grid: once per room)
  const known = centres.get(map);
  if (!known.has(name)) known.set(name, zoneCenter(map.regions(), name, (x, z) => map.at(x, z) === name));
  const c = known.get(name) ?? { x: lx, z: lz };
  const floor = unit ? unit.levels[level].floor : home.floorOf(level);
  return { key, x: c.x + ox, y: floor + height, z: c.z + oz };
}

export class RoomProbe {
  /** `hide()` → objects to leave out of a capture (the mirrors: a Reflector would draw its own pass inside each face). */
  constructor(renderer, scene, camera, { lowMemory = false, off = false, hide = () => [] } = {}) {
    Object.assign(this, { renderer, scene, camera, lowMemory, off, hide });
    this.mats = new Map(); // material → its k (ROOM_PROBE.k[class])
    this.boost = new Map(); // material → an extra strength × (setBoost)
    this.plan = new ProbePlan({ mode: off ? 'off' : 'painted' });
    this.maps = new Map(); // zone key → PMREM render target
    this.face = -1; this.zone = null; this.daylight = 1; this.painted = -1;
    this.stats = { captures: 0, faces: 0, lastMs: 0 };
  }

  get mode() { return this.plan.mode; }

  /** Find the tagged materials under `root` (call before the warm-up, so their env-map programs are compiled then). */
  collect(root = this.scene) {
    if (this.off) return 0;
    const before = this.mats.size;
    root.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const cls = m.userData?.roomProbe;
        if (!cls || this.mats.has(m) || !(cls in R.k)) continue;
        this.mats.set(m, R.k[cls]);
        this.assign(m);
      }
    });
    return this.mats.size - before;
  }

  /** The map a material shows now: the current zone's capture, else the painted room. */
  get texture() {
    const live = this.mode === 'live' || this.mode === 'once';
    return (live && this.maps.get(this.plan.current)?.texture) || roomEnv();
  }

  assign(m) {
    // phones capture once (by day): the windows keep the painted room, which follows the night (#2179)
    const t = this.mode === 'once' && m.userData.roomProbe === 'window' ? roomEnv() : this.texture, k = this.mats.get(m) * (this.boost.get(m) ?? 1);
    if (m.envMap !== t) m.envMap = t;
    m.envMapIntensity = t === envTex ? k * paintedScale(this.daylight) : k;
  }

  /** Scale one material's strength (the window glass by night, #2179). */
  setBoost(m, f) {
    if (!this.mats.has(m) || Math.abs((this.boost.get(m) ?? 1) - f) < 0.01) return;
    this.boost.set(m, f); this.assign(m);
  }

  showAll() { this.painted = this.daylight; for (const m of this.mats.keys()) this.assign(m); }

  /** Quality level (a quality.js knob). */
  setLevel(level) {
    const mode = probeMode(level, { lowMemory: this.lowMemory, off: this.off });
    if (mode === this.plan.mode) return;
    if (this.plan.capturing) { this.plan.abort(); this.face = -1; }
    this.plan.mode = mode;
    this.showAll();
  }

  ensureTargets() {
    if (this.cube) return;
    const opts = this.lowMemory
      // phones (#1561): three's screen path for this target too (tone mapping + sRGB output = the programs already compiled
      // for the screen), stored as plain RGBA8; the PMREM decodes it (below)
      ? { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace }
      // desktop: linear half-float, as the mirror target: the mirror variants the warm-up compiled
      : { type: THREE.HalfFloatType };
    this.cube = new THREE.WebGLCubeRenderTarget(R.size, { ...opts, generateMipmaps: false, minFilter: THREE.LinearFilter });
    if (this.lowMemory) { this.cube.isXRRenderTarget = true; this.cube.texture.internalFormat = 'RGBA8'; }
    this.cams = new THREE.CubeCamera(R.near, R.far, this.cube);
    this.cams.coordinateSystem = this.renderer.coordinateSystem;
    this.cams.updateCoordinateSystem();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    if (this.lowMemory) { // three r170's private cube-to-cubeUV material: decode the sRGB-encoded faces as it is made
      let cm = null;
      Object.defineProperty(this.pmrem, '_cubemapMaterial', { configurable: true, get: () => cm, set: (m) => {
        if (m) m.fragmentShader = m.fragmentShader.replace(/gl_FragColor = (textureCube\([^;]*\));/, 'gl_FragColor = sRGBTransferEOTF( $1 );');
        cm = m;
      } });
    }
  }

  /** Once a frame. `zone` = probeZone(…) or null, `sig` = the light's signature, `canRender` = a frame without the shadow
   * pass or the warm-up. Draws at most `facesPerFrame` cube faces. */
  update(dt, zone, sig, daylight, canRender) {
    this.daylight = daylight;
    if (this.mode === 'off') return;
    if (this.texture === envTex && Math.abs(this.painted - daylight) > 0.01) this.showAll(); // the painted room follows the daylight
    if (this.face < 0) {
      const a = this.plan.step(dt, zone?.key ?? null, sig);
      if (a?.show) this.showAll();
      else if (a?.capture) { this.plan.begin(a.capture, a.sig); this.zone = zone; this.face = 0; }
    }
    if (this.face < 0 || !canRender) return;
    this.ensureTargets();
    const t0 = performance.now();
    for (let n = 0; n < R.facesPerFrame && this.face < 6; n++) this.renderFace(this.face++);
    if (this.face === 6) this.finish();
    this.stats.lastMs = performance.now() - t0;
  }

  renderFace(i) {
    const r = this.renderer, cams = this.cams, prev = r.getRenderTarget(), prevFace = r.getActiveCubeFace(), prevMip = r.getActiveMipmapLevel();
    if (i === 0) {
      cams.position.set(this.zone.x, this.zone.y, this.zone.z);
      cams.updateMatrixWorld(true);
      for (const c of cams.children) c.layers.mask = this.camera.layers.mask;
    }
    const hidden = this.hide().filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    try {
      r.setRenderTarget(this.cube, i);
      r.render(this.scene, cams.children[i]);
    } finally {
      for (const o of hidden) o.visible = true;
      r.setRenderTarget(prev, prevFace, prevMip);
    }
    this.stats.faces++;
  }

  finish() {
    this.face = -1;
    const { key, evicted } = this.plan.finish();
    this.maps.set(key, this.pmrem.fromCubemap(this.cube.texture, this.maps.get(key) ?? null));
    for (const k of evicted) { this.maps.get(k)?.dispose(); this.maps.delete(k); }
    this.stats.captures++;
    this.showAll();
    if (this.mode === 'once') { this.cube.dispose(); this.pmrem.dispose(); this.cube = null; } // phones: never again (#2151)
  }
}
