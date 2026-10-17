import * as THREE from 'three';
import { FIREWORKS as F } from './config.js';
import { lowMemory } from './lowmemory.js';
import { sfx } from './audio.js';

// Midnight fireworks over the block (#1200). Rockets rise from around the courtyard, burst into glowing sparks and
// sink; two additive Points objects (rising shells, sparks) = 2 draw calls, no raycast. Each burst briefly lifts the
// EXISTING hemisphere/ambient lights (`lights`, no new or shadow-casting light) and plays a bang + crackle through
// the positional audio system (audio.js `sfx.firework`). #1199's New Year trigger calls `start()` at 00:00; `?fireworks`
// starts it a few seconds after load (add `&time=0` for night).
const SHELLS = lowMemory ? F.phoneShells : F.shells, SPARKS = lowMemory ? F.phoneSparks : F.sparks;
const PALETTE = [[1, 0.25, 0.2], [1, 0.75, 0.2], [0.3, 0.7, 1], [0.4, 1, 0.45], [1, 0.4, 0.9], [1, 1, 0.9], [0.7, 0.45, 1]];
const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function points(n, size, tex, scene) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  Object.assign(p, { frustumCulled: false, visible: false, renderOrder: 3 });
  p.raycast = () => {};
  scene.add(p);
  return p;
}

let st = null;

/** Set up once: `scene`, `camera` (for the sound), `lights` ({ hemi, ambient }), `outdoors()` (optional). */
export function init({ scene, camera, lights, outdoors = () => true }) {
  const tex = glowTexture();
  st = { camera, lights, outdoors, shells: [], timer: 0, left: 0, flash: 0, tint: new THREE.Color(1, 1, 1), tmp: new THREE.Color(), v: new THREE.Vector3(),
    rockets: points(SHELLS, 2.0, tex, scene), sparks: points(SHELLS * SPARKS, 2.4, tex, scene), total: 0, bursts: 0 };
  for (let i = 0; i < SHELLS; i++) st.shells.push({ t: 99, pop: 1, o: new THREE.Vector3(), top: new THREE.Vector3(), at: new THREE.Vector3(), col: PALETTE[0], radius: 10,
    dirs: Array.from({ length: SPARKS }, () => new THREE.Vector3()), crackle: false, popped: true });
}

/** Whether a show is on. */
export const active = () => !!st && st.left > 0;
/** Test/debug state. */
export const stats = () => st && { left: st.left, bursts: st.bursts, flash: st.flash, shells: st.shells.filter((s) => s.t < F.rise[1] + F.life).length };

/** Start the show (`seconds` defaults to FIREWORKS.seconds); calling it again restarts the time. */
export function start(seconds = F.seconds) {
  if (!st) return;
  st.left = seconds; st.total = seconds; st.timer = 0;
  st.rockets.visible = st.sparks.visible = true;
}

function launch(s) {
  const x = rnd(F.area.x), z = rnd(F.area.z);
  s.o.set(x, -1 + Math.random() * 2, z);
  s.top.set(x + (Math.random() - 0.5) * 8, rnd(F.height), z + (Math.random() - 0.5) * 8);
  s.pop = rnd(F.rise); s.t = 0; s.popped = false;
  s.col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  s.radius = rnd(F.radius); s.crackle = Math.random() < 0.3;
  for (const d of s.dirs) { // a sphere of directions
    d.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (d.lengthSq() > 1 || d.lengthSq() < 0.01) d.set(0, 1, 0);
    d.normalize().multiplyScalar(0.75 + Math.random() * 0.25);
  }
  const p = soundPos(s.o);
  sfx.firework?.(p.pos, 'launch', F.volume * p.gain, p.delay);
}

/** A near stand-in for a distant sound: the same direction, at most `soundDistance` m away (the panner's roll-off would silence it). */
function soundPos(at) {
  const c = st.camera.position, v = st.v.copy(at).sub(c), d = v.length() || 1;
  const gain = Math.min(1, 25 / (25 + d * 0.6)) * (st.outdoors() ? 1 : 0.45);
  return { pos: v.multiplyScalar(Math.min(1, F.soundDistance / d)).add(c).clone(), gain, delay: Math.min(d / 340, 0.5) };
}

