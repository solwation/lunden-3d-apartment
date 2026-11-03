# Nordic Wellness green hall (#1824; composed with #1823)

Baseline is `042cf8f4c52447a70be4e4b5f8fb200aaf83c807` (including #1822's brick front). The saved before module/config bytes were supplied by a local request interceptor. After views run the actual app with this issue's hall/body/parking changes plus #1823's supplied glass block/config; they are explicitly combined evidence, not a claim that the glass was implemented in #1824. `src/sitebackdrop.js` supplies actual terrain to the hall builder. All new dimensions, panel tints and subdivision remain photo-read guesses.

The green volume starts 12 m behind the road front. Three shallow panel bands have staggered seams over a grey plinth; the side has five dark panes and a loading opening. The old lower rear corner is removed and the full footprint keeps the same high flat roof; solar rows are retained. The rear has simple asphalt, six marked bays, small planting islands and a narrow steel stair. Cars are omitted; no additional vehicle setup or draws are added. A/B/C/L house builders and variants are not affected.

## Images

- `before-side.png` / `after-side.png`: full side volume, green panel bands, grey plinth, middle-band windows and loading opening; the entrance at left is #1823. Camera XYZ `[-129.26,10,-320.46]`, looking at `[-166.01,12,-325.06]`.
- `before-rear.png` / `after-rear.png`: rear corner, uniform-height green body, asphalt/planting and thin external steel stair. Camera `[-133.83,12,-389.97]`, looking at `[-178.22,11,-364.37]`.
- `after-parking.png`: closer view of the asphalt/stall paint. Camera `[-160.064,11,-383.85]`, looking at `[-174.88,5.8,-372.96]`.

Chromium 1248 / SwiftShader, 1280×800, June 13:00 clear/frozen, full-quality screenshot pass; UI overlays hidden. No physical-device performance claim.

## Checks and limits

`tools/nordicgymtest.mjs` runs against the exact composed module/config, optionally via `NORDIC_GYM_MODULE` / `NORDIC_GYM_CONFIG` and the pinned `THREE_DIR`. The retained `combined-geometry.txt` passes all 26 exposed front/hall panes, seven unoccluded radial wall washes, exposed treads on all four entrance flights, both globes, the road door, unchanged eave/roofY samples and the existing batch lists. A curved-terrain regression checks all seven paint strips above the actual parking deck. Native geometry contribution: 2,853 triangles; total recursive campus **87,712 < 87,800**, including the unchanged clock. Final flat-ground position/normal/colour hash: `b34f6327b91af0c46b28a9f90a7e44a6a59eb93bd4b450d4810e73e6e31f66a8`.

| Matched view/property | Before | After |
| --- | ---: | ---: |
| Side rendered calls | 23 | 23 |
| Rear rendered calls | 40 | 40 |
| Direct east-campus mesh batches | 11 | 11 |
| Root lights | 9 | 9 |
| Direct mesh triangles | 86,729 | 87,568 |

No added material/texture/light/batch. Final captures report no page errors. Syntax checks and `git diff --check` pass.

The single full `eastbackdroptest` run was shared with #1823, not duplicated: **51 PASS / one pre-existing FAIL**, solely the old expected desktop batch count tracked in #1833. All actual windows (1,019/1,019), outline, height/roof, source and geometry-budget checks pass. Its measured 87,703 precedes the final nine paint triangles. Raw output is `combined-eastbackdroptest.txt`; source snapshot was `state/1823-combined`. Side and #1823 glass captures reuse this source-bound proof because the later correction only changes rear parking paint, not those visible volumes. The rear and parking images use the final split paint geometry.

`offset-equivalence.txt` records that moving numeric offsets into `model.hall` initially preserved all geometry bytes relative to the shared snapshot. The final paint correction intentionally changes parking geometry: independent terrain samples had buried some paint under the corner-interpolated asphalt, so the strips now follow and split at that deck's triangle crease (+9 triangles). The updated curved-terrain regression and final rear capture cover that correction. Old failed paint attempts are not presented as final results.

Source module/config and runtime-input hashes are recorded in `source.json`; the conductor owns final integration, image publication before closure and the public port in kvarteret-lunden #240. Integration order is the hall body/corner cut first, then the shared glass block. The resulting final module/config must match the combined contract before publication.

Integration review: #1823, #1824 and #1825 are delivered together. After conflict resolution the scoped native geometry check passes all 11 checks with the exact final geometry SHA `b34f6327b91af0c46b28a9f90a7e44a6a59eb93bd4b450d4810e73e6e31f66a8`: 87,712 campus triangles plus the separately verified two-triangle sign = 87,714. The hall/glass/front model values match the inspected frozen snapshot; the isolated sign module is byte-identical to its tested commit. Only this integration-sensitive component check and syntax/diff checks were repeated; accepted browser captures were reused with their documented source scopes. See [integration geometry](../1824/integration-geometry.txt).
