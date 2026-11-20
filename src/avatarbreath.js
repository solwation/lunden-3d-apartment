// #2037: breath that shows in the cold, and a flushed, slightly sweaty face after hard work. Both derived locally per avatar from what is
// already known (no network field):
//  - exertion: the same run / gym signal the face's grimace uses (#2031: the gait's `run` share, a gym pose) builds a slow `heat`
//    (0 … 1) that cools again over a minute or so; above a threshold the face flushes and the skin gets a light sweat sheen
//    (one vec2 uniform on the avatar's own material, `exertShader` splices the colour / roughness change in: no texture, no draw call);
//  - breath: a breathing rhythm (faster with effort and heat); in cold weather outdoors (wetEnv: temperature, snow, outdoorAt) every exhale
//    leaves a faint vapour puff in front of the mouth, denser while running. All avatars' puffs live in ONE shared point cloud
//    (`BreathPuffs`, one draw call while any puff is alive, none otherwise), soft procedural discs without a texture.
// Pure helpers first (headless-testable: tools/avatarbreathtest.mjs), then the GLSL hook and the shared puff pool. Numbers: AVATAR_BREATH.
import * as THREE from 'three';
import { AVATAR_BREATH as B, AVATAR_SLEEP as S } from './config.js';
import { wetEnv } from './avatarweather.js';
import { sceneLevel } from './avatarlight.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** A fresh state: rested, at a random point of the breath (so a crowd does not breathe in step). */
export const newBreath = (phase = Math.random()) => ({ heat: 0, flush: 0, sheen: 0, phase, puffs: 0, pant: 0, drive: 0 });

/** The effort now (0 … 1) from the face's cues (#2031: `run` = the gait's run share, `gym` > 0 in a gym pose). Walking is no effort. */
export const effortOf = (cues = {}) => Math.max(clamp01(cues.run), cues.gym ? B.gym : 0);

/** How cold it is for visible breath (0 … 1): from `temp` °C (full at B.cold, none from B.warm up), at least B.snowMin while it snows. */
export const coldness = (temp = 10, kind = null) => Math.max(1 - smooth(B.cold, B.warm, temp), kind === 'snow' ? B.snowMin : 0);

/** Breaths per second for `effort` now and the accumulated `heat`. */
export const breathRate = (effort, heat) => B.rate[0] + (B.rate[1] - B.rate[0]) * Math.max(clamp01(effort), clamp01(heat) * B.heatBreath);

/** Advances `s` by `dt` s with the current `effort` (0 … 1): heat builds over B.build s of full effort and cools over B.cool s without it;
 * flush and sheen follow the heat above their thresholds. #2108: `pant` follows the effort (rising over B.pant[0] s, calming over B.pant[1] s),
 * so the breath stays fast for a few seconds after a dash; `drive` (0 … 1) = how hard the figure breathes now (rate and depth, avatarchest.js).
 * Returns the number of exhales that started in this step (0 or 1). */
export function stepBreath(s, dt, effort = 0) {
  dt = Math.min(Math.max(Number(dt) || 0, 0), B.maxDt);
  if (!(dt > 0)) return 0;
  const e = clamp01(effort);
  s.heat = clamp01(e > 0 ? s.heat + e * dt / B.build : s.heat - dt / B.cool);
  s.flush = smooth(B.flushAt[0], B.flushAt[1], s.heat);
  s.sheen = smooth(B.sheenAt[0], B.sheenAt[1], s.heat);
  s.pant = clamp01(s.pant + (e - s.pant) * (1 - Math.exp(-dt / B.pant[e > s.pant ? 0 : 1])));
  const k = Math.max(e, s.pant);
  s.drive = Math.max(k, s.heat * B.heatBreath);
  const before = s.phase;
  s.phase = (s.phase + breathRate(k, s.heat) * (1 - (1 - S.breath) * clamp01(s.sleep)) * dt) % 1; // #2163: slower while asleep
  const crossed = before < B.exhale ? s.phase >= B.exhale || s.phase < before : s.phase >= B.exhale && s.phase < before;
  return crossed ? 1 : 0;
}

/** The exertion uniform (added to the avatar material's uniforms): x = flush, y = sweat sheen (0 … 1). */
export const exertUniforms = () => ({ uExert: { value: new THREE.Vector2() } });

