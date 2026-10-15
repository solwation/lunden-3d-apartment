# Shower fitting detail (#1042)

The two existing shower types now have profiled heads with silicone spray nozzles,
tapered hand-shower handles, rounded rail clamps and wall rosettes, hose couplings
and marked thermostat grips. Proportions of the added details are visual guesses;
this is not a surveyed Tapwell product model.

The same cached local templates serve L1007 and L1004. Static geometry is
still baked into each room's existing material batches. Caching saves repeated
construction, not rendered triangles. L1201 uses its separate generic `wetRoom` builder, which is unchanged.
A/B/C do not have corresponding furnished
shower interiors in this scene; their architecture is unchanged.

## Browser images

All are actual 900 × 700 Chromium/SwiftShader apartment captures, with the same
camera/time/day/weather and normal detail culling. The fixture uses `test=lazy`
to stop automatic renders, then quality 3 + shadows for every screenshot (without
antialiasing). The bathroom overview looks partly through existing frosted glass;
its close views are unobstructed. These are visual evidence, not a Surface or FPS
benchmark.

| View | Before | After |
| --- | --- | --- |
| Bathroom set, including parked hand shower | [before](before-badrum-set.png) | [after](after-badrum-set.png) |
| Bathroom overhead spray face | [before](before-badrum-head.png) | [after](after-badrum-head.png) |
| Bathroom thermostat | [before](before-badrum-mixer.png) | [after](after-badrum-mixer.png) |
| WC set | [before](before-wc-set.png) | [after](after-wc-set.png) |
| WC hand-shower spray face | [before](before-wc-head.png) | [after](after-wc-head.png) |

The baseline is `src/interior.js` from `ff75a5d`, served through a Playwright route
in a separate browser context; all other files are identical to the candidate.
Original source hashes, full producer, 14 original PNGs, raw receipts and original
failed attempts are retained in `/tmp/lunden-resumed1042/` on the verification host.
The resumed uncommitted checkpoint is preserved there as `resumed.patch`.

## Water contract and render budget

The [browser receipts](browser-result.json) record original/candidate shower
specifications and actual production `Batch` geometry. Names, radius, basin,
shower flag, spray directions and thermostat picks retain their original values.
The local-to-world template transform changes the WC outlet's Y only by
8.881784197001252e-16 m, below the 1e-12 coordinate comparison tolerance.
The original strict Float64-equality fixture failed on that final bit; its
full output is preserved, and the corrected receipt check does not alter product
code or relax any direction/radius/interaction assertion.

| Template | Before triangles | After triangles | Before / after materials |
| --- | ---: | ---: | ---: |
| Overhead + parked hand shower | 1,144 | 6,900 | 2 / 3 |
| Hand shower | 852 | 4,204 | 2 / 3 |

There is one overhead-set instance and three hand-set instances across the two
flats using this builder: 3,700 → 19,512 triangles total (+15,812). The third material is
one shared safety marker, adding at most one merged mesh per fitted floor (four
in total). No new light, dynamic update, texture or render pass is added.
`water.js`, action picking and audio implementation are unchanged.

## Functional verification

The unchanged [`tools/watertest.html`](../../../tools/watertest.html) reports
[ALL PASS, 57 ordered PASS rows](watertest.txt), including real action picks for
both showers, preserved thermostat controls, running spray/standing detection,
basin hand-washing/drying, sound/flow stopping and a genuine app reload.
`node --check` passes for both changed runtime modules; `git diff --check` passes.

The follow-up combined driver passed that complete test, then failed an extra
assertion expecting six safety markers. Actual World returned four meshes / 48
marker triangles: L1007's two sets plus L1004's two. Source inspection confirms
L1201 takes the separate generic wet-room builder. The inventory and budget
above are corrected from that measured result. An offline receipt audit passes
without rerunning World or changing product/test behavior. Neither original
combined driver's failing exit is represented as a clean combined run.

Publication rebase retains the independent #1045 `REPORTS` export from incoming
main alongside `SHOWER_FITTINGS`. Shower implementation and water-test bytes
remain identical to the browser run; both final runtime modules pass syntax
checks. Original capture hashes and final publication hashes are stored separately.
