# Review and final verification of #1446 (#1559)

Source under review: `b361f59ab3253d8d0b4155945c15b31bf124f8eb`.
This follow-up changes no application geometry, levels or grading configuration.

## Source review

The commit applies the existing #1444 TIN grading mechanism to OSM lot 145221629
by configuration. The eight-corner outline and guessed capacity 40 are unchanged;
no parking boxes are added (#1447). All new grading dimensions remain assumptions.
The lot begins at z 345.93, beyond WALK.z1=250; evidence establishes the rendered
surface rather than a reachable walking route. Houses A/B/C/L have no equivalent
use of this southern backdrop builder and are unaffected by this commit.

`keepBase` is explicitly assigned only to Sankt Lars väg 48 (3.746237 m) and 49
(4.168658 m). Nullish fallback retains the prior max-corner calculation for every
other building and accepts a legitimate zero base. Roofs, eaves, window placement
and the recorded roof sampler all derive from the preserved base. Facade bottoms
still follow the new minimum corner ground minus 0.1 m: this preserves contact with
the ground rather than freezing the entire underground facade volume. The small
rounding of the stored bases is covered by the fixture tolerance. A global
footprint exclusion would alter grading and is outside this review's scope.

The introductory comment in `parking1446test.html` mentions
`renderedTerrainY.ungraded`; the implementation actually uses the two explicit
`keepBase` controls. Its assertions check emitted records, so the comment does not
change the meaning of the test. No implementation correction was needed. Historical prose in
`environment.md` still quotes 48252 backdrop triangles from before the later
96-triangle far-ground ramp; the updated fixtures use 48348. This review records
actual source-bound results rather than treating those old totals as current.

## Verification

All eight requested fixtures pass on the exact reviewed source: 206 PASS, 0 FAIL.
See [raw results](results.json) and individual `*test.log` files.

| Fixture | Passing assertions |
| --- | ---: |
| parking1446 |9|
| parking1443 |17|
| parking1444 |9|
| parking1445 |13|
| parking1450 |26|
| parking1451 |28|
| parking1452 |32|
| southbackdrop |72|

#1446 specifically gives 3441 core rays on 6 sub-planes, 5548 terrain rays with no
holes, 2535 asphalt rays with no misses, and outside-ground agreement within
float32 ray precision. All 10 other fitted planes/samples are unchanged. Emitted
bases of 44/47/48/49 differ from baseline by at most 3.7e-7 m. The measured costs are
terrain 90659→91146 (+487), backdrop 49955→48348 (−1607), lot asphalt 2597→743.
The steepest sub-plane is 0.127; steepest triangle overlapping the lot 0.324,
within the accepted unreachable-surface WALK.maxSlope 0.7. No limits were raised.

The initial runner used a 5 min cap: seven fixtures passed, but parking1452 timed
out at 311 s while its synchronous ray work prevented a DOM result read. This is
retained as incomplete (`initial-runner.log`, `parking1452-timeout.log`, CLI 1).
Only that fixture was repeated, unchanged, with the normal 20 min cap and console/
pageerror/request-failure logging: ALL PASS, CLI 0, 187.413 s wall time (the fixture
reported 200.2 s). No already green case was repeated. At 10 min the plan was reviewed
and limited to these explicitly requested cases; no additional profiles/sweeps.

No uncaught pageerror was recorded. The retry log contains two HTTP 404 console
messages and an aborted request for `data/todo.json`; local source does not ship
its deployment-generated `version.json`/`data/todo.json`. These local startup
resource diagnostics did not fail the actual World/assertions. Remote data,
report intake and deployment services were not exercised by this review.

Before imagery uses the complete parent revision; after imagery uses the exact
source revision above. Both are served locally with the same pinned Three.js.
They use separate fresh browser contexts, July 15 at noon, clear weather, frozen
clock and `test=lazy&shot`; each capture restores full rendering/shadows via
`testkit.shot` (1280×800, DPR 1). No shared-layout service is configured. This is
local Chromium/SwiftShader evidence, not physical-device/FPS acceptance.

This follow-up adds review evidence only. It introduces no building/rendering
implementation to transfer to the public downstream. Original #1446
implementation/transfer acceptance is separate from this verification record.

Publication is owned by the conductor. This documentation-only commit does not
trigger Pages (`paths-ignore: docs/**`, `**.md`); application publication belongs
to the existing b361f59a deployment. This record makes no new deployment claim.

## Inspected daylight evidence

All four final images were opened and inspected. The first capture was rejected
because a fresh-profile dialog still appeared with `test&shot`; only those bad
images were retaken. The final capture clicks the real **Hoppa över** button and
asserts the dialog is hidden. No production DOM/rendering is altered.

- [Overhead before](overhead-before.png) / [after](overhead-after.png): the full
  eight-corner lot and houses 48/49, with 44 north and 47 to the east. The outline
  and building roof positions remain aligned while the civil grading changes.
- [Ground before](ground-before.png) / [after](ground-after.png): eastward across
  the lot from its west edge; the unchanged houses and changed surface/facade
  contact are visible in daylight.

Overhead camera `(27,111.62,389)`, yaw 0/pitch−90°; ground camera
`(−3,5.82,402)`, yaw −90°/pitch−2.5783°. Camera positions/rotations match exactly
between revisions. The four JSON sidecars record source, URL, actual camera,
month/hour, hidden profile dialog and browser diagnostics; no pageerror occurred.
The capture recipe is [capture.cjs](capture.cjs).

Approximate phase times: plan/setup/source review 8 min; requested fixture review
and verification 27 min (including the budget correction); captures/inspection 5 min;
no application implementation. One worker performed this review, coordinating
expensive browser rendering with the other worker. The only image reruns were a
connection attempt after the idle before-server exited 143 and the rejected dialog
captures. No passed functional case was repeated.
