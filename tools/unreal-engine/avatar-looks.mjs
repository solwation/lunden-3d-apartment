// #2291: the web's look codes for Unreal, written to tools/unreal-engine/avatar-looks.json.
//
// A look code (src/config.js encodeAvatarLook / decodeAvatarLook) is 7, 9 or 12 digits and an extension of tagged fields
// (a letter and 1-3 digits, each tag a few fields packed in mixed radix). Unreal's look component
// (/Game/Lunden/Avatar/Looks/BPC_LundenLook, build_avatar_looks.py) keeps the code as its digits and one integer per tag,
// so decoding and encoding are exact by construction, and reads each look field through the table written here:
// a digit position or a tag, a multiplier and a radix. Everything below is derived from src/config.js at run time
// (the digit ranges from avatarCodeValid, the tag order and packing from encodeAvatarLook on test looks), and the same
// table-driven reader is checked against the web's own decodeAvatarLook for every field of thousands of random looks.
//
// Exact for the codes the web's encoder writes (every web client's code). A hand-written extension the web's decoder
// would normalise (a zero or out-of-range tag value, a `u` with one of the first ten tops) is kept as written.
//
// `samples` are fixed codes (legacy 7 and 9 digits, a chosen height, extended tags, wire tags) with the web's own
// re-encoding and field values; tests/test_avatar_looks.py checks Unreal's component against them.
//
// Run (Node, no browser):  node tools/unreal-engine/avatar-looks.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const out = path.join(here, 'avatar-looks.json');
globalThis.window ??= globalThis; globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const C = await import(pathToFileURL(path.join(root, 'src/config.js')).href);
const { encodeAvatarLook: encode, decodeAvatarLook: decode, avatarCodeValid: valid } = C;
const hex = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : String(c).toLowerCase());

// Digits: the largest digit avatarCodeValid accepts at each of the nine positions.
const digitNames = ['skinDigit', 'topDigit', 'pants', 'shoes', 'hair', 'style', 'sleeves', 'gender', 'facial'];
const digits = digitNames.map((name, i) => {
  let max = 0;
  for (let d = 0; d <= 9; d++) if (valid('0'.repeat(i) + d + '0'.repeat(8 - i))) max = d;
  return { name, max };
});

// Tags: their order and packing come from the web's encoder. A look with every extended field set shows the order.
const S = C.AVATAR_SHAPE, shapeNames = Object.keys(S.fields);
const full = decode('012340100');
Object.assign(full, {
  eyes: C.EYES[3], freckles: 1, skinSeed: 2, top: C.TOPS[10], skin: C.SKIN_TONES[C.SKIN.length].c, bodyBuild: 6,
  glasses: 2, earrings: 1, hat: 1, age: 2, phones: 1, shoeModel: 1, socks: 1, necklace: 1, beardCut: 0, ring: 2, metal: 1,
  bracelet: 1, watch: 1, brows: C.HAIR[1], legs: 1, lipstick: 1, cut: 1, outer: 1, pattern: 1, noseForm: 1,
});
for (const n of shapeNames) full[n] = 2;
const tagOrder = [...encode(full).replace(/^[0-9]+/, '').matchAll(/([a-z])[0-9]+/g)].map((m) => m[1]);
const tagOf = (look) => Object.fromEntries([...encode(look).replace(/^[0-9]+/, '').matchAll(/([a-z])([0-9]+)/g)].map((m) => [m[1], Number(m[2])]));

