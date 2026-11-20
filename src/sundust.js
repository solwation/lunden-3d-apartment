import * as THREE from 'three';
import { SUN_DUST as C } from './config.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number(x) || 0));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Direct low sun only: no noon haze, moonlight, or cloud-lit dust. `sunY` is the unit direction to the sun. */
export function lowSunDust(sunY, intensity) {
  return smooth(C.height[0], C.height[1], sunY) * (1 - smooth(C.height[2], C.height[3], sunY)) * clamp(intensity / C.fullSun);
}

/** Actual settled dust in the window's room/level drives airborne dust; crumbs/smears/other rooms do not. */
export function roomDust(spots = [], level, room) {
  if (room == null) return 0; // no home dust leaks into a visited flat or an unmapped source
  let amount = 0;
  for (const s of spots) if (s.kind === 'dust' && s.level === level && s.room === room) amount += clamp(s.amt);
  return amount;
}
export function dustCount(amount, scale = 1) { return Math.floor((C.max - C.beams) * clamp(amount / C.fullDust) * clamp(scale)); }

/** Intersect p → sun with the real glass rectangle, then reject a blocked prism. `sun` points TOWARDS the sun;
 * the volume from the window into the room therefore runs along -sun. Optional walls are world x/z segments.
 * Storeys clip the volume, and blinds/curtains mask direct rays (diffuse light through cloth is no sharp prism). */
export function inSunPrism(p, src, sun, walls = [], blinds = [], curtains = []) {
  if (!sun || sun.y <= 0 || src.well || p.y < src.y0 || p.y > src.y1) return false;
  const facing = -(sun.x * src.nx + sun.z * src.nz);
  if (facing <= C.minFacing) return false;
  const inward = (p.x - src.x) * src.nx + (p.z - src.z) * src.nz;
  const t = inward / facing;
  if (t < C.inset || t > C.reach) return false;
  const x = p.x + sun.x * t, y = p.y + sun.y * t, z = p.z + sun.z * t;
  if (Math.abs((x - src.x) * -src.nz + (z - src.z) * src.nx) > src.hw || Math.abs(y - src.y) > src.hh) return false;
  for (const b of blinds) if (b.level === src.level && (b.out === undefined || b.out === -src.nz) && x >= b.x0 && x <= b.x1
    && y <= src.y - src.hh + 2 * src.hh * b.cover) return false;
  for (const c of curtains) {
    if (c.level !== src.level || c.spec.facade !== src.facade) continue;
    const [a, b] = c.spec.glass, edge = (b - a) * c.cover / 2;
    if ((x >= a && x <= a + edge) || (x >= b - edge && x <= b)) return false;
  }
  // Start just inside the glass to skip its own façade. A closed room door is a segment like any wall.
  const reveal = Math.max(0, ((src.ox ?? src.x) - src.x) * src.nx + ((src.oz ?? src.z) - src.z) * src.nz);
  const start = reveal / facing + C.inset;
  if (t <= start) return false; // the glass-to-inner-face reveal is not room air
  const ax = x - sun.x * start, az = z - sun.z * start, dx = p.x - ax, dz = p.z - az;
  for (const [bx, bz, ex, ez] of walls) {
    const wx = ex - bx, wz = ez - bz, det = dx * wz - dz * wx;
    if (Math.abs(det) < 1e-9) continue;
    const u = ((bx - ax) * wz - (bz - az) * wx) / det;
    const v = ((bx - ax) * dz - (bz - az) * dx) / det;
    if (u > 0.001 && u < 0.999 && v >= 0 && v <= 1) return false;
  }
  return true;
}

const vertex = /* glsl */`
attribute vec4 dustData; // half-size m, beam half-length (0 = mote), opacity, phase
uniform float uClock, uViewH;
uniform vec3 uSun;
varying vec2 vDustUv;
varying float vDustAlpha, vBeam;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float pixelsPerM = projectionMatrix[1][1] * uViewH * 0.5 / max(-mvPosition.z, 0.05);
  vBeam = step(0.001, dustData.y);
  vec2 offset;
  if (vBeam > 0.5) {
    vec3 along = mat3(viewMatrix) * -uSun;
    vec2 axis = along.xy / max(length(along.xy), 0.001);
    offset = (vec2(axis.y, -axis.x) * position.x * dustData.x + axis * position.y * dustData.y) * 2.0;
  } else {
    float px = clamp(dustData.x * pixelsPerM, ${C.pixels[0].toFixed(2)}, ${C.pixels[1].toFixed(2)});
    offset = position.xy * 2.0 * px / pixelsPerM;
  }
  mvPosition.xy += offset;
  gl_Position = projectionMatrix * mvPosition;
  vDustUv = uv * 2.0 - 1.0;
  vDustAlpha = dustData.z * (0.7 + 0.3 * pow(0.5 + 0.5 * sin(uClock * 0.9 + dustData.w * 6.283), 6.0));
  #include <fog_vertex>
}`;
const fragment = /* glsl */`
uniform vec3 uColor;
varying vec2 vDustUv;
varying float vDustAlpha, vBeam;
#include <common>
#include <fog_pars_fragment>
void main() {
  float r2 = dot(vDustUv, vDustUv);
  float soft = vBeam > 0.5 ? exp(-vDustUv.x * vDustUv.x * 7.0) * pow(max(0.0, 1.0 - vDustUv.y * vDustUv.y), 2.0)
    : pow(max(0.0, 1.0 - r2), 2.0);
  if (soft < 0.002) discard;
  gl_FragColor = vec4(uColor, vDustAlpha * soft);
  #include <colorspace_fragment>
  #include <fog_fragment>
  #ifdef USE_FOG
    gl_FragColor.a *= 1.0 - fogFactor;
  #endif
}`;

