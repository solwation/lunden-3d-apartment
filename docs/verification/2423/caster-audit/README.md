# Caster/receiver source checkpoint — #2423 remains open

Source review at `84e35c47e5b358cea4eedc4e37d77fbd0cd42948`; no product change,
new image, engine run, export, material edit or shadow-contrast acceptance.
The earlier [five-image baseline](../README.md) and failed physical certainty
of its June shadow mask remain unchanged. Raising the shadow maxima previously
changed zero decoded pixels; this review does not repeat that experiment.

The actual existing GLBs were generated from clean source `2e8547db2a996fcfc5206aca3777aca5e4be7d20`.
The six relevant geometry/caster/export source files still match that export's
manifest exactly at the reviewed public revision. [Provenance](provenance.json)
pins their SHA256 values, the actual GLBs, importer and material map. This is not
a claim that a fresh export or current native component readback was performed.

| Role | Exact GLB node ID | Source contract |
| --- | --- | --- |
| Brick receiver | `hus-l/mesh_l0_xm1668_z455_y665` | `src/exterior.js` facade at web Z=12.705; merged brick mesh casts and receives shadows. Key `std_ffffff_r100_m0_tex_ds` maps to `MI_LundenFacadeBrick`. |
| Left/right screens | `l1007-uteplats/mesh_l0_x4_z1522_y90`, `mesh_l0_x571_z1522_y90` | `src/world.js:1173–1174` sets castShadow and receiveShadow true. Board/post geometry comes from `screenWallParts`. |
| Palm leaves and stalks | `l1007-uteplats/furn_planter_l0_x43_z1324__3` | `src/patio.js:522–539,600`: folded fan fingers and real .009 m radius tube stalks; cast/receive true. |
| Palm trunk | `l1007-uteplats/furn_planter_l0_x43_z1324__4` | Separate bark material/geometry; the same source traversal sets cast/receive true. |
| Concrete winter branch candidate | `vegetation/mesh_tree-trunks-0-0_l0_x776_z2034_y239` | `src/surroundings.js:1664,1673` sets castShadow true on the actual trunk batch. Existing GLB has 498 vertex records/166 triangles and bark key `std_8a735f_r100_m0_tex_bark`. |

The last tree's full geometry projects along the published December24@14 Sun
onto the facade plane with bounds X=[1.7215,4.5452], Y=[-1.1847,3.5455] metres.
It is therefore a concrete candidate for the thin shadows above the lower
window. A projected bounding box does not identify the pixel's true occluder:
triangles, other occluders and visibility still matter. No distinct wall-climber
builder was found, so the issue's informal plant description must not substitute
for an actual caster isolation. Nearby crown IDs and all exact geometry/material
rows are preserved in [glb-identities.json](glb-identities.json).

No relevant GLB node says `castShadow:false`. The importer defaults absent
metadata to true, disables `cast_shadow` only for explicit false, and its normal
`check_shadows` compares loaded component flags to those node contracts.
It documents that native opaque surfaces have no matching per-component
receiveShadow switch. This source review proves no caster-flag mismatch;
it does not read current `cast_dynamic_shadow`, hidden state, LOD or allocation.

The smallest next native observation is one already-loaded-world readback of
these exact mesh/component identities: effective material chains, cast flags,
visibility, transforms/bounds and supported LOD/cull fields, preserving unknown
reflection fields honestly. If those agree, one optional winter frame with only
the named tree-trunk component's `cast_shadow` temporarily false, followed by
restoration, can identify its image contribution. Keep the existing camera,
Sun, exposure, materials, profile and original acceptance. No build, full suite,
new baseline or blind4096 experiment is justified by this checkpoint. The Hus
A/B courtyard note remains unresolved; the same cause has not been established.

Reproduce the CPU-only GLB identity/projection report with the pinned exports:

```sh
python3 docs/verification/2423/caster-audit/map-glb.py \
  --exports /path/to/existing/exports \
  --out /tmp/2423-glb-identities.json
```

The default Sun reference is the unchanged published `../native-capture.json`.
`--baseline` can explicitly name the same pinned file. Output must be new; the
script reads exports and writes only that chosen JSON. Projection envelopes
are geometric candidate bounds, not replacement acceptance crops. This is an
original-only Unreal audit; no downstream implementation applies.
