# #1765: a more realistic caught fish

Source: the worktree's implementation of #1765 (src/caughtfish.js, CAUGHT_FISH in src/config.js), local server, Playwright Chromium
(SwiftShader, three@0.170.0 served locally).

- `1-arter-fore-efter.png`: the six species' new models in a neutral studio light (top two rows, the same length on screen), and the old shared
  shape (bottom row, as before #1765: a flattened sphere in the species colour). Perch: green-yellow bars, spiny first dorsal, red pelvic / anal
  fins; roach: silver, red eye, reddish fins; bream: deep, flat, bronze, long dark anal fin; pike: long, beak snout, light spots, dorsal / anal
  far back; trout: black and red spots, adipose fin; eel: long and slim with its continuous fin.
- `2-arter-i-handen.png`: each species held in the hand in the game (mid-range caught length).
- `3-grillen-fore-ra-klar-brand.png`: the courtyard kettle grill, flames hidden for the picture. Top: before (old perch), the new perch raw,
  cooked (golden) and burnt; bottom: a trout raw, cooked and burnt.

Checks: `node tools/caughtfishtest.mjs` ALL PASS (409–547 triangles per species, one cached geometry, no groups); `tools/fishingtest.cjs`
16 PASS / ALL PASSED; `tools/fishcooktest.cjs` 20 PASS / ALL PASSED; phone perfcount (`?cloud=&lowmem&w=844&h=390&quality=0`) ALL PASS,
start 341 calls (≤ 370; the caught fish is built only on a catch).
