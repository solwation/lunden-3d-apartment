import * as THREE from 'three';
import { cutAtTerrain } from './roads.js';
import { SITE } from './config.js';

const SOURCE = '145221624';
const DEFAULTS = Object.freeze({ bayWidth: 2.5, bayDepth: 5, aisleWidth: 6, transition: 4 });
const ring = (p) => p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1] ? p.slice(0, -1) : p;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const area = (p) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const cross = (a,b,p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function clipConvex(subject,cutter){
  const sign=Math.sign(area(cutter));let inside=subject;
  for(let i=0;i<cutter.length&&inside.length;i++){
    const a=cutter[i],b=cutter[(i+1)%cutter.length],out=[];
    for(let j=0;j<inside.length;j++){const p=inside[j],q=inside[(j+1)%inside.length],dp=sign*cross(a,b,p),dq=sign*cross(a,b,q);if(dp>=-1e-8)out.push(p);if((dp< -1e-8&&dq>1e-8)||(dp>1e-8&&dq< -1e-8)){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
    inside=out;
  }
  return inside;
}
function clipSegment(segment,poly){
  const sign=Math.sign(area(poly)),a0=segment[0],b0=segment[1],dx=b0[0]-a0[0],dz=b0[1]-a0[1];let lo=0,hi=1;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],d0=sign*cross(a,b,a0),dd=sign*((b[0]-a[0])*dz-(b[1]-a[1])*dx);if(Math.abs(dd)<1e-12){if(d0<0)return null;continue;}const t=-d0/dd;if(dd>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;}
  return[[a0[0]+dx*lo,a0[1]+dz*lo],[a0[0]+dx*hi,a0[1]+dz*hi]];
}
function insetConvex(poly,distance){
  const sign=Math.sign(area(poly)),lines=poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-sign*dz/len,nz=sign*dx/len;return[[a[0]+nx*distance,a[1]+nz*distance],[dx,dz]];});
  return lines.map((line,i)=>{const prev=lines[(i+lines.length-1)%lines.length],[p,r]=prev,[q,s]=line,den=r[0]*s[1]-r[1]*s[0],t=((q[0]-p[0])*s[1]-(q[1]-p[1])*s[0])/den;return[p[0]+r[0]*t,p[1]+r[1]*t];});
}

/**
 * Fit the smallest useful civil plane to the existing terrain samples inside one
 * sourced parking polygon. Both the fitted plane and its transition width are
 * guesses: OSM contains no floor levels. The returned sampler leaves the old
 * terrain unchanged outside the polygon and fades the correction to zero at
 * its edge, so neighboring lots, roads, buildings and surveyed controls remain
 * untouched. The caller supplies the unmodified terrain sampler.
 */
