// #2180: interior mapping for the neighbours' near window glass: a fake room (floor, ceiling, side walls, back wall, a furniture
// block) with curtains / blinds / sheers drawn per window, raymarched in the fragment shader of the EXISTING neighborGlass
// material. Per pane, three vec4 vertex attributes (baked once, in glasspanes.js paneTints) carry the room box and dressing;
// the room is a pure function of the pane's centre (deterministic, no random). One uniform (daylight) is the only runtime state.
// No texture, geometry, draw call, light or render pass is added; phones (lowMemory) keep the plain glass and get no attributes.
// Evening: #2120's additive window quads stay the lamp light; roomLightGlow() shapes them (lamp pool, darker floor, drawn
// curtains / blinds) so a lit window no longer lights up as a flat square. Pure helpers at the top run in Node (tools/interiormaptest.mjs).
import { ROOM_MAP as R } from './config.js';
import { keyRandom } from './windowschedule.js';
import { lowMemory } from './lowmemory.js';
import { rememberFragmentCompile } from './vertexcompile.js';

/** Rooms only where the phone profile is not active (no extra vertex data, no extra fragment work there). */
export const roomsOn = !lowMemory;
const KIND_NAMES = R.kinds.map((k) => k.name);
const span = (r, [a, b]) => a + r() * (b - a);

/** Curtain kind index (0 open, 1 curtain, 2 blind, 3 sheer, 4 roller) and its cover share for a window, from a 0…1 draw each. */
function dressing(r) {
  let x = r() * R.kinds.reduce((s, k) => s + k.share, 0), i = 0;
  for (; i < R.kinds.length - 1; i++) if ((x -= R.kinds[i].share) < 0) break;
  return { kind: i, name: KIND_NAMES[i], cover: span(r, R.kinds[i].cover) };
}
/** The three palette picks of a room from its seed (0…1): the shader repeats exactly these formulas. */
export function roomColours(seed) {
  const pick = (list, k) => list[Math.floor((Math.fround(seed) * k) % 1 * list.length)];
  return { wall: pick(R.paletteWall, 1), floor: pick(R.paletteFloor, 7.31), fabric: pick(R.paletteFabric, 13.7) };
}
/** A window's fake room from its pane centre (x, y, z) and half sizes (m). Vertical numbers are relative to the pane centre,
 * the lateral ones along the viewer's right (t = up × outward normal), so a room's offset margins are fixed per pane. */
export function roomSpec(cx, cy, cz, halfw, halfh) {
  const r = keyRandom(`room:${Math.round(cx * 100)},${Math.round(cy * 100)},${Math.round(cz * 100)}`);
  const door = halfh * 2 > R.doorMin, floorV = -halfh - (door ? R.doorSill : span(r, R.sill)), ceilV = floorV + span(r, R.height);
  const d = dressing(r);
  return { depth: span(r, R.depth), floorV, ceilV: Math.max(ceilV, halfh + 0.1), latLo: -halfw - span(r, R.margin), latHi: halfw + span(r, R.margin),
    kind: d.kind, name: d.name, cover: d.cover, seed: r(), halfw, halfh };
}
/** The 12 numbers one vertex carries: roomC = (cx, cy, cz, depth), roomA = (floorV, ceilV, latLo, latHi), roomB = (kind + 0.99 cover,
 * seed, halfw, halfh). depth 0 = no room (frames, rails, thick boxes: plain glass). */
