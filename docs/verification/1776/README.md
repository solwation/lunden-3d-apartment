# #1776 verification: fishingtest is deterministic

No result images: test-only change.

## Cause of the flaky runs
1. **Test only:** the test runs game time slower than the wall clock, so the fish swam away from the float (median 0.46 m/s)
   and no bite came (`bite: null`, no fish within `FISHING.wait.radius`).
2. **Game bug, fixed in #1777:** the catch request (`rf` `c`) was pushed out of the full 3-slot outbox by the squirrel / paddock
   leader's snapshots, so the room never answered and the fish "slipped" after `FISHING.wait.answer`.

## Test hook
- `tools/fishingtest.cjs`: `T.dice()` fixes only the cast's dice through Fishing's injectable `rnd` (a fish within `wait.radius`
  bites on the first frame after `wait.min`; the swimming is unchanged). `T.bite()` reels in and casts again at the nearest
  fish when the float's fish have swum out of reach. `T.info()` also reports the game's messages and the outbox.
- `tools/fishcooktest.cjs`: the same dice, and a recast when no fish is within reach.

## Results (2026-11-01, on top of the #1777 fix, local Worker `cloudflare/dev.mjs`, headless Chromium)
| Run | Result | Time |
|---|---|---|
| 1–10 `tools/fishingtest.cjs` | 16 PASS / 0 FAIL each, exit 0 (10/10) | 149–301 s (median ~180 s) |
| `tools/fishcooktest.cjs` | 20 PASS / 0 FAIL, exit 0 | — |
