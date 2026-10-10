import { WARM } from './config.js';

// Warm-up (#432, #592): everything the GPU will need is compiled and uploaded behind the start screen, so nothing is
// drawn for the first time while the visitor plays. The first time the inside of the flat was drawn (opening the front
// door after a fresh start) three compiled the shadow-depth programs and uploaded the geometry and textures of everything
// in it in one frame — a freeze of a couple of seconds; the first mirror in view compiled ~50 programs (#592).
// Stages, one per frame or idle slot, driven by `tick()` from the game loop:
//  1. `WARM.frames` frames in (after lampwash has patched the materials: the programs compiled are the final ones)
//     every material's program is compiled (compileAsync: in parallel where the GPU can);
//  2. ONE frame is drawn with every layer — the camera's and the sun's shadow camera's (DetailCuller's layer 7 too) —
//     and no frustum culling, shadows included, which uploads the rest; the next frame draws over it;
//  3. the mirror variants (#592): a mirror draws into a half-float render target, where three uses no tone mapping and
//     linear output, i.e. a second program per material. They are compiled with that target bound, then one frame is
//     drawn into it (every layer, no culling) — the shared mirror target is allocated once here;
//  4. idle time: every texture of every material, hidden ones too (seasonal things, closed cupboards' contents), is
//     uploaded (`renderer.initTexture`) a few at a time.
//     On phones (`lazyHidden`, #628) this stage is skipped: what is hidden at the start (seasonal things, closed cupboards'
//     contents) uploads when it first shows, a small hitch, instead of holding its textures in GPU memory all along.
// Headless test browsers skip it (minutes of SwiftShader, nobody looks), `&warm` forces it.
export class WarmUp {
  /** `mirrorTarget()` → the render target mirrors draw into (or null); `log(text)` for `&perf`. */
  constructor({ renderer, scene, camera, shadowCamera, mirrorTarget = () => null, skip = false, lazyHidden = false, log = null, onSlowFrame = () => {} }) {
    Object.assign(this, { renderer, scene, camera, shadowCamera, mirrorTarget, lazyHidden, log, onSlowFrame });
    this.state = skip ? 'skipped' : 'pending'; // → compiling → draw → mirror → compiling → mirror-draw → textures → uploading → done
    this.wait = WARM.frames;
    this.textures = null;
  }

  get done() { return this.state === 'done' || this.state === 'skipped'; }

  /** Call once per frame before the frame's own work; returns true when this frame did a heavy warm-up draw. */
  tick() {
    switch (this.state) {
      case 'pending':
        if (--this.wait <= 0) this.compile(null, 'draw');
        return false;
      case 'draw': this.drawAll(null); this.state = 'mirror'; return true;
      case 'mirror': {
        const t = this.mirrorTarget();
        if (!t) { this.state = 'textures'; return false; }
        this.compile(t, 'mirror-draw');
        return false;
      }
      case 'mirror-draw': this.drawAll(this.mirrorTarget()); this.state = 'textures'; return true;
      case 'textures':
        if (this.lazyHidden) { this.state = 'done'; this.log?.(`warm-up: hidden textures left for later, ${this.renderer.info.memory.textures} on the GPU`); return false; }
        this.state = 'uploading'; this.uploadTextures(); return false;
      default: return false;
    }
  }

  compile(target, next) {
    const t = performance.now(), r = this.renderer, prev = r.getRenderTarget();
    this.state = 'compiling';
    r.setRenderTarget(target); // the program variant depends on the bound target (tone mapping, output colour space)
    const p = r.compileAsync(this.scene, this.camera);
    r.setRenderTarget(prev);
    p.catch(() => {}).then(() => { this.state = next; this.log?.(`warm-up: programs${target ? ' (mirror)' : ''} ${Math.round(performance.now() - t)} ms, ${r.info.programs.length} in all`); });
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
