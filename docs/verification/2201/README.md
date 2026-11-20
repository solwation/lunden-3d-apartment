# #2201 parked-car body types: before / after

`node tools/carvariants2201browser.cjs` (headless Chromium via `tools/browsertest.sh`, `?test&shot`, 13:00 June, clear, desktop quality).
Before = origin/main 6965828e; after = this branch. `browser-before.json` (before phase) / `browser.json` (after phase) hold the raw numbers.

| view | draw calls before -> after | triangles | programs |
|---|---|---|---|
| gata-trekvart (street car park, 3/4 from the road) | 88 -> 99 | 526 696 = 526 696 | 73 = 73 |
| gata-raden (along the row) | 246 -> 257 | 784 417 = 784 417 | 123 = 123 |
| ost-parkering (east lot) | 67 -> 77 | 521 063 = 521 063 | 146 = 146 |
| ost-rad (east lot, row of tails) | 268 -> 277 | 830 358 = 830 358 | 150 = 150 |

Triangles and programs do not change (a body type is the same parts warped); draw calls grow by three near batches per extra
body type that occurs per place (paint, trim incl. tyres, glass), plus one far-LOD mesh per type. No console errors, no invalid programs.
