import { KISS } from './config.js';
// #1398: exactly one name category each; ambiguous names cannot impersonate both sides.
export function kissRole(name) {
  if (typeof name !== 'string') return null;
  const n = name.normalize('NFKC'), sarah = /sarah/i.test(n), olof = /olof/i.test(n);
  return sarah === olof ? null : sarah ? 'sarah' : 'olof';
}
export const kissName = name => kissRole(name) !== null;
export function kissPair(a, b) {
  const left = kissRole(a), right = kissRole(b);
  return left !== null && right !== null && left !== right;
}
export function canKiss(a, b, from, to, range = KISS.range) {
  const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  return kissPair(a, b) && point(from) && point(to) && Math.hypot(...from.map((v, i) => v - to[i])) <= range;
}
// A shared envelope: approach, hold the kiss, and smoothly return. Seconds, not frame counts.
export function kissAmount(age) {
  const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  return age < 0 || age >= KISS.duration ? 0 : ease(age / KISS.contact) * (1 - ease((age - KISS.release) / (KISS.duration - KISS.release)));
}
