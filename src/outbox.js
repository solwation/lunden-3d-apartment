// #1777: the ghosts' shared outbox (src/ghosts.js, GHOSTS.outbox slots within the GHOSTS.hz budget) - which message goes when it is full.
// Pure, no three.js: node --test src/outbox.test.mjs
//
// Tiers, cheapest first; an overflow drops the OLDEST message of the cheapest tier present:
//   0 'snapshot'  a leader's periodic snapshot that the next one replaces anyway: squirrel pose / nuts (sq 's' / 'n'), pony
//                 snapshot (pk 's') and grass mask (pkg). Dropping one only delays the picture.
//   1 'cosmetic'  a one-off that only shows something: a shot that missed (a without `to`), reaction (rx), sound (snd), toast (c),
//                 greeting (g, a kiss / hug included), then a shot that hit (a with `to`) last within the tier (#667: never a hit before a miss).
//   2 'action'    everything else: the player's own outcome (river fish rf on / off / c / sc, door dr, game time tm, squirrel take /
//                 put / feed, pony pat, pool, music, cinema, snake, graffiti block gf). Kept while the queue stays below
//                 GHOSTS.outboxHard; beyond that the oldest goes, a catch request (rf c / sc) only when nothing else is left.
// The fall / consume claims (#1013 / #1014) are never dropped: they wait until the room answers and are removed by their owner.

const NEVER = new Set(['fall', 'consume']);
const COSMETIC = new Set(['rx', 'snd', 'c', 'g']);

/** The tier of outbox message `m` (0 snapshot, 1 cosmetic, 2 action, Infinity never dropped). */
export function outboxTier(m) {
  if (NEVER.has(m.t)) return Infinity;
  if ((m.t === 'sq' && (m.k === 's' || m.k === 'n')) || (m.t === 'pk' && m.k === 's') || m.t === 'pkg') return 0;
  if (m.t === 'a') return m.to ? 1.5 : 1;
  if (COSMETIC.has(m.t)) return 1;
  return 2;
}

const isCatch = (m) => m.t === 'rf' && (m.k === 'c' || m.k === 'sc');

/** Trim `outbox` (an array, changed in place) to `max` messages, actions allowed up to `hard`. Returns the dropped messages. */
export function trimOutbox(outbox, max, hard = max) {
  const dropped = [];
  while (outbox.length > max) {
    let at = -1, best = Infinity;
    for (let i = 0; i < outbox.length; i++) { const r = outboxTier(outbox[i]); if (r < best) { best = r; at = i; } }
    if (best >= 2) { // only actions (and fall / consume) left: they may wait up to `hard`
      if (outbox.length <= hard) break;
      at = outbox.findIndex((m) => outboxTier(m) === 2 && !isCatch(m));
      if (at < 0) at = outbox.findIndex((m) => outboxTier(m) === 2);
      if (at < 0) break; // (all fall / consume)
    }
    dropped.push(outbox.splice(at, 1)[0]);
  }
  return dropped;
}
