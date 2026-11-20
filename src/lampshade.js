// Shaded lamps throw their light up and down, not evenly round (#2191). A lamp carries `shade` (a LIGHTING.shades
// profile) and, when it does not hang straight, `axis` (a Vector3: the way the shade opens, default straight down). The
// shader wash (lampwash.js) multiplies its light by shadeGain(cos of the angle between the axis and the ray from the lamp
// to the lit point): a main lobe along the axis (the open mouth: a table cone with a soft edge), a weaker back lobe the
// opposite way (the open top: a pool on the ceiling), and a faint `leak` everywhere else (light through paper or round
// the rim). The same function is mirrored in the GLSL of lampwash.js.

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** The profile's gain for cosine `c` of the angle from the shade's axis (1 = what a bare bulb gives). */
export function shadeGain(c, s) {
  if (!s) return 1;
  return s.boost * Math.max(s.leak, smooth(s.outer, s.inner, c), s.up * smooth(s.outer, s.inner, -c));
}

/** The two RGBA rows the lamp data texture carries for a lamp: [axis x, y, z, inner cos] and [outer cos, leak, up, boost]
 * (boost 0 = a bare, even lamp). */
export function shadeRows(lamp) {
  const s = lamp.shade;
  if (!s) return [0, 0, 0, 0, 0, 0, 0, 0];
  const a = lamp.axis ?? { x: 0, y: -1, z: 0 };
  return [a.x, a.y, a.z, s.inner, s.outer, s.leak, s.up, s.boost];
}
