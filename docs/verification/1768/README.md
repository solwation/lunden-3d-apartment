# #1768: flaky tools/squirrelsynctest.cjs

## Cause (test only, no game bug found)

- "both see the squirrel with the nut in its mouth": the check read both clients once, right after B's feed. B's `hasNut` comes with the
  leader's next pose snapshot (`SQUIRRELS.sync.every` = 0.5 s) and A's with the feed message, so a read just before them sees `false`.
- "both see the same nuts": two causes. The follower gets nuts at most every `nutEvery` (0.4 s), so one immediate read can straddle an update.
  Also the test rounded x/z to 0.1 m while the wire carries cm: the leader's exact x and the follower's cm-rounded x round differently at a .x5
  boundary, so a nut counted as different. A failing run showed `a: 15, b: 14` after the old single read.

## Change

`settle()` polls (both clients pumped 250 ms per round, at most 3 s = six snapshot intervals, returns as soon as the condition holds) for the
nuts and nut-in-mouth checks, and `nuts()` compares in cm like the wire. The nuts check also prints the nuts only one client has.
Game sync is unchanged.

## Runs

Before: 1 of 3 runs failed ("same nuts"). After (same worktree, local Worker, `tools/browsertest.sh node tools/squirrelsynctest.cjs`):
10 consecutive runs, 10 x `ALL PASSED`, 0 FAIL lines.
