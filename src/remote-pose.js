import { restAnchor } from './rest.js';
import { REST, decodeAvatarLook, avatarProportions, avatarHeightCm, closedSeatFit } from './config.js';
import { poseOlof, seatedPose } from './olof.js';
import { reactionPose, mixHand } from './reactpose.js';

/** Actual rest spot, never the camera's eased position or the old standing location. */
export function restState(rest, code, seed) {
  if (!rest.active) return {};
  // Legacy default wire codes omit height; peers derive that scale from the accepted player id.
  // #1137: a chosen height scales the figure by its body scale (Avatar, rifleBoxPose), not the seed's tall.
  const lk = decodeAvatarLook(code, seed), tall = Number.isInteger(lk.height) ? avatarProportions(lk.height).body : lk.tall;
  if(rest.spot.gymPose||rest.spot.gymWirePose){const sp=rest.spot;return {p:sp.gymRoot.toArray(),r:sp.yaw,c:false,pose:sp.gymPose===5||sp.gymWirePose===7?2:0,gx:[sp.gymPose||sp.gymWirePose,sp.gymPhase],look:[Math.atan2(Math.sin(rest.camera.rotation.y-sp.yaw),Math.cos(rest.camera.rotation.y-sp.yaw)),rest.camera.rotation.x]};}
  const lie = rest.kind === 'lie', spot = rest.spot;
  // Keep the seat heading on the body; the camera supplies independent seated head angles.
  return { p: restAnchor(spot, lie, tall),
    r: spot.yaw, ...(!lie ? { look: [Math.atan2(Math.sin(rest.camera.rotation.y - spot.yaw), Math.cos(rest.camera.rotation.y - spot.yaw)), rest.camera.rotation.x] } : {}), c: false, pose: lie ? 2 : spot.legsUp ? 3 : 1, ...(!lie && !spot.legsUp && spot.closed ? { cs: 1 } : {}) }; // 3: legs stretched out on the furniture (#1237); cs (#2273): a car front seat, the PVP boxes take its fit
}

// #2269/#2273: the pure seat fit lives in config.js so the Worker's PVP boxes (rifleBoxPose) follow the same seat.
export { closedSeatFit };

/** #2269: closedSeatFit for an avatar look (its chosen height, else the seed's `tall` with an adult head, as restState). */
export function closedSeatFitLook(lk) {
  if (Number.isInteger(lk?.height)) { const p = avatarProportions(avatarHeightCm(lk)); return closedSeatFit(p.body, p.head); }
  return closedSeatFit(lk?.tall ?? 1, 1);
}

/** Reuse the existing skeleton/IK; standing is restored by the ordinary Avatar.update each frame. */
export function applyRestPose(avatar, pose, look = [0, 0], react = null, feet = null, fit = null) { // react: { kind, age } of a BIO reaction (#1639), seated only; feet: #2158 seatlegs.js's on the real floor; fit: #2269 closedSeatFit under a low roof (seated only)
  const gaze = { turn: Math.max(-REST.sit.yaw, Math.min(REST.sit.yaw, look[0])), head: Math.max(REST.sit.pitch[0], Math.min(REST.sit.pitch[1], look[1])) };
  if (pose === 1) {
    const fitted = fit && (fit.hip || fit.recline); // #2269: under a low roof the hips (and the hands on the thighs) sink and the torso reclines
    const fwd = fitted ? fit.fwd ?? 0 : 0, p = seatedPose(REST.avatarSeat - (fitted ? fit.hip : 0), { fwd }), r = react && reactionPose(react.kind, react.age, p.hip);
    if (feet) p.feet = fwd ? feet.map(([x, y, z]) => [x, y, z + fwd]) : feet; // #2158: the legs follow the real seat height (the hips stay); #2269 slid forward with the hips
    if (fitted) { p.lean += fit.recline; gaze.head -= fit.recline; } // (the head pitched back level: the gaze and the skull as before)
    if (r) poseOlof(avatar, { ...p, hip: [p.hip[0] + r.dy, p.hip[1]], lean: p.lean + r.lean, hands: p.hands.map((h, i) => mixHand(h, r.hands[i], r.amt)), ...gaze, head: gaze.head + r.head });
    else poseOlof(avatar, { ...p, ...gaze });
  }
  else if (pose === 3) {
    // long sit (#1237): the ordinary seated torso, the legs stretched out forwards resting on the seat / mattress
    const p = seatedPose(REST.avatarSeat), y = REST.avatarSeat + REST.avatarLegsUp, z = REST.avatarLegsReach;
    poseOlof(avatar, { ...p, ...gaze, feet: [[0.11, y, z], [-0.11, y, z]], knee: [0, 1, 0.1] });
  }
  else if (pose === 2) {
    const y = REST.avatarLieHip;
    // tilted up a little: the head on the pillows while the body lies under the cover (#1234)
    poseOlof(avatar, { hip: [y, 0], lean: Math.PI / 2 - REST.avatarLieTilt, feet: [[0.11, y - 0.03, 0.83], [-0.11, y - 0.03, 0.83]], knee: [0, 0.05, 1], // nearly straight legs: no knees poking up through the duvet
     
      hands: [1, -1].map(s => ({ at: [s * 0.22, y, -0.25], pole: [s, 0, 0] })), can: null });
  }
}
