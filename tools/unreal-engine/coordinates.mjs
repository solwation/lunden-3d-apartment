// Web ↔ Unreal coordinate conversion for the shared data contract (#2245, docs/development/unreal.md "Axes and units").
// Pure functions, no dependencies: used by tools/unreal-engine/export-world.mjs (measurement data) and tools/unreal-engine/coordinatestest.mjs.
//
// Web / plan (src/, data/plan.json): metres, right-handed, x = east, y = up, z = south (north = −z).
// Unreal: centimetres, left-handed, X forward, Y right, Z up.
// TARGET mapping (a pure renaming of axes, no mirroring of the world): Unreal X = 100·x (east), Unreal Y = 100·z (south),
// Unreal Z = 100·y (up). Swapping two axes turns the right-handed web frame into Unreal's left-handed one, so a plan
// seen from above keeps its orientation: north (−z) is Unreal −Y, east is Unreal +X.
//
// ASSUMPTION (verified in phase B, #2245): how Unreal's Interchange glTF import itself remaps glTF axes. The GLB
// files keep the web axes (glTF is metres, right-handed, +Y up like the web); the importer measures where the
// fixture markers land and corrects the root transform so the result equals the target mapping above.

export const CM_PER_M = 100;

/** Web point [x, y, z] (m) → Unreal [X, Y, Z] (cm). */
export function webToUnreal([x, y, z]) {
  return [x * CM_PER_M, z * CM_PER_M, y * CM_PER_M];
}

/** Unreal [X, Y, Z] (cm) → web [x, y, z] (m). */
export function unrealToWeb([X, Y, Z]) {
  return [X / CM_PER_M, Z / CM_PER_M, Y / CM_PER_M];
}

/** A plan point (x, z) at height y (m) → Unreal [X, Y, Z] (cm). */
export function planToUnreal(x, z, y = 0) {
  return webToUnreal([x, y, z]);
}

/** Angle in degrees normalised to (−180, 180]. */
export function normDeg(a) {
  let d = ((a % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d === -0 ? 0 : d;
}

/** The web camera's horizontal view direction for `?at=` yawDeg, as plan [x, z]. src/player.js `spawn` sets
 *  camera.rotation.y = yaw (order YXZ); a three.js camera looks down its local −z, so forward = (−sin yaw, −cos yaw):
 *  0 = north (−z), 90 = west (−x), 180 = south (+z), −90 = east (+x) (docs/development/local-development.md). */
export function webForward(yawDeg) {
  const r = (yawDeg * Math.PI) / 180;
  return [-Math.sin(r), -Math.cos(r)];
}

/** Unreal's view direction for a yaw (FRotator.Yaw, degrees) as [X, Y]: 0 = +X, 90 = +Y. */
export function unrealForward(unrealYawDeg) {
  const r = (unrealYawDeg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

/** Web `?at=`/START yawDeg → Unreal yaw (degrees, (−180, 180]): north 0 → −90, west 90 → 180, south 180 → 90,
 *  east −90 → 0. Derivation: Unreal (X, Y) = (x, z) = (−sin yaw, −cos yaw) = (cos ψ, sin ψ) ⇒ ψ = −90° − yaw.
 *  The map is its own inverse (see unrealYawToWebYaw). Turning right is a smaller web yaw and a larger Unreal yaw. */
export function webYawToUnrealYaw(yawDeg) {
  return normDeg(-90 - yawDeg);
}

/** Unreal yaw → web yawDeg (the same formula: ψ = −90 − yaw ⇔ yaw = −90 − ψ). */
export function unrealYawToWebYaw(unrealYawDeg) {
  return normDeg(-90 - unrealYawDeg);
}

/** Web pitchDeg (camera.rotation.x; positive looks up) → Unreal pitch (positive looks up): unchanged. */
export function webPitchToUnrealPitch(pitchDeg) {
  return pitchDeg;
}

/** An object's rotation.y (radians, about web +Y) → the Unreal yaw (degrees) of the direction its local +z axis points
 *  to. three.js turns local +z to (sin a, cos a) in plan (x, z) — e.g. src/doors.js SwingDoor leaves run from the hinge
 *  along (sin angle, cos angle) — so ψ = atan2(cos a, sin a) = 90° − a. A rotation delta of +a about web +Y is a Unreal
 *  yaw delta of −a (the axis swap flips the sense of rotation). */
export function webRotationYToUnrealYaw(radians) {
  return normDeg(90 - (radians * 180) / Math.PI);
}

/** A plan rectangle {x0, x1, z0, z1} (m) → Unreal {x0, x1, y0, y1} (cm). */
export function rectToUnreal({ x0, x1, z0, z1 }) {
  return { x0: x0 * CM_PER_M, x1: x1 * CM_PER_M, y0: z0 * CM_PER_M, y1: z1 * CM_PER_M };
}

/** Rounded to 0.01 cm (0.1 mm) for stable JSON output. */
export function roundCm(v) {
  return Math.round(v * 100) / 100 + 0; // (+0 turns −0 into 0)
}

/** webToUnreal with every component rounded (stable JSON). */
export function webToUnrealRounded(p) {
  return webToUnreal(p).map(roundCm);
}
