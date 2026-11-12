# Complete Santa collection portrait — #1930

The collection now requests an explicit `santaPortrait()` sitting model. It uses
the existing LANDSKRONA seat height/depth frame and the existing loaded sitting
legs or `santaLegGeometry` fallback; no character, sofa or sleep design changes.
The placeholder leg geometry, unused sleeping clone and unused sleep-text
texture/material are deliberately disposed. The on-demand portrait owns copies
of GLB arm/glass geometry and materials, so disposing it cannot invalidate the
loaded source or a live Santa.

Baseline `5469140e4b97e3cbc0570782bed99b2f3c373f18`. The actual `Santa` controller
class, surface recipes, sofa/rest implementation, GLB, thumbnail provider and
collection/storage implementation are byte-identical: [identity proof](unchanged.json).
The default seat Z value comes from the existing furniture/export frame, not a
new visual guess. Only Santa's thumbnail version changes, 1 → 2; ID
`figure:santa`, number 63, discoveries and photographs remain.

| Actual production consumer | Before | Result |
| --- | --- | --- |
| Loaded 96 and 320 px collection images | [Before](before/loaded-cards.png) | [After](loaded-cards.png) |
| 404 fallback, both image sizes | [Before](before/fallback-cards.png) | [After](fallback-cards.png) |
| Actual loaded Santa in furniture.sofa, after rendering/disposal of portraits | [Before](before/loaded-sofa.png) | [After](loaded-sofa.png) |
| Actual fallback Santa, same sofa fixture | [Before](before/fallback-sofa.png) | [After](fallback-sofa.png) |

The implementer opened the loaded/fallback cards, loaded result sofa and its
baseline. The loaded baseline also exposes the resource-ownership defect: after
one card was disposed, later cards/the live sofa Santa could lose arms/glass.
The collection-specific copies fix that side effect while leaving the native
Santa controller/pose code unchanged. The final pictures show the complete
seated figure with feet and complete arms; no floating upper-body crop remains.
The integrator opened and accepted the loaded/fallback cards and loaded sofa comparison before handoff.

## Two scoped verification groups

1. **Actual images and old cache.** The real `BestiaryImages`, `BestiaryCollection`
   and IndexedDB `withStore` paths run in isolated browser contexts. First the
   original version-1 96/320 images populate the real thumbnail store. The final
   version-2 provider then renders both new images, retaining the two old keys;
   repeat requests hit memory and a new provider hits persisted data with zero
   renders. Discovery localStorage and an existing photo-store row remain exact,
   including the found state. Actual legs-hidden comparison proves 548 changed
   pixels at 96 and 6,117 at 320 in both loaded/fallback images. Full model,
   geometry, camera and projection data are finite. Both image sizes are nonempty.
2. **Pose, native consumer and resource ownership.** Actual Santa,
   `furniture.sofa` and `restTarget` remain sitting with soles at approximately
   Y = 0 (error 1.1e-8 m) and visible intended pixels. The portrait also rests at
   the configured floor plane. Loaded portrait geometry/materials do not alias
   the source GLB. Across three constructed portraits (two cached images and one
   diagnostic model), three selected sitting clones and three unused sleeping
   clones are disposed deliberately. Source GLB dispose events drop from
   12 geometry / 9 material events to **zero / zero**. The loaded sofa keeps
   its arms and glass afterward. The existing three Santa state/loaded/fallback
   tests pass, covering native sitting/sleeping/away behaviour without rewriting
   it. No full apartment/network suite or new animation timing is claimed.

[Browser data and source hashes](browser.json), [three existing Santa tests](santa-tests.txt).
The final bounded browser command exits 0 with no page errors. A separate
loaded/fallback console smoke also exits 0 with no new console errors
([log](console-check.txt); intentional missing-asset 404 excluded). An initial fixture
assertion expected four disposed sitting clones; the actual scenario constructs
three portraits, so the test was corrected to `image renders + one diagnostic`.
The implementation was unchanged and the bounded capture then passed.

## Local costs

| Actual offscreen portrait | Baseline | Result |
| --- | ---: | ---: |
| Loaded GLB submission, either size | 5 calls / 4,220 triangles | 6 / 4,932 |
| 404 fallback submission, either size | 6 calls / 4,244 triangles | 7 / 4,956 |
| Leg triangles | 0 | 712, existing seated recipe |
| Unique per-portrait geometry views | 452,520 B | 529,416 B |

The extra draw and 76,896 B are the missing existing legs. Raw view totals are
per portrait, including the invisible pick geometry, not a full retained heap/GPU
measurement. Loaded arm/glass copies additionally make previously shared views
independently owned; the per-object view count alone does not describe total
simultaneous source/World/portrait memory. Models are disposed after each
on-demand image; subsequent cache hits draw nothing. There is no new steady
World model, texture, light or per-frame work, and the Santa GLB is unchanged.

The actual sofa Santa remains 6 calls / 4,932 triangles loaded and 7 / 4,956
fallback, exactly as before. The loaded/fallback glass materials already differ
in transparent pass/triangle cost; this fix does not change them. Pixel counts
in the controlled sofa view are 34,934 → 37,961 loaded (the restored arms/glass)
and 38,014 unchanged fallback. No hardware FPS or startup-speed claim is made.

Reproduce with an owned server on 8201:

```sh
node --test tools/santatest.mjs
PLAYWRIGHT_MODULE=/path/to/playwright BROWSERTEST_TIMEOUT=2m tools/browsertest.sh node tools/capture-santa-portrait.cjs /tmp/santa-portrait
```

`SANTA_ORIGIN` selects another owned server. The browser test uses the shared
lock and two isolated storage contexts, each reusing its version-1 data for the
version-2 check. Source hash data binds the actual final source/fixture files;
source and old/new model code are routed at the stated baseline for comparison.
Root alone integrates, publishes the triggered deployment checks and embeds
pinned result images before closure. Before images are pruned after pinned
publication; results have the standard 30-day lifetime and text/JSON remain.
This original-only Christmas character has no public downstream transfer.


Root reviewed the combined product/factory/config/fixture/evidence diff and opened actual loaded/fallback96/320cards and loaded sofa before/after. Rebase preserves every executed model/fixture/GLB source and exact LANDSKRONA configuration; [integration mapping](integration.json) binds delivery and changelog1486 after latest main fetch. Existing two scoped green groups are reused without a broad rerun.
