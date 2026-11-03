# Nordic Wellness: photo-based brick front (#1822)

Source baseline `f74e13d295a2837fb9ba460d165c81bd08904d8b`. Before uses exactly that revision's `src/nordicgym.js` and `src/config.js` supplied by a local request interceptor; all other source/environment is identical. Chromium 1248 / SwiftShader, June 13:00 clear/frozen, 1280×800, full quality screenshots from the real app. UI overlays hidden for image clarity. Cameras and actual source-batch counts are recorded in before.json/after.json.

The road front now has seven evenly spaced panes per floor, square panes on the two upper floors, tall warm lower panes with dark frames, a dark thin roof edge and seven small wall lamps with soft brick-colour washes. The entrance strip is reduced to 6 m so the brick front occupies most of the road face. Photo-read dimensions, tint and subdivision are guesses, not surveyed facts. Glass detail, green hall and sign remain #1823–25. Two small, photo-read low-poly trees share the glass batch, without activating the separate global foliage/trunk draws. No A/B/C/L house builders/data are changed or applicable.

Verification: all 21 actual front panes visible to outward rays beyond their frames; all seven wall washes are unoccluded, face the road and contain radial vertex-colour falloff (geometry.txt); finite native geometry in the same three facade/roof/glass lists, no new material/texture/light. `node --check src/nordicgym.js` and `git diff --check` pass. `eastbackdroptest`'s old desktop batch count is already wrong since #1813; tracked separately in #1833. The test's new #1822 count/proportion assertion is scoped to this change. No physical-device performance claim.

The conductor owns final main/image publication and the existing public transfer #240.

The initial global tree-instance attempt added two rendered calls at these remote views, so it was replaced with two small batched silhouettes. The saved final images and JSON contain the corrected batch-only implementation. Earlier capture attempts with a name overlay or an incorrectly ordered camera were discarded; only final centered captures are included. The full campus harness ran before this tree-only remainder (64 extra triangles, no changed windows or batches); its 51 passing checks are retained instead of rerunning the full scene. The only failure was the independently tracked old batch expectation (#1833).

This is baked warm glass and wall colour, not a new emissive lighting system or an actual spotlight. The noon images show the warm lower panes and small soft pools beside their heads. The optional dusk view uses the existing day cycle at 20.8h.

Final measured comparison (same cameras, final source):

| | Before | After |
| --- | ---: | ---: |
| Road rendered calls | 23 | 23 |
| Footway rendered calls | 21 | 21 |
| Direct east-campus mesh batches | 11 | 11 |
| Direct mesh triangles | 85,753 | 86,729 |
| Recursive campus triangles incl. clock | 85,897 | 86,873 |
| Root scene lights | 9 | 9 |

The +976 triangles include +64 for the two small trees. The campus remains below its existing 87,800 ceiling. Geometry-only validation after the final tree change remains green; the final colour correction changes no vertices/batches.

Road camera XYZ `[-194,9,-261]`, footway `[-180,8,-277]`, both looking at `[-188,12,-297]`. `before-road.png`/`after-road.png` frame the full short front; `before-footway.png`/`after-footway.png` show its oblique approach; `after-dusk.png` uses the existing June day cycle at 20.8h. Source SHA256 values are saved in source.json.


Levererat i `042cf8f4c52447a70be4e4b5f8fb200aaf83c807`. [Pages](https://github.com/solwation/lunden-3d-apartment/actions/runs/41601719499) och [Worker](https://github.com/solwation/lunden-3d-apartment/actions/runs/41601719469) lyckades; Worker-loggen bekräftar faktisk Wrangler-deploy och den publika sidans version.json visar `042cf8f`. Dirigentens kombinerade diff-/bildgranskning är klar. Bild-URL:erna ovan är åtkomliga och bytekontrollerade. Ingen rutinmässig omkörning av gröna kontroller efter orelaterad integration. Ärendet stängs genom efterföljande verifieringscommit och aktiva etiketter tas bort.
