// #1829: whole seconds on the disco floor; no credit for toggles or inactive/background gaps.
import { DANCE, PLAYROOM, SCORE } from './config.js';
import { localDay } from './targetscore.js';

export class DanceTime {
  constructor(credit) { this.credit = credit; this.fraction = 0; }
  update(dt, { active, inside, dancing, music, pos }) {
    const b = PLAYROOM.speakers.bounds, x = pos.x - PLAYROOM.x, z = pos.z - PLAYROOM.z;
    if (!active || !inside || !dancing || music !== 'playing' || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 ||
        !Number.isFinite(dt) || dt <= 0 || dt > 1) { this.fraction = 0; return 0; }
    this.fraction += dt;
    const seconds = Math.floor(this.fraction + 1e-9);
    if (seconds) { this.fraction = Math.max(0, this.fraction - seconds); this.credit(seconds); }
    return seconds;
  }
}
export const danceScoreOf = s => Number.isFinite(s.danceScore) && s.danceScore >= 0 ? s.danceScore : 0;
export function creditDance(s, seconds, day = localDay()) {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return 0;
  const previous = s.danceRewardDay;
  const used = previous?.day === day && Number.isFinite(previous.pts) && previous.pts >= 0 ? previous.pts : 0;
  const gain = Math.max(0, Math.min(seconds * SCORE.each.danceSeconds, DANCE.scorePerDay - used));
  s.danceScore = danceScoreOf(s) + gain;
  s.danceRewardDay = { day, pts: used + gain };
  return gain;
}
