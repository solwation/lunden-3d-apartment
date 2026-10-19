import { KISS } from './config.js';
// Shared client/room eligibility: names contain either word, case-insensitive, as requested (#1343).
export const kissName = name => typeof name === 'string' && /sarah|olof/i.test(name.normalize('NFKC'));
export function canKiss(name, from, to, range = KISS.range) {
  const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  return kissName(name) && point(from) && point(to) && Math.hypot(...from.map((v, i) => v - to[i])) <= range;
}
