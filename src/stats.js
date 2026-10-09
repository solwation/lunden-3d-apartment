// Visitor statistics (cats found and petted, doors, steps …), kept in localStorage so they
// survive a reload. The panel is hidden (Tab held / T / the 📊 button shows it); instead a
// small badge ("✋ Klappat katt +1") pops up for each counted event.
import { SECRET, SCORE } from './config.js';
const KEY = 'lunden.stats';

const fresh = () => ({ cats: 0, rare: 0, byVariant: {}, petted: 0, doors: 0, lids: 0, flushes: 0, taps: 0, fridge: 0, appliances: 0, cabinets: 0, beer: 0, coffee: 0, fish: 0, turbo: 0, shots: 0, fried: 0, burnt: 0, catFish: 0, chicken: 0, wine: 0, champagne: 0, whisky: 0, milk: 0, kask: 0, posted: 0, thrown: 0, lights: 0, sat: 0, lay: 0, steps: 0, metres: 0, stairs: 0, seconds: 0, visited: {}, secrets: 0, secretKinds: {}, catPhotos: 0, grill: 0, hood: 0, songs: 0, carMusic: 0, read: 0, car: 0, magic: 0, target: 0, baskets: 0, threes: 0,
  byBreed: {}, seen: {}, secretRare: {}, tv: 0, pc: 0, parasol: 0, clock: 0, calendar: 0, cooked: 0, brews: 0, drawn: 0, splashes: 0, cuts: 0, dribbles: 0, catButts: 0, shattered: 0, shatterRange: 0, pingpingHugs: 0, blinds: 0, curtains: 0, airfried: 0, clips: 0, penalties: {}, penaltyPoints: 0, kittens: 0, kittenPets: 0, vacuumed: 0, tasks: 0 });

function load() {
  try {
    const old = JSON.parse(localStorage.getItem(KEY) ?? '{}'), s = { ...fresh(), ...old };
    // statistics from before the balanced score: cats without a breed count as huskatt / perser, and every kind of
    // thing done before counts as one distinct thing
    if (!old.byBreed && s.cats) s.byBreed = { huskatt: s.cats - s.rare, ...(s.rare ? { perser: s.rare } : {}) };
    if (!old.seen) for (const k of Object.keys(SCORE.first)) if (typeof s[k] === 'number' && s[k] > 0) s.seen[k] = { tidigare: 1 };
    return s;
  } catch {
    return fresh();
  }
}

export const stats = load();
let dirty = false;

