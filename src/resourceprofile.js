// Startup resource profile (#1511): which variant of a resource family is fetched, decided once BEFORE the house is
// built, so a light device never downloads/decodes the full-size file first and scales it down afterwards. Separate
// from the running Quality levels (src/quality.js): a profile is chosen at start/reload only, never swapped live.
// Families: profileCanvas/Size paint AO, meal packaging and the kitchen print at the selected backing size.
// The photographed wall pictures (RESOURCE_PROFILE.light.textures), whose light copies are exactly the
// size three would upload under the light texture cap anyway (tools/lighttextures.cjs), so the picture on the GPU is
// the same size in both profiles; meshes, materials, raycast targets and collision do not depend on the profile.
import { RESOURCE_PROFILE as R } from './config.js';
import { lowMemory } from './lowmemory.js';

const KEY = 'lunden.resProfile';

/**
 * Pure decision. `param` = the `res` URL value (light|full|auto), `saved` = the remembered explicit choice,
 * `textureCap` = the largest texture side this renderer will really upload (phones: LOW_MEMORY.maxTextureSize),
 * `deviceMemory` = navigator.deviceMemory (GB, Chromium only, may be undefined). Returns { profile, reason }.
 * Auto never trusts a device type on its own: light only when the full file could not be shown at its size anyway
 * (upload cap ≤ light.max) or the browser itself reports very little memory.
 */
export function chooseResourceProfile({ param = null, saved = null, textureCap = Infinity, deviceMemory } = {}) {
  if (param === 'light' || param === 'full') return { profile: param, reason: 'url' };
  if (saved === 'light' || saved === 'full') return { profile: saved, reason: 'saved' };
  if (textureCap <= R.light.max) return { profile: 'light', reason: `texture cap ${textureCap}` };
  if (Number.isFinite(deviceMemory) && deviceMemory <= R.light.deviceMemory) return { profile: 'light', reason: `deviceMemory ${deviceMemory}` };
  return { profile: 'full', reason: 'default' };
}

// Before main.js has measured the renderer (component test pages that build furniture directly) the profile
// follows the same rule with the phone cap the renderer will get.
let current = chooseResourceProfile({ textureCap: lowMemory ? R.light.max : Infinity });
let decided = false;
const log = [];

/** main.js, right after the renderer's texture cap is set and before the world is built. Returns the decision. */
export function decideResourceProfile(textureCap) {
  let param = null, saved = null;
  try { param = new URLSearchParams(location.search).get('res'); } catch { /* no location */ }
  try {
    if (param === 'light' || param === 'full') localStorage.setItem(KEY, param);
    else if (param === 'auto') localStorage.removeItem(KEY);
    saved = localStorage.getItem(KEY);
  } catch { /* storage blocked: the URL still decides this visit */ }
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  current = chooseResourceProfile({ param, saved, textureCap, deviceMemory: nav.deviceMemory });
  decided = true;
  return current;
}

export const resourceProfile = () => current.profile;

/** The URL to fetch for a repository-relative resource path, e.g. 'textures/x.jpg' → 'textures/light/x.jpg'. */
export function profilePath(path) {
  if (current.profile !== 'light' || !R.light.textures.includes(path)) return path;
  const i = path.lastIndexOf('/');
  const light = `${path.slice(0, i)}/light/${path.slice(i + 1)}`;
  log.push({ path, used: light });
  return light;
}

/** Diagnostics (?perf / the diag snapshot / tests): profile, why, whether main.js decided it and the swapped files. */
export const resourceProfileInfo = () => ({ ...current, decided, swapped: log.map((e) => e.used) });

/** Same aspect-preserving integer dimensions as three's upload cap; never enlarge a small source. */
export function profileCanvasSize(width, height) {
  const scale = current.profile === 'light' ? Math.min(1, R.light.max / Math.max(width, height)) : 1;
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

/** Paint in the original coordinate system, directly into the selected backing bitmap. */
export function profileCanvas(width, height) {
  const canvas = document.createElement('canvas'), size = profileCanvasSize(width, height);
  canvas.width = size.width; canvas.height = size.height;
  canvas.getContext('2d').scale(size.width / width, size.height / height);
  return canvas;
}
