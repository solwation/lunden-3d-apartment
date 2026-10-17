import { SKIN, HAIR, TOPS, PANTS, SHOES, AVATAR_HEIGHT, encodeAvatarLook, decodeAvatarLook, avatarLook, avatarHeightCm, EYES, AVATAR_SHAPE, avatarShape, AVATAR_BUILD, avatarBuildStep, avatarBuildWidth, AVATAR_GLASSES } from './config.js';

// #1220: the brows' colours (config.js HAIR, the hair swatches' names) and a first choice that follows the hair
const BROW_NAMES = ['Mörkbruna', 'Bruna', 'Ljusbruna', 'Guldbruna', 'Blonda', 'Grå', 'Röda', 'Svarta'];

/** The E choice every mirror offers (#1110): the avatar editor. */
export const mirrorChoice = () => ({ label: 'byt utseende vid spegeln', run: () => openAvatarCustomizer() });

/** An E target for a whole mirror (#1110): its glass and frame open the avatar editor. Meshes that already have a target
 * of their own keep it (a night light's pick box takes over later, lights.js). */
export function mirrorTarget(object, name, level = 0) {
  const t = { name, kind: 'mirror', verb: 'spegla dig i', pickable: object, object, level,
    options: () => [mirrorChoice()], toggle: () => openAvatarCustomizer() };
  object.traverse((m) => { m.userData.door ??= t; });
  return t;
}

let customizerEl = null;
let previewCanvas = null;
let currentLook = null;
let defaultLook = null;
let isOpen = false;
let callbacks = {
  getLook: null,
  setLook: null,
  getDefaultLook: null,
  onOpen: null,
  onClose: null,
};

/** Convert 0xRRGGBB integer to #rrggbb string. */
function toHex(num) {
  return '#' + (num || 0).toString(16).padStart(6, '0');
}

