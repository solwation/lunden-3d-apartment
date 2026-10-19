import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKIN, HAIR, TOPS, PANTS, SHOES,
  avatarLook, encodeAvatarLook, encodeAvatarWireLook, decodeAvatarLook, RESET_KEEP, AVATAR_SEEDED_TALL, splitAvatarCode, rifleHeadBaseY, rifleBoxHeadContact, PVP_HEAD_BOXES,
  AVATAR_HEIGHT, PLAYER, avatarHeightCm, avatarProportions, avatarEyeHeight, avatarCodeValid
} from '../src/config.js';
import { clearLocalHome } from '../src/reset.js';

test('#1156: Olof\'s hoodie colour is top 10; old top digits and seeded looks keep their colours', async () => {
  const { OLOF } = await import('../src/config.js');
  assert.equal(TOPS[10], OLOF.colors.hoodie);
  assert.deepEqual(TOPS.slice(0, 10), [0x2f6db5, 0xb5372f, 0x3c8a4e, 0xe0a82e, 0x7a4fb0, 0xe07a9a, 0x2e9aa8, 0xe8e8e0, 0x3a3f4a, 0xd9722e], 'appended, not reordered');
  for (let i = 0; i < 10; i++) assert.equal(decodeAvatarLook(`2${i}13021`, 'x').top, TOPS[i], `old digit ${i}`);
  for (let i = 0; i < 200; i++) assert.ok(TOPS.indexOf(avatarLook(`seed${i}`).top) < 10, 'seeds pick among the old ten');
  const look = { ...decodeAvatarLook('240302101', 'x'), top: TOPS[10] };
  const code = encodeAvatarLook(look);
  assert.equal(code, '210302101u10');
  assert.equal(decodeAvatarLook(code, 'x').top, TOPS[10]);
  assert.equal(decodeAvatarLook('210302101u99', 'x').top, TOPS[1], 'an unknown index keeps the digit');
});

test('avatar customization: palettes and encoding roundtrip', () => {
  assert.ok(SKIN.length >= 5, 'at least 5 skin colors');
  assert.ok(HAIR.length >= 8, 'at least 8 hair colors');
  assert.ok(TOPS.length >= 10, 'at least 10 tops');
  assert.ok(PANTS.length >= 6, 'at least 6 pants');
  assert.ok(SHOES.length >= 4, 'at least 4 shoes');

  const originalLook = {
    skin: SKIN[2],
    top: TOPS[4],
    pants: PANTS[1],
    shoes: SHOES[3],
    hair: HAIR[0],
    style: 2,
    sleeves: 1,
    gender: 1,
    facial: 2,
    build: 1,
    tall: 0.975
  };

  const code = encodeAvatarLook(originalLook);
  assert.match(code, /^[0-4][0-9][0-5][0-3][0-7][0-4][0-1][0-1][0-3]$/, 'encoded look is 9 digits within palette and variant ranges');

  const decoded = decodeAvatarLook(code, 'player123');
  assert.equal(decoded.skin, originalLook.skin);
  assert.equal(decoded.top, originalLook.top);
  assert.equal(decoded.pants, originalLook.pants);
  assert.equal(decoded.shoes, originalLook.shoes);
  assert.equal(decoded.hair, originalLook.hair);
  assert.equal(decoded.style, originalLook.style);
  assert.equal(decoded.sleeves, originalLook.sleeves);
  assert.equal(decoded.gender, 1);
  assert.equal(decoded.facial, 2);
  assert.equal(decoded.build, decodeAvatarLook(null, 'player123').build, 'build preserved from seed');
  assert.equal(decoded.tall, decodeAvatarLook(null, 'player123').tall, 'tall preserved from seed');

  // Backward compatibility with legacy 7-digit code:
  // legacy choices retain their look; missing facial hair gives no beard (facial: 0)
  const legacyCode = '2413021';
  const legacyDecoded = decodeAvatarLook(legacyCode, 'player123');
  assert.equal(legacyDecoded.skin, SKIN[2]);
  assert.equal(legacyDecoded.top, TOPS[4]);
  assert.equal(legacyDecoded.pants, PANTS[1]);
  assert.equal(legacyDecoded.shoes, SHOES[3]);
  assert.equal(legacyDecoded.hair, HAIR[0]);
  assert.equal(legacyDecoded.style, 2);
  assert.equal(legacyDecoded.sleeves, 1);
  assert.equal(legacyDecoded.gender, 0, 'legacy defaults to male/original figure');
  assert.equal(legacyDecoded.facial, 0, 'missing facial hair defaults to 0 (no beard)');

  // Fallback on invalid code
  const fallback = decodeAvatarLook('invalid', 'player123');
  assert.deepEqual(fallback, avatarLook('player123'));
});

test('#1244: curly hair (style 4) roundtrips; styles above 4 are rejected; old codes decode unchanged', () => {
  const lk = { skin: SKIN[1], top: TOPS[2], pants: PANTS[1], shoes: SHOES[0], hair: HAIR[3], style: 4, sleeves: 1, gender: 0, facial: 0 };
  const code = encodeAvatarLook(lk);
  assert.equal(code[5], '4');
  assert.equal(decodeAvatarLook(code).style, 4);
  assert.equal(encodeAvatarLook({ ...lk, style: 9 })[5], '4', 'clamped');
  assert.ok(avatarCodeValid(code) && !avatarCodeValid(code.slice(0, 5) + '5' + code.slice(6)));
  assert.equal(decodeAvatarLook(code.slice(0, 5) + '3' + code.slice(6)).style, 3);
});

test('#1244: trouser / top models roundtrip as tags; defaults add nothing; bad values ignored', () => {
  const lk = { skin: SKIN[1], top: TOPS[2], pants: PANTS[1], shoes: SHOES[0], hair: HAIR[3], style: 0, sleeves: 1, gender: 0, facial: 0 };
  assert.equal(encodeAvatarLook(lk), encodeAvatarLook({ ...lk, legs: 0, cut: 0 }));
  const code = encodeAvatarLook({ ...lk, legs: 2, cut: 1 });
  assert.match(code, /p2/); assert.match(code, /m1/);
  const d = decodeAvatarLook(code);
  assert.equal(d.legs, 2); assert.equal(d.cut, 1);
  const bad = decodeAvatarLook(encodeAvatarLook(lk) + 'p9m9');
  assert.ok(!bad.legs && !bad.cut);
  assert.ok(encodeAvatarWireLook({ ...lk, legs: 1, cut: 2, bodyBuild: 3, glasses: 2 }).length <= 9 + 48);
});

