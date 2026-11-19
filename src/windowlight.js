import * as THREE from 'three';
import { WINDOW_LIGHT as WL, BLINDS, LEVELS } from './config.js';
import { cast } from './lampwash.js';
import { lowMemory } from './lowmemory.js';

// The windows' daylight indoors (#2152, WINDOW_LIGHT in config). Without it a room got as much sky light deep in by the hall
// as by its window: three's hemisphere + ambient lights and the shadowless fill light every surface alike. Now, inside the
// flat the visitor is in (or nearest to: L1007 or a visitable flat, each its own box), by day that even light keeps only a
// low base share and each window's glass lights the room as a soft sky source instead, where it sees: the area by the
// windows and the ceiling over them get brighter, deep halls and corridors darker. The sun's own patches (the
// shadow-casting light) are untouched.
// No pass, texture or program of its own: like cloudshadow.js, three's lights chunks are patched once at import, so every lit
// built-in material (and every onBeforeCompile variant: lampwash.js) keeps its single program; the indirect irradiance is
// rewritten just before <lights_fragment_end>. The data are a few uniform vec4 arrays shared by reference (Float32Arrays:
// three's uniform clone copies plain arrays per material, not typed ones). Off (`winA.w` 0: the lowest quality level, night,
// no flat near, phones never install it) the shader returns at one uniform branch and the light is today's.
// Per window: the nearest point on its glass rectangle gives E = L·A·cosW·cosR / (π·(r / spread)² + A) (a Lambert area-light
// form factor with softened cosines), only inside its visibility polygon in plan: `rays` rays fanned over the room side from
// just inside the inner façade face, stopped by the walls and the doors as they stand (re-cast while a door moves), the same
// casting as the lamps' wash (lampwash.js). Its blinds / curtains dim it (BLINDS.dim, the curtains' own cut).

