# #1882 More outdoor cats — verification

Eight more outdoor cats (12 in all) on their own #1840-style loops in further areas; binder pages name each outdoor cat and where it roams.

## Images (real app, headless Chromium/SwiftShader, deviceScaleFactor 2)

| Image | Shows |
|---|---|
| [1-misan-klocktornsparken.png](1-misan-klocktornsparken.png) | Misan (siames) walking in the grove north of the campus road, animated puppet at 4.7 m |
| [2-tiger-hasthagen.png](2-tiger-hasthagen.png) | Tiger (maine coon, brunrandig) resting on the meadow east of the paddock, south of the river |
| [3-molly-sankt-lars.png](3-molly-sankt-lars.png) | Molly (perser, gräddvit, rare) washing among the old trees between the hospital roads |
| [5-parm-misan.png](5-parm-misan.png) | Binder page #014 Siames after meeting/petting Misan: Plats "Ute: Misan (klocktornsparken)", fact about where she roams, Klappningar 1 |
| [6-parm-tiger.png](6-parm-tiger.png) | Binder page #022 Maine coon (brunrandig), seen: Plats "Ute: Tiger (hästhagen)" |

## Checks

1. `node --test src/outdoorcatroute.test.mjs tools/outdoorcatbraintest.mjs tools/bestiarycatalogtest.mjs src/footprinttrail.test.mjs tools/catnuzzletest.mjs tools/catexplorationtest.mjs tools/catexplorationsite.test.mjs` — 35/37, [output](node.txt). All #1882 tests pass: forms/zones/traits, closed deterministic laps in both directions, every 0.25 m of each added loop against its captured site ([site.json](site.json): drawn cat-ground heights, walls, solids) plus roads/vehicle ways/water/paddock/drops, coverage, binder pages and an old saved collection keeping its rows/numbers (registry ids and numbers 1–65 unchanged). The two failures are pre-existing on `a0c556c8` with the same result (bestiary visual-sight test 3; catnuzzle model test reads a hard-coded `/home/devcontainers/.cache/three-0.170.0` path).
2. Coverage (*guess*: any cat within 60 m, sampled every minute over a day): at least half the time at 10 of 12 usual outdoor places, against 2 of 12 with the four original cats; no place got worse. The river park (0.48, explore cats away) and Freinet's yard/Karpvägen bridge (0.19/0.38) stay below half.
3. `node tools/outdoorcats1882browser.cjs http://localhost:8182 docs/verification/1882` — 9/9 PASS, [browser.json](browser.json): 2902 route samples walkable/free with the module's own callbacks; Misan meets the visitor, becomes the ordinary cat, purrs and offers carrying, and the find is recorded; two binder pages; no page errors.

Draw calls (`renderer.info`, with the added cats drawn vs hidden, same frame): an animated near cat costs +24 calls (like the existing cats' ~22); at four representative outdoor views with no added cat in range the delta is 0. An earlier run measured the merged far LOD of Greta from the courtyard at +1 call (105 → 106). `drawDist` 32 m / `drawDistPhone` 18 m / `near` 7 m are unchanged (asserted in the node test). Not measured: a phone or Surface Pro frame time.

Planning: `node tools/catrange1882browser.cjs http://localhost:8182 docs/verification/1882` regenerates [proposed.json](proposed.json) and [site.json](site.json); the routes in `OUTDOOR_CATS.cats` equal proposed.json.
