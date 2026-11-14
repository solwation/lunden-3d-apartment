import * as THREE from 'three';
import { MUSSELS as C, SITE, WALK } from './config.js';
import { Holdable, heldItem, setHeld, handBusy } from './holdable.js';
import { riverPath, riverAt, pierBoxes, waterYAt } from './riverbridge.js';
import { swimWater, swimBedY, farWalls } from './farwalk.js';
import { musselSpots, MusselField, bedSpot, closeShell, strike, shellTick } from './musselfield.js';
import { sfx } from './audio.js';

// Blue mussels on the bed of Höje å (#1945). src/musselfield.js (no three.js) says where they lie and when a taken one is back; this file
// draws them and ties them to the game: E / the action button on a mussel within reach takes it into the hand like a nut, E on the bed
// (or any surface, or the ground on land) puts it down again, E on its old spot puts it back.
// Cost: the whole bed is ONE InstancedMesh (one draw call) holding only the mussels within `near` m of a swimmer's eye, hidden for everybody
// who does not swim (the water is opaque from above, so nothing could be seen anyway); the spots are worked out at the first swim. A mussel
// has a mesh of its own only while it is out of the bed (in the hand or put down): at most `loose` at once, pooled holdables.
// #1950: a picked mussel is closed (`cracked` false). A diver with the bed within `crack.reach` knocks it against the bed with E (the action
// says "Slå musslan mot botten"); after `crack.hits` knocks the shell cracks: `cracked` true (what #1946's fish look for), the mesh's
// geometry is swapped for the open shell with the meat showing (same mesh, same material: no draw call more). The E rule: a CLOSED mussel
// held by a DIVER aiming at the bed is knocked, never put down there; it is still put back with E on its old spot, and put down as before
// from the surface (the shallows) or on land, where no knock counts. A CRACKED mussel is put down anywhere as before, but has no old spot
// to go back to (the bed's own mussels are all closed; its spot grows a closed one back as usual).
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

/** The cracked shell (#1950), in the closed shell's frame: the lower valve as it lay, the upper one standing open `crack.gape` rad about the
 * hinge, both with a pearly inside, and the pale meat lying in the lower valve. One non-indexed vertex-coloured geometry (~500 triangles). */
export function crackedGeometry(closed = musselGeometry()) {
  const K = C.crack, g = closed.toNonIndexed(), p = g.attributes.position, nr = g.attributes.normal, cl = g.attributes.color, n = p.count;
  const blob = new THREE.SphereGeometry(0.5, ...K.meat.segments).toNonIndexed(), bp = blob.attributes.position, bn = blob.attributes.normal;
  const total = n * 2 + bp.count, P = new Float32Array(total * 3), N = new Float32Array(total * 3), K3 = new Float32Array(total * 3);
  const inside = new THREE.Color(K.colors.inside), rim = new THREE.Color(K.colors.rim), meat = new THREE.Color(K.colors.meat), c = new THREE.Color();
  const cos = Math.cos(K.gape), sin = Math.sin(K.gape); let w = 0;
  const put = (x, y, z, nx, ny, nz, up) => { // (the upper valve turns about the hinge line: z through x = -0.5)
    if (up) { const dx = x + 0.5; x = -0.5 + dx * cos - y * sin; y = dx * sin + y * cos; const mx = nx * cos - ny * sin; ny = nx * sin + ny * cos; nx = mx; }
    P.set([x, y, z], w * 3); N.set([nx, ny, nz], w * 3); K3.set([c.r, c.g, c.b], w * 3); w++;
  };
  for (let t = 0; t < n; t += 3) {
    const up = p.getY(t) + p.getY(t + 1) + p.getY(t + 2) >= 0, half = (i) => (up ? Math.max(0, p.getY(i)) : Math.min(0, p.getY(i))); // each valve ends at the seam
    for (const k of [0, 1, 2]) { const i = t + k; c.fromBufferAttribute(cl, i); put(p.getX(i), half(i), p.getZ(i), nr.getX(i), nr.getY(i), nr.getZ(i), up); } // the outside, as it was
    for (const k of [0, 2, 1]) { const i = t + k, y = half(i); c.copy(inside).lerp(rim, smooth(1 - Math.abs(y) / 0.035)); put(p.getX(i), y, p.getZ(i), -nr.getX(i), -nr.getY(i), -nr.getZ(i), up); } // the inside
  }
  const [sx, sy, sz] = K.meat.size, [ax, ay, az] = K.meat.at;
  for (let i = 0; i < bp.count; i++) {
    const l = Math.hypot(bn.getX(i) / sx, bn.getY(i) / sy, bn.getZ(i) / sz) || 1;
    c.copy(meat).lerp(rim, 0.25 * smooth(Math.abs(bp.getZ(i)) * 4 - 1)); // a darker mantle edge
    put(ax + bp.getX(i) * sx, ay + bp.getY(i) * sy, az + bp.getZ(i) * sz, bn.getX(i) / sx / l, bn.getY(i) / sy / l, bn.getZ(i) / sz / l, false);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(K3, 3));
  out.computeBoundingSphere(); g.dispose(); blob.dispose();
  return out;
}

