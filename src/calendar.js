import * as THREE from 'three';
import { CALENDAR as C } from './config.js';
import { daysIn } from './daycycle.js';
import { sfx } from './audio.js';

// The cat calendar in the kitchen (#95): a paper calendar with a cartoon cat for each month (own drawings
// on a canvas, seasonal colours), the month's name and year, a grid of the days with week numbers and the
// day cycle's date circled. E opens a strip (#cal-panel) to page through the months and pick a day; the
// chosen date sets the day cycle's date (the sun's path, the season); the time of day stays as it is.

export const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const WEEKDAYS = ['må', 'ti', 'on', 'to', 'fr', 'lö', 'sö'];

/** ISO week number of a date. */
export function isoWeek(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
/** Monday-first weekday (0 = Monday) of the 1st. */
const firstWeekday = (y, m) => (new Date(y, m - 1, 1).getDay() + 6) % 7;

// per month: sky, ground, coat colours and the cat's pose
const SCENES = [
  { sky: '#cfe3f2', ground: '#f4f7fa', coat: '#6b5a4e', pose: 'sit', extra: 'snow' },
  { sky: '#d8e4ee', ground: '#eef3f6', coat: '#e8e2d6', pose: 'curl', extra: 'snow' },
  { sky: '#dff0f5', ground: '#b9d98e', coat: '#d98a3a', pose: 'stretch', extra: 'buds' },
  { sky: '#e6f4fb', ground: '#9fd27a', coat: '#3a3a3a', pose: 'sit', extra: 'flowers' },
  { sky: '#e9f6ff', ground: '#8ccf6a', coat: '#c9c3b8', pose: 'play', extra: 'flowers' },
  { sky: '#bfe3ff', ground: '#7cc45a', coat: '#d98a3a', pose: 'stretch', extra: 'sun' },
  { sky: '#a9dcff', ground: '#7cc45a', coat: '#efe9df', pose: 'curl', extra: 'sun' },
  { sky: '#b6e0ff', ground: '#8cc35e', coat: '#5d5d5d', pose: 'play', extra: 'butterfly' },
  { sky: '#dbe8ef', ground: '#b7c46a', coat: '#8a6a4a', pose: 'sit', extra: 'leaves' },
  { sky: '#e8dccb', ground: '#c9934a', coat: '#d98a3a', pose: 'play', extra: 'leaves' },
  { sky: '#d6d6d9', ground: '#a7926a', coat: '#3a3a3a', pose: 'curl', extra: 'rain' },
  { sky: '#1f2c4a', ground: '#eef3f6', coat: '#c9c3b8', pose: 'sit', extra: 'stars' },
];

/** A simple cartoon cat at (x, y) (its feet), scale s. */
function drawCat(g, x, y, s, coat, pose) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = coat; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
  const ell = (ex, ey, rx, ry, a = 0) => { g.beginPath(); g.ellipse(ex, ey, rx, ry, a, 0, Math.PI * 2); g.fill(); g.stroke(); };
  const ear = (ex, ey, dir) => { g.beginPath(); g.moveTo(ex - 9 * dir, ey); g.lineTo(ex - 4 * dir, ey - 16); g.lineTo(ex + 4 * dir, ey - 2); g.closePath(); g.fill(); g.stroke(); };
  let hx = 0, hy = -62;
  if (pose === 'curl') { ell(0, -18, 46, 22); hx = -34; hy = -30; g.lineWidth = 7; g.strokeStyle = coat; g.beginPath(); g.arc(14, -18, 36, 0.2, 2.2); g.stroke(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.35)'; }
  else if (pose === 'stretch') { ell(0, -22, 48, 18); ell(-40, -8, 8, 10); ell(38, -8, 8, 10); hx = -50; hy = -36; g.lineWidth = 7; g.strokeStyle = coat; g.beginPath(); g.moveTo(44, -28); g.quadraticCurveTo(70, -70, 58, -84); g.stroke(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.35)'; }
  else if (pose === 'play') { ell(0, -28, 30, 26); ell(-16, -2, 9, 7); ell(16, -2, 9, 7); hx = 4; hy = -64; g.fillStyle = '#e8484d'; g.beginPath(); g.arc(42, -8, 9, 0, 6.28); g.fill(); g.fillStyle = coat; g.lineWidth = 7; g.strokeStyle = coat; g.beginPath(); g.moveTo(-26, -20); g.quadraticCurveTo(-58, -30, -50, -64); g.stroke(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.35)'; }
  else { ell(0, -30, 28, 32); ell(-12, -2, 9, 6); ell(12, -2, 9, 6); g.lineWidth = 7; g.strokeStyle = coat; g.beginPath(); g.moveTo(24, -8); g.quadraticCurveTo(52, -10, 46, -46); g.stroke(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.35)'; }
  g.fillStyle = coat;
  ear(hx - 12, hy - 10, 1); ear(hx + 12, hy - 10, -1);
  ell(hx, hy, 22, 19);
  g.fillStyle = '#2b2b2b';
  if (pose === 'curl') { g.fillRect(hx - 11, hy - 1, 7, 2); g.fillRect(hx + 4, hy - 1, 7, 2); }
  else { g.beginPath(); g.ellipse(hx - 8, hy - 2, 3, 4.5, 0, 0, 6.28); g.ellipse(hx + 8, hy - 2, 3, 4.5, 0, 0, 6.28); g.fill(); }
  g.fillStyle = '#e88a9a'; g.beginPath(); g.moveTo(hx - 3, hy + 5); g.lineTo(hx + 3, hy + 5); g.lineTo(hx, hy + 8); g.fill();
  g.strokeStyle = 'rgba(40,40,40,0.6)'; g.lineWidth = 1;
  for (const s2 of [-1, 1]) for (const a of [-0.15, 0.1]) { g.beginPath(); g.moveTo(hx + s2 * 6, hy + 7); g.lineTo(hx + s2 * 26, hy + 7 + a * 40); g.stroke(); }
  g.restore();
}

function drawExtra(g, kind, W, H, rand) {
  if (kind === 'snow') { g.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rand() * W, rand() * H * 0.8, 1.5 + rand() * 2, 0, 6.28); g.fill(); } }
  else if (kind === 'stars') { g.fillStyle = '#fff6c8'; for (let i = 0; i < 30; i++) g.fillRect(rand() * W, rand() * H * 0.6, 2, 2); g.beginPath(); g.arc(W * 0.8, H * 0.2, 16, 0, 6.28); g.fill(); }
  else if (kind === 'sun') { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(W * 0.82, H * 0.2, 22, 0, 6.28); g.fill(); }
  else if (kind === 'rain') { g.strokeStyle = 'rgba(80,110,150,0.6)'; g.lineWidth = 1.5; for (let i = 0; i < 40; i++) { const x = rand() * W, y = rand() * H * 0.75; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 9); g.stroke(); } }
  else if (kind === 'leaves') for (let i = 0; i < 16; i++) { g.fillStyle = ['#d9622b', '#e3a02a', '#b5452a'][i % 3]; g.beginPath(); g.ellipse(rand() * W, rand() * H * 0.85, 6, 3, rand() * 3, 0, 6.28); g.fill(); }
  else if (kind === 'flowers' || kind === 'buds') for (let i = 0; i < 14; i++) { const x = rand() * W, y = H * (0.8 + rand() * 0.15); g.fillStyle = kind === 'buds' ? '#f6f0a8' : ['#f27bb3', '#ffd23f', '#ffffff', '#9b7bff'][i % 4]; g.beginPath(); g.arc(x, y, kind === 'buds' ? 3 : 5, 0, 6.28); g.fill(); }
  else if (kind === 'butterfly') { g.fillStyle = '#ff9a3c'; g.beginPath(); g.ellipse(W * 0.72, H * 0.3, 9, 6, 0.5, 0, 6.28); g.ellipse(W * 0.78, H * 0.3, 9, 6, -0.5, 0, 6.28); g.fill(); }
}

export class CatCalendar {
  constructor(day) {
    Object.assign(this, { day, name: 'almanackan', kind: 'calendar', verb: 'titta på', shown: null });
    const c = document.createElement('canvas');
    c.width = 360; c.height = 540;
    this.canvas = c;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const g = new THREE.Group();
    const page = new THREE.Mesh(new THREE.PlaneGeometry(C.w, C.h), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9 }));
    page.position.z = 0.004;
    const back = new THREE.Mesh(new THREE.BoxGeometry(C.w + 0.01, C.h + 0.01, 0.004), new THREE.MeshStandardMaterial({ color: 0xece8dc, roughness: 0.9 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 16), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.6, roughness: 0.4 }));
    ring.position.set(0, C.h / 2 + 0.008, 0.006);
    g.add(back, page, ring);
    g.position.set(C.x + 0.004, C.y, C.z);
    g.rotation.y = C.rotY;
    g.traverse((m) => { m.userData.door = this; });
    this.object = g;
    this.pickable = g;
    this.draw();
  }

  /** Redraw when the page or the chosen date changed (cheap check; call every frame). */
  update() {
    if (`${this.day.year}-${this.day.month}-${this.day.date}` !== this.shown) this.draw();
  }

  /** The page shown is always the chosen date's month. */
  get view() { return { year: this.day.year, month: this.day.month }; }

  draw() {
    const { year, month } = this.view, g = this.canvas.getContext('2d'), W = this.canvas.width, H = this.canvas.height;
    this.shown = `${year}-${month}-${this.day.date}`;
    g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, W, H);
    // the picture
    const sc = SCENES[month - 1], ph = H * 0.48;
    let seed = month * 31 + 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = sc.sky; g.fillRect(14, 14, W - 28, ph);
    g.fillStyle = sc.ground; g.fillRect(14, 14 + ph * 0.72, W - 28, ph * 0.28);
    g.save(); g.beginPath(); g.rect(14, 14, W - 28, ph); g.clip();
    drawExtra(g, sc.extra, W, ph + 14, rand);
    drawCat(g, W * 0.5, 14 + ph * 0.86, 1.25, sc.coat, sc.pose);
    g.restore();
    // month and year
    g.fillStyle = '#23324a'; g.textAlign = 'center';
    g.font = "bold 34px 'Segoe Print', 'Comic Sans MS', cursive";
    g.fillText(MONTHS[month - 1], W / 2, ph + 58);
    g.font = '16px system-ui, sans-serif'; g.fillStyle = '#6a7c84';
    g.fillText(String(year), W / 2, ph + 80);
    // the grid: week numbers + Monday … Sunday
    const top = ph + 96, cw = (W - 40) / 8, rh = 30, first = firstWeekday(year, month), n = daysIn(year, month);
    g.font = 'bold 13px system-ui, sans-serif';
    ['v', ...WEEKDAYS].forEach((t, i) => { g.fillStyle = i === 7 ? '#c0392b' : '#6a7c84'; g.fillText(t, 20 + cw * (i + 0.5), top + 12); });
    g.font = '15px system-ui, sans-serif';
    for (let d = 1; d <= n; d++) {
      const cell = first + d - 1, row = Math.floor(cell / 7), col = cell % 7;
      const x = 20 + cw * (col + 1.5), y = top + 36 + row * rh;
      if (col === 0 || d === 1) { g.fillStyle = '#9aa7ad'; g.font = '12px system-ui, sans-serif'; g.fillText(String(isoWeek(year, month, d)), 20 + cw * 0.5, y); g.font = '15px system-ui, sans-serif'; }
      const chosen = this.day.year === year && this.day.month === month && this.day.date === d;
      if (chosen) { g.strokeStyle = '#d23a2a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y - 5, 13, 0, 6.28); g.stroke(); }
      g.fillStyle = col === 6 ? '#c0392b' : '#23324a';
      g.fillText(String(d), x, y);
    }
    this.tex.needsUpdate = true;
  }
}

