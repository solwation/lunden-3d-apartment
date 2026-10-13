import { FALL } from './config.js';

// Pure shared rule, not a second health counter. Suit soft-land protection is the landing caller's responsibility.
export function fallDamage(drop, gap, maxLives) {
  if (!Number.isFinite(drop) || !Number.isFinite(gap) || drop < 0 || gap < 0 || drop > FALL.maxReport || gap > FALL.maxReport
      || !Number.isSafeInteger(maxLives) || maxLives < 1) return null;
  if (gap < FALL.free || drop <= FALL.hurt) return 0;
  return drop > FALL.fatal ? maxLives : Math.ceil(maxLives / 2);
}
