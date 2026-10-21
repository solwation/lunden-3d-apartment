import { PLAYROOM as R } from './config.js';

// The same wall solids feed trim, contact shading and architectural edges.
// Coordinates are local to the clubhouse centre, matching clubhouseLayout().
export function clubhouseWallBoxes(layout) {
  const x0 = -R.w / 2, x1 = R.w / 2, z0 = -R.d / 2, z1 = R.d / 2;
  const t = R.finish.wallDepth, h = R.ceiling;
  return [[x0-t,x1+t,0,h,z0-t,z0], [x0-t,x1+t,0,h,z1,z1+t],
    [x0-t,x0,0,h,z0,z1], [x1,x1+t,0,h,z0,z1], ...layout.boxes];
}

/** Exposed floor-level wall faces only: no trim across passages or inside walls. */
export function clubhouseSkirting(walls) {
  const { height, depth } = R.finish.skirting, out = [], epsilon = 1e-6;
  const ground = walls.filter(b => b[2] <= 0 && b[3] > height);
  for (const b of ground) {
    for (const [axis, side, fixed, lo, hi] of [[0,-1,b[0],b[4],b[5]], [0,1,b[1],b[4],b[5]],
      [1,-1,b[4],b[0],b[1]], [1,1,b[5],b[0],b[1]]]) {
      const cuts = [lo, hi];
      for (const other of ground) cuts.push(Math.max(lo, Math.min(hi, other[axis === 0 ? 4 : 0])), Math.max(lo, Math.min(hi, other[axis === 0 ? 5 : 1])));
      // The exit leaf fills a wall opening visually; leave its threshold clear too.
      const exit = axis === 1 && side === -1 && Math.abs(fixed-R.d/2) < epsilon;
      if (exit) cuts.push(-R.door.w/2, R.door.w/2);
      const sorted = [...new Set(cuts.filter(v => v >= lo && v <= hi))].sort((a,c) => a-c);
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i-1], c = sorted[i], mid = (a+c)/2;
        if (c-a < epsilon || (exit && Math.abs(mid) < R.door.w/2)) continue;
        const x = axis === 0 ? fixed+side*epsilon : mid, z = axis === 1 ? fixed+side*epsilon : mid;
        if (x < -R.w/2 || x > R.w/2 || z < -R.d/2 || z > R.d/2) continue;
        if (ground.some(o => x > o[0] && x < o[1] && z > o[4] && z < o[5])) continue;
        const low = Math.min(fixed, fixed+side*depth), high = Math.max(fixed, fixed+side*depth);
        out.push(axis === 0 ? [low,high,0,height,a,c] : [a,c,0,height,low,high]);
      }
    }
  }
  return out;
}