/** A mussel out of the bed: in the hand, or put down somewhere. Pooled by `Mussels` (`broken` = not in use, as a nut that is gone). */
export class Mussel extends Holdable {
  constructor(scene, camera, host, geometry, material, open = geometry) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false; mesh.userData.noDetail = true;
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3();
    mesh.raycast = function (rc, out) { // a ball to aim at, as the nut's
      sphere.set(this.getWorldPosition(V), C.pick);
      if (rc.ray.intersectSphere(sphere, hit) && (rc.ray.origin.distanceTo(hit) <= C.reach || !underWater(V))) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this });
    };
    super(scene, camera, { name: 'en blåmussla', verb: 'ta', backName: 'blåmusslan', backVerb: 'lägga tillbaka', model: mesh, home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(...C.held.pos), rot: new THREE.Euler(...C.held.rot) }, pick: { pos: new THREE.Vector3(), size: [C.pick * 1.5, C.pick, C.pick * 1.5] } });
    // `isMussel`: what #1946's fish look for; `outdoorPlace`: E puts it down on the ground outdoors (main.js outdoorSpot), on the bed while swimming
    Object.assign(this, { host, isMussel: true, outdoorPlace: true, broken: true, spot: null, putT: 0, shells: [geometry, open], swingT: -1 });
    closeShell(this); // #1950: `cracked` (false = closed; the fixed interface #1946 reads), `hits`, `wait`
    this.pickMesh = this.holder.children[this.holder.children.length - 1];
    this.model.removeFromParent();
  }
  /** Out of the bed spot `s` and into the hand. */
  appear(s) {
    this.spot = s; this.broken = false;
    this.model.scale.setScalar(s.size);
    closeShell(this); this.swingT = -1; this.look(); // (the bed's mussels, also the regrown ones, are closed)
    this.home.pos.set(s.x, s.y + lift(s), s.z); this.home.rot.set(s.tilt, s.yaw, 0, 'YXZ');
    this.pickMesh.position.copy(this.home.pos);
    this.model.visible = true;
  }
  /** Not in use: no target, no mesh. */
  vanish() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    this.model.removeFromParent(); this.model.visible = false; this.broken = true; this.placed = false; this.spot = null; this.swingT = -1;
  }
  onPut() { this.putT = this.host.time; this.swingT = -1; this.look(); }
  /** Show what the shell is (#1950): the closed or the open geometry on the same mesh, its pose in the hand and how it lies put down. */
  look() {
    const K = C.crack, size = this.model.scale.x;
    this.model.geometry = this.shells[this.cracked ? 1 : 0];
    this.heldPose.rot.set(...(this.cracked ? K.held.rot : C.held.rot));
    this.rest = this.cracked ? { q: new THREE.Quaternion(), lift: size * C.shape.thick * 0.5 - C.sink } : null; // (open, it lies on its lower valve; closed: holdable.js restPose)
    if (this.held && this.swingT < 0) { this.model.position.copy(this.heldPose.pos); this.model.rotation.copy(this.heldPose.rot); }
  }
  /** One knock landed (mussels.js `Mussels.strike`): the mussel strikes down and comes back; a cracked one opens at the blow. */
  swing() { this.swingT = 0; }
  /** The shell cracked: it has no spot on the bed to go back to any more (its spot grows a closed one back as usual). */
  crack() { this.spot = null; this.pickMesh.position.y = -999; }
  /** Held: the time between knocks and the strike's motion (the model is a child of the camera). */
  tick(dt) {
    shellTick(this, dt);
    if (this.swingT < 0) return;
    const W = C.crack.swing, before = this.swingT / W.time, k = (this.swingT += dt) / W.time;
    if (before < W.at && k >= W.at) this.look(); // the blow: now it shows cracked
    if (k >= 1) { this.swingT = -1; this.look(); return; }
    const a = k < W.at ? smooth(k / W.at) : 1 - smooth((k - W.at) / (1 - W.at)), h = this.heldPose;
    this.model.position.set(h.pos.x, h.pos.y - W.down * a, h.pos.z - W.forward * a);
    this.model.rotation.set(h.rot.x - W.tilt * a, h.rot.y, h.rot.z);
  }
  /** Home is the bed: put back with E on its old spot, or sent home by a reset, it is one of the bed's mussels again. */
  goHome() { super.goHome(); if (this.host && !this.broken) this.host.returned(this); }
}

