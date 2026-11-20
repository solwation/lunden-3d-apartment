# #2219 rendersurfacetest vs snowCap wrapper

Cause: #2123 (commit 0b2eb36b, "thin snow cap on narrow upward faces") wrapped the Hus L render material and the
Å-husen `white` material in `snowCap(...)` (and #2095/#2175 in `wetSurface(...)`). `tools/rendersurfacetest.mjs`
("consumers" test) froze the exact source text `add(renders.map(renderUV), renderMaterial({...}))` and
`const white = renderMaterial({...})`, so it failed.

Change: both anchors are now regexes that require the same intent (UVs baked via `renderUV` before merging, the render
material with its colour/roughness) but tolerate any material wrapper around `renderMaterial(...)`. All other
assertions (sill/splash strips, brick façades without strips, frames plain, builders unchanged) are untouched.

Before: `node tools/rendersurfacetest.mjs` -> tests 6, pass 5, fail 1 (consumers).
After:  `node tools/rendersurfacetest.mjs` -> tests 6, pass 6, fail 0.
Related: snowcaptest.mjs 5/5, snowcovertest.mjs and wetsurfacetest.mjs 6/6 pass (unchanged).
