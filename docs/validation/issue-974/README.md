# Three logical head boxes (#974)

The user replaced detailed facial/polygon refinement with three reasonable stacked
head boxes. The new rifle client and compatible Worker share `rifleBoxHeadContact`.
Body contact remains actual skinned geometry below the logical neck, so the old
full-height capsule cannot hide every head contact. Cached v1 clients stay supported.

- Pure geometry: 15/15 PASS (three levels, direction, crouch, scale, range, miss and invalid data).
- Ordinary two-peer browser integration: 28/28 PASS; actual Ghosts/Combat and local
  Worker, real rounded shots and authoritative receipts. Three head levels take 2,
  body takes 1, wall and miss score zero. Turn, moving target (~.494 m/s) and crouch
  work. Seven accepted hits award 35 points; one lethal hit records one kill/death;
  receipt replay adds no marker, points or kill.
- Focused actual Worker gameplay suite: 8/8 PASS, including recovery before damage,
  death reset, live health and existing distance/rate contracts.
- Broad suite: 47/48 PASS. The unchanged v1 lateral-greeting assertion at
  `players.test.mjs:657` returned head2 where its older fixture expected body1;
  this is the existing legacy-fixture conflict tracked in #945. No assertion or
  baseline was relaxed. It is outside the new v2 geometry. Unknown-version fixtures
  now use 9 because 2 is a valid new contract.

[Avatar debug image](avatar-head-boxes.png) shows actual Avatar geometry and the
three wireframe volumes, with the top visibly narrower. It is a small rendered
scene; the functional two-peer test suppresses apartment bootstrap. These results
do not claim full-apartment performance or physical-phone stability. Head geometry
is intentionally approximate; cosmetics do not introduce separate damage rules.
Other weapon trajectories retain body-only damage pending the existing low-priority
weapon stories. Server latest state can differ from client interpolation; no lag
compensation or exact polygon guarantee is implied.

Raw [browser result](browser-result.json), [focused Node log](gameplay-node.log),
[broad Node log](broad-node.log) and [source hashes](source-sha256.json) are retained.
The browser fixture's initial mutable-state callback was corrected to return fresh
snapshots like production; acceptance checks were unchanged.