export function createParkingGrade(lot, sampleBase, options = {}) {
  const transition=options.transition??lot?.grade?.transition??DEFAULTS.transition;
  const poly = ring(lot?.polygon ?? []);
  if (poly.length < 3 || typeof sampleBase !== 'function' || !(transition > 0)) throw new TypeError('Parking grade needs a polygon, base sampler, and positive transition');
  const bounds = { x0: Math.min(...poly.map(([x]) => x)), x1: Math.max(...poly.map(([x]) => x)), z0: Math.min(...poly.map(([, z]) => z)), z1: Math.max(...poly.map(([, z]) => z) ) };
  const contains = (x, z) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const points = [];
  for (let x = Math.ceil(bounds.x0); x <= bounds.x1; x++) for (let z = Math.ceil(bounds.z0); z <= bounds.z1; z++) if (contains(x, z)) points.push([x, z, sampleBase(x, z)]);
  if (points.length < 3) throw new RangeError(`Parking polygon ${lot.source ?? ''} contains too few terrain samples`);
  // #1436: an optional anchor pins the plane to a sourced height control inside the
  // lot (the unmodified sampler's value there); only the two slopes are then fitted.
  const anchor = options.anchor ?? lot?.grade?.anchor ?? null;
  if (anchor && !contains(anchor[0], anchor[1])) throw new RangeError(`Parking anchor ${anchor} lies outside polygon ${lot.source ?? ''}`);
  const mx = anchor ? anchor[0] : points.reduce((s, p) => s + p[0], 0) / points.length;
  const mz = anchor ? anchor[1] : points.reduce((s, p) => s + p[1], 0) / points.length;
  const my = anchor ? sampleBase(anchor[0], anchor[1]) : points.reduce((s, p) => s + p[2], 0) / points.length;
  let xx = 0, zz = 0, xz = 0, xy = 0, zy = 0;
  for (const [x, z, y] of points) { const dx = x - mx, dz = z - mz, dy = y - my; xx += dx * dx; zz += dz * dz; xz += dx * dz; xy += dx * dy; zy += dz * dy; }
  const det = xx * zz - xz * xz;
  if (Math.abs(det) < 1e-10) throw new RangeError(`Parking polygon ${lot.source ?? ''} cannot fit a stable plane`);
  const sx = (xy * zz - zy * xz) / det, sz = (zy * xx - xy * xz) / det;
  const planeY = (x, z) => my + sx * (x - mx) + sz * (z - mz);
  const edgeDistance = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    return d;
  };
  const grade = (x, z) => {
    const y = sampleBase(x, z);
    if (!contains(x, z)) return y;
    const t = clamp(edgeDistance(x, z) / transition, 0, 1), weight = t * t * (3 - 2 * t);
    return y + (planeY(x, z) - y) * weight;
  };
  const maxResidual = Math.max(...points.map(([x, z, y]) => Math.abs(planeY(x, z) - y)));
  grade.contains = contains;
  grade.bounds = bounds;
  grade.plane = { origin: [mx, mz, my], slope: [sx, sz], maxResidual, anchored: !!anchor };
  grade.transition = transition;
  grade.source = lot.source;
  return grade;
}

/**
 * Lay a guessed double-loaded aisle and bay separators inside the existing
 * Nattsländegatan parking polygon. The 15-bay count follows the current guessed
 * capacity; 8+7 bays use 2.5×5 m footprints and a 6 m clear aisle. No road or
 * surveyed driveway is created.
 */