test('#1136 avatar height: backward-compatible code, proportions and eye height', () => {
  // old codes decode exactly as before: no height, the seed's own tall, the standard eye height
  for (const code of ['2413021', '241302113']) {
    const lk = decodeAvatarLook(code, 'player123');
    assert.equal(lk.height, undefined);
    assert.equal(lk.tall, avatarLook('player123').tall);
    assert.equal(encodeAvatarLook(lk), code.length === 7 ? code + '00' : code, 'no height digits without a chosen height');
    assert.equal(avatarEyeHeight(lk), PLAYER.eye);
    assert.equal(avatarHeightCm(lk), Math.round(AVATAR_HEIGHT.base * lk.tall));
  }
  // a chosen height adds three digits and round-trips
  for (const cm of [AVATAR_HEIGHT.min, 120, 165, 195, AVATAR_HEIGHT.max]) {
    const code = encodeAvatarLook({ ...decodeAvatarLook('241302113', 'p'), height: cm });
    assert.equal(code, '241302113' + String(cm).padStart(3, '0'));
    assert.ok(avatarCodeValid(code));
    const lk = decodeAvatarLook(code, 'p');
    assert.equal(lk.height, cm); assert.equal(lk.style, 2); assert.equal(lk.facial, 3);
    assert.equal(avatarHeightCm(lk), cm);
    const pr = avatarProportions(cm);
    // the whole figure (head pivot + scaled head) is the chosen height; the eye a little below the top
    assert.ok(Math.abs(pr.body * (AVATAR_HEIGHT.pivot + AVATAR_HEIGHT.top * pr.head) - cm / 100) < 1e-9);
    assert.ok(pr.eye < cm / 100 && pr.eye > cm / 100 - 0.2);
    assert.equal(avatarEyeHeight(lk), pr.eye);
  }
  // the standard figure: 175 cm = scale 1 with today's eye height; a child's head is relatively larger
  assert.ok(Math.abs(avatarProportions(AVATAR_HEIGHT.base).body - 1) < 1e-9);
  assert.ok(Math.abs(avatarProportions(AVATAR_HEIGHT.base).eye - PLAYER.eye) < 1e-9);
  assert.ok(avatarProportions(120).head > 1.1);
  assert.equal(avatarProportions(195).head, 1);
  assert.ok(Math.abs(avatarProportions(120).eye - 1.1) < 0.05, 'a 120 cm child looks from about 1.1 m');
  // out of range or malformed heights are rejected as a whole (as the Worker does)
  for (const bad of ['241302113099', '241302113201', '24130211317', '2413021131750', '2413021175'])
    assert.equal(avatarCodeValid(bad), false, bad);
  assert.deepEqual(decodeAvatarLook('241302113201', 'p'), avatarLook('p'));
  assert.equal(encodeAvatarLook({ ...avatarLook('p'), height: 250 }).length, 9, 'an out-of-range height is not encoded');
});

test('avatar customization: avatarLook seed vs look object independence', () => {
  const lookObj = { skin: 0xffdbac, top: 0x334455, pants: 0x112233, shoes: 0x000000, hair: 0x221100, style: 1, sleeves: 0 };
  assert.equal(avatarLook(lookObj), lookObj, 'look object returned as-is');

  const seedLook1 = avatarLook('player-seed');
  const seedLook2 = avatarLook('player-seed');
  assert.deepEqual(seedLook1, seedLook2, 'avatarLook for seed is deterministic');
});

test('avatar customization: customizer UI and callbacks', async () => {
  // Mock localStorage
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    get length() { return storage.size; },
    key: (i) => [...storage.keys()][i]
  };
  globalThis.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    get length() { return 0; },
    key: () => null
  };

  // Mock minimal DOM
  const listeners = new Map();
  const makeElement = (id = '', tagName = 'div') => {
    const elListeners = new Map();
    const children = [];
    return {
      id,
      tagName: tagName.toUpperCase(),
      dataset: {},
      hidden: false,
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
        toggle(c, force) { if (force !== undefined) { if (force) this.classes.add(c); else this.classes.delete(c); } else if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); }
      },
      style: {},
      children,
      append(...items) { children.push(...items); },
      querySelector(sel) {
        if (sel === '#avatar-preview-canvas') return canvas;
        return null;
      },
      querySelectorAll(sel) {
        return [];
      },
      addEventListener(ev, fn) {
        if (!elListeners.has(ev)) elListeners.set(ev, []);
        elListeners.get(ev).push(fn);
      },
      dispatch(ev, data = {}) {
        const fns = elListeners.get(ev) || [];
        for (const fn of fns) fn({ ...data, target: data.target || this, preventDefault() {}, stopImmediatePropagation() {} });
      },
      getContext(type) {
        if (type === '2d') {
          return {
            save() {}, restore() {}, scale() {}, translate() {}, clearRect() {}, fillRect() {},
            createLinearGradient() { return { addColorStop() {} }; },
            beginPath() {}, roundRect() {}, arc() {}, ellipse() {}, fill() {}, stroke() {},
            moveTo() {}, lineTo() {}, closePath() {}, quadraticCurveTo() {},
            set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}
          };
        }
        return null;
      }
    };
  };

  const canvas = makeElement('avatar-preview-canvas', 'canvas');
  canvas.width = 180;
  canvas.height = 280;

  const customizerEl = makeElement('avatar-customizer', 'div');
  customizerEl.hidden = true;
  customizerEl.append(canvas);

  const bodyEl = makeElement('body', 'body');

  globalThis.document = {
    body: bodyEl,
    getElementById(id) {
      if (id === 'avatar-customizer') return customizerEl;
      if (id === 'avatar-preview-canvas') return canvas;
      return null;
    }
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    dispatch(ev, data = {}) {
      const fns = listeners.get(ev) || [];
      for (const fn of fns) fn({ ...data, preventDefault() {}, stopImmediatePropagation() {} });
    }
  };

  const {
    setupAvatarCustomizer, openAvatarCustomizer, closeAvatarCustomizer, isAvatarCustomizerOpen
  } = await import('../src/customizer.js');

  let currentSavedLook = null;
  let openedCount = 0;
  let closedCount = 0;
  let lastCloseKey = null;

  const defaultLook = avatarLook('test-player');

  setupAvatarCustomizer({
    getLook: () => currentSavedLook ?? defaultLook,
    getDefaultLook: () => defaultLook,
    setLook: (lk) => { currentSavedLook = { ...lk }; },
    onOpen: () => { openedCount++; },
    onClose: (byKey) => { closedCount++; lastCloseKey = byKey; }
  });

  assert.equal(isAvatarCustomizerOpen(), false);
  openAvatarCustomizer();
  assert.equal(isAvatarCustomizerOpen(), true);
  assert.equal(customizerEl.hidden, false);
  assert.equal(bodyEl.classList.contains('avatar-customizer-open'), true, '#1201: body gets avatar-customizer-open class');
  assert.equal(openedCount, 1);

  // Click skin swatch
  const skinBtn = makeElement('', 'button');
  skinBtn.dataset.type = 'skin';
  skinBtn.dataset.index = '3';
  skinBtn.closest = () => skinBtn;
  customizerEl.dispatch('click', { target: skinBtn });

  // Click top swatch
  const topBtn = makeElement('', 'button');
  topBtn.dataset.type = 'top';
  topBtn.dataset.index = '7';
  topBtn.closest = () => topBtn;
  customizerEl.dispatch('click', { target: topBtn });

  // Click gender button (kvinna)
  const genderBtn = makeElement('', 'button');
  genderBtn.dataset.type = 'gender';
  genderBtn.dataset.index = '1';
  genderBtn.closest = () => genderBtn;
  customizerEl.dispatch('click', { target: genderBtn });

  // Click facial hair button (mustasch)
  const facialBtn = makeElement('', 'button');
  facialBtn.dataset.type = 'facial';
  facialBtn.dataset.index = '2';
  facialBtn.closest = () => facialBtn;
  customizerEl.dispatch('click', { target: facialBtn });

  // Close via button
  const saveBtn = makeElement('avatar-save-btn', 'button');
  saveBtn.closest = () => saveBtn;
  customizerEl.dispatch('click', { target: saveBtn });

  assert.equal(isAvatarCustomizerOpen(), false);
  assert.equal(customizerEl.hidden, true);
  assert.equal(bodyEl.classList.contains('avatar-customizer-open'), false, '#1201: body loses avatar-customizer-open class');
  assert.equal(closedCount, 1);
  assert.equal(lastCloseKey, 'button');

  // Verify saved in localStorage
  const savedStr = storage.get('lunden.avatar');
  assert.ok(savedStr, 'lunden.avatar was saved to storage');
  assert.equal(currentSavedLook.skin, SKIN[3]);
  assert.equal(currentSavedLook.top, TOPS[7]);
  assert.equal(currentSavedLook.gender, 1);
  assert.equal(currentSavedLook.facial, 2);

  // Test close via KeyE
  openAvatarCustomizer();
  assert.equal(isAvatarCustomizerOpen(), true);
  window.dispatch('keydown', { code: 'KeyE' });
  assert.equal(isAvatarCustomizerOpen(), false);
  assert.equal(lastCloseKey, 'KeyE');

  // Test close via Escape
  openAvatarCustomizer();
  assert.equal(isAvatarCustomizerOpen(), true);
  window.dispatch('keydown', { code: 'Escape' });
  assert.equal(isAvatarCustomizerOpen(), false);
  assert.equal(lastCloseKey, 'Escape');
});

