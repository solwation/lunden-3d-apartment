import { BASKET as B, rifleHeadBaseY } from './config.js';
import { nerfPlayerContact } from './nerf.js';

/** Free flight only: Basket.idle's gravity-before-move and <=4 cm substeps.
 * Prediction selects 20 ms outer slices; actual visual dt may differ slightly.
 * Actual Basket.cast/hoop collision ends client prediction before any bounce. */
export function* ballSegments(shot, range) {
  const p = { x: shot.o[0], y: shot.o[1], z: shot.o[2] };
  const v = { x: shot.d[0] * shot.s, y: shot.d[1] * shot.s, z: shot.d[2] * shot.s };
  let travelled = 0;
  // -20 is Basketball.idle's existing lost-ball cutoff, not a substitute floor.
  // Actual solid/floor contacts end the client path through the product's Basket.cast.
  while (travelled < range - 1e-7 && p.y >= -20) {
    const n = Math.max(1, Math.ceil(Math.hypot(v.x,v.y,v.z) * .02 / .04)), dt = .02 / n;
    for (let i=0; i<n && travelled < range - 1e-7; i++) {
      const origin=[p.x,p.y,p.z];
      v.y -= B.ball.gravity * dt;
      const move=[v.x*dt,v.y*dt,v.z*dt], full=Math.hypot(...move);
      if (full===0) continue;
      const length=Math.min(full,range-travelled), direction=move.map(x=>x/full);
      p.x+=direction[0]*length;p.y+=direction[1]*length;p.z+=direction[2]*length;
      yield {origin,direction,length,end:[p.x,p.y,p.z],velocity:[v.x,v.y,v.z]};
      travelled+=length;
    }
  }
}

export const ballPlayerContact = (seed,state,segment) => nerfPlayerContact(seed,state,segment,B.ball.r);

/** Server recomputes the first player contact; coordinates in hc never grant damage. */
export function ballHeadContact(seed,state,shot,range) {
  const vector = a => Array.isArray(a) && a.length===3 && a.every(Number.isFinite);
  if (shot?.w!=='ball' || shot.t!=='a' || !vector(shot.o) || !vector(shot.d)
    // Same existing cleanShot launch-speed ceiling (60 m/s); there is no named shared constant.
    || !Number.isFinite(shot.s) || shot.s<=0 || shot.s>60 || !Number.isFinite(range) || range<0
    || Math.hypot(...shot.d)<.9 || Math.hypot(...shot.d)>1.1 || rifleHeadBaseY(seed,state)===null) return null;
  for(const segment of ballSegments(shot,range)) {
    const hit=ballPlayerContact(seed,state,segment);
    if(hit)return hit.head?hit:null;
  }
  return null;
}
