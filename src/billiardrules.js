// #1354: stand-alone local billiards rules (no rendering, no network) so the shared players room (#1355) can reuse them.
// Simplified two-sided 8-ball: the table is open until the first legal pocketed ball picks solids (1-7) or stripes (9-15);
// a legal pocket keeps the turn; a foul (cue ball pocketed, no ball touched, wrong ball first) passes it, with the cue
// ball respotted by the physics (no ball in hand). Pocketing the 8 wins only after your group is cleared, without foul;
// otherwise it loses. Free play has no turns, groups or end. Players are "Spelare 1" and "Spelare 2".
export const MODES = ['free', 'eight'];
export const MODE_NAMES = { free: 'Fri lek', eight: '8-boll' };
export const groupOf = (id) => (id >= 1 && id <= 7 ? 'solid' : id >= 9 && id <= 15 ? 'stripe' : id === 8 ? 'eight' : null);
const GROUP_TEXT = { solid: 'hela bollar', stripe: 'halva bollar' };
export class BilliardRules {
  constructor(mode = 'free') { this.reset(mode); }
  reset(mode = this.mode) {
    this.mode = MODES.includes(mode) ? mode : 'free';
    this.turn = 0; this.groups = [null, null]; this.over = false; this.winner = null;
    this.remaining = new Set(Array.from({ length: 15 }, (_, i) => i + 1));
    this.message = this.mode === 'eight' ? 'Spelare 1 inleder' : 'Skjut fritt'; this.pocketed = []; this.firstHit = null;
  }
  nextMode() { return MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]; }
  get playerName() { return `Spelare ${this.turn + 1}`; }
  get canShoot() { return !this.over; }
  /** What the shooter must aim at first. */
  get target() {
    if (this.mode !== 'eight' || this.over) return '';
    const g = this.groups[this.turn];
    if (!g) return 'valfri boll utom åttan';
    return this.hasLeft(g) ? GROUP_TEXT[g] : 'åttan';
  }
  hasLeft(g) { for (const id of this.remaining) if (groupOf(id) === g) return true; return false; }
  beginShot() { this.pocketed = []; this.firstHit = null; }
  notePocket(id) { this.pocketed.push(id); }
  /** The balls have settled: apply the rules. `firstHit` is the first object ball the cue ball touched (or null). */
  endShot(firstHit) {
    if (this.mode !== 'eight' || this.over) { this.message = this.mode === 'free' ? 'Skjut fritt' : this.message; return this.message; }
    const me = this.turn, other = 1 - me, g = this.groups[me], cleared = !!g && !this.hasLeft(g);
    const cue = this.pocketed.includes(0), objects = this.pocketed.filter((id) => id > 0 && id !== 8);
    let foul = '';
    if (cue) foul = 'vita bollen i hål';
    else if (firstHit === null || firstHit === undefined) foul = 'ingen boll träffades';
    else if (g ? groupOf(firstHit) !== (cleared ? 'eight' : g) : firstHit === 8) foul = 'fel boll först';
    for (const id of this.pocketed) this.remaining.delete(id);
    if (this.pocketed.includes(8)) {
      this.over = true; this.winner = cleared && !foul ? me : other;
      this.message = this.winner === me ? `Spelare ${me + 1} sänkte åttan och vinner` : `Spelare ${me + 1} sänkte åttan ${cleared ? 'med foul' : 'för tidigt'}, Spelare ${other + 1} vinner`;
      return this.message;
    }
    if (!foul && !g && objects.length) { // the first legal pocket picks the groups
      const pick = groupOf(objects[0]);this.groups[me] = pick;this.groups[other] = pick === 'solid' ? 'stripe' : 'solid';
    }
    const mine = this.groups[me], keep = !foul && objects.some((id) => groupOf(id) === mine);
    if (!keep) this.turn = other;
    this.message = foul ? `Foul: ${foul}, Spelare ${this.turn + 1} skjuter` : keep ? `Spelare ${me + 1} fortsätter` : `Spelare ${this.turn + 1}: din tur`;
    if (!foul && mine && !g) this.message = `Spelare ${me + 1} har ${GROUP_TEXT[mine]}, fortsätter`;
    return this.message;
  }
}
