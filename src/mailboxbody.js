import * as THREE from 'three';
import { MAILBOX as M } from './config.js';

// The letterbox's fixed sheet-metal body (#1706, mailbox.js): plain geometry data without scene or audio imports, so that
// campusfacades.js can merge it into the school's white-trim batch (the box then costs no draw call of its own).

export const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
export const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
export const doorT = 0.014; // the hatch's thickness (m)

/** The box's world-space bottom height for a ground (or building base) height `ground`. */
export const mailboxY = (ground) => ground + M.height;

/** The fixed body as [{ geo, color }] in world coordinates (`y0` = the box's bottom). campusfacades.js tints and merges them. */
export function mailboxBodyParts(y0) {
  const { w, h, d, wall: t, colors } = M, hood = 0.014;
  const place = (g) => g.rotateY(THREE.MathUtils.degToRad(M.yaw)).translate(M.x, y0, M.z);
  return [
    [box(w, h, t, 0, h / 2, t / 2), colors.inside],                              // the back plate (dark: it is what you see inside)
    [box(w, t, d, 0, t / 2, d / 2), colors.body],                                // the bottom
    [box(w, t, d, 0, h - t / 2, d / 2), colors.body],                            // the top
    [box(t, h, d, -w / 2 + t / 2, h / 2, d / 2), colors.body],                   // the sides
    [box(t, h, d, w / 2 - t / 2, h / 2, d / 2), colors.body],
    [box(w + 0.03, hood, d + 0.025, 0, h + hood / 2, d / 2 + 0.0125), colors.body], // a small rain hood on top
  ].map(([g, color]) => ({ geo: place(g), color }));
}

