import * as THREE from 'three';
import { MUSSELS as C, HOLD, SITE, WALK } from './config.js';
import { Holdable, heldItem, setHeld, handBusy } from './holdable.js';
import { riverPath, riverAt, pierBoxes } from './riverbridge.js';
import { swimWater, swimBedY, farWalls } from './farwalk.js';
import { musselSpots, MusselField, bedSpot } from './musselfield.js';

// Blue mussels on the bed of Höje å (#1945). src/musselfield.js (no three.js) says where they lie and when a taken one is back; this file
// draws them and ties them to the game: E / the action button on a mussel within reach takes it into the hand like a nut, E on the bed
// (or any surface, or the ground on land) puts it down again, E on its old spot puts it back.
// Cost: the whole bed is ONE InstancedMesh (one draw call) holding only the mussels within `near` m of a swimmer's eye, hidden for everybody
// who does not swim (the water is opaque from above, so nothing could be seen anyway); the spots are worked out at the first swim. A mussel
// has a mesh of its own only while it is out of the bed (in the hand or put down): at most `loose` at once, pooled holdables.
// Local to each player (no sync): the placement is seeded, so everybody sees the same bed; who has taken what is not shared.

const V = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), D = new THREE.Vector3();
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** One shell (both valves closed), 1 long along x with the hinge end at -x, lying on its side (thickness along y); vertex colours. */
export function musselGeometry() {
  const F = C.shape, g = new THREE.SphereGeometry(0.5, ...F.segments).rotateZ(Math.PI / 2), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const shell = new THREE.Color(C.colors.shell), band = new THREE.Color(C.colors.band), edge = new THREE.Color(C.colors.edge), umbo = new THREE.Color(C.colors.umbo), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), u = x + 0.5, f = F.taper + (1 - F.taper) * smooth(u * 1.5), y = p.getY(i) * 2, z = p.getZ(i) * 2; // (u: 0 at the hinge, 1 at the broad end)
    p.setXYZ(i, x, y * 0.5 * F.thick * f, z * 0.5 * F.width * f + 0.07 * Math.sin(u * Math.PI)); // a teardrop with one straighter and one rounder side
    c.copy(shell).lerp(band, 0.55 * smooth(Math.sin(u * 21) * 1.5 - 0.3) * smooth(u * 3)); // growth bands across the shell
    c.lerp(edge, smooth(1 - Math.abs(y) * 2.2)); // the seam between the valves
    c.lerp(umbo, 0.7 * smooth(1 - u * 5)); // the worn hinge end
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

/** A mussel out of the bed: in the hand, or put down somewhere. Pooled by `Mussels` (`broken` = not in use, as a nut that is gone). */
export class Mussel extends Holdable {
  constructor(scene, camera, host, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false; mesh.userData.noDetail = true;
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3();
    mesh.raycast = function (rc, out) { // a ball to aim at, as the nut's
      sphere.set(this.getWorldPosition(V), C.pick);
      if (rc.ray.intersectSphere(sphere, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this });
    };
    super(scene, camera, { name: 'en blåmussla', verb: 'ta', backName: 'blåmusslan', backVerb: 'lägga tillbaka', model: mesh, home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(...C.held.pos), rot: new THREE.Euler(...C.held.rot) }, pick: { pos: new THREE.Vector3(), size: [C.pick * 1.5, C.pick, C.pick * 1.5] } });
    // `isMussel`: what #1946's fish look for; `outdoorPlace`: E puts it down on the ground outdoors (main.js outdoorSpot), on the bed while swimming
    Object.assign(this, { host, isMussel: true, outdoorPlace: true, broken: true, spot: null, putT: 0 });
    this.pickMesh = this.holder.children[this.holder.children.length - 1];
    this.model.removeFromParent();
  }
  /** Out of the bed spot `s` and into the hand. */
  appear(s) {
    this.spot = s; this.broken = false; this.rest = null;
    this.model.scale.setScalar(s.size);
    this.home.pos.set(s.x, s.y + lift(s), s.z); this.home.rot.set(s.tilt, s.yaw, 0, 'YXZ');
    this.pickMesh.position.copy(this.home.pos);
    this.model.visible = true;
  }
  /** Not in use: no target, no mesh. */
  vanish() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    this.model.removeFromParent(); this.model.visible = false; this.broken = true; this.placed = false; this.spot = null;
  }
  onPut() { this.putT = this.host.time; }
  /** Home is the bed: put back with E on its old spot, or sent home by a reset, it is one of the bed's mussels again. */
  goHome() { super.goHome(); if (this.host && !this.broken) this.host.returned(this); }
}

const lift = (s) => s.size * C.shape.thick * 0.5 - C.sink;

