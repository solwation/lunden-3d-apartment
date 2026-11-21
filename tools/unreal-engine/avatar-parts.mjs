// #2291: the web's own figure, cut into parts for Unreal. Runs the web's figure builder (src/avatar.js
// avatarModelGeometry, three.js in Node, no browser) for many looks and keeps every part the builder adds (one `add()`
// in its `parts()`: a sleeve, a hairstyle's shell, a hat kind, a ring ...) with the attributes the builder gives it:
// bind-pose positions and normals, the 15-bone skin, the colour region and shade. A part's rule says for which looks
// the builder makes it: geometry choices (style, sleeves, gender, facial hair and its cut, trouser and top model, shoe
// model, socks) from the looks the builder was run for, and the accessory a vertex shader keeps (glasses, earrings, hat,
// headphones, necklace, ring, bracelet, watch; everything else collapses to a point) from `shownBy` below, which mirrors
// that shader's choice in src/avatar.js (`faceShape`). Parts with the same rule are one piece, written as one GLB on the
// skeleton of models/avatar-rigged.glb (same bones, same bind), so Unreal imports every piece onto SK_LundenWebAvatar.
//
//   node tools/unreal-engine/avatar-parts.mjs [--out DIR] [--check]
//
// writes tools/unreal-engine/avatar-parts.json (pieces, rules, palette regions, heights, the web's answers for the
// avatar-looks.json samples) and, with --out, the pieces' GLBs (build inputs for build_avatar_looks.py, not committed;
// the JSON records their SHA-256). --check fails when the JSON no longer matches the web.
//
// Not carried (the web shapes them in its vertex shader, Unreal keeps the bind shape): face and head sliders, the
// gender's face form, body build, hair length and tucking under a hat, finger poses, cloth, age, freckles, make-up,
// patterns. Rings, bracelets and watches keep their metal's default colour; the clear lenses (see-through on the web) and
// the smartphone in the hand are left out.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_JSON = path.join(ROOT, 'tools/unreal-engine/avatar-parts.json');
const args = process.argv.slice(2), check = args.includes('--check');
const outDir = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : null;

// Record what the figure builder merges: src/avatar.js's base() merges its parts with mergeGeometries, and the
// geometry it hands out shares the merged position attribute, so that attribute finds the parts again.
const real = import.meta.resolve('three/addons/utils/BufferGeometryUtils.js');
const wrapper = `import * as real from ${JSON.stringify(real)}; export * from ${JSON.stringify(real)};
export function mergeGeometries(geos, groups) { const r = real.mergeGeometries(geos, groups);
  if (r) (globalThis.__avatarMerges ??= new Map()).set(r.attributes.position, geos); return r; }`;
// The builder also caches every variant it built (a module-private Map, several MB each); the loader hands that Map to
// this script so looks it is done with can be dropped (hundreds of variants would otherwise need ~9 GB).
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec === 'three/addons/utils/BufferGeometryUtils.js' && ctx.parentURL?.endsWith('/src/avatar.js'))
    return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(wrapper)}), shortCircuit: true };
  return next(spec, ctx); }
