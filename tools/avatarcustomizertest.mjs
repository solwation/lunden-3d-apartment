import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKIN, HAIR, TOPS, PANTS, SHOES,
  avatarLook, encodeAvatarLook, decodeAvatarLook, RESET_KEEP
} from '../src/config.js';
import { clearLocalHome } from '../src/reset.js';

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
    build: 1,
    tall: 0.975
  };

  const code = encodeAvatarLook(originalLook);
  assert.match(code, /^[0-4][0-9][0-5][0-3][0-7][0-3][0-1]$/, 'encoded look is 7 digits within palette ranges');

  const decoded = decodeAvatarLook(code, 'player123');
  assert.equal(decoded.skin, originalLook.skin);
  assert.equal(decoded.top, originalLook.top);
  assert.equal(decoded.pants, originalLook.pants);
  assert.equal(decoded.shoes, originalLook.shoes);
  assert.equal(decoded.hair, originalLook.hair);
  assert.equal(decoded.style, originalLook.style);
  assert.equal(decoded.sleeves, originalLook.sleeves);
  assert.equal(decoded.build, decodeAvatarLook(null, 'player123').build, 'build preserved from seed');
  assert.equal(decoded.tall, decodeAvatarLook(null, 'player123').tall, 'tall preserved from seed');

  // Fallback on invalid code
  const fallback = decodeAvatarLook('invalid', 'player123');
  assert.deepEqual(fallback, avatarLook('player123'));
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
            moveTo() {}, lineTo() {}, closePath() {},
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

test('avatar customization: clearLocalHome removes lunden.avatar without polluting RESET_KEEP', () => {
  assert.ok(!RESET_KEEP.includes('lunden.avatar'), 'lunden.avatar must not be in RESET_KEEP');

  const storage = new Map();
  storage.set('lunden.avatar', '0000000');
  storage.set('lunden.keepMe', 'score'); // hypothetical keep key
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    get length() { return storage.size; },
    key: (i) => [...storage.keys()][i]
  };

  const removed = clearLocalHome();
  assert.ok(removed.includes('lunden.avatar'), 'lunden.avatar was removed during reset');
  assert.equal(storage.has('lunden.avatar'), false, 'lunden.avatar removed from storage');
});
