import { SKIN, HAIR, TOPS, PANTS, SHOES, encodeAvatarLook, decodeAvatarLook, avatarLook } from './config.js';

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
  const style = look.style ?? 0;
  const sleeves = look.sleeves ?? 0;
  const gender = Number(look.gender ?? look.figure) || 0;
  const facial = Number(look.facial ?? look.facialHair) || 0;

  const cx = width / 2;

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
  ctx.fillRect(cx - 7, 78, 14, 16);

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
  ctx.arc(cx - 18, 62, 5, 0, Math.PI * 2);
  ctx.arc(cx + 18, 62, 5, 0, Math.PI * 2);
  ctx.fill();

  // Head (centre: cx, 59, r: 18)
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(cx, 59, 18, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Face: Eyes
  for (const s of [-1, 1]) {
    const ex = cx + s * 7;
    ctx.fillStyle = '#f2f2ee';
    ctx.beginPath();
    ctx.ellipse(ex, 57, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2420';
    ctx.beginPath();
    ctx.arc(ex, 57, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hair;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex - 3.5, 52);
    ctx.lineTo(ex + 3.5, 52);
    ctx.stroke();
  }

  // Nose & mouth
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.beginPath();
  ctx.ellipse(cx, 63, 2, 2.5, 0, 0, Math.PI * 2);
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

  // Hairstyle on top
  if (style === 0) { // Short, tousled
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, 54, 19, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, 40, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 1) { // Long (front fringe)
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, 54, 19, Math.PI * 0.85, Math.PI * 2.15);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx - 20, 50, 7, 30, 3);
    ctx.roundRect(cx + 13, 50, 7, 30, 3);
    ctx.fill();
  } else if (style === 2) { // Bun
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, 54, 19, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, 32, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.roundRect(cx - 6, 38, 12, 4, 2);
    ctx.fill();
  } else if (style === 3) { // Beanie
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.arc(cx, 52, 20.5, Math.PI * 0.8, Math.PI * 2.2);
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.roundRect(cx - 21, 46, 42, 9, 4);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, 30, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
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

/** Refresh the preview canvas and apply current look live. */
function applyAndRefresh() {
  if (!currentLook) return;
  if (previewCanvas) drawAvatarPreview(previewCanvas, currentLook);
  updateActiveSwatches();
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
    } else if (type === 'hair' && HAIR[idx] !== undefined) {
      currentLook.hair = HAIR[idx];
      applyAndRefresh();
    } else if (btn.id === 'avatar-reset-btn') {
      const def = callbacks.getDefaultLook?.() ?? avatarLook('anon');
      currentLook = { ...def };
      applyAndRefresh();
    } else if (btn.id === 'avatar-save-btn' || btn.id === 'avatar-close-btn') {
      closeAvatarCustomizer('button');
    }
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

/** Configure customizer integration. */
export function setupAvatarCustomizer(cbs) {
  Object.assign(callbacks, cbs);
  initCustomizerDOM();
}
