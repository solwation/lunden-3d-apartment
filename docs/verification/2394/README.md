# #2394: source-driven window daylight

The actual production Sky/Weather post process replaces the native ambient cube's diffuse contribution with
web window daylight. Window visibility and linear runtime colours come from the web sources; there is no
camera-specific RGB fitting, exposure adjustment, or private material instance in these result captures.

## Result and provenance

- Source `2788460c9347cc9c3daed39fb9ed3d2e4f8994f6`; committed production packages `367c3969` have the exact
  captured asset bytes. All seven changed/new packages are LFS pointers and their objects were uploaded.
- Actual RHI run `20261127T125215231369-2454799`: native exit 0, completed/passed true, 450.07 seconds.
  The outer launcher ended 143 (#2473); this is recorded separately, not reported as wrapper success.
- Four fresh original 640×360 result PNGs; PNG CRC through IEND and original trailing bytes are preserved.
  `artifact-files.json` binds the raw files. `capture-summary.json` binds source, camera, material, real MPC and loaded levels.
- All nine **predeclared** floor/sofa/wall fields pass ±10% separately for every decoded RGB channel in both day views.
  See `crop-contract.json` and `pixel-comparison.json`; fixed crop contract SHA256
  `353ca7c5425fa3d40c64e57c1ba638eacab08a269a3c01c8f4c9edf9f49273db` predates native inspection.
- No extra grey halo is visible around the ball. Four fixed near/far wall-pair channel ratios are 0.992–1.007.
  Root and an independent reviewer viewed all four fresh result originals; the reviewer also opened all four web originals.
- Actual day14-clear, evening22-clear, night00-clear and day14-rain MPC values agree with independently captured
  web runtime values (absolute tolerance 3e-5). Night and exterior receivers retain their original paths.

Historical before images are the real production-material-weight-0 originals from source `c6dfc621`, run
`20261127T123122564769-1934738`. They are explicitly reused historical evidence, not new captures.
The extra `before/halo-original.png` is the production-weight-1 image before the AO correction, from the controlled
three-mode halo probe. AO-off removed the halo; disabling only the sphere's cast shadow was pixel-identical.
The correction subtracts the existing AO-damped cube before adding the web window light without duplicate screen AO;
material AO, other native lighting/specular AO, and global AO settings remain enabled.
Before images are removed in the resolving commit; the issue comment pins them to the image commit.

## Scoped verification

The three meaningful window-export tests passed: actual snapshot data, door-pose visibility and invalid data.
The initial full ten-zone production sync passed all canonical stages and 39 preservation guards at source `c6dfc621`
(run `20261127T115506792855-1010968`). Its 1350.1-second outcome is retained separately.
After the single AO formula change, actual Lighting build plus `--check` passed at source `2788460c`
(run `20261127T124911870147-2350932`, native/outer exit 0, 170.87 seconds).
All 247 authored packages stayed byte-identical/read-only throughout the final RHI capture; 239 original packages
outside the eight locked Lighting outputs also match the original baseline. Full incremental final-gate evidence
is added separately after its actual completion; no stale stamp is called current.

## Limits and remaining differences

Linux llvmpipe/Vulkan, SM5, ordinary 1024-pixel shadows/three cascades, no Lumen/Nanite/ray tracing/reflections,
AA off. Grain, aliasing and the diagnostic shadow profile are intentional deviations; this does not prove the full
Windows rendering profile. The actual SceneCapture SeparateTranslucency flag is enabled (#2476).
Static exported door/blind/curtain poses only; live changes remain #2332. Seasonal visibility uses native predicates,
without invoking physics/collision APIs (#2475); no gameplay, PIE, collision or packaging pass is claimed.

Every remaining visible difference is covered by an open issue: furnishing/textiles, floor and ceiling light #2322;
left wall field #2372; pendant shade #2460; glass #2459; exterior brick #2428; clouds #2371; yellow sofa-back patch #2447.
The evening ceiling mismatch is explicitly retained in #2322. The START outside-reference crops remain unchanged;
changes seen through windows belong to the interior window-light region.

Original Unreal-only implementation; no public downstream transfer. The web colour getter exposes the existing values
without changing web rendering. Result images follow the repository's 30-day retention policy; text metadata remains.