export function roomVertex(lo, hi) {
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], along = Math.max(ext[0], ext[2]), thin = Math.min(ext[0], ext[2]);
  if (along < R.minPane * 2 || ext[1] < R.minPane * 2 || thin > R.maxThickness) return new Array(12).fill(0);
  const c = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2), s = roomSpec(c[0], c[1], c[2], along / 2, ext[1] / 2);
  return [c[0], c[1], c[2], s.depth, s.floorV, s.ceilV, s.latLo, s.latHi, s.kind + 0.99 * s.cover, s.seed, s.halfw, s.halfh];
}

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const vec3s = (list) => list.map((c) => `vec3( ${c.map(f).join(', ')} )`).join(', ');
const VERT_HEAD = `attribute vec4 roomC; attribute vec4 roomA; attribute vec4 roomB;
varying vec4 vRoomC; varying vec4 vRoomA; varying vec4 vRoomB;`;
const VERT_BODY = `vRoomC = vec4( ( modelViewMatrix * vec4( roomC.xyz, 1.0 ) ).xyz, roomC.w ); vRoomA = roomA; vRoomB = roomB;`;
const FRAG_HEAD = `uniform vec2 uRoomLevel; // x room brightness, y fabric (backlit by the day)
varying vec4 vRoomC; varying vec4 vRoomA; varying vec4 vRoomB;
float rmHash( float n ) { n = fract( n * 0.1031 ); n *= n + 33.33; n *= n + n; return fract( n ); }
const vec3 RM_WALL[${R.paletteWall.length}] = vec3[${R.paletteWall.length}]( ${vec3s(R.paletteWall)} );
const vec3 RM_FLOOR[${R.paletteFloor.length}] = vec3[${R.paletteFloor.length}]( ${vec3s(R.paletteFloor)} );
const vec3 RM_FABRIC[${R.paletteFabric.length}] = vec3[${R.paletteFabric.length}]( ${vec3s(R.paletteFabric)} );
int rmPick( float seed, float k, int n ) { return int( floor( fract( seed * k ) * float( n ) ) ); }
// The room behind this fragment of the pane and its dressing, as outgoing radiance (view space, origin at the camera).
vec3 roomColour( vec3 P, vec3 n, out float k ) {
  k = 0.0;
  vec3 dir = normalize( P ), upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  vec3 t = normalize( cross( upV, n ) ), b = cross( n, t ), p = P - vRoomC.xyz;
  float l0 = dot( p, t ), v0 = dot( p, b ), rl = dot( dir, t ), rv = dot( dir, b ), rd = -dot( dir, n );
  if ( abs( dot( n, upV ) ) > 0.5 || rd < 0.03 ) return vec3( 0.0 );
  rl = abs( rl ) < 1e-4 ? 1e-4 : rl; rv = abs( rv ) < 1e-4 ? 1e-4 : rv;
  float tl = ( rl > 0.0 ? vRoomA.w - l0 : vRoomA.z - l0 ) / rl, tv = ( rv > 0.0 ? vRoomA.y - v0 : vRoomA.x - v0 ) / rv, td = vRoomC.w / rd;
  float tt = min( td, min( tl, tv ) ), hl = l0 + rl * tt, hv = v0 + rv * tt, seed = vRoomB.y;
  vec3 wall = RM_WALL[ rmPick( seed, 1.0, ${R.paletteWall.length} ) ], flr = RM_FLOOR[ rmPick( seed, 7.31, ${R.paletteFloor.length} ) ], fab = RM_FABRIC[ rmPick( seed, 13.7, ${R.paletteFabric.length} ) ];
  vec3 alb = wall * 0.85;
  if ( tt == td ) {
    alb = wall;
    float fx = hl - mix( vRoomA.z, vRoomA.w, 0.2 + 0.6 * rmHash( seed * 91.7 ) );
    if ( abs( fx ) < 0.35 + 0.3 * rmHash( seed * 31.1 ) && hv < vRoomA.x + 0.55 + 0.9 * rmHash( seed * 17.3 ) ) alb *= 0.4; // a wardrobe / sofa block
  } else if ( tt == tv ) alb = rv < 0.0 ? flr : wall * 1.15;
  float att = exp( -rd * tt * 0.38 );
  vec3 room = alb * uRoomLevel.x * ( 0.35 + 0.65 * att );
  float kind = floor( vRoomB.x + 0.001 ), cover = fract( vRoomB.x ) / 0.99, cm = 0.0, hw = vRoomB.z, hh = vRoomB.w;
  float drop = ( hh - v0 ) / ( 2.0 * hh );
  vec3 fc = fab * uRoomLevel.y;
  if ( kind > 3.5 ) { // roller blind drawn from the top, a darker bar at its foot
    cm = 1.0 - smoothstep( cover - 0.01, cover, drop ); fc = mix( fab, vec3( 0.8 ), 0.55 ) * uRoomLevel.y * ( 1.0 - 0.35 * smoothstep( cover - 0.04, cover - 0.01, drop ) );
  } else if ( kind > 2.5 ) { // sheer curtain over the whole pane, the room shows through
    cm = 0.55 + 0.1 * sin( l0 * 14.0 + seed * 30.0 ); fc = vec3( 0.86, 0.85, 0.8 ) * uRoomLevel.y;
  } else if ( kind > 1.5 ) { // slatted blind from the top: slats with dark gaps
    float s = fract( v0 * 30.0 );
    cm = ( 1.0 - smoothstep( cover - 0.01, cover, drop ) ) * mix( 0.3, 1.0, smoothstep( 0.05, 0.25, s ) );
    fc = mix( fab, vec3( 0.85 ), 0.6 ) * uRoomLevel.y * ( 0.8 + 0.2 * s );
  } else if ( kind > 0.5 ) { // curtains drawn in from both sides, folds
    float edge = hw - abs( l0 ), w = cover * 2.0 * hw;
    cm = 1.0 - smoothstep( w - 0.03, w, edge ); fc *= 0.72 + 0.28 * sin( l0 * 22.0 + seed * 40.0 );
  }
  k = ${f(R.strength)} * ( 1.0 - pow( 1.0 - saturate( rd ), 3.0 ) );
  return mix( room, fc, cm );
}`;
const FRAG_BODY = `if ( vRoomC.w > 0.0 ) {
  float roomK; vec3 roomRgb = roomColour( -vViewPosition, normal, roomK );
  outgoingLight = mix( outgoingLight - totalEmissiveRadiance, roomRgb, roomK ) + totalEmissiveRadiance;
}`;
/** The patch as a function of three's shader object (exported for the Node test, which checks the anchors exist). */
export function interiorMapShader(shader) { // (three passes the renderer as a 2nd argument: no defaulted parameters here)
  const put = (src, anchor, text, after = true) => {
    if (!src.includes(anchor)) throw new Error(`interiormap: missing ${anchor}`);
    return src.replace(anchor, after ? `${anchor}\n${text}` : `${text}\n${anchor}`);
  };
  shader.uniforms.uRoomLevel = roomUniforms.uRoomLevel;
  shader.vertexShader = put(put(shader.vertexShader, '#include <common>', VERT_HEAD), '#include <project_vertex>', VERT_BODY);
  shader.fragmentShader = put(put(shader.fragmentShader, '#include <common>', FRAG_HEAD), '#include <opaque_fragment>', FRAG_BODY, false);
  return shader;
}
const roomUniforms = { uRoomLevel: { value: { x: R.day, y: 0.55 } } };
/** Brightness of the fake rooms for night 0 (day) … 1 (dark): the room itself fades to R.night, the curtains (backlit by the day) further. */
export function roomLevels(night) { const d = 1 - Math.min(1, Math.max(0, night)); return [R.night + (R.day - R.night) * d, 0.04 + 0.5 * d]; }
export function setRoomNight(night) { const [a, b] = roomLevels(night); roomUniforms.uRoomLevel.value.x = a; roomUniforms.uRoomLevel.value.y = b; }
rememberFragmentCompile(interiorMapShader); // positions untouched (detail.js phone culling)
/** Patch a glass material in place (all share one program and the daylight uniform); on phones the material stays plain. */
export function interiorGlass(material) {
  if (!roomsOn) return material;
  material.onBeforeCompile = interiorMapShader; material.customProgramCacheKey = () => 'room-glass-2180'; material.userData.rooms = true;
  return material;
}

