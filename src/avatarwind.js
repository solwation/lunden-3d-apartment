// #2110: the outdoor wind stirs long hair, the bun and the sweater hem. No field, mesh or draw call of its own: it only adds a target offset to
// #2014's springs (src/avatarsway.js), which then swing round it with their own damping and stay inside their walls. The wind is #2101's site
// wind (src/sitewind.js: `siteWind` power / direction / clock, eased from the weather), and the irregular part is its own `siteWindOffset` (gusts
// that travel downwind, side sway, fast flutter), so hair moves with the trees beside it. Everything is derived locally from the figure's
// position and the shared weather: every client sees the same kind of flutter without a network field. Indoors (`outdoors` false: the same
// `wetEnv.outdoorAt` test #2018's wet hair uses) the push fades to exactly zero within `AVATAR_WIND.ease` seconds.
// Pure (the only import is sitewind.js' offset; tools/avatarwindtest.mjs).
import { AVATAR_WIND as C } from './config.js';
import { siteWindOffset } from './sitewind.js';

const GROUPS = ['hair', 'bun', 'hem'];
const anchor = { x: 0, z: 0 }, at = { time: 0, power: 0, dir: null }; // (reused: no garbage per frame)
/** Per-avatar state: the indoor/outdoor fade and one [x, y, z] target per group (bone frame, m). */
export const newWind = () => ({ on: null, hair: [0, 0, 0], bun: [0, 0, 0], hem: [0, 0, 0], power: 0 });

/** World direction (x, z) in the frame of the bone with world matrix elements `e`: [along its x, y, z axes]. */
function toBone(e, x, z, out) {
  for (let i = 0; i < 3; i++) { const c = 4 * i, l = Math.hypot(e[c], e[c + 1], e[c + 2]) || 1; out[i] = (x * e[c] + z * e[c + 2]) / l; }
  return out;
}

/**
 * Steps the fade and writes each group's wind target into `st` (bone frame, m; zero when calm or indoors). `wind`: { time, power, dir: {x, y} }
 * (siteWind), `outdoors`: whether the figure stands in the open, `headE` / `torsoE`: the bones' world matrix elements (hair and bun hang from
 * the head, the hem from the torso). Returns `st`.
 */
export function stepWind(st, dt, wind, outdoors, headE, torsoE) {
  const target = outdoors ? 1 : 0;
  st.on = st.on == null ? target : st.on + (target - st.on) * (1 - Math.exp(-Math.max(0, dt) / C.ease));
  if (st.on < 0.03 && !outdoors) st.on = 0; // (the last sub-mm: rest exactly, so an indoor figure costs nothing to the springs)
  const power = Math.min(1, Math.max(0, wind?.power ?? 0)) * st.on;
  st.power = power;
  for (const g of GROUPS) {
    const out = st[g]; out[0] = out[1] = out[2] = 0;
    if (!(power > 0)) continue;
    const G = C[g], e = g === 'hem' ? torsoE : headE, dx = wind.dir.x, dz = wind.dir.y; anchor.x = e[12]; anchor.z = e[14];
    at.time = wind.time; at.power = power; at.dir = wind.dir;
    const o = siteWindOffset(at, anchor, G.weight, G.flutter, G.seed + anchor.x * 0.7, G.freq);
    let x = o.x + dx * G.steady * power, z = o.z + dz * G.steady * power;
    const l = Math.hypot(x, z);
    if (l > G.max) { x *= G.max / l; z *= G.max / l; }
    toBone(e, x, z, out);
    out[1] = Math.min(G.max, G.lift * Math.hypot(x, z)); // hair lifts a little in a gust; the hem's lift is 0
  }
  return st;
}