// Badge text per counter; counters missing here (metres, seconds) never get a badge
const BADGES = {
  petted: '✋ Klappat katt', doors: '🚪 Dörr öppnad', lids: '🚽 Toalettlock', flushes: '🌊 Spolat', toiletPaper: '🧻 Toapapper slängt', handwash: '🧼 Tvättat händerna', handdry: '🧺 Torkat händerna', taps: '💧 Kran påslagen',
  fridge: '🍗 Kylskåpet öppnat', appliances: '🍳 Ugn/mikro öppnad', cabinets: '🗄 Skåp öppnat', beer: '🍺 Klunk öl', coffee: '☕ Klunk kaffe', turbo: '⚡ Kaffeturbo!', fish: '🐟 Fiskpinne uppäten', fruit: '🍎 Frukt uppäten', fried: '🍳 Fiskpinne stekt', airfried: '🍟 Airfryern klar', toaster: '🍞 Brödrosten rostar', fries: '🍟 Pommes uppäten', sandwiches: '🥪 Du gjorde en macka!', friesCooked: '🍟 Pommes frites klara', friesBurnt: '🔥 Pommes brända', burnt: '🔥 Fiskpinne bränd', catFish: '🐈 Katten åt en fiskpinne', catButts: '🍑 Kattens rumpa', chicken: '🍗 Kycklingbit uppäten', wine: '🍷 Klunk vin', champagne: '🥂 Klunk champagne', whisky: '🥃 Klunk whisky', milk: '🥛 Klunk mjölk', kask: '☕ Klunk kaffekask', lights: '💡 Lampa tänd', stairs: '🪜 Trapptur',
  greets: '👋 Hälsat', olof: '👋 Vinkat till Olof', sat: '🪑 Satt ner', lay: '🛏 Lagt sig', posted: '📌 Teckning uppsatt', thrown: '🗑 Teckning slängd',
  catPhotos: '📸 Kattfoto', cooked: '🍗 Kycklingen är klar', brews: '☕ Kaffet är klart', tv: '📺 Tv på', pc: '🎮 Datorn på', parasol: '⛱ Parasollet', clock: '🕰 Väggklockan', calendar: '📅 Kattkalendern', grill: '🔥 Grillen tänd', hood: '🌀 Fläkten på', songs: '🎵 Musik på', carMusic: '🚗 Musik i bilen', read: '📖 Läste boken', pingpingHugs: '🐧 Kramat Pingping', mieleHugs: '💖 Kramat Miele', car: '🚗 Bilen kallad', magic: '✨ Trolleri', blinds: '🪟 Plisségardin', curtains: '🦓 Gardinerna', clips: '📱 Nytt klipp', nest: '🔊 Smart högtalare', roofs: '🏠 Uppe på taket', liftFloors: '🛗 Hissen', flights: '🚀 Jetpacken lyfter',
  kittens: '🐾 Kattunge!', washed: '🧽 Diskat', dishwasher: '🍽 Disken är klar', rubbishOut: '🗑 Soporna utburna', tasks: '📋 Uppdrag utfört!',
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

// --- the score in the HUD (#197): totalScore() top left (#score), a "+N" popping up when it grows ---
let scoreEl = null, plusEl = null, plusTimer = 0, plusSum = 0, lastScore = null;
/** Where the score goes: a container in the HUD. */
export function setScoreElement(el) {
  scoreEl = el;
  el.innerHTML = '<span class="score-main"><span class="label">Poäng</span> <b class="score-val"></b><span class="plus"></span></span><span id="presence" aria-label="Besökare online"></span>';
  plusEl = el.querySelector('.plus');
  renderScore();
}
/** Show the current total; if it grew since last time, pop up the difference (summed while it shows). */
export function renderScore() {
  if (!scoreEl) return;
  const t = totalScore();
  const valEl = scoreEl.querySelector('.score-val') || scoreEl.querySelector('b');
  if (valEl) valEl.textContent = t.toLocaleString('sv-SE');
  if (lastScore !== null && t > lastScore) {
    plusSum = (plusTimer ? plusSum : 0) + (t - lastScore);
    plusEl.textContent = `+${plusSum}`;
    plusEl.classList.remove('pop'); void plusEl.offsetWidth; plusEl.classList.add('pop');
    clearTimeout(plusTimer);
    plusEl.classList.remove('minus');
    plusTimer = setTimeout(() => { plusTimer = 0; plusEl.textContent = ''; plusEl.classList.remove('pop'); }, 1800);
  }
  lastScore = t;
}

/** A deduction pops up red next to the score: "−N" and why (#288). */
function showMinus(pts, reason) {
  if (!plusEl) return;
  clearTimeout(plusTimer);
  plusTimer = 0; plusSum = 0;
  plusEl.textContent = `−${pts} ${reason}`;
  plusEl.classList.add('minus');
  plusEl.classList.remove('pop'); void plusEl.offsetWidth; plusEl.classList.add('pop');
  plusTimer = setTimeout(() => { plusTimer = 0; plusEl.textContent = ''; plusEl.classList.remove('pop', 'minus'); }, 2600);
}

/** The visitor's score (#198): SCORE in config — points per event, per distinct thing the first time and less every
 * time after, cats by breed, the secret drawer by kind. */
export function totalScore() { return Math.floor(Math.max(0, rawScore() - (stats.penaltyPoints ?? 0)) + 1e-9); }
/** The score before rounding down (the small points for repeats are fractions). */
export function rawScore() {
  const S = SCORE, n = (o) => Object.keys(o ?? {}).length;
  let t = 0;
  for (const [k, pts] of Object.entries(S.each)) t += (stats[k] ?? 0) * pts;
  for (const [k, pts] of Object.entries(S.first)) {
    const things = n(k === 'visited' ? stats.visited : k === 'coats' ? stats.byVariant : stats.seen[k]);
    const times = typeof stats[k] === 'number' ? stats[k] : things; // (rooms and coats are only counted as things)
    t += things * pts + Math.max(0, times - things) * (S.again[k] ?? 0);
  }
  for (const [b, pts] of Object.entries(S.breeds)) t += (stats.byBreed[b] ?? 0) * pts;
  t += n(stats.secretKinds) * S.secrets.kinds + n(stats.secretRare) * S.secrets.rare;
  return t;
}

/** Count `n` of `key`; `id` names the thing (a door, a lamp …) for the bigger points the first time (SCORE.first).
 * The badge for those only shows the first time. */
export function bump(key, n = 1, id = key) {
  stats[key] = (stats[key] ?? 0) + n;
  let fresh = true;
  if (SCORE.first[key] !== undefined) {
    const seen = (stats.seen[key] ??= {});
    fresh = !seen[id];
    seen[id] = 1;
  }
  dirty = true;
  renderScore();
  if (BADGES[key] && fresh) badge(BADGES[key]);
  if (key === 'steps' && stats.steps % STEP_BADGE === 0) badge(`👣 ${stats.steps} steg`, false);
}

// what the deductions are called (#288): the red "−N" next to the score, and the stats panel
const PENALTY_TEXT = { fridgeOpen: 'Kylen stod öppen', freezerOpen: 'Frysen stod öppen', fridgeLonger: 'Kylen står fortfarande öppen',
  freezerLonger: 'Frysen står fortfarande öppen', burnt: 'Bränt!', smokeAlarm: 'Brandlarmet!', spill: 'Spill',
  catShot: 'Stackars katten!', kittenShot: 'Stackars kattungen!', fall: 'Du slog dig' };
const PENALTY_ROWS = [['Kyl/frys öppen', ['fridgeOpen', 'freezerOpen', 'fridgeLonger', 'freezerLonger']], ['bränt', ['burnt']],
  ['brandlarm', ['smokeAlarm']], ['spill', ['spill']], ['katten', ['catShot', 'kittenShot']], ['fall', ['fall']]];

/** A deduction (#288, SCORE.penalties): `key` (+ `sub`, the weapon for catShot); the freezer's keys use the fridge's
 * points. Counted in stats.penalties; takes at most what the score has, so it never goes below 0 (and leaves no debt). */
export function penalize(key, sub = null) {
  const P = SCORE.penalties, base = key.replace('freezer', 'fridge');
  const pts = (sub ? P[base]?.[sub] : P[base]) ?? 0;
  const id = sub ? `${key}:${sub}` : key;
  stats.penalties[id] = (stats.penalties[id] ?? 0) + 1;
  const take = Math.min(pts, Math.max(0, rawScore() - (stats.penaltyPoints ?? 0)));
  stats.penaltyPoints = (stats.penaltyPoints ?? 0) + take;
  dirty = true;
  renderScore();
  showMinus(Math.round(take), PENALTY_TEXT[key] ?? '');
  return take;
}

/** A surprise found in the secret drawer (#183): counted, and which kinds have been seen. */
export function secretFound(key, name, rare = false) {
  stats.secrets += 1;
  const isNew = !stats.secretKinds[key];
  stats.secretKinds[key] = (stats.secretKinds[key] ?? 0) + 1;
  if (rare) stats.secretRare[key] = 1;
  dirty = true;
  renderScore();
  badge(`${rare ? '✨' : '🤫'} Hemlighet: ${name}${isNew ? ' (ny!)' : ''}`, false);
}

export function catFound(variantName, rare = false, breed = 'huskatt') {
  stats.cats += 1;
  if (rare) stats.rare += 1;
  stats.byBreed[breed] = (stats.byBreed[breed] ?? 0) + 1;
  stats.byVariant[variantName] = (stats.byVariant[variantName] ?? 0) + 1;
  dirty = true;
  renderScore();
  badge(rare ? '✨ Ovanlig katt hittad' : '🐈 Katt hittad');
}

let roomTotal = 0;
export const setRoomTotal = (n) => { roomTotal = n; };

/** The visitor is in `key` (e.g. "1:Sovrum 2"); counts each room once. */
export function visitRoom(key) {
  if (stats.visited[key]) return;
  stats.visited[key] = true;
  dirty = true;
  renderScore();
  badge(`🏠 Nytt rum: ${key.split(':').slice(1).join(':')}`, false);
}

export function resetStats() {
  Object.assign(stats, fresh());
  dirty = true;
  lastScore = null;
  renderScore();
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
    ['🧬 Kattraser', `${Object.keys(stats.byBreed).length} av ${Object.keys(SCORE.breeds).length}`, Object.entries(stats.byBreed).map(([b, k]) => `${b} ${k}`).join(', ')],
    ['✋ Klappade katter', `${stats.petted}`],
    ['🍑 Kattrumpor sedda', `${stats.catButts}`],
    ...(stats.kittens ? [['🐾 Kattungar hittade', `${stats.kittens}`, stats.kittenPets ? `${stats.kittenPets} klappade` : '']] : []), // (#363)
    ...(stats.miele ? [['💖 Miele hittad', `${stats.miele}`, stats.mieleHugs ? `${stats.mieleHugs} kramar` : '']] : []), // (no spoiler before, #328)
    ['🤫 Hemligheter hittade', `${stats.secrets}`, `${Object.keys(stats.secretKinds).length} av ${SECRET.items.length} olika`],
    ['🚪 Dörrar öppnade', `${stats.doors}`],
    ['🚽 Toalettlock', `${stats.lids}`],
    ['🪟 Gardiner dragna', `${(stats.blinds ?? 0) + (stats.curtains ?? 0)}`],
    ['🌊 Spolningar', `${stats.flushes}`],
    ...(stats.toiletPaper ? [['🧻 Toapapper slängt', `${stats.toiletPaper}`]] : []), // (#426)
    ...(stats.handwash ? [['🧼 Tvättat händerna', `${stats.handwash}`]] : []), // (#437)
    ['👋 Hälsat', `${stats.greets ?? 0}`],
    ['🌦 Ute i vädret', `${['walkRain', 'walkSnow', 'walkHail', 'walkStorm'].reduce((n, k) => n + (stats[k] ?? 0), 0)}`,
      [['regn', 'walkRain'], ['snö', 'walkSnow'], ['hagel', 'walkHail'], ['åska', 'walkStorm']].filter(([, k]) => stats[k]).map(([t, k]) => `${t} ${stats[k]}`).join(', ')],
    ['🏠 Tak besökta', `${Object.keys(stats.seen.roofs ?? {}).length}`], // (#360)
    ['🚀 Jetpackturer', `${stats.flights ?? 0}`], // take-offs (#359)
    ['🪑 Satt ner', `${stats.sat}`],
    ['🛏 Lagt sig', `${stats.lay}`],
    ['💧 Kranar påslagna', `${stats.taps}`],
    ['🍗 Kylskåpet öppnat', `${stats.fridge}`],
    ['🍳 Ugn/mikro öppnad', `${stats.appliances}`],
    ['🐟 Fiskpinnar uppätna', `${stats.fish}`],
    ['🍎 Frukt uppäten', `${stats.fruit ?? 0}`],
    ['⚡ Kaffeturbo', `${stats.turbo}`],
    ['🍳 Fiskpinnar stekta', `${stats.fried}`, stats.burnt ? `${stats.burnt} brända` : ''],
    ['🍟 Omgångar i airfryern', `${stats.airfried ?? 0}`],
    ['🍞 Rostningar i brödrosten', `${stats.toaster ?? 0}`],
    ['🍟 Pommes frites uppätna', `${stats.fries ?? 0}`, stats.friesBurnt ? `${stats.friesBurnt} brända omgångar` : ''],
    ['🥪 Mackor', `${stats.sandwiches ?? 0}`, stats.cucumberSlices ? `${stats.cucumberSlices} gurkskivor` : ''],
    ...(stats.tasks ? [['📋 Vardagsuppdrag klara', `${stats.tasks}`]] : []), // (#392)
    ['🧽 Diskat för hand', `${stats.washed ?? 0}`, stats.dishwasher ? `${stats.dishwasher} omgångar i diskmaskinen` : ''], // (#383, #385)
    ...(stats.rubbishOut ? [['🗑 Soppåsar utburna', `${stats.rubbishOut}`]] : []), // (#387)
    ...(stats.vacuumed ? [['🧹 Dammsugit', `${stats.vacuumed.toFixed(1)} m²`]] : []), // (#390)
    ['🐈 Fiskpinnar katten ätit', `${stats.catFish}`],
    ['🍗 Kycklingbitar uppätna', `${stats.chicken}`],
    ['💡 Lampor tända', `${stats.lights}`],
    ['📌 Teckningar uppsatta', `${stats.posted}`],
    ['🗑 Teckningar slängda', `${stats.thrown}`],
    ['📸 Kattfoton', `${stats.catPhotos}`],
    ['🔥 Grillen tänd', `${stats.grill}`],
    ['🌀 Köksfläkten på', `${stats.hood}`],
    ['🎵 Musik spelad', `${stats.songs}`],
    ['🚗 Låtar i bilen', `${stats.carMusic ?? 0}`],
    ['📖 Boken läst', `${stats.read}`],
    ['🐧 Kramar till Pingping', `${stats.pingpingHugs ?? 0}`],
    ['🚗 Bilen kallad', `${stats.car}`],
    ['✨ Trollstavsträffar', `${stats.magic}`],
    ['🎯 Måltavlepoäng', `${stats.target}`],
    ['🏀 Korgar', `${stats.baskets}`, stats.threes ? `${stats.threes} trepoängare` : ''],
    ['🏀 Studsar', `${stats.dribbles}`],
    ['💥 Nerf-pilar som träffat', `${stats.splashes}`],
    ['⚔️ Lightsaber-hugg', `${stats.cuts}`],
    ['💥 Saker sönderskjutna', `${stats.shattered ?? 0}`, stats.shatterRange ? `${stats.shatterRange} avståndspoäng` : ''],
    ['🍗 Hela kycklingar stekta', `${stats.cooked}`],
    ['☕ Kannor kaffe bryggda', `${stats.brews}`],
    ['🖍 Teckningar ritade', `${stats.drawn}`],
    ['📺 Tv / dator på', `${stats.tv + stats.pc}`],
    ['📱 Klipp sedda på laptopen', `${stats.clips ?? 0}`],
    ['🔊 Frågat de smarta högtalarna', `${stats.nest ?? 0}`],
    ['👣 Steg', `${stats.steps}`, `${Math.round(stats.metres)} m`],
    ['🪜 Trappturer', `${stats.stairs}`],
    ['🤕 Fall', `${stats.falls ?? 0}`],
    ['🏠 Rum besökta', `${Object.keys(stats.visited).length}${roomTotal ? ` av ${roomTotal}` : ''}`],
    ['⏱ Tid i lägenheten', fmtTime(stats.seconds)],
    ['😬 Avdrag', `−${Math.round(stats.penaltyPoints ?? 0)}`, PENALTY_ROWS.map(([t, keys]) => [t, Object.entries(stats.penalties ?? {})
      .filter(([k]) => keys.includes(k.split(':')[0])).reduce((n, [, v]) => n + v, 0)]).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(', ')],
  ];
}

/** Render into `el` (cheap enough to call a few times a second). */
let extra = () => '';
/** More HTML under the rows (the leaderboard, #198). */
export const setStatsExtra = (fn) => { extra = fn; };

export function renderStats(el) {
  const html = statRows().map(([label, value, sub]) =>
    `<div class="stat-row"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('') + extra();
  if (el.innerHTML !== html) el.innerHTML = html;
}
