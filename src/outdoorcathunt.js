import { OUTDOOR_CATS } from './config.js';
// #1885: the award "Hitta alla utekatter". A round is complete when every named outdoor cat (OUTDOOR_CATS.cats) has been found
// once during it; the round then counts (stats.outdoorCatRounds, the counter of the `outdoorcats` medal in src/medalcatalog.js, one
// level per round, bonus OUTDOOR_CATS.hunt.bonus × level through the medal system, paid once per level and device) and the next
// round starts at 0. The names found in the current round are stats.outdoorCatsFound. X is the current cat list: a cat added later
// joins the round in progress (and every later one), while rounds already counted, and so the levels, stay. Pure: no DOM.

/** The names of the cats a round needs (the current list). */
export const huntNames = (cats = OUTDOOR_CATS.cats) => cats.map((c) => c.name);
const NAMES = huntNames();

/** Make sure the hunt's fields in `stats` have the right shape (an old save, odd data). Returns the found list. */
export function huntState(stats) {
  const r = Math.floor(Number(stats.outdoorCatRounds));
  stats.outdoorCatRounds = Number.isSafeInteger(r) && r > 0 ? r : 0;
  const f = Array.isArray(stats.outdoorCatsFound) ? stats.outdoorCatsFound : [];
  stats.outdoorCatsFound = [...new Set(f.filter((n) => typeof n === 'string' && n.length <= 40))].slice(0, 200);
  return stats.outdoorCatsFound;
}

/** How far the current round is: { found: [names of current cats found], count, total, round: rounds finished }. */
export function huntProgress(stats, names = NAMES) {
  const have = new Set(Array.isArray(stats?.outdoorCatsFound) ? stats.outdoorCatsFound : []);
  const found = names.filter((n) => have.has(n));
  return { found, count: found.length, total: names.length, round: Math.max(0, Math.floor(Number(stats?.outdoorCatRounds)) || 0) };
}

/**
 * The visitor found the cat `name`. Returns null when it is not a current outdoor cat or was already found this round; otherwise
 * { count, total, done } and, when that was the last one, done = true, `rounds` = rounds finished now and the found list is empty.
 */
export function findOutdoorCat(stats, name, names = NAMES) {
  if (!names.includes(name) || (Array.isArray(stats.outdoorCatsFound) && stats.outdoorCatsFound.includes(name))) return null;
  const found = huntState(stats);
  if (found.includes(name)) return null;
  found.push(name);
  const { count, total } = huntProgress(stats, names);
  if (count < total) return { count, total, done: false };
  stats.outdoorCatRounds += 1;
  stats.outdoorCatsFound = [];
  return { count, total, done: true, rounds: stats.outdoorCatRounds };
}

/** The badge for a find: "5 av 12 utekatter hittade", or the round's end ("… Nivå 2 börjar"; after the top level the next round). */
export function huntText(r, maxLevel) {
  if (!r) return '';
  if (!r.done) return `🐈 ${r.count} av ${r.total} utekatter hittade`;
  const next = r.rounds + 1;
  return `🎉 Alla ${r.total} utekatter hittade! ${next <= maxLevel ? `Nivå ${next}` : `Omgång ${next}`} börjar`;
}
