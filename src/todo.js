import * as THREE from 'three';
import { TODO_NOTES } from './config.js';

// The TODO post-its on the fridge door (#340): the repo's open GitHub issues as small sticky notes. No live sync:
// tools/stamp.sh (tools/todo.py) writes data/todo.json from the issues when the site is published, outside the
// content hash (#304), so a changed list never makes open pages reload. Locally there is no such file and the
// committed data/todo.sample.json is used. Each item: { n, text, title, kind: 'bugg' | 'nytt', inProgress, prio };
// `text` is the issue's "Lapp: …" line, else the title cleaned up here (cleanTitle). `prio` is 'high' | 'medium' |
// 'low' from the priority label, a missing one = low (#431, the post-its only). The notes are only a teaser on the
// door: no E target, no list to read (#431).

const PRIO = { high: 0, medium: 1, low: 2 };
/** high → medium → low (missing = low), oldest (lowest number) first within a level (#431). */
export const byPriority = (a, b) => (PRIO[a.prio] ?? 2) - (PRIO[b.prio] ?? 2) || a.n - b.n;

export async function loadTodo() {
  for (const url of ['data/todo.json', 'data/todo.sample.json']) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const list = await r.json();
      if (!Array.isArray(list)) continue;
      return list.map((t) => ({ ...t, prio: t.prio in PRIO ? t.prio : 'low', text: t.text || cleanTitle(t.title ?? ''), kind: t.kind ?? (/^bugg/i.test(t.title ?? '') ? 'bugg' : 'nytt') }))
        .sort(byPriority);
    } catch { /* try the next one; the page works without notes */ }
  }
  return [];
}

/** An issue title → a short everyday phrase: no "Bugg:", no "Rum:" prefix, no parentheses or #refs, cut at the
 *  first "," / "–", capitalised, at most ~TODO_NOTES.maxChars characters. */
