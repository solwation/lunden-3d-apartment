import { HUG } from './config.js';
import { kissPair } from './kiss.js';
// #1405: a hug needs no name rule, only two finite feet close enough (3D: another floor is not close).
const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
export function canHug(from, to, range = HUG.range) {
  return point(from) && point(to) && Math.hypot(...from.map((v, i) => v - to[i])) <= range;
}
/** The interactions offered between two players, in menu order: everybody greets and hugs; only a complementary
 * Sarah/Olof pair (src/kiss.js, unchanged #1398 rule) can also kiss. */
export function playerChoices(me, them) { return kissPair(me, them) ? ['greet', 'hug', 'kiss'] : ['greet', 'hug']; }
// Approach, hold and let go: 0 … 1 over HUG.duration s (the same smoothstep envelope as the kiss).
export function hugAmount(age) {
  const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  return age < 0 || age >= HUG.duration ? 0 : ease(age / HUG.contact) * (1 - ease((age - HUG.release) / (HUG.duration - HUG.release)));
}
