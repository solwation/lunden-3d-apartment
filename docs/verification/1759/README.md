# #1759: a dropped player state is sent again

1. `1-annan-spelare-ser-flotet.png`: Bo's view of Alma's float and line (`tools/fishingtest.cjs`, run 9 of 10).

Most of the evidence is numbers, because a dropped state cannot be seen in a picture.

## Cause
- **The flaky check "B ser flötet" had two causes in the test, not the room's limit.** A local Worker logged every message's
  rate verdict over 13 runs (1 709 messages): none was dropped.
  1. A's state with `fb` waited in the client. An outbox message (squirrels `sq` / paddock `pk`) took the only 5 Hz slot in the one frame A ran, and then the test ran no more frames for A for 10 s (`prevFb` set, `sentFb` null).
  2. B stood about 100 m away (camera x ≈ −170, float x ≈ −40). Only A runs frames, so B's river clock is stale and its own estimate of the fish's position is wrong. B now stands across from A's aim.
- **The suspected drop is real, but on a bad network.** `tools/resendtest.cjs` holds A's socket for 2.9 s while the float changes, then sends the whole queue at once, as a stalled phone link does. The room passes 6 of 13–14 messages, and the final float is among the dropped ones. Before the fix (`noresend`), B still sees the old float after 6 s. After the fix, B sees the final float and rod after 2.0 s.

## Fix
- `src/ghosts.js` sends the last state once more `GHOSTS.resendMs` (3 s, *guess*) after it settles. The resend does not count as activity.

## Checks
- `node --test cloudflare/players.test.mjs cloudflare/statesize.test.mjs`: 73/73 passed, including the new #1759 burst test.
- `tools/fishingtest.cjs`: 10 of 10 runs ALL PASSED. Before, "B ser flötet" failed in 1 of 2 runs without the fixes, and in 4 of 10 runs with only the first fix (cause 2).
- Traffic per second, from `resendtest`:

| Player | Before | After |
|---|---|---|
| Standing still for 20 s | 0 | 0 |
| Walking for 10 s | 4.5–4.7 | 4.5 |
| In the 8 s after stopping | 1 message | 2 messages (one resend) |

Not tested: a real phone network.