// Field table: name -> { at: digit index | 'height' | tag letter, mult, radix (0 = the rest), none (value when absent) }.
// Mults and radices are read back from the encoder: a field's mult is the tag value of the look with only that field at 1.
function mult(tag, set) {
  const lk = decode('012340100'); Object.assign(lk, set);
  return tagOf(lk)[tag];
}
const L = C.AVATAR_MAKEUP.lips.names.length, E = C.AVATAR_MAKEUP.eyes.names.length;
const fields = [
  ...digits.map((d, i) => ({ name: d.name, at: i, mult: 1, radix: 10, none: 0 })),
  { name: 'height', at: 'height', mult: 1, radix: 0, none: -1 },
  { name: 'eyes', at: 'c', mult: mult('c', { eyes: C.EYES[1] }), radix: C.EYES.length, none: 0 },
  { name: 'freckles', at: 'c', mult: mult('c', { freckles: 1 }), radix: 4, none: 0 },
  { name: 'marks', at: 'c', mult: mult('c', { marks: 1 }), radix: 2, none: 0 },
  { name: 'blotch', at: 'c', mult: mult('c', { blotch: 1 }), radix: 2, none: 0 },
  { name: 'skinSeed', at: 'c', mult: mult('c', { freckles: 1, skinSeed: 1 }) - mult('c', { freckles: 1 }), radix: 0, none: 0 },
  { name: 'uTop', at: 'u', mult: 1, radix: mult('u', { top: C.TOPS[0], skin: C.SKIN_TONES[C.SKIN.length].c }), none: -1 },
  { name: 'skinExt', at: 'u', mult: mult('u', { top: C.TOPS[0], skin: C.SKIN_TONES[C.SKIN.length].c }), radix: 0, none: 0 },
  { name: 'bodyBuild', at: C.AVATAR_BUILD.tag, mult: 1, radix: 0, none: -1 },
  ...shapeNames.filter((n) => n !== 'noseSize').map((n) => ({ name: n, at: S.fields[n].tag, mult: 1, radix: 0, none: S.mid })),
  { name: 'noseSize', at: S.fields.noseSize.tag, mult: 1, radix: mult(S.fields.noseSize.tag, { noseForm: 1 }) - S.mid, none: S.mid },
  { name: 'noseForm', at: S.fields.noseSize.tag, mult: mult(S.fields.noseSize.tag, { noseForm: 1 }) - S.mid, radix: 0, none: 0 },
  { name: 'glasses', at: C.AVATAR_GLASSES.tag, mult: 1, radix: mult(C.AVATAR_GLASSES.tag, { earrings: 1 }), none: 0 },
  { name: 'earrings', at: C.AVATAR_GLASSES.tag, mult: mult(C.AVATAR_GLASSES.tag, { earrings: 1 }), radix: 0, none: 0 },
  { name: 'hat', at: C.AVATAR_HAT.tag, mult: 1, radix: mult(C.AVATAR_HAT.tag, { age: 1 }), none: 0 },
  { name: 'age', at: C.AVATAR_HAT.tag, mult: mult(C.AVATAR_HAT.tag, { age: 1 }), radix: 0, none: 0 },
  { name: 'phones', at: C.AVATAR_PHONES.tag, mult: 1, radix: mult(C.AVATAR_PHONES.tag, { shoeModel: 1 }), none: 0 },
  { name: 'shoeModel', at: C.AVATAR_PHONES.tag, mult: mult(C.AVATAR_PHONES.tag, { shoeModel: 1 }), radix: mult(C.AVATAR_PHONES.tag, { socks: 1 }) / mult(C.AVATAR_PHONES.tag, { shoeModel: 1 }), none: 0 },
  { name: 'socks', at: C.AVATAR_PHONES.tag, mult: mult(C.AVATAR_PHONES.tag, { socks: 1 }), radix: 0, none: 0 },
  { name: 'necklace', at: C.AVATAR_NECKLACE.tag, mult: 1, radix: mult(C.AVATAR_NECKLACE.tag, { beardCut: 1, facial: 0 }), none: 0 },
  { name: 'beardCut', at: C.AVATAR_NECKLACE.tag, mult: mult(C.AVATAR_NECKLACE.tag, { beardCut: 1, facial: 0 }), radix: 0, none: 0 },
  { name: 'ring', at: C.AVATAR_RING.tag, mult: 1, radix: 0, none: 0 },
  { name: 'metal', at: C.AVATAR_RING.metalTag, mult: 1, radix: mult(C.AVATAR_RING.metalTag, { bracelet: 1 }), none: 0 },
  { name: 'bracelet', at: C.AVATAR_RING.metalTag, mult: mult(C.AVATAR_RING.metalTag, { bracelet: 1 }), radix: mult(C.AVATAR_RING.metalTag, { watch: 1 }) / mult(C.AVATAR_RING.metalTag, { bracelet: 1 }), none: 0 },
  { name: 'watch', at: C.AVATAR_RING.metalTag, mult: mult(C.AVATAR_RING.metalTag, { watch: 1 }), radix: 0, none: 0 },
  { name: 'brows', at: C.AVATAR_BROWS.tag, mult: 1, radix: 0, none: -1 },
  { name: 'legs', at: C.AVATAR_CLOTHES.legs.tag, mult: 1, radix: C.AVATAR_MAKEUP.pack, none: 0 },
  { name: 'lipstick', at: C.AVATAR_CLOTHES.legs.tag, mult: C.AVATAR_MAKEUP.pack, radix: L, none: 0 },
  { name: 'eyeMakeup', at: C.AVATAR_CLOTHES.legs.tag, mult: C.AVATAR_MAKEUP.pack * L, radix: E, none: 0 },
  { name: 'blush', at: C.AVATAR_CLOTHES.legs.tag, mult: C.AVATAR_MAKEUP.pack * L * E, radix: 0, none: 0 },
  { name: 'cut', at: C.AVATAR_CLOTHES.cut.tag, mult: 1, radix: 3, none: 0 },
  { name: 'outer', at: C.AVATAR_CLOTHES.cut.tag, mult: 3, radix: 3, none: 0 },
  { name: 'outerMode', at: C.AVATAR_CLOTHES.cut.tag, mult: 9, radix: 2, none: 0 },
  { name: 'pattern', at: C.AVATAR_CLOTHES.cut.tag, mult: C.AVATAR_PATTERN.pack, radix: 0, none: 0 },
  { name: 'build', at: 'd', mult: 1, radix: 0, none: -1 },
  { name: 'tallIndex', at: 's', mult: 1, radix: 0, none: -1 },
];
// The multipliers above are read from the encoder; these packings are the decoder's own constants (#2147, #2170).
if (mult(C.AVATAR_CLOTHES.cut.tag, { cut: 0, outer: 1 }) !== 3 || mult(C.AVATAR_CLOTHES.cut.tag, { outer: 1, outerMode: 1 }) !== 12)
  throw new Error('avatar-looks: the cut tag no longer packs cut + 3 x (outer + 3 x mode)');
