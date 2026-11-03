// Bounded exact 2D source clearance for final field/runoff + narrow spectator apron.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {FOOTBALL as C,SITE,WALK} from '../src/config.js';import {footballWorld} from '../src/footballphysics.js';import {footballFootprints} from '../src/footballgeo.js';
const source=JSON.parse(fs.readFileSync(new URL('../docs/verification/1853/site-location.json',import.meta.url)));
const pointSegment=(p,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);};
const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;};
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const segmentGap=(a,b,c,d)=>{if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));};
const edges=r=>r.map((a,i)=>[a,r[(i+1)%r.length]]);
const pointGap=(p,r)=>inside(p,r)?0:Math.min(...edges(r).map(([a,b])=>pointSegment(p,a,b)));
const segmentRing=(a,b,r)=>inside(a,r)||inside(b,r)?0:Math.min(...edges(r).map(([c,d])=>segmentGap(a,b,c,d)));
const ringGap=(a,b)=>a.some(p=>inside(p,b))||b.some(p=>inside(p,a))?0:Math.min(...edges(a).flatMap(([x,y])=>edges(b).map(([u,v])=>segmentGap(x,y,u,v))));
const rect=(u0,u1,v0,v1)=>[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(p=>footballWorld(C,...p));
const domains=[rect(-C.width/2-C.runoff,C.width/2+C.runoff,-C.length/2-C.runoff,C.length/2+C.runoff),rect(C.width/2,C.width/2+C.apron,...C.apronSpan)],fixtures=footballFootprints();
const routes=[...SITE.north.paths,...SITE.north.access,...SITE.roads,...SITE.riverPark.paths].filter(p=>p.path||p.polygon);
let path=Infinity,tree=Infinity,building=Infinity;const near=[];
for(const r of domains){for(const p of r)assert.ok(p[0]>WALK.x0+.3&&p[0]<WALK.x1-.3&&p[1]>WALK.z0+.3&&p[1]<WALK.z1-.3);
 for(const road of routes){const gap=road.polygon?ringGap(r,road.polygon):Math.min(...road.path.slice(1).map((b,i)=>segmentRing(road.path[i],b,r)))-(Array.isArray(road.w)?Math.max(...road.w):road.w??road.width??4)/2;path=Math.min(path,gap);if(gap<5)near.push({source:road.source??road.name,gap});}
 for(const t of source.trees)tree=Math.min(tree,pointGap([t.x,t.z],r));for(const b of source.buildings)building=Math.min(building,ringGap(r,b.polygon));}
assert.ok(path>=1,`actual access/path margin ${path}`);assert.ok(tree>=1.5,`actual trunk centre margin ${tree}`);assert.ok(building>=1,`source building margin ${building}`);
for(const p of fixtures)for(const q of p)assert.ok(domains.some(r=>inside(q,r)||pointGap(q,r)<1e-8),'all fixed fittings within supported clear domain');
console.log(JSON.stringify({ok:true,field:{at:C.at,width:C.width,length:C.length,runoff:C.runoff},domains,fixtures:fixtures.length,pathEdgeMargin:path,treeCentreMargin:tree,buildingMargin:building,near,sourceTrees:source.trees.length,sourceBuildings:source.buildings.length,sourceRoutes:routes.length},null,2));