export function createParkingLayout(lot, { bayWidth = DEFAULTS.bayWidth, bayDepth = DEFAULTS.bayDepth, aisleWidth = DEFAULTS.aisleWidth } = {}) {
  const poly = ring(lot?.polygon ?? []);
  if (poly.length !== 4 || !(bayWidth > 0 && bayDepth > 0 && aisleWidth > 0)) throw new TypeError('Nattsländegatan layout needs its four-corner lot and positive dimensions');
  const edges = poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
  const long = edges.reduce((best, e) => e.len > best.len ? e : best);
  let u = [(long.b[0] - long.a[0]) / long.len, (long.b[1] - long.a[1]) / long.len];
  if (u[0] < 0) u = [-u[0], -u[1]];
  const n = [-u[1], u[0]], proj = (p, v) => p[0] * v[0] + p[1] * v[1];
  const us = poly.map((p) => proj(p, u)), ns = poly.map((p) => proj(p, n));
  const u0 = Math.min(...us), u1 = Math.max(...us), n0 = Math.min(...ns), n1 = Math.max(...ns), width = n1 - n0;
  const rowDepth = (width - aisleWidth) / 2;
  if (rowDepth + 1e-6 < bayDepth) throw new RangeError('Parking polygon is too narrow for two guessed bays and a clear aisle');
  const mid = (n0 + n1) / 2, aisleRect = [[u0,mid-aisleWidth/2],[u1,mid-aisleWidth/2],[u1,mid+aisleWidth/2],[u0,mid+aisleWidth/2]].map(([v,w])=>[u[0]*v+n[0]*w,u[1]*v+n[1]*w]), aisle=clipConvex(aisleRect,poly);
  const centers = (count) => { const span = count * bayWidth, start = (u0 + u1 - span) / 2; return Array.from({ length: count }, (_, i) => start + (i + .5) * bayWidth); };
  const rowSpecs = [{ side: 'north', edge: n0, count: Math.ceil(lot.capacity / 2), inward: 1 }, { side: 'south', edge: n1, count: Math.floor(lot.capacity / 2), inward: -1 }];
  const stalls = [], segments = [], markingSegments = [];
  for (const row of rowSpecs) {
    const rowNear = row.edge + row.inward * rowDepth, rowFar = row.edge;
    for (const center of centers(row.count)) {
      const half = bayWidth / 2, a = center - half, b = center + half;
      const corners = [
        [u[0]*a+n[0]*rowFar,u[1]*a+n[1]*rowFar], [u[0]*b+n[0]*rowFar,u[1]*b+n[1]*rowFar],
        [u[0]*b+n[0]*rowNear,u[1]*b+n[1]*rowNear], [u[0]*a+n[0]*rowNear,u[1]*a+n[1]*rowNear],
      ];
      const footprint=clipConvex(corners,poly);
      if(footprint.length>=3)stalls.push({ polygon: footprint, center: [u[0]*center+n[0]*(rowFar+rowNear)/2, u[1]*center+n[1]*(rowFar+rowNear)/2], width: bayWidth, depth: bayDepth, side: row.side, area: Math.abs(area(footprint)) });
    }
    const count = row.count;
    // The polygon's long edges delimit the outer bays, so render only the
    // internal aisle-side dividers. Keeping the two edge segments in the
    // layout still helps footprint inspection without spending draw triangles.
    for (let i = 0; i <= count; i++) {
      const at = (u0 + u1 - count * bayWidth) / 2 + i * bayWidth;
      const segment=clipSegment([[u[0]*at+n[0]*rowFar,u[1]*at+n[1]*rowFar],[u[0]*at+n[0]*rowNear,u[1]*at+n[1]*rowNear]],poly);if(segment){segments.push(segment);if(i>0&&i<count)markingSegments.push(segment);}
    }
  }
  return { aisle, stalls, segments, markingSegments, axes: { u, n }, dimensions: { bayWidth, bayDepth, aisleWidth, lotWidth: width, rowDepth, length: u1-u0 } };
}

function lineGeometry(segment, width, ground, lift, grid, boundary) {
  const [p0,p1]=segment, dx=p1[0]-p0[0], dz=p1[1]-p0[1], len=Math.hypot(dx,dz);
  if (len < 1e-8) return null;
  const nx=-dz/len*width/2,nz=dx/len*width/2,quad=[[p0[0]-nx,p0[1]-nz],[p0[0]+nx,p0[1]+nz],[p1[0]+nx,p1[1]+nz],[p1[0]-nx,p1[1]-nz]],poly=boundary?clipConvex(quad,boundary):quad,triangles=poly.slice(1,-1).flatMap((_,i)=>{const tri=[poly[0],poly[i+1],poly[i+2]];return grid?cutAtTerrain(tri,grid):[tri];}),positions=[];
  for(const tri of triangles)for(const [x,z] of tri)positions.push(x,ground(x,z)+lift,z);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const color=new THREE.Color(0xeeeeea);g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:positions.length/3},()=>[color.r,color.g,color.b]).flat(),3));g.computeVertexNormals();
  return g;
}

/** Return paint meshes following the existing emitted terrain sampler. Asphalt itself is already drawn by southbackdrop. */
export function parking1442Parts(ground) {
  const lot=SITE.south.parking.find(p=>p.source===SOURCE);if(!lot)return{surface:null,markings:[],layout:null};
  const layout=createParkingLayout(lot),grid=ground.grid?.()??null,markings=layout.markingSegments.map(s=>lineGeometry(s,.08,ground,.052+.024,grid,insetConvex(ring(lot.polygon),.01))).filter(Boolean);
  return{surface:null,markings,layout};
}