const f = (v) => (+v).toFixed(5);
const v3 = (a) => `vec3(${a.map(f).join(',')})`;
/** Splices the flush / sheen into the avatar fragment shader `fs` (after avatar.js's own chain): the uniform after <common>, the change just
 * before <normal_fragment_begin> (colour, roughness and #2018's `wetSnow` are known there; lighting has not read them yet). `head` = the head
 * bone's bind position (the masks are in its frame, bind metres). Bare skin only, nothing under the Spider-Man suit. */
export function exertShader(fs, { head }) {
  const [cx, cy, cz, cr] = B.cheek, [fy0, fy1, fz] = B.forehead, [nx, ny, nz, nr] = B.nose;
  const body = `
    if (uExert.x + uExert.y > 0.001 && vBare > 0.5 && uSuit < 0.5) { // #2037: flushed and sweaty after hard work (src/avatarbreath.js)
      float exRole = floor(vSuitRole + 0.5), exFlush = ${f(B.flushBody)}, exSheen = ${f(B.sheenBody)};
      if (exRole == 2.0) {
        vec3 q = vSuitAt - ${v3([head.x, head.y, head.z])};
        vec2 c = vec2(abs(q.x) - ${f(cx)}, q.y - ${f(cy)});
        float front = smoothstep(${f(cz - 0.03)}, ${f(cz)}, q.z);
        exFlush = mix(${f(B.flushFace)}, 1.0, exp(-dot(c, c) / ${f(cr * cr)}) * front);
        vec3 n = q - vec3(${f(nx)}, ${f(ny)}, ${f(nz)});
        exSheen = max(${f(B.sheenFace)}, max(smoothstep(${f(fy0)}, ${f(fy1)}, q.y) * smoothstep(${f(fz - 0.03)}, ${f(fz)}, q.z), exp(-dot(n, n) / ${f(nr * nr)})));
      }
      diffuseColor.rgb *= mix(vec3(1.0), ${v3(B.flushColor)}, uExert.x * exFlush * (1.0 - wetSnow));
      roughnessFactor = mix(roughnessFactor, ${f(B.sheenRough)}, uExert.y * exSheen);
    }
    #include <normal_fragment_begin>`;
  return fs.replace('#include <common>', '#include <common>\nuniform vec2 uExert;').replace('#include <normal_fragment_begin>', body);
}

const _m = new THREE.Vector3(), _d = new THREE.Vector3(), MOUTH = new THREE.Vector3(...B.mouth);
/** The scene's shared puff pool, or null before Ghosts made it (#2188: the paddock's ponies breathe into the same one). */
export const sharedPuffs = () => shared;
let shared = null; // the scene's puff pool (Ghosts makes it); without one, breath still runs but nothing shows

/** Once per frame for a posed avatar (Ghost.animate, after its update): steps its exertion and breath from the face `cues` ({ run, gym })
 * and sets the uniform; `figure` (the Ghost; null for our own mirror image) is asked `wetEnv.outdoorAt(figure)` only when it is cold
 * enough, and then every exhale puts a puff in front of the mouth (from last frame's head matrix). */
export function updateBreath(avatar, dt, cues, figure, puffs = shared) {
  const u = avatar?.material?.userData.u;
  if (!u?.uExert) return;
  const s = avatar.breath ??= newBreath(), e = effortOf(cues);
  s.sleep = cues.sleep || 0; // #2163
  const exhale = stepBreath(s, dt, e);
  u.uExert.value.set(s.flush, s.sheen);
  if (!exhale || !puffs || !figure) return;
  const cold = coldness(wetEnv.temp, wetEnv.kind), head = avatar.bones?.head;
  if (cold <= 0.01 || !head || avatar.mask?.visible || !wetEnv.outdoorAt(figure)) return;
  _m.copy(MOUTH).applyMatrix4(head.matrixWorld);
  _d.setFromMatrixColumn(head.matrixWorld, 2).normalize();
  const k = s.drive;
  puffs.emit(_m, _d, cold * (B.density[0] + (B.density[1] - B.density[0]) * k), k, u.uLight?.value ?? 1);
  s.puffs++;
}

/** The shared puff pool: one THREE.Points (one draw call, hidden while empty). `light` = Ghosts' AvatarLight (its `lights` give the scene's
 * level, so a night puff is not a glowing ball); each puff also keeps its avatar's local light factor (#2017). */