/** Draw 2D avatar representation onto the preview canvas. */
export function drawAvatarPreview(canvas, look) {
  if (!canvas || !look) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = 180, height = 280;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Background mirror frame reflection
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#1a2632');
  bg.addColorStop(0.5, '#2c3e50');
  bg.addColorStop(1, '#1a2632');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(4, 4, width - 8, height - 8, 12);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.stroke();

  const skin = toHex(look.skin);
  const top = toHex(look.top);
  const pants = toHex(look.pants);
  const shoes = toHex(look.shoes);
  const hair = toHex(look.hair);
  const brows = toHex(HAIR.includes(look.brows) ? look.brows : look.hair); // #1220: own colour, else the hair's
  const style = look.style ?? 0;
  const sleeves = look.sleeves ?? 0;
  const gender = Number(look.gender ?? look.figure) || 0;
  const facial = Number(look.facial ?? look.facialHair) || 0;
  // #1138: the face and head sliders (the middle draws the plain face)
  const sh = (name) => avatarShape(name, look[name]);
  const headW = sh('headWidth'), headL = sh('headLength'), jaw = sh('jaw'), eyeS = sh('eyeSize'), eyeO = sh('eyeShape');
  const noseS = sh('noseSize'), noseW = sh('noseWidth'), earS = sh('ears'), browT = sh('browThick'), browY = sh('browY') * 1000;
  const neck = sh('neck'), neckPx = Math.round(neck * 200);
  const iris = toHex(EYES.includes(look.eyes) ? look.eyes : EYES[0]);

  const cx = width / 2;

  // #1139: the body build widens everything below the head about the middle (the 3D figure's x/z scale)
  const bw = avatarBuildWidth(look);
  ctx.save();
  ctx.translate(cx, 0); ctx.scale(bw, 1); ctx.translate(-cx, 0);

  // Shadow under feet
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, 255, 36, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoes (y: 240 - 254)
  for (const s of [-1, 1]) {
    const sx = cx + s * 14;
    ctx.fillStyle = shoes;
    ctx.beginPath();
    ctx.roundRect(sx - 9, 240, 18, 12, 4);
    ctx.fill();
    // Sole
    ctx.fillStyle = '#e9e6df';
    ctx.fillRect(sx - 9, 250, 18, 3);
  }

  // Pants (legs: y 165 - 240)
  ctx.fillStyle = pants;
  for (const s of [-1, 1]) {
    const lx = cx + s * (gender === 1 ? 12 : 13);
    ctx.beginPath();
    ctx.roundRect(lx - (gender === 1 ? 8 : 9), 165, (gender === 1 ? 16 : 18), 76, [0, 0, 3, 3]);
    ctx.fill();
  }
  // Hips
  ctx.beginPath();
  const hipW = gender === 1 ? 46 : 48;
  ctx.roundRect(cx - hipW / 2, 150, hipW, 22, [4, 4, 0, 0]);
  ctx.fill();
  // Belt
  ctx.fillStyle = '#2a2523';
  ctx.fillRect(cx - (hipW / 2 - 1), 149, hipW - 2, 5);

  // Torso / top (y: 92 - 150)
  ctx.fillStyle = top;
  if (gender === 1) {
    ctx.beginPath();
    ctx.moveTo(cx - 21, 92);
    ctx.lineTo(cx + 21, 92);
    ctx.quadraticCurveTo(cx + 23, 114, cx + 18, 130);
    ctx.lineTo(cx + 22, 150);
    ctx.lineTo(cx - 22, 150);
    ctx.quadraticCurveTo(cx - 18, 130, cx - 23, 114);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.roundRect(cx - 24, 92, 48, 58, 6);
    ctx.fill();
  }

  // Collar
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.arc(cx, 93, 11, 0, Math.PI);
  ctx.fill();

  // Neck (y: 78 - 93)
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 7, 78 - neckPx, 14, 16 + neckPx);

  // Arms (y: 95 - 190)
  for (const s of [-1, 1]) {
    const ax = cx + s * (gender === 1 ? 27 : 30);
    // Upper arm
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.roundRect(ax - 6, 95, 12, 42, 6);
    ctx.fill();

    // Forearm
    ctx.fillStyle = sleeves ? top : skin;
    ctx.beginPath();
    ctx.roundRect(ax - 5.5, 134, 11, 40, 4);
    ctx.fill();

    // Hand
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(ax, 178, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // (#1139: the head keeps its own width in the preview)
  ctx.save(); ctx.translate(0, -neckPx); // #1191: head follows neck length in 2D preview

  // Long hair behind shoulders (style === 1)
  if (style === 1) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.roundRect(cx - 22, 60, 44, 60, 14);
    ctx.fill();
  }

  // Ears
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx - 18 * headW, 62, 5 * earS, 0, Math.PI * 2);
  ctx.arc(cx + 18 * headW, 62, 5 * earS, 0, Math.PI * 2);
  ctx.fill();

  // Head (centre: cx, 59, r: 18 wide × 20 high; #1138: width, length from the chin, the jaw wider or narrower)
  const rx = 18 * headW, ry = 20 * headL, hy = 79 - ry;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, hy, rx, ry, 0, Math.PI, 0);
  ctx.quadraticCurveTo(cx + rx * (0.95 + jaw * 1.5), hy + ry * 0.95, cx, hy + ry);
  ctx.quadraticCurveTo(cx - rx * (0.95 + jaw * 1.5), hy + ry * 0.95, cx - rx, hy);
  ctx.fill();

  // Face: Eyes
  for (const s of [-1, 1]) {
    const ex = cx + s * 7 * headW, ey = 57;
    ctx.fillStyle = '#f2f2ee';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 3.5 * eyeS, 2.5 * eyeS * eyeO, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.9 * eyeS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141010';
    ctx.beginPath();
    ctx.arc(ex, ey, 0.9 * eyeS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = brows;
    ctx.lineWidth = 1.5 * browT;
    ctx.beginPath();
    ctx.moveTo(ex - 3.5, 52 - browY);
    ctx.lineTo(ex + 3.5, 52 - browY);
    ctx.stroke();
  }

  // Nose & mouth
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.beginPath();
  ctx.ellipse(cx, 60 + 3 * noseS, 2 * noseS * noseW, 2.5 * noseS, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9a5a52';
  ctx.beginPath();
  ctx.roundRect(cx - 4, 69, 8, 2, 1);
  ctx.fill();

  // Facial hair: 0 none, 1 beard, 2 mustache, 3 beard + mustache
  if (facial === 1 || facial === 3) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(cx - 16, 62);
    ctx.quadraticCurveTo(cx - 16, 75, cx - 8, 80);
    ctx.quadraticCurveTo(cx, 82, cx + 8, 80);
    ctx.quadraticCurveTo(cx + 16, 75, cx + 16, 62);
    ctx.lineTo(cx + 13, 64);
    ctx.quadraticCurveTo(cx + 13, 73, cx + 6, 76);
    ctx.lineTo(cx - 6, 76);
    ctx.quadraticCurveTo(cx - 13, 73, cx - 13, 64);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx - 5, 73, 10, 6, 3);
    ctx.fill();
  }

  if (facial === 2 || facial === 3) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx - 4, 66.5, 4.5, 2, -0.2, 0, Math.PI * 2);
    ctx.ellipse(cx + 4, 66.5, 4.5, 2, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hairstyle on top. #1166: short hair, the bun and the beanie share a cap-shaped path that follows the head
  // outline over the crown, comes down at the temples and has its front hairline above the brows (and their
  // #1138 height/thickness sliders), so the eyes and brows stay visible. Long hair keeps its own crown.
  const browTop = 52 - browY - 0.75 * browT;
  const hairline = Math.min(45, browTop - 1.5);
  const crown = hy - ry;
  const cap = (pad, front) => {
    const side = 56, r = ry + pad, t = Math.asin(Math.max(-1, Math.min(1, (side - hy) / r)));
    ctx.beginPath();
    ctx.ellipse(cx, hy, rx + pad, r, 0, Math.PI - t, Math.PI * 2 + t);
    ctx.lineTo(cx + rx - 2, side);
    ctx.quadraticCurveTo(cx + rx - 2, front, cx + 8, front);
    ctx.quadraticCurveTo(cx, front + 1.2, cx - 8, front);
    ctx.quadraticCurveTo(cx - rx + 2, front, cx - rx + 2, side);
    ctx.closePath();
    ctx.fill();
  };
  if (style === 0) { // Short, tousled
    ctx.fillStyle = hair;
    cap(1.8, hairline);
    ctx.beginPath();
    ctx.ellipse(cx, crown + 1, 13 * headW, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 1) { // Long hair (crown and front locks falling over shoulders)
    ctx.fillStyle = hair;
    // Hair on top of the head / forehead (keeping brows, eyes, nose, mouth and chin clear)
    ctx.beginPath();
    const lf = Math.min(48, browTop - 1); // the fringe's ends stay above raised brows
    ctx.arc(cx, lf, 19.5, Math.PI, Math.PI * 2);
    ctx.quadraticCurveTo(cx, lf - 3, cx - 19.5, lf);
    ctx.fill();
    // Locks falling past the ears and outside the jawline down onto the shoulders
    ctx.beginPath();
    ctx.roundRect(cx - 24, 48, 7.5, 66, 3);
    ctx.roundRect(cx + 16.5, 48, 7.5, 66, 3);
    ctx.fill();
  } else if (style === 2) { // Bun
    ctx.fillStyle = hair;
    cap(1.2, hairline);
    ctx.beginPath();
    ctx.arc(cx, crown - 6, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.roundRect(cx - 6, crown - 0.5, 12, 4, 2);
    ctx.fill();
  } else if (style === 3) { // Beanie: a knitted cap with a folded brim, both ending above the brows
    ctx.fillStyle = top;
    cap(2.5, hairline - 1);
    ctx.beginPath(); // the knitted dome sits higher than the crown
    ctx.ellipse(cx, hairline - 3, rx + 2, hairline - crown + 3, 0, Math.PI, 0);
    ctx.fill();
    const bw = rx + 3;
    ctx.beginPath();
    ctx.roundRect(cx - bw, hairline - 7, bw * 2, 7, 3);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, crown - 7, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // #1191: restore neck translation
  ctx.restore(); // restore dpr scale
}

/** A random look (#1140): colours, hairstyle, sleeves, figure, facial hair, eye colour, the face sliders and a height in cm
 * (mostly adult, sometimes a child; *guess*). Keeps the rest (the old build field, any extra fields) from `base`. */
export function randomAvatarLook(base, rnd = Math.random) {
  const pick = (n) => Math.min(n - 1, Math.floor(rnd() * n));
  const lk = { ...base };
  lk.skin = SKIN[pick(SKIN.length)]; lk.hair = HAIR[pick(HAIR.length)]; lk.top = TOPS[pick(TOPS.length)];
  lk.pants = PANTS[pick(PANTS.length)]; lk.shoes = SHOES[pick(SHOES.length)]; lk.eyes = EYES[pick(EYES.length)];
  lk.style = pick(4); lk.sleeves = pick(2); lk.gender = pick(2); lk.facial = pick(4);
  for (const name of Object.keys(AVATAR_SHAPE.fields)) lk[name] = pick(AVATAR_SHAPE.steps);
  lk.bodyBuild = pick(AVATAR_BUILD.steps);
  const H = AVATAR_HEIGHT, lo = rnd() < 0.15 ? H.min + 20 : H.adult, hi = rnd() < 0.15 ? H.adult : H.max - 5;
  lk.height = Math.max(H.min, Math.min(H.max, Math.round(lo + rnd() * (hi - lo))));
  lk.tall = lk.height / H.base;
  lk.brows = rnd() < 0.25 ? HAIR[pick(HAIR.length)] : null; // #1220: mostly brows like the hair
  return lk;
}

/** Update active button indicators in the panel. */
function updateActiveSwatches() {
  if (!customizerEl || !currentLook) return;
  const groups = [
    { type: 'gender', value: Number(currentLook.gender ?? currentLook.figure) || 0 },
    { type: 'facial', value: Number(currentLook.facial ?? currentLook.facialHair) || 0 },
    { type: 'skin', value: currentLook.skin, list: SKIN },
    { type: 'top', value: currentLook.top, list: TOPS },
    { type: 'sleeves', value: currentLook.sleeves },
    { type: 'pants', value: currentLook.pants, list: PANTS },
    { type: 'shoes', value: currentLook.shoes, list: SHOES },
    { type: 'style', value: currentLook.style },
    { type: 'hair', value: currentLook.hair, list: HAIR },
  ];
  groups.push({ type: 'glasses', value: Number(currentLook.glasses) || 0 }); // #1165
  groups.push({ type: 'brows', value: HAIR.includes(currentLook.brows) ? HAIR.indexOf(currentLook.brows) : -1 }); // #1220 (-1: like the hair)
  groups.push({ type: 'eyes', value: EYES.includes(currentLook.eyes) ? currentLook.eyes : EYES[0], list: EYES });
  for (const name of Object.keys(AVATAR_SHAPE.fields)) { // #1138: the face sliders
    const input = customizerEl.querySelector(`input[data-shape="${name}"]`);
    if (input) input.value = String(Number.isInteger(currentLook[name]) ? currentLook[name] : AVATAR_SHAPE.mid);
  }
  for (const g of groups) {
    const btns = customizerEl.querySelectorAll(`button[data-type="${g.type}"]`);
    for (const b of btns) {
      const idx = Number(b.dataset.index);
      const isSel = g.list ? (g.list[idx] === g.value) : (idx === g.value);
      b.classList.toggle('sel', isSel);
      b.setAttribute('aria-pressed', isSel ? 'true' : 'false');
    }
  }
}

/** The height slider (#1136) shows the look's height in cm (the seed's own until one is chosen). */
function updateHeightSlider() {
  const input = customizerEl?.querySelector('#avatar-height'), out = customizerEl?.querySelector('#avatar-height-value');
  if (!input) return;
  const cm = avatarHeightCm(currentLook);
  input.min = AVATAR_HEIGHT.min; input.max = AVATAR_HEIGHT.max; input.value = cm;
  if (out) out.textContent = `${cm} cm`;
}

/** The body-build slider (#1139) shows the look's step (the seed's own until one is chosen) and a word for it. */
const BUILD_WORDS = ['Mycket smal', 'Smal', 'Smal', 'Ganska smal', 'Medel', 'Ganska kraftig', 'Kraftig', 'Kraftig', 'Mycket kraftig'];
function updateBuildSlider() {
  const input = customizerEl?.querySelector('#avatar-build'), out = customizerEl?.querySelector('#avatar-build-value');
  if (!input) return;
  const k = avatarBuildStep(currentLook);
  input.max = String(AVATAR_BUILD.steps - 1); input.value = String(k);
  if (out) out.textContent = BUILD_WORDS[k] ?? '';
}

/** Refresh the preview canvas and apply current look live. */
function applyAndRefresh() {
  if (!currentLook) return;
  if (previewCanvas) drawAvatarPreview(previewCanvas, currentLook);
  updateActiveSwatches();
  updateHeightSlider();
  updateBuildSlider();
  callbacks.setLook?.(currentLook);
}

/** Open the customizer dialog. */
export function openAvatarCustomizer() {
  if (isOpen) return;
  isOpen = true;
  if (!customizerEl) initCustomizerDOM();

  const look = callbacks.getLook?.() ?? avatarLook('anon');
  currentLook = { ...look };
  defaultLook = callbacks.getDefaultLook?.() ?? avatarLook('anon');

  customizerEl.hidden = false;
  applyAndRefresh();
  callbacks.onOpen?.();

  const firstBtn = customizerEl.querySelector('button');
  firstBtn?.focus();
}

/** Close the customizer dialog and save look. */
export function closeAvatarCustomizer(byKey = 'close') {
  if (!isOpen) return;
  isOpen = false;
  if (customizerEl) customizerEl.hidden = true;

  if (currentLook) {
    try {
      localStorage.setItem('lunden.avatar', encodeAvatarLook(currentLook));
    } catch {}
    callbacks.setLook?.(currentLook);
  }
  callbacks.onClose?.(byKey);
}

/** Is the customizer currently open? */
export function isAvatarCustomizerOpen() {
  return isOpen;
}

/** Build the DOM for the customizer dialog. */
function initCustomizerDOM() {
  customizerEl = document.getElementById('avatar-customizer');
  if (!customizerEl) return;

  previewCanvas = customizerEl.querySelector('#avatar-preview-canvas');
  addFaceSections(customizerEl.querySelector('.customizer-controls'));

  // Handle swatches and style clicks
  customizerEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const type = btn.dataset.type;
    const idx = Number(btn.dataset.index);

    if (type === 'gender') {
      currentLook.gender = idx;
      applyAndRefresh();
    } else if (type === 'facial') {
      currentLook.facial = idx;
      applyAndRefresh();
    } else if (type === 'skin' && SKIN[idx] !== undefined) {
      currentLook.skin = SKIN[idx];
      applyAndRefresh();
    } else if (type === 'top' && TOPS[idx] !== undefined) {
      currentLook.top = TOPS[idx];
      applyAndRefresh();
    } else if (type === 'sleeves') {
      currentLook.sleeves = idx;
      applyAndRefresh();
    } else if (type === 'pants' && PANTS[idx] !== undefined) {
      currentLook.pants = PANTS[idx];
      applyAndRefresh();
    } else if (type === 'shoes' && SHOES[idx] !== undefined) {
      currentLook.shoes = SHOES[idx];
      applyAndRefresh();
    } else if (type === 'style') {
      currentLook.style = idx;
      applyAndRefresh();
    } else if (type === 'glasses' && AVATAR_GLASSES.names[idx] !== undefined) { // #1165
      currentLook.glasses = idx;
      applyAndRefresh();
    } else if (type === 'eyes' && EYES[idx] !== undefined) {
      currentLook.eyes = EYES[idx];
      applyAndRefresh();
    } else if (type === 'brows' && (idx === -1 || HAIR[idx] !== undefined)) { // #1220: -1 = like the hair
      currentLook.brows = idx === -1 ? null : HAIR[idx];
      applyAndRefresh();
    } else if (type === 'hair' && HAIR[idx] !== undefined) {
      currentLook.hair = HAIR[idx];
      applyAndRefresh();
    } else if (btn.id === 'avatar-reset-btn') {
      const def = callbacks.getDefaultLook?.() ?? avatarLook('anon');
      currentLook = { ...def };
      applyAndRefresh();
    } else if (btn.id === 'avatar-random-btn') {
      currentLook = randomAvatarLook(currentLook);
      applyAndRefresh();
    } else if (btn.id === 'avatar-save-btn' || btn.id === 'avatar-close-btn') {
      closeAvatarCustomizer('button');
    }
  });

  // The height slider (#1136): a chosen height in whole cm; the live avatar and eye height follow while dragging
  customizerEl.querySelector('#avatar-height')?.addEventListener('input', (e) => {
    const cm = Math.round(Number(e.target.value));
    if (!currentLook || !(cm >= AVATAR_HEIGHT.min && cm <= AVATAR_HEIGHT.max)) return;
    currentLook.height = cm;
    currentLook.tall = cm / AVATAR_HEIGHT.base;
    applyAndRefresh();
  });

  // #1139: the body-build slider, slim … heavy
  customizerEl.querySelector('#avatar-build')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (!currentLook || !Number.isInteger(v) || v < 0 || v >= AVATAR_BUILD.steps) return;
    currentLook.bodyBuild = v;
    applyAndRefresh();
  });

  // #1138: the face sliders change the look as they move
  customizerEl.addEventListener('input', (e) => {
    const name = e.target?.dataset?.shape;
    if (!name || !AVATAR_SHAPE.fields[name] || !currentLook) return;
    const v = Number(e.target.value);
    if (!Number.isInteger(v) || v < 0 || v >= AVATAR_SHAPE.steps) return;
    currentLook[name] = v;
    applyAndRefresh();
  });

  // Keyboard navigation inside customizer
  window.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.code === 'KeyE' || e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeAvatarCustomizer(e.code);
    }
  }, true);
}

