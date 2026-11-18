# #2097 Parked-car finish — verification

Before = base `c1ca60a` (the touched modules served from it), after = this change. Headless Chromium (SwiftShader), 480 × 300
viewport shot at 1280 × 800, `tools/carfinish2097browser.cjs` (PNG output converted to JPEG q82 for the repository).
Before-images live in `before/` and are removed when the issue is resolved.

| View | What it shows |
|---|---|
| `bil-nara-dag-*` | the street car park from ~7 m at 13:00: paint now carries a soft sky sheen (dark cars most visibly), black plastic matte |
| `bil-nara-natt-*` | the same at 22:30: the reflection dims to 0.04, no glow; lamp wash unchanged |
| `raden-dag-*`, `raden-natt-*` | the row from its east end, cars at 10–55 m (near batches and far LOD through the dither zone) |
| `parkering-40m-dag-*`, `parkering-40m-natt-*` | the row from ~40 m on the school slope: no sparkle, same silhouettes/colours |

Results (`browser.json`): zero console/shader errors and zero invalid programs in both phases; draw calls, triangles and
programs identical before/after in all six views (e.g. 61 / 227 / 376 calls by day); textures +1 (the 8 × 1 trim surface map,
32 bytes). The car LOD's far paint and clones follow the night. Node: `tools/carfinishtest.mjs` (4 tests),
`tools/vehiclelodtest.mjs`, `tools/lampwash2090test.mjs`, `tools/carglbtest.mjs` pass.