if (mult(C.AVATAR_CLOTHES.legs.tag, { legs: 0, lipstick: 1 }) !== C.AVATAR_MAKEUP.pack)
  throw new Error('avatar-looks: the legs tag no longer packs legs + pack x makeup');
const tags = [...tagOrder, 'd', 's'].map((tag) => ({ tag, encode: tagOrder.includes(tag) }));

// The reader Unreal implements: digits and one value per tag, then field = floor(value / mult) mod radix.
function parse(code) {
  const m = /^([0-9]+)([a-z].*)?$/.exec(code);
  if (!m || !valid(m[1])) return null;
  const ext = m[2] ?? '', tagv = {};
  if (ext.length <= C.AVATAR_LOOK_EXT_MAX && /^(?:[a-z][0-9]{1,3}){0,28}$/.test(ext))
    for (const [, t, v] of ext.matchAll(/([a-z])([0-9]{1,3})/g)) if (tags.some((x) => x.tag === t)) tagv[t] = Number(v);
  return { digits: m[1], tagv };
}
function field(p, f) {
  if (typeof f.at === 'number') return f.at < p.digits.length ? Number(p.digits[f.at]) : f.none;
  if (f.at === 'height') return p.digits.length === 12 ? Number(p.digits.slice(9)) : f.none;
  if (!(f.at in p.tagv)) return f.none;
  const v = Math.floor(p.tagv[f.at] / f.mult);
  return f.radix ? v % f.radix : v;
}
function unrealEncode(p) {
  const d = p.digits.length === 7 ? p.digits + '00' : p.digits;
  return d + tags.filter((t) => t.encode && t.tag in p.tagv).map((t) => t.tag + p.tagv[t.tag]).join('');
}
// What the look's colours and choices resolve to (BPC_LundenLook's Apply reads the same).
function resolved(p) {
  const get = (n) => field(p, fields.find((f) => f.name === n));
  const skinExt = get('skinExt'), uTop = get('uTop');
  return {
    skin: skinExt ? C.SKIN.length - 1 + skinExt : get('skinDigit'), top: uTop >= 0 ? uTop : get('topDigit'),
    pants: get('pants'), shoes: get('shoes'), hair: get('hair'), style: get('style'), sleeves: get('sleeves'),
    gender: get('gender'), facial: get('facial'), height: get('height'),
  };
}
// The web's own answers for the same fields.
function web(code) {
  const lk = decode(code, 'avatar-looks'), idx = (arr, c) => arr.indexOf(c);
  const shape = Object.fromEntries(shapeNames.map((n) => [n, lk[n]]));
  return {
    skin: C.skinToneIndex(lk), top: idx(C.TOPS, lk.top), pants: idx(C.PANTS, lk.pants), shoes: idx(C.SHOES, lk.shoes),
    hair: idx(C.HAIR, lk.hair), style: lk.style, sleeves: lk.sleeves, gender: lk.gender, facial: lk.facial,
    height: Number.isInteger(lk.height) ? lk.height : -1, eyes: idx(C.EYES, lk.eyes),
    freckles: lk.freckles ?? 0, marks: lk.marks ?? 0, blotch: lk.blotch ?? 0, skinSeed: lk.skinSeed ?? 0,
    bodyBuild: Number.isInteger(lk.bodyBuild) ? lk.bodyBuild : -1, ...shape, noseForm: C.noseFormOf(lk),
    glasses: lk.glasses, earrings: lk.earrings, hat: lk.hat, age: C.ageStepOf(lk), phones: lk.phones,
    shoeModel: C.shoeModelOf(lk), socks: C.socksOf(lk), necklace: lk.necklace, beardCut: lk.beardCut ?? 0, ring: lk.ring,
    metal: lk.metal, bracelet: lk.bracelet, watch: lk.watch, brows: lk.brows == null ? -1 : idx(C.HAIR, lk.brows),
    legs: lk.legs ?? 0, ...(() => { const m = C.makeupOf(lk); return { lipstick: m.lip, eyeMakeup: m.eye, blush: m.blush }; })(),
    cut: lk.cut ?? 0, outer: lk.outer ?? 0, outerMode: lk.outer ? lk.outerMode ?? 0 : 0, pattern: C.patternOf(lk),
  };
}
function compare(code) {
  const p = parse(code), w = web(code), r = p && { ...resolved(p) };
  if (!p) return valid(code.replace(/[a-z].*$/, '')) ? ['unparsed'] : [];
  const bad = [];
  for (const [k, v] of Object.entries(w)) {
    const f = fields.find((x) => x.name === k);
    const got = k in r ? r[k] : f ? field(p, f) : undefined;
    if (got !== v) bad.push(`${k}: table ${got}, web ${v}`);
  }
  const again = encode(decode(code, 'avatar-looks'));
  if (unrealEncode(p) !== again) bad.push(`encode: table ${unrealEncode(p)}, web ${again}`);
  return bad;
}

