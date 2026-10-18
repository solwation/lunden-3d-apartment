import { REST, decodeAvatarLook, avatarProportions } from './config.js';
import { poseOlof, seatedPose } from './olof.js';

/** Actual rest spot, never the camera's eased position or the old standing location. */
export function restState(rest, code, seed) {
  if (!rest.active) return {};
  // Legacy default wire codes omit height; peers derive that scale from the accepted player id.
  // #1137: a chosen height scales the figure by its body scale (Avatar, rifleBoxPose), not the seed's tall.
  const lk = decodeAvatarLook(code, seed), tall = Number.isInteger(lk.height) ? avatarProportions(lk.height).body : lk.tall;
  const lie = rest.kind === 'lie', spot = rest.spot;
  const y = spot.pos.y - (lie ? REST.lieEye : REST.sitEye);
  // lying: the centre line sits at the spot's `bodyY` (under the duvet, #1234), else a little over the surface
  const root = lie ? (spot.bodyY ?? y + REST.avatarLieClearance * tall) - REST.avatarLieHip * tall : y - REST.avatarSeat * tall;
  return { p: [spot.pos.x, root, spot.pos.z],
    r: spot.yaw, c: false, pose: lie ? 2 : spot.legsUp ? 3 : 1 }; // 3: legs stretched out on the furniture (#1237)
}

/** Reuse the existing skeleton/IK; standing is restored by the ordinary Avatar.update each frame. */
export function applyRestPose(avatar, pose) {
  if (pose === 1) poseOlof(avatar, seatedPose(REST.avatarSeat));
  else if (pose === 3) {
    // long sit (#1237): the ordinary seated torso, the legs stretched out forwards resting on the seat / mattress
    const p = seatedPose(REST.avatarSeat), y = REST.avatarSeat + REST.avatarLegsUp, z = REST.avatarLegsReach;
    poseOlof(avatar, { ...p, feet: [[0.11, y, z], [-0.11, y, z]], knee: [0, 1, 0.1] });
  }
  else if (pose === 2) {
    const y = REST.avatarLieHip;
    // tilted up a little: the head on the pillows while the body lies under the cover (#1234)
    poseOlof(avatar, { hip: [y, 0], lean: Math.PI / 2 - REST.avatarLieTilt, feet: [[0.11, y - 0.11, 0.83], [-0.11, y - 0.11, 0.83]], knee: [0, 0.05, 1], // nearly straight legs: no knees poking up through the duvet
     
      hands: [1, -1].map(s => ({ at: [s * 0.22, y, -0.25], pole: [s, 0, 0] })), can: null });
  }
}
