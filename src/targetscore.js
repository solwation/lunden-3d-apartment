// #1708: the Nerf target's own points (🎯, stats.target) are worth little game score, with a daily ceiling, for every
// weapon alike. Pure functions so node tests can run them without the DOM.
import { TARGET_SCORE } from './config.js';

/** Local calendar day key, e.g. "2026-10-30". */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Game score from the target in a statistics record; an older save (no targetScore yet) is converted once, capped. */
export function targetScoreOf(s) {
  return Number.isFinite(s.targetScore) ? s.targetScore : Math.min((s.target ?? 0) * TARGET_SCORE.perPoint, TARGET_SCORE.perDay);
}

/** Credit `pts` target points to `s` (mutates targetScore/targetDay); returns the game score added. */
export function creditTarget(s, pts, day = localDay()) {
  const base = targetScoreOf(s);
  const used = s.targetDay?.day === day ? s.targetDay.pts : 0;
  const gain = Math.max(0, Math.min(pts * TARGET_SCORE.perPoint, TARGET_SCORE.perDay - used));
  s.targetScore = base + gain;
  s.targetDay = { day, pts: used + gain };
  return gain;
}
