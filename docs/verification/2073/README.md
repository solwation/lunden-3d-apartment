# Cupped lily leaves and layered petals — #2073

Baseline: `7b5f0f17`. Candidate source SHA-256 fingerprints are in `browser.json`.
Only `src/riverfloraview.js` is routed to the pinned baseline during the before phase;
all plan/terrain/configuration inputs and the scene setup are identical. The new shape
constant is unused by the old recipe. This is the real `RiverFlora` consumer with the
production `swimBedY` and `swimWater`, not a separately drawn illustrative flower.

## Result and images

The existing round notched leaves have a low cupped rim and thin radial veins. The
old one-triangle petal spikes become broad curved, overlapping surfaces in the same
eight + six rings, around the unchanged yellow centre. All values are artistic
assumptions; no new species or surveyed Höje å flora is asserted.

The three JPG sheets show **before left, after right**:

- `near.jpg`: the same actual flower, adjacent leaf and other cluster leaves.
- `waterlevel.jpg`: from just above the water, showing the low leaf profile and petal cup.
- `above.jpg`: top view of the same notch, veins and overlapping petal rings.

Each native capture is 1120 × 800 at DPR 1 and the sheet uses 700 × 500 for each view,
so the original 1.4 aspect ratio is preserved. All three final sheets were opened.
The first contact-sheet setup had an incorrect aspect ratio; only this scoped capture
was refreshed after correcting its composer. The geometry was not changed for it.

## Checks

1. `node --test tools/lilysurfacetest.mjs src/riverflora.test.mjs`: **9/9 pass**.
   The six existing layout/season tests remain green. New cases check finite unit
   normals/nondegenerate triangles, radius and notch, a low rim and waterline centre,
   the original stem depth, petal width/cup and original radius/height envelope,
   material sharing, seasons, contact scaling and no stationary instance rewrite.
2. One scoped browser test, Chromium / SwiftShader, MSAA, NeutralToneMapping, identical
   two-light fixture and opaque water plane before/after. Actual terrain/open-water
   placement totals are **475 stones, 432 weeds, 92 leaves, 28 flowers**; SHA-256 of
   every item's station, complete instance matrix and instance colour is identical.
   The selected window draws **20 leaves and six flowers**. The pad centre keeps
   the existing **12 mm** water-layer lift, the maximum new rim rise over that centre
   is **8.01 mm** across the real river's actual depth-scaled matrices. No high dome.

   Four batches remain; leaf/flower material identity is shared, no map or shadow is
   introduced. Above water July uses two flora draws, January zero, May one, underwater
   July four; hidden or away uses zero. A stationary update does not change the instance
   buffer version. Zero page/console/shader errors.

## Geometry and rendering cost

All shapes stay shared once per batch, with the same instance capacities and position/
normal/vertex-colour attributes. The original stems, stones, weed and material recipes
are retained. No UV, texture, shader branch, light, pass or per-frame upload is added.

| Shared recipe | Triangles before → after | Raw buffer bytes before → after |
| --- | --- | --- |
| Stone | 80 → 80 | 8,640 → 8,640 |
| Weed | 56 → 56 | 6,048 → 6,048 |
| Leaf + original stem | 18 → 136 | 1,944 → 14,688 |
| Flower + original heart | 50 → 204 | 5,400 → 22,032 |
| All four retained geometries | — | 22,032 → 51,408 |

The extra shared CPU vertex data is **29,376 B** (about 28.7 KiB); visible GPU geometry
uploads grow by the corresponding uncompressed vertex bytes, excluding driver overhead.
Matrices/instance colours/capacities are unchanged. In all three frozen views, submitted
triangles rise **662 → 3,946**, while calls stay **3 → 3** including the fixture's one
water-plane draw (**2 → 2 flora draws**), and textures stay **0 → 0**. This is a deliberate
bounded geometry/detail tradeoff, not a speed or memory reduction. The final wrapper
reported about 467 MiB peak process-scope memory; that is not the scene's native GPU memory.

## Scope and limits

Layout, size ranges, water/bed contact, leaf/flower matrices, all seasonal rules, refill
threshold and swimming/gameplay are untouched. The browser supplies the actual production
flora geometry and real placement consumers, but its plain water plane/two-light component
scene excludes the full world, banks, weather and swimming route. It is not whole-game,
frame-rate or physical-device evidence. No separate large world or older browser suite ran.

Neutral public transfer is applicable and tracked separately in
[kvarteret-lunden#295](https://github.com/solwation/kvarteret-lunden/issues/295). It needs only
the neutral shape recipe and constants, not personal content, gameplay or services.

## Reproduction

```sh
python3 -m http.server 8185
node --test tools/lilysurfacetest.mjs src/riverflora.test.mjs
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  BROWSERTEST_TIMEOUT=5m tools/browsertest.sh node tools/lilysurface2073browser.cjs \
  http://localhost:8185 docs/verification/2073
```

The browser script routes the pinned Three.js URL to the existing local three-0.170.0
cache; product source comes from the owned checkout. The conductor owns publishing the
revision-pinned result images, actual main delivery, public follow-up and closure.