export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (!url.endsWith('/src/avatar.js')) return r;
  const text = String(r.source), from = 'const bases = new Map();';
  if (!text.includes(from)) throw new Error('avatar-parts: src/avatar.js has no ' + from);
  return { ...r, source: text.replace(from, 'const bases = globalThis.__avatarBases = new Map();') };
}`;
register('data:text/javascript,' + encodeURIComponent(hooks), import.meta.url);
globalThis.self ??= globalThis;
const C = await import(pathToFileURL(path.join(ROOT, 'src/config.js')).href);
const A = await import(pathToFileURL(path.join(ROOT, 'src/avatar.js')).href);
const { PHONE_PART } = await import(pathToFileURL(path.join(ROOT, 'src/avatarphone.js')).href);
const LOOKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/unreal-engine/avatar-looks.json'), 'utf8'));
const RIG = fs.readFileSync(path.join(ROOT, 'models/avatar-rigged.glb'));

// --- looks from field values (avatar-looks.json's table) --------------------------------------------------------------
const FIELDS = Object.fromEntries(LOOKS.fields.map((f) => [f.name, f]));
const BASE = '012340100'; // the samples' plain look
function codeFor(values) {
  const digits = BASE.split(''), tags = {};
  for (const [name, v] of Object.entries(values)) {
    const f = FIELDS[name];
    if (typeof f.at === 'number') digits[f.at] = String(v);
    else tags[f.at] = (tags[f.at] ?? 0) + v * f.mult;
  }
  return digits.join('') + LOOKS.tags.filter((t) => tags[t.tag]).map((t) => t.tag + tags[t.tag]).join('');
}
const lookOf = (values) => C.decodeAvatarLook(codeFor(values), 'avatar-parts');

// The geometry choices: every value the web's decoder keeps (it drops a value it does not know).
const AXES = ['style', 'sleeves', 'gender', 'facial', 'beardCut', 'legs', 'cut', 'shoeModel', 'socks'];
const RANGE = Object.fromEntries(AXES.map((a) => [a, [0, ...Array.from({ length: 9 }, (_, i) => i + 1).filter((v) => {
  const lk = lookOf({ [a]: v, ...(a === 'beardCut' ? { facial: 1 } : {}) });
  return lk[a] === v;
})]]));
// The accessories the vertex shader keeps or collapses (the uniform each look sets, src/avatar.js applyFaceShape).
const SHOWN = { glasses: C.AVATAR_GLASSES.names.length, earrings: C.AVATAR_EARRINGS.names.length, hat: C.AVATAR_HAT.names.length,
  phones: C.AVATAR_PHONES.names.length, necklace: C.AVATAR_NECKLACE.names.length, ring: 11, bracelet: 7, watch: 7 };

/** The shader's choice for a part (src/avatar.js faceShape), as {uniform: kept values}; null = always shown. */
function shownBy(part) {
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const P = { rimRound: 8, rimSquare: 9, specs: 10, hatDome: 12, peakFront: 13, peakBack: 14, knit: 15, hatCrown: 16, hatBrim: 17,
    phoneBand: 18, phoneCup: 19, phoneNeck: 20, studs: 21, lens: 25, lensRound: 27, lensSquare: 28, aviator: 29, chain: 30,
    pearls: 31, pendant: 32, ring: 40, braceletBase: 50 };
  if (part >= 100) return null; // fingers
  if (Object.values(PHONE_PART).includes(part)) return false; // the smartphone in the hand (#2217): only while in use
  if (part === P.lensRound || part === P.lensSquare) return false; // clear lenses: alpha-to-coverage on the web, not drawn here
  if (part === P.rimRound) return { glasses: [1] };
  if (part === P.rimSquare) return { glasses: [2, 3] };
  if (part === P.specs) return { glasses: range(1, SHOWN.glasses - 1) };
  if (part === P.lens) return { glasses: [3] };
  if (part === P.aviator) return { glasses: range(4, SHOWN.glasses - 1) };
  if (part > P.phoneNeck && part < P.lens) return { earrings: [part - P.studs + 1] };
  if (part >= P.braceletBase) { const grp = Math.floor(part / 10), idx = part - grp * 10; return { [grp < 6 ? 'bracelet' : 'watch']: [idx + 1] }; }
  if (part >= P.ring) return { ring: [part - P.ring + 1] };
  if (part >= P.chain) return { necklace: part === P.chain ? [1, 3] : part === P.pearls ? [2] : part === P.pendant ? [3] : [4] };
  if (part > P.hatBrim && part <= P.phoneNeck) return { phones: part > P.phoneCup ? [2] : [1] };
  if (part >= P.hatDome && part <= P.hatBrim) return { hat: part === P.hatDome ? [1, 2] : part === P.peakFront ? [1] : part === P.peakBack ? [2] : part === P.knit ? [3] : [4] };
  return null;
}

// --- run the builder ---------------------------------------------------------------------------------------------------
const partsSeen = new Map(); // signature -> { geo, face, seen: Set of variant keys }
const variants = new Map(); // key -> { values, parts: Set of signatures }
const hashOf = (g) => {
  const h = crypto.createHash('sha1');
  for (const a of ['position', 'normal', 'region', 'color', 'skinIndex', 'skinWeight', 'facePart']) h.update(Buffer.from(g.attributes[a].array.buffer, g.attributes[a].array.byteOffset, g.attributes[a].array.byteLength));
  return h.digest('hex').slice(0, 16);
};
const keyOf = (lk) => AXES.map((a) => a === 'beardCut' ? C.beardCutOf(lk) : a === 'shoeModel' ? C.shoeModelOf(lk) : a === 'socks' ? C.socksOf(lk) : lk[a] | 0).join('_');
const keep = new Set(LOOKS.samples.map((s) => keyOf(C.decodeAvatarLook(s.code, 'avatar-parts')))); // read again below
function run(values) {
  const lk = lookOf(values);
  const key = keyOf(lk);
  if (variants.has(key)) return key;
  const g = A.avatarModelGeometry(lk), geos = globalThis.__avatarMerges.get(g.attributes.position);
  if (!geos) throw new Error('avatar-parts: the figure builder did not merge through mergeGeometries');
  const sigs = new Set();
  for (const part of geos) {
    const sig = hashOf(part);
    if (!partsSeen.has(sig)) partsSeen.set(sig, { geo: part, face: part.attributes.facePart.array[0], seen: new Set() });
    partsSeen.get(sig).seen.add(key);
    sigs.add(sig);
  }
  variants.set(key, { values: Object.fromEntries(key.split('_').map((v, i) => [AXES[i], Number(v)])), parts: sigs });
  if (!keep.has(key)) { // done with this look: only its new parts stay (in partsSeen)
    globalThis.__avatarMerges.delete(g.attributes.position);
    for (const [k, b] of globalThis.__avatarBases) if (b.attributes.position === g.attributes.position) globalThis.__avatarBases.delete(k);
  }
  return key;
}
const pick = (list, r) => list[Math.floor(r() * list.length)];
let seed = 2291; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const plain = Object.fromEntries(AXES.map((a) => [a, 0]));
run(plain);
for (const a of AXES) for (const v of RANGE[a]) run({ ...plain, [a]: v, ...(a === 'beardCut' ? { facial: 1 } : {}) });
// Every pair of values of every two choices, the rest at random: a part that depends on any two choices shows it.
for (let i = 0; i < AXES.length; i++) for (let j = i + 1; j < AXES.length; j++) for (const vi of RANGE[AXES[i]]) for (const vj of RANGE[AXES[j]])
  run({ ...Object.fromEntries(AXES.map((a) => [a, pick(RANGE[a], rand)])), [AXES[i]]: vi, [AXES[j]]: vj });
for (let i = 0; i < 200; i++) run(Object.fromEntries(AXES.map((a) => [a, pick(RANGE[a], rand)])));
// Then ask the builder directly: for every value a part was never seen with, rerun a look it was in with that value.
for (let round = 0; round < 4; round++) {
  const before = variants.size;
  for (const p of [...partsSeen.values()]) {
    const seen = [...p.seen].map((k) => variants.get(k).values);
    for (const a of AXES) for (const v of RANGE[a]) if (!seen.some((x) => x[a] === v)) run({ ...seen[0], [a]: v, ...(a === 'beardCut' && v === 2 && ![1, 3].includes(seen[0].facial) ? { facial: 1 } : {}) });
  }
  if (variants.size === before) break;
}

// A part's rule: the looks it is built for, as alternatives (`any`), each the values of every choice. One box usually
// does; a part built for either of two choices (a long sleeve: long sleeves, or the long-sleeved top model) takes one box
// per value of the choice that splits it. Checked: the rules give exactly the builder's parts for every look it ran.
const allValues = RANGE;
const boxOf = (keys) => {
  const box = {};
  for (const a of AXES) {
    const vals = [...new Set(keys.map((k) => variants.get(k).values[a]))].sort((x, y) => x - y);
    if (vals.length < allValues[a].length) box[a] = vals;
  }
  return box;
};
const inBox = (box, values) => Object.entries(box).every(([a, vals]) => !AXES.includes(a) || vals.includes(values[a]));
const exact = (boxes, sig) => [...variants.values()].every((v) => boxes.some((b) => inBox(b, v.values)) === v.parts.has(sig));
const rules = new Map(), failures = [];
for (const [sig, p] of partsSeen) {
  const seen = [...p.seen];
  let boxes = [boxOf(seen)];
  if (!exact(boxes, sig)) {
    boxes = null;
    for (const a of AXES) {
      const split = allValues[a].map((v) => seen.filter((k) => variants.get(k).values[a] === v)).filter((ks) => ks.length).map((ks) => ({ ...boxOf(ks), [a]: [variants.get(ks[0]).values[a]] }));
      const merged = [];
      for (const b of split) { const twin = merged.find((m) => JSON.stringify({ ...m, [a]: 0 }) === JSON.stringify({ ...b, [a]: 0 })); if (twin) twin[a] = [...twin[a], ...b[a]].sort(); else merged.push(b); }
      if (exact(merged, sig)) { boxes = merged; break; }
    }
    if (!boxes) { failures.push(`part ${sig} (facePart ${p.face}): no rule of one or two choices matches the builder`); boxes = [boxOf(seen)]; }
  }
  const shown = shownBy(p.face);
  if (shown !== false) rules.set(sig, boxes.map((b) => ({ ...b, ...(shown ?? {}) })));
}

// --- pieces: parts with the same rule ---------------------------------------------------------------------------------
const groups = new Map();
for (const [sig, when] of rules) {
  const id = JSON.stringify(when.map((b) => Object.keys(b).sort().map((k) => [k, b[k]])));
  if (!groups.has(id)) groups.set(id, { when, sigs: [] });
  groups.get(id).sigs.push(sig);
}
const pieces = [...groups.values()].sort((a, b) => JSON.stringify(a.when).localeCompare(JSON.stringify(b.when)) || a.sigs[0].localeCompare(b.sigs[0]))
  .map((g, i) => ({ name: `SKM_LundenLookPiece_${String(i).padStart(3, '0')}`, any: g.when, parts: g.sigs.sort() }));

// --- GLB writer on the rig's own skeleton -----------------------------------------------------------------------------
const rigJson = JSON.parse(RIG.subarray(20, 20 + RIG.readUInt32LE(12)).toString('utf8'));
const rigBin = RIG.subarray(28 + RIG.readUInt32LE(12));
const skin = rigJson.skins[0], ibmAcc = rigJson.accessors[skin.inverseBindMatrices], ibmView = rigJson.bufferViews[ibmAcc.bufferView];
const ibm = rigBin.subarray((ibmView.byteOffset ?? 0) + (ibmAcc.byteOffset ?? 0), (ibmView.byteOffset ?? 0) + (ibmAcc.byteOffset ?? 0) + 64 * skin.joints.length);
const jointOf = Object.fromEntries(skin.joints.map((n, j) => [rigJson.nodes[n].name, j]));
const NAMES = ['hips', 'torso', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'thighL', 'kneeL', 'thighR', 'kneeR', 'footL', 'footR']; // src/olof.js NAMES (checked below)
function glb(piece) {
  const geos = piece.parts.map((s) => partsSeen.get(s).geo), n = geos.reduce((t, g) => t + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 4), uv = new Float32Array(n * 2), uv1 = new Float32Array(n * 2), uv2 = new Float32Array(n * 2), jo = new Uint16Array(n * 4), we = new Float32Array(n * 4);
  let o = 0;
  for (const g of geos) {
    const k = g.attributes.position.count, at = g.attributes;
    pos.set(at.position.array, o * 3); nor.set(at.normal.array, o * 3); we.set(at.skinWeight.array, o * 4);
    for (let i = 0; i < k; i++) {
      for (let c = 0; c < 4; c++) jo[(o + i) * 4 + c] = jointOf[NAMES[at.skinIndex.array[i * 4 + c]]];
      const r = at.region.array[i];
      col.set([at.color.array[i * 3], at.color.array[i * 3 + 1], at.color.array[i * 3 + 2], 1], (o + i) * 4);
      uv.set([r, at.color.array[i * 3]], (o + i) * 2); // UV0: the colour region and the shade (src/avatar.js REGION)
      uv1.set([at.color.array[i * 3], at.color.array[i * 3 + 1]], (o + i) * 2); // UV1, UV2: a fixed colour (linear), exact where
      uv2[(o + i) * 2] = at.color.array[i * 3 + 2]; //                              a vertex colour would be rounded to 8 bits
    }
    o += k;
  }
  const min = [0, 1, 2].map((c) => Math.min(...pos.filter((_, i) => i % 3 === c))), max = [0, 1, 2].map((c) => Math.max(...pos.filter((_, i) => i % 3 === c)));
  const chunks = [], views = [], accessors = [];
  const add = (arr, type, ctype, extra = {}) => {
    const off = chunks.reduce((t, b) => t + b.length, 0), buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(buf, Buffer.alloc((4 - (buf.length % 4)) % 4));
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
    accessors.push({ bufferView: views.length - 1, componentType: ctype, count: arr.length / { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type], type, ...extra });
    return accessors.length - 1;
  };
  const attributes = { POSITION: add(pos, 'VEC3', 5126, { min, max }), NORMAL: add(nor, 'VEC3', 5126), COLOR_0: add(col, 'VEC4', 5126),
    TEXCOORD_0: add(uv, 'VEC2', 5126), TEXCOORD_1: add(uv1, 'VEC2', 5126), TEXCOORD_2: add(uv2, 'VEC2', 5126), JOINTS_0: add(jo, 'VEC4', 5123), WEIGHTS_0: add(we, 'VEC4', 5126) };
  const inv = add(new Float32Array(ibm.buffer.slice(ibm.byteOffset, ibm.byteOffset + ibm.byteLength)), 'MAT4', 5126);
  const nodes = rigJson.nodes.map((x) => ({ name: x.name, ...(x.translation ? { translation: x.translation } : {}), ...(x.rotation ? { rotation: x.rotation } : {}), ...(x.children ? { children: x.children } : {}) }));
  const rootIdx = rigJson.scenes[0].nodes[0];
  nodes[rootIdx] = { ...nodes[rootIdx], name: piece.name, mesh: 0, skin: 0 };
  const json = { asset: { version: '2.0', generator: 'lunden avatar-parts.mjs (#2291)' }, scene: 0, scenes: [{ nodes: [rootIdx] }], nodes,
    meshes: [{ name: piece.name, primitives: [{ attributes, material: 0 }] }], materials: [{ name: 'M_LundenLook', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 } }],
    skins: [{ joints: skin.joints, inverseBindMatrices: inv, skeleton: skin.skeleton }], accessors, bufferViews: views, buffers: [{ byteLength: chunks.reduce((t, b) => t + b.length, 0) }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks), head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return { buf: Buffer.concat([head, jh, js, bh, bin]), vertices: n };
}
const olof = await import(pathToFileURL(path.join(ROOT, 'src/olof.js')).href);
if (JSON.stringify(olof.NAMES) !== JSON.stringify(NAMES)) failures.push(`src/olof.js NAMES changed: ${olof.NAMES}`);
for (const name of NAMES) if (!(name in jointOf)) failures.push(`models/avatar-rigged.glb has no bone ${name}`);
for (const name of NAMES) {
  const b = olof.bindAt(name), m = ibm.subarray(jointOf[name] * 64, jointOf[name] * 64 + 64), f = new Float32Array(m.buffer.slice(m.byteOffset, m.byteOffset + 64));
  if (Math.abs(f[12] + b.x) + Math.abs(f[13] + b.y) + Math.abs(f[14] + b.z) > 1e-5) failures.push(`bind of ${name} differs from src/olof.js`);
}

// --- heights and the samples ------------------------------------------------------------------------------------------
/** The web figure's scale (src/avatar.js Avatar constructor): a chosen height scales it whole and its head bone, else `tall` its height. */
function scaleOf(lk) {
  if (Number.isInteger(lk.height)) { const { body, head } = C.avatarProportions(lk.height); return { x: body, y: body, head }; }
  return { x: 1, y: lk.tall ?? 1, head: 1 };
}
/** The look's pieces, by the rules (what Unreal shows). */
function piecesOf(lk) {
  const v = { style: lk.style, sleeves: lk.sleeves, gender: lk.gender ?? 0, facial: Number(lk.facial ?? 0) || 0, beardCut: C.beardCutOf(lk), legs: lk.legs | 0, cut: lk.cut | 0,
    shoeModel: C.shoeModelOf(lk), socks: C.socksOf(lk), glasses: lk.glasses | 0, earrings: lk.earrings | 0, hat: lk.hat | 0, phones: lk.phones | 0,
    necklace: lk.necklace | 0, ring: lk.ring | 0, bracelet: C.wristValue(lk.bracelet), watch: C.wristValue(lk.watch) };
  return { values: v, pieces: pieces.filter((p) => p.any.some((b) => Object.entries(b).every(([a, vals]) => vals.includes(v[a])))).map((p) => p.name) };
}
const headY = olof.bindAt('head').y;
/** The standing height in cm (bind pose, the top of the shown geometry): what the web draws. */
function heightOf(lk, names) {
  const s = scaleOf(lk); let top = 0;
  for (const p of pieces.filter((q) => names.includes(q.name))) for (const sig of p.parts) {
    const g = partsSeen.get(sig).geo, pos = g.attributes.position.array, sk = g.attributes.skinIndex.array, w = g.attributes.skinWeight.array;
    for (let i = 0; i < pos.length / 3; i++) {
      const onHead = NAMES[sk[i * 4]] === 'head' && w[i * 4] > 0.99, y = onHead ? headY + (pos[i * 3 + 1] - headY) * s.head : pos[i * 3 + 1];
      top = Math.max(top, y);
    }
  }
  return Math.round(top * s.y * 100 * 1000) / 1000;
}
const REGIONS = { skin: 0, top: 1, pants: 2, hair: 3, fixed: 4, shoes: 5, lips: 6, iris: 7, beard: 8, brow: 9, leather: 10 }; // src/avatar.js REGION (5 = the shoes)
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
/** The colour of every region in the web's own figure for a look (src/avatar.js avatarModelGeometry: colour = palette × shade). */
function paletteOf(lk) {
  const g = A.avatarModelGeometry(lk), col = g.attributes.color.array, reg = g.attributes.region.array, out = {};
  const base = globalThis.__avatarMerges.get(g.attributes.position);
  const shade = new Float32Array(col.length / 3); let o = 0;
  for (const part of base) { const c = part.attributes.color.array; for (let i = 0; i < c.length / 3; i++) shade[o + i] = c[i * 3]; o += c.length / 3; }
  for (const [name, r] of Object.entries(REGIONS)) {
    if (r === REGIONS.fixed) continue;
    let best = -1;
    for (let i = 0; i < reg.length; i++) if (reg[i] === r && shade[i] > 0.2 && (best < 0 || shade[i] > shade[best])) best = i;
    if (best >= 0) out[name] = [0, 1, 2].map((c) => Math.round(col[best * 3 + c] / shade[best] * 1e6) / 1e6);
  }
  return out;
}
const samples = LOOKS.samples.map((s) => {
  const lk = C.decodeAvatarLook(s.code, 'avatar-parts'), { values, pieces: names } = piecesOf(lk), sc = scaleOf(lk);
  // Without a chosen height (or the wire's seeded `s`) the web scales by the player's seed, which a code does not carry.
  const known = Number.isInteger(lk.height) || /s[0-9]/.test(s.code.slice(9));
  return { what: s.what, code: s.code, values, pieces: names, scale: known ? sc : null, heightCm: known ? heightOf(lk, names) : null,
    linear: paletteOf(lk),
    colours: { skin: hex(lk.skin), top: hex(lk.top), pants: hex(lk.pants), hair: hex(lk.hair), shoes: hex(lk.shoes), iris: hex(lk.eyes), beard: hex(lk.beard ?? lk.hair), brow: hex(lk.brows ?? lk.hair) } };
});
// Every piece the samples' looks need is in the builder's output for that look (and nothing else).
for (const s of LOOKS.samples) {
  const lk = C.decodeAvatarLook(s.code, 'avatar-parts'), g = A.avatarModelGeometry(lk), built = new Set(globalThis.__avatarMerges.get(g.attributes.position).map(hashOf));
  const mine = new Set(pieces.filter((p) => piecesOf(lk).pieces.includes(p.name)).flatMap((p) => p.parts).filter((sig) => !rules.get(sig).some((b) => Object.keys(b).some((k) => !AXES.includes(k)))));
  for (const sig of mine) if (!built.has(sig)) failures.push(`${s.code}: piece part ${sig} not built by the web`);
}

const glbs = pieces.map((p) => ({ ...p, ...glb(p) }));
const out = {
  formatVersion: 1,
  what: 'The web figure (src/avatar.js avatarModelGeometry) in pieces on the models/avatar-rigged.glb skeleton, for Unreal (#2291). Written by tools/unreal-engine/avatar-parts.mjs.',
  axes: AXES, ranges: RANGE, shown: Object.fromEntries(Object.entries(SHOWN).map(([k, n]) => [k, Array.from({ length: n }, (_, i) => i)])),
  regions: REGIONS, heightRule: { base: C.AVATAR_HEIGHT.base, pivot: C.AVATAR_HEIGHT.pivot, top: C.AVATAR_HEIGHT.top, adult: C.AVATAR_HEIGHT.adult, headPow: C.AVATAR_HEIGHT.headPow, seededTall: C.AVATAR_SEEDED_TALL },
  // The lips: the skin mixed toward FACE.lipTint and darkened (src/avatar.js avatarModelGeometry), then a chosen lipstick (src/avatarmakeup.js lipColour).
  lips: { tint: hex(C.AVATAR_FACE.lipTint), skinMix: 0.35, dark: 0.92, lipstick: C.AVATAR_MAKEUP.lips.colours.map(hex), lipstickMix: C.AVATAR_MAKEUP.lips.mix },
  brows: C.HAIR.map(hex),
  core: pieces.find((p) => p.any.length === 1 && !Object.keys(p.any[0]).length)?.name,
  looksChecked: variants.size, partsFound: partsSeen.size,
  pieces: glbs.map((p) => ({ name: p.name, any: p.any, parts: p.parts.length, vertices: p.vertices, sha256: crypto.createHash('sha256').update(p.buf).digest('hex') })),
  samples,
};
if (failures.length) { console.error(`avatar-parts: ${failures.length} failures:\n  ` + failures.slice(0, 20).join('\n  ')); process.exit(1); }
const text = JSON.stringify(out, null, 1).replace(/\n {2,}([\]}0-9"-])/g, (m, c) => (/[\]}]/.test(c) ? c : ' ' + c)) + '\n';
if (check) {
  const old = fs.existsSync(OUT_JSON) ? fs.readFileSync(OUT_JSON, 'utf8').replace(/\r\n/g, '\n') : '';
  if (old !== text) { console.error('avatar-parts: tools/unreal-engine/avatar-parts.json is stale; run node tools/unreal-engine/avatar-parts.mjs'); process.exit(1); }
  console.log(`avatar-parts: avatar-parts.json matches the web (${pieces.length} pieces from ${partsSeen.size} parts, ${variants.size} looks)`);
} else {
  fs.writeFileSync(OUT_JSON, text);
  console.log(`avatar-parts: wrote ${path.relative(ROOT, OUT_JSON)} (${pieces.length} pieces from ${partsSeen.size} parts; rules checked on ${variants.size} looks)`);
}
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const p of glbs) fs.writeFileSync(path.join(outDir, p.name + '.glb'), p.buf);
  console.log(`avatar-parts: ${glbs.length} GLBs in ${outDir} (${glbs.reduce((t, p) => t + p.buf.length, 0) >> 10} KiB)`);
}
