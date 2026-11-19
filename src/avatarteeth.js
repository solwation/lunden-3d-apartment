// #2150: teeth, mouth cavity and tongue inside the opening mouth. Pure helpers (no three.js): they return plain arrays that avatar.js
// turns into head-bone parts of the same avatar mesh (no new draw). Every vertex carries a jaw weight `w` (0 = stays with the upper lip,
// 1 = follows the lower lip); the avatar vertex shader drops it by uMouth × w × MOUTH.drop, so a strip whose rows sit on the same
// height with different weights is exactly (w1 - w0) × opening high: zero (invisible) when the mouth is shut, and a strip can
// never leave the gap between the lips (w stays within 0 … 1, x within `reach` of the mouth's half width).
import { AVATAR_FACE as FACE, AVATAR_MOUTH as MOUTH, AVATAR_TEETH as T } from './config.js';
import { lipOutline } from './avatarsculpt.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** The jaw-weight band [top, bottom] of a row kind: 'cavity' (the dark seam), 'upper', 'lower' (teeth), 'tongue'. */
export const teethBand = (kind) => (kind === 'cavity' ? [0, 1] : T[kind].band);
/** The visible height (m) of a row kind when the mouth is open by `open` (0 … 1, the avatar's mouth value): 0 when shut. */
export function teethHeight(kind, open) {
  const [a, b] = teethBand(kind);
  return Math.max(0, b - a) * clamp01(open) * MOUTH.drop;
}
/** Whether a row kind shows at all for `open` (a sliver of at least T.minHeight m). */
export const teethVisible = (kind, open) => teethHeight(kind, open) >= T.minHeight;
/** The drop's taper 0 … 1 across the mouth (the corners stay shut), as avatar.js mouthWeight. */
export const jawSide = (x) => 1 - smooth(0.004, MOUTH.halfWidth, Math.abs(x));

/** A strip of `kind` as { position, normal, color, weight, index } in the head bone's frame like lipSeamPoint. `headFront(x, y)` is
 * the head's front depth. Rows run from the most dropped (bottom) to the shut seam (top), the old ribbon's winding. */
export function teethStrip(kind, headFront) {
  const M = FACE.mouth, cav = kind === 'cavity', S = cav ? null : T[kind], cols = cav ? M.cols : S.cols, rows = cav ? T.cavityRows : 1;
  const [w0, w1] = teethBand(kind), half = (cav ? 1 : S.reach) * M.halfWidth;
  const position = [], normal = [], color = [], weight = [], index = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const x = (i / cols * 2 - 1) * half, o = lipOutline(x), t = j / rows, w = w1 + (w0 - w1) * t;
    const y = o.seam + (cav ? (t - 0.5) * 0.001 : 0);
    // teeth stand a little in front of the cavity (which keeps the old ribbon's depth) and curve back towards the corners
    const z = headFront(x, y) + 0.001 + M.lift * o.edge + (cav ? 0 : S.front - S.corner * (x / M.halfWidth) ** 2);
    position.push(x, y, z); normal.push(0, 0, 1); weight.push(w * jawSide(x)); color.push(...rowColour(kind, t, i));
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1;
    index.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return { position, normal, color, weight, index };
}
const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
function rowColour(kind, t, i) {
  if (kind === 'cavity') { // deep dark under the upper lip (t 1), lip-dark at the lower lip's edge: the gradient into the mouth
    const d = hex(T.cavityDeep), e = hex(T.cavityEdge), k = t;
    return e.map((v, n) => v + (d[n] - v) * k);
  }
  const S = T[kind], base = hex(S.colour);
  // tongue: darker towards its far edge; teeth: a darker column between neighbours and a shade towards the gum (t 1 = top row)
  const shade = kind === 'tongue' ? 1 - 0.25 * (1 - t) : 1 - S.gap * (i % 2) - S.root * (kind === 'upper' ? t : 1 - t);
  return base.map((v) => v * shade);
}
/** The triangles the strips add over #2065's single seam ribbon (the cavity keeps its 2 × cols): for the older whole-head budgets. */
export const teethExtraTriangles = () => ['upper', 'lower', 'tongue'].reduce((n, k) => n + 2 * T[k].cols, 0) + 2 * FACE.mouth.cols * (T.cavityRows - 1);
