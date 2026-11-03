// #1828: completed repetitions keep their full medal count, but exercise points have a daily ceiling.
// Awarded points and the current local day share the existing statistics save.
import { OUTDOOR_GYM, SCORE } from './config.js';
import { localDay } from './targetscore.js';

export const gymScoreOf = s => Number.isFinite(s.gymScore) && s.gymScore >= 0 ? s.gymScore : 0;

/** Credit positive whole repetitions to the score ledger (the caller separately counts them all). */
export function creditGym(s, repetitions, day = localDay()) {
  if (!Number.isSafeInteger(repetitions) || repetitions <= 0) return 0;
  const previous = s.gymRewardDay;
  const used = previous?.day === day && Number.isFinite(previous.pts) && previous.pts >= 0 ? previous.pts : 0;
  const gain = Math.max(0, Math.min(repetitions * SCORE.each.gymReps, OUTDOOR_GYM.scorePerDay - used));
  s.gymScore = gymScoreOf(s) + gain;
  s.gymRewardDay = { day, pts: used + gain };
  return gain;
}
