# #2222 bicycletest.cjs: source anchor in src/main.js stops the test

## Cause

`tools/bicycletest.cjs` slices excerpts of `src/main.js` with `span(source, start, end)`. The anchor for the keyboard
handler was `"document.addEventListener('keydown', (e) => {\n  if (!locked"`. Commit a268872f (reaction camera) put
`if (reactionCam.active && ...) stopReactionCam(true);` as the first line of that handler, so the anchor matched
0 times. `span` reports every miss as `ambiguous source anchor`, which is why the message was misleading
(0 matches, not several).

## Change

- `tools/bicycletest.cjs`: `mainKeys()` finds the gameplay keydown handler by its gate
  (`if (!locked || statsOpen) return;` followed by `if (reading)`) and slices back to the nearest
  `document.addEventListener('keydown', (e) => {`. It tolerates extra lines before the gate and throws a clear
  error if the gate is missing or duplicated.
- `tools/mainfixture.cjs` (the shared fixture, which says to add new main.js globals there): default
  `reactionCam: {active:false}` and import `INVENTORY_KEYS` from `/src/inventoryhud.js`; the handler now reads both.
- No game code changed.

## Before

`node tools/bicycletest.cjs` stopped at startup with `Error: ambiguous source anchor document.addEventListener('keydown', (e) => {
  if (!locked` (0 occurrences in src/main.js; no check ran).

## After

Command: `PLAYWRIGHT_MODULE=/home/olof/kvarteret-lunden/node_modules/playwright tools/browsertest.sh node tools/bicycletest.cjs http://localhost:8570 /tmp/bike2222`
The test now runs to the end (`SOME FAILED`, 104 PASS, 12 FAIL, peak 591 MiB). Mount/extract, focus/controls,
collision, save, reload and touch checks pass. The failures are all in bicycle motion:

    FAIL actual keyboard drive travels clearly faster than normal walking   (1 s of W moves 2.13 m)
    FAIL idle bicycle stays still
    FAIL original active predicate freezes movement under pause
    FAIL ordinary keyboard speed exceeds walking yard-{0-2,0-4,0-5,0-7,1-0,1-2,1-4,1-7,1-8}

They are not caused by this change (the anchor/fixture only affect input dispatch, and mount works). Likely cause:
bfe50edd (#2148, bicycle cadence, gears and freewheel/coasting in `src/player.js`): speed now builds up gradually and
the bike coasts after the key is released, so the old "faster than 1.5 x walk after 1 s" and "still when idle" thresholds
no longer hold. Not verified further; a separate bug issue is for the conductor.
