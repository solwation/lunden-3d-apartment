// Visitor statistics (cats found and petted, doors, steps …), kept in localStorage so they
// survive a reload, shown in a small translucent panel (T / the 📊 button toggles it).
const KEY = 'lunden.stats';
const SHOW_KEY = 'lunden.statsShown';

const fresh = () => ({ cats: 0, rare: 0, byVariant: {}, petted: 0, doors: 0, lids: 0, taps: 0, fridge: 0, lights: 0, steps: 0, metres: 0, stairs: 0, seconds: 0, visited: {} });

function load() {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return fresh();
  }
}

export const stats = load();
let dirty = false;

export function bump(key, n = 1) {
  stats[key] += n;
  dirty = true;
}

export function catFound(variantName, rare = false) {
  stats.cats += 1;
  if (rare) stats.rare += 1;
  stats.byVariant[variantName] = (stats.byVariant[variantName] ?? 0) + 1;
  dirty = true;
}

let roomTotal = 0;
export const setRoomTotal = (n) => { roomTotal = n; };

/** The visitor is in `key` (e.g. "1:Sovrum 2"); counts each room once. */
export function visitRoom(key) {
  if (stats.visited[key]) return;
  stats.visited[key] = true;
  dirty = true;
}

export function resetStats() {
  Object.assign(stats, fresh());
  dirty = true;
  save();
}

function save() {
  if (!dirty) return;
  dirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch { /* private mode etc. */ }
}
setInterval(save, 2000);
addEventListener('pagehide', save);

export function statsShown() {
  try { return localStorage.getItem(SHOW_KEY) !== '0'; } catch { return true; }
}
export function setStatsShown(show) {
  try { localStorage.setItem(SHOW_KEY, show ? '1' : '0'); } catch { /* ignore */ }
}

const fmtTime = (s) => {
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** Rows of [label, value] for the panel. */
export function statRows() {
  const kinds = Object.entries(stats.byVariant).sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} ${n}`).join(', ');
  return [
    ['🐈 Katter hittade', `${stats.cats}`, kinds],
    ['✨ Ovanliga katter', `${stats.rare}`],
    ['✋ Klappade katter', `${stats.petted}`],
    ['🚪 Dörrar öppnade', `${stats.doors}`],
    ['🚽 Toalettlock', `${stats.lids}`],
    ['💧 Kranar påslagna', `${stats.taps}`],
    ['🍗 Kylskåpet öppnat', `${stats.fridge}`],
    ['💡 Lampor tända', `${stats.lights}`],
    ['👣 Steg', `${stats.steps}`, `${Math.round(stats.metres)} m`],
    ['🪜 Trappturer', `${stats.stairs}`],
    ['🏠 Rum besökta', `${Object.keys(stats.visited).length}${roomTotal ? ` av ${roomTotal}` : ''}`],
    ['⏱ Tid i lägenheten', fmtTime(stats.seconds)],
  ];
}

/** Render into `el` (cheap enough to call a few times a second). */
export function renderStats(el) {
  const html = statRows().map(([label, value, sub]) =>
    `<div><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('');
  if (el.innerHTML !== html) el.innerHTML = html;
}
