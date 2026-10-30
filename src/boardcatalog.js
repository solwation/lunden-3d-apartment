import { counterValue } from './medalcatalog.js';
// The catalogue of alternative top lists (#1710, part of #1709). One source for the page (the picker in the leaderboard
// dialog, src/boards.js, which also decides which counters are synced) and the Worker (cloudflare/boards.js: which
// counters it accepts and how fast each may grow). The counters are src/stats.js's own (stats[counter]), so lists and
// the achievements (#1711, src/medalcatalog.js) cannot drift apart. Add a list = add a row; a new counter also needs `perMin`/`start`.
//
// kind 'most'  : the highest count wins; shown as "N unit".
// kind 'first' : whoever got the counter above 0 first wins; the Worker stamps the time of the first sync that has it.
// counters: counter → { perMin: the most it can physically grow per minute (*guess*, a generous human maximum),
//   start: what a brand new row may bring on its first sync (an old save has history; *guess*) }.
export const COUNTERS = {
  squirrelFeeds: { perMin: 12, start: 3000 },
  petted: { perMin: 30, start: 5000 },
  catButts: { perMin: 30, start: 5000 },
  ponyPets: { perMin: 20, start: 3000 },
  flushes: { perMin: 30, start: 5000 },
  doors: { perMin: 60, start: 20000 },
  lids: { perMin: 40, start: 5000 },
  taps: { perMin: 60, start: 10000 },
  sat: { perMin: 30, start: 5000 },
  washed: { perMin: 40, start: 5000 },
  sandwiches: { perMin: 6, start: 2000 },
  tasks: { perMin: 6, start: 2000 },
  vacuumed: { perMin: 60, start: 20000 }, // m², rounded
  steps: { perMin: 500, start: 2_000_000 },
  dribbles: { perMin: 150, start: 50000 },
  // for the medals (#1711, src/medalcatalog.js); task_<id> is stats.taskCounts[id]
  stairs: { perMin: 60, start: 20000 },
  flights: { perMin: 10, start: 1000 },
  hotdogs: { perMin: 6, start: 2000 },
  falls: { perMin: 20, start: 2000 },
  burnt: { perMin: 10, start: 1000 },
  pingpingHugs: { perMin: 30, start: 2000 },
  task_makeSandwich: { perMin: 3, start: 500 },
  task_resetKitchen: { perMin: 3, start: 500 },
  task_snackClean: { perMin: 3, start: 500 },
  task_tidyHall: { perMin: 3, start: 500 },
  task_grillChicken: { perMin: 3, start: 500 },
  task_washDish: { perMin: 3, start: 500 },
  task_makeBed: { perMin: 3, start: 500 },
};

export const BOARD_LISTS = [
  { id: 'flest-squirrelFeeds', kind: 'most', counter: 'squirrelFeeds', title: 'Flest ekorrar matade', unit: 'ekorrar' },
  { id: 'flest-petted', kind: 'most', counter: 'petted', title: 'Flest klappade katter', unit: 'klappar' },
  { id: 'flest-catButts', kind: 'most', counter: 'catButts', title: 'Flest kattrumpor sedda', unit: 'rumpor' },
  { id: 'flest-ponyPets', kind: 'most', counter: 'ponyPets', title: 'Flest klappade hästar', unit: 'klappar' },
  { id: 'flest-flushes', kind: 'most', counter: 'flushes', title: 'Flest spolningar', unit: 'spolningar' },
  { id: 'flest-doors', kind: 'most', counter: 'doors', title: 'Flest öppnade dörrar', unit: 'dörrar' },
  { id: 'flest-lids', kind: 'most', counter: 'lids', title: 'Flest toalettlock uppfällda', unit: 'lock' },
  { id: 'flest-taps', kind: 'most', counter: 'taps', title: 'Flest påslagna kranar', unit: 'kranar' },
  { id: 'flest-sat', kind: 'most', counter: 'sat', title: 'Flest gånger satt ner', unit: 'gånger' },
  { id: 'flest-washed', kind: 'most', counter: 'washed', title: 'Mest diskat för hand', unit: 'disk' },
  { id: 'flest-sandwiches', kind: 'most', counter: 'sandwiches', title: 'Flest mackor', unit: 'mackor' },
  { id: 'flest-tasks', kind: 'most', counter: 'tasks', title: 'Flest klara vardagsuppdrag', unit: 'uppdrag' },
  { id: 'flest-vacuumed', kind: 'most', counter: 'vacuumed', title: 'Mest dammsugat', unit: 'm²' },
  { id: 'flest-steps', kind: 'most', counter: 'steps', title: 'Flest steg', unit: 'steg' },
  { id: 'flest-dribbles', kind: 'most', counter: 'dribbles', title: 'Flest basketstudsar', unit: 'studsar' },
  { id: 'forst-catButts', kind: 'first', counter: 'catButts', title: 'Först att se en kattrumpa' },
  { id: 'forst-squirrelFeeds', kind: 'first', counter: 'squirrelFeeds', title: 'Först att mata en ekorre' },
  { id: 'forst-ponyPets', kind: 'first', counter: 'ponyPets', title: 'Först att klappa en häst' },
  { id: 'forst-flushes', kind: 'first', counter: 'flushes', title: 'Först att spola på toaletten' },
  { id: 'forst-vacuumed', kind: 'first', counter: 'vacuumed', title: 'Först att dammsuga' },
  { id: 'forst-tasks', kind: 'first', counter: 'tasks', title: 'Först med ett vardagsuppdrag' },
  { id: 'forst-sandwiches', kind: 'first', counter: 'sandwiches', title: 'Först att göra en macka' },
];

/** The counter values to sync: whole numbers, only counters that exist and are above 0. */
export function boardCounters(stats) {
  const out = {};
  for (const k of Object.keys(COUNTERS)) {
    const v = counterValue(stats, k);
    if (v > 0) out[k] = v;
  }
  return out;
}
