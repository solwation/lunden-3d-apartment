# Measurable visited-flat mid surfaces — #1999

Verified 2026-11-16 from baseline `854f7cb2`. The production change is only the raycast assignment in `VisitUnit.buildMid`: visible merged Mesh solids retain native Three Mesh.raycast; merged LineSegments remain render-only. No geometry, material, cull range, door threshold, target registration or render flag changes.

## Actual reproduction and checks

1. `node --test tools/visitmeasuretest.mjs` against the unmodified production VisitUnit: **2 failures / 1 pass**. Actual Measure.hit returned the back-wall front z=4.9 instead of the visible fitting front z=1.5 while the original fitting was hidden; the native-raycast identity assertion also failed. The leaf-threshold contract already passed. [Raw before TAP](before-node.txt).
2. The same command after the fix: **3/3 pass**, 0.24 s. It checks full/mid/shell/away, moving a hidden original closer without changing the visible hit, native solid raycast and disabled lines, old suppression as a negative control, and unchanged open-leaf thresholds/topology. [Raw final TAP](node-tests.txt).
3. `PLAYWRIGHT_MODULE=/home/devcontainers/kvarteret-lunden/node_modules/playwright tools/browsertest.sh node tools/visitmeasurebrowser.cjs http://127.0.0.1:8799 docs/verification/1999`: **6/6 pass**, no page/GLSL errors. [Log](browser.txt), [raw checks, point coordinates and SHA-256 of exact product/fixture sources](result.json).

The browser uses actual production VisitUnit/buildMid/cull and Measure.hit/press. Its surfaces are an explicitly synthetic solid fitting and back wall, with a nearer render-only outline, built by `tools/visitmeasurefixture.mjs`. There is no surrounding World and no claimed reproduction in a furnished apartment or native keyboard/touch route. In the same bounded browser turn the old blanket raycast suppression is applied in memory as a negative control, then the unchanged native method restored. The green Node regression also ran against the actual unmodified source before the production fix.

At 14 m from the unit footprint, the old control hits (0,1.4,4.9), and the fix hits (0,1.4,1.5). The real Measure.press markers move from the hidden back-wall intersection to the visible fitting front. Two rays intended for x=−0.5 / +0.5 on that front incorrectly measured 1.22 m on the back wall; they now measure exactly 1.00 m. Original detail parents are false in both states. A separately rendered side view makes the marker placement visible; measurement rays use the straight-on production camera at 14 m. The side-view camera does not choose the measurement target.

Full at4 m selects the original fitting front, mid at14 m selects the merged front, shell at30 m selects the wall, and away yields no hit. Changing the hidden original's position does not affect the mid hit. LineSegments never substitute for a surface. An explicit fixture leaf-state change retains the existing12 m full-detail guard and restores mid on closing; it does not claim a new native door-animation test.

Before/after submissions are exactly **7 calls / 362 triangles** in the same component scene, including floor, two Measure markers and measurement line. Geometry/topology is unchanged. These counts establish the local render parity of a raycast-only change; they are not whole-world or physical-device performance evidence. Chromium/SwiftShader, viewport900×576, scene canvas900×500, DPR1. Wrapper slot released; this environment has no systemd user memory ceiling. Own server and browser stopped.

## Inspected images

[Before: points on the back wall](https://github.com/solwation/lunden-3d-apartment/blob/cb8d97254ef355d1fa88a6133493f622cf593e4a/docs/verification/1999/before/mid.png?raw=true), [after: points on the fitting](after-mid.png). Both images were directly inspected. The before capture was moved into `before/` for issue-image retention; the runner initially writes `before-mid.png`. The header labels the synthetic component and review-camera method explicitly.

## Shared-path / house assessment

`src/world.js` has one VisitUnit construction path (`buildVisitFlat`) used by L1004 (shared plan) and L1201 (its own plan/levels). Both run the same `buildMid` loop and inherit this Mesh/LineSegments distinction, regardless of plan offset or height. The cause has no house-specific geometry/data branch; the representative production-component check covers that shared assignment, not a new full rendering of both layouts. Hus A/B/C/L stair cores use Core/CoreHouse, not VisitUnit. They are unaffected. No layout, dimensions, opening or collision changes are made.

The public project contains the same no-op mid-raycast assignment and its independent surface-visibility filter. The relevant transfer is tracked separately as [public #289](https://github.com/solwation/kvarteret-lunden/issues/289); it waits for original publication and its own claim/verification. No public code is included here.
