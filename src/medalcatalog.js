// The medals (achievements) with levels (#1711, part of #1709). One source for the page (src/medals.js: the menu grid, the
// spinning medal, the bonus) and the Worker (cloudflare/boards.js derives each player's levels from the counters it has
// already validated, so a client cannot invent a level). The counters are src/stats.js's own (stats[counter]); a task
// medal counts one task (stats.taskCounts[id], counter key `task_<id>`). Add a medal = add a row (and its counter to
// src/boardcatalog.js COUNTERS if it is not there: that is what the Worker accepts and rate-limits).
//
// Levels: level L is reached at L × base of the counter (100, 200, 300 … for base 100), so there is always a next one
// (Untappd style). `base` values are *guess*. A secret medal is shown as "???" until its first level is unlocked.
export const MAX_LEVEL = 50;
/** Bonus points for reaching `level` (via the ordinary score, stats.medalPoints): 10 × level (*guess*). Paid once per level and device. */
export const bonusFor = (level) => 10 * level;
export const TASK_PREFIX = 'task_';

export const MEDALS = [
  { id: 'squirrels', counter: 'squirrelFeeds', icon: '🐿️', name: 'Ekorrvän', unit: 'ekorrar matade', base: 50 },
  { id: 'cats', counter: 'petted', icon: '🐈', name: 'Kattklappare', unit: 'katter klappade', base: 100 },
  { id: 'butts', counter: 'catButts', icon: '🍑', name: 'Rumpspanare', unit: 'kattrumpor sedda', base: 25 },
  { id: 'ponies', counter: 'ponyPets', icon: '🐴', name: 'Ponyvän', unit: 'hästar klappade', base: 100 },
  { id: 'flushes', counter: 'flushes', icon: '🚽', name: 'Spolmästare', unit: 'spolningar', base: 50 },
  { id: 'doors', counter: 'doors', icon: '🚪', name: 'Dörrvakt', unit: 'dörrar öppnade', base: 500 },
  { id: 'taps', counter: 'taps', icon: '💧', name: 'Kranvän', unit: 'kranar påslagna', base: 200 },
  { id: 'sat', counter: 'sat', icon: '💺', name: 'Soffpotatis', unit: 'gånger satt ner', base: 100 },
  { id: 'washed', counter: 'washed', icon: '🧼', name: 'Diskhjälte', unit: 'saker diskade', base: 25 },
  { id: 'sandwiches', counter: 'sandwiches', icon: '🥪', name: 'Mackmästare', unit: 'mackor', base: 25 },
  { id: 'hotdogs', counter: 'hotdogs', icon: '🌭', name: 'Korvkung', unit: 'korvar med bröd', base: 25 },
  { id: 'vacuumed', counter: 'vacuumed', icon: '🧹', name: 'Dammsugarkung', unit: 'm² dammsugna', base: 500 },
  { id: 'steps', counter: 'steps', icon: '👣', name: 'Vandrare', unit: 'steg', base: 20000 },
  { id: 'stairs', counter: 'stairs', icon: '🔼', name: 'Trappspringare', unit: 'trappturer', base: 100 },
  { id: 'jetpack', counter: 'flights', icon: '🚀', name: 'Jetpackpilot', unit: 'flygningar', base: 25 },
  { id: 'dribbles', counter: 'dribbles', icon: '🏀', name: 'Basketstudsare', unit: 'studsar', base: 500 },
  { id: 'tasks', counter: 'tasks', icon: '📋', name: 'Städhjälte', unit: 'vardagsuppdrag klara', base: 20 },
  // one medal per everyday task (stats.taskCounts)
  { id: 't-makeSandwich', counter: `${TASK_PREFIX}makeSandwich`, icon: '🥪', name: 'Macksnickare', unit: 'gånger "Gör en macka"', base: 10 },
  { id: 't-resetKitchen', counter: `${TASK_PREFIX}resetKitchen`, icon: '🍽️', name: 'Köksfixare', unit: 'gånger köket återställt', base: 10 },
  { id: 't-snackClean', counter: `${TASK_PREFIX}snackClean`, icon: '🧽', name: 'Smulplockare', unit: 'gånger städat efter mellanmålet', base: 10 },
  { id: 't-tidyHall', counter: `${TASK_PREFIX}tidyHall`, icon: '🧥', name: 'Hallvärd', unit: 'gånger hallen städad', base: 10 },
  { id: 't-grillChicken', counter: `${TASK_PREFIX}grillChicken`, icon: '🍗', name: 'Grillmästare', unit: 'gånger kycklingen grillad', base: 10 },
  { id: 't-washDish', counter: `${TASK_PREFIX}washDish`, icon: '🫧', name: 'Diskmästare', unit: 'gånger diskat efter sig', base: 10 },
  { id: 't-makeBed', counter: `${TASK_PREFIX}makeBed`, icon: '🛏️', name: 'Sängbäddare', unit: 'gånger sängen bäddad', base: 10 },
  // secrets: "???" until the first level
  { id: 'falls', counter: 'falls', icon: '🩹', name: 'Klumpeduns', unit: 'fall', base: 10, secret: true },
  { id: 'burnt', counter: 'burnt', icon: '🔥', name: 'Brandchef', unit: 'brända fiskpinnar', base: 10, secret: true },
  { id: 'hugs', counter: 'pingpingHugs', icon: '🫂', name: 'Pingpings bästis', unit: 'kramar', base: 10, secret: true },
];

/** One counter's value from the stats (task counters read stats.taskCounts); a whole number, 0 when missing. */
export function counterValue(stats, counter) {
  const raw = counter.startsWith(TASK_PREFIX) ? stats?.taskCounts?.[counter.slice(TASK_PREFIX.length)] : stats?.[counter];
  const v = Math.floor(Number(raw));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** The level a counter value gives this medal (0 = none yet). */
export const levelOf = (medal, value) => Math.min(MAX_LEVEL, Math.floor(Math.max(0, Number(value) || 0) / medal.base));
/** The counter value where `level` is reached. */
export const thresholdOf = (medal, level) => medal.base * level;

/** Every medal's level from a counter bag ({ counter: n }, as the Worker stores it): { medalId: level } for levels above 0. */
export function levelsFrom(counters) {
  const out = {};
  for (const m of MEDALS) { const l = levelOf(m, counters?.[m.counter]); if (l > 0) out[m.id] = l; }
  return out;
}

/** The same from the player's own stats. */
export function levelsOfStats(stats) {
  const out = {};
  for (const m of MEDALS) { const l = levelOf(m, counterValue(stats, m.counter)); if (l > 0) out[m.id] = l; }
  return out;
}
