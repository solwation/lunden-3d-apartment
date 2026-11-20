// #2204: neutral roof condensation. Outlet positions come from the same builders as the drawn caps/hoods.
// One bounded point batch; no textures, light, shadow caster, render pass or particle allocations per frame.
import * as THREE from 'three';
import { ROOF_STEAM as S } from './config.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Visible condensation (0…1), diluted by strong wind; absent from +8 °C upward. */
export function steamDensity(temp = S.warm, speed = 0) {
  return (1 - smooth(S.cold, S.warm, temp)) / (1 + clamp(speed, 0, S.maxWind) * S.windThin);
}
/** Rising centreline: at the outlet it is vertical, then entrains the current downwind velocity. Writes `out`. */
export function plumeAt(age, wind = {}, out = {}) {
  const t = clamp(age, 0, S.life), bend = t - (1 - Math.exp(-S.bend * t)) / S.bend;
  out.x = clamp(wind.x, -S.maxWind, S.maxWind) * S.windShare * bend;
  out.y = t * S.rise;
  out.z = clamp(wind.z, -S.maxWind, S.maxWind) * S.windShare * bend;
  return out;
}
/** Nearest visible outlets, bounded before drawing. No extra particle budget for distant campus buildings. */
export function nearOutlets(sources, eye, max = S.maxSources) {
  return sources.map((p, index) => ({ p, index, d: Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) }))
    .filter(v => v.d < S.far).sort((a, b) => a.d - b.d || a.index - b.index).slice(0, max);
}

export class RoofSteam {
  constructor({ scene, camera, weather, day, phone = false }) {
    Object.assign(this, { camera, weather, day, phone, time: 0, age: S.every, count: 0, scale: 1, selected: [], sources: [] });
    scene.updateMatrixWorld(true);
    const seen = new Set();
    scene.traverse(o => { for (const p of o.userData.roofSteam ?? []) {
      const v = new THREE.Vector3(...p).applyMatrix4(o.matrixWorld); v.y += S.outletLift;
      const key = v.toArray().join(','); if (!seen.has(key)) { seen.add(key); this.sources.push(v); }
    } });
    this.perSource = phone ? S.phonePoints : S.points;
    this.maxSources = phone ? S.phoneSources : S.maxSources;
    const max = this.maxSources * this.perSource, geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.puff = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos); geo.setAttribute('puff', this.puff); geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uHeight: { value: 720 }, uLight: { value: 1 }, uColor: { value: new THREE.Color(...S.color) } }]),
      vertexShader: `attribute vec3 puff; uniform float uHeight; varying vec2 vPuff;
        #include <fog_pars_vertex>
        void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
          gl_PointSize=puff.x*projectionMatrix[1][1]*uHeight*.5/max(-mvPosition.z,.05);vPuff=puff.yz;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform vec3 uColor;uniform float uLight;varying vec2 vPuff;
        #include <common>
        #include <fog_pars_fragment>
        void main(){vec2 c=gl_PointCoord*2.0-1.0;float r=dot(c,c);if(r>1.0)discard;
          float lump=.8+.2*sin(c.x*4.7+vPuff.y)*sin(c.y*3.9-vPuff.y);
          gl_FragColor=vec4(uColor*uLight,vPuff.x*exp(-r*2.6)*(1.0-r)*lump);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }` });
    mat.name = 'roof-steam';
    this.object = new THREE.Points(geo, mat);
    Object.assign(this.object, { name: 'roof-steam', visible: false, frustumCulled: false, renderOrder: 3 });
    this.object.raycast = () => {}; this.object.userData.noDetail = true;
    const size = new THREE.Vector2();
    this.object.onBeforeRender = renderer => { mat.uniforms.uHeight.value = renderer.getRenderTarget()?.height ?? renderer.getDrawingBufferSize(size).y; };
    scene.add(this.object); this.offset = {};
  }
  setLevel(level) { this.scale = level < S.minLevel ? 0 : level === S.minLevel ? S.lowLevelShare : 1; this.age = S.every; }
  update(dt) {
    this.time += clamp(dt, 0, .1); this.age += clamp(dt, 0, .1);
    const wind = this.weather.wind ?? {}, density = steamDensity(this.weather.temp ?? S.warm, Math.hypot(wind.x || 0, wind.z || 0));
    if (!this.scale || density < .002) { this.object.visible = false; this.count = 0; return; }
    if (this.age >= S.every) { this.age = 0; this.selected = nearOutlets(this.sources, this.camera.position, Math.ceil(this.maxSources * this.scale)); }
    let n = 0; const P = this.pos.array, D = this.puff.array;
    for (const { p, index } of this.selected) {
      const dist = Math.hypot(p.x - this.camera.position.x, p.y - this.camera.position.y, p.z - this.camera.position.z);
      const fade = 1 - smooth(S.fadeFrom, S.far, dist); if (!fade) continue;
      for (let i = 0; i < this.perSource; i++, n++) {
        const seed = index * 1.79 + i * 2.4, age = (this.time + (i / this.perSource) * S.life + index * .37) % S.life, t = age / S.life;
        const q = plumeAt(age, wind, this.offset), swirl = S.swirl * Math.sqrt(age);
        P[n * 3] = p.x + q.x + Math.sin(seed + age) * swirl;
        P[n * 3 + 1] = p.y + q.y;
        P[n * 3 + 2] = p.z + q.z + Math.cos(seed + age * .8) * swirl;
        D[n * 3] = S.size[0] + (S.size[1] - S.size[0]) * Math.sqrt(t);
        D[n * 3 + 1] = S.alpha * density * fade * smooth(0, S.fadeIn, t) * Math.pow(1 - t, 1.2);
        D[n * 3 + 2] = seed;
      }
    }
    this.count = n; this.object.visible = n > 0; this.object.geometry.setDrawRange(0, n);
    if (!n) return;
    this.object.material.uniforms.uLight.value = S.minLight + (1 - S.minLight) * clamp(this.day.daylight, 0, 1);
    for (const a of [this.pos, this.puff]) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, n * 3); }
  }
  dispose() { this.object.removeFromParent(); this.object.geometry.dispose(); this.object.material.dispose(); }
}
