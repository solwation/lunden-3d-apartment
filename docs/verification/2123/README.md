# #2123 — snow caps on narrow upward faces

Source: `src/snowcap.js` (chained in `src/exterior.js`, `src/surroundings.js`, `src/courtyard.js`, `src/busstop.js`), tunables
`SNOW_CAP` in `src/config.js` (*guess*). Base revision for "before": `5c578f1f`.

## Checks

1. `node --test tools/snowcaptest.mjs` — 5/5: only `SEASON.snowMonths` switch the shared uniform (January 1, July 0 via
   `applySeason`); only upward faces (full on flat tops, < half at 52°, none past ~57°, none on walls/soffits), deterministic,
   white; chain after railMetal + benchWood (key `rail-metal-2089|bench-wood-2098|snowcap2123`, one copy, snow after their colour/roughness
   steps, vertex shader unchanged, audited fragment-only) and before moss is overridden (moss earlier in the shader:
   white on overlap); phones: plain material untouched, rails/benches capped; wired into Hus L, A/B/C, box walls, courtyard, bus stop.
   `tools/shademosstest.mjs`, `railmetaltest.mjs`, `benchwoodtest.mjs` still pass (shademoss's source check reads through the `snowCap(` wrapper).
2. Browser (`tools/snowcap2123browser.cjs`, SwiftShader, 15 January / 15 July 13:00, clear): before/after January and after
   July. Probe (after, January): 28 capped meshes, `uSnowCap` = 1, no page or shader errors, keys e.g.
   `…|snowcap2123|shademoss2122-bump|lampwashV|lampwash` (lamp wash chains after). Hus A view: 196 draw calls, 98 textures,
   117 programs. The full three-phase run exceeded a 15-minute wrapper timeout after the July shots of Hus L/A/B/C (no JSON
   written); images below are from that run, numbers from the probe.

## Images (January after; `before/` = same view at the base revision)

- `husL-gata-januari.jpg` — Hus L street façade from above: loftgång rail, sill flashings (light grey already: subtle).
- `husL-tak-januari.jpg` — Hus L roof edge: capping ring/copings, terrace parapet.
- `husA-januari.jpg`, `husB-januari.jpg`, `husC-januari.jpg` — the Å-husen: entrance canopies and parapet copings turn white,
  the bench by Hus A gets snow on its slats; walls and painted window sills unchanged.
- `gard-bankar-januari.jpg` — courtyard benches, sandpit edging and bollard tops capped.
- `husL-tak-juli.jpg`, `husA-juli.jpg`, `husC-juli.jpg` — July: no snow, original colours.

Houses: A, B, C and L checked (shared materials: Å-hus brick/render/rails/sheet metal; Hus L brick/render/pilasters/capping-flashing
batch/rails). Limits: window sills of the Å-husen are painted in the façade canvas (no upward face) and get none; the Å-hus
frames already render white; roofs and ground keep `registerSnow`; glass is not capped; phones skip plain materials.