test('avatar customization: clearLocalHome preserves the chosen avatar and resets home keys', (t) => {
  assert.ok(RESET_KEEP.includes('lunden.avatar'), 'the chosen avatar survives reset (#1148)');
  const previousStorage = globalThis.localStorage;
  t.after(() => { globalThis.localStorage = previousStorage; });
  const savedAvatar = '241302113165c5e8';

  const storage = new Map();
  storage.set('lunden.avatar', savedAvatar);
  storage.set('lunden.resume', '{"position":[1,0,2]}');
  storage.set('lunden.keepMe', 'transient'); // unknown home keys reset by default
  storage.set('other-project.setting', 'keep on the shared origin');
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    get length() { return storage.size; },
    key: (i) => [...storage.keys()][i]
  };

  const removed = clearLocalHome();
  assert.deepEqual(removed.sort(), ['lunden.keepMe', 'lunden.resume'], 'ordinary and unknown home keys reset');
  assert.equal(storage.get('lunden.avatar'), savedAvatar, 'appearance, chosen height and face fields preserved verbatim');
  assert.equal(storage.has('lunden.resume'), false);
  assert.equal(storage.has('lunden.keepMe'), false);
  assert.equal(storage.get('other-project.setting'), 'keep on the shared origin', 'other projects are untouched');
});

test('#1138 face fields: extension encoding, old codes unchanged, unknown tags skipped', async () => {
  const { EYES, AVATAR_SHAPE, avatarShape, splitAvatarCode } = await import('../src/config.js');
  // an untouched look still encodes as nine digits; old codes decode with the plain face
  const plain = avatarLook('face-plain');
  assert.match(encodeAvatarLook(plain), /^[0-9]{9}$/);
  for (const old of ['2413021', '241302113']) {
    const lk = decodeAvatarLook(old, 'p');
    assert.equal(lk.eyes, EYES[0]);
    for (const name of Object.keys(AVATAR_SHAPE.fields)) assert.equal(lk[name], AVATAR_SHAPE.mid, name);
    assert.equal(encodeAvatarLook(lk), old.length === 7 ? old + '00' : old, 'old codes re-encode unchanged');
  }
  // every middle step is the unchanged face (scale 1 / offset 0), the ends stay within [min, max]
  for (const [name, f] of Object.entries(AVATAR_SHAPE.fields)) {
    assert.equal(avatarShape(name, AVATAR_SHAPE.mid), f.zero ?? 1, name);
    assert.equal(avatarShape(name, 0), f.min); assert.equal(avatarShape(name, AVATAR_SHAPE.steps - 1), f.max);
    assert.equal(avatarShape(name, 99), f.zero ?? 1, 'out of range → the middle');
  }
  // round trip
  const face = { ...plain, eyes: EYES[5], eyeSize: 7, eyeShape: 1, headWidth: 0, headLength: 8, jaw: 2, noseSize: 6, noseWidth: 3, ears: 5, browThick: 8, browY: 0 };
  const code = encodeAvatarLook(face);
  assert.match(code, /^[0-9]{9}(?:[a-z][0-9]{1,3})+$/);
  const back = decodeAvatarLook(code, 'p');
  for (const k of ['eyes', ...Object.keys(AVATAR_SHAPE.fields)]) assert.equal(back[k], face[k], k);
  assert.equal(encodeAvatarLook(back), code);
  // the wire: nine digits for older clients, the rest beside them
  const { av, ax } = splitAvatarCode(code);
  assert.equal(av, code.slice(0, 9)); assert.equal(av + ax, code);
  assert.deepEqual(splitAvatarCode(code.slice(0, 9)), { av: code.slice(0, 9), ax: '' });
  // newer fields (e.g. the height, h) are skipped; out-of-range values keep the default; garbage falls back to the seed
  const withHeight = decodeAvatarLook(code.slice(0, 9) + 'h120c5', 'p');
  assert.equal(withHeight.eyes, EYES[5]); assert.equal(withHeight.skin, back.skin);
  assert.equal(decodeAvatarLook(code.slice(0, 9) + 'c99e9', 'p').eyes, EYES[0]);
  assert.equal(decodeAvatarLook(code.slice(0, 9) + 'c99e9', 'p').eyeSize, AVATAR_SHAPE.mid);
  assert.equal(decodeAvatarLook(code.slice(0, 9) + 'C3', 'p').skin, avatarLook('p').skin, 'malformed extension → seeded look');
  // #1136's height (three more digits) and the face extension together; the wire keeps all digits in av
  const both = encodeAvatarLook({ ...face, height: 120 });
  assert.equal(both, code.slice(0, 9) + '120' + code.slice(9));
  const bothBack = decodeAvatarLook(both, 'p');
  assert.equal(bothBack.height, 120); assert.equal(bothBack.eyes, EYES[5]); assert.equal(bothBack.browThick, 8);
  assert.deepEqual(splitAvatarCode(both), { av: code.slice(0, 9) + '120', ax: code.slice(9) });
  assert.equal(decodeAvatarLook(code.slice(0, 9) + '099' + code.slice(9), 'p').skin, avatarLook('p').skin, 'an invalid height still falls back');
});


