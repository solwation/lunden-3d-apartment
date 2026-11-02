# River continuation — #1814

Code: `9a046ca6cbf4dd62403f07f277f0d3feb6c5a7a7`. Baseline: `1fa9677f` (original source modules served at that revision for comparable views). Screenshot camera, noon, June, clear weather and viewport are held constant.

- `before-west-air.png` / `after-west-air.png`: the old western cap and the continued OSM channel reaching into fog.
- `before-west-ground.png` / `after-west-ground.png`: the same bank-level view beside the paddock.
- `before-east-air.png` / `after-east-air.png`: continued water past the illustrative Malmövägen crossing.
- `before-east-ground.png` / `after-east-ground.png`: the old terrain cap and its carved channel; the corrected seam is filled, with a small water overlap. The existing local/far material colour change remains visible.

All eight images were opened and inspected. The eastern pair was refreshed after the final seam correction; western views retain the already checked continuation appearance.

Checks: riverfall 6/6 (all old station levels and concrete/steel/asphalt buffers retained), edgebackdrop ALL PASS, archived OSM/station/fog-distance 1/1, native Chromium actual-emitted geometry 50/50. `result.json` stores the focused ray results. The initial wide mitred cut failed at a tight western bend and was corrected to convex triangle cuts. The submerged-bank check was strengthened to require an actual bank hit before validating water coverage. A stopped-server attempt was a failed environment run and is not counted as green.

Sourced: archived OSM river way 137217705 in plan. Assumptions: cross-section sizes, relative fall beyond measured stations, flat far water at each local edge level, the final western tangent. No house A/B/C/L changes, new rendering batches, lights or textures; no physical-device or hardware performance certification. The transient QR is the app's ordinary local screenshot UI.

Approximate observed phases: reading/planning/baseline 4 min, implementation 7 min, scoped verification and two concrete corrections 12 min including browser-lock waits. Verification stopped after passing the seam/bank check and inspecting the corrected eastern view.

Conductor integration: combined source `eb388f0510d8127cc944790017ee4d9089f0e6b5` also contains #1812 road continuations and #1817 WALK.x0 -285. Because the continued western channel changes the nearby ground, one targeted `paddockwalktest.cjs` run was justified: all 9 checks passed (20,134 Player updates, no flight/rescue/page errors; fence still stops at x -274.11). Raw evidence: `combined-paddock-result.json`. The changed shared edge module and WALK inputs were also checked with roadendstest (24 PASS, 336 join samples without gaps) and rivercontinuationtest (1/1 archived-source/station/fog contract). Unchanged riverfall/bridge checks were reused from the worker. Chromium 1248/SwiftShader, owned integration server on 8936; browser run peak 1468 MiB of 4G. No physical hardware claim.
