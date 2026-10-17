import { REST, decodeAvatarLook } from './config.js';
import { poseOlof, seatedPose } from './olof.js';

/** Actual rest spot, never the camera's eased position or the old standing location. */
export function restState(rest, code, seed) {
  if (!rest.active) return {};
  // Legacy default wire codes omit height; peers derive that scale from the accepted player id.
  const tall = decodeAvatarLook(code, seed).tall;
  const lie = rest.kind === 'lie', spot = rest.spot;
  const y = spot.pos.y - (lie ? REST.lieEye : REST.sitEye);
  return { p: [spot.pos.x, y - (lie ? REST.avatarLieHip - REST.avatarLieClearance : REST.avatarSeat) * tall, spot.pos.z],
    r: spot.yaw, c: false, pose: lie ? 2 : 1 };
}

/** Reuse the existing skeleton/IK; standing is restored by the ordinary Avatar.update each frame. */
export function applyRestPose(avatar, pose) {
  if (pose === 1) poseOlof(avatar, seatedPose(REST.avatarSeat));
  else if (pose === 2) {
    const y = REST.avatarLieHip;
    poseOlof(avatar, { hip: [y, 0], lean: Math.PI / 2, feet: [[0.11, y, 0.8], [-0.11, y, 0.8]],
      hands: [1, -1].map(s => ({ at: [s * 0.22, y, -0.25], pole: [s, 0, 0] })), can: null });
  }
}