test('#1165 hair length and glasses: tags h / g, old codes unchanged, bad values skipped, combined with face and height', async () => {
  const { AVATAR_SHAPE, AVATAR_GLASSES, avatarShape, splitAvatarCode } = await import('../src/config.js');
  const plain = avatarLook('hg-plain'), base = encodeAvatarLook(plain);
  assert.match(base, /^[0-9]{9}$/, 'an untouched look has no extension');
  assert.equal(avatarShape('hairLength', AVATAR_SHAPE.mid), 1);
  assert.equal(decodeAvatarLook(base, 'p').glasses, 0);
  const lk = { ...plain, hairLength: 1, glasses: 2 };
  const code = encodeAvatarLook(lk);
  assert.equal(code, base + 'h1g2');
  const back = decodeAvatarLook(code, 'p');
  assert.equal(back.hairLength, 1); assert.equal(back.glasses, 2); assert.equal(encodeAvatarLook(back), code);
  assert.equal(encodeAvatarLook({ ...plain, glasses: 0, hairLength: AVATAR_SHAPE.mid }), base, 'defaults are not written');
  assert.equal(encodeAvatarLook({ ...plain, glasses: 4 }), base, 'an unknown glasses kind (#1325: 3 is sunglasses) is not written');
  assert.equal(decodeAvatarLook(base + 'g9', 'p').glasses, 0, 'out-of-range glasses ignored');
  assert.equal(decodeAvatarLook(base + 'h9', 'p').hairLength, AVATAR_SHAPE.mid, 'out-of-range length ignored');
  assert.equal(AVATAR_GLASSES.names.length, 4);
  // together with the height and the face, and through the wire split
  const all = encodeAvatarLook({ ...lk, height: 140, eyeSize: 7 });
  assert.equal(all, base + '140' + 'e7h1g2');
  const ab = decodeAvatarLook(all, 'p');
  assert.equal(ab.height, 140); assert.equal(ab.eyeSize, 7); assert.equal(ab.glasses, 2); assert.equal(ab.hairLength, 1);
  assert.deepEqual(splitAvatarCode(all), { av: base + '140', ax: 'e7h1g2' });
  // the longest possible extension stays within the extension limit
  const everything = { ...plain, glasses: 2 };
  for (const [n, f] of Object.entries(AVATAR_SHAPE.fields)) everything[n] = n === 'jaw' ? 0 : 8;
  const ext = splitAvatarCode(encodeAvatarLook({ ...everything, eyes: 0x7c8288 })).ax;
  assert.ok(ext.length <= 48, ext);
});

test('#1191 neck length slider: tag a, mid default omitted, roundtrips, shifts head hitbox base Y', async () => {
  const { AVATAR_SHAPE, avatarShape, splitAvatarCode, rifleHeadBaseY } = await import('../src/config.js');
  const plain = avatarLook('neck-plain'), base = encodeAvatarLook(plain);
  assert.equal(avatarShape('neck', AVATAR_SHAPE.mid), 0);
  assert.equal(decodeAvatarLook(base, 'p').neck, AVATAR_SHAPE.mid);
  // Default neck is omitted from encoded string
  assert.equal(encodeAvatarLook({ ...plain, neck: AVATAR_SHAPE.mid }), base);
  // Min (0 -> -0.04) and Max (8 -> +0.04)
  assert.equal(avatarShape('neck', 0), -0.04);
  assert.equal(avatarShape('neck', 8), 0.04);
  const shortNeck = encodeAvatarLook({ ...plain, neck: 0 });
  assert.equal(shortNeck, base + 'a0');
  assert.equal(decodeAvatarLook(shortNeck, 'p').neck, 0);
  const longNeck = encodeAvatarLook({ ...plain, neck: 8 });
  assert.equal(longNeck, base + 'a8');
  assert.equal(decodeAvatarLook(longNeck, 'p').neck, 8);
  // Invalid values fallback to mid
  assert.equal(decodeAvatarLook(base + 'a9', 'p').neck, AVATAR_SHAPE.mid);
  // rifleHeadBaseY follows neck length
  const stateMid = { p: [0, 0, 0], r: 0, ...splitAvatarCode(base) };
  const stateLong = { p: [0, 0, 0], r: 0, ...splitAvatarCode(longNeck) };
  const stateShort = { p: [0, 0, 0], r: 0, ...splitAvatarCode(shortNeck) };
  const yMid = rifleHeadBaseY('neck-plain', stateMid);
  const yLong = rifleHeadBaseY('neck-plain', stateLong);
  const yShort = rifleHeadBaseY('neck-plain', stateShort);
  assert.ok(Math.abs(yLong - (yMid + 0.04 * plain.tall)) < 1e-6);
  assert.ok(Math.abs(yShort - (yMid - 0.04 * plain.tall)) < 1e-6);
});



test('#1173 wire-only seeded height preserves exact local proportions and saved codes', () => {
  for (const tall of AVATAR_SEEDED_TALL) {
    const look = { ...avatarLook('own-name'), tall };
    const saved = encodeAvatarLook(look), wire = encodeAvatarWireLook(look);
    assert.equal(encodeAvatarLook(look), saved);
    assert.equal(look.height, undefined);
    assert.match(wire, /s[0-4]$/);
    const state = { p: [0,0,0], r: 0, ...splitAvatarCode(wire) };
    assert.equal(rifleHeadBaseY('peer-id', state), tall * PVP_HEAD_BOXES.boxes[0].low);
    assert.ok(rifleBoxHeadContact('peer-id', state, [0,tall*1.64,2], [0,0,-1], 5), 'head ray follows transmitted seeded scale');

    for (const seed of ['peer-id', 'new-peer', 'reconnected-id']) {
      const got = decodeAvatarLook(wire, seed);
      assert.equal(got.tall, tall);
      assert.equal(got.height, undefined, 'no cm proportion conversion');
      assert.equal(avatarEyeHeight(got), avatarEyeHeight(look));
    }
  }
  for (const cm of [120, 165, 195]) {
    const look = { ...avatarLook('explicit'), height: cm };
    const code = encodeAvatarLook(look);
    assert.equal(encodeAvatarWireLook(look), code + `d${look.build}`, 'saved chosen-height code unchanged; only wire build appended');
    assert.equal(decodeAvatarLook(code + 's0', 'peer-id').height, cm);
    assert.equal(decodeAvatarLook(code + 's0', 'peer-id').tall, cm / AVATAR_HEIGHT.base);
  }
  for (const old of ['2413021', '241302113']) {
    assert.equal(encodeAvatarLook(decodeAvatarLook(old,'original-seed')),old.length===7?old+'00':old);
    const seedTall = avatarLook('original-seed').tall;
    assert.equal(decodeAvatarLook(old+'s9','original-seed').tall,seedTall,'invalid scale ignored');
  }
});


