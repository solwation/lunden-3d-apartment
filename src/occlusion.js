// Conservative visibility against actual opaque wall rectangles and the floor slab.
// A single convex occluder must cover every box corner: separate walls can leave a doorway between them.
/** Join only touching coplanar wall strips with identical vertical spans. Never fill a doorway gap. */
export function mergeOpaqueRects(rects) {
 const out=rects.map(r=>({...r}));
 for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
  const a=out[i],b=out[j];if(a.y0!==b.y0||a.y1!==b.y1)continue;
  const alongX=a.z0===a.z1&&b.z0===b.z1&&a.z0===b.z0;
  const alongZ=a.x0===a.x1&&b.x0===b.x1&&a.x0===b.x0;
  if(!alongX&&!alongZ)continue;
  const lo=alongX?'x0':'z0',hi=alongX?'x1':'z1';
  if(a[hi]<b[lo]||b[hi]<a[lo])continue;
  a[lo]=Math.min(a[lo],b[lo]);a[hi]=Math.max(a[hi],b[hi]);out.splice(j,1);j=i;
 }
 return out;
}

export function detailOccluders(walls, slab, W, D) {
  const out = walls.slice();
  if (slab) {
    const h = slab.hole, y = slab.y;
    // Overlapping strips each stay wholly on solid floor; the actual stair opening stays empty.
    for (const [x0, x1, z0, z1] of [[0, h.x0, 0, D], [h.x1, W, 0, D], [0, W, 0, h.z0], [0, W, h.z1, D]]) {
      if (x0 < x1 && z0 < z1) out.push({ x0, x1, y0: y, y1: y, z0, z1 });
    }
  }
  return out;
}

const overlap = (b, w) => b.max.x >= w.x0 && b.min.x <= w.x1 && b.max.y >= w.y0 && b.min.y <= w.y1 && b.max.z >= w.z0 && b.min.z <= w.z1;

function blocked(eye, x, y, z, wall, margin) {
  let near = 0, far = 1;
  for (let i = 0; i < 3; i++) {
    const a = i === 0 ? wall.x0 : i === 1 ? wall.y0 : wall.z0;
    const b = i === 0 ? wall.x1 : i === 1 ? wall.y1 : wall.z1;
    const lo = a + (a === b ? 0 : margin), hi = b - (a === b ? 0 : margin);
    if (lo > hi) return false;
    const start = i === 0 ? eye.x : i === 1 ? eye.y : eye.z;
    const d = (i === 0 ? x : i === 1 ? y : z) - start;
    if (Math.abs(d) < 1e-12) { if (start < lo || start > hi) return false; continue; }
    const t0 = (lo - start) / d, t1 = (hi - start) / d;
    near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1));
    if (near > far) return false;
  }
  return near > 1e-6 && far < 1 - 1e-6;
}

/** `box` is a conservative world AABB. Never hide an overlapping object or a partially exposed silhouette. */
export function wholeBoxOccluded(eye, box, occluders, margin) {
  for (const wall of occluders) {
    if (overlap(box, wall)) continue;
    let all = true;
    for (let i = 0; i < 8; i++) {
      if (!blocked(eye, i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z, wall, margin)) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}