// Random looks through the web's own encoder: the table must agree on every field and on the re-encoding.
let rnd = 2291;
const pick = (n) => { rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0; return (rnd >>> 8) % n; };
const failures = [];
const RANDOM = 4000;
for (let i = 0; i < RANDOM; i++) {
  const lk = decode(String(pick(5)) + pick(10) + pick(6) + pick(4) + pick(8) + pick(5) + pick(2) + pick(2) + pick(4) + (pick(2) ? String(100 + pick(101)) : ''), 'x');
  const r = (n, p = 0.4) => (pick(1000) / 1000 < p ? pick(n) : undefined);
  const extra = {
    eyes: C.EYES[pick(C.EYES.length)], freckles: r(4), marks: r(2), blotch: r(2), skinSeed: r(C.AVATAR_SKIN_VARIATION.seeds),
    top: pick(3) ? undefined : C.TOPS[pick(C.TOPS.length)], skin: pick(3) ? undefined : C.SKIN_TONES[pick(C.SKIN_TONES.length)].c,
    bodyBuild: r(C.AVATAR_BUILD.steps), glasses: r(C.AVATAR_GLASSES.names.length), earrings: r(C.AVATAR_EARRINGS.names.length),
    hat: r(C.AVATAR_HAT.names.length), age: r(C.AVATAR_AGE.steps), phones: r(C.AVATAR_PHONES.names.length),
    shoeModel: r(C.AVATAR_SHOES.models.length), socks: r(C.AVATAR_SHOES.socks.length), necklace: r(C.AVATAR_NECKLACE.names.length),
    beardCut: r(C.AVATAR_BEARD_CUT.names.length), ring: r(11), metal: r(C.AVATAR_RING.metals.length), bracelet: r(7), watch: r(7),
    brows: pick(4) ? undefined : C.HAIR[pick(C.HAIR.length)], legs: r(C.AVATAR_CLOTHES.legs.names.length), lipstick: r(L),
    eyeMakeup: r(E), blush: r(C.AVATAR_MAKEUP.blush.names.length), cut: r(3), outer: r(3), outerMode: r(2),
    pattern: r(C.AVATAR_PATTERN.names.length), noseForm: r(C.AVATAR_NOSE_FORMS.names.length),
    ...Object.fromEntries(shapeNames.map((n) => [n, r(S.steps)])),
  };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) lk[k] = v;
  const code = encode(lk), bad = compare(code);
  if (bad.length) failures.push(`${code}: ${bad.slice(0, 4).join('; ')}`);
}

