import { MusicLoop } from './music.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAPTOP as L, MUSIC } from './config.js';
import { sfx } from './audio.js';
import { mergeStatic } from './merge.js';

// Tilly's laptop on the vanity (#283): a thin unbranded rose-gold laptop with two stickers on the lid. Its screen shows
// "Klipp", an invented short-video app (no real brand or people, everything drawn on a canvas): a phone-shaped column of
// clips in the middle of a dark browser window, a username, a caption, a like counter and a progress bar; every
// LAPTOP.swipe s it slides up to the next clip. Each clip has quiet CC0 music (generated beats as an offline fallback). Two E targets: the screen (on,
// then the next clip) and the keyboard (on / off). It plays until switched off (or F), like the TVs.

const TAU = Math.PI * 2;

/** The clips: user, caption, likes, beat (bpm, the blip's notes in Hz), bg (the dimmed colour round the column) and
 * draw(g, w, h, t) in the column's frame (w × h, t = seconds into the clip). */
export const CLIPS = [
  { key: 'dans', user: '@dansdags', caption: 'ny dans, hänger du med? #dans', likes: '128k', bpm: 112, notes: [330, 392, 440, 392], bg: '#3a1030',
    draw(g, w, h, t) {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff6fb5'); gr.addColorStop(1, '#ffb36b');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const b = t * (112 / 60) * Math.PI, cx = w / 2 + Math.sin(b / 2) * 10, cy = h * 0.5 + Math.abs(Math.sin(b)) * -6;
      g.strokeStyle = '#2a1030'; g.lineWidth = 6; g.lineCap = 'round';
      const limb = (x, y, a, l) => { const ex = x + Math.sin(a) * l, ey = y + Math.cos(a) * l; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke(); return [ex, ey]; };
      g.beginPath(); g.moveTo(cx, cy - 30); g.lineTo(cx, cy + 20); g.stroke();                  // body
      for (const s of [-1, 1]) {
        const [ex, ey] = limb(cx, cy - 24, s * (2.0 + Math.sin(b + (s > 0 ? 0 : Math.PI)) * 0.9), 22); // arms
        limb(ex, ey, s * (2.6 + Math.sin(b * 2) * 0.6), 18);
        const [kx, ky] = limb(cx, cy + 20, s * (0.35 + Math.max(0, Math.sin(b + (s > 0 ? 0 : Math.PI))) * 0.5), 24); // legs
        limb(kx, ky, s * 0.1, 22);
      }
      g.fillStyle = '#2a1030'; g.beginPath(); g.arc(cx, cy - 42, 11, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 6; i++) { const k = (t * 0.6 + i / 6) % 1; g.fillRect(((i * 37) % w), h * (1 - k), 3, 3); }
    } },
  { key: 'katt', user: '@kattliv', caption: 'när kartongen är för liten men ändå', likes: '342k', bpm: 96, notes: [262, 330, 392, 330], bg: '#2b2418',
    draw(g, w, h, t) {
      g.fillStyle = '#f3e3c3'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d9c6a0'; g.fillRect(0, h * 0.72, w, h * 0.28);                             // the floor
      const pop = Math.max(0, Math.sin(t * 2.2)) ** 0.5, by = h * 0.72;
      const cx = w / 2, cy = by - 18 - pop * 26;
      g.fillStyle = '#e08a3c'; g.beginPath(); g.ellipse(cx, cy, 24, 20, 0, 0, TAU); g.fill();    // the cat's head …
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 22, cy - 6); g.lineTo(cx + s * 16, cy - 30); g.lineTo(cx + s * 6, cy - 16); g.fill(); } // … ears
      g.fillStyle = '#222';
      const blink = (t % 2.5) < 0.12;
      for (const s of [-1, 1]) { if (blink) g.fillRect(cx + s * 9 - 4, cy - 3, 8, 2); else { g.beginPath(); g.arc(cx + s * 9, cy - 2, 3.5, 0, TAU); g.fill(); } }
      g.beginPath(); g.moveTo(cx - 3, cy + 6); g.lineTo(cx + 3, cy + 6); g.lineTo(cx, cy + 9); g.fill();
      g.fillStyle = '#b07a43'; g.fillRect(cx - 34, by - 22, 68, 30);                            // the box, too small
      g.fillStyle = '#9a6a38'; g.fillRect(cx - 38, by - 26, 18, 8); g.fillRect(cx + 20, by - 26, 18, 8);
      g.fillStyle = '#e08a3c'; g.beginPath(); g.ellipse(cx + 40, by - 4 + Math.sin(t * 4) * 3, 6, 14, 0.6, 0, TAU); g.fill(); // the tail sticking out
    } },
  { key: 'smink', user: '@glitterlina', caption: 'swatchar hela nya paletten', likes: '76k', bpm: 100, notes: [349, 440, 523, 440], bg: '#30182a',
    draw(g, w, h, t) {
      g.fillStyle = '#f6d9cf'; g.fillRect(0, 0, w, h);
      const cols = ['#f5d0c5', '#e8a598', '#c97b84', '#9b5de5', '#ff6fb5', '#00bbf9', '#fee440', '#2b2b2b'];
      g.fillStyle = '#e9b9a3'; g.fillRect(w * 0.2, 0, w * 0.6, h);                               // an arm, held up
      const n = Math.min(cols.length, Math.floor(t * 1.4) + 1);
      for (let i = 0; i < n; i++) {
        const k = i === n - 1 ? Math.min(1, (t * 1.4) % 1 * 1.5) : 1;
        g.fillStyle = cols[i]; g.beginPath(); g.ellipse(w / 2, 20 + i * 27, w * 0.24 * k, 8, -0.15, 0, TAU); g.fill();
      }
      const fx = w / 2 + Math.cos(t * 6) * w * 0.2, fy = 20 + (n - 1) * 27;                     // the fingertip swiping
      g.fillStyle = '#d9a48c'; g.beginPath(); g.ellipse(fx, fy - 6, 9, 13, 0, 0, TAU); g.fill();
    } },
  { key: 'mat', user: '@matmagi', caption: 'pannkakstorn på 10 sek', likes: '51k', bpm: 90, notes: [294, 370, 440, 370], bg: '#2b1e10',
    draw(g, w, h, t) {
      g.fillStyle = '#fbe7c6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w / 2, h * 0.75, w * 0.42, 14, 0, 0, TAU); g.fill(); // the plate
      const n = Math.min(7, Math.floor(t * 1.2) + 1);
      for (let i = 0; i < n; i++) {
        const y = h * 0.72 - i * 11 - (i === n - 1 ? Math.max(0, 1 - ((t * 1.2) % 1) * 3) * 40 : 0);
        g.fillStyle = '#d9a35a'; g.beginPath(); g.ellipse(w / 2, y, w * 0.32, 9, 0, 0, TAU); g.fill();
        g.fillStyle = '#efc27a'; g.beginPath(); g.ellipse(w / 2, y - 3, w * 0.3, 6, 0, 0, TAU); g.fill();
      }
      if (t > 5) { // syrup
        const k = Math.min(1, (t - 5) / 1.5), top = h * 0.72 - (n - 1) * 11 - 4;
        g.fillStyle = 'rgba(160,82,20,0.85)'; g.beginPath(); g.ellipse(w / 2, top, w * 0.22 * k + 2, 4, 0, 0, TAU); g.fill();
        g.fillRect(w / 2 + w * 0.2 * k, top, 4, 40 * k);
      }
      g.fillStyle = '#fff6d0'; g.fillRect(w / 2 - 7, h * 0.72 - (n - 1) * 11 - 12, 14, 7);       // butter
    } },
  { key: 'pov', user: '@povkungen', caption: 'POV #relaterbart', likes: '210k', bpm: 120, notes: [392, 392, 494, 440], bg: '#101830',
    draw(g, w, h, t) {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a86ff'); gr.addColorStop(1, '#8338ec');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const lines = ['POV:', 'du öppnar', 'garderoben', 'och en katt', 'tittar på dig'];
      g.textAlign = 'center'; g.font = 'bold 15px sans-serif';
      lines.forEach((s, i) => {
        if (t < i * 0.7) return;
        const y = h * 0.3 + i * 22 + Math.sin(t * 3 + i) * 1.5, wd = g.measureText(s).width + 10;
        g.fillStyle = '#ffffff'; g.fillRect(w / 2 - wd / 2, y - 14, wd, 19);
        g.fillStyle = '#111111'; g.fillText(s, w / 2, y);
      });
      g.textAlign = 'left';
    } },
  { key: 'basket', user: '@tillyhoops', caption: 'swish från trepoängslinjen', likes: '18k', bpm: 104, notes: [220, 262, 330, 262], bg: '#2a1a10',
    draw(g, w, h, t) {
      g.fillStyle = '#c9864a'; g.fillRect(0, h * 0.6, w, h * 0.4);                              // the court
      g.fillStyle = '#87b8e8'; g.fillRect(0, 0, w, h * 0.6);
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.arc(w * 0.85, h * 0.95, w * 0.7, Math.PI, Math.PI * 1.35); g.stroke();
      g.fillStyle = '#ffffff'; g.fillRect(w * 0.78, h * 0.12, 26, 20);                            // the board
      g.strokeStyle = '#e63946'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.7, h * 0.26); g.lineTo(w * 0.84, h * 0.26); g.stroke(); // the rim
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(w * 0.7 + i * 6, h * 0.26); g.lineTo(w * 0.72 + i * 5, h * 0.33); g.stroke(); }
      const k = (t % 2.2) / 1.4, x0 = w * 0.15, y0 = h * 0.62, x1 = w * 0.77, y1 = h * 0.25;
      const x = k < 1 ? x0 + (x1 - x0) * k : x1, y = k < 1 ? y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * h * 0.3 : y1 + (k - 1) * h * 0.8;
      g.fillStyle = '#f07c1e'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
      g.strokeStyle = '#3b1d0a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.stroke();
    } },
  { key: 'kpop', user: '@neonkrew', caption: 'gruppdans i sync #kpop', likes: '1,2M', bpm: 128, notes: [440, 523, 587, 659], bg: '#120a24',
    draw(g, w, h, t) {
      g.fillStyle = '#120a24'; g.fillRect(0, 0, w, h);
      const b = t * (128 / 60) * Math.PI;
      for (let i = 0; i < 4; i++) { // light beams
        g.fillStyle = `hsla(${(i * 90 + t * 60) % 360},90%,60%,0.22)`;
        const x = w * (0.15 + i * 0.25) + Math.sin(b / 4 + i) * 12;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 26, h * 0.85); g.lineTo(x + 26, h * 0.85); g.fill();
      }
      g.fillStyle = '#2a1650'; g.fillRect(0, h * 0.85, w, h * 0.15);
      for (const [dx, sc] of [[-0.3, 0.85], [0, 1], [0.3, 0.85]]) { // three silhouettes, the same moves
        const cx = w / 2 + dx * w, fy = h * 0.85, s = sc * 1.1, sway = Math.sin(b) * 6;
        g.fillStyle = '#05030a'; g.strokeStyle = '#05030a'; g.lineWidth = 5 * s; g.lineCap = 'round';
        g.beginPath(); g.arc(cx + sway, fy - 62 * s, 7 * s, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(cx + sway, fy - 54 * s); g.lineTo(cx + sway * 0.5, fy - 28 * s); g.stroke();
        for (const sd of [-1, 1]) {
          const up = Math.sin(b + (sd > 0 ? 0 : Math.PI)) > 0;
          g.beginPath(); g.moveTo(cx + sway, fy - 50 * s); g.lineTo(cx + sway + sd * 14 * s, fy - (up ? 70 : 38) * s); g.stroke();
          g.beginPath(); g.moveTo(cx + sway * 0.5, fy - 28 * s); g.lineTo(cx + sd * 9 * s, fy); g.stroke();
        }
      }
    } },
  { key: 'slime', user: '@slimeslottet', caption: 'så satisfying att skära', likes: '93k', bpm: 84, notes: [262, 294, 330, 392], bg: '#14202a',
    draw(g, w, h, t) {
      g.fillStyle = '#e8f1f2'; g.fillRect(0, 0, w, h);
      const cols = ['#ff6fb5', '#fee440', '#00f5d4', '#9b5de5', '#00bbf9'], top = h * 0.45, bh = 60;
      const cut = Math.floor(t / 0.9), k = (t / 0.9) % 1, x0 = w * 0.18 + cut * 14 % (w * 0.5);
      for (let i = 0; i < cols.length; i++) { g.fillStyle = cols[i]; g.fillRect(x0, top + i * (bh / cols.length), w * 0.82 - x0, bh / cols.length + 0.5); } // the block of sand
      for (let i = 0; i < cols.length; i++) { // the slice falling away
        g.save(); g.translate(x0 - 6, top + bh); g.rotate(-Math.min(1, k * 1.5) * 0.9); g.fillStyle = cols[i];
        g.fillRect(-10, -bh + i * (bh / cols.length), 10, bh / cols.length + 0.5); g.restore();
      }
      const ky = top - 40 + Math.min(1, k * 2) * (bh + 30);                                      // the knife
      g.fillStyle = '#c8ccd0'; g.fillRect(x0 - 2, ky - 40, 3, 60);
      g.fillStyle = '#333'; g.fillRect(x0 - 3, ky - 62, 5, 22);
    } },
];

