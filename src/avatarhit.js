// #2036: the body flinches when a Nerf dart (or any other player's shot) hits it. Pure helpers (no three.js import; numbers AVATAR_HIT in
// config.js). A hit gives a short directional kick to six bone-local angles - the torso's and the head's pitch / roll / yaw - each an
// under-damped spring's response to an impulse, so it snaps, overshoots once and settles to exactly zero within AVATAR_HIT.fade[1] s.
// The offsets are applied on top of the finished pose (olof.js poseOlof calls `fig.hitFx.apply`), so they move only the rendered bones:
// the head boxes (#974, config.js) and the pick body follow the network state, and the camera never reads the bones.
// The existing room events drive it with no new network field: `hit` on the shooter's client (the target's Ghost), `hurt` on the
// target's client (our mirror image). Other onlookers get no hit event, so they see no flinch.
import { AVATAR_HIT as H } from './config.js';

const TAU = Math.PI * 2;
const W = H.hz * TAU, WD = W * Math.sqrt(1 - H.zeta * H.zeta), DECAY = H.zeta * W;
const T_PEAK = Math.atan2(WD, DECAY) / WD, PEAK = Math.exp(-DECAY * T_PEAK) * Math.sin(WD * T_PEAK);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** The response to one hit `s` seconds after it, peak 1 (at about 0.1 s), one overshoot of about -0.37, exactly 0 from fade[1] s on. */
export function hitResponse(s) {
  if (!(s > 0) || s >= H.fade[1]) return 0;
  return Math.exp(-DECAY * s) * Math.sin(WD * s) / PEAK * (1 - smooth((s - H.fade[0]) / (H.fade[1] - H.fade[0])));
}

/** The figure-frame direction a shot travels in ([x its left, z forward], unit): from `from` to `to` (world points / [x, z]),
 * for a figure whose skeleton frame is turned `yaw` about world y (Avatar.object's world yaw; it faces its local +z). */
export function hitDir(from, to, yaw) {
  const wx = (to.x ?? to[0]) - (from.x ?? from[0]), wz = (to.z ?? to[1]) - (from.z ?? from[1]), c = Math.cos(yaw), s = Math.sin(yaw);
  const x = wx * c - wz * s, z = wx * s + wz * c, n = Math.hypot(x, z);
  return n > 1e-6 ? [x / n, z / n] : [0, -1]; // (on top of each other: a hit from the front)
}

/** The peak offsets [torso pitch, roll, yaw, head pitch, roll, yaw] (rad) and the delayed part's flags for a hit travelling along `dir`
 * (figure frame, see hitDir) on the head (`head`) or the body. f > 0: from the front (pushes back); s > 0: pushes towards its left. */
export function hitKick(dir, head) {
  const f = -dir[1], s = dir[0];
  if (head) { const K = H.head; return { amp: [-K.torso * f, -K.torso * s, 0, -K.pitch * f, -K.roll * s, K.yaw * s], late: [1, 1, 1, 0, 0, 0] }; }
  const K = H.body;
  return { amp: [f > 0 ? K.fold * f : -K.push * f, -K.roll * s, -K.yaw * s, f > 0 ? -K.head * f : K.whip * f, K.head * s, 0], late: [0, 0, 0, 1, 1, 1] };
}

const q = [0, 0, 0, 1], r = [0, 0, 0, 1];
/** bone.quaternion = bone.quaternion * Ry(yaw) * Rx(pitch) * Rz(roll) (a turn in the bone's own frame). */
function turn(quat, pitch, roll, yaw) {
  if (!pitch && !roll && !yaw) return;
  const cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2), cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cz = Math.cos(roll / 2), sz = Math.sin(roll / 2);
  // Ry * Rx
  q[0] = cy * sx; q[1] = sy * cx; q[2] = -sy * sx; q[3] = cy * cx;
  // (Ry * Rx) * Rz
  r[0] = q[0] * cz + q[1] * sz; r[1] = q[1] * cz - q[0] * sz; r[2] = q[2] * cz + q[3] * sz; r[3] = q[3] * cz - q[2] * sz;
  const ax = quat.x, ay = quat.y, az = quat.z, aw = quat.w;
  quat.set(ax * r[3] + aw * r[0] + ay * r[2] - az * r[1], ay * r[3] + aw * r[1] + az * r[0] - ax * r[2], az * r[3] + aw * r[2] + ax * r[1] - ay * r[0], aw * r[3] - ax * r[0] - ay * r[1] - az * r[2]);
}

/** One avatar's flinches. `clock()` gives ms (performance.now by default; a component page drives its own). */
export class HitFx {
  constructor(clock = () => performance.now()) { this.clock = clock; this.kicks = []; this.off = [0, 0, 0, 0, 0, 0]; }

  /** A hit travelling along `dir` (figure frame) on the head or the body, now. */
  kick(dir, head, now = this.clock()) {
    this.kicks.push({ t: now, ...hitKick(dir, head) });
    if (this.kicks.length > H.kicks) this.kicks.shift();
  }

  /** The six offsets (rad) at `now`; drops the kicks that are over. All 0 when none plays. */
  offsets(now = this.clock()) {
    const o = this.off; o.fill(0);
    this.kicks = this.kicks.filter((k) => (now - k.t) / 1000 < H.fade[1] + H.lag);
    for (const k of this.kicks) {
      const s = (now - k.t) / 1000, a = hitResponse(s), b = hitResponse(s - H.lag);
      for (let i = 0; i < 6; i++) o[i] += k.amp[i] * (k.late[i] ? b : a);
    }
    for (let i = 0; i < 6; i++) o[i] = Math.max(-H.max, Math.min(H.max, o[i]));
    return o;
  }

  get active() { return this.kicks.length > 0; }

  /** On top of the finished pose (poseOlof): turns the torso (the arms and the head go with it) and the head. */
  apply(B, now = this.clock()) {
    if (!this.kicks.length || !B?.torso || !B.head) return;
    const o = this.offsets(now);
    turn(B.torso.quaternion, o[0], o[1], o[2]);
    turn(B.head.quaternion, o[3], o[4], o[5]);
  }
}

/** `avatar` was hit by a shot from `from` (world point) while standing at `at`, its skeleton turned `yaw` about world y; `head`: a head hit. */
export function flinch(avatar, from, at, yaw, head) {
  if (!avatar || !from || !at || !Number.isFinite(yaw)) return;
  (avatar.hitFx ??= new HitFx()).kick(hitDir(from, at, yaw), !!head);
}

/** The shooter's client (combat.js `hit`): the target's Ghost `g` flinches away from us at `from`. */
export function flinchGhost(g, from, head) {
  if (g?.avatar && g.root) flinch(g.avatar, from, g.root.position, g.root.rotation.y + g.avatar.object.rotation.y, head);
}

/** The target's client (combat.js `hurt`): our own mirror image flinches away from the shooter's Ghost `by` (a front hit if unknown). */
export function flinchSelf(ghosts, by, head) {
  const m = ghosts?.mine;
  if (!m?.p || !ghosts.selfGhost) return;
  const yaw = m.r + Math.PI, from = by?.root?.position ?? { x: m.p.x + Math.sin(yaw), z: m.p.z + Math.cos(yaw) }; // (the skeleton faces m.r + π)
  flinch(ghosts.selfGhost().avatar, from, m.p, yaw, head);
}