// Fixed samples: legacy, height, extended, wire (d / s are read and not re-encoded, as encodeAvatarLook).
const sampleLooks = [
  ['legacy 7 digits', '1234567'.replace(/./g, (d, i) => String(Math.min(Number(d), digits[i].max)))],
  ['legacy 9 digits', '012340100'], ['9 digits, all maxima', digits.map((d) => d.max).join('')],
  ['chosen height 188', '310231011188'], ['chosen height 100', '000000000100'], ['chosen height 200', '444321113200'],
];
const extended = [
  ['eyes and freckles', { eyes: C.EYES[5], freckles: 2, marks: 1, skinSeed: 3 }],
  ['extended skin tone and red top', { skin: C.SKIN_TONES[C.SKIN_TONES.length - 1].c, top: C.TOPS[10] }],
  ['body build and face sliders', { bodyBuild: 7, eyeSize: 6, noseSize: 2, noseForm: 2 }],
  ['glasses, earrings, hat, age', { glasses: 4, earrings: 3, hat: 3, age: 5 }],
  ['headphones, boots and socks', { phones: 2, shoeModel: 1, socks: 2 }],
  ['necklace, ring, bracelet, watch', { necklace: 3, ring: 7, metal: 2, bracelet: 3, watch: 4 }],
  ['brows, skirt and makeup', { brows: C.HAIR[6], legs: 3, lipstick: 2, eyeMakeup: 1, blush: 1 }],
  ['hoodie, open jacket, stripes', { cut: 2, outer: 1, outerMode: 1, pattern: 1 }],
  ['everything at once', full],
];
const samples = sampleLooks.map(([what, code]) => ({ what, code }));
for (const [what, set] of extended) {
  const lk = decode('310231011177'); Object.assign(lk, set);
  samples.push({ what, code: encode(lk) });
}
samples.push({ what: 'wire code with build and seeded scale', code: C.encodeAvatarWireLook(Object.assign(decode('012340100', 'w'), { build: 2, tall: C.AVATAR_SEEDED_TALL[4] })) });
for (const s of samples) {
  const bad = compare(s.code);
  if (bad.length) failures.push(`sample ${s.what} ${s.code}: ${bad.join('; ')}`);
  const p = parse(s.code);
  s.encoded = encode(decode(s.code, 'avatar-looks'));
  s.fields = Object.fromEntries(fields.map((f) => [f.name, field(p, f)]));
  s.resolved = resolved(p);
}
// Malformed codes and extensions: the web refuses the whole code (its seed look) or drops only the extension.
const edgeCodes = ['', '12345', '1234567890', '512340100', '0123401001', '012340100099', '012340100201', 'abc', '01234a100',
  '012340100,c1', '0123-0100', 'O12340100', '012340100C1', '012340100c1234', '012340100c', '012340100c1x'];
const edgeCases = edgeCodes.map((code) => {
  const m = /^([0-9]+)([a-z].*)?$/.exec(code), ok = !!m && valid(m[1]);
  const p = parse(code);
  if (!!p !== ok || (p && unrealEncode(p) !== encode(decode(code, 'avatar-looks')))) failures.push(`edge case ${JSON.stringify(code)}`);
  return { code, valid: ok, encoded: ok ? encode(decode(code, 'avatar-looks')) : '' };
});
if (failures.length) {
  console.error(`avatar-looks: the table disagrees with the web for ${failures.length} codes:\n  ${failures.slice(0, 12).join('\n  ')}`);
  process.exit(1);
}

