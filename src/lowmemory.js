import * as THREE from 'three';
// Phones and tablets get a smaller memory footprint (LOW_MEMORY, #585; lighter campus facades, #589): iOS otherwise
// kills the tab after a few steps. iPadOS Safari says "Macintosh", so a Mac with a touch screen counts too.
// `&lowmem` forces it on a desktop.
export const lowMemory = typeof navigator !== 'undefined' && (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  || (typeof location !== 'undefined' && /[?&]lowmem\b/.test(location.search)));

/**
 * Free a canvas texture's CPU copy once it is on the GPU (#628): three keeps the source canvas for as long as the texture
 * lives (the measured phone profile held ~186 MB of them). On phones only; desktop is untouched. Use it ONLY for textures
 * that are drawn once and never redrawn (no later `needsUpdate`) and are not cloned/shared after the upload: the canvas
 * shrinks to 1×1, so a second upload would show a blank texture. Returns `tex`.
 */
export function freeCanvasAfterUpload(tex) {
  if (!lowMemory) return tex;
  tex.onUpdate = () => {
    tex.onUpdate = null;
    const c = tex.image;
    if (typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) { c.width = 1; c.height = 1; }
  };
  return tex;
}

const GL_RELOAD_KEY = 'lunden.glReloadAt', GL_RELOAD_GAP = 60 * 1000;
/**
 * Phone only (#628): once a lost WebGL context is restored, three re-uploads every texture from its source, but the canvases
 * freed by `freeCanvasAfterUpload` are 1×1, so curtains, rugs, signs and posters would turn blank. Reload the page instead
 * (`reload()` saves the place and world like "Ladda om"; the page resumes where the visitor was). At most one automatic
 * reload per 60 s (sessionStorage), so a flapping context can never loop; then it only logs. Desktop is untouched.
 */
export function reloadOnContextRestore(canvas, reload) {
  if (!lowMemory) return;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { lost = true; e.preventDefault(); }); // lets the browser restore it
  canvas.addEventListener('webglcontextrestored', () => {
    if (!lost) return;
    let last = 0;
    try { last = Number(sessionStorage.getItem(GL_RELOAD_KEY)) || 0; } catch { /* blocked */ }
    if (Date.now() - last < GL_RELOAD_GAP) { console.warn('WebGL context restored again within 60 s: no second reload (#628)'); return; }
    try { sessionStorage.setItem(GL_RELOAD_KEY, String(Date.now())); } catch { /* blocked: no guard, but a reload still beats blank textures */ }
    reload();
  });
}

/** `&keepgeo` keeps the CPU copies on a phone (A/B comparison of #628 step 4). */
const KEEP_GEO = typeof location !== 'undefined' && /[?&]keepgeo\b/.test(location.search);
const GEO_FREE = ['normal', 'uv', 'uv1', 'color', 'plantWind'];
const noop = () => {};
let canaryOn = false;
/** Once: a copy of an attribute whose array was freed would upload an empty buffer, so say so loudly (a bug to fix at the maker). */
function canary() {
  if (canaryOn) return;
  canaryOn = true;
  const copy = THREE.BufferAttribute.prototype.copy;
  THREE.BufferAttribute.prototype.copy = function (source) {
    if (source.cpuFreed) console.warn('freeGeometryAfterUpload: a freed vertex attribute was cloned (#628)', source.name);
    return copy.call(this, source);
  };
  const d = Object.getOwnPropertyDescriptor(THREE.BufferAttribute.prototype, 'needsUpdate');
  if (d?.set) Object.defineProperty(THREE.BufferAttribute.prototype, 'needsUpdate', { ...d, set(v) {
    if (v === true && this.cpuFreed) console.warn('freeGeometryAfterUpload: a freed vertex attribute was marked for upload (#628)', this.name);
    d.set.call(this, v);
  } });
}
/**
 * Free a geometry's CPU copies once they are on the GPU (#628 step 4). three keeps every vertex attribute array for as
 * long as the geometry lives (the phone profile held ~138 MB); phones only, desktop is untouched. Only the attributes the
 * shader reads and the CPU never does are released (`names`: normals, uv, vertex colours, plant-wind data); `position`
 * and `index` stay because raycasts, TriGrid, DetailCuller bounds and the architecture edges read them. After the upload
 * (three's `onUploadCallback`, fired once when the GL buffer is created) the array becomes an empty typed array of the
 * same kind: `count`/`itemSize` stay, so a raycast's uv/normal interpolation reads NaN instead of throwing. Use it ONLY
 * for geometry that is built once, not deformed (cloth, curtains, bedding recompute normals), not read back and not cloned
 * AFTER it has been drawn: a clone of a freed attribute would upload an empty buffer (`cloneOfFreedAttribute` warns).
 * Returns `geo`.
 */