const MAX = WL.max, RAYS = WL.rays;
const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** Shared uniform values (typed arrays: shared by every material's program, not cloned). */
export const windowLightUniforms = {
  winA: { value: new Float32Array(4) },        // base factor of the hemi/ambient irradiance, —, window count, on (0 = off)
  winBox: { value: new Float32Array(4) },      // the active flat's box x0, z0, x1, z1 (world)
  winY: { value: new Float32Array(4) },        // its y0, y1
  winSky: { value: new Float32Array(4) },      // the sky's radiance colour × strength
  winFill: { value: new Float32Array(4) },     // the fill light's colour × intensity × fillCut (taken away inside)
  winFillDir: { value: new Float32Array(4) },  // towards the fill light (world, unit)
  winSrc: { value: new Float32Array(MAX * 3 * 4) }, // per window: glass centre x y z, strength | inward normal x z, half width, half height | ray origin x z, y0, y1 of its level
  winVis: { value: new Float32Array(MAX * RAYS) },  // per window: the reach of each ray (m)
};

const PARS = /* glsl */`
#define WL_MAX ${MAX}
#define WL_RAYS ${RAYS}
uniform vec4 winA, winBox, winY, winSky, winFill, winFillDir;
uniform vec4 winSrc[ WL_MAX * 3 ];
uniform vec4 winVis[ WL_MAX * WL_RAYS / 4 ];
float wlReach( int i, int k ) { int j = i * WL_RAYS + k; return winVis[ j / 4 ][ j % 4 ]; }
vec3 windowLight( vec3 irr, vec3 viewPos, vec3 viewNormal ) { // #2152: the indirect irradiance inside the active flat
	if ( winA.w <= 0.0 ) return irr;
	vec3 p = cameraPosition + viewPos * mat3( viewMatrix ); // world position
	if ( p.x < winBox.x || p.x > winBox.z || p.z < winBox.y || p.z > winBox.w || p.y < winY.x || p.y > winY.y ) return irr;
	vec3 n = viewNormal * mat3( viewMatrix );
	float sky = 0.0;
	for ( int i = 0; i < WL_MAX; i ++ ) {
		if ( float( i ) >= winA.z ) break;
		vec4 a = winSrc[ i * 3 ], b = winSrc[ i * 3 + 1 ], c = winSrc[ i * 3 + 2 ];
		if ( a.w <= 0.0 || p.y < c.z || p.y > c.w ) continue; // drawn shut / the other level
		vec2 N = b.xy, T = vec2( - N.y, N.x );
		vec3 rel = p - a.xyz;
		if ( dot( rel.xz, N ) < - 0.01 ) continue; // behind the glass
		vec2 s = vec2( clamp( dot( rel.xz, T ), - b.z, b.z ), clamp( rel.y, - b.w, b.w ) );
		vec3 d = vec3( T.x * s.x, s.y, T.y * s.x ) - rel; // to the nearest point on the glass
		float r2 = max( dot( d, d ), 1e-4 );
		vec3 l = d * inversesqrt( r2 );
		float cosW = ( max( - dot( l.xz, N ), 0.0 ) + ${f(WL.glassWrap)} ) * ${f(1 / (1 + WL.glassWrap))};
		float cosR = max( dot( n, l ) + ${f(WL.wrap)}, 0.0 ) * ${f(1 / (1 + WL.wrap))};
		float area = 4.0 * b.z * b.w;
		float e = a.w * area * cosW * cosR / ( ${f(Math.PI / (WL.spread * WL.spread))} * r2 + area );
		if ( e < 1e-4 ) continue;
		vec2 o = p.xz - c.xy;
		float fo = dot( o, N );
		if ( fo > 0.0 ) { // in the room: inside the visibility polygon (between two rays)?
			float t = clamp( ( atan( dot( o, T ), fo ) * ${f(1 / Math.PI)} + 0.5 ) * ${f(RAYS - 1)}, 0.0, ${f(RAYS - 1)} );
			int k = int( min( floor( t ), ${f(RAYS - 2)} ) );
			float reach = mix( wlReach( i, k ), wlReach( i, k + 1 ), t - float( k ) );
			e *= 1.0 - smoothstep( reach + 0.02, reach + 0.2, length( o ) );
		}
		sky += e;
	}
	vec3 fill = winFill.rgb * max( dot( n, winFillDir.xyz ), 0.0 );
	return max( irr * winA.x - fill + winSky.rgb * sky, vec3( 0.0 ) );
}
`;
const END = /* glsl */`#if defined( RE_IndirectDiffuse )
	irradiance = windowLight( irradiance, geometryPosition, geometryNormal ); // #2152
#endif
`;

/** Patch three's lights chunks once (idempotent). Throws if three's chunks changed shape, so an upgrade cannot silently drop it. */
export function installWindowLight(T = THREE) {
  const S = T.ShaderChunk;
  if (S.lights_fragment_end.includes('windowLight(')) return false;
  if (!S.lights_fragment_end.includes('RE_IndirectDiffuse( irradiance,') || !S.lights_fragment_begin.includes('vec3 geometryNormal = normal;'))
    throw new Error('windowlight: unexpected three lights chunks');
  S.lights_pars_begin += PARS;
  S.lights_fragment_end = END + S.lights_fragment_end;
  Object.assign(T.UniformsLib.lights, windowLightUniforms); // custom lit ShaderMaterials merge UniformsLib.lights
  for (const k in T.ShaderLib) if (T.ShaderLib[k].uniforms?.directionalLights) Object.assign(T.ShaderLib[k].uniforms, windowLightUniforms);
  return true;
}

/**
 * A flat's windows as sky sources. `openings` = buildLevel's { north, south } per level (only windows: those with `win`,
 * `glass` and `inner` z); `levels` = [{ y0, y1 }] the y band each level's light stays in; ox / oz = the plan's offset.
 */
export function windowSources(openings, levels, ox = 0, oz = 0) {
  const out = [];
  openings.forEach((o, level) => {
    for (const facade of ['north', 'south']) for (const w of o?.[facade] ?? []) {
      if (!w.win || w.glass === undefined) continue; // (a glazed entrance door is no window)
      const nz = facade === 'north' ? 1 : -1; // into the room
      const x = ox + (w.x0 + w.x1) / 2;
      out.push({ level, facade, x, y: (w.y0 + w.y1) / 2, z: oz + w.glass, nx: 0, nz, hw: (w.x1 - w.x0) / 2, hh: (w.y1 - w.y0) / 2,
        x0: ox + w.x0, x1: ox + w.x1, ox: x, oz: oz + w.inner + nz * 0.05, y0: levels[level].y0, y1: levels[level].y1, vis: new Float32Array(RAYS) });
    }
  });
  return out;
}

/** Ray k of `rays` (0 … rays − 1) fanned over the room side of a window: −90° … +90° from its inward normal. */
export function rayDir(src, k, rays = RAYS) {
  const a = -Math.PI / 2 + (Math.PI * k) / (rays - 1), c = Math.cos(a), s = Math.sin(a);
  return { x: src.nx * c - src.nz * s, z: src.nz * c + src.nx * s }; // N cos a + T sin a, T = (−N.z, N.x)
}

/** Cast a window's rays against plan segments ([x0, z0, x1, z1] world): fills src.vis (reach per ray, ≤ range). */
export function castWindow(src, segs, range = 30) {
  for (let k = 0; k < src.vis.length; k++) { const d = rayDir(src, k, src.vis.length); src.vis[k] = cast(segs, src.ox, src.oz, d.x, d.z, range).t; }
  return src.vis;
}

/** The share of a window's daylight its blinds and curtains let through (0 … 1). Plain data: blinds [{ level, out (−1 north,
 *  +1 south), x0, x1, cover, dark }], curtains [{ level, cover, daylightCut, spec: { facade, glass: [x0, x1] } }]; the same
 *  level and façade and an overlap along x decide which are its. */
export function windowPass(src, blinds = [], curtains = []) {
  let w = 0, cut = 0, cc = 0;
  for (const b of blinds) {
    if (b.level !== src.level || (b.out !== undefined && b.out !== -src.nz) || b.x1 <= src.x0 || b.x0 >= src.x1) continue;
    const ww = Math.min(b.x1, src.x1) - Math.max(b.x0, src.x0);
    w += ww; cut += ww * b.cover * (b.dark ? BLINDS.dim.dark : BLINDS.dim.light);
  }
  const glass = src.x1 - src.x0, blind = w ? cut / Math.max(w, glass) : 0;
  for (const c of curtains) {
    const [g0, g1] = c.spec?.glass ?? [c.x0, c.x1];
    if (c.level !== src.level || (c.spec?.facade && c.spec.facade !== src.facade) || g1 <= src.x0 || g0 >= src.x1) continue;
    cc += c.cover * c.daylightCut * (Math.min(g1, src.x1) - Math.max(g0, src.x0)) / glass;
  }
  return Math.max(0, (1 - blind) * (1 - Math.min(1, cc)));
}

/** The `max` windows nearest a point (their glass centres), nearest first. */
export function pickWindows(sources, x, y, z, max = MAX) {
  if (sources.length <= max) return sources.slice();
  return sources.map((s) => [Math.hypot(s.x - x, s.y - y, s.z - z), s]).sort((a, b) => a[0] - b[0]).slice(0, max).map(([, s]) => s);
}

/** The region the eye lights: the one it is inside, else the nearest within `near` m of its box (or null). */
export function pickRegion(regions, x, y, z, near = WL.near) {
  let best = null, bd = Infinity;
  for (const r of regions) {
    const b = r.box, dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1), dy = Math.max(b.y0 - y, 0, y - b.y1);
    const d = Math.hypot(dx, dy, dz);
    if (d < bd) { bd = d; best = r; }
  }
  return bd <= near ? best : null;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** One window's sky irradiance at world point p with world normal n, per unit of sky strength and the window's own strength:
 *  the shader's formula in JS (tests, docs). */
export function windowIrradiance(src, p, n, strength = 1) {
  if (strength <= 0 || p.y < src.y0 || p.y > src.y1) return 0;
  const N = { x: src.nx, z: src.nz }, T = { x: -N.z, z: N.x };
  const rel = { x: p.x - src.x, y: p.y - src.y, z: p.z - src.z };
  if (rel.x * N.x + rel.z * N.z < -0.01) return 0;
  const sx = clamp(rel.x * T.x + rel.z * T.z, -src.hw, src.hw), sy = clamp(rel.y, -src.hh, src.hh);
  const d = { x: T.x * sx - rel.x, y: sy - rel.y, z: T.z * sx - rel.z };
  const r2 = Math.max(d.x * d.x + d.y * d.y + d.z * d.z, 1e-4), r = Math.sqrt(r2), l = { x: d.x / r, y: d.y / r, z: d.z / r };
  const cosW = (Math.max(-(l.x * N.x + l.z * N.z), 0) + WL.glassWrap) / (1 + WL.glassWrap);
  const cosR = Math.max(n.x * l.x + n.y * l.y + n.z * l.z + WL.wrap, 0) / (1 + WL.wrap);
  const area = 4 * src.hw * src.hh;
  let e = strength * area * cosW * cosR / ((Math.PI / (WL.spread * WL.spread)) * r2 + area);
  const o = { x: p.x - src.ox, z: p.z - src.oz }, fo = o.x * N.x + o.z * N.z;
  if (fo > 0) {
    const R = src.vis.length, t = clamp((Math.atan2(o.x * T.x + o.z * T.z, fo) / Math.PI + 0.5) * (R - 1), 0, R - 1);
    const k = Math.floor(Math.min(t, R - 2)), reach = src.vis[k] + (src.vis[k + 1] - src.vis[k]) * (t - k);
    e *= 1 - smooth(reach + 0.02, reach + 0.2, Math.hypot(o.x, o.z));
  }
  return e;
}

/** The box a flat's window light stays in: its footprint between its windows' glass planes (`inset` inside them: the outer
 *  reveals and façades keep the global light), from under its lowest floor to over its top ceiling. */
function flatBox(x0, x1, z0, z1, sources, bands) {
  const north = sources.filter((s) => s.nz > 0).map((s) => s.z), south = sources.filter((s) => s.nz < 0).map((s) => s.z);
  return { x0, x1, z0: north.length ? Math.min(...north) + WL.inset : z0, z1: south.length ? Math.max(...south) - WL.inset : z1,
    y0: bands[0].y0, y1: bands.at(-1).y1 };
}
const doorKey = (doors) => doors.reduce((k, d, i) => k + (i + 1) * (d.t ?? 0), 0); // (t: 0 shut … 1 open, doors.js)
const outline = (x0, z0, x1, z1) => [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];

/** L1007's region: world.levels' openings, walls and doors (as lampwash.js casts the lamps': closed doors stop it, the
 *  wardrobes' sliding fronts do not), its two storeys split 0.1 m under the upper floor. */
export function homeRegion(world, L = LEVELS) {
  const split = L[1].floor - 0.1, bands = [{ y0: L[0].floor - 0.1, y1: split }, { y0: split, y1: L[1].floor + L[1].ceiling + 0.1 }];
  const sources = windowSources(world.levels.map((l) => l.openings), bands);
  const { x: SX, z: SZ } = world.size, doors = world.doors.filter((d) => d.kind !== 'wardrobe');
  const levelOf = (d) => (d.object.position.y > L[0].floor + 1.6 ? 1 : 0);
  return { id: 'L1007', sources, box: flatBox(0, SX, 0, SZ, sources, bands), doors: () => doorKey(doors),
    segs: (lv) => [...world.levels[lv].wallSegments, ...doors.filter((d) => levelOf(d) === lv).map((d) => d.segment()), ...outline(0, 0, SX, SZ)] };
}

/** A visitable flat's region (visitunit.js): its own storeys, windows, walls and doors, in world coordinates. */
export function visitRegion(unit) {
  const lv = unit.levels, split = lv.length > 1 ? lv[1].floor - 0.1 : lv[0].top;
  const bands = lv.map((l, i) => ({ y0: i ? split : l.floor - 0.1, y1: i < lv.length - 1 ? split : l.floor + l.ceiling + 0.1 }));
  const sources = windowSources(unit.openings, bands, unit.ox, unit.oz), b = unit.box;
  return { id: unit.id, sources, box: flatBox(b.x0, b.x1, b.z0, b.z1, sources, bands), doors: () => doorKey(unit.doors),
    segs: (l) => { const r = lv[l].rect; return [...unit.walls[l], ...unit.doorSegments(l), ...outline(unit.ox + r.x0, unit.oz + r.z0, unit.ox + r.x1, unit.oz + r.z1)]; } };
}

/** The base factor of the global hemi/ambient irradiance inside by day share `day` (0 night … 1 full day). */
export const baseFactor = (day) => 1 - (1 - WL.base) * clamp(day, 0, 1);

/**
 * The windows' sky light. `regions`: [{ id, box: { x0, x1, z0, z1, y0, y1 } (world), sources: windowSources(…),
 * segs(level) → the plan segments that stop its rays now, doors() → a number that changes when a door moves }].
 */
export class WindowLight {
  constructor(regions, uniforms = windowLightUniforms) {
    Object.assign(this, { regions, u: uniforms, enabled: true, region: null, active: false, shown: [], recastIn: 0 });
    for (const r of regions) { r.doorKey = r.doors?.() ?? 0; this.recast(r); }
  }

  /** Cast every window of a region against its walls and doors as they stand now. */
  recast(r) {
    const byLevel = new Map();
    for (const s of r.sources) {
      if (!byLevel.has(s.level)) byLevel.set(s.level, r.segs(s.level));
      castWindow(s, byLevel.get(s.level));
    }
  }

  /**
   * Every frame after DayCycle.update. env: { eye (Vector3), sky (Color: the sky's colour), skyLight (the day's hemi sky
   * intensity, LIGHTING.sky blend × daylight × overcast), day (daylight share 0 … 1, 0 under the courtyard), fill
   * (DirectionalLight: colour, intensity, position → target), blinds, curtains }.
   */
  update(dt, env) {
    const u = this.u, A = u.winA.value;
    const r = this.enabled && env.day > 0.001 ? pickRegion(this.regions, env.eye.x, env.eye.y, env.eye.z) : null;
    this.region = r;
    this.active = !!r;
    if (!r) { A[3] = 0; A[2] = 0; this.shown = []; return; }
    // a door of this flat moved: its windows' rays again (at most every `recast` s)
    this.recastIn -= dt;
    const key = r.doors?.() ?? 0;
    if (key !== r.doorKey && this.recastIn <= 0) { r.doorKey = key; this.recast(r); this.recastIn = WL.recast; }
    const list = this.shown = pickWindows(r.sources, env.eye.x, env.eye.y, env.eye.z);
    const S = u.winSrc.value, V = u.winVis.value;
    list.forEach((s, i) => {
      s.pass = windowPass(s, env.blinds, env.curtains);
      S.set([s.x, s.y, s.z, s.pass], i * 12);
      S.set([s.nx, s.nz, s.hw, s.hh], i * 12 + 4);
      S.set([s.ox, s.oz, s.y0, s.y1], i * 12 + 8);
      V.set(s.vis, i * RAYS);
    });
    A[0] = baseFactor(env.day); A[2] = list.length; A[3] = 1;
    const B = u.winBox.value, Y = u.winY.value;
    B[0] = r.box.x0; B[1] = r.box.z0; B[2] = r.box.x1; B[3] = r.box.z1; Y[0] = r.box.y0; Y[1] = r.box.y1;
    const k = WL.gain * env.skyLight, K = u.winSky.value;
    K[0] = env.sky.r * k; K[1] = env.sky.g * k; K[2] = env.sky.b * k;
    const F = u.winFill.value, D = u.winFillDir.value, fl = env.fill;
    if (fl) {
      const c = fl.intensity * WL.fillCut;
      F[0] = fl.color.r * c; F[1] = fl.color.g * c; F[2] = fl.color.b * c;
      const dx = fl.position.x - fl.target.position.x, dy = fl.position.y - fl.target.position.y, dz = fl.position.z - fl.target.position.z, l = Math.hypot(dx, dy, dz) || 1;
      D[0] = dx / l; D[1] = dy / l; D[2] = dz / l;
    } else F.fill(0);
  }
}

if (!lowMemory) installWindowLight(); // (phones: never — no extra uniforms in their programs; their light stays the global one)
