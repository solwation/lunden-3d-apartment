// #2394: the real homeRegion geometry and transmission at the web export's current pose.
import { WINDOW_LIGHT, BLINDS, LEVELS } from '../../src/config.js';
import { homeRegion, castWindow, windowPass } from '../../src/windowlight.js';
import { dayCycleLightColors } from '../../src/daycycle.js';

const snapshot = (value) => {
  // JSON.stringify would silently turn NaN/Infinity into null and lose undefined fields.
  const check = (v) => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw Error('Window daylight: non-finite data');
    if (v === undefined || typeof v === 'function') throw Error('Window daylight: missing source data');
    if (v && typeof v === 'object') for (const item of Object.values(v)) check(item);
  };
  check(value);
  return JSON.parse(JSON.stringify(value));
};

/** JSON-safe L1007 window-light inputs, in web metres (x east, y up, z south).
 * This takes no day/camera state: the consumer selects the nearest WINDOW_LIGHT.max
 * sources and computes sky/sun strength at its own clock. Reach and transmission
 * are explicitly frozen at export time, not a replacement for live door/cloth updates.
 * homeRegion creates fresh sources; neither the world nor its materials are mutated.
 */
export function windowDaylight(world) {
  if (!world?.levels?.length || !Array.isArray(world.doors)
      || !Array.isArray(world.blinds?.list) || !Array.isArray(world.blinds?.curtains)) {
    throw Error('Window daylight requires the complete L1007 world, doors and blinds/curtains');
  }
  const region = homeRegion(world);
  if (!region.sources.some(s => !s.well)) throw Error('Window daylight: no L1007 glass sources');
  const blinds = world.blinds.list.map(b => ({
    id: b.id, level: b.level, out: b.out ?? null, x0: b.x0, x1: b.x1,
    cover: b.cover, dark: b.dark,
  }));
  const curtains = world.blinds.curtains.map(c => ({
    id: c.id, level: c.level, facade: c.spec.facade ?? null, glass: [...c.spec.glass],
    cover: c.cover, daylightCut: c.daylightCut, t: c.t,
  }));
  for (const rows of [blinds, curtains]) {
    if (new Set(rows.map(r => r.id)).size !== rows.length || rows.some(r => !r.id)) {
      throw Error('Window daylight: missing or duplicate cloth source ids');
    }
  }
  const bands = [], segments = [];
  const byLevel = new Map();
  for (const s of region.sources) {
    if (!byLevel.has(s.level)) {
      const walls = region.segs(s.level);
      byLevel.set(s.level, walls);
      bands.push({ level: s.level, y0: s.y0, y1: s.y1 });
      segments.push({ level: s.level, segments: walls.map(row => [...row]) });
    }
    castWindow(s, byLevel.get(s.level)); // same walls, current leaves and outline as the web
    s.pass = s.well ? 0 : windowPass(s, world.blinds.list, world.blinds.curtains);
  }
  const lower = region.sources.filter(s => !s.well && s.level === 0);
  const lowerMean = lower.length ? lower.reduce((sum, s) => sum + s.pass, 0) / lower.length : 0;
  const sources = region.sources.map(s => {
    const { vis, ...geometry } = s;
    if (s.well) geometry.pass = WINDOW_LIGHT.well * lowerMean;
    // Geometry-derived identity does not depend on selected camera or array order.
    const id = ['L1007', s.level, s.facade, s.x, s.y, s.z, s.nx, s.nz, s.hw, s.hh].join(':');
    const blindIds = s.well ? [] : blinds.filter(b => b.level === s.level && (b.out === null || b.out === -s.nz)
      && b.x1 > s.x0 && b.x0 < s.x1).map(b => b.id);
    const curtainIds = s.well ? [] : curtains.filter(c => c.level === s.level
      && (!c.facade || c.facade === s.facade) && c.glass[1] > s.x0 && c.glass[0] < s.x1).map(c => c.id);
    if (vis.length !== WINDOW_LIGHT.rays) throw Error('Window daylight: unexpected ray count');
    return { id, kind: s.well ? 'well' : 'window', ...geometry, reach: Array.from(vis), blindIds, curtainIds };
  });
  if (new Set(sources.map(s => s.id)).size !== sources.length) throw Error('Window daylight: duplicate glass source ids');
  const doors = world.doors.flatMap((d, index) => d.kind === 'wardrobe' ? [] : [{
    source: `world.doors[${index}]`, kind: d.kind,
    level: d.object.position.y > LEVELS[0].floor + 1.6 ? 1 : 0,
    t: d.t, segment: [...d.segment()],
  }]);
  return snapshot({
    version: 1, region: region.id, runtimeCoverage: 'export-snapshot',
    coordinates: { units: 'metres', axes: 'x east, y up, z south' },
    config: WINDOW_LIGHT, blindDimming: BLINDS.dim, runtimeColors: dayCycleLightColors(),
    box: region.box, bands, sources, segments, snapshot: { doors, blinds, curtains },
    limitations: [
      'Visibility rays and blind/curtain transmission use the current export pose; live changes require recomputation.',
      'Only L1007/homeRegion is exported; visitable-flat regions are not included.',
      'Select the nearest config.max source centres for each camera; sky/sun colour and intensity remain runtime inputs.',
    ],
    provenance: {
      sources: ['src/config.js#WINDOW_LIGHT', 'src/config.js#BLINDS.dim', 'src/config.js#LEVELS',
        'src/windowlight.js#homeRegion', 'src/windowlight.js#castWindow', 'src/windowlight.js#windowPass',
        'src/windowlight.js#WindowLight.update', 'src/blinds.js#Blind.cover', 'src/curtains.js#Curtain.cover',
        'src/sunbounce.js', 'src/daycycle.js#dayCycleLightColors'],
      visibility: 'homeRegion.segs(level), including current non-wardrobe door segments and the plan outline',
      wellTransmission: 'config.well times the mean pass of the lower-storey windows',
    },
  });
}