/** #1138: the face sections (eye colour, eyes, head, nose and ears, brows), built from config.js EYES / AVATAR_SHAPE after the
 * figure's sections: swatches for the eye colour, a 0 … steps − 1 slider per field (the middle is the plain face). */
const FACE_SECTIONS = [
  ['Ögon', ['eyeSize', 'eyeShape'], true],
  ['Huvudform', ['headWidth', 'headLength', 'jaw', 'neck']],
  ['Näsa & öron', ['noseSize', 'noseWidth', 'ears']],
  ['Ögonbryn', ['browThick', 'browY'], false, false, true], // #1220: their colour
  ['Hår och glasögon', ['hairLength'], false, true], // #1165
];
const EYE_NAMES = ['Bruna', 'Mörkbruna', 'Hasselbruna', 'Gröna', 'Gröngrå', 'Blå', 'Ljusblå', 'Grå'];
function addFaceSections(controls) {
  if (!controls || controls.querySelector?.('[data-face-section]')) return;
  for (const [title, fields, eyes, glasses, brows] of FACE_SECTIONS) {
    const sec = document.createElement('section');
    sec.className = 'customizer-section';
    sec.dataset.faceSection = '';
    const h = document.createElement('h3');
    h.textContent = title;
    sec.append(h);
    if (eyes) {
      const sw = document.createElement('div');
      sw.className = 'swatches';
      sw.dataset.group = 'eyes';
      EYES.forEach((c, i) => {
        const b = document.createElement('button');
        Object.assign(b.dataset, { type: 'eyes', index: String(i) });
        b.style.background = toHex(c);
        b.setAttribute('aria-label', `${EYE_NAMES[i] ?? 'Färg ' + (i + 1)} ögon`);
        sw.append(b);
      });
      sec.append(sw);
    }
    if (brows) { // #1220: like the hair, or one of the hair colours
      const row = document.createElement('div');
      row.className = 'btn-group';
      const same = document.createElement('button');
      Object.assign(same.dataset, { type: 'brows', index: '-1' });
      same.textContent = 'Som håret';
      row.append(same);
      sec.append(row);
      const sw = document.createElement('div');
      sw.className = 'swatches';
      sw.dataset.group = 'brows';
      HAIR.forEach((c, i) => {
        const b = document.createElement('button');
        Object.assign(b.dataset, { type: 'brows', index: String(i) });
        b.style.background = toHex(c);
        b.setAttribute('aria-label', `${BROW_NAMES[i] ?? 'Färg ' + (i + 1)} ögonbryn`);
        sw.append(b);
      });
      sec.append(sw);
    }
    if (glasses) { // #1165: none / round / square frames
      const row = document.createElement('div');
      row.className = 'btn-group';
      AVATAR_GLASSES.names.forEach((n, i) => {
        const b = document.createElement('button');
        Object.assign(b.dataset, { type: 'glasses', index: String(i) });
        b.textContent = i ? `${n} glasögon` : 'Inga glasögon';
        row.append(b);
      });
      sec.append(row);
    }
    for (const name of fields) {
      const label = document.createElement('label');
      label.className = 'customizer-slider';
      const span = document.createElement('span');
      span.textContent = AVATAR_SHAPE.fields[name].label;
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min: '0', max: String(AVATAR_SHAPE.steps - 1), step: '1', value: String(AVATAR_SHAPE.mid) });
      input.dataset.shape = name;
      label.append(span, input);
      sec.append(label);
    }
    controls.append(sec);
  }
}

/** Configure customizer integration. */
export function setupAvatarCustomizer(cbs) {
  Object.assign(callbacks, cbs);
  initCustomizerDOM();
}
