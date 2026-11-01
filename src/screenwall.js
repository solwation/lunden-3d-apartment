// #1786: the patio and roof-terrace screen walls (skärmväggar, SCREEN_WALL): vertical boards in a cream frame.
// One shared CanvasTexture; each wall is a board panel plus two end posts (plain boxes, merged by the caller into
// its existing batch, so no material or draw call is added). UVs: u in metres along the wall / the texture repeat,
// v from the wall's foot (0) to its top (1); the posts and the panel's top / bottom sample the cream rail.
import * as THREE from 'three';
import { SCREEN_WALL as S } from './config.js';

const REPEAT = S.board * S.boards; // m along the wall per texture repeat
const RAIL_V = 0.995; // a v inside the cream rail band (posts, top face)
let shared = null;

/** The shared board texture (one repeat across, the wall's full height down). */
export function screenWallTexture() {
  if (shared) return shared;
  const w = 32 * S.boards, h = 512, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), bw = w / S.boards, rgb = ([r, gr, b], k = 1) => `rgb(${r * k | 0},${gr * k | 0},${b * k | 0})`;
  let seed = 1786;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = rgb(S.groove); g.fillRect(0, 0, w, h);
  for (let i = 0; i < S.boards; i++) {
    const k = 1 - S.vary + rand() * 2 * S.vary;
    g.fillStyle = rgb(S.color, k); g.fillRect(i * bw + 2, 0, bw - 4, h);
    for (let j = 0; j < 14; j++) { // faint vertical grain
      g.fillStyle = `rgba(${rand() < 0.5 ? '255,250,235' : '70,62,45'},${0.04 + rand() * 0.05})`;
      g.fillRect(i * bw + 3 + rand() * (bw - 7), 0, 1, h);
    }
  }
  const rail = Math.round((S.rail / 1.8) * h); // the canvas top is v = 1 (the wall's top)
  g.fillStyle = rgb(S.frame); g.fillRect(0, 0, w, rail);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, rail, w, 2); // its shadow line on the boards
  g.fillStyle = 'rgba(40,35,25,0.18)'; g.fillRect(0, h - 10, w, 10); // a darker foot
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return (shared = tex);
}

/** Box x0…x1 × y0…y1 × z0…z1 with screen-wall UVs (`rail`: every vertex samples the cream frame). */
function part(x0, x1, y0, y1, z0, z1, wy0, wy1, rail) {
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const side = Math.abs(n.getY(i)) < 0.5;
    const u = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
    uv.setXY(i, rail ? 0.5 / S.boards : u / REPEAT, rail || !side ? RAIL_V : (p.getY(i) - wy0) / (wy1 - wy0));
  }
  return geo;
}

/** A screen wall filling x0…x1 × y0…y1 × z0…z1 (thin in x or z): the board panel and an end post at each end. */
export function screenWallParts(x0, x1, y0, y1, z0, z1) {
  const P = S.post;
  if (x1 - x0 <= z1 - z0) { // runs along z
    const a = z0 + P, b = z1 - P;
    return [part(x0, x1, y0, y1, a, b, y0, y1, false), part(x0, x1, y0, y1, z0, a, y0, y1, true), part(x0, x1, y0, y1, b, z1, y0, y1, true)];
  }
  const a = x0 + P, b = x1 - P;
  return [part(a, b, y0, y1, z0, z1, y0, y1, false), part(x0, a, y0, y1, z0, z1, y0, y1, true), part(b, x1, y0, y1, z0, z1, y0, y1, true)];
}
