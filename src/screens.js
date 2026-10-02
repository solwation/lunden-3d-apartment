// TV programmes (#68, #100, #101): procedural "programmes" drawn on a canvas (no image files, no logos),
// a burst of snow when the channel changes, and the colour each programme throws on the wall (Ambilight).
// A Screen owns the canvas + texture; the TVs in furniture.js redraw it at their own low frame rate.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** Each programme: name, draw(ctx, w, h, t, r) with r a seeded random source fixed per programme run, and
 * glow(t) → [hue 0–1, saturation, lightness] for the Ambilight. */
export const PROGRAMS = [
  {
    name: 'färgvirvlar', // the original demo picture of the living-room TV (#68)
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#12082a'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      [[285, 0.9], [320, 0.85], [25, 0.9], [50, 0.95], [175, 0.8], [215, 0.85]].forEach(([hue, sat], i) => {
        const x = w * (0.5 + 0.38 * Math.sin(t * 0.21 + i * 1.7)), y = h * (0.5 + 0.36 * Math.cos(t * 0.17 + i * 2.3));
        const g = ctx.createRadialGradient(x, y, 0, x, y, h * (0.55 + 0.15 * Math.sin(t * 0.3 + i)));
        g.addColorStop(0, `hsla(${hue},${sat * 100}%,60%,0.85)`); g.addColorStop(1, `hsla(${hue},${sat * 100}%,50%,0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = 'source-over';
    },
    glow: (t) => [((t * 8) % 360) / 360, 0.7, 0.32],
  },
  {
    name: 'rymdresa', // stars rushing past, a ringed planet, a little rocket
    draw(ctx, w, h, t, r) {
      ctx.fillStyle = '#04030f'; ctx.fillRect(0, 0, w, h);
      const R = rnd(7);
      for (let i = 0; i < 90; i++) {
        const a = R() * TAU, k = (R() + t * 0.25) % 1, d = k * k * w * 0.8;
        const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d * 0.7;
        ctx.fillStyle = `rgba(255,255,255,${0.3 + k * 0.7})`;
        ctx.fillRect(x, y, 1 + k * 2.5, 1 + k * 2.5);
      }
      const px = w * (0.75 - ((t * 0.01) % 0.3)), py = h * 0.35;
      const g = ctx.createRadialGradient(px - 12, py - 12, 4, px, py, 38);
      g.addColorStop(0, '#ffcf8a'); g.addColorStop(1, '#a8452a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 34, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,170,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(px, py, 58, 12, -0.3, 0, TAU); ctx.stroke();
      const rx = w * 0.3 + Math.sin(t * 0.7) * 30, ry = h * 0.62 + Math.sin(t * 1.3) * 10;
      ctx.save(); ctx.translate(rx, ry); ctx.rotate(-0.5 + Math.sin(t) * 0.1);
      ctx.fillStyle = `hsl(${30 + r() * 30},100%,${55 + r() * 10}%)`;
      ctx.beginPath(); ctx.moveTo(-30, -6); ctx.lineTo(-30 - 14 - r() * 10, 0); ctx.lineTo(-30, 6); ctx.fill(); // flame
      ctx.fillStyle = '#e8ecf2'; ctx.beginPath(); ctx.moveTo(-30, -9); ctx.lineTo(14, -9); ctx.lineTo(30, 0); ctx.lineTo(14, 9); ctx.lineTo(-30, 9); ctx.fill();
      ctx.fillStyle = '#d33'; ctx.fillRect(-30, -14, 10, 28);
      ctx.fillStyle = '#5fc3ff'; ctx.beginPath(); ctx.arc(6, 0, 4.5, 0, TAU); ctx.fill();
      ctx.restore();
    },
    glow: (t) => [0.68 + 0.04 * Math.sin(t * 0.3), 0.7, 0.28],
  },
  {
    name: 'undervattensvärld', // fish and bubbles in sunlit water
    draw(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1fa3c9'); g.addColorStop(1, '#063457');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 5; i++) { const x = (i * 90 + Math.sin(t * 0.4 + i) * 20) % w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x - 30, h); ctx.lineTo(x - 60, h); ctx.fill(); }
      ctx.fillStyle = '#d9c38a'; ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h - 16 - 6 * Math.sin(x * 0.05));
      ctx.lineTo(w, h); ctx.fill();
      const R = rnd(3);
      for (let i = 0; i < 9; i++) {
        const dir = R() < 0.5 ? 1 : -1, sp = 20 + R() * 35, y = h * (0.15 + R() * 0.65), s = 8 + R() * 12;
        const x = ((R() * w + dir * t * sp) % (w + 80) + w + 80) % (w + 80) - 40;
        ctx.fillStyle = `hsl(${[10, 40, 300, 200, 55][i % 5]},90%,60%)`;
        ctx.beginPath(); ctx.ellipse(x, y + Math.sin(t * 2 + i) * 3, s, s * 0.55, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - dir * s * 0.8, y); ctx.lineTo(x - dir * s * 1.6, y - s * 0.6); ctx.lineTo(x - dir * s * 1.6, y + s * 0.6); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + dir * s * 0.5, y - s * 0.12, 1.6, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 18; i++) { const x = (R() * w + Math.sin(t + i) * 6), y = h - ((R() * h + t * (20 + R() * 25)) % h); ctx.beginPath(); ctx.arc(x, y, 1.5 + R() * 3, 0, TAU); ctx.stroke(); }
    },
    glow: (t) => [0.53 + 0.02 * Math.sin(t * 0.5), 0.8, 0.3],
  },
  {
    name: 'superhjältar', // speed lines, explosions, POW!
    draw(ctx, w, h, t, r) {
      const beat = Math.floor(t / 1.6), k = (t % 1.6) / 1.6;
      ctx.fillStyle = ['#1b2bd6', '#d11c3a', '#f2b705'][beat % 3]; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(w / 2, h / 2);
      for (let i = 0; i < 24; i++) { ctx.rotate(TAU / 24); ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, -18); ctx.lineTo(w, 18); ctx.fill(); }
      ctx.restore();
      const R = rnd(beat * 13 + 1);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.2 + R() * 0.6), y = h * (0.2 + R() * 0.6), s = (20 + R() * 40) * (0.4 + k);
        ctx.fillStyle = `rgba(255,${150 + R() * 100},0,${1 - k})`;
        ctx.beginPath();
        for (let j = 0; j < 16; j++) { const a = j / 16 * TAU, q = j % 2 ? s : s * 0.5; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
        ctx.fill();
      }
      const zoom = 0.6 + Math.min(1, k * 4) * 0.5;
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.12); ctx.scale(zoom, zoom);
      ctx.font = 'bold 64px Impact, Arial Black, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe600';
      const word = ['POW!', 'ZAP!', 'BAM!', 'WHAM!'][beat % 4];
      ctx.strokeText(word, 0, 0); ctx.fillText(word, 0, 0);
      ctx.restore();
      if (r() < 0.02) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(0, 0, w, h); }
    },
    glow: (t) => [[0.64, 0.97, 0.12][Math.floor(t / 1.6) % 3], 0.9, 0.35],
  },
  {
    name: 'enhörningssagan', // a pastel sky, a rainbow, glitter and a unicorn trotting along
    draw(ctx, w, h, t, r) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffc6ea'); g.addColorStop(1, '#c9b8ff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ['#ff4d6d', '#ff9f43', '#ffe14d', '#5bd96a', '#4dabff', '#9b6bff'].forEach((c, i) => {
        ctx.strokeStyle = c; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(w * 0.5, h * 1.05, h * 0.85 - i * 9, Math.PI, TAU); ctx.stroke();
      });
      ctx.fillStyle = '#ffffff';
      for (const [cx, cy] of [[60, 50], [300, 40]]) for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.arc(cx + j * 16 + ((t * 6) % w), cy + (j % 2) * 6, 14, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#7ad46e'; ctx.fillRect(0, h * 0.82, w, h * 0.18);
      const x = ((t * 40) % (w + 120)) - 60, y = h * 0.66 + Math.abs(Math.sin(t * 5)) * -6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(x, y, 28, 15, 0, 0, TAU); ctx.fill();           // body
      ctx.beginPath(); ctx.ellipse(x + 30, y - 18, 11, 9, -0.5, 0, TAU); ctx.fill(); // head
      ctx.fillRect(x + 20, y - 22, 9, 20);                                          // neck
      for (const [lx, ph] of [[-18, 0], [-8, 1.5], [10, 3], [20, 4.5]]) ctx.fillRect(x + lx, y + 10, 5, 18 + Math.sin(t * 10 + ph) * 3); // legs
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(x + 32, y - 26); ctx.lineTo(x + 42, y - 44); ctx.lineTo(x + 38, y - 24); ctx.fill(); // horn
      ['#ff6fb1', '#b46bff', '#5fc6ff'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + 14 - i * 4, y - 26 + i * 5, 8, 12); ctx.fillRect(x - 34 - i * 3, y - 6 + i * 4, 10, 5); }); // mane, tail
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x + 34, y - 20, 1.6, 0, TAU); ctx.fill();
      for (let i = 0; i < 30; i++) { const a = r(); ctx.fillStyle = `hsla(${a * 360},100%,85%,${r()})`; const s = 1 + r() * 2.5; ctx.fillRect(r() * w, r() * h * 0.8, s, s); }
    },
    glow: (t) => [0.9 + 0.04 * Math.sin(t * 0.4), 0.75, 0.38],
  },
  {
    name: 'neonracet', // a racing car on a neon road towards a synthwave sun
    draw(ctx, w, h, t) {
      ctx.fillStyle = '#0a0018'; ctx.fillRect(0, 0, w, h);
      const hy = h * 0.5;
      const sun = ctx.createLinearGradient(0, hy - 70, 0, hy);
      sun.addColorStop(0, '#ffd23f'); sun.addColorStop(1, '#ff2d95');
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(w / 2, hy, 60, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#0a0018'; for (let i = 0; i < 5; i++) ctx.fillRect(w / 2 - 62, hy - 8 - i * 11, 124, 2 + i * 0.6);
      ctx.strokeStyle = '#ff2dd4'; ctx.lineWidth = 1.5;
      for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 8, hy); ctx.lineTo(w / 2 + i * 70, h); ctx.stroke(); }
      for (let i = 0; i < 8; i++) { const k = ((i / 8 + t * 0.5) % 1); const y = hy + (h - hy) * k * k; ctx.globalAlpha = k; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
      const cx = w / 2 + Math.sin(t * 0.9) * 50, cy = h * 0.82;
      ctx.fillStyle = '#19e3ff'; ctx.beginPath(); ctx.moveTo(cx - 40, cy + 14); ctx.lineTo(cx - 34, cy - 4); ctx.lineTo(cx - 16, cy - 14); ctx.lineTo(cx + 16, cy - 14); ctx.lineTo(cx + 34, cy - 4); ctx.lineTo(cx + 40, cy + 14); ctx.fill();
      ctx.fillStyle = '#0a0018'; ctx.fillRect(cx - 14, cy - 11, 28, 8);
      ctx.fillStyle = '#ff3355'; ctx.fillRect(cx - 36, cy + 2, 12, 5); ctx.fillRect(cx + 24, cy + 2, 12, 5);
    },
    glow: (t) => [0.85 + 0.08 * Math.sin(t * 0.7), 0.9, 0.33],
  },
  {
    name: 'naturfilm', // rolling hills and trees passing under a sky going from dawn to day and back
    draw(ctx, w, h, t) {
      const k = 0.5 + 0.5 * Math.sin(t * 0.08);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `hsl(${205 - 30 * (1 - k)},70%,${45 + 20 * k}%)`); g.addColorStop(1, `hsl(${30 + 10 * k},85%,${60 + 15 * k}%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `hsl(45,100%,${70 + 15 * k}%)`; ctx.beginPath(); ctx.arc(w * 0.7, h * (0.55 - 0.3 * k), 20, 0, TAU); ctx.fill();
      [[0.55, 0.2, '#4c7a4a', 12], [0.68, 0.45, '#3a6a3a', 26], [0.8, 0.9, '#2d5a2e', 45]].forEach(([base, sp, col, amp], li) => {
        const off = t * sp * 30;
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * base - amp * Math.sin((x + off) * 0.012 + li) - amp * 0.4 * Math.sin((x + off) * 0.031));
        ctx.lineTo(w, h); ctx.fill();
        if (li === 2) for (let i = 0; i < 8; i++) {
          const x = ((i * 70 - off) % (w + 70) + w + 70) % (w + 70) - 35, y = h * base - amp * Math.sin((x + off) * 0.012 + li) - amp * 0.4 * Math.sin((x + off) * 0.031);
          ctx.fillStyle = '#5b3b22'; ctx.fillRect(x - 2, y - 18, 4, 18);
          ctx.fillStyle = '#1f4a22'; ctx.beginPath(); ctx.moveTo(x, y - 48); ctx.lineTo(x + 14, y - 14); ctx.lineTo(x - 14, y - 14); ctx.fill();
        }
      });
    },
    glow: (t) => [0.25 - 0.12 * (0.5 - 0.5 * Math.sin(t * 0.08)), 0.6, 0.3],
  },
];

