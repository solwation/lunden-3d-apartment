# #1756 Nordic Wellness moved, NTI school restored

Headless Chromium (SwiftShader), June noon, `fore-` = origin/main d1b1ca55 (#1745 state), `efter-` = this change.

- `fore-skola-fran-gatan.png` / `efter-skola-fran-gatan.png`: `?at=-8,-30,0,-6,5`, looking north from Sankt Lars väg at the old NTI spot. Before: the gym box; after: the classic school again.
- `fore-gym-fran-gangytan.png` / `efter-gym-fran-gangytan.png`: `?at=-204,-195,0,6`, from the walk edge (z -195) toward Sankt Lars väg 90-92. Before: empty grass; after: the gym (guess footprint, centred on model x -204, z -237).
- `fore-oversikt.png` / `efter-oversikt.png`: `?at=-204,-196,0,-18,25`, elevated view of the same spot; the gym stands on open grass clear of the road (right).

Checks: `tools/eastbackdroptest.html` 51/51 PASS, `tools/farwalktest.html` 79 checks PASS, phone `perfcount` (`?lowmem&w=390&h=844`) max 319 calls at "patio far" (start 300), within budget 370.