test('#1175 wire-only build preserves own width and saved codes across receiver seeds', () => {
  const own = avatarLook('renamed-height'), legacy = encodeAvatarLook(own);
  assert.equal(own.build,1);assert.equal(decodeAvatarLook(legacy,'peer-id').build,2,'before: old saved encoding still derives receiver build');
  for (const build of [0,1,2]) for (const height of [undefined,120,165,195]) {
    const look={...own,build,...(height?{height}:{})}, saved=encodeAvatarLook(look), wire=encodeAvatarWireLook(look);
    assert.equal(encodeAvatarLook(look),saved,'persistent encoding unchanged');
    for (const seed of ['peer-id','new-peer','reconnected-id']) assert.equal(decodeAvatarLook(wire,seed).build,build);
    const state={p:[0,0,0],r:0,...splitAvatarCode(wire)}, width=[.93,1,1.08][build];
    // A side ray's entry must follow the logical middle box's exact canonical width.
    // #1137: a chosen height scales the boxes by its body scale and a child's head around the head pivot.
    const P=height?avatarProportions(height):{body:own.tall,head:1}, sx=height?P.body:1, pivot=AVATAR_HEIGHT.pivot;
    const hit=rifleBoxHeadContact('peer-id',state,[2,P.body*(pivot+(1.64-pivot)*P.head),0],[-1,0,0],4);
    assert.ok(hit);assert.ok(Math.abs(hit.point[0]-.105*width*sx*P.head)<1e-10);
  }
  for (const tag of ['d3','d999']) assert.equal(decodeAvatarLook(legacy+tag,'peer-id').build,avatarLook('peer-id').build,'out-of-range build ignored');
});

test('#1175 all current face fields plus body/scale fit existing Worker extension bounds', async () => {
  const C=await import('../src/config.js'), {cleanState}=await import('../cloudflare/players.js');
  const look={...avatarLook('face-max'),eyes:C.EYES.at(-1),build:2};
  for(const field of Object.keys(C.AVATAR_SHAPE.fields))look[field]=C.AVATAR_SHAPE.steps-1;
  const wire=splitAvatarCode(encodeAvatarWireLook(look));
  assert.ok(wire.ax.length<=C.AVATAR_LOOK_EXT_MAX);assert.ok([...wire.ax.matchAll(/[a-z]/g)].length<=16);
  const state=cleanState(JSON.stringify({p:[0,0,0],r:0,...wire}));
  assert.equal(state.ax,wire.ax,'maximal current extension is forwarded without being dropped');
  assert.equal(decodeAvatarLook(state.av+state.ax,'peer-id').build,2);
});

test('#1139: body build slim … heavy round-trips; old codes keep the seed\'s build', async () => {
  const C = await import('../src/config.js');
  const { AVATAR_BUILD: B, avatarBuildStep, avatarBuildWidth } = C;
  // Old codes (7, 9, 12 digits, with or without a face extension) decode with no chosen build: the seed's old width.
  for (const old of ['2413021', '240302101', '240302101172', '240302101c3e6']) {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const lk = decodeAvatarLook(old, seed);
      assert.equal(lk.bodyBuild, undefined, old);
      assert.equal(avatarBuildWidth(lk), [0.93, 1, 1.08][avatarLook(seed).build], `${old} ${seed}`);
      assert.equal(encodeAvatarLook(lk), old.length === 7 ? encodeAvatarLook(lk) : old, 'unchanged when re-encoded');
    }
  }
  // The seeded steps hit the old widths exactly; the ends are slimmer / heavier, the middle is 1.
  assert.deepEqual(B.seeded.map((k) => avatarBuildWidth({ bodyBuild: k })), [0.93, 1, 1.08]);
  assert.equal(avatarBuildWidth({ bodyBuild: 0 }), B.min);
  assert.equal(avatarBuildWidth({ bodyBuild: B.steps - 1 }), B.max);
  for (let k = 1; k < B.steps; k++) assert.ok(avatarBuildWidth({ bodyBuild: k }) > avatarBuildWidth({ bodyBuild: k - 1 }));
  // A chosen step (also the middle) is stored and read back, beside the other tags.
  for (let k = 0; k < B.steps; k++) {
    const lk = { ...decodeAvatarLook('240302101170c2', 'x'), bodyBuild: k };
    const code = encodeAvatarLook(lk);
    assert.match(code, new RegExp(`^240302101170c2k${k}$`));
    const back = decodeAvatarLook(code, 'x');
    assert.equal(back.bodyBuild, k); assert.equal(back.height, 170); assert.equal(back.eyes, C.EYES[2]);
    assert.equal(avatarBuildStep(back), k);
    // The players' room: digits stay `av`, the tags `ax` (the Worker checks only their form); older clients get the nearest `d`.
    const wire = encodeAvatarWireLook(lk), { av, ax } = splitAvatarCode(wire);
    assert.equal(av, '240302101170');
    const { cleanAvatar, cleanAvatarExt } = await import('../cloudflare/players.js');
    assert.equal(cleanAvatar(av), av); assert.equal(cleanAvatarExt(ax), ax);
    assert.equal(decodeAvatarLook(av + ax, 'peer').bodyBuild, k);
    assert.equal(decodeAvatarLook(av + ax, 'peer').build, [0, 0, 0, 0, 1, 1, 2, 2, 2][k], 'the nearest old build');
  }
  assert.equal(decodeAvatarLook('240302101k9', 'x').bodyBuild, undefined, 'an out-of-range step is skipped');
  // The head boxes follow the same width (a heavier build hits wider).
  const state = { p: [0, 0, 0], r: 0 };
  const hit = (k, x) => rifleBoxHeadContact('x', { ...state, av: '240302101175', ax: `k${k}` }, [x, 1.64, -3], [0, 0, 1], 10);
  assert.ok(hit(4, 0.1) && hit(8, 0.115) && !hit(4, 0.115) && !hit(0, 0.1), 'heavy wider than slim at the head boxes\' edge');
});

test('#1140: Slumpa gives a valid look (palettes, ranges, wire code valid); Återställ is the default look', async () => {
  const { randomAvatarLook } = await import('../src/customizer.js');
  const C = await import('../src/config.js');
  let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const base = avatarLook('editor-base'), seen = new Set();
  for (let i = 0; i < 300; i++) {
    const lk = randomAvatarLook(base, rnd);
    assert.ok(SKIN.includes(lk.skin) && HAIR.includes(lk.hair) && TOPS.includes(lk.top) && PANTS.includes(lk.pants) && SHOES.includes(lk.shoes) && C.EYES.includes(lk.eyes));
    assert.ok(lk.style >= 0 && lk.style < 5 && [0, 1].includes(lk.sleeves) && [0, 1].includes(lk.gender) && lk.facial >= 0 && lk.facial < 4);
    for (const n of Object.keys(C.AVATAR_SHAPE.fields)) assert.ok(Number.isInteger(lk[n]) && lk[n] >= 0 && lk[n] < C.AVATAR_SHAPE.steps, n);
    assert.ok(lk.height >= AVATAR_HEIGHT.min && lk.height <= AVATAR_HEIGHT.max);
    assert.equal(lk.build, base.build, 'the old build field is kept'); assert.ok(lk.bodyBuild >= 0 && lk.bodyBuild < C.AVATAR_BUILD.steps);
    const code = encodeAvatarLook(lk), back = decodeAvatarLook(code, 'x');
    assert.ok(avatarCodeValid(code.slice(0, 12)));
    assert.equal(back.height, lk.height); assert.equal(back.eyes, lk.eyes); assert.equal(back.eyeSize, lk.eyeSize);
    seen.add(lk.height);
  }
  assert.ok(seen.size > 30, 'heights vary');
  assert.ok([...seen].some((h) => h < 150) && [...seen].some((h) => h > 170), 'children and tall adults');
  const b2 = { ...base }; randomAvatarLook(b2, rnd); assert.deepEqual(b2, base, 'does not mutate its input');
});