/** Per frame: launches, moves the shells and sparks, and adds the burst flash to the hemisphere/ambient lights (call after the day cycle). */
export function update(dt) {
  if (!st || (!st.left && !st.sparks.visible)) return;
  const rp = st.rockets.geometry.attributes.position, rc = st.rockets.geometry.attributes.color;
  const sp = st.sparks.geometry.attributes.position, sc = st.sparks.geometry.attributes.color;
  if (st.left > 0) {
    st.left = Math.max(0, st.left - dt);
    st.timer -= dt;
    if (st.timer <= 0) {
      const finale = st.left < F.finale;
      st.timer = finale ? F.finaleInterval : rnd(lowMemory ? F.phoneInterval : F.interval);
      const s = st.shells.find((q) => q.t > F.rise[1] + F.life + 0.3);
      if (s) launch(s);
    }
  }
  let anyLive = false;
  st.shells.forEach((s, i) => {
    s.t += dt;
    const live = s.t < s.pop + F.life;
    if (live) anyLive = true;
    // the rocket: fast then slowing, shown until it bursts
    if (s.t < s.pop) {
      const k = 1 - (1 - s.t / s.pop) ** 2;
      s.at.lerpVectors(s.o, s.top, k);
      rp.setXYZ(i, s.at.x, s.at.y, s.at.z);
      const b = 0.5 + 0.5 * Math.sin(s.t * 40);
      rc.setXYZ(i, 1 * b, 0.8 * b, 0.5 * b);
    } else {
      rc.setXYZ(i, 0, 0, 0);
      if (!s.popped) {
        s.popped = true; st.bursts++;
        const p = soundPos(s.at), dist = st.camera.position.distanceTo(s.at);
        sfx.firework?.(p.pos, s.crackle ? 'crackle' : 'bang', F.volume * p.gain, p.delay);
        st.flash = Math.max(st.flash, Math.min(1, 1.2 * (60 / (60 + dist)) + 0.2));
        st.tint.setRGB(s.col[0], s.col[1], s.col[2]);
      }
    }
    // the sparks: out from the burst, slowing, sinking, fading and twinkling
    const e = s.t - s.pop;
    for (let k = 0; k < SPARKS; k++) {
      const j = i * SPARKS + k;
      if (e < 0 || e > F.life) { sc.setXYZ(j, 0, 0, 0); continue; }
      const r = s.radius * (1 - Math.exp(-e * 2.6)), d = s.dirs[k];
      sp.setXYZ(j, s.at.x + d.x * r, s.at.y + d.y * r - 1.3 * e * e, s.at.z + d.z * r);
      const f = (1 - e / F.life) ** 1.3 * (s.crackle ? (Math.sin(e * 40 + j * 7) > 0.2 ? 1 : 0.15) : 0.75 + 0.25 * Math.sin(e * 16 + j));
      sc.setXYZ(j, s.col[0] * f, s.col[1] * f, s.col[2] * f);
    }
  });
  rp.needsUpdate = rc.needsUpdate = sp.needsUpdate = sc.needsUpdate = true;
  if (!anyLive && !st.left) st.rockets.visible = st.sparks.visible = false;
  // cheap light: the burst lifts the existing lights for a moment (nothing new, nothing casting shadows)
  if (st.flash > 0.003) {
    const { hemi, ambient } = st.lights, k = st.flash * (st.outdoors() ? 1 : F.flash.indoors);
    hemi.intensity += F.flash.hemi * k; ambient.intensity += F.flash.ambient * k;
    hemi.color.lerp(st.tmp.copy(st.tint).lerp(st.tmp.setRGB(1, 1, 1), 0.4), Math.min(1, k * 0.6));
    st.flash *= Math.exp(-F.flash.decay * dt);
  } else st.flash = 0;
}
