import { WARM } from './config.js';

// Warm-up (#432, #592): everything the GPU will need is compiled and uploaded behind the start screen, so nothing is
// drawn for the first time while the visitor plays. The first time the inside of the flat was drawn (opening the front
// door after a fresh start) three compiled the shadow-depth programs and uploaded the geometry and textures of everything
// in it in one frame — a freeze of a couple of seconds; the first mirror in view compiled ~50 programs (#592).
// Stages, one per frame or idle slot, driven by `tick()` from the game loop:
//  1. `WARM.frames` frames in (after lampwash has patched the materials: the programs compiled are the final ones)
//     every material's program is compiled (compileAsync; `prepare()` first, #668: the lamp washes' own patching of materials
//     made since the scene was built runs every 120 frames, and a patch recompiles a material under a new key — it
//     happened to fall in the first turning frames after the warm-up, 7–20 new programs in a frame); compileAsync runs in parallel where the GPU can);
//  2. ONE frame is drawn with every layer — the camera's and the sun's shadow camera's (DetailCuller's layer 7 too) —
//     and no frustum culling, shadows included, which uploads the rest; the next frame draws over it;
//  3. the mirror variants (#592): a mirror draws into a half-float render target, where three uses no tone mapping and
//     linear output, i.e. a second program per material. They are compiled with that target bound, then one frame is
//     drawn into it (every layer, no culling) — the shared mirror target is allocated once here;
//  4. idle time: every texture of every material, hidden ones too (seasonal things, closed cupboards' contents), is
//     uploaded (`renderer.initTexture`) a few at a time.
//     On phones (`lazyHidden`, #628) this stage is skipped: what is hidden at the start (seasonal things, closed cupboards'
//     contents) uploads when it first shows, a small hitch, instead of holding its textures in GPU memory all along.
// #669 (phones, `sliced`): stages 1 and 3 compile `WARM.programs` new programs per frame (slices of the scene's renderables,
//     one `renderer.compile` per `WARM.batch` objects) and the draws of stages 2 and 3 draw `WARM.drawObjects` objects (or
//     `WARM.drawVertices` vertices) per frame — the other objects sit on a private hidden layer for that one render — instead
//     of ~110 programs / the whole scene in ONE frame (the iPhone crash reports: one frame of 4.4-4.7 s, lagMs, in
//     `compiling`, then WebGL context loss). Waiting for compiled programs no longer relies on three's `compileAsync`: its
//     poll reads `properties.get(material).currentProgram.isReady()` in a bare setTimeout, so a material disposed meanwhile
//     threw there ("Script error." in the reports: cross-origin), the promise never settled and the warm-up stayed in
//     `compiling` for ever (reproduced by disposing a scene material while compiling). `whenReady` guards every read and
//     gives up after a timeout. Not measured on a device.
// Headless test browsers skip it (minutes of SwiftShader, nobody looks), `&warm` forces it.
export class WarmUp {
  /** `mirrorTarget()` → the render target mirrors draw into (or null); `log(text)` for `&perf`; `sliced` = phones (#669). */
  constructor({ renderer, scene, camera, shadowCamera, mirrorTarget = () => null, prepare = () => {}, skip = false, lazyHidden = false, sliced = false, log = null, onSlowFrame = () => {} }) {
    Object.assign(this, { renderer, scene, camera, shadowCamera, mirrorTarget, prepare, lazyHidden, sliced, log, onSlowFrame });
    this.state = skip ? 'skipped' : 'pending'; // → compiling → draw (→ drawing) → mirror → compiling → mirror-draw (→ drawing) → textures → uploading → done
    this.wait = WARM.frames;
    this.textures = null;
    this.job = null;
  }

  get done() { return this.state === 'done' || this.state === 'skipped'; }

  /** What the crash report shows besides `state`: where the sliced stages are (`compiling 12/113`, `drawing 3/20 mirror`). */
  get detail() {
    const j = this.job;
    return j && (this.state === 'compiling' || this.state === 'drawing') ? `${this.state} ${j.i}/${j.n}${j.target ? ' mirror' : ''}` : this.state;
  }