test('#1220 brow colour: tag v (HAIR index), absent = like the hair, old codes unchanged, wire + every tag still decodes', async () => {
  const { AVATAR_SHAPE, AVATAR_BROWS, splitAvatarCode, encodeAvatarWireLook, defaultFaceLook } = await import('../src/config.js');
  assert.equal(AVATAR_BROWS.tag, 'v');
  assert.equal(defaultFaceLook().brows, null, 'default: brows follow the hair');
  for (const old of ['240302101', '240302101172', '240302101e7h1g2', '210302101u10']) {
    const lk = decodeAvatarLook(old, 'old');
    assert.equal(lk.brows, null, `${old}: no own brow colour`);
    assert.equal(encodeAvatarLook(lk), old, `${old}: re-encodes identically`);
  }
  const blond = { ...decodeAvatarLook('240302101', 'b'), hair: HAIR[4] };
  const plainCode = encodeAvatarLook(blond);
  assert.equal(plainCode, '240342101', 'blond hair, brows like the hair: no tag');
  const code = encodeAvatarLook({ ...blond, brows: HAIR[7] });
  assert.equal(code, '240342101v7', 'blond hair, black brows');
  const back = decodeAvatarLook(code, 'b');
  assert.equal(back.hair, HAIR[4]); assert.equal(back.brows, HAIR[7]); assert.equal(encodeAvatarLook(back), code);
  assert.equal(encodeAvatarLook({ ...blond, brows: HAIR[4] }), '240342101v4', 'a chosen colour equal to the hair is kept');
  assert.equal(encodeAvatarLook({ ...blond, brows: 0x123456 }), plainCode, 'a colour outside the palette is not written');
  assert.equal(decodeAvatarLook('240342101v9', 'b').brows, null, 'out-of-range index ignored');
  assert.deepEqual(splitAvatarCode(encodeAvatarLook({ ...blond, height: 150, brows: HAIR[7] })), { av: '240342101150', ax: 'v7' });
  // every tag at once (+ the wire's d) is within the limits and still decodes
  const everything = { ...blond, glasses: 2, eyes: 0x7c8288, top: TOPS[10], bodyBuild: 8, brows: HAIR[7] };
  for (const n of Object.keys(AVATAR_SHAPE.fields)) everything[n] = n === 'jaw' ? 0 : 8;
  const wire = encodeAvatarWireLook(everything), ext = splitAvatarCode(wire).ax;
  assert.ok(ext.length <= 48, ext);
  const { cleanAvatarExt } = await import('../cloudflare/players.js');
  assert.equal(cleanAvatarExt(ext), ext, 'the Worker passes it unchanged');
  const w = decodeAvatarLook(wire, 'b');
  assert.equal(w.brows, HAIR[7]); assert.equal(w.glasses, 2); assert.equal(w.top, TOPS[10]); assert.equal(w.bodyBuild, 8); assert.equal(w.neck, 8);
});

test('#1220 Slumpa: brows are null or a hair colour, and survive the code', async () => {
  const { randomAvatarLook } = await import('../src/customizer.js');
  let s = 3; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const base = avatarLook('brow-rand'); let own = 0;
  for (let i = 0; i < 200; i++) {
    const lk = randomAvatarLook(base, rnd);
    assert.ok(lk.brows === null || HAIR.includes(lk.brows));
    if (lk.brows !== null) own++;
    assert.equal(decodeAvatarLook(encodeAvatarLook(lk), 'x').brows, lk.brows);
  }
  assert.ok(own > 10 && own < 150, `some own brow colours (${own})`);
});

test('#1268 curly hair length: style 4 hair vertices span down to shoulder level for hairLength uniform scaling', async () => {
  const { Avatar } = await import('../src/avatar.js');
  const lkShort = { ...avatarLook('curl-len-0'), style: 4, hairLength: 0 };
  const avShort = new Avatar(lkShort);
  const lkLong = { ...avatarLook('curl-len-8'), style: 4, hairLength: 8 };
  const avLong = new Avatar(lkLong);
  assert.equal(avShort.mesh.material.userData.u.uHair.value, 0.45);
  assert.equal(avLong.mesh.material.userData.u.uHair.value, 1.25);
  const pos = avShort.mesh.geometry.attributes.position;
  const facePart = avShort.mesh.geometry.attributes.facePart;
  let minHy = Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(facePart.getX(i) - 7) < 0.5) {
      const hy = pos.getY(i) - 1.54 - 0.09;
      if (hy < minHy) minHy = hy;
    }
  }
  assert.ok(minHy <= -0.25, `curly hair spans down to shoulder level: ${minHy}`);
});

test('#1321 headwear: tag q, old codes unchanged, bad values skipped, combined with glasses, height and the face', async () => {
  const { AVATAR_HAT, AVATAR_LOOK_EXT_MAX, AVATAR_SHAPE, splitAvatarCode, defaultFaceLook, encodeAvatarWireLook } = await import('../src/config.js');
  const plain = avatarLook('hat-plain'), base = encodeAvatarLook(plain);
  assert.match(base, /^[0-9]{9}$/, 'an untouched look has no extension');
  assert.equal(defaultFaceLook().hat, 0, 'no headwear by default');
  assert.equal(decodeAvatarLook(base, 'p').hat, 0);
  assert.equal(AVATAR_HAT.names.length, 5);
  for (let h = 1; h < AVATAR_HAT.names.length; h++) {
    const code = encodeAvatarLook({ ...plain, hat: h });
    assert.equal(code, `${base}q${h}`);
    assert.equal(decodeAvatarLook(code, 'p').hat, h);
  }
  assert.equal(encodeAvatarLook({ ...plain, hat: 0 }), base, 'none is not written');
  assert.equal(encodeAvatarLook({ ...plain, hat: 9 }), base, 'an unknown kind is not written');
  assert.equal(decodeAvatarLook(base + 'q9', 'p').hat, 0, 'out-of-range headwear ignored');
  const all = encodeAvatarLook({ ...plain, hat: 2, glasses: 1, height: 140, eyeSize: 7 });
  assert.equal(all, base + '140' + 'e7g1q2');
  const back = decodeAvatarLook(all, 'p');
  assert.equal(back.hat, 2); assert.equal(back.glasses, 1); assert.equal(back.height, 140);
  assert.deepEqual(splitAvatarCode(all), { av: base + '140', ax: 'e7g1q2' });
  assert.match(encodeAvatarWireLook({ ...plain, hat: 3 }), /q3/, 'on the wire');
  // every slider at once plus glasses and headwear stays within the extension limit
  const everything = { ...plain, glasses: 2, hat: 4, brows: HAIR[7], eyes: 0x7c8288 };
  for (const n of Object.keys(AVATAR_SHAPE.fields)) everything[n] = n === 'jaw' ? 0 : 8;
  assert.ok(splitAvatarCode(encodeAvatarWireLook({ ...everything, height: 140, bodyBuild: 8, top: TOPS[10] })).ax.length <= AVATAR_LOOK_EXT_MAX);
});

