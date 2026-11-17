// #2017: other players' avatars take no shadow-map shadow, so the scene lights (sun, sky, ambient: those the PLAYER stands in)
// light every avatar as if it stood in the open. A cheap light probe per avatar fixes the level: the zone it stands in (open sun,
// open shade, a room, the stairwell, the garage, the playroom) gives a local light level, the scene lights give what they deliver
// now, and the ratio becomes one uniform (`uLight`) on the avatar's own material. No light, no extra draw call, no raycast.
// Pure functions first (tools/avatarlighttest.cjs), then the per-ghost sampler `AvatarLight` used by Ghosts.
// #2039: outdoors at night the lit street / path / road lamps and the courtyard's bollards add their own warm light: `lampLight` sums
// how much of the nearby lit lamps reaches a figure (0 … 1, from the lamp sets' heads and pool reach), it raises the zone's level (so
// the pupils of #2033 narrow under a lamp too) and drives one more uniform (`uLamp`): a warm light added on top of the dimmed scene
// light, stronger on surfaces facing up. Between the lamps only the dark night level is left. Still no light and no shadow caster.
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
  return baseLevel(zone, env) + C.lamp.level * lampShare(zone);
}

/** The zone's level without the outdoor lamps (#2039: their light is added as warm light of its own, not by scaling the scene's). */
function baseLevel(zone, env) {
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

/** #2039: how much lamp light reaches a figure standing at (x, y, z), 0 (none) … 1 (right under a fully lit lamp).
 * `sets`: [{ at: [x, y, z, reach, …] per lamp head, glow 0 … 1, gain }]. A lamp gives (1 − q)² at q = (d / reach)², d the distance
 * from its head's foot point (plus how far the figure's chest rises above the head); several lamps saturate rather than add. */
export function lampLight(sets, x, y, z) {
  let dark = 1;
  for (const s of sets ?? []) {
    const k = (s?.glow ?? 0) * (s.gain ?? 1), a = s?.at;
    if (!(k > 0) || !a) continue;
    for (let i = 0; i + 3 < a.length; i += 4) {
      const r = a[i + 3], dx = x - a[i], dz = z - a[i + 2];
      if (dx > r || dx < -r || dz > r || dz < -r) continue;
      const up = Math.max(0, y + C.lamp.chest - a[i + 1]), q = (dx * dx + dz * dz + up * up) / (r * r);
      if (q < 1) dark *= 1 - Math.min(1, k) * (1 - q) * (1 - q);
    }
  }
  return 1 - dark;
}

/** #2039: the lamp light the avatar's material adds (the `uLamp` uniform): outdoors only, 0 elsewhere. */
export const lampShare = (zone) => (zone?.kind ?? 'outdoors') === 'outdoors' ? clamp(zone?.lamp ?? 0, 0, 1) : 0;

/** The material's uniform (avatar.js makeMaterial). */
export const lampUniforms = () => ({ uLamp: { value: 0 } });
/** Fragment declaration. */
export const LAMP_FDECL = 'uniform float uLamp;';
/** Fragment, right after the light factor (`outgoingLight *= uLight`): the warm lamp light on the surface's own colour, full on surfaces
 * facing up, `C.lamp.side` on vertical ones, `C.lamp.under` on those facing down (the lamps hang above). */
export function lampGlsl() {
  const c = C.lamp.rgb.map((v) => (v * C.lamp.gain).toFixed(4)).join(', '), sd = C.lamp.side, un = C.lamp.under;
  // f(u) = S + A·u + B·u² over u = the normal's up component: f(1) = 1, f(0) = side, f(−1) = under
  const A = ((1 - un) / 2).toFixed(4), B = ((1 + un) / 2 - sd).toFixed(4), S = sd.toFixed(4);
  return `if (uLamp > 0.0) { float lampUp = dot(normalize(normal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
        outgoingLight += diffuseColor.rgb * vec3(${c}) * uLamp * max(0.0, ${S} + ${A} * lampUp + ${B} * lampUp * lampUp); } // #2039: the street lamps (src/avatarlight.js)`;
}

/** The uniform: the zone's level (without the outdoor lamps: `uLamp` adds those) over the scene lights' level, bounded; 1 = unchanged. */
export function lightFactor(zone, env, scene) {
  return clamp(baseLevel(zone, env) / Math.max(scene, C.minScene), C.min, C.max);
}

/** Exponential approach of `cur` to `target` over ~C.tau seconds (frame-rate independent); snaps without a previous value. */
export function approach(cur, target, dt) {
  if (cur === undefined || cur === null || !(dt > 0)) return target;
  return cur + (target - cur) * (1 - Math.exp(-dt / C.tau));
}

/** The per-avatar sampler. main.js sets `zone(x, y, z) -> zone` (outdoors with `lamp`: lampLight), `env() -> { day, overcast }` and
 * `lights`. */
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
    st.lamp = approach(st.lamp, lampShare(st.zone), dt); // #2039
    avatar.setLamp?.(st.lamp);
    avatar.setEyeLight?.(st.zone, env); // #2033: the pupils and the eyes' sun glint (src/avatareyes.js)
    return st.f;
  }
}
