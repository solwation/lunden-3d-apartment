import { AVATAR_MOTION as M, AVATAR_GAIT as G } from './config.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = u => { u = Math.max(0, Math.min(1, u)); return u * u * u * (10 + u * (-15 + 6 * u)); };
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const copy = (a, b) => { a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; };
function world(out, p, f, sc) {
  const c = Math.cos(f[2]), s = Math.sin(f[2]);
  out[0] = f[0] + sc * (p[0] * c + p[2] * s); out[1] = p[1]; out[2] = f[1] + sc * (-p[0] * s + p[2] * c); return out;
}
function local(out, p, f, sc) {
  const x = (p[0] - f[0]) / sc, z = (p[2] - f[1]) / sc, c = Math.cos(f[2]), s = Math.sin(f[2]);
  out[0] = x * c - z * s; out[1] = p[1]; out[2] = x * s + z * c;
}

/** #2004: visual foot targets only. The delivered distance gait still owns ordinary
 * walking/running. At rest, planted targets stay in the ground frame and the feet
 * return one at a time; a body turn lifts and reorients a foot instead of sliding it.
 * The caller supplies its existing rendered root/body frame, never a network field. */
export function groundMotion(av, dt, gt, frame, moving, enabled, fx, fy, fz) {
  if (!frame || !enabled) { av.groundMotion = null; return; }
  const sc = av.object.scale.z || 1, info = av.gaitInfo;
  let m = av.groundMotion;
  const jump = m && (Math.hypot(frame[0] - m.frame[0], frame[1] - m.frame[1]) > M.resetDistance || Math.abs(wrap(frame[2] - m.frame[2])) > M.resetTurn || dt > M.resetTime);
  if (!m || jump) {
    m = av.groundMotion = { frame: frame.slice(), feet: [[0, 0, 0], [0, 0, 0]], yaw: [frame[2], frame[2]], pitch: [0, 0],
      contact: [true, true], startSupport: [false, false], startOffset: [null, null], moving, mode: moving ? 'walk' : 'idle', step: -1, age: 0, startAge: M.startTime,
      from: [0, 0, 0], to: [0, 0, 0], fromYaw: 0, fromPitch: 0, duration: 0, next: 0, steps: 0, reset: !!jump };
    for (let i = 0; i < 2; i++) world(m.feet[i], gt.feet[i], frame, sc);
  }
  m.reset = !!jump;
  const neutral = (i, out) => world(out, [i ? -fx : fx, fy, fz], frame, sc);
  if (moving) {
    if (!m.moving) { m.startAge = 0; m.step = -1; m.startSupport[0] = m.contact[0]; m.startSupport[1] = m.contact[1]; m.startOffset.fill(null); }
    m.startAge += dt; m.mode = 'walk';
    for (let i = 0; i < 2; i++) {
      // During take-off the support foot keeps its previous ground anchor. The
      // next swing rejoins the existing gait, without delaying root motion.
      if (m.startSupport[i] && info.stance[i] >= 0 && distance(m.feet[i], neutral(i, m.to)) < M.startReach * sc) {
        local(gt.feet[i], m.feet[i], frame, sc); gt.pitch[i] = m.pitch[i]; info.contact[i] = true;
      } else {
        if (m.startSupport[i]) {
          local(m.from, m.feet[i], frame, sc);
          m.startOffset[i] = [...m.from.map((v,j) => v - gt.feet[i][j]), m.pitch[i] - gt.pitch[i], Math.max(0, info.swing[i])];
          m.startSupport[i] = false;
        }
        const offset = m.startOffset[i];
        if (offset && info.swing[i] >= 0) { const w = 1 - ease((info.swing[i] - offset[4]) / Math.max(.001, 1 - offset[4])); for (let j = 0; j < 3; j++) gt.feet[i][j] += offset[j] * w; gt.pitch[i] += offset[3] * w; }
        else if (offset) m.startOffset[i] = null;
      }
      world(m.feet[i], gt.feet[i], frame, sc);
      m.contact[i] = info.contact[i]; m.yaw[i] = frame[2]; m.pitch[i] = gt.pitch[i];
    }
  } else {
    if (m.moving) {
      m.mode = 'stop'; m.step = -1;
      // Finish the airborne foot first, then bring the other foot under the hip.
      m.next = !m.contact[0] ? 0 : !m.contact[1] ? 1 : 0;
    }
    if (m.step < 0) {
      let chosen = -1;
      for (let n = 0; n < 2; n++) {
        const i = (m.next + n) % 2; neutral(i, m.to);
        if (distance(m.feet[i], m.to) > M.settleDistance * sc || Math.abs(m.feet[i][1] - fy) > M.settleDistance || Math.abs(wrap(frame[2] - m.yaw[i])) > M.turnStep) { chosen = i; break; }
      }
      if (chosen >= 0) {
        m.step = chosen; m.age = 0; copy(m.from, m.feet[chosen]); neutral(chosen, m.to);
        m.fromYaw = m.yaw[chosen]; m.fromPitch = m.pitch[chosen];
        m.duration = M.stepTime + Math.min(M.stepExtra, distance(m.from, m.to) / sc * M.stepTravel);
        m.steps++; if (m.mode !== 'stop') m.mode = 'turn';
      } else m.mode = 'idle';
    }
    if (m.step >= 0) {
      const i = m.step; m.age += dt;
      const u = Math.min(1, m.age / m.duration), e = ease(u);
      // The landing target follows the current body only while this foot is up.
      neutral(i, m.to);
      for (let j = 0; j < 3; j++) m.feet[i][j] = m.from[j] + (m.to[j] - m.from[j]) * e;
      m.feet[i][1] += M.stepLift * Math.sin(Math.PI * u) ** 2;
      m.yaw[i] = m.fromYaw + wrap(frame[2] - m.fromYaw) * e;
      m.pitch[i] = m.fromPitch * (1 - e);
      if (u === 1) { m.step = -1; m.next = 1 - i; }
    }
    const yaw = gt.yaw ??= [0, 0];
    for (let i = 0; i < 2; i++) {
      local(gt.feet[i], m.feet[i], frame, sc);
      gt.pitch[i] = m.pitch[i]; yaw[i] = wrap(m.yaw[i] - frame[2]);
      const th = m.pitch[i], sh = G.shoe;
      const roll = Math.max(sh.sole * Math.cos(th) + sh.heel * Math.sin(th), sh.sole * Math.cos(th) - sh.toe * Math.sin(th)) - sh.sole;
      m.contact[i] = i !== m.step && m.feet[i][1] <= fy + roll + M.contactHeight;
      info.contact[i] = m.contact[i]; info.stance[i] = m.contact[i] ? 0.5 : -1;
      info.swing[i] = i === m.step ? Math.min(1, m.age / m.duration) : -1;
    }
    // No phase-dependent body bounce after stopping. Arms settle separately.
    gt.hip *= Math.exp(-M.settleEase * dt); gt.sway = 0;
  }
  if (moving && gt.yaw) gt.yaw.fill(0);
  m.moving = moving; copy(m.frame, frame);
  // `copy` above is also valid for the three-number [x,z,yaw] frame.
  info.motion = m.mode; info.adjustments = m.steps;
}