test('#1322 headphones: tag f, old codes unchanged, bad values skipped, combined with headwear, glasses and the face', async () => {
  const { AVATAR_PHONES, AVATAR_LOOK_EXT_MAX, AVATAR_SHAPE, splitAvatarCode, defaultFaceLook, encodeAvatarWireLook } = await import('../src/config.js');
  const plain = avatarLook('phones-plain'), base = encodeAvatarLook(plain);
  assert.equal(defaultFaceLook().phones, 0, 'no headphones by default');
  assert.equal(decodeAvatarLook(base, 'p').phones, 0);
  assert.equal(AVATAR_PHONES.names.length, 3);
  for (let h = 1; h < AVATAR_PHONES.names.length; h++) {
    const code = encodeAvatarLook({ ...plain, phones: h });
    assert.equal(code, `${base}f${h}`);
    assert.equal(decodeAvatarLook(code, 'p').phones, h);
  }
  assert.equal(encodeAvatarLook({ ...plain, phones: 0 }), base, 'none is not written');
  assert.equal(encodeAvatarLook({ ...plain, phones: 9 }), base, 'an unknown kind is not written');
  assert.equal(decodeAvatarLook(base + 'f9', 'p').phones, 0, 'out-of-range headphones ignored');
  const all = encodeAvatarLook({ ...plain, phones: 2, hat: 3, glasses: 1, height: 140 });
  assert.equal(all, base + '140' + 'g1q3f2');
  const back = decodeAvatarLook(all, 'p');
  assert.equal(back.phones, 2); assert.equal(back.hat, 3); assert.equal(back.glasses, 1);
  assert.deepEqual(splitAvatarCode(all), { av: base + '140', ax: 'g1q3f2' });
  assert.match(encodeAvatarWireLook({ ...plain, phones: 1 }), /f1/, 'on the wire');
  const everything = { ...plain, glasses: 2, hat: 4, phones: 2, brows: HAIR[7], eyes: 0x7c8288 };
  for (const n of Object.keys(AVATAR_SHAPE.fields)) everything[n] = n === 'jaw' ? 0 : 8;
  assert.ok(splitAvatarCode(encodeAvatarWireLook({ ...everything, height: 140, bodyBuild: 8, top: TOPS[10] })).ax.length <= AVATAR_LOOK_EXT_MAX);
});

test('#1323 necklaces: tag x, old codes unchanged, bad values skipped, combined with headwear, glasses and the face', async () => {
  const { AVATAR_NECKLACE, AVATAR_LOOK_EXT_MAX, AVATAR_SHAPE, splitAvatarCode, defaultFaceLook, encodeAvatarWireLook } = await import('../src/config.js');
  const plain = avatarLook('neck-plain'), base = encodeAvatarLook(plain);
  assert.match(base, /^[0-9]{9}$/, 'an untouched look has no extension');
  assert.equal(defaultFaceLook().necklace, 0, 'no necklace by default');
  assert.equal(decodeAvatarLook(base, 'p').necklace, 0);
  assert.equal(AVATAR_NECKLACE.names.length, 5);
  for (let n = 1; n < AVATAR_NECKLACE.names.length; n++) {
    const code = encodeAvatarLook({ ...plain, necklace: n });
    assert.equal(code, `${base}x${n}`);
    assert.equal(decodeAvatarLook(code, 'p').necklace, n);
  }
  assert.equal(encodeAvatarLook({ ...plain, necklace: 0 }), base, 'none is not written');
  assert.equal(encodeAvatarLook({ ...plain, necklace: 9 }), base, 'an unknown kind is not written');
  assert.equal(decodeAvatarLook(base + 'x9', 'p').necklace, 0, 'out-of-range necklace ignored');
  const all = encodeAvatarLook({ ...plain, necklace: 3, hat: 2, glasses: 1, height: 140 });
  assert.equal(all, base + '140' + 'g1q2x3');
  const back = decodeAvatarLook(all, 'p');
  assert.equal(back.necklace, 3); assert.equal(back.hat, 2); assert.equal(back.glasses, 1); assert.equal(back.height, 140);
  assert.deepEqual(splitAvatarCode(all), { av: base + '140', ax: 'g1q2x3' });
  assert.match(encodeAvatarWireLook({ ...plain, necklace: 4 }), /x4/, 'on the wire');
  const everything = { ...plain, glasses: 2, hat: 4, necklace: 4, brows: HAIR[7], eyes: 0x7c8288 };
  for (const n of Object.keys(AVATAR_SHAPE.fields)) everything[n] = n === 'jaw' ? 0 : 8;
  assert.ok(splitAvatarCode(encodeAvatarWireLook({ ...everything, height: 140, bodyBuild: 8, top: TOPS[10] })).ax.length <= AVATAR_LOOK_EXT_MAX);
});

test('#1324 rings: tags i (finger 1-10) and z (metal), old codes unchanged, bad values skipped, combined with the necklace', async () => {
  const { AVATAR_RING, AVATAR_LOOK_EXT_MAX, AVATAR_SHAPE, splitAvatarCode, defaultFaceLook, encodeAvatarWireLook } = await import('../src/config.js');
  const plain = avatarLook('ring-plain'), base = encodeAvatarLook(plain);
  assert.equal(defaultFaceLook().ring, 0); assert.equal(defaultFaceLook().metal, 0);
  assert.equal(decodeAvatarLook(base, 'p').ring, 0);
  assert.equal(AVATAR_RING.metals.length, AVATAR_RING.colours.length);
  for (let r = 1; r <= 10; r++) {
    const code = encodeAvatarLook({ ...plain, ring: r });
    assert.equal(code, `${base}i${r}`, 'gold is the default metal and is not written');
    assert.equal(decodeAvatarLook(code, 'p').ring, r);
  }
  for (let m = 1; m < AVATAR_RING.metals.length; m++) {
    const code = encodeAvatarLook({ ...plain, ring: 4, metal: m });
    assert.equal(code, `${base}i4z${m}`);
    const back = decodeAvatarLook(code, 'p'); assert.equal(back.ring, 4); assert.equal(back.metal, m);
  }
  assert.equal(encodeAvatarLook({ ...plain, ring: 0, metal: 2 }), base, 'a metal without a ring is not written');
  assert.equal(encodeAvatarLook({ ...plain, ring: 11 }), base, 'an unknown finger is not written');
  assert.equal(decodeAvatarLook(base + 'i11', 'p').ring, 0); assert.equal(decodeAvatarLook(base + 'i0', 'p').ring, 0);
  assert.equal(decodeAvatarLook(base + 'i3z999', 'p').metal, 0, 'out-of-range metal ignored (z9 is metal 1 + bracelet 2 since #1334)');
  assert.match(encodeAvatarWireLook({ ...plain, ring: 7, metal: 3 }), /i7z3/, 'on the wire');
  const everything = { ...plain, glasses: 2, hat: 4, phones: 2, necklace: 4, ring: 10, metal: 3, brows: HAIR[7], eyes: 0x7c8288 };
  for (const n of Object.keys(AVATAR_SHAPE.fields)) everything[n] = n === 'jaw' ? 0 : 8;
  assert.ok(splitAvatarCode(encodeAvatarWireLook({ ...everything, height: 140, bodyBuild: 8, top: TOPS[10] })).ax.length <= AVATAR_LOOK_EXT_MAX);
});

