import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HARPOON as H, RIVER_FISH } from './config.js';
import { newSpear, fireSpear, stepSpear, stickSpear, recallSpear, reelSpear, spearHit } from './harpoonflight.js';
import { Holdable } from './holdable.js';
import { solidHit } from './bow.js';
import { caughtFishGeometry } from './caughtfish.js';
import { waterYAt } from './riverbridge.js';
import { swimWater } from './farwalk.js';
import { sfx } from './audio.js';

// #1953: the harpoon gun, for hunting fish under water. It lies in a cushion box on the south shore of Höje å, at the downstream end
// of the swimmable river (patio.js `dynbox` with `inside: 'harpoon'`, FURNITURE); seen and taken only while the lid is open, E on the
// empty box puts it back (as the bow, src/bow.js). A click / the touch action button shoots the spear, also under water (diving); it
// is tied to the gun with a line, so it turns back after HARPOON.line m (or from whatever solid thing it meets) and is reeled in
// before the next shot (the rules: src/harpoonflight.js).
// Only fish count. A river fish it meets (src/riverfish.js) is a catch like a hooked one: the room decides, the fish comes back on
// the spear and is laid on the bank (a swimmer) or at your feet, and it counts in the statistics and the bestiary like a fish caught
// with the rod (Fishing.spear / landSpeared). The shark, too: the shared weekly one (#1769: the room's record, its body on the bank,
// the fin) and the one that attacks swimmers (#1947: the attack ends, the fin). Nothing else can be hit: other players, the cats,
// Olof, the squirrels and the ducks are never tested, the spear is no weapon in a fight (no `shoots` / `hitsTarget`, no weapon
// key) and it leaves no mark. The other players do not see the spear fly (local, like the fishing float's bite).
// Draw calls: the gun (1), the spear (1), the line while the spear is out (1), a fish on the spear on the way back (1).

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
const fishMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

/** The gun in its own frame: the barrel along z (the muzzle at −z), the pistol grip under the origin. */
export function harpoonGeometry() {
  const parts = [];
  parts.push(paint(new THREE.CylinderGeometry(0.016, 0.016, 0.7, 10).rotateX(Math.PI / 2).translate(0, 0, -0.25), 0x23262b)); // the barrel
  parts.push(paint(new THREE.BoxGeometry(0.046, 0.042, 0.06).translate(0, 0.004, -0.6), 0xe0b020)); // the muzzle head
  parts.push(paint(new THREE.CylinderGeometry(0.022, 0.02, 0.05, 10).rotateX(Math.PI / 2).translate(0, 0, 0.125), 0x15171a)); // the butt pad
  parts.push(paint(new THREE.BoxGeometry(0.034, 0.12, 0.046).rotateX(0.3).translate(0, -0.07, 0.085), 0x15171a)); // the pistol grip
  parts.push(paint(new THREE.BoxGeometry(0.03, 0.03, 0.1).translate(0, -0.018, 0.02), 0x23262b)); // the trigger housing
  parts.push(paint(new THREE.BoxGeometry(0.006, 0.03, 0.008).rotateX(-0.3).translate(0, -0.045, 0.03), 0xaab0b6)); // the trigger
  for (const x of [-0.024, 0.024]) parts.push(paint(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 6).rotateX(Math.PI / 2).translate(x, 0.012, -0.39), 0xb5651d)); // the rubber bands
  parts.push(paint(new THREE.CylinderGeometry(0.032, 0.032, 0.022, 12).rotateZ(Math.PI / 2).translate(0, -0.045, -0.12), 0xd9d6c8)); // the line reel
  return mergeGeometries(parts);
}
/** The spear along +z, its tail at the origin: a steel shaft, a point with a barb. */
export function spearGeometry() {
  const L = H.spear, parts = [];
  parts.push(paint(new THREE.CylinderGeometry(0.004, 0.004, L - 0.05, 6).rotateX(Math.PI / 2).translate(0, 0, (L - 0.05) / 2), 0xaab0b6));
  parts.push(paint(new THREE.ConeGeometry(0.009, 0.06, 6).rotateX(Math.PI / 2).translate(0, 0, L - 0.03), 0x8d9196));
  parts.push(paint(new THREE.BoxGeometry(0.002, 0.012, 0.05).rotateX(0.25).translate(0, -0.009, L - 0.085), 0x8d9196)); // the barb
  return mergeGeometries(parts);
}
const MUZZLE = new THREE.Vector3(0, 0.026, -0.6), SPEAR_HOME = new THREE.Vector3(0, 0.026, 0.05);
const NONE = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };
const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), M = new THREE.Vector3(), TIP0 = new THREE.Vector3(), TIP1 = new THREE.Vector3();