const lift = (s) => s.size * C.shape.thick * 0.5 - C.sink;
/** Does the point `p` lie under the river's surface (a loose mussel put down on the bed: within `reach` only, like the bed's own)? */
const underWater = (p) => p.y < SITE.bridges.waterY + 1 && swimWater(p.x, p.z) && p.y < waterYAt(p.x, p.z);

export class Mussels {
  /** `player`: the Player (`swimming`); `onTake(spot)`: a mussel was picked off the bed. Nothing is placed until somebody swims. */
  constructor({ scene, camera, player, onTake = null, say = null, rnd = Math.random }) {
    Object.assign(this, { scene, camera, player, onTake, say, rnd, hinted: false, time: 0, field: null, spots: [], drawn: [], lastTake: null });
    this.geometry = musselGeometry(); this.open = crackedGeometry(this.geometry); // (#1950: the cracked look, only ever on a loose mussel's own mesh)
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: C.rough, metalness: C.metal });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, C.max);
    Object.assign(this.mesh, { frustumCulled: false, visible: false, count: 0, name: 'river-mussels' });
    this.mesh.userData.noDetail = true; this.mesh.userData.warmDraw = true; // (compiled by the warm-up, drawn only for a swimmer)
    const self = this, sphere = new THREE.Sphere(), hit = new THREE.Vector3();
    this.mesh.raycast = function (rc, out) { // each drawn mussel is a ball to aim at
      if (!this.visible) return;
      for (let k = 0; k < this.count; k++) {
        const s = self.drawn[k]; sphere.center.set(s.x, s.y + lift(s), s.z); sphere.radius = C.pick;
        if (rc.ray.intersectSphere(sphere, hit) && rc.ray.origin.distanceTo(hit) <= C.reach) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this, instanceId: k });
      }
    };
    this.target = { name: 'en blåmussla', kind: 'holdable', verb: 'ta', pickable: this.mesh, get blocked() { return handBusy(null); }, toggle: () => this.takeAimed() };
    this.mesh.userData.door = this.target;
    scene.add(this.mesh);
    /** The pooled holdables (main.js adds them to its `holdables`). */
    this.items = Array.from({ length: C.loose }, () => new Mussel(scene, camera, this, this.geometry, this.material, this.open));
    /** #1950: what E does while a diver holds a closed mussel and aims at the bed (main.js updateFocus, instead of the place target). */
    this.strikeAim = { name: 'musslan mot botten', kind: 'holdable', verb: 'slå', strike: true, toggle: () => this.strike() };
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
  aimed(reach = C.reach) {
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
    if (!this.hinted) { this.hinted = true; this.say?.(C.crack.hint); } // #1950: the first closed mussel in the hand says how it is opened
    return true;
  }
  /** A loose mussel went home: its spot has it again (when nothing has grown there meanwhile), the holdable is free. */
  returned(m) { if (m.spot) this.field?.restore(m.spot); m.vanish(); }

  /** Where a swimmer's held mussel can be put down on the bed along the look `ray` (main.js outdoorSpot's answer under water), or null. */
  bedSpot(ray, reach = C.reach) {
    const p = bedSpot(ray.origin, ray.direction, reach, swimBedY, swimWater);
    return p && { point: new THREE.Vector3(p.x, p.y, p.z), distance: Math.max(0.3, p.distance), outdoor: true };
  }

  /** #1950: the E target for the held `item` when the bed point `spot` ({ point, distance }, `bedSpot`) is aimed at: the knock, while the
   * mussel is closed and its holder dives with the bed within `crack.reach`; null otherwise (then E puts it down there as before). */
  strikeTarget(item, spot) {
    return item?.isMussel && item === this.held && !item.cracked && this.player.diving && spot && spot.distance <= C.crack.reach ? this.strikeAim : null;
  }
  /** E on the bed with a closed mussel: one knock ('knock'), the last one cracks it ('crack'); null when none lands (not diving, the bed
   * out of reach, too soon after the last one, already cracked, nothing held). Seen (the mussel strikes down) and heard (a dull knock). */
  strike() {
    const m = this.held; if (!m) return null;
    const K = C.crack, p = bedSpot(this.camera.getWorldPosition(V), this.camera.getWorldDirection(D), K.reach, swimBedY, swimWater);
    const r = strike(m, { diving: !!this.player.diving, bedDistance: p?.distance }, K);
    if (!r) return null;
    if (r === 'crack') m.crack();
    m.swing(); sfx.musselKnock(V.set(p.x, p.y, p.z), r === 'crack', K.swing.time * K.swing.at);
    return r;
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
  state() { return { spots: this.spots.length, drawn: this.mesh.count, visible: this.mesh.visible, out: this.field?.out.length ?? 0, loose: this.items.filter((x) => !x.broken).length, held: !!this.held, cracked: this.held?.cracked ?? null, hits: this.held?.hits ?? null }; }
}
