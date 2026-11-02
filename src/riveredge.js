import * as THREE from 'three';
import { SITE, EDGE_BACKDROP as E } from './config.js';
import { polygonCutter, subtractConvex } from './polygoncut.js';
import { waterYAt } from './riverbridge.js';
import { grassMeanColor } from './grass.js';

// #1814: one narrow, continuous cut in the existing far-ground batches. No new mesh/material.
// The historical local source/station records are untouched; far heights remain visual assumptions.
const B = SITE.backgroundGround, C = E.riverContinuation;
const terrain = [[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]];
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const normal = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [-dz / l, dx / l]; };
function stations(path) {
  const points = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / C.step);
    for (let k = 0; k < n; k++) points.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  points.push(path.at(-1));
  return points.map((p, i) => {
    const a = normal(points[Math.max(0, i - 1)], points[Math.max(1, i)]), b = normal(points[Math.min(i, points.length - 2)], points[Math.min(i + 1, points.length - 1)]);
    let nx = a[0] + b[0], nz = a[1] + b[1]; const len = Math.hypot(nx, nz); nx /= len; nz /= len;
    const k = 1 / Math.max(.5, nx * b[0] + nz * b[1]);
    return { p, nx: nx * k, nz: nz * k };
  });
}
const courses = E.rivers.map(r => ({ ...r, stations: stations(r.path), water: waterYAt(...r.path[0]) }));
const at = (s, d) => [s.p[0] + s.nx * d, s.p[1] + s.nz * d];
// polygonCutter subtracts convex pieces: split wide mitred quads at tight OSM bends into triangles.
const corridor = halfWidth => courses.flatMap(r => r.stations.slice(1).flatMap((s,i) => {
  const w=halfWidth(r),p=[at(r.stations[i],-w),at(s,-w),at(s,w),at(r.stations[i],w)];
  return [{poly:[p[0],p[1],p[2]]},{poly:[p[0],p[2],p[3]]}];
}));
const cut = polygonCutter(corridor(() => C.bank),40);
// Tight sourced bends can fold an outer bank over another segment's centre. Keep the open channel clear of every bank.
const cutChannel = polygonCutter(corridor(r => r.width/2),40);

/** Preserve the triangle's plane and every interpolated colour while removing the bank corridor. */
export function cutRiverParts(parts) {
  return parts.map(part => {
    const pos = [], cols = [];
    for (let i = 0; i < part.pos.length; i += 9) {
      const tri = [0, 3, 6].map(k => [...part.pos.slice(i + k, i + k + 3), ...part.cols.slice(i + k, i + k + 3)]);
      for (const poly of cut(tri)) for (let j = 1; j + 1 < poly.length; j++) for (const v of [poly[0], poly[j], poly[j + 1]]) { pos.push(...v.slice(0, 3)); cols.push(...v.slice(3)); }
    }
    return { pos, cols };
  });
}

/** The side/south far planes are cut before their existing tint is attached. */
export function cutRiverGround(geometry) {
  const old = geometry.index ? geometry.toNonIndexed() : geometry, a = old.attributes.position;
  const pos = Array.from(a.array), cols = new Array(pos.length).fill(1), part = cutRiverParts([{ pos, cols }])[0];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3)); g.computeVertexNormals();
  if (old !== geometry) old.dispose(); geometry.dispose();
  return g;
}

