import * as THREE from 'three';
import { CAT_BOARD as B } from './config.js';
import { withStore as withDb } from './idb.js';
import { badge } from './stats.js';

// Cork board in the kitchen with a Polaroid of every cat you pet (B.max of them), each captioned
// by hand with the cat's name and the date and time. Photos live in IndexedDB. E on the board opens
// #board-panel (#170): keep a photo (a red pin; kept ones are never pushed off by new photos) or throw
// it away. Without IndexedDB (private mode) it all works for this visit only.

const STORE = 'catPhotos', MAX = B.max;
const withStore = (mode, fn) => withDb(STORE, mode, fn); // the shared 'lunden' database (idb.js)

const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

const hand = "'Segoe Print', 'Comic Sans MS', 'Comic Neue', cursive";
const fmt = (t) => new Date(t).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export class CatBoard {
  constructor() {
    Object.assign(this, { name: 'anslagstavlan', kind: 'board', verb: 'titta på', photos: [], images: new Map() });
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(B.w * B.px); this.canvas.height = Math.round(B.h * B.px);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(B.w + 2 * B.frame, B.h + 2 * B.frame, 0.02), new THREE.MeshStandardMaterial({ color: 0xb98d5c, roughness: 0.7 }));
    frame.position.z = 0.01;
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9 }));
    cork.position.z = 0.0205;
    g.add(frame, cork);
    g.position.set(B.x, B.y, B.z);
    g.rotation.y = B.rotY;
    g.traverse((m) => { m.userData.door = this; });
    this.object = g;
    this.pickable = g;
    this.draw();
  }

  async load() {
    try {
      this.photos = (await withStore('readonly', (s) => s.getAll())) ?? [];
    } catch { this.photos = []; }
    this.photos = this.photos.sort((a, b) => a.time - b.time);
    // more than fit (an older version kept them all): drop the oldest that aren't kept
    while (this.photos.length > MAX) {
      const old = this.photos.find((p) => !p.kept) ?? this.photos[0];
      await this.discard(old.id ?? old.time, false);
    }
    await this.loadImages();
    this.draw();
  }

  /** Keep / stop keeping a photo (#170). */
  async toggleKeep(id) {
    const p = this.photos.find((x) => (x.id ?? x.time) === id);
    if (!p) return;
    p.kept = !p.kept;
    try { await withStore('readwrite', (s) => s.put(p)); } catch { /* this visit only */ }
    this.draw();
    this.onChange?.();
  }

  /** Throw a photo away (#170). */
  async discard(id, redraw = true) {
    this.photos = this.photos.filter((x) => (x.id ?? x.time) !== id);
    this.images.delete(id);
    try { await withStore('readwrite', (s) => s.delete(id)); } catch { /* this visit only */ }
    if (redraw) { this.draw(); this.onChange?.(); }
  }

  async loadImages() {
    for (const p of this.photos) if (!this.images.has(p.id ?? p.time)) this.images.set(p.id ?? p.time, await loadImage(p.data));
  }

  /** Pin a new photo (JPEG data URL) of `name`; a full board drops its oldest photo that isn't kept, and when
   * every one is kept the new photo doesn't go up (returns false). */
  async add(name, data, { kitten = false } = {}) {
    if (this.photos.length >= MAX) {
      const old = this.photos.find((p) => !p.kept);
      if (!old) { badge('📌 Tavlan är full med sparade bilder, släng en först', false); return false; }
      await this.discard(old.id ?? old.time, false);
    }
    const photo = { time: Date.now(), name, data, kept: false, uid: uid(), ...(kitten ? { kitten: true } : {}) }; // a kitten's: marked (#363)
    try {
      photo.id = await withStore('readwrite', (s) => s.add(photo));
    } catch { photo.id = photo.time; } // no IndexedDB (private mode): keep it for this visit
    this.photos = [...this.photos, photo];
    await this.loadImages();
    this.draw();
    this.onChange?.();
    return true;
  }


  draw() {
    const g = this.canvas.getContext('2d'), W = this.canvas.width, H = this.canvas.height, k = W / B.w; // px per metre
    // cork
    g.fillStyle = '#c49a6c';
    g.fillRect(0, 0, W, H);
    let seed = 5;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const grain = Math.max(2, Math.round(k * 0.0006));
    for (let i = 0, n = W * H / 250; i < n; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(120,80,40,0.25)' : 'rgba(240,210,170,0.25)';
      g.fillRect(rand() * W, rand() * H, grain, grain);
    }
    if (!this.photos.length) {
      g.fillStyle = '#4a3220';
      g.font = `bold ${Math.round(k * 0.02)}px ${hand}`;
      g.textAlign = 'center';
      g.fillText('Klappa en katt så hamnar', W / 2, H / 2 - k * 0.006);
      g.fillText('den här!', W / 2, H / 2 + k * 0.022);
      this.tex.needsUpdate = true;
      return;
    }
    // Polaroids in a straight grid (#225), newest first, B.cols per row, each tilted at most ±B.tilt°
    const P = B.polaroid, pw = P.w * k, ph = P.h * k, side = P.side * k, img = P.img * k;
    [...this.photos].reverse().forEach((p, i) => {
      const col = i % B.cols, row = Math.floor(i / B.cols);
      const cx = (B.margin + col * (P.w + B.gap) + P.w / 2) * k, cy = (B.margin + row * (P.h + B.gap) + P.h / 2) * k;
      const r = (rng(p.time)() * 2 - 1) * THREE.MathUtils.degToRad(B.tilt);
      g.save();
      g.translate(cx, cy);
      g.rotate(r);
      g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = k * 0.002; g.shadowOffsetY = k * 0.0008;
      g.fillStyle = '#fbfaf6';
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.shadowColor = 'transparent';
      // the square picture: the middle of the 4:3 snapshot
      const im = this.images.get(p.id ?? p.time), x0 = -img / 2, y0 = -ph / 2 + side;
      if (im) {
        const s = Math.min(im.width, im.height);
        g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, x0, y0, img, img);
      } else { g.fillStyle = '#2a2a2a'; g.fillRect(x0, y0, img, img); }
      // the wide bottom edge: name + time by hand
      const bottom = y0 + img, rest = ph / 2 - bottom;
      g.fillStyle = '#23324a';
      g.textAlign = 'center';
      g.font = `bold ${Math.round(rest * 0.42)}px ${hand}`;
      g.fillText(p.name, 0, bottom + rest * 0.46, pw - 2 * side);
      g.font = `${Math.round(rest * 0.27)}px ${hand}`;
      g.fillText(fmt(p.time), 0, bottom + rest * 0.82, pw - 2 * side);
      if (p.kitten) { // a small "kattunge" tag in the picture's top corner (#363)
        const fs = Math.round(img * 0.085), tw = fs * 4.6, th = fs * 1.35, tx = img / 2 - tw - img * 0.03, ty = y0 + img * 0.03;
        g.fillStyle = 'rgba(255,236,244,0.92)';
        g.fillRect(tx, ty, tw, th);
        g.fillStyle = '#b0306a';
        g.font = `bold ${fs}px ${hand}`;
        g.fillText('kattunge', tx + tw / 2, ty + th * 0.74, tw * 0.94);
      }
      g.restore();
      // the pin at the top: a big red one on the photos that are kept (#170), small other colours on the rest
      const py = cy - ph / 2 + side * 0.9, pr = k * (p.kept ? 0.0045 : 0.003);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.arc(cx + pr * 0.3, py + pr * 0.4, pr, 0, Math.PI * 2); g.fill();
      g.fillStyle = p.kept ? '#d8141e' : ['#2a7ad2', '#2aa25a', '#e0b020'][i % 3];
      g.beginPath(); g.arc(cx, py, pr, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(cx - pr * 0.35, py - pr * 0.35, pr * 0.28, 0, Math.PI * 2); g.fill();
    });
    this.tex.needsUpdate = true;
  }
}

