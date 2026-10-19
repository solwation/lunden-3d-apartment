// #1350: offline interpretation of #1349's checked ground points. Not bathymetry/water-level data.
// node tools/riverfall.mjs [reference.json] [output.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SITE } from '../src/config.js';
const path = process.argv[2] ?? 'docs/references/elevation-hoje-a/point-api-2026-10-19.json';
const raw = readFileSync(path), data = JSON.parse(raw);
if (!data.complete || data.points.length !== data.expectedCount) throw new Error('Incomplete reference export');
const samples = data.points.filter(p => p.offsetM === 0).sort((a,b) => a.alongM-b.alongM);
if (samples.length !== SITE.river.path.length || samples.some((p,i) => p.station !== i || p.response.nodata || !Number.isFinite(p.response.hojd_m) || Math.hypot(p.x-SITE.river.path[i][0],p.z-SITE.river.path[i][1]) > 1e-6)) throw new Error('Reference centreline does not match the model');
const median = a => { a.sort((x,y)=>x-y); const n=a.length; return n%2 ? a[(n-1)/2] : (a[n/2-1]+a[n/2])/2; };
const slopes=[];
for (let i=0;i<samples.length;i++) for (let j=i+1;j<samples.length;j++) {
  const a=samples[i],b=samples[j],d=b.alongM-a.alongM;
  if (!(d>0)) throw new Error('Invalid river station spacing');
  slopes.push((b.response.hojd_m-a.response.hojd_m)/d);
}
// Median of all pairwise slopes reduces the influence of single bank/water-edge raster samples.
const slope=median(slopes), intercept=median(samples.map(p=>p.response.hojd_m-slope*p.alongM));
if (!(slope<0)) throw new Error('Reference points do not support a downstream fall');
const report={sourceSha256:createHash('sha256').update(raw).digest('hex'),source:path,method:'Median of all pairwise centreline ground-height slopes; visual interpretation, not a measured water profile',count:samples.length,pairCount:slopes.length,slope,fallPerM:-slope,intercept,totalLengthM:samples.at(-1).alongM,totalFallM:-slope*samples.at(-1).alongM,maxResidualM:Math.max(...samples.map(p=>Math.abs(p.response.hojd_m-(intercept+slope*p.alongM)))),attribution:'Lantmäteriet via kart-api; CC BY 4.0',limitations:['3–5 m approximate horizontal registration','No measured water surface or submerged bed','Absolute model water/bed/shore datum remains the existing visual assumption; trend anchored at the road bridge'],samples:samples.map(p=>({alongM:p.alongM,groundRh2000:p.response.hojd_m,trendRh2000:intercept+slope*p.alongM}))};
const text=JSON.stringify(report,null,2)+'\n';
if(process.argv[3])writeFileSync(process.argv[3],text);else process.stdout.write(text);