export class Harpoon extends Holdable {
  /** box: the cushion box's group (patio.js dynbox with `userData.box`); riverFish: RiverFish or null (&nofish); fishing: the Fishing
   *  (the catch); player; say(text): the badge. `sharkHunt` (src/sharkhunt.js) is set by main.js once it exists. */
  constructor(scene, camera, box, { riverFish = null, fishing = null, player = null, say = () => {} } = {}) {
    const model = new THREE.Group();
    const body = new THREE.Mesh(harpoonGeometry(), vmat);
    body.castShadow = true;
    model.add(body);
    const spear = new THREE.Mesh(spearGeometry(), vmat);
    spear.raycast = () => {}; spear.userData.noDetail = true;
    model.add(spear);
    const line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage)),
      new THREE.LineBasicMaterial({ color: 0xf2f0e2 }));
    line.name = 'harpoon-line'; line.visible = false; line.frustumCulled = false; line.raycast = () => {}; line.userData.noDetail = true;
    scene.add(line);
    const info = box.userData.box;
    box.updateWorldMatrix(true, true);
    // lying flat in the box, along it, on the bottom (box frame: x along, y up, z front): on its side, the muzzle towards one end
    const at = (x, y, z) => box.localToWorld(new THREE.Vector3(x, y, z));
    const qHome = box.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2, 'YXZ')));
    super(scene, camera, {
      name: 'harpungeväret', verb: 'ta', backName: 'dynboxen', backVerb: 'lägga tillbaka harpungeväret i', model,
      home: { pos: at(-0.22, 0.1, 0.02), rot: new THREE.Euler().setFromQuaternion(qHome) },
      heldPose: { pos: new THREE.Vector3(H.held.x, H.held.y, H.held.z), rot: new THREE.Euler(0, 0, 0) },
      pick: { pos: at(0, info.hb * 0.6, 0), size: [info.L * 0.9, info.hb, info.D * 0.8] },
      cooldown: 0, useLabel: 'Skjut', grip: H.grip,
    });
    Object.assign(this, { isHarpoon: true, clickIsUse: true, box: info, spear, line, riverFish, fishing, player, say, sharkHunt: null,
      st: newSpear(), catch: null, carried: null, wait: 0, shots: 0, hits: 0, ray: new THREE.Raycaster(), targets: [] });
    this.dock();
  }

  get lidOpen() { return this.box.lid.t > 0.02; }
  /** Only while the lid is open can it be seen and taken; put back, it lies in the box again. */
  get target() {
    if (this.held) return this.backTarget;
    return this.lidOpen || this.placed ? this.takeTarget : NONE;
  }
  idle() { this.model.visible = this.placed || this.lidOpen; }
  onTake() { this.model.visible = true; sfx.click?.(this.where()); }
  onPut() { this.abort(); }

  /** The spear back on the gun (its mesh a child of the model again), the line and whatever it carried gone. */
  dock() {
    this.model.add(this.spear);
    this.spear.position.copy(SPEAR_HOME); this.spear.rotation.set(0, Math.PI, 0); this.spear.scale.setScalar(1);
    this.line.visible = false;
    if (this.carried) { this.carried.removeFromParent(); this.carried = null; }
  }
  /** Put away / stowed with the spear out: it is simply back (a catch still waiting for the room is given up). */
  abort() {
    if (this.st.phase !== 'ready') { this.st = newSpear(); this.dock(); }
    if (this.catch) { const c = this.catch; this.catch = null; if (c.kind !== 'hunter' && c.ok === null) this.fishing?.giveUpSpear(); }
  }
  muzzle(out = M) { this.model.updateWorldMatrix(true, false); return this.model.localToWorld(out.copy(MUZZLE)); }

  /** Mouse button / touch action button down → shoot (main.js, as the bow). */
  trigger(on) { if (on) this.shoot(); }
  /** A click / tap that came without a press (keyboard, the touch button's click after its press). */
  use() { if (performance.now() - (this.firedAt ?? -1e9) > 400) this.shoot(); }

  /** Shoot the spear along the view. False while it is out, on its way back or a catch is being decided. */
  shoot() {
    if (!this.held || this.st.phase !== 'ready' || this.catch) return false;
    const cam = this.camera, o = cam.getWorldPosition(A), d = cam.getWorldDirection(D);
    o.addScaledVector(d, 0.35).y -= 0.1; // from in front of the eye, where the muzzle is
    if (!fireSpear(this.st, [o.x, o.y, o.z], [d.x, d.y, d.z])) return false;
    this.firedAt = performance.now(); this.shots++;
    this.scene.add(this.spear);
    this.spear.position.copy(o); this.spear.lookAt(B.copy(o).add(d));
    this.line.visible = true;
    sfx.thwip?.(o);
    if (this.wet(o)) sfx.bubbles?.(3, 0.5);
    return true;
  }
  /** Is world point `p` under the river's surface? */
  wet(p) { return swimWater(p.x, p.z) && p.y < waterYAt(p.x, p.z); }

  /** What the spear may hit now: the river's fish (where they are; seen from above the water also where they are drawn, just over the
   * surface) and the sharks' fins. [{ x, y, z, r, fish? | shark? | hunter? }]. */
  collect() {
    const list = this.targets; list.length = 0;
    const rf = this.riverFish;
    if (!rf) return list;
    const under = this.wet(this.camera.getWorldPosition(A));
    for (const f of rf.shown) {
      const len = RIVER_FISH.species.find((s) => s.name === f.species)?.len ?? 0.3, r = H.hit.fish + H.hit.len * len;
      const x = f.x + (f.off?.[0] ?? 0) + (f.school?.[0] ?? 0), z = f.z + (f.off?.[2] ?? 0) + (f.school?.[2] ?? 0); // (#2130: where its school draws it)
      list.push({ x, y: f.y + (f.off?.[1] ?? 0) + (f.school?.[1] ?? 0), z, r, fish: f });
      if (!under) list.push({ x, y: f.drawnY, z, r, fish: f });
    }
    const p = this.st;
    for (const s of rf.shark?.near(p.x, p.z, H.line + H.hit.shark) ?? []) list.push({ x: s.x, y: waterYAt(s.x, s.z) - 0.3, z: s.z, r: H.hit.shark, shark: true });
    const h = this.sharkHunt?.target();
    if (h) list.push({ x: h.x, y: h.y - 0.3, z: h.z, r: H.hit.shark, hunter: true });
    return list;
  }

  /** The spear met target `t` (from `collect`). */
  strike(t) {
    this.hits++;
    recallSpear(this.st);
    if (t.hunter) { if (this.sharkHunt.harpooned()) this.catch = { kind: 'hunter', ok: true }; return; }
    const c = this.catch = { kind: t.shark ? 'shark' : 'fish', ok: null, b: null };
    const asked = this.fishing?.spear(t.shark ? { shark: true } : { id: t.fish.id, born: t.fish.born, species: t.fish.species }, (ok, b) => { c.ok = ok; c.b = b; });
    if (!asked) { this.catch = null; return; }
    if (!t.shark && c.ok !== false) { // the fish comes back on the spear
      const spec = RIVER_FISH.species.find((s) => s.name === t.fish.species) ?? RIVER_FISH.species[0], L = spec.len;
      const m = new THREE.Mesh(caughtFishGeometry(spec.name), fishMat);
      m.scale.setScalar(L); m.position.set(0, 0, H.spear - 0.12); m.rotation.set(0, Math.PI / 2, 0.5);
      m.raycast = () => {}; m.userData.noDetail = true;
      this.spear.add(m); this.carried = m;
    }
    sfx.splash?.(this.spear.position);
  }

  /** The spear is back in the gun: what it brought. */
  landed() {
    const c = this.catch;
    this.dock();
    if (!c) return;
    if (c.ok === null) { this.wait = H.verdict; return; } // the room has not answered yet
    this.catch = null;
    if (c.kind === 'hunter') this.fishing?.landSpearedShark();
    else if (!c.ok) this.say(c.kind === 'shark' ? 'Hajen slet sig från harpunen!' : 'Fisken slet sig från harpunen');
    else if (c.kind === 'shark') this.fishing.landSpearedShark(c.b.spot);
    else this.fishing.landSpeared(c.b);
  }

  /** Per frame (main.js), held or not. */
  step(dt) {
    const st = this.st;
    if (!this.held) { if (st.phase !== 'ready' || this.catch) this.abort(); return; }
    if (st.phase === 'ready') {
      if (this.catch) { // back, waiting for the room's verdict
        this.wait -= dt;
        if (this.catch.ok !== null) this.landed(); else if (this.wait <= 0) { this.fishing?.giveUpSpear(); this.landed(); }
      }
      return;
    }
    const m = this.muzzle();
    if (st.phase === 'out') {
      const dir = D.set(st.vx, st.vy, st.vz).normalize();
      TIP0.set(st.x, st.y, st.z).addScaledVector(dir, H.spear);
      const ev = stepSpear(st, dt, m, this.wet(A.set(st.x, st.y, st.z)));
      dir.set(st.vx, st.vy, st.vz).normalize();
      TIP1.set(st.x, st.y, st.z).addScaledVector(dir, H.spear);
      const list = this.collect(), hit = spearHit(TIP0, TIP1, list), solid = solidHit(this.scene, this.camera, this.ray, TIP0, TIP1, (o) => o.name === 'bridges-water' || o === this.model);
      let kSolid = solid ? solid.distance / Math.max(1e-6, TIP0.distanceTo(TIP1)) : Infinity, at = solid?.point ?? null;
      // the terrain and the river's bed (not ray-tested out here): the point went under the ground this step
      const g1 = this.player ? this.player.groundAt(TIP1.x, TIP1.z, Math.max(TIP0.y, TIP1.y) + 0.3) : -Infinity;
      if (Number.isFinite(g1) && TIP1.y < g1) {
        const g0 = this.player.groundAt(TIP0.x, TIP0.z, TIP0.y + 0.3), a0 = TIP0.y - (Number.isFinite(g0) ? g0 : g1), a1 = g1 - TIP1.y, k = a0 > 0 ? a0 / (a0 + a1) : 0;
        if (k < kSolid) { kSolid = k; at = A.copy(TIP0).lerp(TIP1, k).clone(); }
      }
      if (hit && hit.k <= kSolid) {
        this.strike(list[hit.i]); // (a hit in the line's last step still counts: the spear is on its way back either way)
      } else if (at) {
        if (ev === 'taut') st.phase = 'out'; // (it met the ground in the line's last step: it still sticks)
        stickSpear(st, B.copy(at).addScaledVector(dir, 0.05 - H.spear));
        sfx.splat?.(at);
      }
      this.spear.position.set(st.x, st.y, st.z); this.spear.lookAt(B.set(st.x, st.y, st.z).add(dir));
    } else {
      const back = reelSpear(st, dt, m);
      if (back) { this.landed(); return; }
      this.spear.position.set(st.x, st.y, st.z);
      if (st.phase === 'back') this.spear.lookAt(B.set(st.x, st.y, st.z).multiplyScalar(2).sub(m)); // its point away from the gun
    }
    const p = this.line.geometry.attributes.position;
    p.setXYZ(0, m.x, m.y, m.z); p.setXYZ(1, st.x, st.y, st.z); p.needsUpdate = true;
  }

  debug() { return { phase: this.st.phase, p: [this.st.x, this.st.y, this.st.z], shots: this.shots, hits: this.hits, catch: this.catch && { kind: this.catch.kind, ok: this.catch.ok }, carried: !!this.carried, line: this.line.visible }; }
}