test('#1334 bracelets and watches: share the z tag (metal + 4 * (bracelet + 7 * watch)), old codes unchanged, bad values skipped, within the extension limit', async () => {
  const { AVATAR_WRIST, AVATAR_LOOK_EXT_MAX, AVATAR_SHAPE, splitAvatarCode, defaultFaceLook, encodeAvatarWireLook } = await import('../src/config.js');
  const plain = avatarLook('wrist-plain'), base = encodeAvatarLook(plain);
  assert.equal(defaultFaceLook().bracelet, 0); assert.equal(defaultFaceLook().watch, 0);
  assert.equal(decodeAvatarLook(base, 'p').bracelet, 0); assert.equal(decodeAvatarLook(base, 'p').watch, 0);
  assert.equal(AVATAR_WRIST.bracelets.length, 4); assert.equal(AVATAR_WRIST.watches.length, 4); assert.equal(AVATAR_WRIST.strap.length, 3);
  for (let b = 1; b <= 6; b++) {
    const code = encodeAvatarLook({ ...plain, bracelet: b });
    assert.equal(code, `${base}z${4 * b}`, 'gold is the default metal');
    const back = decodeAvatarLook(code, 'p'); assert.equal(back.bracelet, b); assert.equal(back.watch, 0); assert.equal(back.metal, 0);
  }
  for (let w = 1; w <= 6; w++) {
    const code = encodeAvatarLook({ ...plain, watch: w, metal: 2 });
    assert.equal(code, `${base}z${2 + 28 * w}`);
    const back = decodeAvatarLook(code, 'p'); assert.equal(back.watch, w); assert.equal(back.bracelet, 0); assert.equal(back.metal, 2);
  }
  const both = encodeAvatarLook({ ...plain, ring: 3, bracelet: 5, watch: 2, metal: 3 });
  assert.equal(both, `${base}i3z${3 + 4 * (5 + 14)}`);
  const back = decodeAvatarLook(both, 'p'); assert.deepEqual([back.ring, back.bracelet, back.watch, back.metal], [3, 5, 2, 3]);
  assert.equal(encodeAvatarLook({ ...plain, ring: 3, metal: 1 }), `${base}i3z1`, 'a ring-only code is the old one');
  assert.equal(decodeAvatarLook(`${base}i3z1`, 'p').bracelet, 0, 'an old ring code has no wrist items');
  assert.equal(encodeAvatarLook({ ...plain, metal: 2 }), base, 'a metal alone is not written');
  assert.equal(encodeAvatarLook({ ...plain, bracelet: 7, watch: -1 }), base, 'unknown models are not written');
  assert.equal(decodeAvatarLook(base + 'z999', 'p').watch, 0, 'an out-of-range watch is ignored');
  assert.match(encodeAvatarWireLook({ ...plain, bracelet: 4, watch: 6 }), /z\d+/, 'on the wire');
  const everything = { ...plain, glasses: 2, earrings: 4, hat: 4, phones: 2, necklace: 4, ring: 10, metal: 3, bracelet: 6, watch: 6, brows: HAIR[7], eyes: 0x7c8288 };
  for (const n of Object.keys(AVATAR_SHAPE.fields)) everything[n] = n === 'jaw' ? 0 : 8;
  assert.ok(splitAvatarCode(encodeAvatarWireLook({ ...everything, height: 140, bodyBuild: 8, top: TOPS[10] })).ax.length <= AVATAR_LOOK_EXT_MAX);
  const { cleanAvatarExt } = await import('../cloudflare/players.js');
  const ax = splitAvatarCode(encodeAvatarWireLook({ ...everything, height: 140, bodyBuild: 8, top: TOPS[10] })).ax;
  assert.equal(cleanAvatarExt(ax), ax, 'the Worker passes the full extension'); assert.equal(cleanAvatarExt('z1'.repeat(31)), null, 'longer than 60 is rejected');
  assert.equal(cleanAvatarExt('a1'.repeat(30)), 'a1'.repeat(30), 'exactly 60 characters pass (the clients allow 60)');
});

test('#1325 earrings and sunglasses: earrings share the g tag (glasses + 10 * earrings), old codes unchanged, bad values skipped', async () => {
  const { AVATAR_EARRINGS, AVATAR_GLASSES, AVATAR_LOOK_EXT_MAX, AVATAR_SHAPE, splitAvatarCode, defaultFaceLook, encodeAvatarWireLook } = await import('../src/config.js');
  const plain = avatarLook('ear-plain'), base = encodeAvatarLook(plain);
  assert.equal(defaultFaceLook().earrings, 0, 'no earrings by default');
  assert.equal(decodeAvatarLook(base, 'p').earrings, 0);
  assert.equal(AVATAR_EARRINGS.names.length, 5); assert.equal(AVATAR_GLASSES.names.length, 4);
  for (let g = 1; g < 4; g++) { // glasses alone are written exactly as before
    assert.equal(encodeAvatarLook({ ...plain, glasses: g }), `${base}g${g}`);
    const back = decodeAvatarLook(`${base}g${g}`, 'p'); assert.equal(back.glasses, g); assert.equal(back.earrings, 0);
  }
  for (let e = 1; e < 5; e++) {
    assert.equal(encodeAvatarLook({ ...plain, earrings: e }), `${base}g${e * 10}`);
    const back = decodeAvatarLook(`${base}g${e * 10}`, 'p'); assert.equal(back.earrings, e); assert.equal(back.glasses, 0);
    const both = decodeAvatarLook(encodeAvatarLook({ ...plain, earrings: e, glasses: 3 }), 'p'); assert.equal(both.earrings, e); assert.equal(both.glasses, 3);
  }
  assert.equal(encodeAvatarLook({ ...plain, earrings: 0, glasses: 0 }), base, 'none is not written');
  assert.equal(encodeAvatarLook({ ...plain, earrings: 9 }), base, 'an unknown kind is not written');
  assert.equal(decodeAvatarLook(base + 'g50', 'p').earrings, 0, 'out-of-range earrings ignored');
  assert.equal(decodeAvatarLook(base + 'g9', 'p').glasses, 0, 'out-of-range glasses ignored');
  const all = encodeAvatarLook({ ...plain, earrings: 3, glasses: 3, hat: 2, necklace: 1, height: 140 });
  assert.equal(all, base + '140' + 'g33q2x1');
  assert.deepEqual(splitAvatarCode(all), { av: base + '140', ax: 'g33q2x1' });
  assert.match(encodeAvatarWireLook({ ...plain, earrings: 2 }), /g20/, 'on the wire');
  const everything = { ...plain, glasses: 3, earrings: 4, hat: 4, necklace: 4, brows: HAIR[7], eyes: 0x7c8288 };
  for (const n of Object.keys(AVATAR_SHAPE.fields)) everything[n] = n === 'jaw' ? 0 : 8;
  assert.ok(splitAvatarCode(encodeAvatarWireLook({ ...everything, height: 140, bodyBuild: 8, top: TOPS[10] })).ax.length <= AVATAR_LOOK_EXT_MAX);
});
