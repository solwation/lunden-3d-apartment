// #2017: other players' avatars take no shadow-map shadow, so the scene lights (sun, sky, ambient: those the PLAYER stands in)
// light every avatar as if it stood in the open. A cheap light probe per avatar fixes the level: the zone it stands in (open sun,
// open shade, a room, the stairwell, the garage, the playroom) gives a local light level, the scene lights give what they deliver
// now, and the ratio becomes one uniform (`uLight`) on the avatar's own material. No light, no extra draw call, no raycast.
// Pure functions first (tools/avatarlighttest.cjs), then the per-ghost sampler `AvatarLight` used by Ghosts.
import { AVATAR_LIGHT as C } from './config.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** What the scene lights deliver now as a fraction of a clear sunlit day (`lights` = { hemi, ambient, fill, sun }, `.intensity`). */
export function sceneLevel(lights) {
  if (!lights) return 1;
  const s = lights.hemi.intensity + lights.ambient.intensity + (lights.fill?.intensity ?? 0) + C.sunShare * lights.sun.intensity;
  return clamp(s / C.reference, 0, 2);
}

/** The local light level of a zone, same unit as `sceneLevel` (1 = clear sunlit open ground).
 * zone: { kind: 'outdoors' | 'room' | 'core' | 'garage' | 'playroom', shade, lit } (`lit`: a lamp / the room's own light is on, 0..1);
 * env: { day (0..1), overcast (0..1) }. */
export function zoneLevel(zone, env) {
  const day = clamp(env.day ?? 0, 0, 1), oc = clamp(env.overcast ?? 0, 0, 1), L = C.level;
  const sky = day * (1 - L.overcastCut * oc), night = L.night * (1 - day);
  switch (zone?.kind) {
    case 'room': return L.windowShare * sky + L.lamp * (zone.lit ?? 0) + night;
    case 'core': return L.coreBase + L.coreDay * day;
    case 'garage': return L.garage;
    case 'playroom': return L.playroom * (zone.lit ?? 1);
    default: return (zone?.shade ? L.shade : 1) * sky + night;
  }
}

/** The uniform: the zone's level over the scene lights' level, bounded; 1 = unchanged. */
export function lightFactor(zone, env, scene) {
  return clamp(zoneLevel(zone, env) / Math.max(scene, C.minScene), C.min, C.max);
}

/** Exponential approach of `cur` to `target` over ~C.tau seconds (frame-rate independent); snaps without a previous value. */
export function approach(cur, target, dt) {
  if (cur === undefined || cur === null || !(dt > 0)) return target;
  return cur + (target - cur) * (1 - Math.exp(-dt / C.tau));
}

/** The per-avatar sampler. main.js sets `zone(x, y, z) -> zone`, `env() -> { day, overcast }` and `lights`. */
export class AvatarLight {
  constructor() { this.zone = null; this.env = null; this.lights = null; }

  /** Set `avatar`'s light for a figure standing at (x, y, z). `st` (an object kept per figure) holds the smoothed value and the cached
   * zone; the zone is re-probed every C.probe s, the factor eased every call. Returns the factor. */
  apply(avatar, st, x, y, z, now) {
    if (!this.zone || !this.env) return 1;
    if (!st.zone || now - st.probeAt >= C.probe * 1000 || Math.hypot(x - st.x, z - st.z) > 3) { st.zone = this.zone(x, y, z); st.probeAt = now; st.x = x; st.z = z; }
    const env = this.env(), target = lightFactor(st.zone, env, sceneLevel(this.lights));
    const dt = st.at === undefined ? 0 : Math.min(1, (now - st.at) / 1000);
    st.at = now; st.f = approach(st.f, target, dt);
    avatar.setLight(st.f);
    avatar.setEyeLight?.(st.zone, env); // #2033: the pupils and the eyes' sun glint (src/avatareyes.js)
    return st.f;
  }
}
