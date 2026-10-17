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
  assert.match(code, /^[0-4][0-9][0-5][0-3][0-7][0-3][0-1][0-1][0-3]$/, 'encoded look is 9 digits within palette and variant ranges');

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
            save() {}, restore() {}, scale() {}, clearRect() {}, fillRect() {},
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

  globalThis.document = {
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
    const logicalTall=height?avatarLook('peer-id').tall:own.tall; // Existing chosen-cm collision scope remains #1137.
    const hit=rifleBoxHeadContact('peer-id',state,[2,logicalTall*1.64,0],[-1,0,0],4);
    assert.ok(hit);assert.ok(Math.abs(hit.point[0]-.105*width)<1e-10);
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
