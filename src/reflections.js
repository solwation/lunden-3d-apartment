import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

// Mirror images (#50): every mirror gets a planar reflector over its glass, but only ONE is ever
// active — the nearest mirror the visitor is looking at, within MAX_DIST, on the visitor's level —
// and none while the frame rate is struggling (main.js passes `allowed`). An inactive reflector is
// hidden, so it costs nothing; the mirror's own glints material shows instead.
// All mirrors draw into ONE shared render target (#592): only one reflects at a time, and before that each mirror had
// its own 4× multisampled half-float target (~15 MB), allocated when it first reflected and (since #585) freed again
// when another took over — a new GPU texture + framebuffers every time the active mirror changed. The shared one is
// allocated once (and warmed by main.js's warm-up, `mirrorTarget()`), so turning between mirrors uploads nothing.

const MAX_DIST = 4;
const RES = 512;
const mirrors = [];
let shared = null;
/** The one render target every mirror reflects into. */
export function mirrorTarget() {
  shared ??= new THREE.WebGLRenderTarget(RES, RES, { samples: 4, type: THREE.HalfFloatType });
  return shared;
}
/** Every mirror's { r: reflector, level } (tests). */
export const reflectors = () => mirrors;

// three's Reflector (r170) with its render target swapped for the shared one: same camera maths and shader, the
// private target it creates is never rendered to (three allocates a target's GPU memory on first use only).
class SharedReflector extends Reflector {
  constructor(geometry, options) {
    super(geometry, { ...options, textureWidth: 1, textureHeight: 1 });
    const own = this.getRenderTarget(), target = mirrorTarget(), render = this.onBeforeRender;
    this.material.uniforms.tDiffuse.value = target.texture;
    this.getRenderTarget = () => target;
    this.onBeforeRender = function (renderer, ...rest) {
      const set = renderer.setRenderTarget;
      renderer.setRenderTarget = function (t, ...a) { return set.call(this, t === own ? target : t, ...a); };
      try { return render.call(this, renderer, ...rest); } finally { renderer.setRenderTarget = set; }
    };
    this.dispose = () => this.material.dispose();
  }
}

/** Put a reflector over a mirror. `geometry` lies in the parent's local frame facing +z. */
export function addReflector(parent, geometry, { level = 0, offset = 0.0015, color = 0xc6ccd0, name = '', dim = 1 } = {}) {
  const r = new SharedReflector(geometry, { color, clipBias: 0.003 });
  if (dim !== 1) { // a lit mirror's image (#339): scaled down after the overlay tint (the overlay cannot dim highlights)
    const m = r.material;
    m.uniforms.dim = { value: dim };
    m.fragmentShader = m.fragmentShader.replace('uniform vec3 color;', 'uniform vec3 color;\nuniform float dim;')
      .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );', 'gl_FragColor = vec4( blendOverlay( base.rgb, color ) * dim, 1.0 );');
  }
  r.position.z = offset;
  r.visible = false;
  parent.add(r);
  mirrors.push({ r, level, name });
  return r;
}

const shownParents = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
const p = new THREE.Vector3(), n = new THREE.Vector3(), toCam = new THREE.Vector3(), fwd = new THREE.Vector3();

/** Pick the one mirror to reflect this frame (or none). */
export function updateReflections(camera, level, allowed) {
  let best = null, bestScore = Infinity;
  if (allowed) {
    camera.getWorldDirection(fwd);
    for (const m of mirrors) {
      if (m.level !== level || !shownParents(m.r.parent)) continue; // e.g. the hall mirror hidden by F
      m.r.getWorldPosition(p);
      n.set(0, 0, 1).transformDirection(m.r.matrixWorld);
      toCam.subVectors(camera.position, p);
      const dist = toCam.length();
      if (dist > MAX_DIST || toCam.dot(n) <= 0) continue;           // too far, or behind the glass
      const facing = -fwd.dot(toCam.normalize());                    // 1 = looking straight at it
      if (facing < 0.35) continue;                                   // not in view
      const score = dist * (2 - facing);
      if (score < bestScore) { bestScore = score; best = m; }
    }
  }
  for (const m of mirrors) m.r.visible = m === best;
  return best !== null;
}
