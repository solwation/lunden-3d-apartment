// #1761: the counter step of stats.bump(), kept pure so node can test it. A key that already holds
// something other than a finite number (an object such as a quest state, a string …) is left untouched.

/** Add `n` to the counter `stats[key]` (missing counts as 0). Returns false, changing nothing, if the
 * key holds a non-number. */
export function addCount(stats, key, n = 1) {
  const v = stats[key] ?? 0;
  if (!Number.isFinite(v)) {
    console.warn(`stats: "${key}" är ingen räknare (${typeof v}); bump hoppas över`);
    return false;
  }
  stats[key] = v + n;
  return true;
}