/** A canvas screen: shows a programme, switches channels with a short burst of snow. */
export class Screen {
  constructor(width = 384, height = 216) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.snowCanvas = document.createElement('canvas');
    this.snowCanvas.width = 96; this.snowCanvas.height = 54;
    this.channel = 0; this.t = 0; this.snow = 0; this.rand = Math.random;
  }

  get program() { return PROGRAMS[this.channel]; }

  /** Switch to channel n (or a random other one), through snow. */
  tune(n = null) {
    const old = this.channel;
    this.channel = n ?? (old + 1 + Math.floor(Math.random() * (PROGRAMS.length - 1))) % PROGRAMS.length;
    this.t = Math.random() * 60; // join the programme somewhere in the middle
    this.snow = 0.35;
  }

  /** Redraw for elapsed time dt (call at the screen's frame rate). Returns the Ambilight [h, s, l]. */
  draw(dt) {
    this.t += dt;
    const { ctx, canvas: c } = this;
    if (this.snow > 0) {
      this.snow -= dt;
      const s = this.snowCanvas, sc = s.getContext('2d'), img = sc.createImageData(s.width, s.height);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      sc.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s, 0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = true;
      this.texture.needsUpdate = true;
      return [0, 0, 0.25];
    }
    this.program.draw(ctx, c.width, c.height, this.t, this.rand);
    this.texture.needsUpdate = true;
    return this.program.glow(this.t);
  }
}
