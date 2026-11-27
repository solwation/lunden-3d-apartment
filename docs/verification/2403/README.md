# Parasol source/export portion (#2403)

The web's existing fold geometry and rule are now described in the shared export.
This is a partial source handoff: **the native parasol still needs its importer tag,
Blueprint controller, PIE and matching dusk/overcast images. #2403 remains open.**
Root owns integration/publication and the remaining native work. No Unreal editor,
Lighting packages, LFS locks or Generated files were used by this portion.

The actual canopy is `furn_parasol_l0_x450_z1555__5`, directly under
`furn_parasol_l0_x450_z1555`. The row in `measurements.furnishing.parasols` keeps
the real full-open radius 1.5 m, local apex height 2.45 m and tilt 12°; endpoint poses,
configured months and source rule travel with it. The mesh's original positions,
UV0 and stable IDs are preserved. Cloth metre UV1 remains unchanged on the web
while folding; material-choice/UV1 porting is outside this contract.

## Checks

`node tools/unreal-engine/tests/parasol-export.mjs EXPORT_DIR` returned 0:

- 108 actual web cases cover every month, sun y just below/equal/above 0.02 and
  overcast just below/equal/above 0.6. First arrival takes the exact automatic state.
- The actual canopy follows the contract at fractions 0.25/0.5/0.75/1 during
  manual animation, holds a manual choice until the automatic state changes,
  and retains its cloth UV1. The automatic 0.5/s animation is also checked.
- The schema rejects a missing canopy binding; an unrelated partial export
  omits the contract. The real GLB has the recorded parent/part links, position,
  quaternion, scale and original cone positions/UV0.

The canonical `export-world.mjs --zones l1007-uteplats` produced one 8325960-byte
GLB with 167 nodes and 86222 triangles. Its SHA256 is
`163ce0bc28191a075ec67161e77f2ccac3699d5f01666e7624899762d0fc3941`,
byte-identical to the patio GLB from the preceding full production export.
`check-export.mjs --dir EXPORT_DIR` returned 0: 2 files, 167 unique node IDs,
317 source hashes. Syntax/schema and `git diff --check` also passed.

The source working-tree base is `34ecd5d4c1b4b818d0e58b5bf5c9a946dec91238`.
The export honestly records `sourceDirty:true`; its exact sourceHash is
`f6b2b6a63b3aaa27c2a59300b866d3f7842109f800e8f58ab3accfd1071f8ac2`.
[Contract and file/source hashes](parasol-contract.json) preserve the observed
output. This is not relabeled as an export of the later source commit. A future
native integration must export/sync its own complete integrated source revision.

The browser was explicitly Chromium 1208, with the installed local three 0.170.0.
The outer `browsertest.sh` shell returned 143 while its Node/browser continued;
the actual canonical export then wrote all files and its normal report. The
existing wrapper problem remains #2473 and this invocation is not claimed as a
clean exit 0 shell run. Independent source/GLB and freshness commands returned 0.
Owned export processes exited; no second browser was started.

No result image is appropriate for an added data contract with unchanged web
behavior and a byte-identical GLB. Native visual acceptance is explicitly pending.
Original Unreal/export only: no public downstream transfer or player changelog.

## Native continuation

After coordinating the shared Lighting builder/assets, Root can use each row's
stable canopy ID and original local pose to implement the import tag and live
controller. Read the exported month/sun/cloud/manual/fade contract rather than
adding calibration constants. The imported mesh may bake its GLB transform, so
verify the actual imported component transform before applying source local
scales/rotation. Test first arrival, transitions, month wrap and both sides of
the exact thresholds in PIE, then save matching dusk and overcast image pairs.
Only that completed native acceptance can close #2403.