const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };

/** The screen: a canvas with a browser window, the app's column with the current clip, and the swipe to the next. */
export class Feed {
  constructor(seed = 7) {
    const [W, H] = L.px;
    this.canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.order = CLIPS.map((_, i) => i);
    let s = seed; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
    this.n = 0; this.t = 0; this.slide = -1; this.liked = 0;
  }
  get clip() { return CLIPS[this.order[this.n % this.order.length]]; }
  get nextClip() { return CLIPS[this.order[(this.n + 1) % this.order.length]]; }
  /** Start the swipe up to the next clip (ignored while one is under way). */
  swipe() { if (this.slide < 0) this.slide = 0; }
  /** Advance by dt; returns the new clip when a swipe has just finished. */
  step(dt) {
    this.t += dt;
    if (this.slide < 0 && this.t > L.swipe) this.swipe();
    if (this.slide >= 0) {
      this.slide += dt / L.slide;
      if (this.slide >= 1) { this.slide = -1; this.n++; this.t = 0; return this.clip; }
    }
    return null;
  }
  draw() {
    const g = this.g, [W, H] = L.px, ch = H - 18, cw = Math.round(ch * 9 / 16), x0 = Math.round((W - cw) / 2), y0 = 18;
    const c = this.clip;
    g.fillStyle = '#d9d9de'; g.fillRect(0, 0, W, 18);                                             // the browser's tab bar …
    g.fillStyle = '#f4f4f7'; roundRect(g, 8, 3, 90, 15, 4); g.fill();
    g.fillStyle = '#b28bd8'; roundRect(g, 13, 6, 9, 9, 2); g.fill();
    g.fillStyle = '#333'; g.font = '9px sans-serif'; g.fillText('Klipp – för dig', 26, 14);
    g.fillStyle = c.bg; g.fillRect(0, 18, W, H - 18);                                             // … and the dimmed page
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 18, W, H - 18);
    // the app's name and menu on the left
    g.fillStyle = '#b28bd8'; roundRect(g, 14, 30, 20, 20, 5); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText('K', 19, 45);
    g.fillText('Klipp', 40, 45);
    g.font = '10px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)';
    ['För dig', 'Följer', 'Utforska', 'LIVE'].forEach((s, i) => g.fillText(s, 16, 72 + i * 18));
    // the column: the clip (and the next one sliding up during a swipe)
    g.save(); g.beginPath(); g.rect(x0, y0, cw, ch); g.clip();
    const k = this.slide < 0 ? 0 : this.slide * this.slide * (3 - 2 * this.slide), off = -k * ch;
    const one = (clip, t, dy) => { g.save(); g.translate(x0, y0 + dy); clip.draw(g, cw, ch, t); this.overlay(g, clip, cw, ch, t); g.restore(); };
    one(c, this.t, off);
    if (this.slide >= 0) one(this.nextClip, 0, off + ch);
    g.restore();
  }
  /** Username, caption, the like / comment / share column and the progress bar over a clip. */
  overlay(g, c, w, h, t) {
    const sh = 'rgba(0,0,0,0.45)';
    g.fillStyle = sh; g.fillRect(0, h - 44, w, 44);
    g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.fillText(c.user, 6, h - 28);
    g.font = '9px sans-serif'; g.fillText(c.caption.length > 30 ? `${c.caption.slice(0, 29)}…` : c.caption, 6, h - 15);
    const rx = w - 14;
    g.fillStyle = '#ff4d6d'; g.beginPath(); g.moveTo(rx, h * 0.52 + 8); g.bezierCurveTo(rx - 12, h * 0.52, rx - 8, h * 0.52 - 9, rx, h * 0.52 - 3);
    g.bezierCurveTo(rx + 8, h * 0.52 - 9, rx + 12, h * 0.52, rx, h * 0.52 + 8); g.fill();   // a heart
    g.fillStyle = '#fff'; g.font = '8px sans-serif'; g.textAlign = 'center'; g.fillText(c.likes, rx, h * 0.52 + 18);
    g.fillStyle = 'rgba(255,255,255,0.9)'; roundRect(g, rx - 7, h * 0.62 - 6, 14, 11, 3); g.fill(); g.fillText('…', rx, h * 0.62 + 16); // comments
    g.beginPath(); g.moveTo(rx - 6, h * 0.72); g.lineTo(rx + 7, h * 0.72 - 6); g.lineTo(rx + 7, h * 0.72 + 6); g.fill(); g.textAlign = 'left'; // share
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, h - 3, w, 3);
    g.fillStyle = '#fff'; g.fillRect(0, h - 3, w * Math.min(1, t / L.swipe), 3);
  }
}

