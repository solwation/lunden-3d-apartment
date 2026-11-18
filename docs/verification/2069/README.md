# Parquet grain and matt varnish — #2069

Baseline: `8111f1e3`. Candidate production source hashes are in `source.json`; the conductor
publishes the local commit and records its delivered revision on the issue.

Both paired sheets show **before at left, after at right**. Top: near view of the existing
production `plate` floor builder and its actual World floor material. Bottom: normal eye-height
view of the actual production `buildLevel` output for L1007 / standard L1004, with identical
plan, camera, lights, quality and tone mapping. Fine curved/forked fibres replace the straight
broad stripes; the general colour, plank/stave sizes and matte character stay.

- `chalk-comparison.jpg`: Ek Chalk one-stave floor.
- `standard-comparison.jpg`: neutral standard three-stave floor.

The harness only appends exports for existing private `M`, `SM`, `buildLevel` and `plate` through
Playwright request routing. It does not replace their code or build an illustrative alternative.
The standard fixture uses the same shared plan / standard flag as L1004. L1201 shares the same
`SM.floor` material; its own architecture was not rebuilt for this material-only change.
The fixture includes the production fixed level/fittings but omits movable furniture and the
rest of the World. This is component/consumer evidence, not a full-game/device acceptance run.

## Checks

1. `node --test tools/parquettest.mjs`: **3/3 pass**. Exact original physical repeat, pixel
   dimensions, plank/stave sizes and stagger; finite deterministic tints; same tint/seed on the
   two cut pieces at the repeating long edge; finite bounded smoothly curved fibre paths.
2. `tools/browsertest.sh node tools/parquet2069browser.cjs http://localhost:8181 docs/verification/2069`:
   **pass**, Chromium/SwiftShader, 900×600 render canvas, DPR1, MSAA, NeutralToneMapping. Both
   finishes at near and room views, before/after, zero page/console/shader errors. Same maps'
   metre repeats/dimensions and roughness scalars, opaque colour maps, cached texture-pair
   identity, and restrained roughness-map green range **234–255 / 236–255**. The first candidate's
   overlapping gloss strokes exceeded the intended matte range; its stroke amplitude was
   reduced and the corrected capture/check rerun. No failing run is presented as passed.
3. Diff/scope and image inspection: no geometry/collision changes, no extra draw/pass/light;
   the images retain original one-/three-stave layouts and base palettes. No unrelated browser
   or whole-world performance suite was run. Byte arithmetic in the fixture metadata was
   corrected to sum actual mip dimensions; unchanged image/geometry evidence was reused.

Frozen results: `browser.json`. Actual production draw/triangle counts are identical before/after:

| View | Draws | Drawn triangles | Total constructed geometry triangles |
| --- | ---: | ---: | ---: |
| Ek Chalk near | 1 | 2 | 2 |
| Ek Chalk room | 357 | 43416 | 110802 |
| Standard near | 1 | 2 | 2 |
| Standard room | 186 | 28592 | 30722 |

These are the scoped fixture counts, not a total game render budget. The original floor
roughness scalars remain 0.7 / 0.75. The new grayscale maps modulate them slightly; their colour
space is non-colour data. The Standard material gains a roughness-map texture sample and UV
varying. There is no extra geometry, CPU frame update, image download, light, pass or draw.

## Texture cost

Runtime canvas dimensions and exact nominal uncompressed RGBA8 mip-chain accounting:

| Finish / map | Dimensions | Base-level bytes | All mip-level bytes |
| --- | --- | ---: | ---: |
| Ek Chalk colour, unchanged | 324×1200 | 1555200 | 2073140 |
| Ek Chalk roughness, new | 162×600 | 388800 | 517940 |
| Standard colour, unchanged | 360×1320 | 1900800 | 2534032 |
| Standard roughness, new | 180×660 | 475200 | 633232 |

Both shared finishes together: **+864000 base-level bytes**; **+1151172 nominal GPU mip bytes**
(about 1.10 MiB). Base canvases remain CPU-backed; driver allocations, object overhead and
possible driver copies are not measurable from this accounting and are excluded. Browser peak
for the corrected fixture was 642 MiB. No frame-rate/GPU-speed improvement or physical-device
result is claimed. The same cached texture pair is reused by each authored finish.

## Reproduction and scope

Serve this checkout on port8181; Node needs the existing Three0.170.0 dependency, and Playwright
is supplied through `PLAYWRIGHT_MODULE`. The before source is read from `git show 8111f1e3:src/world.js`.

```sh
node --test tools/parquettest.mjs
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  tools/browsertest.sh node tools/parquet2069browser.cjs http://localhost:8181 docs/verification/2069
```

The public downstream can receive the neutral recipe and its matching floor-material wiring
selectively, preserving its own finishes and architecture. No furniture, gameplay, personal
image or Cloudflare integration is part of this change. The conductor owns that separate issue
and publication, image comment, deployment verification and closure.
