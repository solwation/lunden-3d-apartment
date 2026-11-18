# #2094 Hedge leaf clumps

Entrance boxwood (`src/boxwood.js`) and the Hus L/neighbour patio hedges (`src/patiohedge.js`), both built by `src/hedgeform.js`,
get fragment-only leaf clumps (`src/hedgeclump.js`, `HEDGE_CLUMP` in `src/config.js`, all *guess*): rounded clumps with soft
dark crevices, darker interior in the lower 40 %, lighter clump crowns and a slightly lighter top (now a smooth slope
fade instead of a hard step at the rounded edge). Clump detail fades back to the old tone at 16–34 m and when a clump
spans under ~2 px.

## Images (1280 × 800, 13:00, clear, base 80b8ba4 → this commit)

| View | `at` (x, z, yaw, pitch) | After | Before |
|---|---|---|---|
| Entrance boxwood, near | -20, -4.9, 180, -28 | [summer](box-near-sommar.jpg), [winter](box-near-vinter.jpg) | [summer](before/box-near-sommar.jpg), [winter](before/box-near-vinter.jpg) |
| Entrance boxwood, walk view | -13, -6.8, 140, -6 | [summer](box-walk-sommar.jpg), [winter](box-walk-vinter.jpg) | [summer](before/box-walk-sommar.jpg), [winter](before/box-walk-vinter.jpg) |
| Patio hedge, near | 4.6, 15.3, 180, -22 | [summer](patio-near-sommar.jpg), [winter](patio-near-vinter.jpg) | [summer](before/patio-near-sommar.jpg), [winter](before/patio-near-vinter.jpg) |
| Patio hedges, walk view | 0.4, 13.2, 150, -6 | [summer](patio-walk-sommar.jpg), [winter](patio-walk-vinter.jpg) | [summer](before/patio-walk-sommar.jpg), [winter](before/patio-walk-vinter.jpg) |

Detail crops, before above / after below: [boxwood](before/box-near-detalj-fore-efter.jpg), [patio](before/patio-near-detalj-fore-efter.jpg).

## Checks

- `node --test tools/hedgeclumptest.mjs` (5/5): deterministic continuous clump field; crevice share and darkness; mean-normalised
  tone, darker near the ground, top +3–12 %; shader constants from config, no texture lookups; `hedgeBody` deterministic and
  inside its footprint, top lighter than upper sides; clumps only on materials that ask, distinct program key, stems kept.
- One-off function comparison against 80b8ba4's `hedgeBody` (boxwood 9.4 m, patio 6.1 m runs): position, normal, uv and index
  identical; vertex colour differs by at most 0.07 (the smooth top fade).
- Browser (`tools/hedgeclump2094browser.cjs`, SwiftShader, `browser.json`): no page or shader errors in either phase; all nine hedge
  meshes (8 patio, 1 boxwood) keep vertex counts and position hashes; walk view summer/winter 289/284 draws, 744 484/697 712
  triangles, 100 textures, 109/113 programs before and after (identical). Program key `hedge-form-2094` chained by lampwash.

## Houses checked

- Hus L: entrance boxwood and patio hedges (own + neighbours') changed, see images.
- Hus A, B, C: no hedges of their own (plants.md); the patio-near view looks towards Hus A and is unchanged apart from the hedge.
- Hospital car parks (#1805) and school/Klockhuset car-park hedges: vertex-coloured backdrop boxes from `schoolyard.js` in the
  far batches, not `hedgeform.js`; unchanged (seen only at backdrop distance, where clumps would fade anyway).

## Limits

Clumps are colour and normal only (no silhouette change); in winter the patio hedges lose their map and stay plain snow by design.
Cost: one 3 × 3 Worley loop per hedge fragment (no texture fetch), nothing per frame on the CPU, no new draws/textures/lights.