const rbox = (w, h, d, x, y, z, m, r = 0.004) => {
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), m);
  o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o;
};

/** The keyboard deck's texture: rows of dark keys on the aluminium. */
function keysTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 96 }), g = c.getContext('2d');
  g.fillStyle = '#d8b6a6'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#2a2628';
  for (let r = 0; r < 5; r++) for (let i = 0; i < 14; i++) {
    if (r === 4 && i > 3 && i < 10) { if (i === 4) g.fillRect(4 + 4 * 18, 4 + r * 18, 6 * 18 - 3, 15); continue; } // the space bar
    g.fillRect(4 + i * 18, 4 + r * 18, 15, 15);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A sticker shape: a five-pointed star or a heart, in the xy plane (size ~s). */
function stickerShape(kind, s) {
  const sh = new THREE.Shape();
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.42 : s; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  } else {
    sh.moveTo(0, -s); sh.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.8, s * 1.1, 0, s * 0.45); sh.bezierCurveTo(s * 0.8, s * 1.1, s * 1.4, -s * 0.1, 0, -s);
  }
  return new THREE.ShapeGeometry(sh, 8);
}

/** The laptop (a furniture builder): faces local +z (the user), the hinge at −z; two E targets in userData.targets. */
export function laptop(item) {
  const g = new THREE.Group(), { w, d } = L, hb = L.base;
  const alu = new THREE.MeshStandardMaterial({ color: 0xe2bfae, roughness: 0.35, metalness: 0.6 });   // rose gold
  const base = new THREE.Group(), lid = new THREE.Group();
  base.add(rbox(w, hb, d, 0, hb / 2, 0, alu, 0.004));
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, d * 0.45).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: keysTexture(), roughness: 0.6, metalness: 0.2 }));
  deck.position.set(0, hb + 0.0005, -d * 0.18);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd3b0a0, roughness: 0.3, metalness: 0.5 }));
  pad.position.set(0, hb + 0.0005, d * 0.27);
  base.add(deck, pad);
  // the lid: hinged at the back edge, opened to LAPTOP.open°; its inner face (+z) has the black bezel and the screen
  const lh = d - 0.005;
  lid.add(rbox(w, lh, L.lid, 0, lh / 2, -L.lid / 2, alu, 0.003));
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.006, lh - 0.006), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.3 }));
  bezel.position.set(0, lh / 2, 0.0004);
  lid.add(bezel);
  const sw = w - 0.026, shh = sw * L.px[1] / L.px[0];
  const feed = new Feed(item.seed ?? 11);
  // #402: the screen and the stickers lie < 1 mm off the lid: pulled forward in depth so they never flicker through it
  const decal = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
  const onMat = new THREE.MeshBasicMaterial({ map: feed.texture, toneMapped: false, ...decal });
  const offMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.1, metalness: 0.5, ...decal });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, shh), offMat);
  screen.position.set(0, lh / 2 + 0.006, 0.0008);
  lid.add(screen);
  // stickers on the back of the lid: a yellow star and a pink heart (no logo)
  for (const [kind, x, y, s, col, rz] of [['star', -0.07, 0.13, 0.022, 0xffd23f, 0.2], ['heart', 0.06, 0.07, 0.02, 0xff6fb5, -0.25]]) {
    const st = new THREE.Mesh(stickerShape(kind, s).rotateZ(rz).rotateY(Math.PI), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, ...decal }));
    st.position.set(x, y, -L.lid - 0.0006);
    lid.add(st);
  }
  lid.position.set(0, hb, -d / 2 + 0.002);
  lid.rotation.x = -THREE.MathUtils.degToRad(L.open - 90);
  g.add(base, lid);
  mergeStatic(base);
  mergeStatic(lid, [screen]);
  const music = new MusicLoop(L.gain);
  let on = false, acc = 0, beatAcc = 0, beatN = 0;
  const pos = new THREE.Vector3();
  const where = () => screen.getWorldPosition(pos);
  const self = {
    feed, screen, music, onClip: null,
    get on() { return on; },
    set(v) {
      if (on === v) return;
      on = v;
      if (!on) music.stop();
      screen.material = on ? onMat : offMat;
      if (on) { feed.t = 0; feed.slide = -1; feed.draw(); feed.texture.needsUpdate = true; acc = beatAcc = 0; self.onClip?.(feed.clip.key); }
    },
    update(dt) {
      if (!on) return;
      const fresh = feed.step(dt);
      if (fresh) self.onClip?.(fresh.key);
      acc += dt;
      if (acc >= 1 / L.fps) { feed.draw(); feed.texture.needsUpdate = true; acc = 0; }
      const tracks = [MUSIC.game[1], MUSIC.kids[0], MUSIC.lofi[1]];
      if (music.update(tracks[CLIPS.indexOf(feed.clip) % tracks.length], where())) return;
      // the fallback beat: eighth notes — kick on 1 and 5, snare on 3 and 7, a hat on each, a blip on the even ones
      const c = feed.clip, len = 30 / c.bpm;
      beatAcc += dt;
      if (beatAcc >= len) {
        beatAcc %= len;
        const s = beatN++ % 8, p = where();
        sfx.beat(p, 'hat', L.gain * 0.6);
        if (s === 0 || s === 4) sfx.beat(p, 'kick', L.gain);
        if (s === 2 || s === 6) sfx.beat(p, 'snare', L.gain * 0.8);
        if (s % 2 === 0 && feed.slide < 0) sfx.beat(p, 'blip', L.gain * 0.5, c.notes[(s / 2) % c.notes.length]);
      }
    },
  };
  const screenT = {
    kind: 'laptop', part: 'screen', pickable: lid, laptop: self,
    get isOpen() { return on; },
    get name() { return on ? 'nästa klipp' : 'laptopen'; },
    get verb() { return on ? 'bläddra till' : 'slå på'; },
    toggle() { if (!on) self.set(true); else feed.swipe(); return on; },
    update: (dt) => self.update(dt),
  };
  const powerT = {
    kind: 'laptop', part: 'power', pickable: base, laptop: self, name: 'laptopen',
    get isOpen() { return on; },
    get verb() { return on ? 'stänga av' : 'slå på'; },
    toggle() { self.set(!on); return on; },
  };
  lid.traverse((m) => { m.userData.door = screenT; });
  base.traverse((m) => { m.userData.door = powerT; });
  g.userData.targets = [screenT, powerT];
  g.userData.keep = [base, lid];
  g.userData.laptop = self;
  g.userData.footprint = [];
  g.position.y = item.y ?? 0;
  return g;
}