export function freeGeometryAfterUpload(geo, names = GEO_FREE) {
  if (!lowMemory || KEEP_GEO || !geo?.attributes || geo.attributes.bedCare || geo.userData.keepCpu) return geo;
  if (Object.values(geo.attributes).some((a) => a.usage !== 35044)) return geo; // a dynamic attribute: the geometry is rewritten while playing
  canary();
  for (const n of names) {
    const a = geo.attributes[n];
    if (!a || a.isInterleavedBufferAttribute || !a.array?.length) continue;
    a.onUpload(() => { a.array = new a.array.constructor(0); a.cpuFreed = true; a.onUploadCallback = noop; });
  }
  return geo;
}

const handled = new WeakSet();
/**
 * Phone only (#628 step 4): hook `freeGeometryAfterUpload` on every mesh geometry under `root`, so each one gives its
 * normals / uv / vertex colours / plant-wind data back once it is on the GPU (also later, for things hidden until first
 * shown). Skipped: skinned meshes and morph targets (they are re-read), geometries with a dynamic attribute or a
 * `bedCare` attribute (rewritten while playing) and anything flagged `geometry.userData.keepCpu` (makers that rewrite or
 * read their arrays after the build: watering, fruit, the drawing sheet's hit.uv). Call it once the scene is built, before
 * the first draw (`renderer`: normals are only packed while it holds no geometry yet). Returns the number of geometries hooked.
 */
export function freeSceneGeometryCopies(root, renderer) {
  if (!lowMemory || KEEP_GEO) return 0;
  const pack = !renderer || renderer.info.memory.geometries === 0; // nothing uploaded yet: replacing a normal attribute would leak its GL buffer otherwise
  let n = 0;
  root.traverse((o) => {
    const g = o.geometry;
    if (!o.isMesh || o.isSkinnedMesh || !g || handled.has(g) || (g.morphAttributes && Object.keys(g.morphAttributes).length)) return;
    handled.add(g);
    if (pack) packNormals(g);
    freeGeometryAfterUpload(g);
    n++;
  });
  return n;
}

const packed = new WeakMap();
/**
 * Phone only: the normals as normalized signed bytes (4 per vertex, 4-byte aligned) instead of 3 floats: 12 → 4 bytes on the
 * GPU. The axis-aligned normals of boxes and planes are exact (±127/127); a smooth one is off by < 0.4 %. MUST run before the
 * geometry's first upload (the old GL buffer of an uploaded attribute would leak) — `freeSceneGeometryCopies` runs before the
 * first draw. Skipped for dynamic attributes (their normals are rewritten as floats) and `keepCpu`. Shared attributes stay shared.
 */
function packNormals(geo) {
  const a = geo.attributes.normal;
  if (!a || geo.userData.keepCpu || a.isInterleavedBufferAttribute || a.itemSize !== 3 || !(a.array instanceof Float32Array) || a.usage !== 35044
    || Object.values(geo.attributes).some((x) => x.usage !== 35044)) return;
  let q = packed.get(a);
  if (!q) {
    const out = new Int8Array(a.count * 4);
    for (let i = 0, n = a.count; i < n; i++) {
      out[i * 4] = Math.round(a.array[i * 3] * 127); out[i * 4 + 1] = Math.round(a.array[i * 3 + 1] * 127); out[i * 4 + 2] = Math.round(a.array[i * 3 + 2] * 127);
    }
    q = new THREE.BufferAttribute(out, 4, true);
    packed.set(a, q);
  }
  geo.setAttribute('normal', q);
}