export class Mussels {
  /** `player`: the Player (`swimming`); `onTake(spot)`: a mussel was picked off the bed. Nothing is placed until somebody swims. */
  constructor({ scene, camera, player, onTake = null, rnd = Math.random }) {
    Object.assign(this, { scene, camera, player, onTake, rnd, time: 0, field: null, spots: [], drawn: [], lastTake: null });
    this.geometry = musselGeometry();
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: C.rough, metalness: C.metal });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, C.max);
    Object.assign(this.mesh, { frustumCulled: false, visible: false, count: 0, name: 'river-mussels' });
    this.mesh.userData.noDetail = true; this.mesh.userData.warmDraw = true; // (compiled by the warm-up, drawn only for a swimmer)
    const self = this, sphere = new THREE.Sphere(), hit = new THREE.Vector3();
    this.mesh.raycast = function (rc, out) { // each drawn mussel is a ball to aim at
      if (!this.visible) return;
      for (let k = 0; k < this.count; k++) {
        const s = self.drawn[k]; sphere.center.set(s.x, s.y + lift(s), s.z); sphere.radius = C.pick;
        if (rc.ray.intersectSphere(sphere, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this, instanceId: k });
      }
    };
    this.target = { name: 'en blåmussla', kind: 'holdable', verb: 'ta', pickable: this.mesh, get blocked() { return handBusy(null); }, toggle: () => this.takeAimed() };
    this.mesh.userData.door = this.target;
    scene.add(this.mesh);
    /** The pooled holdables (main.js adds them to its `holdables`). */
    this.items = Array.from({ length: C.loose }, () => new Mussel(scene, camera, this, this.geometry, this.material));
  }

  /** The spots, worked out once (the first time somebody swims: the drawn bed exists by then). */
  build() {
    if (this.field) return;
    const foot = SITE.bridges.road.foot / 2 + C.pierClear;
    this.spots = musselSpots({ path: riverPath, frame: riverAt, open: swimWater, bedY: swimBedY, bounds: WALK, cfg: C,
      piers: pierBoxes().map((p) => ({ ...p, half: foot })), walls: (x, z) => farWalls(x, z, SITE.bridges.bedY) });
    this.field = new MusselField(this.spots, C, this.rnd);
  }

  /** What E can aim at: the bed's mussels while swimming (from the surface only the shallow ones are within reach; never from land). */
  targets() { return this.mesh.visible ? [this.mesh] : []; }

  /** The mussel in the hand (a `Mussel`, `isMussel`), or null. */
  get held() { const it = heldItem(); return it?.isMussel ? it : null; }
  /** Where the held mussel is in the world (the hand), or null. */
  heldPosition(out = new THREE.Vector3()) { const m = this.held; return m ? m.where(out) : null; }
  /** The held mussel is gone from the hand (eaten by a fish, #1946); its spot on the bed grows back as usual. True when there was one. */
  consumeHeld() { const m = this.held; if (!m) return false; m.vanish(); return true; }

  /** The drawn mussel the eye looks at within reach (nearest along the look ray), or null. */
  aimed(reach = HOLD.reach) {
    if (!this.mesh.visible) return null;
    const o = this.camera.getWorldPosition(V), d = this.camera.getWorldDirection(D); let best = null, bt = reach;
    for (let k = 0; k < this.mesh.count; k++) {
      const s = this.drawn[k], cx = s.x - o.x, cy = s.y + lift(s) - o.y, cz = s.z - o.z, t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0) continue;
      const off2 = cx * cx + cy * cy + cz * cz - t * t; if (off2 > C.pick * C.pick) continue;
      const at = t - Math.sqrt(C.pick * C.pick - off2);
      if (at < bt) { bt = at; best = s; }
    }
    return best;
  }
  /** E on the bed's mussels: the aimed one comes into the hand. */
  takeAimed() { return this.take(this.aimed()); }
  /** Take the bed's mussel `spot` into the hand; false when the hand is busy or it is gone. */
  take(spot) {
    if (!spot || spot.gone || handBusy(null)) return false;
    let m = this.items.find((x) => x.broken);
    if (!m) { // the pool is out: the one put down longest ago goes back to the river
      m = this.items.filter((x) => !x.held).sort((a, b) => a.putT - b.putT)[0]; if (!m) return false;
      m.vanish();
    }
    this.field.take(spot); m.appear(spot); m.take();
    if (!m.held) { this.field.restore(spot); m.vanish(); return false; } // (the hand was reserved after all)
    this.lastTake = spot; this.onTake?.(spot);
    return true;
  }
  /** A loose mussel went home: its spot has it again (when nothing has grown there meanwhile), the holdable is free. */
  returned(m) { if (m.spot) this.field?.restore(m.spot); m.vanish(); }

  /** Where a swimmer's held mussel can be put down on the bed along the look `ray` (main.js outdoorSpot's answer under water), or null. */
  bedSpot(ray, reach = HOLD.reach - 0.2) {
    const p = bedSpot(ray.origin, ray.direction, reach, swimBedY, swimWater);
    return p && { point: new THREE.Vector3(p.x, p.y, p.z), distance: Math.max(0.3, p.distance), outdoor: true };
  }

  update(dt) {
    this.time += dt;
    const swim = !!this.player.swimming, cam = this.camera.position, m = this.mesh;
    if (this.field?.out.length) {
      const far2 = C.regrowFar * C.regrowFar, back = this.field.update(dt, (s) => !swim || (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 > far2);
      if (back) for (const it of this.items) if (back.includes(it.spot)) it.spot = null; // (its place is taken: it can only be put down, not back)
    }
    if (!swim) { if (m.visible) { m.visible = false; m.count = 0; } return; }
    this.build();
    const near2 = C.near * C.near; let n = 0;
    for (const s of this.spots) {
      if (s.gone || (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2 > near2) continue;
      M.compose(V.set(s.x, s.y + lift(s), s.z), Q.setFromEuler(E.set(s.tilt, s.yaw, 0, 'YXZ')), S.setScalar(s.size));
      m.setMatrixAt(n, M); this.drawn[n] = s;
      if (++n >= C.max) break;
    }
    m.count = n; m.visible = true; m.instanceMatrix.needsUpdate = true;
  }

  /** For tests / the console. */
  state() { return { spots: this.spots.length, drawn: this.mesh.count, visible: this.mesh.visible, out: this.field?.out.length ?? 0, loose: this.items.filter((x) => !x.broken).length, held: !!this.held }; }
}
