# #1777 verification: the outbox no longer drops a catch request

No result images: the change is in network queueing and has no visible result of its own.

## Change
- `src/outbox.js` `trimOutbox` / `outboxTier` is the one overflow policy, called through `Ghosts.trimOutbox()` at every
  outbox push in `src/ghosts.js` (10 former `splice` loops, the shot loop in `fire()`, and `pool` / `music` / `cinema`, which had no bound).
- On overflow (more than `GHOSTS.outbox` = 3): the oldest replaceable snapshot goes first (`sq` `s`/`n`, `pk` `s`, `pkg`),
  then cosmetic events (shot miss, `rx`, `snd`, `c`, `g`, then a shot hit), never `fall` / `consume`.
  The player's one-off actions (`rf` on/off/c/sc, `dr`, `tm`, `sq` t/p/f, `pk` pet, `pool`, `mus`, cinema, snake, `gf`) wait up to
  `GHOSTS.outboxHard` = 8 (*guess*); beyond that the oldest action goes and a catch request only when nothing else is left.
  An incoming snapshot into a queue full of actions is the one dropped.
- `rf` joined `URGENT`; while a state is due (#1763) the first urgent message anywhere in the queue is sent, not only one at its head.

## Checks (2026-11-01, worktree based on 489dabca)
| Check | Result |
|---|---|
| `node --test src/outbox.test.mjs` (full `sq`/`pk` queue + `rf c` → `rf c` kept and drained; actions kept, incoming snapshot dropped; miss before hit; hard cap) | 4/4 pass |
| `node --test cloudflare/*.test.mjs src/*.test.mjs` (incl. players.test.mjs) | 356/356 pass |
| `tools/squirrelsynctest.cjs` | run 1: 2 FAIL in the feeding step (squirrel stayed `down`; B's outbox empty, `dropped` 0, so not the outbox); run 2: all PASS |
| `tools/squirrelratetest.cjs` (20 s) | run 1: leader race (B led) + missing OUT_DIR crash (the test's `mkdirSync` sits inside a comment, pre-existing); run 2 with OUT_DIR created: all PASS, state gap max 552 ms, room limit passed 0 times, `pk` 0.66/s, `sq.s` 1.16/s |
| `tools/fishingtest.cjs` with the #1776 test hook, 10 runs | see docs/verification/1776/README.md |
