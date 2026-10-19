#!/usr/bin/env node
// #1349: reproducible, bounded reference profiles from kart-api's public point
// endpoint (reported source: Lantmäteriet's 1 m ground model, RH 2000).
// node tools/riverheight-api.mjs /private/output.json
// This is an offline reference tool: it never runs in the app or changes terrain.
import { SITE } from '../src/config.js';
import { planToGeo } from '../src/sitegeo.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const output = process.argv[2];
if (!output) throw Error('Usage: node tools/riverheight-api.mjs OUTPUT.json');
const endpoint = 'https://api.kart-api.se/v1/hojd';
const sections = new Set([0, 4, 8, 13, SITE.river.path.length - 1]);
const offsets = [-24, -12, -6, -3, 0, 3, 6, 12, 24]; // m: chosen sampling offsets, not surveyed river widths
const points = [];
let distance = 0;
for (let i = 0; i < SITE.river.path.length; i++) {
  const [cx, cz] = SITE.river.path[i], a = SITE.river.path[Math.max(0, i - 1)], b = SITE.river.path[Math.min(i + 1, SITE.river.path.length - 1)];
  if (i) distance += Math.hypot(cx - a[0], cz - a[1]);
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
  if (!(length > 0)) throw Error('River tangent is degenerate');
  for (const offset of sections.has(i) ? offsets : [0]) {
    const x = cx - dz / length * offset, z = cz + dx / length * offset;
    points.push({ station: i, alongM: distance, offsetM: offset, x, z, lonLat: planToGeo(x, z) });
  }
}
// This is a sampled reference at the model origin, not a surveyed floor level.
points.push({ id: 'model-origin-ground', x: 0, z: 0, lonLat: planToGeo(0, 0) });
if (points.length > 100) throw Error('Reference request count exceeds this tool\'s bound');

const startedAt = new Date().toISOString(), results = [];
// Preserve each completed response after every request. A failed run is explicitly
// incomplete and can be resumed without repeating its successful requests.
let previous;
try { previous = JSON.parse(await readFile(output, 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const hash = createHash('sha256').update(JSON.stringify(points)).digest('hex');
if (previous && (previous.pointSetSha256 !== hash || previous.endpoint !== endpoint)) throw Error('Existing export has different points or source');
const dataset = {
  version: 1, issue: 1349, endpoint, documentation: 'https://kart-api.se/en/guides/elevation-sweden/',
  sourceDescription: 'Lantmäteriet Markhöjdmodell via kart-api; provider reports a 1 m source grid',
  verticalDatum: 'RH 2000 (as reported by provider)', licence: 'CC BY 4.0 (as reported in each response)',
  registration: { anchor: SITE.geo.anchor, horizontalAccuracyM: 'approximately 3–5 m; existing model registration, not a survey' },
  limitations: [
    'Point samples from a third-party API, not an original 1 m GeoTIFF download.',
    'Fine source resolution does not improve the model\'s approximate horizontal registration.',
    'Ground-model values at water are not measured bathymetry or a measured current water level.',
    'The model-origin ground sample does not establish the apartment\'s absolute floor elevation.',
    'No runtime terrain, river, bridge or path heights are changed by this export.'
  ],
  pointSetSha256: hash, startedAt: previous?.startedAt ?? startedAt, expectedCount: points.length,
  complete: false, points: results
};
const save = () => writeFile(output, JSON.stringify(dataset, null, 2) + '\n');
await save();
for (let i = 0; i < points.length; i++) {
  const point = points[i], [lon, lat] = point.lonLat;
  const url = new URL(endpoint); url.searchParams.set('lat', lat); url.searchParams.set('lon', lon);
  let response = previous?.points?.[i];
  if (!response) {
    const result = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!result.ok) throw Error(`Height request ${i + 1}/${points.length}: HTTP ${result.status}; export remains incomplete`);
    const raw = await result.text();
    if (raw.length > 10000) throw Error('Unexpectedly large height response');
    response = { ...point, requestedUrl: url.href, fetchedAt: new Date().toISOString(), response: JSON.parse(raw) };
    await new Promise(resolve => setTimeout(resolve, 150)); // avoid a burst against the public service
  }
  const value = response.response;
  if (response.requestedUrl !== url.href || !value || !Number.isFinite(value.lat) || !Number.isFinite(value.lon) || Math.abs(value.lat - lat) > 1e-8 || Math.abs(value.lon - lon) > 1e-8
      || typeof value.nodata !== 'boolean' || (value.nodata ? value.hojd_m !== null : !Number.isFinite(value.hojd_m))
      || !Array.isArray(value.attribution) || !value.attribution.length) throw Error(`Invalid height response ${i + 1}; export remains incomplete`);
  results.push(response); await save();
  console.log(`${i + 1}/${points.length}: ${value.nodata ? 'NODATA' : value.hojd_m + ' m RH 2000'}`);
}
dataset.complete = true; dataset.completedAt = new Date().toISOString();
dataset.nodataCount = results.filter(p => p.response.nodata).length;
await save();
console.log(`Saved ${results.length} reference points (${dataset.nodataCount} NODATA); no runtime change`);