/** Bank and water strips start at the actual terrain cut and share mitred joints, including at bends. */
export function riverContinuationParts(surface, ground) {
  const parts = [], grass = grassMeanColor(), land = new THREE.Color(grass), waterColor = r => new THREE.Color(r.color);
  const waterClip = [[B.x0+C.overlap,B.z0+C.overlap],[B.x1-C.overlap,B.z0+C.overlap],[B.x1-C.overlap,B.z1-C.overlap],[B.x0+C.overlap,B.z1-C.overlap]];
  const triangle = (a,b,c,color) => {const pos=[],cols=[];for(const p of [a,b,c]){pos.push(...p);cols.push(color.r,color.g,color.b);}parts.push({pos,cols});};
  const emit = (a, b, c, color, bank = true) => {
    const outside = subtractConvex([a,b,c],bank?terrain:waterClip), pieces = bank ? outside.flatMap(poly => cutChannel(poly)) : outside;
    for (const poly of pieces) for (let i = 1; i + 1 < poly.length; i++) {
      const pos = [], cols = [];
      for (const p of [poly[0], poly[i], poly[i + 1]]) { pos.push(...p); cols.push(color.r, color.g, color.b); }
      parts.push({ pos, cols });
    }
    if(bank)for(const poly of pieces)for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length];
      if(![B.x0,B.x1].some(x=>Math.abs(p[0]-x)<1e-6&&Math.abs(q[0]-x)<1e-6))continue;
      // Match the actual sampled terrain edge, not the plane interpolated before the polygon was clipped.
      const n=Math.max(1,Math.ceil(Math.abs(q[2]-p[2])/C.seamStep));
      for(let k=0;k<n;k++){
        const at=t=>p.map((v,j)=>v+(q[j]-v)*t),u=at(k/n),v=at((k+1)/n),gu=[u[0],ground(u[0],u[2]),u[2]],gv=[v[0],ground(v[0],v[2]),v[2]];
        triangle(u,v,gv,color);triangle(u,gv,gu,color);
      }
    }
  };
  for (const r of courses) {
    const half = r.width / 2, shoreStart = half + C.slope, shoreEnd = shoreStart + C.shore, valleyEnd = shoreEnd + C.valley;
    const height = (s, d) => {
      const [x, z] = at(s, d), dist = Math.abs(d), top = surface(x, z), shore = r.water + C.shoreHeight;
      let y = dist <= shoreStart ? r.water - C.waterDepth + (shore - (r.water - C.waterDepth)) * smooth((dist - half) / C.slope)
        : dist <= shoreEnd ? shore : shore + (top - shore) * smooth((dist - shoreEnd) / (valleyEnd - shoreEnd));
      // The first bank section joins the exact emitted terrain edge, then fades into the assumed flat far-bank profile.
      const [a, b] = r.path, dx = b[0] - a[0], dz = b[1] - a[1], edgeZ = z - (x - a[0]) * dz / dx;
      const join = smooth(Math.abs(x - a[0]) / C.join);
      if (join < 1 && dist < C.bank) y = ground(a[0], edgeZ) * (1 - join) + y * join;
      if (dist === C.bank) y = top;
      return [x, y, z];
    };
    // A tiny overlap covers the independently tessellated local water end cap at the terrain boundary.
    {const a=r.stations[0],b=r.stations[1],dx=b.p[0]-a.p[0],dz=b.p[1]-a.p[1],len=Math.hypot(dx,dz),s={...a,p:[a.p[0]-dx/len*C.overlap,a.p[1]-dz/len*C.overlap]},point=(v,d)=>{const[x,z]=at(v,d);return[x,r.water,z];};
      const al=point(s,-shoreStart),ar=point(s,shoreStart),bl=point(a,-shoreStart),br=point(a,shoreStart);emit(al,ar,br,waterColor(r),false);emit(al,br,bl,waterColor(r),false);}
    for (let i = 1; i < r.stations.length; i++) {
      const a = r.stations[i - 1], b = r.stations[i];
      for (const side of [-1, 1]) {
        const widths = [half, shoreStart, shoreEnd, valleyEnd, C.bank];
        for (let j = 1; j < widths.length; j++) {
          const p = height(a, side * widths[j - 1]), q = height(b, side * widths[j - 1]), u = height(b, side * widths[j]), v = height(a, side * widths[j]);
          emit(p, q, u, land); emit(p, u, v, land);
        }
      }
      const water = s => [-shoreStart, shoreStart].map(d => { const [x, z] = at(s, d); return [x, r.water, z]; });
      const [al, ar] = water(a), [bl, br] = water(b); emit(al, ar, br, waterColor(r), false); emit(al, br, bl, waterColor(r), false);
    }
  }
  return parts;
}