/** Copy a pose into reusable numeric storage. No bones are smoothed after IK. */
export function copyPose(out, p) {
  for (const k of ['lean', 'head', 'turn', 'flat', 'toes', 'hipX']) out[k] = p[k] ?? 0;
  for (const k of ['hip', 'knee', 'pitch', 'footYaw']) {
    if (!p[k]) { out[k] = null; continue; }
    const a = out[k] ??= []; for (let i = 0; i < p[k].length; i++) a[i] = p[k][i];
  }
  out.feet ??= [[0, 0, 0], [0, 0, 0]];
  out.hands ??= [{ at: [0, 0, 0], pole: [0, 0, 0] }, { at: [0, 0, 0], pole: [0, 0, 0] }];
  for (let i = 0; i < 2; i++) { copy(out.feet[i], p.feet[i]); copy(out.hands[i].at, p.hands[i].at); copy(out.hands[i].pole, p.hands[i].pole); }
  out.can = p.can; return out;
}

/** Transition only ordinary standing <-> seated targets in the destination seat
 * frame. Explicit lie/gym/bike/air poses bypass it. Root/colliders remain direct;
 * standing held-hand targets win immediately. Explicit rest/interaction hands keep their final authority. */
function reframePose(p, from, to) {
  const oldHipX = p.hipX, yaw = wrap(from[3] - to[3]), c = Math.cos(yaw), s = Math.sin(yaw);
  const point = a => {
    const x = (a[0] + oldHipX) * from[4], z = a[2] * from[4];
    const wx = from[0] + x * Math.cos(from[3]) + z * Math.sin(from[3]) - to[0];
    const wz = from[2] - x * Math.sin(from[3]) + z * Math.cos(from[3]) - to[2];
    return [(wx * Math.cos(to[3]) - wz * Math.sin(to[3])) / to[4], (from[1] + a[1] * from[5] - to[1]) / to[5], (wx * Math.sin(to[3]) + wz * Math.cos(to[3])) / to[4]];
  };
  const hip = point([0, p.hip[0], p.hip[1]]); p.hipX = hip[0]; p.hip[0] = hip[1]; p.hip[1] = hip[2];
  for (let i = 0; i < 2; i++) {
    for (const a of [p.feet[i], p.hands[i].at]) { const v = point(a); v[0] -= p.hipX; copy(a, v); }
    const pole = p.hands[i].pole, x = pole[0], z = pole[2]; pole[0] = c * x + s * z; pole[2] = -s * x + c * z;
  }
  p.footYaw ??= [0, 0]; p.footYaw[0] += yaw; p.footYaw[1] += yaw;
}
export function transitionPose(av, dt, key, hands = {}, frame = null, carry = false) {
  const target = av.pendingPose;
  if (!target) return;
  let s = av.poseMotion;
  if (!s) s = av.poseMotion = { key, age: M.poseTime, from: {}, last: {}, frame: frame?.slice() };
  const jumped = frame && s.frame && Math.hypot(frame[0] - s.frame[0], frame[1] - s.frame[1], frame[2] - s.frame[2]) > M.resetDistance;
  if (jumped) s.age = M.poseTime;
  const ordinary = k => k === 0 || k === 1;
  if (s.key !== key) {
    if (!jumped && ordinary(key) && ordinary(s.key) && s.last.feet) { copyPose(s.from, s.last); if (frame && s.frame) reframePose(s.from, s.frame, frame); s.age = 0; }
    else s.age = M.poseTime;
    s.key = key;
  }
  if (carry && ordinary(key) && frame && s.frame && s.last.feet && !jumped) {
    av.pendingPose = copyPose(s.out ??= {}, s.last); reframePose(av.pendingPose, s.frame, frame);
  } else if (s.age < M.poseTime) {
    s.age = Math.min(M.poseTime, s.age + dt);
    const e = ease(s.age / M.poseTime), p = copyPose(s.out ??= {}, target), a = s.from;
    for (const k of ['lean', 'head', 'turn', 'flat', 'toes', 'hipX']) p[k] = a[k] + (p[k] - a[k]) * e;
    p.lean -= M.poseLean * Math.sin(Math.PI * e);
    for (const k of ['pitch', 'footYaw']) { const a0 = a[k] ?? [0, 0], b0 = p[k] ?? [0, 0]; p[k] ??= [0, 0]; for (let i = 0; i < 2; i++) p[k][i] = a0[i] + (b0[i] - a0[i]) * e; }
    for (const k of ['hip', 'knee']) if (a[k] && p[k]) for (let j = 0; j < p[k].length; j++) p[k][j] = a[k][j] + (p[k][j] - a[k][j]) * e;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        p.feet[i][j] = a.feet[i][j] + (p.feet[i][j] - a.feet[i][j]) * e;
        for (const k of ['at', 'pole']) p.hands[i][k][j] = a.hands[i][k][j] + (p.hands[i][k][j] - a.hands[i][k][j]) * e;
      }
    }
    av.pendingPose = p;
  }
  for (const [i, side] of ['L', 'R'].entries()) if (key === 0 && hands[side]) { copy(av.pendingPose.hands[i].at, hands[side].at); copy(av.pendingPose.hands[i].pole, hands[side].pole); }
  copyPose(s.last, av.pendingPose);
  if (frame) { s.frame ??= []; for (let i = 0; i < frame.length; i++) s.frame[i] = frame[i]; }
}
