# #2204 — roof condensation

Base: `6965828e` (exact source-byte hashes in [source.json](source.json)); own ext4 checkout, port 8424.
All geometry positions, cap/hood dimensions, seeded placements and collision remain unchanged; builders only return outlet metadata.
49 existing outlets were collected in the actual app, with the nearest 20 selected for both captured views.

## Checks

- `node --test tools/roofsteamtest.mjs`: **4/4 pass** ([node.txt](node.txt)): condensation temperature/wind response, rising/downwind shape, bounded nearest selection, and actual production Points consumer including translated source groups, hot/far/quality gates and phone budget.
- `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/roofsteambrowser.cjs http://localhost:8424 docs/verification/2204`: **pass**, own real app, Chromium/SwiftShader, 1280×720 DPR1, `?test=lazy&shot&freeze&time=12&month=11&day=15&weather=clear&temp=-8&quality=3`, then full rendering. Both views have 480 steam points. Warm (+8 °C), far (>125 m), quality 0 and restored-quality checks pass. The same production class's phone mode draws 6×12=72 points. No JS/shader errors.
- Syntax of affected modules and `git diff --check`: pass; scoped diff review confirms no changed building/terrain/roof/collision geometry.

[Raw browser results](browser.json). Vents: **499→500 calls**, **1,085,676→1,085,676 triangles**; campus: **43→44 calls**, **325,816→325,816 triangles**. Existing scene point objects stay; the new effect adds 480 points, one transparent point batch. Program counts 143/158 are after warm-up and unchanged between effect-off/on (the same new shader was already compiled). No extra render pass, texture, light or shadow caster.

## Views and review

[Vent hoods](vents.png), [campus chimneys](campus.png), with matching [effect-off vents](before/vents.png) and [effect-off campus](before/campus.png). These are native canvas captures, without rescaling or compositing. Inspected: faint white plumes leave actual hood/cap tops, rise, broaden and bend east/north with the pinned test wind (5,−1 m/s); solid geometry is identical.

The first attempt measured cold initial camera/shadow uploads, so its count comparison was invalid (+164). The corrected harness warms the view three times and freezes shadow updates before comparing the same stable scene. A server-lifecycle retry produced connection refusal, with no accepted result. The first corrected green January captures were visually low-contrast against snow; only the same views were retaken closer and in cold November. No product code changed during these checks.

## Scope and limits

A/B/C's seeded vent hoods use their actual drawn tops; campus/classic-school chimneys use their cap tops, and the generic flat-roof units use their top faces. Hus L has no equivalent hood in these builders, so no outlet is invented there. These are illustrative condensation/active-outlet assumptions, not verified HVAC operation. `ROOF_STEAM` values are all *guess*. The mode is faint and wind-diluted, hidden in warmth or at distance; quality 0 disables it, quality 1 halves capacity.

The phone assertion verifies the actual class's bounded phone branch in this desktop app; it is not a physical-device, full lowMemory navigation or frame-rate measurement. Surface Pro hardware was not available.

Public transfer: suitable neutral module/metadata, no avatar/personal/game/service dependency. Public `weather.js`/`windsim.js` are absent, so the separate port needs its own permitted temperature/wind provider (e.g. public season/sitewind), not the original's real-weather/service wiring. Conductor owns that port issue, publication/embedded images, release run, issue closure and checkout cleanup.

Approximate phases: planning 2 min, implementation/fast checks 3 min, browser/setup/image review 9 min (including corrected setup and view retake), total about 14 min; one implementation worker, no helpers.

Published implementation: `0638c8b1f6da01c372af58aac4178a2b5b6d0231`. [Deploy to GitHub Pages: success](https://github.com/solwation/lunden-3d-apartment/actions/runs/44756411291) · [Deploy the shared-world Worker: success](https://github.com/solwation/lunden-3d-apartment/actions/runs/44756411266).

[Pinned embedded before/after images and completion](https://github.com/solwation/lunden-3d-apartment/issues/2204#issuecomment-7042439016). Neutral public port: https://github.com/solwation/kvarteret-lunden/issues/345. Before-images removed from current main after publication; historical links remain.