export function cleanTitle(title) {
  let s = String(title).replace(/\([^)]*\)/g, ' ').replace(/#\d+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^bugg\s*[:–-]\s*/i, '');
  const m = s.match(/^([^:]{1,28}):\s*(.+)$/); // "Sovrum 1: …", "Köket: …"
  if (m) s = m[2];
  s = s.split(/,|–|\(| - /)[0].replace(/["”“]/g, '').replace(/[\s:;.\-–/]+$/, '').trim();
  const max = TODO_NOTES.maxChars;
  if (s.length > max) {
    const cut = s.slice(0, max + 1);
    s = `${(cut.lastIndexOf(' ') > max * 0.5 ? cut.slice(0, cut.lastIndexOf(' ')) : s.slice(0, max)).replace(/[\s,.:;–-]+$/, '')}…`;
  }
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive";
const INK = '#1d2633';
const INK_SOFT = '#4c5866'; // the "pågår" tick (#431)
const COLORS = ['#fff17a', '#ffa8cf', '#b9f0a2', '#a6dcff']; // yellow, pink, green, blue

// a small seeded random so every issue keeps its own tilt / colour
const rnd = (seed) => () => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 10000) / 10000; };

function wrap(g, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxW && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function ladybug(g, x, y, r) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#d8312e';
  g.beginPath(); g.ellipse(0, 0, r, r * 1.1, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK;
  g.beginPath(); g.arc(0, -r * 1.05, r * 0.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = INK; g.lineWidth = r * 0.14;
  g.beginPath(); g.moveTo(0, -r * 0.9); g.lineTo(0, r * 1.1); g.stroke();
  for (const [dx, dy] of [[-0.5, -0.2], [0.5, -0.2], [-0.45, 0.45], [0.45, 0.45]]) { g.beginPath(); g.arc(dx * r, dy * r, r * 0.17, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

function star(g, x, y, r) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = '#f2b51c'; g.fill();
  g.strokeStyle = INK; g.lineWidth = r * 0.12; g.lineJoin = 'round'; g.stroke();
  g.restore();
}

/** One post-it at (cx, cy), side s px: paper with a soft shadow and a curl at the bottom, marker text, a doodle. */
function postIt(g, cx, cy, s, item, rand) {
  g.save();
  g.translate(cx, cy);
  g.rotate((rand() * 2 - 1) * TODO_NOTES.tilt * Math.PI / 180);
  const h = s / 2, curl = s * 0.035;
  const shape = () => { // the bottom edge lifts a little at the corners (a curl)
    g.beginPath();
    g.moveTo(-h, -h); g.lineTo(h, -h); g.lineTo(h, h - curl);
    g.quadraticCurveTo(0, h + curl, -h, h - curl);
    g.closePath();
  };
  g.shadowColor = 'rgba(0,0,0,0.38)'; g.shadowBlur = s * 0.06; g.shadowOffsetY = s * 0.035; g.shadowOffsetX = s * 0.01;
  g.fillStyle = item.color;
  shape(); g.fill();
  g.shadowColor = 'transparent';
  // the glue strip at the top is flat, the rest a little shaded towards the curled bottom
  const sh = g.createLinearGradient(0, -h, 0, h);
  sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.2, 'rgba(0,0,0,0)');
  sh.addColorStop(0.8, 'rgba(0,0,0,0.02)'); sh.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = sh; shape(); g.fill();
  // the text in dark marker, as big as fits in four lines
  g.fillStyle = INK;
  g.textBaseline = 'alphabetic';
  const pad = s * 0.1, maxW = s - 2 * pad, room = s * 0.63; // the text ends above the bottom row (pågår, the doodle)
  // the issue number, small, top right (#431); the text starts under it
  const num = item.n ? `#${item.n}` : '', numSize = s * 0.1, numH = num ? numSize * 1.15 : 0;
  if (num) {
    g.font = `bold ${Math.round(numSize)}px ${HAND}`;
    g.globalAlpha = 0.85;
    g.textAlign = 'right';
    g.fillText(num, h - pad * 0.7, -h + pad * 0.55 + numSize * 0.8);
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }
  let size = s * 0.2, lines;
  for (; size > s * 0.1; size *= 0.92) {
    g.font = `bold ${Math.round(size)}px ${HAND}`;
    lines = wrap(g, item.text, maxW);
    if (numH + size + (lines.length - 1) * size * 1.12 <= room && lines.every((l) => g.measureText(l).width <= maxW)) break;
  }
  const lh = size * 1.12, top = -h + pad * 0.9 + numH + size;
  lines.slice(0, 5).forEach((l, i) => {
    g.save();
    g.translate(-h + pad + (rand() - 0.5) * s * 0.02, top + i * lh);
    g.rotate((rand() - 0.5) * 0.04); // a slightly wobbly hand
    g.fillText(l, 0, 0);
    g.restore();
  });
  // bottom right: 🐞 for a bug, ★ for something new; bottom left: "pågår ✓" when someone works on it, in a muted
  // ink (#431: red on many notes made the door look angry)
  if (item.kind === 'bugg') ladybug(g, h - s * 0.13, h - s * 0.14, s * 0.065);
  else if (item.kind === 'nytt') star(g, h - s * 0.13, h - s * 0.14, s * 0.08);
  if (item.inProgress) {
    g.strokeStyle = INK_SOFT; g.fillStyle = INK_SOFT; g.lineWidth = s * 0.025; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-h + pad, h - s * 0.15); g.lineTo(-h + pad + s * 0.04, h - s * 0.1); g.lineTo(-h + pad + s * 0.11, h - s * 0.21); g.stroke();
    g.font = `bold ${Math.round(s * 0.1)}px ${HAND}`;
    g.fillText('pågår', -h + pad + s * 0.14, h - s * 0.1);
  }
  g.restore();
}

/**
 * The post-its for `items` (loadTodo, already sorted by priority), as ONE plane with one canvas texture, built in the
 * fridge door's own frame (child of `fridge.door`, so they swing with it). Not an E target (#431): the plane is left
 * out of raycasts. Returns { object, area, items }, `area` = the plane's size, which posters.js keeps free.
 */
export function buildTodoNotes(items, fridge) {
  const T = TODO_NOTES;
  if (!items.length || !fridge?.door) return null;
  const max = T.cols * T.rows;
  const shown = items.length > max ? items.slice(0, max - 1) : items.slice(0, max);
  const notes = shown.map((t, i) => ({ ...t, color: COLORS[i % COLORS.length] })); // 3 columns, 4 colours: neighbours never alike
  if (items.length > max) notes.push({ n: 0, text: `+ ${items.length - shown.length} till …`, color: COLORS[0], kind: null });
  const rows = Math.ceil(notes.length / T.cols), cols = Math.min(T.cols, notes.length);
  const W = cols * T.size + (cols - 1) * T.gap + 2 * T.margin, H = rows * T.size + (rows - 1) * T.gap + 2 * T.margin;
  const c = document.createElement('canvas');
  c.width = Math.round(W * T.ppm); c.height = Math.round(H * T.ppm);
  const g = c.getContext('2d');
  const s = T.size * T.ppm;
  notes.forEach((item, i) => {
    const r = Math.floor(i / T.cols), k = i % T.cols, rand = rnd(item.n * 7919 + 17);
    const x = (T.margin + k * (T.size + T.gap) + T.size / 2) * T.ppm + (rand() - 0.5) * T.gap * T.ppm;
    const y = (T.margin + r * (T.size + T.gap) + T.size / 2) * T.ppm + (rand() - 0.5) * T.gap * T.ppm;
    postIt(g, x, y, s, item, rand);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02, roughness: 0.9 }));
  mesh.receiveShadow = true;
  // on the door's front (it faces −z in the door's frame), the top-left note's corner at the top-left; the block
  // stands clear of the handle (at the door's free edge)
  const { w, dt } = fridge.size, sg = fridge.sign;
  mesh.rotation.y = Math.PI;
  mesh.position.set(sg * (T.fromHinge + W / 2), T.top - H / 2, -dt - 0.0015); // y from the door's foot (≈ the floor)
  if (Math.abs(mesh.position.x) + W / 2 > w - 0.1) mesh.position.x = sg * (w - 0.1 - W / 2); // never over the handle
  mesh.raycast = () => {}; // only a teaser: aiming at them is aiming at the fridge door (#431)
  fridge.door.add(mesh);
  return { name: 'att göra-lapparna', object: mesh, area: { w: W, h: H }, items };
}
