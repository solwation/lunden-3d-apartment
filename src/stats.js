// Visitor statistics (cats found and petted, doors, steps …), kept in localStorage so they
// survive a reload. The panel is hidden (Tab held / T / the 📊 button shows it); instead a
// small badge ("✋ Klappat katt +1") pops up for each counted event.
import { SECRET } from './config.js';
const KEY = 'lunden.stats';

const fresh = () => ({ cats: 0, rare: 0, byVariant: {}, petted: 0, doors: 0, lids: 0, flushes: 0, taps: 0, fridge: 0, appliances: 0, cabinets: 0, beer: 0, coffee: 0, fish: 0, fried: 0, burnt: 0, catFish: 0, chicken: 0, wine: 0, champagne: 0, whisky: 0, milk: 0, kask: 0, posted: 0, thrown: 0, lights: 0, sat: 0, lay: 0, steps: 0, metres: 0, stairs: 0, seconds: 0, visited: {}, secrets: 0, secretKinds: {} });

function load() {
  try {
    return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return fresh();
  }
}

export const stats = load();
let dirty = false;

// Badge text per counter; counters missing here (metres, seconds) never get a badge
const BADGES = {
  petted: '✋ Klappat katt', doors: '🚪 Dörr öppnad', lids: '🚽 Toalettlock', flushes: '🌊 Spolat', taps: '💧 Kran påslagen',
  fridge: '🍗 Kylskåpet öppnat', appliances: '🍳 Ugn/mikro öppnad', cabinets: '🗄 Skåp öppnat', beer: '🍺 Klunk öl', coffee: '☕ Klunk kaffe', fish: '🐟 Fiskpinne uppäten', fried: '🍳 Fiskpinne stekt', burnt: '🔥 Fiskpinne bränd', catFish: '🐈 Katten åt en fiskpinne', chicken: '🍗 Kycklingbit uppäten', wine: '🍷 Klunk vin', champagne: '🥂 Klunk champagne', whisky: '🥃 Klunk whisky', milk: '🥛 Klunk mjölk', kask: '☕ Klunk kaffekask', lights: '💡 Lampa tänd', stairs: '🪜 Trapptur',
  sat: '🪑 Satt ner', lay: '🛏 Lagt sig', posted: '📌 Teckning uppsatt', thrown: '🗑 Teckning slängd',
};
const STEP_BADGE = 100; // a badge every 100 steps

let badgeEl = null;
/** Where the badges go (an empty container in the HUD). */
export const setBadgeElement = (el) => { badgeEl = el; };

/** Pop up a badge; the same text again while it is still shown adds to its count. */
export function badge(text, count = true) {
  if (!badgeEl) return;
  let b = [...badgeEl.children].find((c) => c.dataset.text === text);
  if (b) {
    b.dataset.n = Number(b.dataset.n) + 1;
    clearTimeout(b.timer);
    b.classList.remove('bump');
    void b.offsetWidth; // restart the pop animation
  } else {
    b = document.createElement('div');
    b.dataset.text = text;
    b.dataset.n = 1;
    badgeEl.append(b);
    while (badgeEl.children.length > 4) badgeEl.firstChild.remove();
  }
  b.textContent = count ? `${text} +${b.dataset.n}` : text;
  b.classList.add('bump');
  b.timer = setTimeout(() => b.remove(), 2600);
}

export function bump(key, n = 1) {
  stats[key] += n;
  dirty = true;
  if (BADGES[key]) badge(BADGES[key]);
  if (key === 'steps' && stats.steps % STEP_BADGE === 0) badge(`👣 ${stats.steps} steg`, false);
}

/** A surprise found in the secret drawer (#183): counted, and which kinds have been seen. */
export function secretFound(key, name, rare = false) {
  stats.secrets += 1;
  const isNew = !stats.secretKinds[key];
  stats.secretKinds[key] = (stats.secretKinds[key] ?? 0) + 1;
  dirty = true;
  badge(`${rare ? '✨' : '🤫'} Hemlighet: ${name}${isNew ? ' (ny!)' : ''}`, false);
}

export function catFound(variantName, rare = false) {
  stats.cats += 1;
  if (rare) stats.rare += 1;
  stats.byVariant[variantName] = (stats.byVariant[variantName] ?? 0) + 1;
  dirty = true;
  badge(rare ? '✨ Ovanlig katt hittad' : '🐈 Katt hittad');
}

let roomTotal = 0;
export const setRoomTotal = (n) => { roomTotal = n; };

/** The visitor is in `key` (e.g. "1:Sovrum 2"); counts each room once. */
export function visitRoom(key) {
  if (stats.visited[key]) return;
  stats.visited[key] = true;
  dirty = true;
  badge(`🏠 Nytt rum: ${key.split(':').slice(1).join(':')}`, false);
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
    ['🤫 Hemligheter hittade', `${stats.secrets}`, `${Object.keys(stats.secretKinds).length} av ${SECRET.items.length} olika`],
    ['🚪 Dörrar öppnade', `${stats.doors}`],
    ['🚽 Toalettlock', `${stats.lids}`],
    ['🌊 Spolningar', `${stats.flushes}`],
    ['🪑 Satt ner', `${stats.sat}`],
    ['🛏 Lagt sig', `${stats.lay}`],
    ['💧 Kranar påslagna', `${stats.taps}`],
    ['🍗 Kylskåpet öppnat', `${stats.fridge}`],
    ['🍳 Ugn/mikro öppnad', `${stats.appliances}`],
    ['🐟 Fiskpinnar uppätna', `${stats.fish}`],
    ['🍳 Fiskpinnar stekta', `${stats.fried}`, stats.burnt ? `${stats.burnt} brända` : ''],
    ['🐈 Fiskpinnar katten ätit', `${stats.catFish}`],
    ['🍗 Kycklingbitar uppätna', `${stats.chicken}`],
    ['💡 Lampor tända', `${stats.lights}`],
    ['📌 Teckningar uppsatta', `${stats.posted}`],
    ['🗑 Teckningar slängda', `${stats.thrown}`],
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
