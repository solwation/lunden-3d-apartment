import * as THREE from 'three';
import { BIRDS, SKYLAYER } from './config.js';

// A few gulls circling over the area (#1252, BIRDS in config.js). ONE instanced draw call: a 3-triangle bird (tail wedge + two wings)
// per instance; the circling, banking and wing flap are all computed in the vertex shader from a few per-instance numbers, so the
// CPU does nothing per frame but set a handful of uniforms (no allocations). No lights, no textures, no sound. Deterministic: the
// instance numbers come from a fixed seed and the motion from the accumulated game time. Nothing is drawn (the mesh is hidden) at night, in
// rain / snow, in the cloud whiteout, underground or far from the area.

const vert = /* glsl */`
  attribute vec3 aLocal;   // x across (− left), y 0, z along (+ nose)
  attribute float aTip;
  attribute vec4 aSeed;    // phase (rad), radius (m), altitude (m), signed angular speed (rad/s)
  attribute vec2 aSeed2;   // flap phase, high flag (1 = above the cloud deck)
  uniform float uTime, uSpan, uFlap, uBank, uFade, uHigh;
  uniform vec3 uCenter;
  varying float vTip;
  void main() {
    float a = aSeed.x + uTime * aSeed.w;
    float r = aSeed.y;
    vec3 pos = uCenter + vec3(cos(a) * r, aSeed.z + sin(uTime * 0.31 + aSeed.x * 3.0) * 2.5, sin(a) * r);
    vec3 fwd = normalize(vec3(-sin(a) * sign(aSeed.w), 0.0, cos(a) * sign(aSeed.w)));
    vec3 right = vec3(-fwd.z, 0.0, fwd.x);
    float s = uSpan * mix(1.0, 1.8, aSeed2.y) * uFade * mix(1.0, uHigh, aSeed2.y); // (the high ones are larger: they are far away)
    float flap = sin(uTime * uFlap * 6.2831853 + aSeed2.x) * 0.55 * aTip;
    float bank = -sign(aSeed.w) * uBank * aLocal.x; // the inner wing dips in the turn
    vec3 local = vec3(aLocal.x, flap * abs(aLocal.x) + bank, aLocal.z);
    vec3 world = pos + (right * local.x + vec3(0.0, local.y, 0.0) + fwd * local.z) * s;
    vTip = aTip;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;
const frag = /* glsl */`
  uniform vec3 uCol;
  varying float vTip;
  void main() { gl_FragColor = vec4(uCol * mix(1.0, 0.35, vTip * vTip), 1.0); }`;

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

/** The bird geometry (unit wingspan 1, nose +z): tail wedge, left wing, right wing. */
function birdGeometry(count, seeds) {
  const loc = [
    0, 0, 0.3, -0.06, 0, -0.26, 0.06, 0, -0.26, // body
    -0.03, 0, 0.12, -0.03, 0, -0.1, -0.5, 0, -0.2, // left wing (tip back)
    0.03, 0, -0.1, 0.03, 0, 0.12, 0.5, 0, -0.2, // right wing
  ];
  const tip = [0, 0, 0, 0, 0, 1, 0, 0, 1];
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('aLocal', new THREE.Float32BufferAttribute(loc, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setAttribute('position', new THREE.Float32BufferAttribute(loc, 3)); // (three wants `position` for the bounds; the shader uses aLocal)
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds.a, 4));
  g.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(seeds.b, 2));
  g.instanceCount = count;
  return g;
}

export class Birds {
  /** `center`: {x, z} of the area they circle over; `lowMemory`: fewer on phones. `day`: the DayCycle. */
  constructor({ scene, camera, day, center, lowMemory = false, count = null }) {
    const B = BIRDS, n = count ?? (lowMemory ? B.lowMemoryCount : B.count), high = Math.min(B.high, Math.round(n * B.high / B.count));
    Object.assign(this, { camera, day, count: n, time: 0, fade: 0, rain: 0 });
    let s = 1252; // fixed seed: the same flock every visit (mulberry32)
    const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const lerp = ([a, b], k) => a + (b - a) * k;
    const seeds = { a: new Float32Array(n * 4), b: new Float32Array(n * 2) };
    for (let i = 0; i < n; i++) {
      const isHigh = i >= n - high, speed = lerp(B.speed, rnd()), r = isHigh ? lerp(B.radius, 0.5 + 0.5 * rnd()) * 1.3 : lerp(B.radius, rnd());
      seeds.a.set([(i / n) * Math.PI * 2 + rnd() * 0.8, r, isHigh ? lerp(B.highAlt, rnd()) : lerp(B.alt, rnd()), (rnd() < 0.5 ? -1 : 1) * speed / r], i * 4);
      seeds.b.set([rnd() * 6.283, isHigh ? 1 : 0], i * 2);
    }
    this.uniforms = {
      uTime: { value: 0 }, uSpan: { value: B.span }, uFlap: { value: B.flap }, uBank: { value: B.bank }, uFade: { value: 0 }, uHigh: { value: 1 },
      uCenter: { value: new THREE.Vector3(center.x, 0, center.z) }, uCol: { value: new THREE.Color(0.9, 0.9, 0.88) },
    };
    this.mesh = new THREE.Mesh(birdGeometry(n, seeds), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide, fog: false,
    }));
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.raycast = () => {};
    this.mesh.userData.warmDraw = true; // the warm-up draws it once (size 0 while faded out: no pixels) so the first appearance has nothing left to upload (#1265)
    this.mesh.userData.noDetail = true; // not for the small-detail culler (src/detail.js): it would hide the tiny bird geometry by distance
    scene.add(this.mesh);
  }

  /** Per frame: `rain` = the weather's strength 0…1, `hidden` = underground. No allocations. */
  update(dt, rain = 0, hidden = false) {
    const B = BIRDS, d = this.day, u = this.uniforms, cam = this.camera.position;
    const above = d.above ?? 0, white = d.uniforms.uWhite.value;
    const cover = smooth(SKYLAYER.cloudy, SKYLAYER.full, d.overcast);
    const near = Math.hypot(cam.x - u.uCenter.value.x, cam.z - u.uCenter.value.z) < B.far;
    const want = !hidden && near && d.daylight >= B.day && rain < B.rain && white < 0.05 ? 1 : 0;
    this.fade += Math.sign(want - this.fade) * Math.min(Math.abs(want - this.fade), dt * B.fade);
    this.mesh.visible = this.fade > 0.01;
    if (!this.mesh.visible) return;
    this.time += dt;
    u.uTime.value = this.time;
    u.uFade.value = this.fade;
    u.uHigh.value = cover < 0.01 || above > 0.5 ? 1 : 0; // the high flock is hidden behind the cloud deck in cloudy weather
    u.uCol.value.setRGB(0.97, 0.97, 0.95).multiplyScalar(0.35 + 0.65 * d.daylight);
  }
}