  /** Call once per frame before the frame's own work; returns true when this frame did a heavy warm-up draw. */
  tick() {
    switch (this.state) {
      case 'pending':
        if (--this.wait <= 0) this.startCompile(null, 'draw');
        return false;
      case 'compiling': if (this.sliced) this.compileSlice(); return false;
      case 'draw': return this.startDraw(null, 'mirror');
      case 'drawing': return this.drawSlice();
      case 'mirror': {
        const t = this.mirrorTarget();
        if (!t) { this.state = 'textures'; return false; }
        this.startCompile(t, 'mirror-draw');
        return false;
      }
      case 'mirror-draw': return this.startDraw(this.mirrorTarget(), 'textures');
      case 'textures':
        if (this.lazyHidden) { this.state = 'done'; this.log?.(`warm-up: hidden textures left for later, ${this.renderer.info.memory.textures} on the GPU`); return false; }
        this.state = 'uploading'; this.uploadTextures(); return false;
      default: return false;
    }
  }

  /** Every mesh / line / points / sprite of the scene (hidden ones too): what there is to compile and draw. */
  renderables() {
    const out = [];
    this.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material) out.push(o); });
    return out;
  }

  /** `renderer.compile` for `objects` (null = the whole scene) with `target` bound (the program variant depends on it); returns the materials. */
  compileObjects(objects, target) {
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(target);
    try {
      // (a stand-in for the scene that holds just these objects: the lights and fog still come from the real scene)
      return r.compile(objects ? { traverseVisible() {}, traverse: (f) => objects.forEach(f) } : this.scene, this.camera, this.scene);
    } finally { r.setRenderTarget(prev); }
  }

  /** Resolves when every program of `materials` is ready, after `maxMs`, or when one cannot be read (a disposed material,
   *  a lost context): never rejects, never waits for ever (three's compileAsync does, see #669 above). */
  whenReady(materials, maxMs) {
    const r = this.renderer, left = new Set(materials), end = performance.now() + maxMs;
    return new Promise((resolve) => {
      const check = () => {
        try {
          for (const m of left) { const p = r.properties.get(m).currentProgram; if (!p || p.isReady()) left.delete(m); }
        } catch { left.clear(); }
        if (!left.size || performance.now() > end) return resolve();
        setTimeout(check, 10);
      };
      if (!left.size) resolve(); else setTimeout(check, 10);
    });
  }

  startCompile(target, next) {
    const t = performance.now(), r = this.renderer;
    this.prepare(); // (#668: the lamp washes' patch of materials made since, now rather than 120 frames later; in sliced mode also before each stage)
    this.state = 'compiling';
    const finish = () => { this.job = null; this.state = next; this.log?.(`warm-up: programs${target ? ' (mirror)' : ''} ${Math.round(performance.now() - t)} ms, ${r.info.programs.length} in all`); };
    if (this.sliced) {
      const items = this.renderables();
      this.job = { target, items, i: 0, n: items.length, waiting: false, finish };
      return;
    }
    try {
      this.whenReady(this.compileObjects(null, target), WARM.timeout).then(finish);
    } catch (e) { this.log?.(`warm-up: compile failed: ${e?.message}`); finish(); }
    this.onSlowFrame();
  }

  /** Sliced compile (phones): one slice per frame, the next one when the last one's programs are ready (or after WARM.ready). */
  compileSlice() {
    const j = this.job;
    if (!j || j.waiting) return;
    const r = this.renderer, t0 = performance.now(), n0 = r.info.programs?.length ?? 0, slice = new Set();
    try {
      while (j.i < j.items.length) {
        const batch = j.items.slice(j.i, j.i += WARM.batch);
        this.compileObjects(batch, j.target).forEach((m) => slice.add(m));
        if ((r.info.programs?.length ?? 0) - n0 >= WARM.programs || performance.now() - t0 > WARM.compileMs) break;
      }
    } catch (e) { this.log?.(`warm-up: compile failed: ${e?.message}`); j.i = j.items.length; }
    this.onSlowFrame();
    const last = j.i >= j.items.length;
    j.waiting = true;
    this.whenReady(slice, last ? WARM.timeout : WARM.ready).then(() => { j.waiting = false; if (last) j.finish(); });
  }

  /** Draw everything once into `target` (null = the screen): the whole scene in this frame, or (sliced) slice by slice over the next frames. */
  startDraw(target, next) {
    this.prepare();
    if (!this.sliced) { this.drawAll(target); this.state = next; return true; }
    const items = this.renderables().filter((o) => o.visible), ranges = [];
    let a = 0, verts = 0;
    for (let k = 0; k < items.length; k++) {
      const v = items[k].geometry?.attributes?.position?.count ?? 0;
      if (k > a && (k - a >= WARM.drawObjects || verts + v > WARM.drawVertices)) { ranges.push([a, k]); a = k; verts = 0; }
      verts += v;
    }
    if (items.length > a) ranges.push([a, items.length]);
    this.job = { target, next, items, ranges, i: 0, n: ranges.length, t: performance.now() };
    this.state = 'drawing';
    return this.drawSlice();
  }

  drawSlice() {
    const j = this.job, range = j?.ranges[j.i++];
    if (range) this.drawRange(j.target, j.items, range[0], range[1]);
    if (!j || j.i >= j.ranges.length) {
      this.renderer.shadowMap.needsUpdate = true; // the real view's shadows next
      this.log?.(`warm-up: first draw of everything${j?.target ? ' (mirror)' : ''} in ${j?.n ?? 0} slices, ${Math.round(performance.now() - (j?.t ?? 0))} ms`);
      this.state = j?.next ?? 'textures'; this.job = null;
    }
    return !!range;
  }

  /** One slice of the draw-everything render: items [a, b) of `items`; the others sit on layer 31, which the cameras skip for this render. */
  drawRange(target, items, a, b) {
    const { renderer: r, scene, camera, shadowCamera } = this, HIDE = 0x80000000, masks = items.map((o) => o.layers.mask), culled = [];
    for (let k = 0; k < items.length; k++) if (k < a || k >= b) items[k].layers.mask = HIDE;
    for (let k = a; k < b; k++) if (items[k].frustumCulled) { items[k].frustumCulled = false; culled.push(items[k]); }
    const camMask = camera.layers.mask, shadowMask = shadowCamera?.layers.mask, prev = r.getRenderTarget();
    camera.layers.mask = 0x7fffffff; if (shadowCamera) shadowCamera.layers.mask = 0x7fffffff;
    try {
      r.shadowMap.needsUpdate = !target;
      r.setRenderTarget(target);
      r.render(scene, camera);
    } finally {
      r.setRenderTarget(prev);
      camera.layers.mask = camMask; if (shadowCamera) shadowCamera.layers.mask = shadowMask;
      items.forEach((o, k) => { o.layers.mask = masks[k]; });
      for (const o of culled) o.frustumCulled = true;
    }
    this.onSlowFrame();
  }

  /** Draw everything once into `target` (null = the screen): every layer, no frustum culling, the shadow map too. */
  drawAll(target) {
    const t = performance.now(), culled = [], { renderer: r, scene, camera, shadowCamera } = this;
    scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    const camMask = camera.layers.mask, shadowMask = shadowCamera?.layers.mask;
    camera.layers.enableAll(); shadowCamera?.layers.enableAll();
    const prev = r.getRenderTarget();
    r.shadowMap.needsUpdate = !target;
    r.setRenderTarget(target);
    r.render(scene, camera);
    r.setRenderTarget(prev);
    camera.layers.mask = camMask; if (shadowCamera) shadowCamera.layers.mask = shadowMask;
    for (const o of culled) o.frustumCulled = true;
    r.shadowMap.needsUpdate = true; // the real view's shadows next
    this.onSlowFrame();
    this.log?.(`warm-up: first draw of everything${target ? ' (mirror)' : ''} ${Math.round(performance.now() - t)} ms`);
  }

  /** Every texture any material in the scene uses (hidden objects too), minus render targets' own. */
  collectTextures() {
    const found = new Set();
    const add = (v) => { if (v?.isTexture && !v.isRenderTargetTexture) found.add(v); };
    this.scene.traverse((o) => {
      for (const m of [o.material].flat()) {
        if (!m) continue;
        for (const v of Object.values(m)) add(v);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) [u?.value].flat().forEach(add);
      }
    });
    return [...found];
  }

  uploadTextures() {
    const t0 = performance.now(), list = this.collectTextures(), r = this.renderer;
    let i = 0;
    // (with a timeout: a device that never has an idle moment would otherwise never get there; Safari has no idle callback)
    const idle = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 500 }) : (f) => setTimeout(() => f({ timeRemaining: () => WARM.sliceMs }), 30);
    const slice = (deadline) => {
      const end = performance.now() + Math.min(WARM.sliceMs, deadline.timeRemaining());
      do { const tex = list[i++]; if (tex?.image && tex.image.complete !== false) r.initTexture(tex); } while (i < list.length && performance.now() < end);
      if (i < list.length) idle(slice);
      else { this.state = 'done'; this.log?.(`warm-up: ${list.length} textures checked in ${Math.round(performance.now() - t0)} ms, ${r.info.memory.textures} on the GPU`); }
    };
    idle(slice);
  }
}
