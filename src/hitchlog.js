// Hitch log (#592): what happened in a frame that took too long. Under `&perf` (or when a test calls `enable()`) the
// WebGL context's program / texture / buffer / render-target calls are counted and every frame is timed by phase
// (main.js: adapt, step, shadows, reflections, render — and inside render the shadow-map pass and the mirror pass).
// A frame over PERF.hitch.ms is logged to the console with what changed in it: new programs (shader compiles), new
// textures and texture uploads (first-time GPU uploads of canvases / images), new geometry buffers, render targets,
// whether the shadow map was redrawn, which mirror reflected, where the camera looked. `tools/turntest.html` reads the
// same counters. Off by default: the only cost then is one `if` per frame.
import { PERF } from './config.js';

const COUNTED = {
  programs: ['createProgram'],
  textures: ['createTexture'],
  texUploads: ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'copyTexSubImage2D'],
  texAllocs: ['texStorage2D', 'texStorage3D'],
  buffers: ['createBuffer'],
  bufferUploads: ['bufferData'],
  bufferUpdates: ['bufferSubData'],
  renderTargets: ['createFramebuffer'],
  renderbuffers: ['renderbufferStorage', 'renderbufferStorageMultisample'],
};

/** Pixels moved by one tex(Sub)Image2D call (either the size-in-arguments or the source-object form). */
function uploadPixels(name, a) {
  const src = a[a.length - 1];
  if (src && typeof src === 'object' && 'width' in src && !ArrayBuffer.isView(src)) return (src.width || 0) * (src.height || 0);
  if (name === 'texSubImage2D') return (a[4] | 0) * (a[5] | 0);
  if (name === 'texImage2D' && a.length >= 8) return (a[3] | 0) * (a[4] | 0);
  return 0;
}

export class HitchLog {
  constructor(renderer, { enabled = false } = {}) {
    this.renderer = renderer;
    this.counts = Object.fromEntries(Object.keys(COUNTED).map((k) => [k, 0]));
    this.counts.texPixels = 0;
    this.phases = {};          // ms per phase this frame
    this.frameInfo = {};       // flags set during the frame (shadow redraw, mirror …)
    this.log = [];             // the last `PERF.hitch.keep` hitches
    this.frames = 0;
    this.enabled = false;
    this.installed = false;
    if (enabled) this.enable();
  }

  /** Start counting (idempotent): wraps the GL calls and the renderer's shadow-map pass. */
  enable() {
    this.enabled = true;
    if (this.installed) return this;
    this.installed = true;
    const gl = this.renderer.getContext(), c = this.counts;
    for (const [key, names] of Object.entries(COUNTED)) {
      for (const name of names) {
        const orig = gl[name];
        if (typeof orig !== 'function') continue;
        const pixels = key === 'texUploads';
        gl[name] = function (...a) { c[key]++; if (pixels) c.texPixels += uploadPixels(name, a); return orig.apply(gl, a); };
      }
    }
    const sm = this.renderer.shadowMap, render = sm.render, self = this;
    sm.render = function (...a) {
      if (!self.enabled || !sm.needsUpdate) return render.apply(sm, a);
      const t = performance.now();
      const r = render.apply(sm, a);
      self.phases.shadowMap = (self.phases.shadowMap ?? 0) + performance.now() - t;
      return r;
    };
    return this;
  }

  /** Time a method of `obj` as phase `phase` (e.g. a Reflector's onBeforeRender = the mirror pass). */
  timeMethod(obj, method, phase) {
    const orig = obj[method], self = this;
    obj[method] = function (...a) {
      if (!self.enabled) return orig.apply(this, a);
      const t = performance.now();
      const r = orig.apply(this, a);
      self.phases[phase] = (self.phases[phase] ?? 0) + performance.now() - t;
      return r;
    };
  }

  snapshot() {
    const i = this.renderer.info;
    return { ...this.counts, progs: i.programs?.length ?? 0, tex: i.memory.textures, geoms: i.memory.geometries };
  }

  begin() {
    if (!this.enabled) return;
    this.t0 = performance.now();
    this.before = this.snapshot();
    this.heap0 = performance.memory?.usedJSHeapSize ?? 0;
    this.phases = {};
    this.frameInfo = {};
    this.mark = this.t0;
  }

  /** End of a phase that started at the previous `phase()` (or `begin()`). */
  phase(name) {
    if (!this.enabled) return;
    const t = performance.now();
    this.phases[name] = (this.phases[name] ?? 0) + t - this.mark;
    this.mark = t;
  }

  /** Finish the frame; returns its record (and logs it when it was a hitch). */
  end(extra = {}) {
    if (!this.enabled) return null;
    const ms = performance.now() - this.t0, after = this.snapshot(), b = this.before;
    const d = {};
    for (const k of Object.keys(after)) if (after[k] !== b[k]) d[k] = after[k] - b[k];
    const heap = performance.memory?.usedJSHeapSize ?? 0;
    const rec = { frame: this.frames++, ms: +ms.toFixed(1), phases: Object.fromEntries(Object.entries(this.phases).map(([k, v]) => [k, +v.toFixed(1)])),
      delta: d, ...this.frameInfo, ...extra, gc: this.heap0 && heap < this.heap0 - 1e6 ? +((this.heap0 - heap) / 1e6).toFixed(1) : 0 };
    this.last = rec;
    if (ms >= (PERF.hitch?.ms ?? 50)) {
      this.log.push(rec);
      if (this.log.length > (PERF.hitch?.keep ?? 100)) this.log.shift();
      if (!this.quiet) console.log('hitch', JSON.stringify(rec));
    }
    return rec;
  }
}
