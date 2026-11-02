import { SITE, WALK, ROAD_ENDS as R, EDGE_BACKDROP as E } from './config.js';

const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7;

/** The mapped pieces omitted by riverpark.js's west/east/south drawing limits; never extend the north guard round the homes. */
export function outerParkSections(path, overlap = 0) {
  const C = { x0: R.parkClip.x0 + overlap, x1: R.parkClip.x1 - overlap, z1: R.parkClip.z1 - overlap };
  const outside = ([x, z]) => x < C.x0 || x > C.x1 || z > C.z1;
  const out = []; let current = null;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], cuts = [0, 1];
    for (const [at, d, edge] of [[a[0], dx, C.x0], [a[0], dx, C.x1], [a[1], dz, C.z1]]) {
      const t = (edge - at) / d; if (t > 0 && t < 1) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);
    const at = t => [a[0] + dx * t, a[1] + dz * t];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const p = at(cuts[k]), q = at(cuts[k + 1]);
      if (!outside(at((cuts[k] + cuts[k + 1]) / 2))) { current = null; continue; }
      if (!current || !same(current.at(-1), p)) { current = [p]; out.push(current); }
      if (!same(p, q)) current.push(q);
    }
  }
  return out.filter(p => p.length > 1);
}

/** A tangent extension whose endpoint is hidden by clear-weather fog from every position inside WALK. All extra geography is a guess. */
export function fogEnd(point, previous) {
  const dx = point[0] - previous[0], dz = point[1] - previous[1], len = Math.hypot(dx, dz);
  if (!len) throw new Error('A road end needs a nonzero final segment.');
  const ux = dx / len, uz = dz / len, c = R.fogClearance;
  const tx = Math.abs(ux) < 1e-9 ? Infinity : ((ux > 0 ? WALK.x1 + c : WALK.x0 - c) - point[0]) / ux;
  const tz = Math.abs(uz) < 1e-9 ? Infinity : ((uz > 0 ? WALK.z1 + c : WALK.z0 - c) - point[1]) / uz;
  const distance = Math.max(0, Math.min(tx >= 0 ? tx : Infinity, tz >= 0 ? tz : Infinity));
  return [point[0] + ux * distance, point[1] + uz * distance];
}

/** Separate visual routes: the original data/order/widths remain intact for collision, junctions and source verification. */
export function roadEndRoutes() {
  const out = [];
  for (const spec of R.items.filter(s => s.group !== 'park')) {
    const list = spec.group === 'roads' ? SITE.roads : [...SITE[spec.group].access, ...SITE[spec.group].paths];
    const source = list.find(p => p.source === spec.source || p.name === spec.source);
    if (!source?.path) throw new Error(`Missing road continuation source ${spec.source}`);
    const start = spec.end === 0, p = source.path.at(spec.end), prev = source.path.at(start ? 1 : -2), len = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const overlap = [p[0] - (p[0] - prev[0]) / len * R.overlap, p[1] - (p[1] - prev[1]) / len * R.overlap];
    out.push({ ...spec, path: [overlap, p.slice(0, 2), fogEnd(p, prev)], width: Array.isArray(source.w) ? source.w.at(spec.end) : source.w,
      walks: (source.walks ?? []).map(k => ({ ...k, side: k.side * (start ? -1 : 1) })) });
  }
  for (const source of SITE.riverPark.paths) {
    // riverpark's whole-quad clip can discard the last original sample before the centreline reaches the limit.
    // Overlap by half the width plus more than its 1.5 m sample step, also at oblique crossings.
    for (const path of outerParkSections(source.path, source.w / 2 + R.parkOverlap)) {
      const pts = path.map(p => p.slice()), spec = R.items.find(s => s.group === 'park' && s.source === source.source);
      if (spec && same(pts.at(spec.end), source.path.at(spec.end))) {
        if (spec.end === 0) pts.unshift(fogEnd(pts[0], pts[1]));
        else pts.push(fogEnd(pts.at(-1), pts.at(-2)));
      }
      out.push({ source: source.source, group: 'park', path: pts, width: source.w, lift: source.surface === 'asphalt' ? .03 : .025,
        color: source.surface === 'asphalt' ? 0x5f6164 : 0xb5ac90, walks: [] });
    }
  }
  // The cheap backdrop's own road/cycle strips also had exposed ends, including the path just south of the playable area.
  for (const [group, list, lift] of [['edge-roads', E.roads, E.lift.road], ['edge-paths', E.paths, E.lift.path]]) {
    for (const p of list) for (const end of [0, -1]) {
      const q = p.path.at(end), prev = p.path.at(end === 0 ? 1 : -2);
      out.push({ group, source: p.name, path: [q.slice(), fogEnd(q, prev)], width: p.width, lift, color: p.color, walks: [] });
    }
  }
  return out;
}
