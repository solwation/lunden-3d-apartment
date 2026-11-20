import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SCOOTER as S, BICYCLE, LEVELS } from './config.js';
import { Holdable } from './holdable.js';
import { scooterProfile, scooterSpots, tuneStep, kmh } from './scootermotion.js';
import { sfx } from './audio.js';

// #2229: Ryde-style rental e-scooters on the pavements round the block (generic teal, no logo). One InstancedMesh for all of them (one
// draw call, one shadow call); the ridden one is moved by its instance matrix. Each scooter is a bicycle record for the Player
// (world.bicycles: mount, ride, collision footprint, dismount; player.js reads `motionProfile()`, `eye`, `cameraBack` and `cameraPitch`)
// with `isScooter`. The screwdriver (a Holdable in the hall's EL/C cabinet, beside the flashlight) aimed at the
// hatch on the front of the stem and held for SCOOTER.tune.time s tunes that scooter (90 km/h). Not saved: a reload puts every scooter
// back on its spot, untuned (like the bicycles, which return to their racks).

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const box = (sx, sy, sz, x, y, z, hex) => paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), hex);
/** A cylinder from a to b ([x, y, z]), radius r. */
function rod(a, b, r, hex, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return paint(g, hex);
}
/** A wheel (axle along z) at x, radius r. */
const wheel = (x, r, w, hex) => paint(new THREE.CylinderGeometry(r, r, w, 14).rotateX(Math.PI / 2).translate(x, r, 0), hex);

/** The scooter in its own frame: forward +x, up +y, right +z (the bicycle's), the ground at y 0, the wheels at BICYCLE's wheelbase. */
export function scooterGeometry() {
  const C = S.colors, G = S.grip, H = S.hatch, xr = BICYCLE.wheelRear + 0.02, xf = BICYCLE.wheelFront - 0.02, r = 0.115;
  const stemBase = [xf - 0.06, 0.17, 0], stemTop = [G.x, G.y, 0];
  const parts = [
    wheel(xr, r, 0.05, C.tyre), wheel(xf, r, 0.05, C.tyre),
    wheel(xr, r * 0.55, 0.056, C.metal), wheel(xf, r * 0.55, 0.056, C.metal), // the hubs
    box(0.78, 0.055, 0.17, -0.06, S.deck - 0.028, 0, C.body),                 // the deck (battery inside)
    box(0.7, 0.008, 0.15, -0.07, S.deck + 0.004, 0, C.dark),                  // its grip tape
    box(0.06, 0.05, 0.12, xr + 0.02, 0.1, 0, C.body),                          // the rear dropout
    paint(new THREE.CylinderGeometry(r + 0.025, r + 0.025, 0.07, 12, 1, true, Math.PI * 0.05, Math.PI * 0.95).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(xr, r, 0), C.body), // the rear mudguard
    box(0.02, 0.025, 0.06, xr - 0.13, 0.14, 0, C.rear),                        // the rear light
    rod(stemBase, stemTop, 0.026, C.body, 10),                                  // the stem
    rod([xf - 0.06, 0.2, 0.035], [xf, r, 0.035], 0.016, C.metal), rod([xf - 0.06, 0.2, -0.035], [xf, r, -0.035], 0.016, C.metal), // the fork
    rod([xr + 0.35, 0.115, 0], stemBase, 0.03, C.body),                       // the neck from the deck to the stem
    rod([G.x, G.y, -G.z - G.length / 2], [G.x, G.y, G.z + G.length / 2], 0.014, C.dark), // the handlebar
    rod([G.x, G.y, G.z - G.length / 2], [G.x, G.y, G.z + G.length / 2], G.radius + 0.006, C.tyre), // the grips
    rod([G.x, G.y, -G.z - G.length / 2], [G.x, G.y, -G.z + G.length / 2], G.radius + 0.006, C.tyre),
    box(0.07, 0.03, 0.1, G.x - 0.01, G.y + 0.03, 0, C.dark),                   // the display's housing
    box(0.05, 0.004, 0.075, G.x - 0.012, G.y + 0.047, 0, C.screen),            // its screen
    box(0.03, 0.04, 0.07, G.x + 0.02, G.y - 0.07, 0, C.light),                 // the headlight
  ];
  // the tuning hatch: a darker plate with a screw at each corner on the front of the stem (S.hatch, model frame)
  const dirStem = new THREE.Vector3(stemTop[0] - stemBase[0], stemTop[1] - stemBase[1], 0).normalize(), along = (H.y - stemBase[1]) / dirStem.y;
  const hx = stemBase[0] + dirStem.x * along + 0.022, hy = H.y;
  const tilt = Math.atan2(dirStem.x, dirStem.y);
  const plate = new THREE.BoxGeometry(0.012, 0.11, 0.05).rotateZ(-tilt).translate(hx, hy, 0);
  parts.push(paint(plate, C.hatch));
  for (const [dy, dz] of [[-0.045, -0.018], [-0.045, 0.018], [0.045, -0.018], [0.045, 0.018]]) parts.push(box(0.006, 0.008, 0.008, hx + 0.007 + dy * Math.sin(tilt), hy + dy * Math.cos(tilt), dz, C.metal));
  return mergeGeometries(parts);
}

