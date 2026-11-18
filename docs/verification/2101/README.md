# #2101 Site wind sway: verification

Trees, shrubs, courtyard perennials and river reeds/tussocks sway in a vertex shader (`src/sitewind.js`) with power from the
weather. Power 0 gives exactly the old geometry, so `before/` shows the still frames (`&wind=0`) of the same camera.

## Checks

1. `node --test tools/sitewindtest.mjs`: 7/7 pass. Covers weather power ordering (clear < overcast < rain < storm), a
   deterministic and clamped JS offset (calm peak on a tree top 0.005–0.06 m, storm > 0.15 m, ≤ `maxDisplacement`), identical
   sway GLSL and the same uniform objects in colour and shadow-depth materials (both LOD levels and the courtyard pair), unique
   program keys, the bounded-vertex audit (`vertexCompileSlack`), the LOD contract (far copies carry the near anchors, culling
   spheres widen) and zero sway at zero power. Also passing: `lodtest`, `entrancefoliagetest`, `lampwash2090test`,
   `siteinstancebatchtest`, `tightfrustumtest`.
2. Browser (`tools/sitewind2101browser.cjs`, SwiftShader, 1280 × 800, July 13:00, clear): one page, three views, still / calm
   breeze (power 0.12) / windy (power 1) at wind times 0.8 s and 2.3 s. No page errors or shader errors. The only console errors
   were network errors (the CDN tunnel and a 404). `browser.json` holds the raw numbers.

| View | Background noise (still 0.8 s vs 2.3 s) | Calm between times | Windy between times | Still vs windy |
|---|---|---|---|---|
| Park trees | 0.001 / 0 % px | 1.19 / 2.1 % | 5.92 / 12.6 % | 4.51 / 9.6 % |
| River reeds | 0.34 / 0.7 % | 1.03 / 2.3 % | 4.18 / 10.1 % | 3.61 / 8.8 % |
| Courtyard shrubs | 0.78 / 0.03 % | 1.05 / 3.2 % | 3.44 / 11.5 % | 4.18 / 11.5 % |

(Mean absolute RGB difference / share of pixels changed by more than 24.) The calm breeze is barely visible and a storm is clear.
The motion map `park-motion-still-vs-windy.jpg` shows the crowns, shrubs and reeds moving together with the leaf shadows on the
grass, which means the depth materials sway too. Trunks, paths and sky stay still.

## Images

- `park-windy.jpg`, `park-calm.jpg`, `before/park-still.jpg`: river-park trees near the bridge specimens.
- `reeds-windy.jpg`, `before/reeds-still.jpg`: reeds and bank shrubs at the water's edge.
- `courtyard-windy.jpg`, `before/courtyard-still.jpg`: a courtyard perennial (the camera stands by the pergola frame).
- `park-motion-still-vs-windy.jpg`: per-pixel difference between still and windy.

## Cost

Draw calls and triangles are the same for still and windy at the same camera. The park has 47 calls and 365,836 triangles in
both. A one-call change in the reed view and 22 calls in the courtyard view follow the frame sequence, not the wind power. That
part of the courtyard scene animates by itself (noise 0.78). There are no new textures, meshes, lights or passes. Per frame the
CPU sets three uniforms. On the GPU each lobe/reed vertex runs about 4 sines, a mat3 inverse and a clamp, with no flutter sines
on phones. There are 5 new program variants (lobe near/far LOD, lobe depth, courtyard wind leaf, reed bend). A 4-byte
`siteWindBend` attribute is added per reed/tussock vertex.

## Limits

Trunks, wall vines, the far southern woodland, clipped hedges and potted plants do not move. Potted plants keep the
window-driven wind from #518. Weather has no real wind data, so power is derived from cloud, rain and storm (*guess*). This
was not tested on a physical Iris 640 or phone.