// The mirror (#2291): the hall's IKEA NISSEDAL (src/config.js HALL_WALL.tall, src/keycabinet.js nissedal()), whose glass
// the web renders with a Reflector. Its glass is T.w − 2·frame by T.h − 2·frame, T.depth − 2 mm out from the wall along the
// mirror's local +z; Unreal's glass sits 1 mm in front of the imported one. A camera for the picture pair stands 0.8 m
// in front of it at the web's standing eye height.
const { webToUnreal, webYawToUnrealYaw } = await import(pathToFileURL(path.join(here, 'coordinates.mjs')).href);
const T = C.HALL_WALL.tall, nWeb = [Math.sin(T.rotY), 0, Math.cos(T.rotY)], out1 = T.depth - 0.002 + 0.001;
const centreWeb = [T.x + nWeb[0] * out1, T.y, T.z + nWeb[2] * out1];
const nU = webToUnreal(nWeb).map((v) => Math.round(v / 100 * 1e6) / 1e6), round = (v) => Math.round(v * 1000) / 1000;
const viewWeb = [T.x + nWeb[0] * 0.8, T.z + nWeb[2] * 0.8], viewYawWeb = Math.round(Math.atan2(nWeb[0], nWeb[2]) * 180 / Math.PI) + 0; // facing −n: web yaw 0 = north, 90 = west
const mirror = {
  what: 'the hall mirror (src/config.js HALL_WALL.tall): glass centre and outward normal in Unreal cm, glass size in cm',
  centre: webToUnreal(centreWeb).map(round), normal: nU, yaw: round(Math.atan2(nU[1], nU[0]) * 180 / Math.PI),
  width: round((T.w - 2 * T.frame) * 100), height: round((T.h - 2 * T.frame) * 100),
  view: { webAt: `${round(viewWeb[0])},${round(viewWeb[1])},${viewYawWeb}`, unreal: webToUnreal([viewWeb[0], 0, viewWeb[1]]).map(round),
    unrealYaw: round(webYawToUnrealYaw(viewYawWeb)), eyeCm: round(C.PLAYER.eye * 100) },
};

const looks = {
  formatVersion: 1,
  what: '#2291: look codes for Unreal (build_avatar_looks.py, tests/test_avatar_looks.py). Generated by ' +
    'tools/unreal-engine/avatar-looks.mjs from src/config.js; never edit by hand.',
  source: 'src/config.js encodeAvatarLook, decodeAvatarLook, avatarCodeValid, SKIN_TONES, TOPS, PANTS, SHOES, HAIR, EYES, AVATAR_HEIGHT',
  digits, height: { min: C.AVATAR_HEIGHT.min, max: C.AVATAR_HEIGHT.max, base: C.AVATAR_HEIGHT.base },
  extMax: C.AVATAR_LOOK_EXT_MAX, extMaxTags: 28, tags, fields,
  // The digit the encoder writes for each top (an extended top writes its own digit too) and each skin tone's old tone.
  topDigit: C.TOPS.map((t) => Number(encode(Object.assign(decode('012340100'), { top: t }))[1])),
  palettes: {
    skin: C.SKIN_TONES.map((t) => ({ colour: hex(t.c), near: t.near })), top: C.TOPS.map(hex), pants: C.PANTS.map(hex),
    shoes: C.SHOES.map(hex), hair: C.HAIR.map(hex), eyes: C.EYES.map(hex),
  },
  randomLooksChecked: RANDOM,
  samples,
  edgeCases,
  mirror,
};
const text = JSON.stringify(looks, (k, v) => (k === 'fields' && Array.isArray(v) ? v.map((f) => `@@${JSON.stringify(f)}@@`) : v), 1)
  .replace(/"@@(.*?)@@"/g, (m, r) => JSON.parse(`"${r}"`)) + '\n';
if (process.argv.includes('--check')) {
  const old = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (old !== text) { console.error(`avatar-looks: ${path.relative(root, out)} is stale; run node tools/unreal-engine/avatar-looks.mjs`); process.exit(1); }
  console.log(`avatar-looks: ${path.relative(root, out)} matches src/config.js (${RANDOM} random looks and ${samples.length} samples agree)`);
} else {
  fs.writeFileSync(out, text);
  console.log(`avatar-looks: wrote ${path.relative(root, out)} (${tags.length} tags, ${fields.length} fields; ${RANDOM} random looks and ${samples.length} samples agree with the web)`);
}
