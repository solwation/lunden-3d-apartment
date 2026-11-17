// #2065: rounded vermilion and a skin bridge, retaining the existing outline and jaw/pucker roles.
import { AVATAR_FACE as FACE, AVATAR_LIP_VOLUME as V } from './config.js';
import { lipOutline } from './avatarsculpt.js';

export function lipPoint(u, v, upper, skin, headFront) {
  const M = FACE.mouth, x = (u * 2 - 1) * M.halfWidth, o = lipOutline(x);
  const height = upper ? o.upper : o.lower;
  const border = upper ? V.philtrumBorder : M.border;
  const y = o.seam + (upper ? 1 : -1) * (height + (skin ? v * border : (v - 1) * height));
  // The seam stays at its previous depth; a rounded belly projects beyond it, then rolls down to the skin.
  const bulge = (upper ? V.upperBulge : V.lowerBulge) * Math.sin(Math.PI * v) * Math.sqrt(o.edge);
  let depth = skin ? V.borderBase + (1 - v) * (V.edgeLift - V.borderBase) : V.edgeLift + M.lift * o.edge * (1 - v) + bulge;
  if (skin && upper) {
    const column = Math.exp(-(((Math.abs(x) - V.philtrumX) / V.philtrumWidth) ** 2));
    depth += V.philtrumRise * column * Math.sin(Math.PI * v) ** 2;
  }
  return [x, y, headFront(x, y) + depth];
}
export function lipSeamPoint(u, v, headFront) {
  const M = FACE.mouth, x = (u * 2 - 1) * M.halfWidth, o = lipOutline(x);
  const y = o.seam + (v - 0.5) * V.seamThickness;
  return [x, y, headFront(x, y) + 0.001 + M.lift * o.edge];
}
