# Painted walls and ceilings (#2205)

Base remote main at checkout creation: `f472b8e187dc8ab8501cb4e5301089471393c276` (includes the already delivered #2197 sun bounce).

One shared 128×128 linear RGBA8 texture (R height, G roughness deviation) supplies very shallow roller grain on existing painted walls and coarser spray texture on ceilings. `PAINT_SURFACE` values are artistic guesses, not surveyed Peab finish data: wall height0.24mm and repeat80mm, ceiling0.45mm and150mm. Existing colours, base roughness, geometry, collision, tile, parquet and screen-wall materials stay. `World.M.wall/ceiling` also serve the standard visitable shell. The kitchen hood gypsum uses a separate painted material instead of adding texture to the old generic white material (bottle caps, cabinet interiors and a fitting stay smooth). That split can add one material batch at the hood; no new geometric part is added.

World-position projection requires no UV/position edits. A fragment-only wrapper preserves earlier compile callbacks/cache keys and is registered with vertexcompile; it changes the Standard normal and roughness only, not shadows/vertices. One texture sample only within4.5m (smooth fade1.5–4.5m); quality0 disables sampling/detail, other levels and lowMemory use the same tiny shared map. UV gradients are computed before branching, explicit texture gradients keep mip selection defined at the fade boundary. No light, render pass or per-frame texture generation/upload. Base texels65536bytes, nominal complete mip chain87380bytes, excluding driver/CPU overhead. Shader variants/fragment work are a cost; no FPS claim.

## Scoped checks

- `node --test tools/paintsurfacetest.mjs`:3/3, deterministic packed map/shared texture/mean roughness, monotonically fading detail, preserved Standard callback/colour/roughness/native-vertex contract and cloning.
- Existing `tools/tilesurfacetest.mjs` and `tools/screenwallsurfacetest.mjs`:6/6; `tools/parquettest.mjs`:3/3. Syntax and diff whitespace checks passed. Those materials are not patched by the change.
- Own actual-app Chromium/SwiftShader route, port8425, native960×640 DPR1, antialiasing/full quality3, clear June13:00 window light and22:00 evening lamp view. The production animation loop is paused after startup; `step(0)` settles the view's day/lights, then the same warmed static camera/scene is rendered with only `paintDetail` off/on. Draws/triangles/programs equal in each pair: window186/510467/218; lamp358/1002903/255. Four painted material instances are found in the real scene. These off/on counts establish no new dynamic pass/draw from enabling the shader, not an old-source count for the gypsum material split. Quality0 off,3 restored, far off/near on and65536base texture bytes pass; no page/shader errors. See `browser.json`.

The first fixture used a lazy test page and let animation/culling continue between captures, so its640/187 draw comparison was invalid. It is not accepted performance evidence. The corrected run uses full normal rendering and pauses the animation loop before matched captures. Source files were unchanged throughout the accepted run. No broad profile or unrelated browser suite was run; verification was reassessed near10minutes, then stopped when the planned checks passed.

## Images and limits

`window.png` shows fine, restrained near-wall structure in window light; `lamp.png` shows coarser ceiling structure in a pendant's grazing glow. Matching effect-off images live under `before/` until the completion comment is posted with commit-pinned URLs, then are removed at closure. All four native captures were opened and inspected; texture stays subtle rather than changing the wall's paint colour. June22:00 is twilight (`daylight≈0.108`), not a black-night assertion. `source.json` binds the tested source bytes.

This verifies the real application consumers/rendering and quality branch in Chromium/SwiftShader, not physical phone/Iris640/FPS performance. No house geometry/layout changed. Neutral wall/ceiling material code can transfer to the public app's shared painted shells, under its own issue and consumers; no personal furnishings, characters, gameplay or Cloudflare is part of that transfer.

One conductor performed implementation and subsequent review roles sequentially while other workers ran independent issues. Approximate phases:3min read/plan,5min implementation/component checks,9min browser/setup correction/images,2min review/docs.

Published implementation: `2e3e2ec5b63a295d26565fe84695038475eecbc7`. [Deploy the shared-world Worker: success](https://github.com/solwation/lunden-3d-apartment/actions/runs/44757526137) · [Deploy to GitHub Pages: success](https://github.com/solwation/lunden-3d-apartment/actions/runs/44757526050).

[Pinned embedded before/after images and completion](https://github.com/solwation/lunden-3d-apartment/issues/2205#issuecomment-7042593845). Neutral public port: https://github.com/solwation/kvarteret-lunden/issues/346. Before-images removed from current main after publication; historical links remain.