/** The hatch's centre in the scooter's own frame (the aim test). */
export function hatchLocal() {
  const G = S.grip, H = S.hatch, xf = BICYCLE.wheelFront - 0.02, b = [xf - 0.06, 0.17], d = [G.x - b[0], G.y - b[1]], t = (H.y - b[1]) / d[1];
  return new THREE.Vector3(b[0] + d[0] * t + 0.03, H.y, 0);
}

/**
 * Build the scooters. `ground(x, z)`: the drawn ground height; `ok(x, z)`: a pavement spot clear of carriageways (roads.js);
 * `roads` / `samples`: SITE.roads and roads.js samples. Returns { object, scooters (bicycle records), tuner, speedo }.
 */
export function buildScooters({ scene, ground, ok, roads, samples, lowMemory = false }) {
  const spots = scooterSpots(roads, samples, ok, lowMemory ? S.lowMemoryCount : S.count);
  const group = new THREE.Group(); group.name = 'scooters';
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
  const mesh = new THREE.InstancedMesh(scooterGeometry(), mat, Math.max(1, spots.length));
  mesh.name = 'scooters'; mesh.count = spots.length; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false; // (spread over the whole area: one call, never culled as a whole)
  mesh.userData.moving = true;
  group.add(mesh);
  const pickGeo = new THREE.BoxGeometry(1.15, 1.1, 0.5), pickMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), hatch = hatchLocal();
  const scooters = spots.map((spot, index) => {
    const y = ground(spot.x, spot.z) + S.lift;
    const pick = new THREE.Mesh(pickGeo, pickMat); pick.userData.moving = true; pick.name = `scooter-pick-${index}`; group.add(pick);
    const sc = {
      id: `scooter-${index}`, index, isScooter: true, tuned: false, tuneProgress: 0,
      position: new THREE.Vector3(spot.x, y, spot.z), yaw: spot.yaw, pitch: 0, home: { x: spot.x, y, z: spot.z, yaw: spot.yaw },
      matrix: new THREE.Matrix4(), atSource: false, ridden: false, rackSegments: [], pick,
      eye: S.eye, cameraBack: S.cameraBack, cameraPitch: S.pitch,
      motionProfile() { return scooterProfile(this.tuned); },
      place(p, yaw, pitch = 0) {
        this.position.copy(p); this.yaw = yaw; this.pitch = pitch;
        q.setFromEuler(e.set(0, yaw, pitch, 'YXZ'));
        this.matrix.compose(p, q, one);
        mesh.setMatrixAt(index, this.matrix); mesh.instanceMatrix.needsUpdate = true;
        pick.position.copy(p); pick.position.y += 0.55; pick.rotation.set(0, yaw, 0);
        pick.updateMatrixWorld();
      },
      /** The hatch in the world (for the aim test). */
      hatchWorld(out = new THREE.Vector3()) { return out.copy(hatch).applyMatrix4(this.matrix); },
      footprint(feet, headroom, hurdle) { // like a moved bicycle's: solid while parked or ridden by someone else
        const C = BICYCLE;
        if (this.selfQuery || this.position.y - Math.abs(Math.sin(this.pitch ?? 0)) * (Math.max(-C.rear, C.front) + C.radius) > feet + headroom || this.position.y + C.height + Math.abs(Math.sin(this.pitch ?? 0)) * (Math.max(-C.rear, C.front) + C.radius) <= feet - hurdle) return [];
        const dx = Math.cos(this.yaw), dz = -Math.sin(this.yaw), r = 0.26;
        return [[C.wheelRear - 0.16, -r], [C.wheelFront + 0.16, -r], [C.wheelFront + 0.16, r], [C.wheelRear - 0.16, r]].map(([x, z]) => [this.position.x + dx * x - dz * z, this.position.z + dz * x + dx * z]);
      },
    };
    sc.target = { name: 'elsparkcykeln', kind: 'bicycle', verb: 'köra', bicycle: sc, pickable: pick };
    sc.tuneTarget = { kind: 'scooterTune', name: 'elsparkcykeln', verb: 'trimma', scooter: sc, pickable: pick,
      get blocked() { return sc.tuned; }, blockedText: 'Den här elsparkcykeln är redan trimmad' };
    pick.userData.door = sc.target;
    sc.place(sc.position, sc.yaw, 0);
    return sc;
  });
  mesh.computeBoundingSphere();
  scene.add(group);
  return { object: group, mesh, scooters, tuner: new Tuner(), speedo: buildSpeedo() };
}