// Evening quads (#2120): the same small patch on the additive window quad. `uv` 0…1 over the window, seed from the instance place.
const GLOW_VERT_HEAD = 'varying vec2 vGlowUv; varying float vGlowSeed;';
const GLOW_VERT_BODY = 'vGlowUv = uv; vGlowSeed = fract( sin( dot( instanceMatrix[ 3 ].xyz, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );';
const G = R.glow;
const GLOW_FRAG = `float gs = vGlowSeed, gx = vGlowUv.x, gy = vGlowUv.y;
float lampX = 0.25 + 0.5 * fract( gs * 7.1 ), lamp = exp( -( pow( ( gx - lampX ) * 1.6, 2.0 ) + pow( ( gy - 0.92 ) * 1.1, 2.0 ) ) * 3.0 );
float gl = ${f(G.base)} + ${f(G.lamp)} * lamp;
gl *= mix( 1.0, ${f(G.floor)}, smoothstep( 0.35, 0.0, gy ) );
if ( gs < 0.3 ) { float c = 0.12 + 0.3 * fract( gs * 13.0 ); gl *= mix( 1.0, ${f(G.curtain)}, 1.0 - smoothstep( c - 0.03, c, min( gx, 1.0 - gx ) ) ); }
else if ( gs < 0.55 ) { float d = 0.2 + 0.7 * fract( gs * 11.0 ); gl *= mix( 1.0, ${f(G.curtain)} + 0.3 * smoothstep( 0.1, 0.4, fract( gy * 18.0 ) ), 1.0 - smoothstep( d - 0.02, d, 1.0 - gy ) ); }
diffuseColor.rgb *= gl;`;
export function roomLightShader(shader) {
  const put = (src, anchor, text) => { if (!src.includes(anchor)) throw new Error(`interiormap: missing ${anchor}`); return src.replace(anchor, `${anchor}\n${text}`); };
  shader.vertexShader = put(put(shader.vertexShader, '#include <common>', GLOW_VERT_HEAD), '#include <project_vertex>', GLOW_VERT_BODY);
  shader.fragmentShader = put(put(shader.fragmentShader, '#include <common>', 'varying vec2 vGlowUv; varying float vGlowSeed;'), '#include <color_fragment>', GLOW_FRAG);
  return shader;
}
rememberFragmentCompile(roomLightShader);
/** The instanced window-light material: lamp pool and drawn curtains on a lit window (phones: the flat quad as before). */
export function roomLightGlow(material) {
  if (!roomsOn) return material;
  material.onBeforeCompile = roomLightShader; material.customProgramCacheKey = () => 'room-glow-2180';
  return material;
}
