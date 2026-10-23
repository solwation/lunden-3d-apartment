// #1370: stand-alone pétanque rules for the courtyard's boule court (no rendering, no network). Two sides ("Lag 1" and
// "Lag 2", tête-à-tête with `balls` boules each). Each mène (omgång) starts with the jack (lillen), thrown from the circle
// by the side that won the previous mène (Lag 1 first); a jack outside the valid distance is thrown again by the same
// side. That side then plays the first boule; after that the side that is NOT holding the point (its nearest boule is
// further from the jack, or it has none on the court) plays, until it either takes the point or runs out of boules, when
// the other side plays its remaining ones. An exact tie for the point: the side that played last plays again. When all
// boules are played the side with the nearest boule scores one point for each of its boules nearer than the opponent's
// nearest; an exact tie for the nearest scores nothing and the same side throws the jack again. First to `target` wins.
export const TEAM_NAMES = ['Lag 1', 'Lag 2'];
const EPS = 1e-4;
export class BouleRules {
  constructor(balls = 3, target = 13) { this.balls = balls; this.target = target; this.reset(); }
  /** A new game ("Nytt parti"): 0–0, Lag 1 throws the jack. */
  reset() {
    this.scores = [0, 0]; this.mene = 1; this.jackTeam = 0; this.over = false; this.winner = null; this.last = null;
    this.startMene(); this.message = 'Nytt parti: Lag 1 kastar lillen';
  }
  /** Collect the boules and start a mène (the current number; `restart` discards a mène in progress without points). */
  startMene() { this.phase = 'jack'; this.turn = this.jackTeam; this.left = [this.balls, this.balls]; this.lastTeam = null; this.message = `${TEAM_NAMES[this.turn]} kastar lillen`; }
  /** "Ny omgång" on the board: start the current mène again (or the next one once it is scored); no points change. */
  restartMene() { if (this.over) return this.message; if (this.phase === 'done') this.mene++; this.startMene(); this.message = `Omgång ${this.mene}: ${this.message}`; return this.message; }
  /** What the next E throws: 'jack', 'ball', 'collect' (the mène is scored; E collects and starts the next) or null (game over). */
  get next() { return this.over ? null : this.phase === 'done' ? 'collect' : this.phase; }
  /** The jack came to rest; `valid`: inside the allowed distance from the circle. */
  jackThrown(valid) {
    if (this.phase !== 'jack') return this.message;
    if (!valid) { this.message = `Lillen hamnade fel – ${TEAM_NAMES[this.turn]} kastar om`; return this.message; }
    this.phase = 'ball'; this.message = `${TEAM_NAMES[this.turn]} kastar första klotet`; return this.message;
  }
  /** Nearest distance per side ([Infinity] when it has none on the court). `distances`: [{team, d}]. */
  static nearest(distances) { const n = [Infinity, Infinity]; for (const b of distances) if (b.team >= 0 && b.team < 2) n[b.team] = Math.min(n[b.team], b.d); return n; }
  /** A boule of the side to play came to rest; `distances` lists every boule on the court ({team, d} to the jack). */
  ballThrown(distances) {
    if (this.phase !== 'ball') return this.message;
    const me = this.turn; this.left[me] = Math.max(0, this.left[me] - 1); this.lastTeam = me;
    if (this.left[0] + this.left[1] === 0) return this.score(distances);
    const [a, b] = BouleRules.nearest(distances);
    let side = Math.abs(a - b) < EPS ? me : a < b ? 1 : 0; // the side NOT holding the point plays
    if (!this.left[side]) side = 1 - side;
    this.turn = side;
    const point = Math.abs(a - b) < EPS ? 'Lika nära' : `${TEAM_NAMES[a < b ? 0 : 1]} ligger närmast`;
    this.message = `${point} – ${TEAM_NAMES[side]} kastar`; return this.message;
  }
  score(distances) {
    const n = BouleRules.nearest(distances), mene = this.mene;
    if (Math.abs(n[0] - n[1]) < EPS) {
      this.phase = 'done'; this.last = { team: null, points: 0, mene };
      this.message = `Omgång ${mene}: lika – ingen poäng`; return this.message;
    }
    const w = n[0] < n[1] ? 0 : 1, points = distances.filter((b) => b.team === w && b.d < n[1 - w] - EPS).length;
    this.scores[w] += points; this.jackTeam = w; this.last = { team: w, points, mene };
    if (this.scores[w] >= this.target) {
      this.over = true; this.winner = w; this.phase = 'over';
      this.message = `${TEAM_NAMES[w]} vinner med ${this.scores[w]}–${this.scores[1 - w]}!`; return this.message;
    }
    this.phase = 'done';
    this.message = `Omgång ${mene}: ${TEAM_NAMES[w]} får ${points} poäng`; return this.message;
  }
  /** E after a scored mène: the next mène begins (the winner throws the jack). */
  collect() { if (this.phase !== 'done') return this.message; this.mene++; this.startMene(); return this.message; }
}
