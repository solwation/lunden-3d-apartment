# #2103 Street wear: verification

Worn local streets (`src/streetwear.js`, `STREET_WEAR` in `src/config.js`, all *guess*): slightly darker, polished wheel
tracks per lane with a faint lane-centre strip, a few thin wavy cracks (some sealed with glossy black bitumen), an
intermittent crack along the road edges, zebra bars flaking where the wheels run, and the repair patches with the asphalt's
own aggregate (three more on the street-level asphalt). Placement is deterministic (world-metre hashes and the build-time
`roadFrame` attribute).

## Checks

1. `node --test tools/streetweartest.mjs`: 5/5 pass. Road frame (signed metres across / half width) on Sankt Lars väg and
   Karpvägen, a strip keeps its own road's lanes at the drive's mouth; track profile (two per lane at the gauge, one centred
   pair on the 5.5 m drive, none off the asphalt); `addRoadFrame` is deterministic and leaves positions/index untouched;
   the asphalt chain keeps #2072's aggregate and #2099's wet patch in order, one copy, key
   `asphalt-surface-2072|wear2103-asphalt|wet2099-asphalt`, vertex shader only gains the two varyings (native vertex audit),
   wear inside `USE_MAP` (snow skips it); paint key `…|wear2103-paint|wet2099-paint`; the new patches lie on street-level
   asphalt clear of the old patches and the zebra. Also passing: `asphaltsurfacetest` 3/3, `wetgroundtest` 3/3,
   `cobbledcorner2077test` 3/3.
2. Browser (`tools/streetwear2103browser.cjs`, SwiftShader, 1280 × 800, 10 June 2026 13:00, clear; plus the same street in
   rain): `before` serves the base revision's `config/asphaltsurface/surroundings/street` modules. No page or shader errors.

| View | Draws before → after | Triangles | Textures | Programs |
|---|---|---|---|---|
| street | 162 → 162 | 699435 → 699441 | 49 → 49 | 79 → 79 |
| intersection | 66 → 66 | 451338 → 451344 | 27 → 27 | 52 → 53 |
| zebra | 38 → 38 | 295796 → 295802 | 21 → 21 | 41 → 41 |
| near | 110 → 110 | 605673 → 605679 | 37 → 37 | 66 → 67 |
| rain-street | 163 → 163 | 699435 → 699441 | 49 → 49 | 79 → 80 |

+6 triangles = the three new patch rectangles. The `site-asphalt` mesh keeps its 14223 vertices; it gains only `roadFrame`
(8 bytes/vertex, 113.8 kB). No new draw, texture, light or pass. In rain (`uGroundWet` = 1) the wet film and puddles lie
over the cracks and tracks as before.

## Images

`street.jpg`, `intersection.jpg`, `zebra.jpg`, `near.jpg`, `rain-street.jpg`: after. `before/*-before-after.jpg`: the same
camera before (left) and after (right), half size.

## Limits

- Wheel tracks are deliberately subtle (≈20 % darker at their centre); at a distance they read as a faint banding.
- Junction mouths and fillets have no tracks (no lane frame there); cracks are world-placed, so a crack may cross a patch edge
  under the patch (patches carry no cracks).
- Repair patches stay axis-aligned flat rectangles at y 0.016 (street level north of Hus L and the east leg only).
- Bridge/backdrop roads and park paths have their own materials and are unchanged. No FPS claim: a few hashes and value-noise
  taps per local road fragment were not timed on the target hardware.
