import { groupOf } from './billiardrules.js';

/** Scores derive from the actual shared balls/groups; the rules decide the winner. */
export function billiardScore(rules,balls) {
  const sunk=balls.filter(b=>b.id>0&&!b.active);
  return {total:sunk.length,players:rules.groups.map(g=>g?sunk.filter(b=>groupOf(b.id)===g).length:null),winner:rules.over?rules.winner:null};
}