/** The strip (#cal-panel): ◀ month ▶, a grid of day buttons, ×. ← → month, ↑ ↓ day. */
export class CalendarPanel {
  constructor(cal, el) {
    Object.assign(this, { cal, day: cal.day, el });
    this.titleEl = el.querySelector('.title');
    this.gridEl = el.querySelector('.days');
    el.querySelector('[data-act=prev]').addEventListener('click', () => this.page(-1));
    el.querySelector('[data-act=next]').addEventListener('click', () => this.page(1));
  }

  get open() { return !this.el.hidden; }

  show(show) {
    this.el.hidden = !show;
    if (show) this.render();
  }

  /** Page the calendar by `n` months; the chosen date follows to the same day of the new month. */
  page(n) {
    const d = new Date(this.day.year, this.day.month - 1 + n, 1);
    Object.assign(this.day, { year: d.getFullYear(), month: d.getMonth() + 1 });
    this.choose(Math.min(this.day.date, daysIn(this.day.year, this.day.month)));
    sfx.paper(this.cal.object.position);
  }

  /** Set the day cycle's date to day `d` of the page shown. */
  choose(d) {
    this.day.date = d;
    this.cal.draw();
    this.render();
  }

  /** Keyboard while open: ← → months, ↑ ↓ days. Returns true when used. */
  key(code, down) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(code)) return false;
    if (!down) return true;
    if (code === 'ArrowLeft' || code === 'ArrowRight') this.page(code === 'ArrowLeft' ? -1 : 1);
    else {
      this.day.addDays(code === 'ArrowUp' ? 1 : -1);
      this.cal.draw();
      this.render();
    }
    return true;
  }

  render() {
    const v = this.cal.view, n = daysIn(v.year, v.month), first = firstWeekday(v.year, v.month);
    this.titleEl.textContent = `${MONTHS[v.month - 1]} ${v.year}`;
    this.gridEl.replaceChildren(...WEEKDAYS.map((t) => Object.assign(document.createElement('span'), { textContent: t })),
      ...[...Array(first)].map(() => document.createElement('span')),
      ...[...Array(n)].map((_, i) => {
        const b = document.createElement('button');
        b.textContent = String(i + 1);
        if (this.day.year === v.year && this.day.month === v.month && this.day.date === i + 1) b.className = 'on';
        b.addEventListener('click', () => this.choose(i + 1));
        return b;
      }));
  }
}