/** One bounded transparent batch. CPU reseats its deterministic slow-drifting samples at C.step Hz; the shader
 * only twinkles them between updates. No render target, shadow sampler, scene light, texture, or full-screen pass. */
export class SunDust {
  constructor({ scene, windows, roomAt = () => null, lowMemory = false }) {
    Object.assign(this, { windows, roomAt, level: 3, scale: 1, enabled: true, clock: 0, due: 0, mesh: null, samples: [] });
    if (lowMemory) return;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(C.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('dustData', this.data);
    const mat = new THREE.ShaderMaterial({ uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uClock: { value: 0 }, uViewH: { value: 640 }, uSun: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(C.color) } },
      vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: true, toneMapped: false });
    const mesh = this.mesh = new THREE.InstancedMesh(geo, mat, C.max);
    mesh.name = 'sunlit-dust'; mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3;
    mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {}; mesh.userData.noDetail = true; mesh.userData.warmDraw = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrix = new THREE.Matrix4(); this.point = new THREE.Vector3();
    const size = new THREE.Vector2();
    mesh.onBeforeRender = r => { const t = r.getRenderTarget(); mat.uniforms.uViewH.value = t ? t.height : r.getDrawingBufferSize(size).y; };
    let seed = 2206;
    const random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
    for (let i = 0; i < C.max; i++) this.samples.push([random(), random(), random(), random()]);
    scene.add(mesh);
  }

  setLevel(level, scale) { this.level = level; this.scale = scale; this.due = 0; if (!level && this.mesh) this.mesh.visible = false; }

  update(dt, { sun, intensity, eye, spots = [], blinds = [], curtains = [], inside = true } = {}) {
    const m = this.mesh;
    if (!m) return;
    this.clock += Math.max(0, dt); m.material.uniforms.uClock.value = this.clock;
    const strength = lowSunDust(sun?.y ?? -1, intensity);
    const region = this.windows.region;
    if (!this.enabled || !this.level || !inside || !region || strength < 0.01) { m.visible = false; m.count = 0; return; }
    this.due -= dt;
    if (this.due > 0) return;
    this.due = C.step;
    const sources = this.windows.shown.filter(s => !s.well && eye.y >= s.y0 && eye.y <= s.y1 && -(sun.x * s.nx + sun.z * s.nz) > C.minFacing);
    let n = 0, beams = 0;
    for (const s of sources) {
      const room = this.roomAt(s.level, s.ox, s.oz), amount = roomDust(spots, s.level, room), count = dustCount(amount, this.scale);
      if (!count) continue;
      const walls = region.segs(s.level), b = region.box;
      const put = (p, radius, halfLength, opacity, phase) => {
        if (n >= C.max || p.x < b.x0 || p.x > b.x1 || p.z < b.z0 || p.z > b.z1 || !inSunPrism(p, s, sun, walls, blinds, curtains)) return false;
        m.setMatrixAt(n, this.matrix.makeTranslation(p.x, p.y, p.z)); this.data.setXYZW(n++, radius, halfLength, opacity, phase); return true;
      };
      // Window-local samples move slowly within its rectangular prism, never across an interior wall/door.
      for (let i = 0; i < count && n < C.max - C.beams; i++) {
        const [u, v, d, phase] = this.samples[i];
        const tx = Math.sin(this.clock * C.drift + phase * 6.28) * 0.05, ty = Math.sin(this.clock * C.drift * 0.7 + u * 6.28) * 0.05;
        const depth = C.inset * 2 + d * (C.reach - C.inset * 2);
        this.point.set(s.x - s.nz * ((u - 0.5) * 2 * s.hw + tx) - sun.x * depth,
          s.y + (v - 0.5) * 2 * s.hh + ty - sun.y * depth, s.z + s.nx * ((u - 0.5) * 2 * s.hw + tx) - sun.z * depth);
        put(this.point, C.radius * (0.7 + phase * 0.6), 0, C.alpha * strength * (s.pass ?? 1), phase);
      }
      // At most two narrow, faint streaks; both ends must be inside the same unblocked prism.
      if (beams < C.beams && n < C.max) {
        const facing = -(sun.x * s.nx + sun.z * s.nz);
        const reveal = Math.max(0, (s.ox - s.x) * s.nx + (s.oz - s.z) * s.nz);
        const start = reveal / facing + C.inset * 2;
        const length = Math.min(C.beamLength, (s.y - s.y0) / Math.max(sun.y, 0.001) - C.inset * 2);
        if (length - start > 0.3) {
          const end = { x: s.x - sun.x * length, y: s.y - sun.y * length, z: s.z - sun.z * length };
          if (inSunPrism(end, s, sun, walls, blinds, curtains)) {
            const depth = (length + start) / 2;
            this.point.set(s.x - sun.x * depth, s.y - sun.y * depth, s.z - sun.z * depth);
            if (put(this.point, C.beamWidth, (length - start) / 2, C.beamAlpha * strength * clamp(amount / C.fullDust) * (s.pass ?? 1), 0)) beams++;
          }
        }
      }
    }
    m.count = n; m.visible = n > 0;
    m.instanceMatrix.needsUpdate = this.data.needsUpdate = true;
    m.material.uniforms.uSun.value.copy(sun);
    this.beams = beams;
  }
}