/** The hold-to-tune at a scooter's hatch: as the fuse box's mending (power.js), but per scooter and shorter. */
export class Tuner {
  constructor() { Object.assign(this, { scooter: null, holding: false, tinkerT: 0, onDone: null }); }
  /** E / the mouse / the action button pressed on a scooter's hatch. */
  start(scooter) { if (!scooter || scooter.tuned) return false; this.scooter = scooter; this.holding = true; return true; }
  /** Let go (key up, mouse up, finger off, menu, blur). */
  release() { this.holding = false; }
  /** Each frame; `aimed`: the scooter whose hatch is in focus (null: none). */
  update(dt, aimed) {
    const sc = this.scooter; if (!sc || sc.tuned) return;
    const r = tuneStep(sc.tuneProgress, dt, this.holding, aimed === sc);
    sc.tuneProgress = r.progress;
    if (this.holding && aimed === sc && (this.tinkerT -= dt) <= 0) { this.tinkerT = S.tune.tinker; sfx.click?.(sc.position); }
    if (r.done) { sc.tuned = true; this.holding = false; this.scooter = null; this.onDone?.(sc); }
  }
  /** How far `sc` is tuned, 0 … 1. */
  fraction(sc) { return sc ? Math.min(1, sc.tuneProgress / S.tune.time) : 0; }
}

/** The speed display (HUD): big km/h, "trimmad" under it. One DOM element, shown only on a scooter. */
function buildSpeedo() {
  if (typeof document === 'undefined') return { show() {} };
  const el = document.createElement('div');
  el.id = 'speedo'; el.hidden = true; el.setAttribute('aria-live', 'off');
  el.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3;pointer-events:none;'
    + 'min-width:96px;padding:6px 14px 5px;border-radius:12px;background:rgba(10,24,22,.72);color:#e9fff9;text-align:center;font:700 30px/1 system-ui,sans-serif;'
    + 'font-variant-numeric:tabular-nums;box-shadow:0 0 0 2px rgba(22,168,143,.8) inset';
  const v = document.createElement('span'), u = document.createElement('span'), t = document.createElement('div');
  u.textContent = ' km/h'; u.style.cssText = 'font-size:14px;font-weight:600;opacity:.85';
  t.style.cssText = 'font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-top:3px';
  el.append(v, u, t); document.body.appendChild(el);
  let last = '';
  return {
    el,
    /** `speed` m/s or null to hide. */
    show(speed, tuned = false) {
      const key = speed === null ? '' : `${kmh(speed)}|${tuned}`;
      if (key === last) return; last = key;
      el.hidden = speed === null;
      if (speed === null) return;
      v.textContent = String(kmh(speed));
      t.textContent = tuned ? 'Trimmad · max 90' : 'Max 20';
      t.style.color = tuned ? '#ffb199' : '#9fe8d8';
    },
  };
}

/** The screwdriver (#2229) in the hall's EL/C cabinet, on the fuse box beside the flashlight. A plain Holdable: take, put back,
 * carry. With it in the hand, a scooter's hatch becomes a hold-to-tune target (main.js). */
export class Screwdriver extends Holdable {
  constructor(scene, camera, at) {
    const y0 = LEVELS[at.level].floor + at.y;
    const handle = paint(new THREE.CylinderGeometry(0.014, 0.016, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.05), 0xd8a41a);
    const band = paint(new THREE.CylinderGeometry(0.0165, 0.0165, 0.02, 10).rotateX(Math.PI / 2).translate(0, 0, 0.075), 0x1b1d20);
    const shaft = paint(new THREE.CylinderGeometry(0.0035, 0.0035, 0.1, 6).rotateX(Math.PI / 2).translate(0, 0, -0.05), 0xb9bec4);
    const tip = paint(new THREE.BoxGeometry(0.008, 0.002, 0.012).translate(0, 0, -0.104), 0xb9bec4);
    const model = new THREE.Mesh(mergeGeometries([handle, band, shaft, tip]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 }));
    model.castShadow = true;
    super(scene, camera, {
      name: 'skruvmejseln', backName: at.back[0], backVerb: at.back[1], model,
      home: { pos: new THREE.Vector3(at.x, y0, at.z), rot: new THREE.Euler(0, at.turn, 0) },
      heldPose: { pos: new THREE.Vector3(at.held.x, at.held.y, at.held.z), rot: new THREE.Euler(0.15, 0.1, 0) },
      pick: { pos: new THREE.Vector3(at.x, y0 + 0.02, at.z), size: [0.22, 0.1, 0.25] },
      cooldown: 0.2,
    });
    this.isScrewdriver = true;
  }
  onTake() { sfx.click?.(this.where()); this.onHint?.('Sikta på luckan framtill på en elsparkcykels styrstång och håll in E'); }
}
