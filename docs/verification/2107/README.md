# #2107 — avatar garments: seams, ribs, hems, waistband and pockets

Before = baseline `9a8ee18` (`src/avatar.js`, `src/avatarcloth.js` and `src/config.js` served from that revision); after = the #2107
working tree on top of it. Both passes use the same seeded `Math.random`. Component page `tools/avatarseam2107.html` with real `Avatar`
figures: T-shirt + jeans, sweater + jeans, hoodie + wide trousers, vest + shorts; SwiftShader, 960 × 600 native tiles at half size in the
sheets (before row above, after row below).

Only the sheets, the after rest views and the before rest views (`before/`) are kept; the single close-up tiles come back with the harness.

| Sheet | Shows |
|---|---|
| [fore-efter-rest.png](fore-efter-rest.png) | all four front / back / side at rest: the garments keep their colours and cut; at this distance the details only shade faintly (prefiltered, no shimmer) |
| [fore-efter-walk.png](fore-efter-walk.png) | the same mid-stride: the details ride with skinning (bind-pose coordinates) |
| [fore-efter-tee-jeans.png](fore-efter-tee-jeans.png) | T-shirt: ribbed crew collar, set-in armhole seam, twin-stitched hem; jeans: waistband under the hem, curved front pockets, back yoke, centre-back seam and patch pockets |
| [fore-efter-sweater-jeans.png](fore-efter-sweater-jeans.png) | sweater: wider ribbed collar, ribbed hem band and cuffs |
| [fore-efter-hoodie-wide.png](fore-efter-hoodie-wide.png) | hoodie: ribbed hem band and cuffs (the hood covers the collar, the long hem the waistband); wide trousers: back pockets, no yoke |
| [fore-efter-vest-shorts.png](fore-efter-vest-shorts.png) | vest: bound neck and armholes; shorts: waistband, pockets and a stitched leg hem |

Checks: `node --test tools/avatarseamtest.mjs` (5 tests: garment kinds and edges from the look, seams on their landmarks and none on the
plain panels, ribs / hems / bindings per garment, deterministic and mirrored in x, uniforms and the splice into the real physical shader)
plus the existing cloth and hand node tests; `tools/avatarseam2107browser.cjs`: zero page/shader errors in both passes, identical draw
calls, triangles and textures per view (`seams.json`). Cost: no mesh, texture, attribute, draw call or network field; CPU only at look
set-up. SwiftShader frame time of the waist close-up / group view: 1456 / 1092 ms before against 1917 / 1482 ms after (earlier runs
729–1347 before, 1698–1714 after, on a heavily loaded shared host); a matched in-page A/B (`window.__ab`, seams on vs `uSeam.w = 0`,
interleaved) gave 1961 vs 2119 ms, i.e. the detail itself is within noise, and the larger shader may cost some SwiftShader time; no
Surface measurement. Lines bail out early away from their landmark (most cloth pixels add a few comparisons and one or two `atan`).

Limits: the landmarks are the standard skeleton's bind pose (as #2034's folds); the armhole oval approximates #2001's 12-vertex hole, so
the vest's binding is faint in places; the waistband shows only under a T-shirt / sweater / vest (the hoodie's long hem covers it);
the fine stitches and ribs average out beyond ~1 m, leaving only a soft shade. The mirror preview (#1994) and avatar LOD (#1966) use the
same material (not captured separately); the far figure (`ghostfar.js`) has none of it.

Publicering: Pages/Worker success på `568098a`; före-bilder borttagna vid stängning och visas från den commiten.