/**
 * The board up close (#170): every photo in a grid with its name and time, a keep button (📌) and a throw-away
 * button (🗑, press twice: "Säker?"). Arrow keys pick a photo, S keeps, Delete / Backspace throws away.
 */
export class BoardPanel {
  constructor(board, el) {
    Object.assign(this, { board, el, open: false, sel: 0, confirm: null });
    this.grid = el.querySelector('.grid');
    board.onChange = () => { if (this.open) this.render(); };
    this.grid.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      this.sel = Number(b.dataset.i);
      this.act(b.dataset.act);
    });
  }

  get list() { return [...this.board.photos].reverse(); } // newest first, as on the board

  show(show) {
    this.open = show;
    this.el.hidden = !show;
    this.confirm = null;
    if (show) { this.sel = 0; this.render(); }
  }

  async act(what) {
    const p = this.list[this.sel];
    if (!p) return;
    const id = p.id ?? p.time;
    if (what === 'keep') { this.confirm = null; await this.board.toggleKeep(id); }
    else if (what === 'discard') {
      if (this.confirm !== id) this.confirm = id; // first press asks
      else { this.confirm = null; await this.board.discard(id); this.sel = Math.min(this.sel, this.list.length - 1); }
    }
    this.render();
  }

  /** A key while the panel is open; true if it was used. */
  key(code) {
    const n = this.list.length, cols = 5;
    if (code === 'ArrowRight' || code === 'KeyD') this.sel = Math.min(n - 1, this.sel + 1);
    else if (code === 'ArrowLeft' || code === 'KeyA') this.sel = Math.max(0, this.sel - 1);
    else if (code === 'ArrowDown') this.sel = Math.min(n - 1, this.sel + cols);
    else if (code === 'ArrowUp') this.sel = Math.max(0, this.sel - cols);
    else if (code === 'KeyS') { this.act('keep'); return true; }
    else if (code === 'Delete' || code === 'Backspace') { this.act('discard'); return true; }
    else return false;
    this.confirm = null;
    this.render();
    return true;
  }

  render() {
    const list = this.list;
    this.grid.innerHTML = list.length ? '' : '<p class="empty">Klappa en katt så hamnar den här!</p>';
    list.forEach((p, i) => {
      const id = p.id ?? p.time, card = document.createElement('div');
      card.className = `card${i === this.sel ? ' sel' : ''}${p.kept ? ' kept' : ''}`;
      card.innerHTML = `<img alt=""><b></b><small>${fmt(p.time)}</small><div class="acts">
        <button data-act="keep" data-i="${i}" aria-pressed="${!!p.kept}">${p.kept ? '📌 Sparad' : '📌 Spara'}</button>
        <button data-act="discard" data-i="${i}">${this.confirm === id ? 'Säker? 🗑' : '🗑 Släng'}</button></div>`;
      card.querySelector('img').src = p.data;
      card.querySelector('b').textContent = p.kitten ? `${p.name} 🐾 kattunge` : p.name;
      this.grid.append(card);
    });
    this.grid.querySelector('.sel')?.scrollIntoView?.({ block: 'nearest' });
  }
}

function rng(seed) {
  let s = (seed % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * Photograph `target` (world position) from the visitor's eye: a 4:3 render to an offscreen
 * target, returned as a JPEG data URL.
 */
export function snapshot(renderer, scene, camera, target, w = 320, h = 240) {
  // frame about 0.6 m around the cat, whatever the distance
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(0.3 / camera.position.distanceTo(target)));
  const cam = new THREE.PerspectiveCamera(THREE.MathUtils.clamp(fov, 12, 60), w / h, 0.05, 100);
  cam.position.copy(camera.position);
  cam.lookAt(target);
  const rt = new THREE.WebGLRenderTarget(w, h);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // flip
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}
