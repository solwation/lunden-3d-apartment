import * as THREE from 'three';
import { SITE } from './config.js';
const S = SITE.south;
const openRing = p => p.slice(0, p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1] ? -1 : undefined);
/** #1418: assumed low-detail glazing on explicitly classified addressed main buildings only.
 * Existing footprints, heights and roofs define the faces; short returns and gables remain blank. */
export function lowRiseWindowParts(b, base) {
  const R = S.lowRiseWindows;
  if (b.levels >= 4 || b.template || !R.sources.includes(b.source)) return [];
  const p = openRing(b.polygon), edges = p.map((a,i) => {
    const c = p[(i+1)%p.length], dx = c[0]-a[0], dz = c[1]-a[1];
    return {a,dx,dz,d:Math.hypot(dx,dz)};
  });
  const ridge = edges.reduce((a,b) => a.d > b.d ? a : b), parts = [];
  const sign = Math.sign(edges.reduce((s,{a,dx,dz}) => s+a[0]*dz-a[1]*dx,0));
  for (const {a,dx,dz,d} of edges) {
    if (d < ridge.d*R.minFaceShare || Math.abs((dx*ridge.dx+dz*ridge.dz)/(d*ridge.d)) < R.parallelCos) continue;
    const nx = sign*dz/d, nz = -sign*dx/d;
    for (let k=1;k*S.bay+S.window[0]/2<d;k++) for (let floor=0;floor<b.levels;floor++) {
      const g = new THREE.PlaneGeometry(...S.window).rotateY(Math.atan2(nx,nz))
        .translate(a[0]+dx/d*k*S.bay+nx*.025, base+floor*S.storey+S.sill+S.window[1]/2, a[1]+dz/d*k*S.bay+nz*.025).toNonIndexed();
      g.deleteAttribute('uv'); parts.push(g);
    }
  }
  return parts;
}