export class BreathPuffs {
  constructor(parent, light = null, max = B.max) {
    this.light = light; this.max = max; this.n = 0; this.list = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.data = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage); // size m, alpha, brightness, seed
    geo.setAttribute('position', this.pos); geo.setAttribute('puff', this.data); geo.setDrawRange(0, 0);
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uViewH: { value: 600 }, uColor: { value: new THREE.Color(...B.color) } }]);
    const mat = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, fog: true,
      vertexShader: `attribute vec4 puff; uniform float uViewH; varying vec3 vPuff;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = puff.x * projectionMatrix[1][1] * uViewH * 0.5 / max(-mvPosition.z, 0.05);
          vPuff = puff.yzw;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 uColor; varying vec3 vPuff;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float lump = 0.8 + 0.2 * sin(c.x * 4.7 + vPuff.z * 6.28) * sin(c.y * 3.9 - vPuff.z * 4.1);
          gl_FragColor = vec4(uColor * vPuff.y, vPuff.x * exp(-r2 * 2.6) * (1.0 - r2) * lump);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }` });
    mat.name = 'avatar-breath';
    const pts = this.points = new THREE.Points(geo, mat);
    Object.assign(pts, { name: 'avatar-breath', visible: false, frustumCulled: false, renderOrder: 3 });
    pts.castShadow = pts.receiveShadow = false; pts.raycast = () => {};
    pts.userData.noDetail = true; pts.userData.warmDraw = true; // (the warm-up compiles its program: no hitch at the first winter puff)
    const size = new THREE.Vector2();
    pts.onBeforeRender = (renderer) => { const rt = renderer.getRenderTarget(); mat.uniforms.uViewH.value = rt ? rt.height : renderer.getDrawingBufferSize(size).y; };
    parent?.add(pts);
  }

  /** Make this the pool `updateBreath` emits into. */
  share() { shared = this; return this; }

  /** A puff at `at` (world) leaving along `dir` (unit), `alpha` its peak opacity, `effort` 0 … 1 (a runner's puffs are bigger and faster),
   * `light` the avatar's local light factor. The oldest puff makes room when the pool is full. */
  emit(at, dir, alpha, effort = 0, light = 1, scale = 1) { // `scale`: a bigger muzzle's puff (#2188, the ponies)
    if (!(alpha > 0.002)) return;
    if (this.list.length >= this.max) this.list.shift();
    const v = B.speed[0] + (B.speed[1] - B.speed[0]) * effort;
    this.list.push({ x: at.x, y: at.y, z: at.z, vx: dir.x * v, vy: dir.y * v + B.rise, vz: dir.z * v, age: 0, life: B.life[0] + (B.life[1] - B.life[0]) * effort,
      size: (B.size[0] + (B.size[1] - B.size[0]) * effort) * scale, alpha, light, seed: Math.random() });
  }

  /** Each frame: ages, drifts and fades every puff and uploads the live ones (none left: hidden, no draw call). */
  update(dt) {
    dt = Math.min(Math.max(Number(dt) || 0, 0), 0.1);
    const L = this.list, drag = Math.exp(-B.drag * dt);
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag + B.buoyancy * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      L[w++] = p;
    }
    L.length = w;
    this.n = Math.min(w, this.max);
    this.points.visible = this.n > 0;
    if (!this.n) return;
    const scene = Math.min(1, sceneLevel(this.light?.lights) * B.lightGain), P = this.pos.array, D = this.data.array;
    for (let i = 0; i < this.n; i++) {
      const p = L[i], t = p.age / p.life;
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      D[i * 4] = p.size * (B.grow[0] + (B.grow[1] - B.grow[0]) * Math.sqrt(t));
      D[i * 4 + 1] = p.alpha * smooth(0, B.fadeIn, t) * Math.pow(1 - t, 1.2);
      D[i * 4 + 2] = Math.max(B.minLevel, Math.min(1.2, scene * p.light));
      D[i * 4 + 3] = p.seed;
    }
    this.pos.needsUpdate = this.data.needsUpdate = true;
    this.pos.clearUpdateRanges(); this.data.clearUpdateRanges();
    this.pos.addUpdateRange(0, this.n * 3); this.data.addUpdateRange(0, this.n * 4);
    this.points.geometry.setDrawRange(0, this.n);
  }

  dispose() { this.points.removeFromParent(); this.points.geometry.dispose(); this.points.material.dispose(); if (shared === this) shared = null; }
}
