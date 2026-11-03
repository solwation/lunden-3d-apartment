// #1827: every successful bread bite advances the duck medal, but only a bounded amount of game score per day.
import { SCORE, DUCKS } from './config.js';
import { localDay } from './targetscore.js';
export const duckScoreOf = s => Number.isFinite(s.duckScore) && s.duckScore >= 0 ? s.duckScore : 0;
export function creditDuckFeeds(s, n = 1, day = localDay()) {
  if (!Number.isSafeInteger(n) || n <= 0) return 0;
  const old = s.duckFeedDay?.day === day ? s.duckFeedDay.points : 0;
  const used = Number.isFinite(old) && old >= 0 ? old : 0;
  const gain = Math.max(0, Math.min(n * SCORE.each.duckFeeds, DUCKS.scorePerDay - used));
  s.duckScore = duckScoreOf(s) + gain;
  s.duckFeedDay = { day, points: used + gain };
  return gain;
}
