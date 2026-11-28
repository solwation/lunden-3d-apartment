# Actual private Blueprint/MPC propagation (#2424)

The scratch Blueprint compiled and propagated all five scalar and five RGB outputs
through `SetSourceAmbientContext` and `UpdateSky`. Clear day, mixed weather/context,
and immediate Flash reset all passed against the exported source contract at1e-5.
SourceAmbientEnabled remained0. The scratch actor was destroyed and all disk guards
passed. `cpu-result.json` contains every actual/expected value.

This entry ran before the car capture in one render-RHI editor process. Actual
Native/runner/tool results were0/0/0,237.61/237.667 seconds, no log errors.
This is CPU Blueprint/MPC evidence; no NullRHI, GPU colour or whole-scene acceptance
is claimed for this entry.

The candidate source is unpublished `79de8a8b1798f94ccb7170a00edb9653439d7424`;
`candidate-source.patch` preserves its reviewable changes. Production source remains
unchanged: even OFF, changing the canonical lighting-builder file changes its saved
signature. `canonical-off-signature-risk.json` records that actual hash difference.
The candidate will need a coordinated Lighting build before production integration.

External postflight verifies Native9b and source79de, all250 authored assets0444,
5,227 Generated files,12 Import files and both189/558 dependency sets unchanged.
All scratch assets were unsaved. No visual result exists for the unbound scratch
collection, so screenshots do not apply to this technical check. See the separate
[car images](../../2405/ao-isolation/README.md) from the same process.

Full #2424 stays open and global activation stays OFF. Actual context producers,
physical SourceFill, material/window/curtain integration and scene acceptance remain.
This original-only Unreal diagnostic has no downstream or player-changelog change.
