# #2175 Wet facades, roofs, cars and benches in the rain

`src/wetsurface.js` (one fragment step per material class, driven by the ground's wetness `uGroundWet.x`). Real game, 2026-09-25,
`tools/wetsurface2175browser.cjs` (before = `a1e55c59`'s versions of the touched modules). Images are JPEG (PNG exceeded the 600 KB limit).

| Image (before in `before/`) | Shows |
|---|---|
| `after-rain-fasad.jpg` | Hus L street facade in rain: darker, glossier brick; run streaks on the render above the loftgang |
| `after-afterrain-fasad.jpg` | Same, 10:30 after the morning shower (wet 0.55, clear sky): partly dried, streaks gone (only when soaked) |
| `after-dry-fasad.jpg` | Dry: pixel-identical to before (0 differing pixels) |
| `after-rain-husA.jpg` | Hus A brick, loggia render, bench, rails in rain |
| `after-rain-bil2.jpg` | Car park in rain: paint darker/glossier (white cars greyer, red deeper) |
| `after-rain-tak.jpg` | Hus L roof felt in rain: darker with a sky sheen at the right edge |
| `after-rain-bank.jpg` | Courtyard benches (wood darker) and Hus A/B brick from above |

Cost (renderer.info, same view): draw calls and triangles unchanged (451/452 calls, 881,328 triangles at the facade view, dry/rain, before and
after); shader programs +4 on desktop (134 to 138 dry, 135 to 139 rain: the new cache keys per class); phone profile (`&lowmem`) 82 to 82 programs
(`phone/`: identical before/after, plain materials are skipped there). Dry parity: facade view identical; the other dry views differ only in
swaying foliage and sky (grid diff: no pixels on walls, roofs or cars).
Test: `node --test tools/wetsurfacetest.mjs`.
