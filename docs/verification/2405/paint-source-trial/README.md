# Private source-lighting paint trial (#2405, #2424)

The candidate remains **unaccepted** and global SourceAmbient remains **OFF**.
The original Native9b assets were retained. SourceFill35eacc is a private source
checkpoint, not a promoted canonical Lighting build.

[Original source view, published at c6cd494f](https://github.com/solwation/lunden-3d-apartment/blob/c6cd494f/docs/verification/2405/source-lighting-trial/web-parked-street.jpg).
The three raw Native images use the original parked-street camera, June21@14,
clear weather, lamps off,640×360 CPU Vulkan/Linux low. No Windows result is claimed.

| Image | Meaning |
| --- | --- |
| [Original before](unreal-parked-street-original-before.png) | Unchanged Native baseline |
| [Candidate](unreal-parked-street-source-ambient-environment-fill.png) | Native AO0 on45 paint components, shared source Ambient/Hemi/window term, actual own-cube IBL and scoped SourceFill |
| [Original after](unreal-parked-street-original-after.png) | Original bindings/channels restored; RGB-identical to before |

The predeclared diagnostic black-body patch changes from5.628928× source linear
luminance to1.992261×. Mean RGB changes43.30/43.26/42.535→12.135/11.10/10.41,
while source is6.162/12.833/13.163. Darker is not source-colour parity. Root's
whole-image review also finds the white body warmer/dimmer. Glass material
bindings were not changed by this paint trial; the nearest white-car glass patch
is pixel-identical. All diagnostic patch results are preserved without thresholds
in `diagnostic-result.json`; no scene colour acceptance was granted. These are
fixed image regions, not material masks, and may include adjacent surfaces.

The separate math checks succeeded:

- The exact shared MF and private MPC produced12 GPU channels: three scalar values
  and indirect RGB for three constant normals, within one RGBA16F storage ULP.
- Four env-only cases compare the actual Three r170 factory against Native own-cube
  IBL at constant normals/views. All12 channels differ by0–1 half-ULP, within the
  predeclared two-ULP bound. No direct light, exposure or whole scene is in that test.

These checks establish bounded shader math and upload evidence. They do not prove
scene normals, every lighting contribution, final colour or complete material parity.

Paint V3 actually exited Native/runner/tool0/0/0 in253.96/254.024 seconds. All250
authored packages stayed exact/read-only;5,228 Generated files,12 Import files,
664 dependencies and both source heads stayed exact. Actual pre/post-render checks
confirmed45 component channels, SourceFill intensity/RGB/direction and unchanged
non-target/existing-light channels. All bindings, channels, runtime and actor roster
restored. Both original PNGs differ in file metadata but have0 changed RGB pixels.
No asset was saved by the paint trial.

V1 and V2 remain failed runs: Native/runner/tool255/1/1, with zero images. V1 passed
the MF subtest before a cached component-wrapper failure; V2 stopped on an extra
SCS-template check before the GPU subtest. The versioned lifecycle correction in
V3 preserved the source shader, material values and acceptance criteria.
`execution-status.json` keeps these failures separate from V3 success.

The env-only run exited Native/runner0/0 in125.43/125.488 seconds. Its original
tool status is unavailable and remains **UNKNOWN**. It used an initial Untitled
world and saved nothing. `provenance.json` records actual run/config/source hashes.
Compact publication projections are marked with their unmodified private-report
SHA; full private reports and large baselines remain preserved. No Engine source
or workstation paths are included here. No player changelog or downstream transfer
applies to these original-only Unreal diagnostic results.
